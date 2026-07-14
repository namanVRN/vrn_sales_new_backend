import Lead from '../models/Lead.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';
import { updateLeadStatus, transitionStage } from '../services/leadService.js';
import { LEAD_STAGES, LEAD_STATUSES } from '../config/constants.js';
import { buildAdvancedQuery } from './qualificationController.js';
import logger from '../utils/logger.js';

// ═══════════════════════════════════════════
// GET /api/post-visit
// ═══════════════════════════════════════════
export const getPostVisitLeads = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const baseQuery = {
      current_stage: LEAD_STAGES.POST_VISIT_FOLLOWUP,
      is_closed: false,
    };

    const query = buildAdvancedQuery(
      baseQuery,
      req.query,
      req.user.role,
      req.user.userId
    );

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const total = await Lead.countDocuments(query);

    const leads = await Lead.find(query)
      .populate('current_owner', 'name display_code role')
      .populate('site_visit_done_by', 'name display_code')
      .populate('project', 'name code')
      .sort({ next_followup_date: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    return successResponse(res, {
      count: leads.length,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      leads,
    }, 'Post visit leads fetched');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/post-visit/stats
// ═══════════════════════════════════════════
export const getPostVisitStats = async (req, res, next) => {
  try {
    const baseQuery = {
      current_stage: LEAD_STAGES.POST_VISIT_FOLLOWUP,
      is_closed: false,
    };

    const query = buildAdvancedQuery(
      baseQuery,
      req.query,
      req.user.role,
      req.user.userId
    );

    const [total, byStatus, coldCount, overdueCount, todayCount] = await Promise.all([
      Lead.countDocuments(query),
      Lead.aggregate([
        { $match: query },
        { $group: { _id: '$current_status', count: { $sum: 1 } } },
      ]),
      Lead.countDocuments({ ...query, is_cold: true }),
      Lead.countDocuments({
        ...query,
        next_followup_date: { $lt: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
      Lead.countDocuments({
        ...query,
        next_followup_date: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lte: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      }),
    ]);

    return successResponse(res, {
      total,
      cold: coldCount,
      overdue: overdueCount,
      today: todayCount,
      by_status: byStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
    }, 'Post visit stats fetched');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// PATCH /api/post-visit/:id
// (NO CHANGES to update logic)
// ═══════════════════════════════════════════
export const updatePostVisit = async (req, res, next) => {
  try {
    const { status, remark, next_followup_date, meeting_scheduled_date, site_visit_feedback, important_note } = req.body;

    if (!status) return errorResponse(res, 'Status is required', 400);
    if (!remark || remark.trim().length === 0) return errorResponse(res, 'Remark is required', 400);

    const validStatuses = Object.values(LEAD_STATUSES.POST_VISIT_FOLLOWUP);
    if (!validStatuses.includes(status)) {
      return errorResponse(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) return errorResponse(res, 'Lead not found', 404);
    if (lead.is_closed) return errorResponse(res, 'Cannot update a closed lead', 400);

    if (lead.current_stage !== LEAD_STAGES.POST_VISIT_FOLLOWUP) {
      return errorResponse(res, `Lead is not in Post Visit stage. Current stage: ${lead.current_stage}`, 400);
    }

    if (req.user.role === 'ADVISOR' && lead.current_owner?.toString() !== req.user.userId.toString()) {
      return errorResponse(res, 'Access denied to this lead', 403);
    }

    if (status === 'MEETING_SCHEDULED') {
      if (!meeting_scheduled_date) return errorResponse(res, 'Meeting date is required to schedule meeting', 400);

      const meetingDate = new Date(meeting_scheduled_date);
      const updates = { meeting_scheduled_date: meetingDate, next_followup_date: meetingDate };
      if (important_note !== undefined) updates.important_note = important_note;
      if (site_visit_feedback !== undefined) updates.site_visit_feedback = site_visit_feedback;

      const result = await transitionStage({
        leadId: lead._id,
        newStage: LEAD_STAGES.DEAL,
        newStatus: LEAD_STATUSES.DEAL.NEGOTIATION,
        updates,
        remark: `Meeting scheduled. ${remark}`,
        performedBy: req.user,
      });

      const populated = await Lead.findById(result._id)
        .populate('current_owner', 'name display_code role')
        .populate('project', 'name');

      return successResponse(res, populated, 'Meeting scheduled. Lead moved to Deal stage.');
    }

    const updates = {};
    if (next_followup_date) updates.next_followup_date = new Date(next_followup_date);
    if (important_note !== undefined) updates.important_note = important_note;
    if (site_visit_feedback !== undefined) updates.site_visit_feedback = site_visit_feedback;

    const { lead: updatedLead } = await updateLeadStatus({
      leadId: lead._id,
      newStatus: status,
      newStage: LEAD_STAGES.POST_VISIT_FOLLOWUP,
      updates,
      remark,
      performedBy: req.user,
    });

    const populated = await Lead.findById(updatedLead._id)
      .populate('current_owner', 'name display_code')
      .populate('project', 'name');

    return successResponse(res, populated, 'Status updated successfully');
  } catch (error) {
    logger.error('Post visit update error:', error.message);
    next(error);
  }
};
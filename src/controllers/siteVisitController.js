import Lead from '../models/Lead.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';
import { updateLeadStatus, transitionStage } from '../services/leadService.js';
import { LEAD_STAGES, LEAD_STATUSES } from '../config/constants.js';
import { buildAdvancedQuery } from './qualificationController.js';
import logger from '../utils/logger.js';

// ═══════════════════════════════════════════
// GET /api/site-visit-scheduling
// ═══════════════════════════════════════════
export const getSiteVisitSchedulingLeads = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const baseQuery = {
      current_stage: LEAD_STAGES.SITE_VISIT_SCHEDULING,
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
    }, 'Site visit scheduling leads fetched');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/site-visit-scheduling/stats
// ═══════════════════════════════════════════
export const getSiteVisitSchedulingStats = async (req, res, next) => {
  try {
    const baseQuery = {
      current_stage: LEAD_STAGES.SITE_VISIT_SCHEDULING,
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
    }, 'Site visit scheduling stats fetched');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// PATCH /api/site-visit-scheduling/:id
// (NO CHANGES to update logic)
// ═══════════════════════════════════════════
export const updateSiteVisitScheduling = async (req, res, next) => {
  try {
    const { status, remark, next_followup_date, planned_site_visit_date, important_note } = req.body;

    if (!status) return errorResponse(res, 'Status is required', 400);
    if (!remark || remark.trim().length === 0) return errorResponse(res, 'Remark is required', 400);

    const validStatuses = Object.values(LEAD_STATUSES.SITE_VISIT_SCHEDULING);
    if (!validStatuses.includes(status)) {
      return errorResponse(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) return errorResponse(res, 'Lead not found', 404);
    if (lead.is_closed) return errorResponse(res, 'Cannot update a closed lead', 400);

    if (lead.current_stage !== LEAD_STAGES.SITE_VISIT_SCHEDULING) {
      return errorResponse(res, `Lead is not in Site Visit Scheduling stage. Current stage: ${lead.current_stage}`, 400);
    }

    if (req.user.role === 'BDM' && lead.current_owner?.toString() !== req.user.userId.toString()) {
      return errorResponse(res, 'Access denied to this lead', 403);
    }

    if (status === 'VISIT_SCHEDULED') {
      if (!planned_site_visit_date) return errorResponse(res, 'Site visit date is required to schedule visit', 400);

      const visitDate = new Date(planned_site_visit_date);
      const updates = { planned_site_visit_date: visitDate, next_followup_date: visitDate };
      if (important_note !== undefined) updates.important_note = important_note;

      const result = await transitionStage({
        leadId: lead._id,
        newStage: LEAD_STAGES.SITE_VISIT_EXECUTION,
        newStatus: LEAD_STATUSES.SITE_VISIT_EXECUTION.VISIT_SCHEDULED,
        updates,
        remark: `Site visit scheduled. ${remark}`,
        performedBy: req.user,
      });

      const populated = await Lead.findById(result._id)
        .populate('current_owner', 'name display_code')
        .populate('project', 'name');

      return successResponse(res, populated, 'Site visit scheduled successfully');
    }

    const updates = {};
    if (next_followup_date) updates.next_followup_date = new Date(next_followup_date);
    if (important_note !== undefined) updates.important_note = important_note;

    const { lead: updatedLead } = await updateLeadStatus({
      leadId: lead._id,
      newStatus: status,
      newStage: LEAD_STAGES.SITE_VISIT_SCHEDULING,
      updates,
      remark,
      performedBy: req.user,
    });

    const populated = await Lead.findById(updatedLead._id)
      .populate('current_owner', 'name display_code')
      .populate('project', 'name');

    return successResponse(res, populated, 'Status updated successfully');
  } catch (error) {
    logger.error('Site visit scheduling update error:', error.message);
    next(error);
  }
};
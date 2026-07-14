import Lead from '../models/Lead.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';
import { updateLeadStatus } from '../services/leadService.js';
import { LEAD_STAGES, LEAD_STATUSES } from '../config/constants.js';
import { buildAdvancedQuery } from './qualificationController.js';
import logger from '../utils/logger.js';

// ═══════════════════════════════════════════
// GET /api/deal
// ═══════════════════════════════════════════
export const getDealLeads = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const baseQuery = {
      current_stage: LEAD_STAGES.DEAL,
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
      .sort({ meeting_scheduled_date: 1, next_followup_date: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    return successResponse(res, {
      count: leads.length,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      leads,
    }, 'Deal leads fetched');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/deal/stats
// ═══════════════════════════════════════════
export const getDealStats = async (req, res, next) => {
  try {
    const baseQuery = { current_stage: LEAD_STAGES.DEAL };

    const query = buildAdvancedQuery(
      baseQuery,
      req.query,
      req.user.role,
      req.user.userId
    );

    const [total, active, byStatus, wonCount, lostCount] = await Promise.all([
      Lead.countDocuments(query),
      Lead.countDocuments({ ...query, is_closed: false }),
      Lead.aggregate([
        { $match: query },
        { $group: { _id: '$current_status', count: { $sum: 1 } } },
      ]),
      Lead.countDocuments({ ...query, is_deal_won: true }),
      Lead.countDocuments({
        ...query,
        is_closed: true,
        current_status: { $in: ['DEAL_LOST', 'NEGOTIATION_FAILED', 'NOT_INTERESTED'] },
      }),
    ]);

    return successResponse(res, {
      total,
      active,
      won: wonCount,
      lost: lostCount,
      by_status: byStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
    }, 'Deal stats fetched');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// PATCH /api/deal/:id
// (NO CHANGES to update logic)
// ═══════════════════════════════════════════
export const updateDeal = async (req, res, next) => {
  try {
    const { status, remark, next_followup_date, meeting_scheduled_date, important_note, close_reason } = req.body;

    if (!status) return errorResponse(res, 'Status is required', 400);
    if (!remark || remark.trim().length === 0) return errorResponse(res, 'Remark is required', 400);

    const validStatuses = Object.values(LEAD_STATUSES.DEAL);
    if (!validStatuses.includes(status)) {
      return errorResponse(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) return errorResponse(res, 'Lead not found', 404);
    if (lead.is_closed) return errorResponse(res, 'Cannot update a closed lead', 400);

    if (lead.current_stage !== LEAD_STAGES.DEAL) {
      return errorResponse(res, `Lead is not in Deal stage. Current stage: ${lead.current_stage}`, 400);
    }

    if (req.user.role === 'ADVISOR' && lead.current_owner?.toString() !== req.user.userId.toString()) {
      return errorResponse(res, 'Access denied to this lead', 403);
    }

    if (status === 'MEETING_RESCHEDULE') {
      if (!meeting_scheduled_date) return errorResponse(res, 'New meeting date is required for reschedule', 400);

      const newDate = new Date(meeting_scheduled_date);
      const updates = { meeting_scheduled_date: newDate, next_followup_date: newDate };
      if (important_note !== undefined) updates.important_note = important_note;

      const { lead: updatedLead } = await updateLeadStatus({
        leadId: lead._id,
        newStatus: LEAD_STATUSES.DEAL.MEETING_RESCHEDULE,
        newStage: LEAD_STAGES.DEAL,
        updates,
        remark: `Meeting rescheduled. ${remark}`,
        performedBy: req.user,
      });

      const populated = await Lead.findById(updatedLead._id)
        .populate('current_owner', 'name display_code')
        .populate('project', 'name');

      return successResponse(res, populated, 'Meeting rescheduled successfully');
    }

    if (status === 'DEAL_WON') {
      const updates = {
        meeting_done_date: new Date(),
        close_reason: close_reason || 'Deal successfully closed',
      };
      if (important_note !== undefined) updates.important_note = important_note;

      const { lead: updatedLead } = await updateLeadStatus({
        leadId: lead._id,
        newStatus: LEAD_STATUSES.DEAL.DEAL_WON,
        newStage: LEAD_STAGES.DEAL,
        updates,
        remark: `Deal WON. ${remark}`,
        performedBy: req.user,
      });

      const populated = await Lead.findById(updatedLead._id)
        .populate('current_owner', 'name display_code')
        .populate('project', 'name');

      return successResponse(res, populated, 'Deal marked as WON! 🎉');
    }

    if (status === 'DEAL_LOST' || status === 'NEGOTIATION_FAILED') {
      const updates = {
        meeting_done_date: new Date(),
        close_reason: close_reason || (status === 'DEAL_LOST' ? 'Deal lost' : 'Negotiation failed'),
      };
      if (important_note !== undefined) updates.important_note = important_note;

      const { lead: updatedLead } = await updateLeadStatus({
        leadId: lead._id,
        newStatus: status,
        newStage: LEAD_STAGES.DEAL,
        updates,
        remark,
        performedBy: req.user,
      });

      const populated = await Lead.findById(updatedLead._id)
        .populate('current_owner', 'name display_code')
        .populate('project', 'name');

      return successResponse(res, populated, `Lead marked as ${status}`);
    }

    const updates = {};
    if (next_followup_date) updates.next_followup_date = new Date(next_followup_date);
    if (important_note !== undefined) updates.important_note = important_note;
    if (close_reason !== undefined) updates.close_reason = close_reason;

    const { lead: updatedLead } = await updateLeadStatus({
      leadId: lead._id,
      newStatus: status,
      newStage: LEAD_STAGES.DEAL,
      updates,
      remark,
      performedBy: req.user,
    });

    const populated = await Lead.findById(updatedLead._id)
      .populate('current_owner', 'name display_code')
      .populate('project', 'name');

    return successResponse(res, populated, 'Deal status updated');
  } catch (error) {
    logger.error('Deal update error:', error.message);
    next(error);
  }
};
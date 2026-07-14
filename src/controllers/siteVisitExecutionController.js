import Lead from '../models/Lead.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';
import { updateLeadStatus, transitionStage } from '../services/leadService.js';
import { LEAD_STAGES, LEAD_STATUSES } from '../config/constants.js';
import { buildAdvancedQuery } from './qualificationController.js';
import logger from '../utils/logger.js';

// ═══════════════════════════════════════════
// GET /api/site-visit-execution/scheduled
// Tab A: Scheduled visits
// ═══════════════════════════════════════════
export const getScheduledVisits = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const baseQuery = {
      current_stage: LEAD_STAGES.SITE_VISIT_EXECUTION,
      current_status: LEAD_STATUSES.SITE_VISIT_EXECUTION.VISIT_SCHEDULED,
      is_closed: false,
    };

    // Special rule: FSR sees ALL scheduled visits (claim model)
    // So we pass role as ADMIN for FSR to bypass owner filter in buildAdvancedQuery
    const effectiveRole = req.user.role === 'ADVISOR' ? 'ADMIN_FSR' : req.user.role;

    let query;
    if (req.user.role === 'ADVISOR') {
      // FSR sees all — only apply non-owner filters
      query = buildAdvancedQuery(baseQuery, req.query, 'ADMIN', req.user.userId);
    } else {
      query = buildAdvancedQuery(baseQuery, req.query, req.user.role, req.user.userId);
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const total = await Lead.countDocuments(query);

    const leads = await Lead.find(query)
      .populate('current_owner', 'name display_code role')
      .populate('project', 'name code')
      .sort({ planned_site_visit_date: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    return successResponse(res, {
      count: leads.length,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      leads,
    }, 'Scheduled site visits fetched');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/site-visit-execution/cnp
// Tab B: Call Not Picked (BDM + Admin)
// ═══════════════════════════════════════════
export const getCNPLeads = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const baseQuery = {
      current_stage: LEAD_STAGES.SITE_VISIT_EXECUTION,
      current_status: LEAD_STATUSES.SITE_VISIT_EXECUTION.NO_RESPONSE,
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
    }, 'CNP leads fetched');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/site-visit-execution/stats
// ═══════════════════════════════════════════
export const getSiteVisitExecutionStats = async (req, res, next) => {
  try {
    const baseQuery = {
      current_stage: LEAD_STAGES.SITE_VISIT_EXECUTION,
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
    }, 'Site visit execution stats fetched');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// PATCH /api/site-visit-execution/:id
// (NO CHANGES to update logic)
// ═══════════════════════════════════════════
export const updateSiteVisitExecution = async (req, res, next) => {
  try {
    const { status, remark, planned_site_visit_date, site_visit_feedback, important_note } = req.body;

    if (!status) return errorResponse(res, 'Status is required', 400);
    if (!remark || remark.trim().length === 0) return errorResponse(res, 'Remark is required', 400);

    const validStatuses = Object.values(LEAD_STATUSES.SITE_VISIT_EXECUTION);
    if (!validStatuses.includes(status)) {
      return errorResponse(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) return errorResponse(res, 'Lead not found', 404);
    if (lead.is_closed) return errorResponse(res, 'Cannot update a closed lead', 400);

    if (lead.current_stage !== LEAD_STAGES.SITE_VISIT_EXECUTION) {
      return errorResponse(res, `Lead is not in Site Visit Execution stage. Current stage: ${lead.current_stage}`, 400);
    }

    if (status === 'VISIT_DONE') {
      if (req.user.role !== 'ADVISOR' && req.user.role !== 'ADMIN') {
        return errorResponse(res, 'Only FSR/Advisor can mark visit as done', 403);
      }

      const updates = {
        actual_site_visit_date: new Date(),
        site_visit_done_by: req.user.userId,
        site_visit_feedback: site_visit_feedback || remark,
      };
      if (important_note !== undefined) updates.important_note = important_note;

      const result = await transitionStage({
        leadId: lead._id,
        newStage: LEAD_STAGES.POST_VISIT_FOLLOWUP,
        newStatus: LEAD_STATUSES.POST_VISIT_FOLLOWUP.FEEDBACK_CAPTURED,
        newOwner: req.user.userId,
        updates,
        remark: `Visit completed. ${remark}`,
        performedBy: req.user,
      });

      const populated = await Lead.findById(result._id)
        .populate('current_owner', 'name display_code role')
        .populate('site_visit_done_by', 'name display_code')
        .populate('project', 'name');

      return successResponse(res, populated, 'Site visit marked as done. Lead moved to Post Visit stage.');
    }

    if (status === 'RESCHEDULE') {
      if (!planned_site_visit_date) return errorResponse(res, 'New site visit date is required for reschedule', 400);

      const newDate = new Date(planned_site_visit_date);
      const updates = { planned_site_visit_date: newDate, next_followup_date: newDate };
      if (important_note !== undefined) updates.important_note = important_note;

      const { lead: updatedLead } = await updateLeadStatus({
        leadId: lead._id,
        newStatus: LEAD_STATUSES.SITE_VISIT_EXECUTION.VISIT_SCHEDULED,
        newStage: LEAD_STAGES.SITE_VISIT_EXECUTION,
        updates,
        remark: `Visit rescheduled. ${remark}`,
        performedBy: req.user,
      });

      const populated = await Lead.findById(updatedLead._id)
        .populate('current_owner', 'name display_code')
        .populate('project', 'name');

      return successResponse(res, populated, 'Site visit rescheduled successfully');
    }

    const updates = {};
    if (important_note !== undefined) updates.important_note = important_note;

    const { lead: updatedLead } = await updateLeadStatus({
      leadId: lead._id,
      newStatus: status,
      newStage: LEAD_STAGES.SITE_VISIT_EXECUTION,
      updates,
      remark,
      performedBy: req.user,
    });

    const populated = await Lead.findById(updatedLead._id)
      .populate('current_owner', 'name display_code')
      .populate('project', 'name');

    return successResponse(res, populated, 'Status updated successfully');
  } catch (error) {
    logger.error('Site visit execution update error:', error.message);
    next(error);
  }
};
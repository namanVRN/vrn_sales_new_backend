import Lead from '../models/Lead.js';
import Project from '../models/Project.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';
import { updateLeadStatus, transitionStage } from '../services/leadService.js';
import { LEAD_STAGES, LEAD_STATUSES } from '../config/constants.js';
import logger from '../utils/logger.js';

// ═══════════════════════════════════════════
// HELPER: Build advanced filter query
// Reused across all stage controllers
// ═══════════════════════════════════════════
export const buildAdvancedQuery = (baseQuery, queryParams, userRole, userId) => {
  const {
    status,
    is_cold,
    search,
    owner,        // Admin: filter by specific user ID
    project,      // Filter by project ID
    interested_in, // Filter by property type
    lead_source,  // Filter by source
    date_from,    // next_followup_date >= date_from
    date_to,      // next_followup_date <= date_to
    overdue,      // next_followup_date < today
    today,        // next_followup_date = today
  } = queryParams;

  const query = { ...baseQuery };

  // Status filter
  if (status) query.current_status = status;

  // Cold filter
  if (is_cold !== undefined) query.is_cold = is_cold === 'true';

  // Project filter
  if (project) query.project = project;

  // Interested in filter
  if (interested_in) query.interested_in = { $regex: interested_in, $options: 'i' };

  // Lead source filter
  if (lead_source) query.lead_source = lead_source;

  // Owner filter logic:
  // - BDM/ADVISOR always sees only their own (security — cannot override)
  // - Admin: if owner param given → filter by that owner, else sees all
  if (userRole === 'BDM' || userRole === 'ADVISOR') {
    query.current_owner = userId;
  } else if (userRole === 'ADMIN' && owner) {
    query.current_owner = owner;
  }

  // Date range filter (on next_followup_date)
  if (overdue === 'true') {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    query.next_followup_date = { $lt: now };
  } else if (today === 'true') {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    query.next_followup_date = { $gte: startOfDay, $lte: endOfDay };
  } else if (date_from || date_to) {
    query.next_followup_date = {};
    if (date_from) query.next_followup_date.$gte = new Date(date_from);
    if (date_to) {
      const endDate = new Date(date_to);
      endDate.setHours(23, 59, 59, 999);
      query.next_followup_date.$lte = endDate;
    }
  }

  // Search filter
  if (search) {
    const searchRegex = { $regex: search, $options: 'i' };
    // If current_owner is already set, use $and to combine
    if (query.$or || query.current_owner) {
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { unique_id: searchRegex },
            { customer_name: searchRegex },
            { customer_contact: searchRegex },
          ],
        },
      ];
    } else {
      query.$or = [
        { unique_id: searchRegex },
        { customer_name: searchRegex },
        { customer_contact: searchRegex },
      ];
    }
  }

  return query;
};

// ═══════════════════════════════════════════
// GET /api/qualification
// ═══════════════════════════════════════════
export const getQualificationLeads = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const baseQuery = {
      current_stage: LEAD_STAGES.QUALIFICATION,
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
    }, 'Qualification leads fetched');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/qualification/stats
// ═══════════════════════════════════════════
export const getQualificationStats = async (req, res, next) => {
  try {
    const baseQuery = {
      current_stage: LEAD_STAGES.QUALIFICATION,
      is_closed: false,
    };

    // Stats respect owner filter for Admin too
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
    }, 'Qualification stats fetched');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// PATCH /api/qualification/:id
// (NO CHANGES — keeping exactly as before)
// ═══════════════════════════════════════════
export const updateQualification = async (req, res, next) => {
  try {
    const {
      status,
      remark,
      next_followup_date,
      project_id,
      purpose,
      important_note,
      planned_site_visit_date,
      not_qualified_reason,
    } = req.body;

    if (!status) return errorResponse(res, 'Status is required', 400);
    if (!remark || remark.trim().length === 0) return errorResponse(res, 'Remark is required', 400);

    const validStatuses = Object.values(LEAD_STATUSES.QUALIFICATION);
    if (!validStatuses.includes(status)) {
      return errorResponse(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) return errorResponse(res, 'Lead not found', 404);
    if (lead.is_closed) return errorResponse(res, 'Cannot update a closed lead', 400);

    if (lead.current_stage !== LEAD_STAGES.QUALIFICATION) {
      return errorResponse(res, `Lead is no longer in Qualification stage. Current stage: ${lead.current_stage}`, 400);
    }

    if (req.user.role === 'BDM' && lead.current_owner?.toString() !== req.user.userId.toString()) {
      return errorResponse(res, 'Access denied to this lead', 403);
    }

    if (status === 'QUALIFIED') {
      if (!project_id) return errorResponse(res, 'Project selection is required for qualified lead', 400);
      if (!purpose) return errorResponse(res, 'Purpose is required for qualified lead', 400);

      const project = await Project.findById(project_id);
      if (!project) return errorResponse(res, 'Invalid project', 400);

      const updates = {
        project: project_id,
        purpose,
        important_note: important_note || '',
        qualification_remark: remark,
      };

      if (planned_site_visit_date) {
        updates.planned_site_visit_date = new Date(planned_site_visit_date);
        updates.next_followup_date = new Date(planned_site_visit_date);

        const result = await transitionStage({
          leadId: lead._id,
          newStage: LEAD_STAGES.SITE_VISIT_EXECUTION,
          newStatus: LEAD_STATUSES.SITE_VISIT_EXECUTION.VISIT_SCHEDULED,
          updates,
          remark: `Qualified & Visit Scheduled. ${remark}`,
          performedBy: req.user,
        });

        const populated = await Lead.findById(result._id)
          .populate('current_owner', 'name display_code')
          .populate('project', 'name');

        return successResponse(res, populated, 'Lead qualified and moved to Site Visit Execution stage');
      }

      if (next_followup_date) updates.next_followup_date = new Date(next_followup_date);

      const result = await transitionStage({
        leadId: lead._id,
        newStage: LEAD_STAGES.SITE_VISIT_SCHEDULING,
        newStatus: LEAD_STATUSES.SITE_VISIT_SCHEDULING.FOLLOWUP_REQUIRED,
        updates,
        remark: `Qualified. ${remark}`,
        performedBy: req.user,
      });

      const populated = await Lead.findById(result._id)
        .populate('current_owner', 'name display_code')
        .populate('project', 'name');

      return successResponse(res, populated, 'Lead qualified and moved to Site Visit Scheduling');
    }

    const updates = {};
    if (not_qualified_reason) updates.not_qualified_reason = not_qualified_reason;
    if (next_followup_date) updates.next_followup_date = new Date(next_followup_date);

    const { lead: updatedLead } = await updateLeadStatus({
      leadId: lead._id,
      newStatus: status,
      newStage: LEAD_STAGES.QUALIFICATION,
      updates,
      remark,
      performedBy: req.user,
    });

    const populated = await Lead.findById(updatedLead._id)
      .populate('current_owner', 'name display_code')
      .populate('project', 'name');

    logger.info(`Qualification updated: ${lead.unique_id} → ${status}`);
    return successResponse(res, populated, 'Qualification status updated');
  } catch (error) {
    logger.error('Update qualification error:', error.message);
    next(error);
  }
};
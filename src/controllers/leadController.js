import Lead from '../models/Lead.js';
import LeadActivity from '../models/LeadActivity.js';
import User from '../models/User.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';
import { generateUniqueId, isDuplicateLead } from '../services/uniqueIdService.js';
import { autoAssignToBDM, getBDMWorkload } from '../services/assignmentService.js';
import { getNextWorkingDayAtTime } from '../services/workingDayService.js';
import { logLeadCreation, logAutoAssignment } from '../services/activityService.js';
import { reassignLead } from '../services/leadService.js';
import { LEAD_STAGES, LEAD_STATUSES, LEAD_SOURCES } from '../config/constants.js';
import logger from '../utils/logger.js';
import { objectsToCsv } from '../utils/csvUtils.js';

// ═══════════════════════════════════════════
// POST /api/leads
// Create new lead (Walk-in, Direct, etc.)
// ═══════════════════════════════════════════
export const createLead = async (req, res, next) => {
  try {
    const {
      customer_name,
      customer_contact,
      customer_email,
      interested_in,
      lead_source,
      lead_source_detail,
      lead_gen_number,
      lead_gen_name,
      campaign_name,
      assigned_to, // optional: manual assignment
      auto_assign = true,
    } = req.body;

    // Validation
    if (!customer_name || !customer_contact) {
      return errorResponse(res, 'Customer name and contact are required', 400);
    }

    if (!lead_source || !Object.values(LEAD_SOURCES).includes(lead_source)) {
      return errorResponse(res, 'Valid lead source is required', 400);
    }

    // Duplicate check
    const isDuplicate = await isDuplicateLead(customer_name, customer_contact, campaign_name || '');
    if (isDuplicate) {
      return errorResponse(res, 'Duplicate lead: Same customer already exists for this campaign', 400);
    }

    // Generate unique ID
    const uniqueId = await generateUniqueId(customer_name, interested_in);

    // Determine owner
    let ownerId = null;

    if (assigned_to) {
      const user = await User.findById(assigned_to);
      if (!user || user.role !== 'BDM') {
        return errorResponse(res, 'Invalid BDM user for assignment', 400);
      }
      ownerId = user._id;
    } else if (auto_assign) {
      ownerId = await autoAssignToBDM();
    }

    // Calculate initial planned date (next working day)
    const plannedDate = await getNextWorkingDayAtTime(new Date(), 1, 10, 0);

    // Create lead
    const lead = await Lead.create({
      unique_id: uniqueId,
      customer_name: customer_name.trim(),
      customer_contact: customer_contact.trim(),
      customer_email: customer_email || '',
      interested_in: interested_in || '',
      lead_source,
      lead_source_detail: lead_source_detail || '',
      lead_gen_number: lead_gen_number || '',
      lead_gen_name: lead_gen_name || '',
      campaign_name: campaign_name || '',
      current_stage: LEAD_STAGES.QUALIFICATION,
      current_status: LEAD_STATUSES.QUALIFICATION.FOLLOWUP_REQUIRED,
      current_owner: ownerId,
      next_followup_date: plannedDate,
      original_timestamp: new Date(),
    });

    await logLeadCreation(lead, req.user);

    if (ownerId && auto_assign) {
      await logAutoAssignment(lead, ownerId, req.user);
    }

    logger.success(`Lead created: ${uniqueId} - ${customer_name}`);

    const populatedLead = await Lead.findById(lead._id).populate('current_owner', 'name display_code role');

    return successResponse(res, populatedLead, 'Lead created successfully', 201);
  } catch (error) {
    logger.error('Create lead error:', error.message);
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/leads
// Get all leads with filters (NOW supports today/overdue/date range)
// ═══════════════════════════════════════════
export const getAllLeads = async (req, res, next) => {
  try {
    const {
      stage,
      status,
      owner,
      source,
      project,
      is_cold,
      is_closed,
      search,

      today,
      overdue,
      date_from,
      date_to,

      page = 1,
      limit = 50,
    } = req.query;

    const query = {};

    if (stage) query.current_stage = stage;
    if (status) query.current_status = status;
    if (owner) query.current_owner = owner;
    if (source) query.lead_source = source;
    if (project) query.project = project;

    if (is_cold !== undefined && is_cold !== '') query.is_cold = is_cold === 'true';
    if (is_closed !== undefined && is_closed !== '') query.is_closed = is_closed === 'true';

    if (search) {
      query.$or = [
        { unique_id: { $regex: search, $options: 'i' } },
        { customer_name: { $regex: search, $options: 'i' } },
        { customer_contact: { $regex: search, $options: 'i' } },
      ];
    }

    // Follow-up date filtering (today / overdue / date range)
    if (overdue === 'true') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      query.next_followup_date = { $lt: start };
    } else if (today === 'true') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      query.next_followup_date = { $gte: start, $lte: end };
    } else if (date_from || date_to) {
      query.next_followup_date = {};
      if (date_from) query.next_followup_date.$gte = new Date(date_from);
      if (date_to) {
        const end = new Date(date_to);
        end.setHours(23, 59, 59, 999);
        query.next_followup_date.$lte = end;
      }
    }

    // Role-based filtering
    // BDM sees only their assigned leads
    if (req.user.role === 'BDM') {
      query.current_owner = req.user.userId;
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const total = await Lead.countDocuments(query);

    const leads = await Lead.find(query)
      .populate('current_owner', 'name display_code role')
      .populate('project', 'name code')
      .sort({ next_followup_date: 1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    return successResponse(
      res,
      {
        count: leads.length,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        leads,
      },
      'Leads fetched successfully'
    );
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/leads/:id
// Get single lead with full details
// ═══════════════════════════════════════════
export const getLeadById = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('current_owner', 'name display_code role email')
      .populate('previous_owner', 'name display_code role')
      .populate('site_visit_done_by', 'name display_code role')
      .populate('project', 'name code project_type');

    if (!lead) {
      return errorResponse(res, 'Lead not found', 404);
    }

    // Role-based access (current behavior)
    if (req.user.role === 'BDM' && lead.current_owner?._id.toString() !== req.user.userId.toString()) {
      return errorResponse(res, 'Access denied to this lead', 403);
    }

    return successResponse(res, lead, 'Lead fetched successfully');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/leads/:id/history
// Get lead activity history (audit trail)
// ═══════════════════════════════════════════
export const getLeadHistory = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return errorResponse(res, 'Lead not found', 404);
    }

    const history = await LeadActivity.find({ lead: lead._id })
      .populate('performed_by', 'name display_code role')
      .populate('owner_before', 'name display_code')
      .populate('owner_after', 'name display_code')
      .sort({ createdAt: -1 });

    return successResponse(
      res,
      {
        lead_id: lead._id,
        unique_id: lead.unique_id,
        count: history.length,
        history,
      },
      'Lead history fetched'
    );
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// PATCH /api/leads/:id/reassign
// Reassign lead to a different owner (Admin only)
// ═══════════════════════════════════════════
export const reassignLeadController = async (req, res, next) => {
  try {
    const { new_owner_id, remark } = req.body;

    if (!new_owner_id) {
      return errorResponse(res, 'New owner ID is required', 400);
    }

    if (!remark) {
      return errorResponse(res, 'Remark is required for reassignment', 400);
    }

    const newOwner = await User.findById(new_owner_id);
    if (!newOwner) {
      return errorResponse(res, 'New owner not found', 404);
    }

    if (!newOwner.is_active) {
      return errorResponse(res, 'Cannot assign to inactive user', 400);
    }

    const lead = await reassignLead({
      leadId: req.params.id,
      newOwnerId: new_owner_id,
      remark,
      performedBy: req.user,
    });

    const populatedLead = await Lead.findById(lead._id)
      .populate('current_owner', 'name display_code role')
      .populate('previous_owner', 'name display_code');

    logger.info(`Lead ${lead.unique_id} reassigned to ${newOwner.name}`);

    return successResponse(res, populatedLead, 'Lead reassigned successfully');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/leads/stats/overview
// Dashboard overview stats
// ═══════════════════════════════════════════
export const getLeadStats = async (req, res, next) => {
  try {
    const baseQuery = {};

    if (req.user.role === 'BDM') {
      baseQuery.current_owner = req.user.userId;
    }

    const [totalLeads, activeLeads, closedLeads, coldLeads, dealWon, byStage] = await Promise.all([
      Lead.countDocuments(baseQuery),
      Lead.countDocuments({ ...baseQuery, is_closed: false }),
      Lead.countDocuments({ ...baseQuery, is_closed: true }),
      Lead.countDocuments({ ...baseQuery, is_cold: true, is_closed: false }),
      Lead.countDocuments({ ...baseQuery, is_deal_won: true }),
      Lead.aggregate([
        { $match: { ...baseQuery, is_closed: false } },
        { $group: { _id: '$current_stage', count: { $sum: 1 } } },
      ]),
    ]);

    return successResponse(
      res,
      {
        total: totalLeads,
        active: activeLeads,
        closed: closedLeads,
        cold: coldLeads,
        deal_won: dealWon,
        by_stage: byStage.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
      },
      'Stats fetched'
    );
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/leads/bdm/workload
// BDM workload stats (Admin only)
// ═══════════════════════════════════════════
export const getBDMWorkloadController = async (req, res, next) => {
  try {
    const workload = await getBDMWorkload();
    return successResponse(res, workload, 'BDM workload fetched');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/leads/overdue
// Get overdue leads
// ═══════════════════════════════════════════
export const getOverdueLeadsController = async (req, res, next) => {
  try {
    const query = {
      next_followup_date: { $lt: new Date() },
      is_closed: false,
    };

    if (req.user.role === 'BDM') {
      query.current_owner = req.user.userId;
    }

    const overdueLeads = await Lead.find(query)
      .populate('current_owner', 'name display_code')
      .populate('project', 'name')
      .sort({ next_followup_date: 1 });

    return successResponse(res, { count: overdueLeads.length, leads: overdueLeads }, 'Overdue leads fetched');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/leads/today
// Get today's followups
// ═══════════════════════════════════════════
export const getTodaysFollowupsController = async (req, res, next) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const query = {
      next_followup_date: { $gte: startOfDay, $lte: endOfDay },
      is_closed: false,
    };

    if (req.user.role === 'BDM') {
      query.current_owner = req.user.userId;
    }

    const leads = await Lead.find(query)
      .populate('current_owner', 'name display_code')
      .populate('project', 'name')
      .sort({ next_followup_date: 1 });

    return successResponse(res, { count: leads.length, leads }, "Today's followups fetched");
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/leads/owners
// Owner dropdown list (read-only)
// Allowed: ADMIN, PC, AUDITOR (route will enforce)
// ═══════════════════════════════════════════
export const getLeadOwnersController = async (req, res, next) => {
  try {
    // BDM + ADVISOR owners list for filtering
    const owners = await User.find({
      is_active: true,
      role: { $in: ['BDM', 'ADVISOR'] },
    })
      .select('name role display_code email')
      .sort({ role: 1, name: 1 })
      .lean();

    return successResponse(
      res,
      { count: owners.length, owners },
      'Lead owners fetched'
    );
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/leads/stats/monitor
// Filter-aware card counts for Lead Monitor UI
// ═══════════════════════════════════════════
export const getLeadMonitorStatsController = async (req, res, next) => {
  try {
    const {
      stage,
      status,
      owner,
      source,
      project,
      is_cold,
      is_closed,
      search,
      today,
      overdue,
      date_from,
      date_to,
    } = req.query;

    const q = {};

    if (stage) q.current_stage = stage;
    if (status) q.current_status = status;
    if (owner) q.current_owner = owner;
    if (source) q.lead_source = source;
    if (project) q.project = project;

    if (is_cold !== undefined && is_cold !== '') q.is_cold = is_cold === 'true';
    if (is_closed !== undefined && is_closed !== '') q.is_closed = is_closed === 'true';

    if (search) {
      q.$or = [
        { unique_id: { $regex: search, $options: 'i' } },
        { customer_name: { $regex: search, $options: 'i' } },
        { customer_contact: { $regex: search, $options: 'i' } },
      ];
    }

    // keep same restriction logic as list
    if (req.user.role === 'BDM') {
      q.current_owner = req.user.userId;
    }

    // apply the same follow-up filters if present
    if (overdue === 'true') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      q.next_followup_date = { $lt: start };
    } else if (today === 'true') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      q.next_followup_date = { $gte: start, $lte: end };
    } else if (date_from || date_to) {
      q.next_followup_date = {};
      if (date_from) q.next_followup_date.$gte = new Date(date_from);
      if (date_to) {
        const end = new Date(date_to);
        end.setHours(23, 59, 59, 999);
        q.next_followup_date.$lte = end;
      }
    }

    // compute these counts under the SAME filter context
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [total, cold, overdueCount, todayCount] = await Promise.all([
      Lead.countDocuments(q),
      Lead.countDocuments({ ...q, is_cold: true }),
      Lead.countDocuments({ ...q, next_followup_date: { $lt: todayStart } }),
      Lead.countDocuments({ ...q, next_followup_date: { $gte: todayStart, $lte: todayEnd } }),
    ]);

    return successResponse(res, { total, today: todayCount, overdue: overdueCount, cold }, 'Monitor stats fetched');
  } catch (err) {
    next(err);
  }
};

// ═══════════════════════════════════════════
// GET /api/leads/export/csv  (ADMIN ONLY)
// Export leads CSV with filters + "All Remarks" column
// ═══════════════════════════════════════════
export const exportLeadsCsvController = async (req, res, next) => {
  try {
    const {
      stage,
      status,
      owner,
      source,
      project,
      is_cold,
      is_closed,
      search,
      today,
      overdue,
      date_from,
      date_to,
    } = req.query;

    const query = {};

    if (stage) query.current_stage = stage;
    if (status) query.current_status = status;
    if (owner) query.current_owner = owner;
    if (source) query.lead_source = source;
    if (project) query.project = project;

    if (is_cold !== undefined && is_cold !== '') query.is_cold = is_cold === 'true';
    if (is_closed !== undefined && is_closed !== '') query.is_closed = is_closed === 'true';

    if (search) {
      query.$or = [
        { unique_id: { $regex: search, $options: 'i' } },
        { customer_name: { $regex: search, $options: 'i' } },
        { customer_contact: { $regex: search, $options: 'i' } },
      ];
    }

    // Follow-up date filtering
    if (overdue === 'true') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      query.next_followup_date = { $lt: start };
    } else if (today === 'true') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      query.next_followup_date = { $gte: start, $lte: end };
    } else if (date_from || date_to) {
      query.next_followup_date = {};
      if (date_from) query.next_followup_date.$gte = new Date(date_from);
      if (date_to) {
        const end = new Date(date_to);
        end.setHours(23, 59, 59, 999);
        query.next_followup_date.$lte = end;
      }
    }

    // NOTE: Admin export = no owner restriction here

    // Safety cap to avoid huge exports accidentally
    const MAX_EXPORT = 5000;

    const leads = await Lead.find(query)
      .populate('current_owner', 'name display_code role')
      .populate('project', 'name code')
      .sort({ createdAt: -1 })
      .limit(MAX_EXPORT)
      .lean();

    const leadIds = leads.map(l => l._id);

    // Fetch all remarks for these leads (use denormalized performer fields)
    const activities = await LeadActivity.find({
      lead: { $in: leadIds },
      remark: { $exists: true, $ne: '' },
    })
      .select('lead remark createdAt performed_by_name performed_by_role action_type')
      .sort({ createdAt: 1 })
      .lean();

    // Group remarks by leadId
    const remarksMap = new Map();
    for (const a of activities) {
      const id = String(a.lead);
      if (!remarksMap.has(id)) remarksMap.set(id, []);
      remarksMap.get(id).push(a);
    }

    const rows = leads.map(l => {
      const list = remarksMap.get(String(l._id)) || [];
      const allRemarks = list
        .map(r => {
          const who = `${r.performed_by_name || '—'}${r.performed_by_role ? ` (${r.performed_by_role})` : ''}`;
          const when = r.createdAt ? new Date(r.createdAt).toISOString() : '';
          const act = r.action_type ? `[${r.action_type}]` : '';
          return `${when} ${act} ${who}: ${r.remark}`;
        })
        .join('\n'); // multi-line cell in CSV

      return {
        unique_id: l.unique_id || '',
        customer_name: l.customer_name || '',
        customer_contact: l.customer_contact || '',
        customer_email: l.customer_email || '',
        interested_in: l.interested_in || '',
        lead_source: l.lead_source || '',
        campaign_name: l.campaign_name || '',
        current_stage: l.current_stage || '',
        current_status: l.current_status || '',
        owner: l.current_owner?.name ? `${l.current_owner.name} (${l.current_owner.role || ''}${l.current_owner.display_code ? ` · ${l.current_owner.display_code}` : ''})` : '',
        project: l.project?.name || '',
        next_followup_date: l.next_followup_date ? new Date(l.next_followup_date).toISOString() : '',
        is_cold: l.is_cold ? 'true' : 'false',
        is_closed: l.is_closed ? 'true' : 'false',
        createdAt: l.createdAt ? new Date(l.createdAt).toISOString() : '',
        all_remarks: allRemarks,
      };
    });

    const headers = [
      { key: 'unique_id', label: 'Unique ID' },
      { key: 'customer_name', label: 'Customer Name' },
      { key: 'customer_contact', label: 'Customer Contact' },
      { key: 'customer_email', label: 'Customer Email' },
      { key: 'interested_in', label: 'Interested In' },
      { key: 'lead_source', label: 'Lead Source' },
      { key: 'campaign_name', label: 'Campaign' },
      { key: 'current_stage', label: 'Stage' },
      { key: 'current_status', label: 'Status' },
      { key: 'owner', label: 'Owner' },
      { key: 'project', label: 'Project' },
      { key: 'next_followup_date', label: 'Next Follow-up (ISO)' },
      { key: 'is_cold', label: 'Is Cold' },
      { key: 'is_closed', label: 'Is Closed' },
      { key: 'createdAt', label: 'Created At (ISO)' },
      { key: 'all_remarks', label: 'All Remarks' },
    ];

    const csv = objectsToCsv(rows, headers);

    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="leads_export_${ts}.csv"`);

    return res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
};
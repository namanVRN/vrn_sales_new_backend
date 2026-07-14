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
      assigned_to,     // optional: manual assignment
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
    const isDuplicate = await isDuplicateLead(
      customer_name, 
      customer_contact, 
      campaign_name || ''
    );

    if (isDuplicate) {
      return errorResponse(
        res, 
        'Duplicate lead: Same customer already exists for this campaign', 
        400
      );
    }

    // Generate unique ID
    const uniqueId = await generateUniqueId(customer_name, interested_in);

    // Determine owner
    let ownerId = null;

    if (assigned_to) {
      // Manual assignment
      const user = await User.findById(assigned_to);
      if (!user || user.role !== 'BDM') {
        return errorResponse(res, 'Invalid BDM user for assignment', 400);
      }
      ownerId = user._id;
    } else if (auto_assign) {
      // Auto-assign to BDM
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

    // Log activity: lead creation
    await logLeadCreation(lead, req.user);

    // Log activity: auto-assignment (if happened)
    if (ownerId && auto_assign) {
      await logAutoAssignment(lead, ownerId, req.user);
    }

    logger.success(`Lead created: ${uniqueId} - ${customer_name}`);

    // Populate for response
    const populatedLead = await Lead.findById(lead._id)
      .populate('current_owner', 'name display_code role');

    return successResponse(res, populatedLead, 'Lead created successfully', 201);
  } catch (error) {
    logger.error('Create lead error:', error.message);
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/leads
// Get all leads with filters
// ═══════════════════════════════════════════
export const getAllLeads = async (req, res, next) => {
  try {
    const {
      stage,
      status,
      owner,
      source,
      is_cold,
      is_closed,
      search,
      page = 1,
      limit = 50,
    } = req.query;

    const query = {};

    if (stage) query.current_stage = stage;
    if (status) query.current_status = status;
    if (owner) query.current_owner = owner;
    if (source) query.lead_source = source;
    if (is_cold !== undefined) query.is_cold = is_cold === 'true';
    if (is_closed !== undefined) query.is_closed = is_closed === 'true';

    if (search) {
      query.$or = [
        { unique_id: { $regex: search, $options: 'i' } },
        { customer_name: { $regex: search, $options: 'i' } },
        { customer_contact: { $regex: search, $options: 'i' } },
      ];
    }

    // Role-based filtering
    // BDM sees only their assigned leads (except when admin)
    if (req.user.role === 'BDM') {
      query.current_owner = req.user.userId;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const total = await Lead.countDocuments(query);

    const leads = await Lead.find(query)
      .populate('current_owner', 'name display_code role')
      .populate('project', 'name code')
      .sort({ next_followup_date: 1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    return successResponse(res, {
      count: leads.length,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      leads,
    }, 'Leads fetched successfully');
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

    // Role-based access
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

    return successResponse(res, {
      lead_id: lead._id,
      unique_id: lead.unique_id,
      count: history.length,
      history,
    }, 'Lead history fetched');
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

    // Verify new owner exists
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

    // BDM sees only own stats
    if (req.user.role === 'BDM') {
      baseQuery.current_owner = req.user.userId;
    }

    const [
      totalLeads,
      activeLeads,
      closedLeads,
      coldLeads,
      dealWon,
      byStage,
    ] = await Promise.all([
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

    return successResponse(res, {
      total: totalLeads,
      active: activeLeads,
      closed: closedLeads,
      cold: coldLeads,
      deal_won: dealWon,
      by_stage: byStage.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
    }, 'Stats fetched');
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

    // BDM sees only own
    if (req.user.role === 'BDM') {
      query.current_owner = req.user.userId;
    }

    const overdueLeads = await Lead.find(query)
      .populate('current_owner', 'name display_code')
      .populate('project', 'name')
      .sort({ next_followup_date: 1 });

    return successResponse(res, {
      count: overdueLeads.length,
      leads: overdueLeads,
    }, 'Overdue leads fetched');
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

    return successResponse(res, {
      count: leads.length,
      leads,
    }, "Today's followups fetched");
  } catch (error) {
    next(error);
  }
};
import Lead from '../models/Lead.js';
import { 
  LEAD_STAGES, 
  LEAD_STATUSES, 
  CLOSE_STATUSES,
  ACTIVITY_TYPES 
} from '../config/constants.js';
import { logActivity } from './activityService.js';
import { calculateNextFollowupDate } from './followupService.js';

// ═══════════════════════════════════════════
// HELPER: Build field-level changes object
// Compares current lead values vs updates
// ═══════════════════════════════════════════
const buildChanges = (lead, updates = {}) => {
  const changes = {};

  Object.keys(updates).forEach((key) => {
    const beforeValue = lead[key];
    const afterValue = updates[key];

    if (afterValue === undefined) return;

    // Normalize for comparison
    const normalize = (val) => {
      if (val === null || val === undefined) return null;
      if (val instanceof Date) return val.toISOString();
      if (val?._id) return val._id.toString();
      if (val?.toString && typeof val === 'object') return val.toString();
      return val;
    };

    const beforeNorm = normalize(beforeValue);
    const afterNorm = normalize(afterValue);

    if (beforeNorm !== afterNorm) {
      changes[key] = {
        before: beforeValue ?? null,
        after: afterValue ?? null,
      };
    }
  });

  return changes;
};

// ═══════════════════════════════════════════
// UPDATE LEAD STATUS (within same stage)
// Followup count: +1
// ═══════════════════════════════════════════
export const updateLeadStatus = async ({
  leadId,
  newStatus,
  newStage = null,
  updates = {},
  remark = '',
  performedBy,
}) => {
  const lead = await Lead.findById(leadId);
  if (!lead) {
    throw new Error('Lead not found');
  }

  if (lead.is_closed) {
    throw new Error('Cannot update a closed lead');
  }

  // Store previous values for audit
  const previousValues = {
    stage: lead.current_stage,
    status: lead.current_status,
    owner: lead.current_owner,
    followup_count: lead.followup_count || 0,
    planned_date: lead.next_followup_date,
  };

  // Build changes object BEFORE applying updates
  const changes = buildChanges(lead, updates);

  const targetStage = newStage || lead.current_stage;

  // Update lead fields
  lead.current_status = newStatus;
  lead.current_stage = targetStage;
  lead.followup_count = previousValues.followup_count + 1;

  // Apply additional updates
  Object.keys(updates).forEach((key) => {
    if (updates[key] !== undefined) {
      lead[key] = updates[key];
    }
  });

  // Handle COLD flag
  if (newStatus === 'COLD') {
    lead.is_cold = true;
  } else {
    lead.is_cold = false;
  }

  // Calculate next followup date if not provided
lead.next_followup_date = await calculateNextFollowupDate(
  newStatus,
  previousValues.followup_count,
  updates.next_followup_date || null
);

  await lead.save();

  // Determine action type
  let actionType = ACTIVITY_TYPES.STATUS_CHANGE;
  if (previousValues.stage !== targetStage) {
    actionType = ACTIVITY_TYPES.STAGE_CHANGE;
  }
  if (newStatus === 'COLD') {
    actionType = ACTIVITY_TYPES.COLD_MARKED;
  }

  // Log activity
  const activity = await logActivity({
    lead,
    action_type: actionType,
    stage_before: previousValues.stage,
    stage_after: lead.current_stage,
    status_before: previousValues.status,
    status_after: lead.current_status,
    owner_before: previousValues.owner,
    owner_after: lead.current_owner,
    followup_count_before: previousValues.followup_count,
    followup_count_after: lead.followup_count,
    planned_date_before: previousValues.planned_date,
    planned_date_after: lead.next_followup_date,
    remark,
    changes,
    performed_by: performedBy,
    performed_by_name: performedBy?.name || '',
    performed_by_role: performedBy?.role || '',
  });

  return { lead, activity };
};

// ═══════════════════════════════════════════
// TRANSITION LEAD TO NEW STAGE
// Followup count: reset to 1 (transition = 1st action of new stage)
// Preserves previous count in audit (Option A)
// ═══════════════════════════════════════════
export const transitionStage = async ({
  leadId,
  newStage,
  newStatus,
  newOwner = null,
  updates = {},
  remark = '',
  performedBy,
}) => {
  const lead = await Lead.findById(leadId);
  if (!lead) {
    throw new Error('Lead not found');
  }

  const previousValues = {
    stage: lead.current_stage,
    status: lead.current_status,
    owner: lead.current_owner,
    followup_count: lead.followup_count || 0,
    planned_date: lead.next_followup_date,
  };

  // Build changes BEFORE applying updates
  const changes = buildChanges(lead, updates);

  // Track owner change in changes too (if any)
  if (newOwner && String(lead.current_owner) !== String(newOwner)) {
    changes.current_owner = {
      before: lead.current_owner,
      after: newOwner,
    };
  }

  // Update stage & status
  lead.current_stage = newStage;
  lead.current_status = newStatus;

  // Transfer ownership if new owner provided
  if (newOwner) {
    lead.previous_owner = lead.current_owner;
    lead.current_owner = newOwner;
  }

  // Apply updates
  Object.keys(updates).forEach((key) => {
    if (updates[key] !== undefined) {
      lead[key] = updates[key];
    }
  });

  // Reset followup count for new stage (this transition = 1st action)
  lead.followup_count = 1;

  // Handle COLD flag
  if (newStatus === 'COLD') {
    lead.is_cold = true;
  }

  // Calculate next followup date if not provided
 lead.next_followup_date = await calculateNextFollowupDate(
  newStatus,
  0,
  updates.next_followup_date || null
);

  await lead.save();

  // Log activity (preserve previous stage's last count in `before`)
  const activity = await logActivity({
    lead,
    action_type: ACTIVITY_TYPES.STAGE_CHANGE,
    stage_before: previousValues.stage,
    stage_after: lead.current_stage,
    status_before: previousValues.status,
    status_after: lead.current_status,
    owner_before: previousValues.owner,
    owner_after: lead.current_owner,
    followup_count_before: previousValues.followup_count,  // Option A: previous stage's count
    followup_count_after: lead.followup_count,             // 1 (new stage)
    planned_date_before: previousValues.planned_date,
    planned_date_after: lead.next_followup_date,
    remark: remark || `Moved to ${newStage}`,
    changes,
    performed_by: performedBy,
    performed_by_name: performedBy?.name || '',
    performed_by_role: performedBy?.role || '',
  });

  return lead;
};

// ═══════════════════════════════════════════
// REASSIGN LEAD TO A DIFFERENT OWNER
// ═══════════════════════════════════════════
export const reassignLead = async ({
  leadId,
  newOwnerId,
  remark = 'Manual reassignment',
  performedBy,
}) => {
  const lead = await Lead.findById(leadId);
  if (!lead) {
    throw new Error('Lead not found');
  }

  const previousOwner = lead.current_owner;

  lead.previous_owner = previousOwner;
  lead.current_owner = newOwnerId;
  await lead.save();

  await logActivity({
    lead,
    action_type: ACTIVITY_TYPES.REASSIGN,
    owner_before: previousOwner,
    owner_after: newOwnerId,
    remark,
    changes: {
      current_owner: {
        before: previousOwner,
        after: newOwnerId,
      },
    },
    performed_by: performedBy,
    performed_by_name: performedBy?.name || '',
    performed_by_role: performedBy?.role || '',
  });

  return lead;
};

// ═══════════════════════════════════════════
// GET LEADS BY STAGE WITH FILTERS
// ═══════════════════════════════════════════
export const getLeadsByStage = async ({
  stage,
  status = null,
  ownerId = null,
  isCold = null,
  isClosed = false,
  search = null,
  page = 1,
  limit = 50,
}) => {
  const query = { current_stage: stage };

  if (status) query.current_status = status;
  if (ownerId) query.current_owner = ownerId;
  if (isCold !== null) query.is_cold = isCold;
  if (isClosed !== null) query.is_closed = isClosed;

  if (search) {
    query.$or = [
      { unique_id: { $regex: search, $options: 'i' } },
      { customer_name: { $regex: search, $options: 'i' } },
      { customer_contact: { $regex: search, $options: 'i' } },
    ];
  }

  const total = await Lead.countDocuments(query);

  const leads = await Lead.find(query)
    .populate('current_owner', 'name display_code role')
    .populate('project', 'name code')
    .sort({ next_followup_date: 1, createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    leads,
  };
};

export const getOverdueLeads = async (userId = null) => {
  return await Lead.getOverdue(userId);
};

export const getTodaysFollowups = async (userId = null) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const query = {
    next_followup_date: { $gte: startOfDay, $lte: endOfDay },
    is_closed: false,
  };

  if (userId) query.current_owner = userId;

  return await Lead.find(query)
    .populate('current_owner', 'name display_code')
    .populate('project', 'name')
    .sort({ next_followup_date: 1 });
};

export default {
  updateLeadStatus,
  reassignLead,
  transitionStage,
  getLeadsByStage,
  getOverdueLeads,
  getTodaysFollowups,
};
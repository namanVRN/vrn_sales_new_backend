import LeadActivity from '../models/LeadActivity.js';
import { ACTIVITY_TYPES } from '../config/constants.js';
import logger from '../utils/logger.js';

/**
 * Log a lead activity (audit trail)
 */
export const logActivity = async ({
  lead,
  action_type = ACTIVITY_TYPES.STATUS_CHANGE,
  stage_before = '',
  stage_after = '',
  status_before = '',
  status_after = '',
  owner_before = null,
  owner_after = null,
  followup_count_before = 0,
  followup_count_after = 0,
  planned_date_before = null,
  planned_date_after = null,
  remark = '',
  important_note = '',
  changes = {},
  performed_by,
  performed_by_name = '',
  performed_by_role = '',
  metadata = {},
  ip_address = '',
}) => {
  try {
    // Extract lead ID and unique_id properly
    let leadId, leadUniqueId;

    if (typeof lead === 'string') {
      leadId = lead;
      const Lead = (await import('../models/Lead.js')).default;
      const fetchedLead = await Lead.findById(lead).select('unique_id');
      leadUniqueId = fetchedLead?.unique_id || 'UNKNOWN';
    } else if (lead && typeof lead === 'object') {
      leadId = lead._id || lead.id;
      leadUniqueId = lead.unique_id || 'UNKNOWN';
    } else {
      throw new Error('Invalid lead parameter');
    }

    if (!leadId) {
      throw new Error('Lead ID is required for activity logging');
    }

    if (!performed_by) {
      throw new Error('performed_by is required for activity logging');
    }

    // Extract performed_by ID
    const performedById = typeof performed_by === 'object' 
      ? (performed_by._id || performed_by.userId || performed_by.id)
      : performed_by;

    if (!performedById) {
      throw new Error('performed_by ID could not be extracted');
    }

    const activity = await LeadActivity.create({
      lead: leadId,
      lead_unique_id: leadUniqueId,
      action_type,
      stage_before: stage_before || '',
      stage_after: stage_after || '',
      status_before: status_before || '',
      status_after: status_after || '',
      owner_before: owner_before || null,
      owner_after: owner_after || null,
      followup_count_before: followup_count_before || 0,
      followup_count_after: followup_count_after || 0,
      planned_date_before: planned_date_before || null,
      planned_date_after: planned_date_after || null,
      remark: remark || '',
      important_note: important_note || '',
      changes: changes || {},
      performed_by: performedById,
      performed_by_name: performed_by_name || '',
      performed_by_role: performed_by_role || '',
      metadata: metadata || {},
      ip_address: ip_address || '',
    });

    logger.debug(`Activity logged: ${action_type} for lead ${leadUniqueId}`);

    return activity;
  } catch (error) {
    logger.error('❌ Failed to log activity:', error.message);
    logger.error('Stack:', error.stack);
    logger.error('Params received:', {
      lead: typeof lead === 'object' ? { id: lead._id, unique_id: lead.unique_id } : lead,
      action_type,
      performed_by: typeof performed_by === 'object' 
        ? { id: performed_by._id || performed_by.userId, name: performed_by.name }
        : performed_by,
    });
    return null;
  }
};

/**
 * Log lead creation
 */
export const logLeadCreation = async (lead, performedBy) => {
  return logActivity({
    lead,
    action_type: ACTIVITY_TYPES.CREATED,
    stage_after: lead.current_stage,
    status_after: lead.current_status,
    owner_after: lead.current_owner,
    performed_by: performedBy,
    performed_by_name: performedBy?.name || performedBy?.email || 'System',
    performed_by_role: performedBy?.role || 'SYSTEM',
    remark: 'Lead created',
  });
};

/**
 * Log auto-assignment
 */
export const logAutoAssignment = async (lead, assignedTo, performedBy = null) => {
  return logActivity({
    lead,
    action_type: ACTIVITY_TYPES.AUTO_ASSIGN,
    owner_after: assignedTo,
    performed_by: performedBy || (lead.current_owner || assignedTo),
    performed_by_name: performedBy?.name || 'System',
    performed_by_role: performedBy?.role || 'SYSTEM',
    remark: 'Auto-assigned to BDM',
  });
};

/**
 * Get activity history for a lead
 */
export const getLeadHistory = async (leadId, limit = 50) => {
  return LeadActivity.getLeadHistory(leadId, limit);
};

export default {
  logActivity,
  logLeadCreation,
  logAutoAssignment,
  getLeadHistory,
};
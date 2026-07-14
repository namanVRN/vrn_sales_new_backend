// backend/src/config/constants.js

// ═══════════════════════════════════════════
// USER ROLES (5 total)
// ═══════════════════════════════════════════
export const USER_ROLES = {
  ADMIN: 'ADMIN',
  BDM: 'BDM',
  ADVISOR: 'ADVISOR',
  AUDITOR: 'AUDITOR',   // 🆕 Read-only auditor
  PC: 'PC',             // 🆕 Process Coordinator (read-only)
};

// 🆕 Read-only roles (cannot update anything)
export const READ_ONLY_ROLES = ['AUDITOR', 'PC'];

// 🆕 Roles that can view ALL leads (not just their own)
export const GLOBAL_VIEW_ROLES = ['ADMIN', 'AUDITOR', 'PC'];

// ═══════════════════════════════════════════
// LEAD STAGES
// ═══════════════════════════════════════════
export const LEAD_STAGES = {
  QUALIFICATION: 'QUALIFICATION',
  SITE_VISIT_SCHEDULING: 'SITE_VISIT_SCHEDULING',
  SITE_VISIT_EXECUTION: 'SITE_VISIT_EXECUTION',
  POST_VISIT_FOLLOWUP: 'POST_VISIT_FOLLOWUP',
  DEAL: 'DEAL',
};

// ═══════════════════════════════════════════
// LEAD STATUSES (stage-wise)
// ═══════════════════════════════════════════
export const LEAD_STATUSES = {
  QUALIFICATION: {
    QUALIFIED: 'QUALIFIED',
    FOLLOWUP_REQUIRED: 'FOLLOWUP_REQUIRED',
    NO_CONNECTION: 'NO_CONNECTION',
    COLD: 'COLD',
    NOT_QUALIFIED: 'NOT_QUALIFIED',
    NOT_INTERESTED: 'NOT_INTERESTED',
  },
  SITE_VISIT_SCHEDULING: {
    VISIT_SCHEDULED: 'VISIT_SCHEDULED',
    NO_RESPONSE: 'NO_RESPONSE',
    FOLLOWUP_REQUIRED: 'FOLLOWUP_REQUIRED',
    COLD: 'COLD',
    NOT_INTERESTED: 'NOT_INTERESTED',
  },
  SITE_VISIT_EXECUTION: {
    VISIT_SCHEDULED: 'VISIT_SCHEDULED',
    VISIT_DONE: 'VISIT_DONE',
    VISIT_MISSED: 'VISIT_MISSED',
    RESCHEDULE: 'RESCHEDULE',
    NO_RESPONSE: 'NO_RESPONSE',
    COLD: 'COLD',
    NOT_INTERESTED: 'NOT_INTERESTED',
  },
  POST_VISIT_FOLLOWUP: {
    FEEDBACK_CAPTURED: 'FEEDBACK_CAPTURED',
    MEETING_SCHEDULED: 'MEETING_SCHEDULED',
    FOLLOWUP_REQUIRED: 'FOLLOWUP_REQUIRED',
    NO_RESPONSE: 'NO_RESPONSE',
    COLD: 'COLD',
    NOT_INTERESTED: 'NOT_INTERESTED',
  },
  DEAL: {
    NEGOTIATION: 'NEGOTIATION',
    MEETING_RESCHEDULE: 'MEETING_RESCHEDULE',
    FOLLOWUP_REQUIRED: 'FOLLOWUP_REQUIRED',
    NO_RESPONSE: 'NO_RESPONSE',
    DEAL_WON: 'DEAL_WON',
    DEAL_LOST: 'DEAL_LOST',
    NEGOTIATION_FAILED: 'NEGOTIATION_FAILED',
    COLD: 'COLD',
    NOT_INTERESTED: 'NOT_INTERESTED',
  },
};

// ═══════════════════════════════════════════
// LEAD SOURCES
// ═══════════════════════════════════════════
export const LEAD_SOURCES = {
  SOCIAL_MEDIA: 'SOCIAL_MEDIA',
  WEBSITE: 'WEBSITE',
  WALK_IN: 'WALK_IN',
  DIRECT: 'DIRECT',
  REFERENCE: 'REFERENCE',
};

// ═══════════════════════════════════════════
// ACTIVITY TYPES
// ═══════════════════════════════════════════
export const ACTIVITY_TYPES = {
  CREATED: 'CREATED',
  STATUS_CHANGE: 'STATUS_CHANGE',
  STAGE_CHANGE: 'STAGE_CHANGE',
  REASSIGN: 'REASSIGN',
  AUTO_ASSIGN: 'AUTO_ASSIGN',
  COLD_MARKED: 'COLD_MARKED',
  VISIT_CLAIMED: 'VISIT_CLAIMED',
  WHATSAPP_SENT: 'WHATSAPP_SENT',
  IMPORTANT_NOTE_UPDATED: 'IMPORTANT_NOTE_UPDATED',
};

// ═══════════════════════════════════════════
// CLOSE STATUSES
// ═══════════════════════════════════════════
export const CLOSE_STATUSES = [
  'NOT_QUALIFIED',
  'NOT_INTERESTED',
  'DEAL_WON',
  'DEAL_LOST',
  'NEGOTIATION_FAILED',
];

// ═══════════════════════════════════════════
// FOLLOWUP GAP
// ═══════════════════════════════════════════
export const getFollowupGap = (currentCount) => {
  return 2 * (currentCount + 1);
};

export const COLD_DAYS = 15;

export default {
  USER_ROLES,
  READ_ONLY_ROLES,
  GLOBAL_VIEW_ROLES,
  LEAD_STAGES,
  LEAD_STATUSES,
  LEAD_SOURCES,
  ACTIVITY_TYPES,
  CLOSE_STATUSES,
  COLD_DAYS,
  getFollowupGap,
};
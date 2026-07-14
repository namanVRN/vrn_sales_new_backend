import mongoose from 'mongoose';
import { ACTIVITY_TYPES, LEAD_STAGES } from '../config/constants.js';

const leadActivitySchema = new mongoose.Schema(
  {
    // ═══════════════════════════════════════════
    // LEAD REFERENCE
    // ═══════════════════════════════════════════
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: [true, 'Lead reference is required'],
      index: true,
    },
    
    lead_unique_id: {
      type: String,
      required: [true, 'Lead unique ID is required'],
      index: true,
    },
    
    // ═══════════════════════════════════════════
    // ACTION TYPE
    // ═══════════════════════════════════════════
    action_type: {
      type: String,
      enum: {
        values: Object.values(ACTIVITY_TYPES),
        message: 'Invalid action type',
      },
      required: [true, 'Action type is required'],
      index: true,
    },
    
    // ═══════════════════════════════════════════
    // STAGE CHANGES
    // ═══════════════════════════════════════════
    stage_before: {
      type: String,
      enum: [...Object.values(LEAD_STAGES), ''],
      default: '',
    },
    
    stage_after: {
      type: String,
      enum: [...Object.values(LEAD_STAGES), ''],
      default: '',
    },
    
    // ═══════════════════════════════════════════
    // STATUS CHANGES
    // ═══════════════════════════════════════════
    status_before: {
      type: String,
      default: '',
    },
    
    status_after: {
      type: String,
      default: '',
    },
    
    // ═══════════════════════════════════════════
    // OWNER CHANGES
    // ═══════════════════════════════════════════
    owner_before: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    
    owner_after: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    
    // ═══════════════════════════════════════════
    // FOLLOWUP CHANGES
    // ═══════════════════════════════════════════
    followup_count_before: {
      type: Number,
      default: 0,
    },
    
    followup_count_after: {
      type: Number,
      default: 0,
    },
    
    planned_date_before: {
      type: Date,
      default: null,
    },
    
    planned_date_after: {
      type: Date,
      default: null,
    },
    
    // ═══════════════════════════════════════════
    // REMARK & NOTES
    // ═══════════════════════════════════════════
    remark: {
      type: String,
      trim: true,
      default: '',
    },
    
    important_note: {
      type: String,
      trim: true,
      default: '',
    },
    
    // ═══════════════════════════════════════════
    // FIELD-LEVEL CHANGES (generic tracker)
    // Example:
    // {
    //   project: { before: null, after: "6a4f2198..." },
    //   purpose: { before: "", after: "Residential" },
    //   planned_site_visit_date: { before: null, after: "2026-07-12..." }
    // }
    // ═══════════════════════════════════════════
    changes: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    
    // ═══════════════════════════════════════════
    // WHO PERFORMED (denormalized for speed)
    // ═══════════════════════════════════════════
    performed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Performed by user is required'],
      index: true,
    },
    
    performed_by_name: {
      type: String,
      trim: true,
      default: '',
    },
    
    performed_by_role: {
      type: String,
      trim: true,
      default: '',
    },
    
    // ═══════════════════════════════════════════
    // METADATA
    // ═══════════════════════════════════════════
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    
    ip_address: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// ═══════════════════════════════════════════
// INDEXES
// ═══════════════════════════════════════════
leadActivitySchema.index({ lead: 1, createdAt: -1 });
leadActivitySchema.index({ performed_by: 1, createdAt: -1 });
leadActivitySchema.index({ action_type: 1, createdAt: -1 });

// ═══════════════════════════════════════════
// STATIC: Get lead history
// ═══════════════════════════════════════════
leadActivitySchema.statics.getLeadHistory = function (leadId, limit = 50) {
  return this.find({ lead: leadId })
    .populate('performed_by', 'name email role')
    .populate('owner_before', 'name display_code')
    .populate('owner_after', 'name display_code')
    .sort({ createdAt: -1 })
    .limit(limit);
};

// ═══════════════════════════════════════════
// STATIC: Get user activity
// ═══════════════════════════════════════════
leadActivitySchema.statics.getUserActivity = function (userId, days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  return this.find({
    performed_by: userId,
    createdAt: { $gte: since },
  })
    .populate('lead', 'unique_id customer_name')
    .sort({ createdAt: -1 });
};

const LeadActivity = mongoose.model('LeadActivity', leadActivitySchema);

export default LeadActivity;
import mongoose from 'mongoose';
import { 
  LEAD_STAGES, 
  LEAD_SOURCES, 
  CLOSE_STATUSES 
} from '../config/constants.js';

const leadSchema = new mongoose.Schema(
  {
    // ═══════════════════════════════════════════
    // UNIQUE IDENTIFIER
    // ═══════════════════════════════════════════
    unique_id: {
      type: String,
      required: [true, 'Unique ID is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    
    // ═══════════════════════════════════════════
    // BASIC CUSTOMER INFO
    // ═══════════════════════════════════════════
    customer_name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
    },
    
    customer_contact: {
      type: String,
      required: [true, 'Customer contact is required'],
      trim: true,
      index: true, // for duplicate check
    },
    
    customer_email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    
    interested_in: {
      type: String,
      trim: true,
      default: '', // Flat, Duplex, Plot, etc.
    },
    
    // ═══════════════════════════════════════════
    // LEAD SOURCE
    // ═══════════════════════════════════════════
    lead_source: {
      type: String,
      enum: {
        values: Object.values(LEAD_SOURCES),
        message: 'Invalid lead source',
      },
      required: [true, 'Lead source is required'],
    },
    
    // Full description like "Through - Social Media Add campaign for Ultimate Heights"
    lead_source_detail: {
      type: String,
      trim: true,
      default: '',
    },
    
    lead_gen_number: {
      type: String,
      trim: true,
      default: '',
    },
    
    lead_gen_name: {
      type: String,
      trim: true,
      default: '',
    },
    
    // Campaign name (for duplicate check + reports)
    campaign_name: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    
    // ═══════════════════════════════════════════
    // CURRENT STATE (most important)
    // ═══════════════════════════════════════════
    current_stage: {
      type: String,
      enum: {
        values: Object.values(LEAD_STAGES),
        message: 'Invalid stage',
      },
      default: LEAD_STAGES.QUALIFICATION,
      index: true,
    },
    
    current_status: {
      type: String,
      required: [true, 'Current status is required'],
      index: true,
    },
    
    current_owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    
    previous_owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    
    // ═══════════════════════════════════════════
    // QUALIFICATION DATA
    // ═══════════════════════════════════════════
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    
    purpose: {
      type: String,
      trim: true,
      default: '', // Residential, Rental, Commercial, Investment
    },
    
    important_note: {
      type: String,
      trim: true,
      default: '',
    },
    
    qualification_remark: {
      type: String,
      trim: true,
      default: '',
    },
    
    not_qualified_reason: {
      type: String,
      trim: true,
      default: '',
    },
    
    // ═══════════════════════════════════════════
    // SITE VISIT DATA
    // ═══════════════════════════════════════════
    planned_site_visit_date: {
      type: Date,
      default: null,
    },
    
    actual_site_visit_date: {
      type: Date,
      default: null,
    },
    
    site_visit_done_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    
    site_visit_feedback: {
      type: String,
      trim: true,
      default: '',
    },
    
    // ═══════════════════════════════════════════
    // MEETING / DEAL DATA
    // ═══════════════════════════════════════════
    meeting_scheduled_date: {
      type: Date,
      default: null,
    },
    
    meeting_done_date: {
      type: Date,
      default: null,
    },
    
    // ═══════════════════════════════════════════
    // FOLLOWUP ENGINE
    // ═══════════════════════════════════════════
    followup_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    
    next_followup_date: {
      type: Date,
      default: null,
      index: true, // for overdue queries
    },
    
    last_action_date: {
      type: Date,
      default: Date.now,
    },
    
    // ═══════════════════════════════════════════
    // FLAGS
    // ═══════════════════════════════════════════
    is_cold: {
      type: Boolean,
      default: false,
      index: true,
    },
    
    is_closed: {
      type: Boolean,
      default: false,
      index: true,
    },
    
    is_deal_won: {
      type: Boolean,
      default: false,
    },
    
    close_reason: {
      type: String,
      trim: true,
      default: '',
    },
    
    closed_at: {
      type: Date,
      default: null,
    },
    
    // ═══════════════════════════════════════════
    // WHATSAPP TRACKING
    // ═══════════════════════════════════════════
    whatsapp_sent: {
      type: Boolean,
      default: false,
    },
    
    whatsapp_sent_at: {
      type: Date,
      default: null,
    },
    
    // ═══════════════════════════════════════════
    // ORIGINAL TIMESTAMP (when lead first came)
    // ═══════════════════════════════════════════
    original_timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // adds createdAt, updatedAt
  }
);

// ═══════════════════════════════════════════
// COMPOUND INDEXES for common queries
// ═══════════════════════════════════════════
leadSchema.index({ current_stage: 1, current_status: 1 });
leadSchema.index({ current_owner: 1, current_stage: 1 });
leadSchema.index({ is_closed: 1, is_cold: 1 });
leadSchema.index({ next_followup_date: 1, is_closed: 1 });
leadSchema.index({ customer_contact: 1, campaign_name: 1 }); // duplicate check

// ═══════════════════════════════════════════
// VIRTUAL: Days since last action
// ═══════════════════════════════════════════
leadSchema.virtual('days_since_last_action').get(function () {
  if (!this.last_action_date) return 0;
  const diffTime = Date.now() - this.last_action_date.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
});

// ═══════════════════════════════════════════
// VIRTUAL: Is overdue?
// ═══════════════════════════════════════════
leadSchema.virtual('is_overdue').get(function () {
  if (!this.next_followup_date || this.is_closed) return false;
  return this.next_followup_date < new Date();
});

// ═══════════════════════════════════════════
// PRE-SAVE: Auto-close if final status
// ═══════════════════════════════════════════
leadSchema.pre('save', function (next) {
  // Auto-set is_closed based on status
  if (CLOSE_STATUSES.includes(this.current_status) && !this.is_closed) {
    this.is_closed = true;
    this.closed_at = new Date();
    
    if (this.current_status === 'DEAL_WON') {
      this.is_deal_won = true;
    }
  }
  
  // Update last_action_date
  if (this.isModified('current_status') || this.isModified('current_stage')) {
    this.last_action_date = new Date();
  }
  
  next();
});

// ═══════════════════════════════════════════
// STATIC: Find leads by stage for a user
// ═══════════════════════════════════════════
leadSchema.statics.findByStageForUser = function (stage, userId) {
  return this.find({
    current_stage: stage,
    current_owner: userId,
    is_closed: false,
  }).populate('project current_owner');
};

// ═══════════════════════════════════════════
// STATIC: Get overdue leads
// ═══════════════════════════════════════════
leadSchema.statics.getOverdue = function (userId = null) {
  const query = {
    next_followup_date: { $lt: new Date() },
    is_closed: false,
  };
  
  if (userId) query.current_owner = userId;
  
  return this.find(query).populate('project current_owner');
};

// Include virtuals in JSON responses
leadSchema.set('toJSON', { virtuals: true });
leadSchema.set('toObject', { virtuals: true });

const Lead = mongoose.model('Lead', leadSchema);

export default Lead;
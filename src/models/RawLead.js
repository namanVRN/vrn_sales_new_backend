import mongoose from 'mongoose';
import { LEAD_SOURCES } from '../config/constants.js';

const rawLeadSchema = new mongoose.Schema(
  {
    // ═══════════════════════════════════════════
    // BASIC INFO (from source)
    // ═══════════════════════════════════════════
    timestamp: {
      type: Date,
      default: Date.now,
    },
    
    customer_name: {
      type: String,
      trim: true,
      default: '',
    },
    
    contact: {
      type: String,
      trim: true,
      default: '',
    },
    
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    
    interested_in: {
      type: String,
      trim: true,
      default: '',
    },
    
    campaign_name: {
      type: String,
      trim: true,
      default: '',
    },
    
    source: {
      type: String,
      enum: Object.values(LEAD_SOURCES),
      required: [true, 'Source is required'],
    },
    
    // ═══════════════════════════════════════════
    // PROCESSING STATUS
    // ═══════════════════════════════════════════
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSED', 'DUPLICATE', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    
    processed_at: {
      type: Date,
      default: null,
    },
    
    // Link to created lead (if processed)
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
    },
    
    // ═══════════════════════════════════════════
    // RAW PAYLOAD (original data from source)
    // ═══════════════════════════════════════════
    raw_data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    
    // Error message if rejected
    error_message: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

rawLeadSchema.index({ status: 1, createdAt: -1 });
rawLeadSchema.index({ source: 1, status: 1 });

const RawLead = mongoose.model('RawLead', rawLeadSchema);

export default RawLead;
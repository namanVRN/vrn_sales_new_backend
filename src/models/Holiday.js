import mongoose from 'mongoose';

const holidaySchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, 'Holiday date is required'],
      unique: true,
    },
    
    description: {
      type: String,
      trim: true,
      default: '',
    },
    
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

holidaySchema.index({ date: 1 });

// ═══════════════════════════════════════════
// STATIC: Check if date is holiday
// ═══════════════════════════════════════════
holidaySchema.statics.isHoliday = async function (date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const holiday = await this.findOne({
    date: { $gte: startOfDay, $lte: endOfDay },
    is_active: true,
  });
  
  return !!holiday;
};

// ═══════════════════════════════════════════
// STATIC: Get all upcoming holidays
// ═══════════════════════════════════════════
holidaySchema.statics.getUpcoming = function (days = 30) {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + days);
  
  return this.find({
    date: { $gte: now, $lte: future },
    is_active: true,
  }).sort({ date: 1 });
};

const Holiday = mongoose.model('Holiday', holidaySchema);

export default Holiday;
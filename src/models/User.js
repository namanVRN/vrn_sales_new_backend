// backend/src/models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { USER_ROLES } from '../config/constants.js';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },

    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },

    phone: {
      type: String,
      trim: true,
      default: '',
    },

    // 🆕 Updated: Now includes AUDITOR + PC
    role: {
      type: String,
      enum: {
        values: Object.values(USER_ROLES),
        message: 'Invalid role. Must be ADMIN, BDM, ADVISOR, AUDITOR, or PC',
      },
      required: [true, 'Role is required'],
    },

    assigned_modules: [{
      type: String,
    }],

    assignment_percentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    is_active: {
      type: Boolean,
      default: true,
    },

    last_login: {
      type: Date,
      default: null,
    },

    display_code: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ email: 1 });
userSchema.index({ role: 1, is_active: 1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function () {
  const user = this.toObject();
  delete user.password;
  return user;
};

userSchema.statics.findActiveByRole = function (role) {
  return this.find({ role, is_active: true });
};

const User = mongoose.model('User', userSchema);
export default User;
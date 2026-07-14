import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { config } from '../config/env.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';
import logger from '../utils/logger.js';

// ═══════════════════════════════════════════
// Generate JWT Token
// ═══════════════════════════════════════════
const generateToken = (userId) => {
  return jwt.sign({ userId }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
  });
};

// ═══════════════════════════════════════════
// POST /api/auth/login
// ═══════════════════════════════════════════
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return errorResponse(res, 'Email and password are required', 400);
    }

    // Find user with password field (normally excluded)
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      return errorResponse(res, 'Invalid email or password', 401);
    }

    // Check if user is active
    if (!user.is_active) {
      return errorResponse(res, 'Account is deactivated. Contact admin.', 403);
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return errorResponse(res, 'Invalid email or password', 401);
    }

    // Update last login
    user.last_login = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    logger.success(`User logged in: ${user.email} (${user.role})`);

    return successResponse(res, {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        display_code: user.display_code,
        assigned_modules: user.assigned_modules,
      },
    }, 'Login successful');
  } catch (error) {
    logger.error('Login error:', error.message);
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/auth/me
// Get current logged in user
// ═══════════════════════════════════════════
export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    return successResponse(res, user.toSafeObject(), 'User fetched successfully');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// POST /api/auth/logout
// ═══════════════════════════════════════════
export const logout = async (req, res) => {
  return successResponse(res, null, 'Logged out successfully');
};

// ═══════════════════════════════════════════
// POST /api/auth/change-password
// ═══════════════════════════════════════════
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return errorResponse(res, 'Current and new password required', 400);
    }

    if (newPassword.length < 6) {
      return errorResponse(res, 'New password must be at least 6 characters', 400);
    }

    const user = await User.findById(req.user.userId).select('+password');

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    const isValid = await user.comparePassword(currentPassword);

    if (!isValid) {
      return errorResponse(res, 'Current password is incorrect', 401);
    }

    user.password = newPassword;
    await user.save();

    return successResponse(res, null, 'Password changed successfully');
  } catch (error) {
    next(error);
  }
};
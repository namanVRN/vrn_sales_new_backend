// backend/src/controllers/userController.js
import User from '../models/User.js';
import Lead from '../models/Lead.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';
import { USER_ROLES } from '../config/constants.js';
import logger from '../utils/logger.js';

// ═══════════════════════════════════════════
// POST /api/users
// ═══════════════════════════════════════════
export const createUser = async (req, res, next) => {
  try {
    const {
      name, email, password, phone, role,
      display_code, assigned_modules, assignment_percentage,
    } = req.body;

    if (!name || !email || !password || !role) {
      return errorResponse(res, 'Name, email, password and role are required', 400);
    }

    if (!Object.values(USER_ROLES).includes(role)) {
      return errorResponse(res, `Invalid role. Must be one of: ${Object.values(USER_ROLES).join(', ')}`, 400);
    }

    if (password.length < 6) {
      return errorResponse(res, 'Password must be at least 6 characters', 400);
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return errorResponse(res, 'Email already registered', 400);
    }

    // 🆕 Only BDMs can have assignment_percentage
    const finalPercentage = role === 'BDM' ? (assignment_percentage || 0) : 0;

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      phone: phone || '',
      role,
      display_code: display_code || '',
      assigned_modules: assigned_modules || [],
      assignment_percentage: finalPercentage,
    });

    logger.success(`User created: ${user.email} (${user.role})`);
    return successResponse(res, user.toSafeObject(), 'User created successfully', 201);
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/users
// ═══════════════════════════════════════════
export const getAllUsers = async (req, res, next) => {
  try {
    const { role, is_active, search } = req.query;
    const query = {};

    if (role) query.role = role;
    if (is_active !== undefined) query.is_active = is_active === 'true';

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { display_code: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(query).sort({ createdAt: -1 });

    return successResponse(res, {
      count: users.length,
      users,
    }, 'Users fetched successfully');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/users/:id
// ═══════════════════════════════════════════
export const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return errorResponse(res, 'User not found', 404);

    // 🆕 Also get active lead count for this user
    const activeLeadsCount = await Lead.countDocuments({
      current_owner: user._id,
      is_closed: false,
    });

    const userObj = user.toObject();
    userObj.active_leads_count = activeLeadsCount;

    return successResponse(res, userObj, 'User fetched successfully');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// PATCH /api/users/:id
// ═══════════════════════════════════════════
export const updateUser = async (req, res, next) => {
  try {
    const {
      name, email, phone, role, display_code,
      assigned_modules, assignment_percentage, is_active,
    } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) return errorResponse(res, 'User not found', 404);

    if (role !== undefined && !Object.values(USER_ROLES).includes(role)) {
      return errorResponse(res, 'Invalid role', 400);
    }

    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email.toLowerCase();
    if (phone !== undefined) user.phone = phone;
    if (role !== undefined) user.role = role;
    if (display_code !== undefined) user.display_code = display_code;
    if (assigned_modules !== undefined) user.assigned_modules = assigned_modules;
    if (is_active !== undefined) user.is_active = is_active;

    // 🆕 Only BDMs can have assignment_percentage
    if (assignment_percentage !== undefined) {
      user.assignment_percentage = user.role === 'BDM' ? assignment_percentage : 0;
    }

    await user.save();
    logger.info(`User updated: ${user.email}`);
    return successResponse(res, user.toSafeObject(), 'User updated successfully');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// PATCH /api/users/:id/reset-password
// ═══════════════════════════════════════════
export const resetUserPassword = async (req, res, next) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return errorResponse(res, 'New password must be at least 6 characters', 400);
    }

    const user = await User.findById(req.params.id).select('+password');
    if (!user) return errorResponse(res, 'User not found', 404);

    user.password = new_password;
    await user.save();

    logger.info(`Password reset by admin for: ${user.email}`);
    return successResponse(res, null, 'Password reset successfully');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// PATCH /api/users/:id/toggle-status
// ═══════════════════════════════════════════
export const toggleUserStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return errorResponse(res, 'User not found', 404);

    // 🆕 Prevent deactivating self
    if (user._id.toString() === req.user.userId.toString()) {
      return errorResponse(res, 'Cannot deactivate your own account', 400);
    }

    user.is_active = !user.is_active;
    await user.save();

    logger.info(`User ${user.is_active ? 'activated' : 'deactivated'}: ${user.email}`);
    return successResponse(
      res,
      user.toSafeObject(),
      `User ${user.is_active ? 'activated' : 'deactivated'} successfully`
    );
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// DELETE /api/users/:id
// ═══════════════════════════════════════════
export const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return errorResponse(res, 'User not found', 404);

    if (user._id.toString() === req.user.userId.toString()) {
      return errorResponse(res, 'Cannot delete your own account', 400);
    }

    // 🆕 Check if user has active leads
    const activeLeadsCount = await Lead.countDocuments({
      current_owner: user._id,
      is_closed: false,
    });

    if (activeLeadsCount > 0) {
      return errorResponse(
        res,
        `Cannot delete user with ${activeLeadsCount} active leads. Reassign them first.`,
        400
      );
    }

    await User.findByIdAndDelete(req.params.id);
    logger.warn(`User deleted: ${user.email}`);
    return successResponse(res, null, 'User deleted successfully');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/users/role/:role
// ═══════════════════════════════════════════
export const getUsersByRole = async (req, res, next) => {
  try {
    const { role } = req.params;
    if (!Object.values(USER_ROLES).includes(role)) {
      return errorResponse(res, 'Invalid role', 400);
    }

    const users = await User.findActiveByRole(role);
    return successResponse(res, {
      count: users.length,
      users,
    }, `Active ${role}s fetched successfully`);
  } catch (error) {
    next(error);
  }
};
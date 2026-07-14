// backend/src/middleware/roleCheck.js
import { errorResponse } from '../utils/responseHandler.js';
import { READ_ONLY_ROLES } from '../config/constants.js';

// ═══════════════════════════════════════════
// Check if user has one of the required roles
// Usage: authorize('ADMIN', 'BDM')
// ═══════════════════════════════════════════
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 'Authentication required', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return errorResponse(
        res,
        `Access denied. Required role: ${allowedRoles.join(' or ')}`,
        403
      );
    }

    next();
  };
};

// ═══════════════════════════════════════════
// Check if user is admin
// ═══════════════════════════════════════════
export const isAdmin = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return errorResponse(res, 'Admin access required', 403);
  }
  next();
};

// ═══════════════════════════════════════════
// 🆕 Block read-only roles (AUDITOR + PC) from write operations
// Use this on all PATCH/POST/DELETE endpoints
// ═══════════════════════════════════════════
export const blockReadOnly = (req, res, next) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  if (READ_ONLY_ROLES.includes(req.user.role)) {
    return errorResponse(
      res,
      `${req.user.role} has read-only access. Cannot modify data.`,
      403
    );
  }

  next();
};

// ═══════════════════════════════════════════
// 🆕 Allow all authenticated users (for GET endpoints)
// Explicitly says "yes AUDITOR/PC can view this"
// ═══════════════════════════════════════════
export const allowRead = (req, res, next) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }
  next();
};

export default { authorize, isAdmin, blockReadOnly, allowRead };
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { config } from '../config/env.js';
import { errorResponse } from '../utils/responseHandler.js';

export const authenticate = async (req, res, next) => {
  try {
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return errorResponse(res, 'Access denied. No token provided.', 401);
    }

    const decoded = jwt.verify(token, config.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return errorResponse(res, 'User no longer exists', 401);
    }

    if (!user.is_active) {
      return errorResponse(res, 'Account is deactivated', 403);
    }

    // Attach user info to request
    req.user = {
      _id: user._id,
      userId: user._id,
      email: user.email,
      role: user.role,
      name: user.name,
      display_code: user.display_code,
      assigned_modules: user.assigned_modules,
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return errorResponse(res, 'Invalid token', 401);
    }
    if (error.name === 'TokenExpiredError') {
      return errorResponse(res, 'Token expired. Please login again.', 401);
    }
    return errorResponse(res, 'Authentication failed', 401);
  }
};

export default authenticate;
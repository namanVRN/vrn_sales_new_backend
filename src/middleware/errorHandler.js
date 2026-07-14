import { errorResponse } from '../utils/responseHandler.js';
import logger from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
  logger.error('Error:', err.message);
  logger.error('Stack:', err.stack);
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return errorResponse(res, 'Validation failed', 400, errors);
  }
  
  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return errorResponse(res, `${field} already exists`, 400);
  }
  
  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return errorResponse(res, 'Invalid ID format', 400);
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return errorResponse(res, 'Invalid token', 401);
  }
  
  if (err.name === 'TokenExpiredError') {
    return errorResponse(res, 'Token expired', 401);
  }
  
  // Default error
  return errorResponse(
    res,
    err.message || 'Internal server error',
    err.statusCode || 500
  );
};

export const notFoundHandler = (req, res) => {
  return errorResponse(res, `Route not found: ${req.originalUrl}`, 404);
};

export default errorHandler;
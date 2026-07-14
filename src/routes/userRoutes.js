import express from 'express';
import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  resetUserPassword,
  toggleUserStatus,
  deleteUser,
  getUsersByRole,
} from '../controllers/userController.js';
import { authenticate } from '../middleware/auth.js';
import { isAdmin, authorize } from '../middleware/roleCheck.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all users (Admin only)
router.get('/', isAdmin, getAllUsers);

// Get users by role (Admin only)
router.get('/role/:role', isAdmin, getUsersByRole);

// Get single user (Admin only)
router.get('/:id', isAdmin, getUserById);

// Create user (Admin only)
router.post('/', isAdmin, createUser);

// Update user (Admin only)
router.patch('/:id', isAdmin, updateUser);

// Reset user password (Admin only)
router.patch('/:id/reset-password', isAdmin, resetUserPassword);

// Toggle user status (Admin only)
router.patch('/:id/toggle-status', isAdmin, toggleUserStatus);

// Delete user (Admin only)
router.delete('/:id', isAdmin, deleteUser);

export default router;
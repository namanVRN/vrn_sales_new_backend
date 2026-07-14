import express from 'express';
import {
  login,
  getMe,
  logout,
  changePassword,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/login', login);

// Protected routes (need JWT token)
router.get('/me', authenticate, getMe);
router.post('/logout', authenticate, logout);
router.post('/change-password', authenticate, changePassword);

export default router;
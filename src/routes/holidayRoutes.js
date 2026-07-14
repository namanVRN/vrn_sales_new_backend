import express from 'express';
import {
  createHoliday,
  createBulkHolidays,
  getAllHolidays,
  getUpcomingHolidays,
  checkHoliday,
  updateHoliday,
  deleteHoliday,
} from '../controllers/holidayController.js';
import { authenticate } from '../middleware/auth.js';
import { isAdmin } from '../middleware/roleCheck.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ═══════════════════════════════════════════
// PUBLIC ROUTES (any authenticated user)
// ═══════════════════════════════════════════
router.get('/', getAllHolidays);
router.get('/upcoming', getUpcomingHolidays);
router.get('/check/:date', checkHoliday);

// ═══════════════════════════════════════════
// ADMIN ONLY ROUTES
// ═══════════════════════════════════════════
router.post('/', isAdmin, createHoliday);
router.post('/bulk', isAdmin, createBulkHolidays);
router.patch('/:id', isAdmin, updateHoliday);
router.delete('/:id', isAdmin, deleteHoliday);

export default router;
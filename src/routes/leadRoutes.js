import express from 'express';
import {
  createLead,
  getAllLeads,
  getLeadById,
  getLeadHistory,
  reassignLeadController,
  getLeadStats,
  getBDMWorkloadController,
  getOverdueLeadsController,
  getTodaysFollowupsController,
} from '../controllers/leadController.js';
import { authenticate } from '../middleware/auth.js';
import { isAdmin, authorize } from '../middleware/roleCheck.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ═══════════════════════════════════════════
// STATS & DASHBOARD
// ═══════════════════════════════════════════
router.get('/stats/overview', getLeadStats);
router.get('/overdue', getOverdueLeadsController);
router.get('/today', getTodaysFollowupsController);
router.get('/bdm/workload', isAdmin, getBDMWorkloadController);

// ═══════════════════════════════════════════
// LEAD CRUD
// ═══════════════════════════════════════════
router.get('/', getAllLeads);
router.get('/:id', getLeadById);
router.get('/:id/history', getLeadHistory);

// Create lead - Admin & BDM can create
router.post('/', authorize('ADMIN', 'BDM'), createLead);

// Reassign - Admin only
router.patch('/:id/reassign', isAdmin, reassignLeadController);

export default router;
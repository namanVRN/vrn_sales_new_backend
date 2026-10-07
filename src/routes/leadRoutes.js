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
  getLeadMonitorStatsController,
  getLeadOwnersController,
  exportLeadsCsvController,
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
router.get('/stats/monitor', getLeadMonitorStatsController);

// ═══════════════════════════════════════════
// LEAD CRUD
// ═══════════════════════════════════════════
router.get('/', getAllLeads);
// Owners list for filter dropdown (ADMIN/PC/AUDITOR only)
router.get('/owners', authorize('ADMIN', 'PC', 'AUDITOR'), getLeadOwnersController);
router.get('/:id', getLeadById);
router.get('/:id/history', getLeadHistory);

// Create lead - Admin & BDM can create
router.post('/', authorize('ADMIN', 'BDM'), createLead);

// Export leads as CSV (Admin only)
router.get('/export/csv', isAdmin, exportLeadsCsvController);

// Reassign - Admin only
router.patch('/:id/reassign', isAdmin, reassignLeadController);

export default router;
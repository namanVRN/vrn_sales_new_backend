import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize, isAdmin } from '../middleware/roleCheck.js';
import {
  getActivities,
  exportActivitiesCsvController,
} from '../controllers/activityController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Export activities as CSV (Admin only)
router.get('/export/csv', isAdmin, exportActivitiesCsvController);

// Global audit log (read-only)
// Only ADMIN + PC + AUDITOR can access
router.get('/', authorize('ADMIN', 'PC', 'AUDITOR'), getActivities);

export default router;
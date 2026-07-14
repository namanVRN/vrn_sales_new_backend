import express from 'express';
import {
  getSiteVisitSchedulingLeads,
  updateSiteVisitScheduling,
  getSiteVisitSchedulingStats,
} from '../controllers/siteVisitController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/roleCheck.js';

const router = express.Router();

router.use(authenticate);

// Only ADMIN & BDM can access
router.use(authorize('ADMIN', 'BDM'));

router.get('/stats', getSiteVisitSchedulingStats);
router.get('/', getSiteVisitSchedulingLeads);
router.patch('/:id', updateSiteVisitScheduling);

export default router;
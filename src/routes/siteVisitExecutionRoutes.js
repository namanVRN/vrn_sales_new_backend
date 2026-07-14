import express from 'express';
import {
  getScheduledVisits,
  getCNPLeads,
  updateSiteVisitExecution,
  getSiteVisitExecutionStats,
} from '../controllers/siteVisitExecutionController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/roleCheck.js';

const router = express.Router();

router.use(authenticate);

// Stats — BDM, FSR, Admin
router.get('/stats', authorize('ADMIN', 'BDM', 'ADVISOR'), getSiteVisitExecutionStats);

// Screen A: Scheduled visits — BDM + FSR + Admin
router.get('/scheduled', authorize('ADMIN', 'BDM', 'ADVISOR'), getScheduledVisits);

// Screen B: CNP — BDM + Admin only
router.get('/cnp', authorize('ADMIN', 'BDM'), getCNPLeads);

// Update — BDM, FSR, Admin (VISIT_DONE internally checks FSR-only)
router.patch('/:id', authorize('ADMIN', 'BDM', 'ADVISOR'), updateSiteVisitExecution);

export default router;
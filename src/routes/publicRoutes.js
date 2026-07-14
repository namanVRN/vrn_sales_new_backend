// backend/src/routes/publicRoutes.js
import express from 'express';
import {
  checkDuplicate,
  createPublicLead,
  getPublicProjects,
} from '../controllers/publicLeadController.js';

const router = express.Router();

// ═══════════════════════════════════════════
// PUBLIC ROUTES — No Authentication Required
// ═══════════════════════════════════════════

// Get active projects (for form dropdown)
router.get('/projects', getPublicProjects);

// Check if phone number is duplicate
router.post('/leads/check-duplicate', checkDuplicate);

// Create new lead from public form
router.post('/leads', createPublicLead);

export default router;
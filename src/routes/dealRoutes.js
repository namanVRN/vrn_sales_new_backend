import express from 'express';
import {
  getDealLeads,
  updateDeal,
  getDealStats,
} from '../controllers/dealController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/roleCheck.js';

const router = express.Router();

router.use(authenticate);

// FSR + Admin only
router.use(authorize('ADMIN', 'ADVISOR'));

router.get('/stats', getDealStats);
router.get('/', getDealLeads);
router.patch('/:id', updateDeal);

export default router;
import express from 'express';
import {
  getQualificationLeads,
  updateQualification,
  getQualificationStats,
} from '../controllers/qualificationController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/roleCheck.js';

const router = express.Router();

router.use(authenticate);

// Only ADMIN and BDM can access qualification
router.use(authorize('ADMIN', 'BDM'));

router.get('/stats', getQualificationStats);
router.get('/', getQualificationLeads);
router.patch('/:id', updateQualification);

export default router;
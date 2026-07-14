import express from 'express';
import {
  getPostVisitLeads,
  updatePostVisit,
  getPostVisitStats,
} from '../controllers/postVisitController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/roleCheck.js';

const router = express.Router();

router.use(authenticate);

// FSR + Admin only
router.use(authorize('ADMIN', 'ADVISOR'));

router.get('/stats', getPostVisitStats);
router.get('/', getPostVisitLeads);
router.patch('/:id', updatePostVisit);

export default router;
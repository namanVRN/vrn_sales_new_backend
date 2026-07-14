import express from 'express';
import {
  createProject,
  getAllProjects,
  getActiveProjects,
  getProjectById,
  updateProject,
  toggleProject,
  deleteProject,
} from '../controllers/projectController.js';
import { authenticate } from '../middleware/auth.js';
import { isAdmin } from '../middleware/roleCheck.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ═══════════════════════════════════════════
// PUBLIC ROUTES (any authenticated user)
// ═══════════════════════════════════════════
router.get('/', getAllProjects);
router.get('/active', getActiveProjects);
router.get('/:id', getProjectById);

// ═══════════════════════════════════════════
// ADMIN ONLY ROUTES
// ═══════════════════════════════════════════
router.post('/', isAdmin, createProject);
router.patch('/:id', isAdmin, updateProject);
router.patch('/:id/toggle', isAdmin, toggleProject);
router.delete('/:id', isAdmin, deleteProject);

export default router;
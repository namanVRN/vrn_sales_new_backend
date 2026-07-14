import Project from '../models/Project.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';
import logger from '../utils/logger.js';

// ═══════════════════════════════════════════
// POST /api/projects
// Create new project (Admin only)
// ═══════════════════════════════════════════
export const createProject = async (req, res, next) => {
  try {
    const { name, code, description, location, project_type } = req.body;

    if (!name) {
      return errorResponse(res, 'Project name is required', 400);
    }

    // Check duplicate (case-insensitive)
    const existing = await Project.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });
    
    if (existing) {
      return errorResponse(res, 'Project with this name already exists', 400);
    }

    const project = await Project.create({
      name: name.trim(),
      code: code ? code.toUpperCase() : name.substring(0, 3).toUpperCase(),
      description: description || '',
      location: location || '',
      project_type: project_type || '',
    });

    logger.success(`Project created: ${project.name}`);

    return successResponse(res, project, 'Project created successfully', 201);
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/projects
// Get all projects (with optional filter)
// ═══════════════════════════════════════════
export const getAllProjects = async (req, res, next) => {
  try {
    const { is_active, project_type, search } = req.query;
    const query = {};

    if (is_active !== undefined) {
      query.is_active = is_active === 'true';
    }

    if (project_type) {
      query.project_type = project_type;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }

    const projects = await Project.find(query).sort({ name: 1 });

    return successResponse(res, {
      count: projects.length,
      projects,
    }, 'Projects fetched successfully');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/projects/active
// Get only active projects (for dropdowns)
// ═══════════════════════════════════════════
export const getActiveProjects = async (req, res, next) => {
  try {
    const projects = await Project.find({ is_active: true })
      .select('name code project_type')
      .sort({ name: 1 });

    return successResponse(res, projects, 'Active projects fetched');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/projects/:id
// Get single project
// ═══════════════════════════════════════════
export const getProjectById = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return errorResponse(res, 'Project not found', 404);
    }

    return successResponse(res, project, 'Project fetched successfully');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// PATCH /api/projects/:id
// Update project (Admin only)
// ═══════════════════════════════════════════
export const updateProject = async (req, res, next) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!project) {
      return errorResponse(res, 'Project not found', 404);
    }

    logger.info(`Project updated: ${project.name}`);

    return successResponse(res, project, 'Project updated successfully');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// PATCH /api/projects/:id/toggle
// Activate/Deactivate project
// ═══════════════════════════════════════════
export const toggleProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return errorResponse(res, 'Project not found', 404);
    }

    project.is_active = !project.is_active;
    await project.save();

    logger.info(`Project ${project.is_active ? 'activated' : 'deactivated'}: ${project.name}`);

    return successResponse(
      res, 
      project, 
      `Project ${project.is_active ? 'activated' : 'deactivated'} successfully`
    );
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// DELETE /api/projects/:id
// Delete project (Admin only) - use carefully
// ═══════════════════════════════════════════
export const deleteProject = async (req, res, next) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);

    if (!project) {
      return errorResponse(res, 'Project not found', 404);
    }

    logger.warn(`Project deleted: ${project.name}`);

    return successResponse(res, null, 'Project deleted successfully');
  } catch (error) {
    next(error);
  }
};
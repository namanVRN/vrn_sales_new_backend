// backend/src/controllers/publicLeadController.js
import Lead from '../models/Lead.js';
import Project from '../models/Project.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';
import { generateUniqueId } from '../services/uniqueIdService.js';
import { autoAssignToBDM } from '../services/assignmentService.js';
import { getNextWorkingDayAtTime } from '../services/workingDayService.js';
import { logLeadCreation, logAutoAssignment } from '../services/activityService.js';
import { LEAD_STAGES, LEAD_STATUSES, LEAD_SOURCES } from '../config/constants.js';
import dayjs from 'dayjs';
import logger from '../utils/logger.js';

// ═══════════════════════════════════════════
// POST /api/public/leads/check-duplicate
// ═══════════════════════════════════════════
export const checkDuplicate = async (req, res, next) => {
  try {
    const { customer_contact } = req.body;

    if (!customer_contact) {
      return errorResponse(res, 'Phone number is required', 400);
    }

    const cleanPhone = customer_contact.toString().replace(/[\s\-+]/g, '').replace(/^91/, '');

    const existingLead = await Lead.findOne({
      customer_contact: { $regex: cleanPhone, $options: 'i' }
    })
      .populate('current_owner', 'name display_code role')
      .populate('project', 'name')
      .sort({ createdAt: -1 });

    if (!existingLead) {
      return successResponse(res, { is_duplicate: false }, 'No duplicate found');
    }

    const daysAgo = Math.floor(
      (Date.now() - new Date(existingLead.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    return successResponse(res, {
      is_duplicate: true,
      existing_lead: {
        unique_id: existingLead.unique_id,
        customer_name: existingLead.customer_name,
        customer_contact: existingLead.customer_contact,
        interested_in: existingLead.interested_in,
        project_name: existingLead.project?.name || null,
        current_stage: existingLead.current_stage,
        current_status: existingLead.current_status,
        is_closed: existingLead.is_closed,
        assigned_to: existingLead.current_owner ? {
          name: existingLead.current_owner.name,
          display_code: existingLead.current_owner.display_code,
          role: existingLead.current_owner.role,
        } : null,
        created_days_ago: daysAgo,
        created_at: existingLead.createdAt,
      },
    }, 'Duplicate lead found');
  } catch (error) {
    logger.error('Check duplicate error:', error.message);
    next(error);
  }
};

// ═══════════════════════════════════════════
// POST /api/public/leads
// ═══════════════════════════════════════════
export const createPublicLead = async (req, res, next) => {
  try {
    const {
      customer_name,
      customer_contact,
      customer_email,
      interested_in,
      project_id,
      message,
      allow_duplicate = false,
    } = req.body;

    if (!customer_name || !customer_name.trim()) {
      return errorResponse(res, 'Name is required', 400);
    }

    if (!customer_contact) {
      return errorResponse(res, 'Contact number is required', 400);
    }

    const cleanPhone = customer_contact.toString().replace(/[\s\-+]/g, '').replace(/^91/, '');

    if (!/^\d{10}$/.test(cleanPhone)) {
      return errorResponse(res, 'Please enter a valid 10-digit phone number', 400);
    }

    if (!interested_in) {
      return errorResponse(res, 'Please select what you are interested in', 400);
    }

    // Check duplicate
    if (!allow_duplicate) {
      const existing = await Lead.findOne({ customer_contact: cleanPhone });
      if (existing) {
        return errorResponse(
          res,
          'A lead with this phone number already exists. Please confirm to submit anyway.',
          409
        );
      }
    }

    // Verify project
    let projectDoc = null;
    if (project_id) {
      projectDoc = await Project.findById(project_id);
      if (!projectDoc) {
        return errorResponse(res, 'Invalid project selected', 400);
      }
    }

    // Generate unique ID
    const uniqueId = await generateUniqueId(customer_name, interested_in);

    // Auto-assign to BDM
    const ownerId = await autoAssignToBDM();

    // 🆕 Smart planned date calculation
    const plannedDate = await calculateSmartFollowupDate();

    // Build important note
    let importantNote = '';
    if (message && message.trim()) {
      importantNote = `📝 Customer message: ${message.trim()}`;
    }
    if (allow_duplicate) {
      importantNote = (importantNote ? importantNote + '\n' : '') +
                      '⚠️ Re-enquiry: Customer submitted duplicate form';
    }

    // Create lead
    const lead = await Lead.create({
      unique_id: uniqueId,
      customer_name: customer_name.trim(),
      customer_contact: cleanPhone,
      customer_email: customer_email?.trim() || '',
      interested_in: interested_in,
      lead_source: LEAD_SOURCES.WEBSITE,
      lead_source_detail: 'Public enquiry form',
      campaign_name: 'Public Form',
      current_stage: LEAD_STAGES.QUALIFICATION,
      current_status: LEAD_STATUSES.QUALIFICATION.FOLLOWUP_REQUIRED,
      current_owner: ownerId,
      project: projectDoc?._id || null,
      important_note: importantNote,
      next_followup_date: plannedDate,
      original_timestamp: new Date(),
    });

    // 🆕 Log with detailed info
    logger.success(
      `🌐 Public lead created: ${uniqueId} - ${customer_name} | ` +
      `Planned followup: ${dayjs(plannedDate).format('DD MMM YYYY, hh:mm A')}`
    );

    const systemUser = {
      userId: null,
      name: 'Public Form',
      role: 'PUBLIC',
    };

    await logLeadCreation(lead, systemUser);
    if (ownerId) {
      await logAutoAssignment(lead, ownerId, systemUser);
    }

    const populatedLead = await Lead.findById(lead._id)
      .populate('current_owner', 'name display_code role')
      .populate('project', 'name');

    return successResponse(res, {
      unique_id: populatedLead.unique_id,
      customer_name: populatedLead.customer_name,
      assigned_to: populatedLead.current_owner ? {
        name: populatedLead.current_owner.name,
        display_code: populatedLead.current_owner.display_code,
      } : null,
      planned_followup: dayjs(plannedDate).format('DD MMM YYYY, hh:mm A'),
      message: 'Thank you! Our team will contact you within 24 hours.',
    }, 'Lead created successfully', 201);
  } catch (error) {
    logger.error('Public lead creation error:', error.message);
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/public/projects
// ═══════════════════════════════════════════
export const getPublicProjects = async (req, res, next) => {
  try {
    const projects = await Project.find({ is_active: true })
      .select('_id name project_type')
      .sort({ name: 1 });

    return successResponse(res, projects, 'Projects fetched');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// 🆕 HELPER: Smart followup date calculator
// - Before 6 PM → Next working day at 10 AM
// - After 6 PM → Day after next working day at 10 AM
// - Auto skips Sundays + holidays
// ═══════════════════════════════════════════
const calculateSmartFollowupDate = async () => {
  const now = dayjs();
  const currentHour = now.hour();

  // Business logic: if after 6 PM, add extra day
  const daysToAdd = currentHour >= 18 ? 2 : 1;

  const plannedDate = await getNextWorkingDayAtTime(
    now.toDate(),
    daysToAdd,
    10,  // 10 AM
    0    // 0 minutes
  );

  logger.info(
    `📅 Smart followup date: submitted at ${now.format('hh:mm A')}, ` +
    `+${daysToAdd} day(s), planned for ${dayjs(plannedDate).format('DD MMM YYYY, hh:mm A')}`
  );

  return plannedDate;
};

export default {
  checkDuplicate,
  createPublicLead,
  getPublicProjects,
};
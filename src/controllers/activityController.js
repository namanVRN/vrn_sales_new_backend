import LeadActivity from '../models/LeadActivity.js';
import Lead from '../models/Lead.js';
import { successResponse } from '../utils/responseHandler.js';
import { objectsToCsv } from '../utils/csvUtils.js';

// ─────────────────────────────────────────────
// Helper: Build Mongo filter for activities (shared by list + export)
// ─────────────────────────────────────────────
const buildActivitiesFilter = async (query) => {
  const {
    search,
    action_type,
    stage_before,
    stage_after,
    status_before,
    status_after,
    performed_by,
    performed_by_role,
    owner_before,
    owner_after,
    project,
    from,
    to,
  } = query;

  const filter = {};
  const and = [];

  // Direct activity filters
  if (action_type) and.push({ action_type });
  if (stage_before) and.push({ stage_before });
  if (stage_after) and.push({ stage_after });
  if (status_before) and.push({ status_before });
  if (status_after) and.push({ status_after });

  if (performed_by) and.push({ performed_by });
  if (performed_by_role) and.push({ performed_by_role });

  if (owner_before) and.push({ owner_before });
  if (owner_after) and.push({ owner_after });

  // Date range on activity createdAt
  if (from || to) {
    const createdAt = {};
    if (from) createdAt.$gte = new Date(from);
    if (to) createdAt.$lte = new Date(to);
    and.push({ createdAt });
  }

  // Lead-based filtering for project/search
  if (project || search) {
    const leadQuery = {};
    if (project) leadQuery.project = project;

    if (search) {
      const s = String(search).trim();
      const safe = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(safe, 'i');
      leadQuery.$or = [
        { unique_id: rx },
        { customer_name: rx },
        { customer_contact: rx },
      ];
    }

    const leads = await Lead.find(leadQuery).select('_id').limit(5000).lean();
    const leadIds = leads.map((l) => l._id);

    if (leadIds.length === 0) {
      return { filter: { __no_results__: true } }; // special marker
    }

    and.push({ lead: { $in: leadIds } });
  }

  // Search inside activity doc fields too
  if (search) {
    const s = String(search).trim();
    const safe = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');

    and.push({
      $or: [
        { lead_unique_id: rx },
        { remark: rx },
        { performed_by_name: rx },
      ],
    });
  }

  if (and.length) filter.$and = and;

  return { filter };
};

// ═══════════════════════════════════════════
// GET /api/activities
// Global audit log (read-only)
// Allowed: ADMIN, PC, AUDITOR (route enforces)
// ═══════════════════════════════════════════
export const getActivities = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const skip = (pageNum - 1) * limitNum;

    const { filter } = await buildActivitiesFilter(req.query);

    // no results shortcut
    if (filter.__no_results__) {
      return successResponse(
        res,
        {
          count: 0,
          total: 0,
          page: pageNum,
          limit: limitNum,
          totalPages: 0,
          activities: [],
        },
        'Activities fetched'
      );
    }

    const total = await LeadActivity.countDocuments(filter);

    const activities = await LeadActivity.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate({
        path: 'lead',
        select: 'unique_id customer_name customer_contact current_stage current_status project current_owner',
        populate: [
          { path: 'project', select: 'name code' },
          { path: 'current_owner', select: 'name display_code role' },
        ],
      })
      .populate('performed_by', 'name email role display_code')
      .populate('owner_before', 'name role display_code')
      .populate('owner_after', 'name role display_code')
      .lean();

    return successResponse(
      res,
      {
        count: activities.length,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        activities,
      },
      'Activities fetched'
    );
  } catch (err) {
    next(err);
  }
};

// ═══════════════════════════════════════════
// GET /api/activities/export/csv  (ADMIN ONLY)
// Export activities CSV with same filters
// ═══════════════════════════════════════════
export const exportActivitiesCsvController = async (req, res, next) => {
  try {
    const { filter } = await buildActivitiesFilter(req.query);

    // empty export shortcut
    if (filter.__no_results__) {
      const headers = [
        { key: 'createdAt', label: 'Time (ISO)' },
        { key: 'lead_unique_id', label: 'Lead Unique ID' },
        { key: 'customer_name', label: 'Customer Name' },
        { key: 'customer_contact', label: 'Customer Contact' },
        { key: 'project', label: 'Project' },
        { key: 'action_type', label: 'Action Type' },
        { key: 'stage_before', label: 'Stage Before' },
        { key: 'stage_after', label: 'Stage After' },
        { key: 'status_before', label: 'Status Before' },
        { key: 'status_after', label: 'Status After' },
        { key: 'owner_before', label: 'Owner Before' },
        { key: 'owner_after', label: 'Owner After' },
        { key: 'planned_date_before', label: 'Planned Date Before (ISO)' },
        { key: 'planned_date_after', label: 'Planned Date After (ISO)' },
        { key: 'followup_count_before', label: 'Followup Count Before' },
        { key: 'followup_count_after', label: 'Followup Count After' },
        { key: 'performed_by', label: 'Performed By' },
        { key: 'performed_by_role', label: 'Performed By Role' },
        { key: 'remark', label: 'Remark' },
        { key: 'changes', label: 'Changes (JSON)' },
      ];

      const csv = objectsToCsv([], headers);
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="activities_export_${ts}.csv"`);
      return res.status(200).send(csv);
    }

    // Safety cap for export
    const MAX_EXPORT = 10000;

    const activities = await LeadActivity.find(filter)
      .sort({ createdAt: -1 })
      .limit(MAX_EXPORT)
      .populate({
        path: 'lead',
        select: 'unique_id customer_name customer_contact project',
        populate: { path: 'project', select: 'name code' },
      })
      .populate('performed_by', 'name email role display_code')
      .populate('owner_before', 'name role display_code')
      .populate('owner_after', 'name role display_code')
      .lean();

    const formatUser = (u) => {
      if (!u?.name) return '';
      const code = u.display_code ? ` · ${u.display_code}` : '';
      const role = u.role ? `${u.role}` : '';
      return `${u.name}${role ? ` (${role}${code})` : ''}`;
    };

    const rows = activities.map((a) => ({
      createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : '',
      lead_unique_id: a.lead_unique_id || a.lead?.unique_id || '',
      customer_name: a.lead?.customer_name || '',
      customer_contact: a.lead?.customer_contact || '',
      project: a.lead?.project?.name || '',
      action_type: a.action_type || '',
      stage_before: a.stage_before || '',
      stage_after: a.stage_after || '',
      status_before: a.status_before || '',
      status_after: a.status_after || '',
      owner_before: formatUser(a.owner_before),
      owner_after: formatUser(a.owner_after),
      planned_date_before: a.planned_date_before ? new Date(a.planned_date_before).toISOString() : '',
      planned_date_after: a.planned_date_after ? new Date(a.planned_date_after).toISOString() : '',
      followup_count_before: a.followup_count_before ?? '',
      followup_count_after: a.followup_count_after ?? '',
      performed_by: a.performed_by ? formatUser(a.performed_by) : (a.performed_by_name || ''),
      performed_by_role: a.performed_by_role || a.performed_by?.role || '',
      remark: a.remark || '',
      changes: JSON.stringify(a.changes || {}),
    }));

    const headers = [
      { key: 'createdAt', label: 'Time (ISO)' },
      { key: 'lead_unique_id', label: 'Lead Unique ID' },
      { key: 'customer_name', label: 'Customer Name' },
      { key: 'customer_contact', label: 'Customer Contact' },
      { key: 'project', label: 'Project' },
      { key: 'action_type', label: 'Action Type' },
      { key: 'stage_before', label: 'Stage Before' },
      { key: 'stage_after', label: 'Stage After' },
      { key: 'status_before', label: 'Status Before' },
      { key: 'status_after', label: 'Status After' },
      { key: 'owner_before', label: 'Owner Before' },
      { key: 'owner_after', label: 'Owner After' },
      { key: 'planned_date_before', label: 'Planned Date Before (ISO)' },
      { key: 'planned_date_after', label: 'Planned Date After (ISO)' },
      { key: 'followup_count_before', label: 'Followup Count Before' },
      { key: 'followup_count_after', label: 'Followup Count After' },
      { key: 'performed_by', label: 'Performed By' },
      { key: 'performed_by_role', label: 'Performed By Role' },
      { key: 'remark', label: 'Remark' },
      { key: 'changes', label: 'Changes (JSON)' },
    ];

    const csv = objectsToCsv(rows, headers);

    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="activities_export_${ts}.csv"`);

    return res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
};

export default { getActivities, exportActivitiesCsvController };
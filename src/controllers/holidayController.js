import Holiday from '../models/Holiday.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';
import logger from '../utils/logger.js';

// ═══════════════════════════════════════════
// POST /api/holidays
// Create single holiday (Admin only)
// ═══════════════════════════════════════════
export const createHoliday = async (req, res, next) => {
  try {
    const { date, description } = req.body;

    if (!date) {
      return errorResponse(res, 'Date is required', 400);
    }

    const holiday = await Holiday.create({
      date: new Date(date),
      description: description || '',
    });

    logger.success(`Holiday added: ${date} - ${description}`);

    return successResponse(res, holiday, 'Holiday added successfully', 201);
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(res, 'Holiday already exists for this date', 400);
    }
    next(error);
  }
};

// ═══════════════════════════════════════════
// POST /api/holidays/bulk
// Add multiple holidays at once
// ═══════════════════════════════════════════
export const createBulkHolidays = async (req, res, next) => {
  try {
    const { holidays } = req.body;

    if (!holidays || !Array.isArray(holidays) || holidays.length === 0) {
      return errorResponse(res, 'Holidays array is required', 400);
    }

    const results = { 
      added: 0, 
      skipped: 0, 
      errors: [],
      addedList: [],
    };

    for (const h of holidays) {
      try {
        const holiday = await Holiday.create({
          date: new Date(h.date),
          description: h.description || '',
        });
        results.added++;
        results.addedList.push(holiday);
      } catch (err) {
        if (err.code === 11000) {
          results.skipped++;
        } else {
          results.errors.push({ 
            date: h.date, 
            error: err.message 
          });
        }
      }
    }

    logger.info(`Bulk holidays: ${results.added} added, ${results.skipped} skipped`);

    return successResponse(
      res, 
      results, 
      `${results.added} holidays added, ${results.skipped} duplicates skipped`
    );
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/holidays
// Get all holidays (with year filter)
// ═══════════════════════════════════════════
export const getAllHolidays = async (req, res, next) => {
  try {
    const { year, is_active } = req.query;

    let query = {};

    if (is_active !== undefined) {
      query.is_active = is_active === 'true';
    } else {
      query.is_active = true; // default show active only
    }

    if (year) {
      const startDate = new Date(`${year}-01-01`);
      const endDate = new Date(`${year}-12-31T23:59:59`);
      query.date = { $gte: startDate, $lte: endDate };
    }

    const holidays = await Holiday.find(query).sort({ date: 1 });

    return successResponse(res, {
      count: holidays.length,
      holidays,
    }, 'Holidays fetched successfully');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/holidays/upcoming
// Get upcoming holidays (next N days)
// ═══════════════════════════════════════════
export const getUpcomingHolidays = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const holidays = await Holiday.getUpcoming(days);

    return successResponse(res, {
      count: holidays.length,
      days_ahead: days,
      holidays,
    }, 'Upcoming holidays fetched');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET /api/holidays/check/:date
// Check if a specific date is a working day
// ═══════════════════════════════════════════
export const checkHoliday = async (req, res, next) => {
  try {
    const { date } = req.params;
    const checkDate = new Date(date);

    if (isNaN(checkDate.getTime())) {
      return errorResponse(res, 'Invalid date format. Use YYYY-MM-DD', 400);
    }

    const isHoliday = await Holiday.isHoliday(checkDate);
    const isSunday = checkDate.getDay() === 0;

    return successResponse(res, {
      date,
      is_holiday: isHoliday,
      is_sunday: isSunday,
      is_working_day: !isHoliday && !isSunday,
      day_name: checkDate.toLocaleDateString('en-US', { weekday: 'long' }),
    }, 'Date checked successfully');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// PATCH /api/holidays/:id
// Update holiday
// ═══════════════════════════════════════════
export const updateHoliday = async (req, res, next) => {
  try {
    const holiday = await Holiday.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!holiday) {
      return errorResponse(res, 'Holiday not found', 404);
    }

    return successResponse(res, holiday, 'Holiday updated successfully');
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// DELETE /api/holidays/:id
// Delete holiday
// ═══════════════════════════════════════════
export const deleteHoliday = async (req, res, next) => {
  try {
    const holiday = await Holiday.findByIdAndDelete(req.params.id);

    if (!holiday) {
      return errorResponse(res, 'Holiday not found', 404);
    }

    logger.warn(`Holiday deleted: ${holiday.date}`);

    return successResponse(res, null, 'Holiday deleted successfully');
  } catch (error) {
    next(error);
  }
};
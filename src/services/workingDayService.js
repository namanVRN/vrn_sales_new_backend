import Holiday from '../models/Holiday.js';
import dayjs from 'dayjs';

/**
 * Get next working day (skips Sundays and holidays)
 * 
 * @param {Date} fromDate - Starting date
 * @param {number} daysToAdd - How many working days to add
 * @returns {Date} Next working date
 */
export const getNextWorkingDay = async (fromDate = new Date(), daysToAdd = 1) => {
  let date = dayjs(fromDate);
  let workingDaysAdded = 0;
  let maxAttempts = 30; // safety limit

  // First, add the requested days
  date = date.add(daysToAdd, 'day');

  // Then keep adding days until we hit a working day
  while (maxAttempts > 0) {
    const isSunday = date.day() === 0;
    const isHoliday = await Holiday.isHoliday(date.toDate());

    if (!isSunday && !isHoliday) {
      break; // Found a working day
    }

    date = date.add(1, 'day');
    maxAttempts--;
  }

  return date.toDate();
};

/**
 * Get next working day with specific time (default: 10 AM)
 */
export const getNextWorkingDayAtTime = async (
  fromDate = new Date(),
  daysToAdd = 1,
  hour = 10,
  minute = 0
) => {
  const nextDate = await getNextWorkingDay(fromDate, daysToAdd);
  const withTime = dayjs(nextDate)
    .hour(hour)
    .minute(minute)
    .second(0)
    .millisecond(0);

  return withTime.toDate();
};

/**
 * Check if given date is a working day
 */
export const isWorkingDay = async (date) => {
  const d = dayjs(date);
  const isSunday = d.day() === 0;
  const isHoliday = await Holiday.isHoliday(d.toDate());

  return !isSunday && !isHoliday;
};

/**
 * Add specific business days (skips weekends + holidays)
 */
export const addBusinessDays = async (fromDate, businessDays) => {
  let date = dayjs(fromDate);
  let added = 0;

  while (added < businessDays) {
    date = date.add(1, 'day');
    const isSunday = date.day() === 0;
    const isHoliday = await Holiday.isHoliday(date.toDate());

    if (!isSunday && !isHoliday) {
      added++;
    }
  }

  return date.toDate();
};

export default {
  getNextWorkingDay,
  getNextWorkingDayAtTime,
  isWorkingDay,
  addBusinessDays,
};
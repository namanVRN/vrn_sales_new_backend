import { COLD_DAYS } from '../config/constants.js';
import { getNextWorkingDayAtTime } from './workingDayService.js';
import dayjs from 'dayjs';

/**
 * Calculate next followup date based on status
 * 
 * Rules:
 * - QUALIFIED / FOLLOWUP_REQUIRED: user can override, else +2 days
 * - NO_CONNECTION / NO_RESPONSE: progressive (count×2), user cannot override
 * - COLD: +15 days, user cannot override
 * - NOT_INTERESTED / NOT_QUALIFIED: no date (null)
 * - Others: +1 day default
 * 
 * @param {string} status - New status
 * @param {number} currentFollowupCount - Current count BEFORE this action
 * @param {Date|null} userProvidedDate - Date given by user (optional)
 * @returns {Date|null}
 */
export const calculateNextFollowupDate = async (
    status,
    currentFollowupCount = 0,
    userProvidedDate = null
) => {
    // ═══════════════════════════════════════════
    // CLOSED STATUSES → No next date
    // ═══════════════════════════════════════════
    if (status === 'NOT_INTERESTED' || status === 'NOT_QUALIFIED' ||
        status === 'DEAL_WON' || status === 'DEAL_LOST' ||
        status === 'NEGOTIATION_FAILED') {
        return null;
    }

    // ═══════════════════════════════════════════
    // COLD → Always +15 days (user cannot override)
    // ═══════════════════════════════════════════
    if (status === 'COLD') {
        return await getNextWorkingDayAtTime(new Date(), COLD_DAYS, 10, 0);
    }

    // ═══════════════════════════════════════════
    // NO_CONNECTION / NO_RESPONSE → Progressive (user cannot override)
    // count 0 → +2, count 1 → +4, count 2 → +6, count 3 → +8...
    // (count is BEFORE this action, so next-attempt-count = count+1)
    // ═══════════════════════════════════════════
    if (status === 'NO_CONNECTION' || status === 'NO_RESPONSE') {
        const nextAttempt = currentFollowupCount + 1;
        const gap = nextAttempt * 2;
        return await getNextWorkingDayAtTime(new Date(), gap, 10, 0);
    }

    // ═══════════════════════════════════════════
    // QUALIFIED / FOLLOWUP_REQUIRED → User can override, else +2
    // ═══════════════════════════════════════════
    if (status === 'QUALIFIED' || status === 'FOLLOWUP_REQUIRED' ||
        status === 'FEEDBACK_CAPTURED' || status === 'NEGOTIATION') {
        if (userProvidedDate) {
            return new Date(userProvidedDate);
        }
        return await getNextWorkingDayAtTime(new Date(), 2, 10, 0);
    }

    // Scheduled events → use user date (mandatory in controllers)
    if (status === 'VISIT_SCHEDULED' || status === 'MEETING_SCHEDULED' ||
        status === 'RESCHEDULE' || status === 'MEETING_RESCHEDULE') {
        if (userProvidedDate) {
            return new Date(userProvidedDate);
        }
        return await getNextWorkingDayAtTime(new Date(), 1, 10, 0);
    }

    // ═══════════════════════════════════════════
    // DEFAULT → +1 working day
    // ═══════════════════════════════════════════
    return await getNextWorkingDayAtTime(new Date(), 1, 10, 0);
};

/**
 * Auto-adjust time between business hours (10 AM - 6 PM)
 */
export const adjustToBusinessHours = (date) => {
    const d = dayjs(date);
    const hour = d.hour();

    if (hour === 0 && d.minute() === 0) {
        return d.hour(10).minute(0).toDate();
    }

    if (hour < 10) {
        return d.hour(10).minute(0).toDate();
    }

    if (hour >= 18) {
        return d.add(1, 'day').hour(10).minute(0).toDate();
    }

    if (hour === 13) {
        return d.hour(14).minute(0).toDate();
    }

    return d.toDate();
};

export default {
    calculateNextFollowupDate,
    adjustToBusinessHours,
};
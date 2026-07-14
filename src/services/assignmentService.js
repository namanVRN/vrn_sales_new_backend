import User from '../models/User.js';
import { USER_ROLES } from '../config/constants.js';

/**
 * Get all active BDMs with assignment percentage
 */
export const getEligibleBDMs = async () => {
  return await User.find({
    role: USER_ROLES.BDM,
    is_active: true,
    assignment_percentage: { $gt: 0 },
  }).sort({ assignment_percentage: -1 });
};

/**
 * Auto-assign lead to a BDM using percentage-based logic
 * 
 * @returns {ObjectId|null} - Selected BDM's ObjectId or null
 */
export const autoAssignToBDM = async () => {
  const eligibleBDMs = await getEligibleBDMs();

  if (!eligibleBDMs || eligibleBDMs.length === 0) {
    return null;
  }

  // If only one BDM, assign to them
  if (eligibleBDMs.length === 1) {
    return eligibleBDMs[0]._id;
  }

  // Percentage-based selection
  const selectedBDM = selectBDMByPercentage(eligibleBDMs);
  return selectedBDM ? selectedBDM._id : null;
};

/**
 * Select BDM based on percentage weights
 * Example: BDM1=40%, BDM2=30%, BDM3=30%
 * Random number 0-100 falls into one range
 */
const selectBDMByPercentage = (bdms) => {
  const totalPercentage = bdms.reduce(
    (sum, bdm) => sum + (bdm.assignment_percentage || 0),
    0
  );

  if (totalPercentage === 0) {
    // Fallback: random selection
    return bdms[Math.floor(Math.random() * bdms.length)];
  }

  // Generate random number between 0 and totalPercentage
  let random = Math.random() * totalPercentage;

  // Find which BDM this falls into
  for (const bdm of bdms) {
    random -= (bdm.assignment_percentage || 0);
    if (random <= 0) {
      return bdm;
    }
  }

  // Fallback
  return bdms[0];
};

/**
 * Get BDM workload stats
 */
export const getBDMWorkload = async () => {
  const Lead = (await import('../models/Lead.js')).default;
  const bdms = await getEligibleBDMs();

  const workload = await Promise.all(
    bdms.map(async (bdm) => {
      const activeLeads = await Lead.countDocuments({
        current_owner: bdm._id,
        is_closed: false,
      });

      return {
        bdm_id: bdm._id,
        bdm_name: bdm.name,
        display_code: bdm.display_code,
        assignment_percentage: bdm.assignment_percentage,
        active_leads: activeLeads,
      };
    })
  );

  return workload;
};

export default {
  getEligibleBDMs,
  autoAssignToBDM,
  getBDMWorkload,
};
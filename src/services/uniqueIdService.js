import Lead from '../models/Lead.js';

/**
 * Generate unique ID for a lead
 * Format: [FirstLetter][LastLetter][InterestFirstLetter][Counter]
 * Example: "PRF1" for Pratibha Wadhwani interested in Flat
 * 
 * @param {string} customerName - Full customer name
 * @param {string} interestedIn - What they're interested in
 * @returns {string} Unique ID
 */
export const generateUniqueId = async (customerName = '', interestedIn = '') => {
  // Get total lead count
  const totalLeads = await Lead.countDocuments();
  const counter = totalLeads + 1;

  const hasName = customerName && customerName.trim().length > 0;
  const hasInterest = interestedIn && interestedIn.trim().length > 0;

  // Get counter with padding
  let counterStr;
  if (counter < 10) counterStr = '00' + counter;
  else if (counter < 100) counterStr = '0' + counter;
  else counterStr = counter.toString();

  // Case 1: Has both name and interest
  if (hasName && hasInterest) {
    const nameParts = customerName.trim().split(/\s+/).filter(Boolean);
    const first = getFirstAlpha(nameParts[0]);
    const last = nameParts.length >= 2 
      ? getFirstAlpha(nameParts[nameParts.length - 1])
      : getLastAlpha(nameParts[0]);
    const interest = interestedIn.charAt(0).toUpperCase();

    return `${first}${last}${interest}${counterStr}`;
  }

  // Case 2: Has name, no interest
  if (hasName && !hasInterest) {
    const nameParts = customerName.trim().split(/\s+/).filter(Boolean);
    const first = getFirstAlpha(nameParts[0]);
    const last = nameParts.length >= 2 
      ? getFirstAlpha(nameParts[nameParts.length - 1])
      : getLastAlpha(nameParts[0]);

    return `${first}${last}-${counterStr}`;
  }

  // Case 3: No name, has interest
  if (!hasName && hasInterest) {
    const interest = interestedIn.charAt(0).toUpperCase();
    return `ENQ-${interest}-${counterStr}`;
  }

  // Case 4: Neither
  return `ENQ-${counterStr}`;
};

/**
 * Get first alphabetic character (uppercase)
 */
const getFirstAlpha = (str) => {
  if (!str) return 'X';
  const normalized = str.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const match = normalized.match(/[a-zA-Z]/);
  return match ? match[0].toUpperCase() : 'X';
};

/**
 * Get last alphabetic character (uppercase)
 */
const getLastAlpha = (str) => {
  if (!str) return 'X';
  const normalized = str.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const matches = normalized.match(/[a-zA-Z]/g);
  return matches && matches.length > 0 
    ? matches[matches.length - 1].toUpperCase() 
    : 'X';
};

/**
 * Check if lead is duplicate (name + contact + campaign)
 */
export const isDuplicateLead = async (customerName, contact, campaignName = '') => {
  const normalizedName = (customerName || '').trim().toLowerCase();
  const normalizedContact = (contact || '').replace(/\D/g, '');
  const normalizedCampaign = (campaignName || '').trim().toLowerCase();

  // Check for duplicate
  const existingLead = await Lead.findOne({
    customer_name: { $regex: new RegExp(`^${normalizedName}$`, 'i') },
    customer_contact: contact,
    campaign_name: campaignName || '',
  });

  return !!existingLead;
};

export default {
  generateUniqueId,
  isDuplicateLead,
};
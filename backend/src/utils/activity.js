const { ActivityLog } = require('../models');

/**
 * Persist an activity log entry to MongoDB.
 * @param {object} params
 * @param {string} params.actor - Name or identifier of person/system performing the action
 * @param {string} [params.role] - Operational role (ADMIN, TECHNICIAN, OPERATOR, SYSTEM)
 * @param {string} params.action - Description of the action performed
 * @param {string} params.target - Entity target affected (e.g. WO-301, EQ002, PRT-103)
 * @param {string} [params.category] - Category: FAULTS, WORK_ORDERS, INVENTORY, MAINTENANCE, SYSTEM
 * @param {string} [params.badge_class] - CSS badge class: badge-operational, badge-scheduled, badge-faulty, badge-maintenance
 * @param {Date} [params.timestamp] - Optional custom timestamp
 */
async function logActivity(params) {
  try {
    const entry = await ActivityLog.create({
      actor: params.actor || 'System Engine',
      role: (params.role || 'SYSTEM').toUpperCase(),
      action: params.action || 'System event',
      target: params.target || 'General',
      category: (params.category || 'SYSTEM').toUpperCase(),
      badge_class: params.badge_class || 'badge-operational',
      timestamp: params.timestamp ? new Date(params.timestamp) : new Date()
    });
    return entry;
  } catch (err) {
    console.error('Failed to record activity log:', err.message);
    return null;
  }
}

/**
 * Format activity log for frontend ISO-55000 Shift Log Drawer & Analytics UI
 */
function formatActivity(a) {
  if (!a) return null;
  const isoTime = a.timestamp ? (a.timestamp instanceof Date ? a.timestamp.toISOString() : new Date(a.timestamp).toISOString()) : new Date().toISOString();
  return {
    id: a.id || a._id,
    timestamp: isoTime,
    time: isoTime.replace('T', ' ').substring(0, 19),
    actor: a.actor,
    user: a.actor,
    role: a.role,
    action: a.action,
    activity: a.action,
    target: a.target,
    item: a.target,
    category: a.category,
    badge_class: a.badge_class,
    statusClass: a.badge_class
  };
}

module.exports = {
  logActivity,
  formatActivity
};

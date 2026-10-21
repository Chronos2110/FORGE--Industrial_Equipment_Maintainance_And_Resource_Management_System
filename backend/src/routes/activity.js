const express = require('express');
const router = express.Router();
const { ActivityLog } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { logActivity, formatActivity } = require('../utils/activity');

// GET /api/activity
// Retrieves persistent ISO-55000 audit log entries ordered chronologically
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { category, limit } = req.query;
    const take = limit ? Math.min(200, parseInt(limit, 10)) : 100;
    const filter = {};

    if (category && category !== 'All' && category !== 'ALL') {
      filter.category = category.toUpperCase();
    }

    const logs = await ActivityLog.find(filter)
      .sort({ timestamp: -1 })
      .limit(take);

    return res.json(logs.map(formatActivity));
  } catch (err) {
    console.error('Error fetching activity log:', err);
    return res.status(500).json({ error: 'Failed to retrieve activity log', details: err.message });
  }
});

// POST /api/activity
// Allows authenticated users to write an audit entry (e.g. shift handover notes, manual inspections)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { action, target, category, badge_class, timestamp } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Action description is required.' });
    }

    const entry = await logActivity({
      actor: req.user.name || 'Plant Personnel',
      role: req.user.role || 'OPERATOR',
      action,
      target: target || 'Plant General',
      category: category || 'SYSTEM',
      badge_class: badge_class || 'badge-operational',
      timestamp
    });

    return res.status(201).json(formatActivity(entry));
  } catch (err) {
    console.error('Error recording activity:', err);
    return res.status(500).json({ error: 'Failed to record activity log', details: err.message });
  }
});

module.exports = router;

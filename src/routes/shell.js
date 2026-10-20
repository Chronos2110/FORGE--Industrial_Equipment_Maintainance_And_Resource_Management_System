const express = require('express');
const router = express.Router();
const { equipment, workOrders, inventory, users } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { seedData } = require('../seed');

// GET /api/search?q=<query>
// Feeds the Ctrl+K Command Palette by executing a fast lookup across equipment,
// work_orders, and inventory_parts in MongoDB.
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    if (!query) {
      return res.json({ equipment: [], work_orders: [], inventory_parts: [] });
    }

    const searchRegex = new RegExp(query, 'i');

    // 1. Equipment Search
    const eqMatches = await equipment.find({
      $or: [
        { _id: searchRegex },
        { name: searchRegex },
        { category: searchRegex },
        { bay_location: searchRegex }
      ]
    }).limit(8).toArray();

    // 2. Work Orders Search
    const woMatches = await workOrders.find({
      $or: [
        { _id: searchRegex },
        { title: searchRegex },
        { description: searchRegex }
      ]
    }).limit(8).toArray();

    const enrichedWos = await Promise.all(woMatches.map(async (w) => {
      const eqDoc = w.equipment_id
        ? await equipment.findOne({ $or: [{ _id: w.equipment_id }, { id: w.equipment_id }] })
        : null;

      const tech = w.assigned_to
        ? await users.findOne({ $or: [{ _id: w.assigned_to }, { id: w.assigned_to }] })
        : null;

      return {
        id: w.id || w._id,
        title: w.title,
        status: w.status,
        priority: w.priority,
        equipment: eqDoc ? eqDoc.name : w.equipment_id,
        technician: tech ? tech.name : 'Unassigned'
      };
    }));

    // 3. Inventory Parts Search
    const invMatches = await inventory.find({
      $or: [
        { _id: searchRegex },
        { name: searchRegex },
        { category: searchRegex },
        { storage_bin: searchRegex }
      ]
    }).limit(8).toArray();

    return res.json({
      equipment: eqMatches.map(e => ({
        id: e.id || e._id,
        name: e.name,
        type: e.category,
        location: e.bay_location,
        status: e.status
      })),
      work_orders: enrichedWos,
      inventory_parts: invMatches.map(p => ({
        id: p.id || p._id,
        name: p.name,
        category: p.category,
        quantity: p.quantity_on_hand,
        minStock: p.min_threshold,
        bin: p.storage_bin
      }))
    });
  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: 'Search failed', details: err.message });
  }
});

// GET /api/telemetry/dock
// Feeds the bottom #forgeControlDock badge by returning the live count of open CRITICAL or HIGH work orders
// plus the count of inventory SKUs where quantity_on_hand is below min_threshold.
router.get('/telemetry/dock', authenticateToken, async (req, res) => {
  try {
    // Open CRITICAL or HIGH work orders
    const criticalHighWOs = await workOrders.countDocuments({
      priority: { $in: ['CRITICAL', 'HIGH', 'Critical', 'High'] },
      status: { $nin: ['COMPLETED', 'Completed', 'CANCELLED', 'Cancelled'] }
    });

    // Inventory SKUs where quantity_on_hand <= min_threshold
    const parts = await inventory.find({}).toArray();
    const lowStockParts = parts.filter(p => p.quantity_on_hand <= p.min_threshold);

    const totalBadgeAlerts = criticalHighWOs + lowStockParts.length;

    return res.json({
      criticalHighOrders: criticalHighWOs,
      lowStockPartsCount: lowStockParts.length,
      badgeCount: totalBadgeAlerts,
      alertItems: {
        orders: criticalHighWOs,
        lowStockSKUs: lowStockParts.map(p => ({
          id: p.id || p._id,
          name: p.name,
          quantity: p.quantity_on_hand,
          min: p.min_threshold
        }))
      }
    });
  } catch (err) {
    console.error('Control dock telemetry error:', err);
    return res.status(500).json({ error: 'Failed to retrieve control dock telemetry', details: err.message });
  }
});

// POST /api/dev/reset (Development only)
router.post('/dev/reset', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    await seedData();

    return res.json({
      success: true,
      message: 'Demo database has been successfully reset and seeded to initial factory state in MongoDB.'
    });
  } catch (err) {
    console.error('Dev reset error:', err);
    return res.status(500).json({ error: 'Failed to reset demo database', details: err.message });
  }
});

module.exports = router;

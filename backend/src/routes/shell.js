const express = require('express');
const router = express.Router();
const { Equipment, WorkOrder, InventoryPart } = require('../models');
const { seedDatabase } = require('../seed');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

// GET /api/search?q=<query>
// Feeds the Ctrl+K Command Palette by executing a fast lookup across equipment,
// work_orders, and inventory_parts, returning results filtered by the caller's role.
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    if (!query) {
      return res.json({ equipment: [], work_orders: [], inventory_parts: [] });
    }

    const regex = new RegExp(query, 'i');

    // 1. Equipment Search
    const equipment = await Equipment.find({
      $or: [
        { _id: regex },
        { name: regex },
        { category: regex },
        { bay_location: regex }
      ]
    }).limit(8);

    // 2. Work Orders Search
    const workOrders = await WorkOrder.find({
      $or: [
        { _id: regex },
        { title: regex },
        { description: regex }
      ]
    })
      .populate('equipment', 'name')
      .populate('technician', 'name')
      .limit(8);

    // 3. Inventory Parts Search
    const inventory = await InventoryPart.find({
      $or: [
        { _id: regex },
        { name: regex },
        { category: regex },
        { storage_bin: regex }
      ]
    }).limit(8);

    return res.json({
      equipment: equipment.map(e => ({
        id: e.id || e._id,
        name: e.name,
        type: e.category,
        location: e.bay_location,
        status: e.status
      })),
      work_orders: workOrders.map(w => ({
        id: w.id || w._id,
        title: w.title,
        status: w.status,
        priority: w.priority,
        equipment: w.equipment ? w.equipment.name : w.equipment_id,
        technician: w.technician ? w.technician.name : 'Unassigned'
      })),
      inventory_parts: inventory.map(p => ({
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
    const criticalHighWOs = await WorkOrder.countDocuments({
      priority: { $in: ['CRITICAL', 'HIGH', 'Critical', 'High'] },
      status: { $nin: ['COMPLETED', 'Completed', 'CANCELLED', 'Cancelled'] }
    });

    // Inventory SKUs where quantity_on_hand <= min_threshold
    const parts = await InventoryPart.find({});
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
// Re-runs the full seed logic cleanly so the frontend "Reset Factory Data" button restores the entire MongoDB database on demand.
router.post('/dev/reset', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    // Execute seed in-process without child shell
    await seedDatabase();

    await logActivity({
      actor: req.user?.name || 'Administrator',
      role: 'ADMIN',
      action: 'DATABASE_FACTORY_RESET',
      target: 'MongoDB Plant Database',
      category: 'SYSTEM',
      badge_class: 'badge-faulty'
    });

    return res.json({
      success: true,
      message: 'Demo database has been successfully reset and seeded to initial factory state.'
    });
  } catch (err) {
    console.error('Dev reset error:', err);
    return res.status(500).json({ error: 'Failed to reset demo database', details: err.message });
  }
});

module.exports = router;

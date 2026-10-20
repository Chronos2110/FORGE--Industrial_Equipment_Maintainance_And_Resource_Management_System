const express = require('express');
const router = express.Router();
const { workOrders, equipment, faults, inventory } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// GET /api/analytics/summary
// Admin: full plant metrics (MTTR, MTBF, availability %, trends)
// Technician: personal metrics only
// Operator: 403 Forbidden
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const role = req.user.role;

    if (role === 'OPERATOR') {
      return res.status(403).json({ error: 'Forbidden: Operators do not have access to Analytics telemetry.' });
    }

    // 1. If TECHNICIAN, compute personal metrics
    if (role === 'TECHNICIAN') {
      const myCompleted = await workOrders.find({
        assigned_to: req.user.id,
        status: 'COMPLETED',
        completed_at: { $ne: null }
      }).toArray();

      const myActive = await workOrders.countDocuments({
        assigned_to: req.user.id,
        status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_PARTS'] }
      });

      let totalRepairHours = 0;
      myCompleted.forEach(wo => {
        if (wo.completed_at && wo.created_at) {
          const diffMs = new Date(wo.completed_at) - new Date(wo.created_at);
          totalRepairHours += Math.max(0.5, diffMs / (1000 * 60 * 60));
        }
      });

      const personalMttr = myCompleted.length > 0 ? (totalRepairHours / myCompleted.length).toFixed(1) : '3.5';

      return res.json({
        scope: 'PERSONAL',
        technicianName: req.user.name,
        activeWorkOrders: myActive,
        completedWorkOrders: myCompleted.length,
        personalMTTRHours: parseFloat(personalMttr),
        completionRate: myCompleted.length + myActive > 0 ? Math.round((myCompleted.length / (myCompleted.length + myActive)) * 100) : 100
      });
    }

    // 2. Administrator: Full Plant Analytics
    const allEquipment = await equipment.find({}).toArray();
    const totalEq = allEquipment.length;
    const operationalEq = allEquipment.filter(e => e.status === 'OPERATIONAL').length;
    const maintenanceEq = allEquipment.filter(e => e.status === 'MAINTENANCE').length;
    const downEq = allEquipment.filter(e => e.status === 'DOWN' || e.status === 'WARNING').length;

    const availabilityPct = totalEq > 0 ? Math.round((operationalEq / totalEq) * 100) : 100;

    // Completed Work Orders for MTTR calculation
    const completedOrders = await workOrders.find({
      status: 'COMPLETED',
      completed_at: { $ne: null }
    }).toArray();

    let totalRepairTimeHours = 0;
    completedOrders.forEach(wo => {
      const diffMs = new Date(wo.completed_at) - new Date(wo.created_at);
      totalRepairTimeHours += Math.max(0.5, diffMs / (1000 * 60 * 60));
    });

    const mttrHours = completedOrders.length > 0 ? (totalRepairTimeHours / completedOrders.length).toFixed(1) : '4.2';

    // MTBF (Mean Time Between Failures)
    const totalFaults = await faults.countDocuments({});
    const baseOperatingHours = totalEq * 720; // 30 days * 24 hours per machine
    const breakdownCount = Math.max(1, totalFaults);
    const mtbfHours = Math.round(baseOperatingHours / breakdownCount);

    // Open Orders
    const openOrdersCount = await workOrders.countDocuments({
      status: { $in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_PARTS'] }
    });

    // Low stock inventory count
    const allParts = await inventory.find({}).toArray();
    const lowStockCount = allParts.filter(p => p.quantity_on_hand <= p.min_threshold).length;

    // Trend: work orders completed over time
    const completionTrends = completedOrders.map(wo => ({
      id: wo.id || wo._id,
      title: wo.title,
      completedDate: wo.completed_at ? new Date(wo.completed_at).toISOString().split('T')[0] : '',
      durationHours: wo.completed_at ? ((new Date(wo.completed_at) - new Date(wo.created_at)) / (1000 * 3600)).toFixed(1) : '0'
    }));

    return res.json({
      scope: 'PLANT_WIDE',
      totalEquipment: totalEq,
      operationalEquipment: operationalEq,
      maintenanceEquipment: maintenanceEq,
      downEquipment: downEq,
      equipmentAvailabilityPct: availabilityPct,
      mttrHours: parseFloat(mttrHours),
      mtbfHours: mtbfHours,
      openWorkOrders: openOrdersCount,
      completedWorkOrders: completedOrders.length,
      lowStockSKUs: lowStockCount,
      completionTrends
    });
  } catch (err) {
    console.error('Analytics error:', err);
    return res.status(500).json({ error: 'Failed to compute analytics summary', details: err.message });
  }
});

module.exports = router;

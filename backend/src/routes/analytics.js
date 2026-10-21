const express = require('express');
const router = express.Router();
const { WorkOrder, Equipment, FaultReport, InventoryPart, ActivityLog } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { formatActivity } = require('../utils/activity');

// GET /api/analytics/summary
// Admin: full plant metrics (MTTR, MTBF, availability %, trends, recent activity)
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
      const myCompleted = await WorkOrder.find({
        assigned_to: req.user.id,
        status: 'COMPLETED',
        completed_at: { $ne: null }
      });

      const myActive = await WorkOrder.countDocuments({
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

      const recentPersonalActivity = await ActivityLog.find({
        $or: [
          { actor: req.user.name },
          { actor: req.user.email }
        ]
      })
        .sort({ timestamp: -1 })
        .limit(10);

      return res.json({
        scope: 'PERSONAL',
        technicianName: req.user.name,
        activeWorkOrders: myActive,
        completedWorkOrders: myCompleted.length,
        personalMTTRHours: parseFloat(personalMttr),
        completionRate: myCompleted.length + myActive > 0 ? Math.round((myCompleted.length / (myCompleted.length + myActive)) * 100) : 100,
        recentActivity: recentPersonalActivity.map(formatActivity)
      });
    }

    // 2. Administrator: Full Plant Analytics
    const equipment = await Equipment.find({});
    const totalEq = equipment.length;
    const operationalEq = equipment.filter(e => e.status === 'OPERATIONAL').length;
    const maintenanceEq = equipment.filter(e => e.status === 'MAINTENANCE').length;
    const downEq = equipment.filter(e => e.status === 'DOWN' || e.status === 'WARNING').length;

    const availabilityPct = totalEq > 0 ? Math.round((operationalEq / totalEq) * 100) : 100;

    // Completed Work Orders for MTTR calculation
    const completedOrders = await WorkOrder.find({
      status: 'COMPLETED',
      completed_at: { $ne: null }
    });

    let totalRepairTimeHours = 0;
    completedOrders.forEach(wo => {
      const diffMs = new Date(wo.completed_at) - new Date(wo.created_at);
      totalRepairTimeHours += Math.max(0.5, diffMs / (1000 * 60 * 60));
    });

    const mttrHours = completedOrders.length > 0 ? (totalRepairTimeHours / completedOrders.length).toFixed(1) : '4.2';

    // MTBF (Mean Time Between Failures)
    // Operating time divided by total breakdown count
    const totalFaults = await FaultReport.countDocuments({});
    const baseOperatingHours = totalEq * 720; // 30 days * 24 hours per machine
    const breakdownCount = Math.max(1, totalFaults);
    const mtbfHours = Math.round(baseOperatingHours / breakdownCount);

    // Open Orders
    const openOrdersCount = await WorkOrder.countDocuments({
      status: { $in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_PARTS'] }
    });

    // Low stock inventory count
    const allParts = await InventoryPart.find({});
    const lowStockCount = allParts.filter(p => p.quantity_on_hand <= p.min_threshold).length;

    // Trend: work orders completed over time
    const completionTrends = completedOrders.map(wo => ({
      id: wo.id || wo._id,
      title: wo.title,
      completedDate: wo.completed_at ? new Date(wo.completed_at).toISOString().split('T')[0] : '',
      durationHours: wo.completed_at ? ((new Date(wo.completed_at) - new Date(wo.created_at)) / (1000 * 3600)).toFixed(1) : '0'
    }));

    // Recent ISO-55000 audit logs
    const recentLogs = await ActivityLog.find()
      .sort({ timestamp: -1 })
      .limit(20);

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
      completionTrends,
      recentActivity: recentLogs.map(formatActivity)
    });
  } catch (err) {
    console.error('Analytics error:', err);
    return res.status(500).json({ error: 'Failed to compute analytics summary', details: err.message });
  }
});

module.exports = router;

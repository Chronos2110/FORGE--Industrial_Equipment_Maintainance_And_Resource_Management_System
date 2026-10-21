const express = require('express');
const router = express.Router();
const { FaultReport, Equipment, WorkOrder, User } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

// Format Fault Report for front-end consumption
function formatFault(f) {
  if (!f) return null;
  const eqName = f.equipment ? (f.equipment.name || f.equipment) : f.equipment_id;
  const reporterName = f.reporter ? (f.reporter.name || f.reporter) : f.reported_by;
  return {
    id: f.id || f._id,
    equipmentId: f.equipment_id,
    equipmentName: eqName,
    equipment: eqName,
    reportedBy: reporterName,
    severity: f.severity,
    priority: f.severity === 'CRITICAL' ? 'High' : (f.severity === 'HIGH' ? 'High' : (f.severity === 'MEDIUM' ? 'Medium' : 'Low')),
    description: f.description,
    status: f.status === 'CONVERTED_TO_WO' ? 'Converted to WO' : (f.status === 'REPORTED' ? 'Open' : f.status),
    linked_wo_id: f.linked_wo_id,
    workOrderId: f.linked_wo_id || '',
    createdAt: f.created_at,
    created_at: f.created_at
  };
}

// GET /api/faults
// Accessible by: ADMIN, TECHNICIAN, OPERATOR
router.get('/', authenticateToken, async (req, res) => {
  try {
    const faults = await FaultReport.find()
      .sort({ created_at: -1 })
      .populate('equipment')
      .populate('reporter', 'id name role')
      .populate('work_order');

    return res.json(faults.map(formatFault));
  } catch (err) {
    console.error('Error fetching faults:', err);
    return res.status(500).json({ error: 'Failed to retrieve faults', details: err.message });
  }
});

// GET /api/faults/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const fault = await FaultReport.findById(req.params.id)
      .populate('equipment')
      .populate('reporter', 'id name role')
      .populate('work_order');

    if (!fault) {
      return res.status(404).json({ error: `Fault report ${req.params.id} not found.` });
    }

    return res.json(formatFault(fault));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve fault report', details: err.message });
  }
});

// POST /api/faults (Used by Operator Control Dock FAULT modal)
// Accessible by: OPERATOR, TECHNICIAN, ADMIN
// Automatically sets equipment status to WARNING or DOWN if severity is CRITICAL
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { id, equipment_id, equipmentName, severity, priority, description } = req.body;

    const faultSeverity = (severity || priority || 'MEDIUM').toUpperCase();
    const faultDesc = description || 'Operator reported abnormal behavior';

    // Resolve equipment_id
    let resolvedEquipmentId = equipment_id;
    if (!resolvedEquipmentId && equipmentName) {
      const eq = await Equipment.findOne({
        $or: [{ _id: equipmentName }, { name: equipmentName }]
      });
      if (eq) resolvedEquipmentId = eq._id || eq.id;
    }

    if (!resolvedEquipmentId) {
      return res.status(400).json({ error: 'Equipment ID or Equipment Name is required.' });
    }

    const faultId = id || `FLT-${Math.floor(100 + Math.random() * 900)}`;

    const fault = await FaultReport.create({
      _id: faultId,
      equipment_id: resolvedEquipmentId,
      reported_by: req.user.id,
      severity: faultSeverity,
      description: faultDesc,
      status: 'REPORTED'
    });

    // Automatically update equipment status based on fault severity
    if (faultSeverity === 'CRITICAL') {
      await Equipment.findByIdAndUpdate(resolvedEquipmentId, {
        status: 'DOWN',
        $inc: { health_score: -25 }
      });
    } else if (faultSeverity === 'HIGH') {
      await Equipment.findByIdAndUpdate(resolvedEquipmentId, {
        status: 'WARNING',
        $inc: { health_score: -15 }
      });
    }

    const populated = await FaultReport.findById(fault._id)
      .populate('equipment')
      .populate('reporter', 'id name role');

    await logActivity({
      actor: req.user?.name || 'Operator',
      role: req.user?.role || 'OPERATOR',
      action: 'REPORTED_FAULT',
      target: `${populated.id || populated._id} - ${populated.equipment?.name || resolvedEquipmentId} [${faultSeverity}]`,
      category: 'FAULTS',
      badge_class: 'badge-faulty'
    });

    return res.status(201).json(formatFault(populated));
  } catch (err) {
    console.error('Error reporting fault:', err);
    return res.status(500).json({ error: 'Failed to record fault report', details: err.message });
  }
});

// POST /api/faults/:id/escalate (Creates a linked Work Order from the fault)
// Accessible by: ADMIN and TECHNICIAN
router.post('/:id/escalate', authenticateToken, requireRole(['ADMIN', 'TECHNICIAN']), async (req, res) => {
  try {
    const { id } = req.params;

    const fault = await FaultReport.findById(id).populate('equipment');

    if (!fault) {
      return res.status(404).json({ error: `Fault report ${id} not found.` });
    }

    if (fault.linked_wo_id) {
      return res.status(400).json({
        error: `Fault ${id} has already been escalated to Work Order ${fault.linked_wo_id}.`
      });
    }

    const newWoId = `WO-${Math.floor(100 + Math.random() * 900)}`;
    const woPriority = fault.severity === 'CRITICAL' ? 'CRITICAL' : (fault.severity === 'HIGH' ? 'HIGH' : 'MEDIUM');
    const eqName = fault.equipment ? fault.equipment.name : fault.equipment_id;

    // 1. Create linked Work Order
    const createdWo = await WorkOrder.create({
      _id: newWoId,
      title: `Fault Escalation: ${eqName}`,
      description: fault.description,
      priority: woPriority,
      status: 'OPEN',
      equipment_id: fault.equipment_id,
      created_by: req.user.id
    });

    // 2. Update fault report
    const updatedFault = await FaultReport.findByIdAndUpdate(
      id,
      {
        status: 'CONVERTED_TO_WO',
        linked_wo_id: createdWo._id || createdWo.id
      },
      { returnDocument: 'after' }
    )
      .populate('equipment')
      .populate('reporter', 'id name role')
      .populate('work_order');

    // 3. Update equipment status to MAINTENANCE
    await Equipment.findByIdAndUpdate(fault.equipment_id, {
      status: 'MAINTENANCE'
    });

    await logActivity({
      actor: req.user?.name || 'Dispatcher',
      role: req.user?.role || 'TECHNICIAN',
      action: 'ESCALATED_FAULT_TO_WO',
      target: `${id} -> ${createdWo._id || createdWo.id} (${eqName})`,
      category: 'FAULTS',
      badge_class: 'badge-maintenance'
    });

    return res.json({
      success: true,
      message: `Fault ${id} successfully escalated to Work Order ${createdWo._id || createdWo.id}.`,
      workOrder: createdWo,
      fault: formatFault(updatedFault)
    });
  } catch (err) {
    console.error('Error escalating fault:', err);
    return res.status(500).json({ error: 'Failed to escalate fault to work order', details: err.message });
  }
});

// DELETE /api/faults/:id (Admin only)
router.delete('/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await FaultReport.findById(id);
    if (!existing) {
      return res.status(404).json({ error: `Fault report ${id} not found.` });
    }

    await FaultReport.findByIdAndDelete(id);

    await logActivity({
      actor: req.user?.name || 'Administrator',
      role: 'ADMIN',
      action: 'DISMISSED_FAULT_REPORT',
      target: id,
      category: 'FAULTS',
      badge_class: 'badge-operational'
    });

    return res.json({ success: true, message: `Fault report ${id} deleted.` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete fault report', details: err.message });
  }
});

module.exports = router;

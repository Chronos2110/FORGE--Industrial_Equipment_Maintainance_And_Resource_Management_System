const express = require('express');
const router = express.Router();
const { faults, equipment, users, workOrders } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Format and enrich Fault Report for front-end consumption
async function enrichFault(f) {
  if (!f) return null;

  const eq = f.equipment_id
    ? await equipment.findOne({ $or: [{ _id: f.equipment_id }, { id: f.equipment_id }] })
    : null;

  const reporter = f.reported_by
    ? await users.findOne({ $or: [{ _id: f.reported_by }, { id: f.reported_by }] })
    : null;

  return {
    id: f.id || f._id,
    equipmentId: f.equipment_id,
    equipmentName: eq ? eq.name : f.equipment_id,
    equipment: eq ? eq.name : f.equipment_id,
    reportedBy: reporter ? reporter.name : f.reported_by,
    severity: f.severity,
    priority: f.severity === 'CRITICAL' || f.severity === 'HIGH' ? 'High' : (f.severity === 'MEDIUM' ? 'Medium' : 'Low'),
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
    const raw = await faults.find({}).sort({ created_at: -1 }).toArray();
    const formatted = await Promise.all(raw.map(enrichFault));

    return res.json(formatted);
  } catch (err) {
    console.error('Error fetching faults:', err);
    return res.status(500).json({ error: 'Failed to retrieve faults', details: err.message });
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
      const eqDoc = await equipment.findOne({
        $or: [{ _id: equipmentName }, { id: equipmentName }, { name: equipmentName }]
      });
      if (eqDoc) resolvedEquipmentId = eqDoc._id;
    }

    if (!resolvedEquipmentId) {
      return res.status(400).json({ error: 'Equipment ID or Equipment Name is required.' });
    }

    const faultId = id || `FLT-${Math.floor(100 + Math.random() * 900)}`;

    const faultDoc = {
      _id: faultId,
      id: faultId,
      equipment_id: resolvedEquipmentId,
      reported_by: req.user.id,
      severity: faultSeverity,
      description: faultDesc,
      status: 'REPORTED',
      linked_wo_id: null,
      created_at: new Date()
    };

    await faults.insertOne(faultDoc);

    // Automatically update equipment status based on fault severity
    if (faultSeverity === 'CRITICAL') {
      await equipment.updateOne(
        { $or: [{ _id: resolvedEquipmentId }, { id: resolvedEquipmentId }] },
        {
          $set: { status: 'DOWN' },
          $inc: { health_score: -25 }
        }
      );
    } else if (faultSeverity === 'HIGH') {
      await equipment.updateOne(
        { $or: [{ _id: resolvedEquipmentId }, { id: resolvedEquipmentId }] },
        {
          $set: { status: 'WARNING' },
          $inc: { health_score: -15 }
        }
      );
    }

    const formatted = await enrichFault(faultDoc);
    return res.status(201).json(formatted);
  } catch (err) {
    console.error('Error reporting fault:', err);
    return res.status(500).json({ error: 'Failed to record fault report', details: err.message });
  }
});

// POST /api/faults/:id/escalate (Creates a linked Work Order from the fault)
// Accessible by: ADMIN and TECHNICIAN
router.post('/:id/escalate', authenticateToken, requireRole(['ADMIN', 'TECHNICIAN']), async (req, res) => {
  try {
    const id = req.params.id;
    const fault = await faults.findOne({
      $or: [{ _id: id }, { id }]
    });

    if (!fault) {
      return res.status(404).json({ error: `Fault report ${id} not found.` });
    }

    if (fault.linked_wo_id) {
      return res.status(400).json({
        error: `Fault ${id} has already been escalated to Work Order ${fault.linked_wo_id}.`
      });
    }

    const eqDoc = await equipment.findOne({
      $or: [{ _id: fault.equipment_id }, { id: fault.equipment_id }]
    });

    const newWoId = `WO-${Math.floor(100 + Math.random() * 900)}`;
    const woPriority = fault.severity === 'CRITICAL' ? 'CRITICAL' : (fault.severity === 'HIGH' ? 'HIGH' : 'MEDIUM');

    const createdWo = {
      _id: newWoId,
      id: newWoId,
      title: `Fault Escalation: ${eqDoc ? eqDoc.name : fault.equipment_id}`,
      description: fault.description,
      priority: woPriority,
      status: 'OPEN',
      equipment_id: fault.equipment_id,
      assigned_to: null,
      created_by: req.user.id,
      parts_required: [],
      created_at: new Date(),
      completed_at: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await workOrders.insertOne(createdWo);

    await faults.updateOne(
      { $or: [{ _id: id }, { id }] },
      {
        $set: {
          status: 'CONVERTED_TO_WO',
          linked_wo_id: createdWo._id
        }
      }
    );

    await equipment.updateOne(
      { $or: [{ _id: fault.equipment_id }, { id: fault.equipment_id }] },
      { $set: { status: 'MAINTENANCE' } }
    );

    const updatedFault = await faults.findOne({ $or: [{ _id: id }, { id }] });
    const formattedFault = await enrichFault(updatedFault);

    return res.json({
      success: true,
      message: `Fault ${id} successfully escalated to Work Order ${createdWo._id}.`,
      workOrder: createdWo,
      fault: formattedFault
    });
  } catch (err) {
    console.error('Error escalating fault:', err);
    return res.status(500).json({ error: 'Failed to escalate fault to work order', details: err.message });
  }
});

module.exports = router;

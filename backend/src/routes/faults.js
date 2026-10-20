const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Format Fault Report for front-end consumption
function formatFault(f) {
  return {
    id: f.id,
    equipmentId: f.equipment_id,
    equipmentName: f.equipment ? f.equipment.name : f.equipment_id,
    equipment: f.equipment ? f.equipment.name : f.equipment_id,
    reportedBy: f.reporter ? f.reporter.name : f.reported_by,
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
    const faults = await prisma.faultReport.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        equipment: true,
        reporter: { select: { id: true, name: true, role: true } },
        work_order: true
      }
    });

    return res.json(faults.map(formatFault));
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
      const eq = await prisma.equipment.findFirst({
        where: {
          OR: [{ id: equipmentName }, { name: equipmentName }]
        }
      });
      if (eq) resolvedEquipmentId = eq.id;
    }

    if (!resolvedEquipmentId) {
      return res.status(400).json({ error: 'Equipment ID or Equipment Name is required.' });
    }

    const faultId = id || `FLT-${Math.floor(100 + Math.random() * 900)}`;

    const result = await prisma.$transaction(async (tx) => {
      const fault = await tx.faultReport.create({
        data: {
          id: faultId,
          equipment_id: resolvedEquipmentId,
          reported_by: req.user.id,
          severity: faultSeverity,
          description: faultDesc,
          status: 'REPORTED'
        },
        include: {
          equipment: true,
          reporter: true
        }
      });

      // Automatically update equipment status based on fault severity
      if (faultSeverity === 'CRITICAL') {
        await tx.equipment.update({
          where: { id: resolvedEquipmentId },
          data: { status: 'DOWN', health_score: { decrement: 25 } }
        });
      } else if (faultSeverity === 'HIGH') {
        await tx.equipment.update({
          where: { id: resolvedEquipmentId },
          data: { status: 'WARNING', health_score: { decrement: 15 } }
        });
      }

      return fault;
    });

    return res.status(201).json(formatFault(result));
  } catch (err) {
    console.error('Error reporting fault:', err);
    return res.status(500).json({ error: 'Failed to record fault report', details: err.message });
  }
});

// POST /api/faults/:id/escalate (Creates a linked Work Order from the fault inside a single transaction)
// Accessible by: ADMIN and TECHNICIAN
router.post('/:id/escalate', authenticateToken, requireRole(['ADMIN', 'TECHNICIAN']), async (req, res) => {
  try {
    const { id } = req.params;

    const fault = await prisma.faultReport.findUnique({
      where: { id },
      include: { equipment: true }
    });

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

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create linked Work Order
      const createdWo = await tx.workOrder.create({
        data: {
          id: newWoId,
          title: `Fault Escalation: ${fault.equipment.name}`,
          description: fault.description,
          priority: woPriority,
          status: 'OPEN',
          equipment_id: fault.equipment_id,
          created_by: req.user.id
        }
      });

      // 2. Update fault report
      const updatedFault = await tx.faultReport.update({
        where: { id },
        data: {
          status: 'CONVERTED_TO_WO',
          linked_wo_id: createdWo.id
        },
        include: { equipment: true, reporter: true, work_order: true }
      });

      // 3. Update equipment status to MAINTENANCE
      await tx.equipment.update({
        where: { id: fault.equipment_id },
        data: { status: 'MAINTENANCE' }
      });

      return {
        workOrder: createdWo,
        fault: updatedFault
      };
    });

    return res.json({
      success: true,
      message: `Fault ${id} successfully escalated to Work Order ${result.workOrder.id}.`,
      workOrder: result.workOrder,
      fault: formatFault(result.fault)
    });
  } catch (err) {
    console.error('Error escalating fault:', err);
    return res.status(500).json({ error: 'Failed to escalate fault to work order', details: err.message });
  }
});

module.exports = router;

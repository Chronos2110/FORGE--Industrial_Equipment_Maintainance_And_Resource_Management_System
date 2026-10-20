const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Format maintenance schedule for front-end compatibility
function formatMaintenance(m) {
  return {
    id: m.id,
    task_name: m.task_name,
    type: m.task_name,
    frequency_days: m.frequency_days,
    next_due_date: m.next_due_date,
    scheduledDate: m.next_due_date ? m.next_due_date.toISOString().split('T')[0] : '',
    compliance_status: m.compliance_status,
    status: m.compliance_status === 'SCHEDULED' ? 'Scheduled' : (m.compliance_status === 'COMPLETED' ? 'Completed' : 'Overdue'),
    equipmentId: m.equipment_id,
    equipment: m.equipment ? m.equipment.name : m.equipment_id,
    equipmentObj: m.equipment,
    technicianId: m.assigned_tech_id,
    technician: m.assigned_tech ? m.assigned_tech.name : 'Unassigned',
    technicianObj: m.assigned_tech
  };
}

// GET /api/maintenance
// Accessible by: ADMIN, TECHNICIAN, OPERATOR
router.get('/', authenticateToken, async (req, res) => {
  try {
    const schedules = await prisma.maintenanceSchedule.findMany({
      orderBy: { next_due_date: 'asc' },
      include: {
        equipment: true,
        assigned_tech: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    return res.json(schedules.map(formatMaintenance));
  } catch (err) {
    console.error('Error fetching maintenance:', err);
    return res.status(500).json({ error: 'Failed to retrieve maintenance schedules', details: err.message });
  }
});

// POST /api/maintenance (Admin only)
router.post('/', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id, task_name, type, frequency_days, next_due_date, scheduledDate, equipment_id, equipment, assigned_tech_id, technician } = req.body;

    const pmId = id || `PM-${Math.floor(100 + Math.random() * 900)}`;
    const taskName = task_name || type || 'Routine Inspection';
    const freq = frequency_days ? parseInt(frequency_days) : 30;
    const dueDate = next_due_date || scheduledDate ? new Date(next_due_date || scheduledDate) : new Date(Date.now() + freq * 24 * 60 * 60 * 1000);

    // Resolve equipment_id
    let resolvedEquipmentId = equipment_id;
    if (!resolvedEquipmentId && equipment) {
      const eq = await prisma.equipment.findFirst({
        where: {
          OR: [{ id: equipment }, { name: equipment }]
        }
      });
      if (eq) resolvedEquipmentId = eq.id;
    }

    if (!resolvedEquipmentId) {
      return res.status(400).json({ error: 'Valid equipment_id is required.' });
    }

    // Resolve technician
    let resolvedTechId = assigned_tech_id;
    if (!resolvedTechId && technician) {
      const tech = await prisma.user.findFirst({
        where: {
          OR: [{ id: technician }, { name: technician }]
        }
      });
      if (tech) resolvedTechId = tech.id;
    }

    const created = await prisma.maintenanceSchedule.create({
      data: {
        id: pmId,
        task_name: taskName,
        frequency_days: freq,
        next_due_date: dueDate,
        compliance_status: 'SCHEDULED',
        equipment_id: resolvedEquipmentId,
        assigned_tech_id: resolvedTechId || null
      },
      include: {
        equipment: true,
        assigned_tech: true
      }
    });

    return res.status(201).json(formatMaintenance(created));
  } catch (err) {
    console.error('Error creating maintenance schedule:', err);
    return res.status(500).json({ error: 'Failed to create maintenance schedule', details: err.message });
  }
});

// PATCH /api/maintenance/:id (Admin and Technician)
router.patch('/:id', authenticateToken, requireRole(['ADMIN', 'TECHNICIAN']), async (req, res) => {
  try {
    const { id } = req.params;
    const { task_name, compliance_status, status, next_due_date, scheduledDate, frequency_days, assigned_tech_id } = req.body;

    const current = await prisma.maintenanceSchedule.findUnique({
      where: { id },
      include: { equipment: true }
    });

    if (!current) {
      return res.status(404).json({ error: `Maintenance schedule ${id} not found.` });
    }

    const data = {};
    if (task_name) data.task_name = task_name;
    if (frequency_days) data.frequency_days = parseInt(frequency_days);

    const compStatus = (compliance_status || status || '').toUpperCase();
    if (compStatus) {
      if (compStatus === 'COMPLETED') {
        data.compliance_status = 'COMPLETED';
        // Auto-update equipment last serviced date
        await prisma.equipment.update({
          where: { id: current.equipment_id },
          data: { last_serviced_at: new Date() }
        });
      } else if (compStatus === 'OVERDUE') {
        data.compliance_status = 'OVERDUE';
      } else {
        data.compliance_status = 'SCHEDULED';
      }
    }

    if (next_due_date || scheduledDate) {
      data.next_due_date = new Date(next_due_date || scheduledDate);
    }

    if (assigned_tech_id) {
      data.assigned_tech_id = assigned_tech_id;
    }

    const updated = await prisma.maintenanceSchedule.update({
      where: { id },
      data,
      include: { equipment: true, assigned_tech: true }
    });

    return res.json(formatMaintenance(updated));
  } catch (err) {
    console.error('Error updating maintenance schedule:', err);
    return res.status(500).json({ error: 'Failed to update maintenance schedule', details: err.message });
  }
});

// DELETE /api/maintenance/:id (Admin only)
router.delete('/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.maintenanceSchedule.delete({ where: { id } });
    return res.json({ success: true, message: `Maintenance task ${id} deleted.` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete maintenance task', details: err.message });
  }
});

module.exports = router;

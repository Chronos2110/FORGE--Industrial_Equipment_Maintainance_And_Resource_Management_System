const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

// Format maintenance schedule for front-end compatibility
function formatMaintenance(m) {
  if (!m) return null;
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

// GET /api/maintenance/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const schedule = await prisma.maintenanceSchedule.findUnique({
      where: { id: req.params.id },
      include: {
        equipment: true,
        assigned_tech: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!schedule) {
      return res.status(404).json({ error: `Maintenance schedule ${req.params.id} not found.` });
    }

    return res.json(formatMaintenance(schedule));
  } catch (err) {
    console.error('Error fetching maintenance schedule:', err);
    return res.status(500).json({ error: 'Failed to retrieve maintenance schedule', details: err.message });
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

    await logActivity({
      actor: req.user?.name || 'Administrator',
      role: req.user?.role || 'ADMIN',
      action: 'SCHEDULED_PM',
      target: `${created.id} - ${created.task_name} (${created.equipment?.name || resolvedEquipmentId})`,
      category: 'MAINTENANCE',
      badge_class: 'badge-scheduled'
    });

    return res.status(201).json(formatMaintenance(created));
  } catch (err) {
    console.error('Error creating maintenance schedule:', err);
    return res.status(500).json({ error: 'Failed to create maintenance schedule', details: err.message });
  }
});

// PATCH /api/maintenance/:id (Admin and Technician)
// When marked COMPLETED, automatically reschedules next_due_date by +frequency_days (default 30 days)
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
    const freq = frequency_days ? parseInt(frequency_days) : current.frequency_days;
    if (frequency_days) data.frequency_days = freq;

    const compStatus = (compliance_status || status || '').toUpperCase();
    let wasCompleted = false;

    if (compStatus) {
      if (compStatus === 'COMPLETED') {
        data.compliance_status = 'COMPLETED';
        wasCompleted = true;

        // Auto-update equipment last serviced date
        await prisma.equipment.update({
          where: { id: current.equipment_id },
          data: { last_serviced_at: new Date() }
        });

        // Auto-reschedule next_due_date by +frequency_days if not explicitly specified
        if (!next_due_date && !scheduledDate) {
          const daysToAdd = freq || 30;
          data.next_due_date = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
        }
      } else if (compStatus === 'OVERDUE') {
        data.compliance_status = 'OVERDUE';
      } else {
        data.compliance_status = 'SCHEDULED';
      }
    }

    if (next_due_date || scheduledDate) {
      data.next_due_date = new Date(next_due_date || scheduledDate);
    }

    if (assigned_tech_id !== undefined) {
      data.assigned_tech_id = assigned_tech_id || null;
    }

    const updated = await prisma.maintenanceSchedule.update({
      where: { id },
      data,
      include: { equipment: true, assigned_tech: true }
    });

    if (wasCompleted) {
      await logActivity({
        actor: req.user?.name || req.user?.email || 'Plant Technician',
        role: req.user?.role || 'TECHNICIAN',
        action: 'COMPLETED_PM',
        target: `${updated.id} - ${updated.task_name} (${updated.equipment?.name || current.equipment_id})`,
        category: 'MAINTENANCE',
        badge_class: 'badge-operational'
      });
    } else {
      await logActivity({
        actor: req.user?.name || req.user?.email || 'Plant Operator',
        role: req.user?.role || 'TECHNICIAN',
        action: 'UPDATED_PM',
        target: `${updated.id} - ${updated.task_name}`,
        category: 'MAINTENANCE',
        badge_class: 'badge-scheduled'
      });
    }

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
    const current = await prisma.maintenanceSchedule.findUnique({ where: { id } });
    if (!current) {
      return res.status(404).json({ error: `Maintenance task ${id} not found.` });
    }

    await prisma.maintenanceSchedule.delete({ where: { id } });

    await logActivity({
      actor: req.user?.name || 'Administrator',
      role: req.user?.role || 'ADMIN',
      action: 'DELETED_PM',
      target: `${id} - ${current.task_name}`,
      category: 'MAINTENANCE',
      badge_class: 'badge-maintenance'
    });

    return res.json({ success: true, message: `Maintenance task ${id} deleted.` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete maintenance task', details: err.message });
  }
});

module.exports = router;

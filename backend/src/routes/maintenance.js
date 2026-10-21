const express = require('express');
const router = express.Router();
const { MaintenanceSchedule, Equipment, User } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

// Format maintenance schedule for front-end compatibility
function formatMaintenance(m) {
  if (!m) return null;
  const eqName = m.equipment ? (m.equipment.name || m.equipment) : m.equipment_id;
  const techName = m.assigned_tech ? (m.assigned_tech.name || m.assigned_tech) : 'Unassigned';
  return {
    id: m.id || m._id,
    task_name: m.task_name,
    type: m.task_name,
    frequency_days: m.frequency_days,
    next_due_date: m.next_due_date,
    scheduledDate: m.next_due_date ? new Date(m.next_due_date).toISOString().split('T')[0] : '',
    compliance_status: m.compliance_status,
    status: m.compliance_status === 'SCHEDULED' ? 'Scheduled' : (m.compliance_status === 'COMPLETED' ? 'Completed' : 'Overdue'),
    equipmentId: m.equipment_id,
    equipment: eqName,
    equipmentObj: m.equipment,
    technicianId: m.assigned_tech_id,
    technician: techName,
    technicianObj: m.assigned_tech
  };
}

// GET /api/maintenance
// Accessible by: ADMIN, TECHNICIAN, OPERATOR
router.get('/', authenticateToken, async (req, res) => {
  try {
    const schedules = await MaintenanceSchedule.find()
      .sort({ next_due_date: 1 })
      .populate('equipment')
      .populate('assigned_tech', 'id name email');

    return res.json(schedules.map(formatMaintenance));
  } catch (err) {
    console.error('Error fetching maintenance:', err);
    return res.status(500).json({ error: 'Failed to retrieve maintenance schedules', details: err.message });
  }
});

// GET /api/maintenance/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const schedule = await MaintenanceSchedule.findById(req.params.id)
      .populate('equipment')
      .populate('assigned_tech', 'id name email');

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
      const eq = await Equipment.findOne({
        $or: [{ _id: equipment }, { name: equipment }]
      });
      if (eq) resolvedEquipmentId = eq._id || eq.id;
    }

    if (!resolvedEquipmentId) {
      return res.status(400).json({ error: 'Valid equipment_id is required.' });
    }

    // Resolve technician
    let resolvedTechId = assigned_tech_id;
    if (!resolvedTechId && technician) {
      const tech = await User.findOne({
        $or: [{ _id: technician }, { name: technician }, { email: technician }]
      });
      if (tech) resolvedTechId = tech._id || tech.id;
    }

    const created = await MaintenanceSchedule.create({
      _id: pmId,
      task_name: taskName,
      frequency_days: freq,
      next_due_date: dueDate,
      compliance_status: 'SCHEDULED',
      equipment_id: resolvedEquipmentId,
      assigned_tech_id: resolvedTechId || null
    });

    const populated = await MaintenanceSchedule.findById(created._id)
      .populate('equipment')
      .populate('assigned_tech', 'id name email');

    await logActivity({
      actor: req.user?.name || 'Administrator',
      role: req.user?.role || 'ADMIN',
      action: 'SCHEDULED_PM',
      target: `${populated.id || populated._id} - ${populated.task_name} (${populated.equipment?.name || resolvedEquipmentId})`,
      category: 'MAINTENANCE',
      badge_class: 'badge-scheduled'
    });

    return res.status(201).json(formatMaintenance(populated));
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

    const current = await MaintenanceSchedule.findById(id).populate('equipment');

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
        await Equipment.findByIdAndUpdate(current.equipment_id, {
          last_serviced_at: new Date()
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

    const updated = await MaintenanceSchedule.findByIdAndUpdate(id, data, { returnDocument: 'after' })
      .populate('equipment')
      .populate('assigned_tech', 'id name email');

    if (wasCompleted) {
      await logActivity({
        actor: req.user?.name || req.user?.email || 'Plant Technician',
        role: req.user?.role || 'TECHNICIAN',
        action: 'COMPLETED_PM',
        target: `${updated.id || updated._id} - ${updated.task_name} (${updated.equipment?.name || current.equipment_id})`,
        category: 'MAINTENANCE',
        badge_class: 'badge-operational'
      });
    } else {
      await logActivity({
        actor: req.user?.name || req.user?.email || 'Plant Operator',
        role: req.user?.role || 'TECHNICIAN',
        action: 'UPDATED_PM',
        target: `${updated.id || updated._id} - ${updated.task_name}`,
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
    const current = await MaintenanceSchedule.findById(id);
    if (!current) {
      return res.status(404).json({ error: `Maintenance task ${id} not found.` });
    }

    await MaintenanceSchedule.findByIdAndDelete(id);

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

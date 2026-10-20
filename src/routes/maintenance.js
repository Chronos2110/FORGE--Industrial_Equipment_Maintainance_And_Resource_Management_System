const express = require('express');
const router = express.Router();
const { maintenance, equipment, users } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Format and enrich maintenance schedule for front-end compatibility
async function enrichMaintenance(m) {
  if (!m) return null;

  const eq = m.equipment_id
    ? await equipment.findOne({ $or: [{ _id: m.equipment_id }, { id: m.equipment_id }] })
    : null;

  const tech = m.assigned_tech_id
    ? await users.findOne({ $or: [{ _id: m.assigned_tech_id }, { id: m.assigned_tech_id }] })
    : null;

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
    equipment: eq ? eq.name : m.equipment_id,
    equipmentObj: eq,
    technicianId: m.assigned_tech_id,
    technician: tech ? tech.name : 'Unassigned',
    technicianObj: tech
  };
}

// GET /api/maintenance
// Accessible by: ADMIN, TECHNICIAN, OPERATOR
router.get('/', authenticateToken, async (req, res) => {
  try {
    const raw = await maintenance.find({}).sort({ next_due_date: 1 }).toArray();
    const formatted = await Promise.all(raw.map(enrichMaintenance));

    return res.json(formatted);
  } catch (err) {
    console.error('Error fetching maintenance:', err);
    return res.status(500).json({ error: 'Failed to retrieve maintenance schedules', details: err.message });
  }
});

// POST /api/maintenance (Admin only)
router.post('/', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id, task_name, type, frequency_days, next_due_date, scheduledDate, equipment_id, equipment: eqInput, assigned_tech_id, technician } = req.body;

    const pmId = id || `PM-${Math.floor(100 + Math.random() * 900)}`;
    const taskName = task_name || type || 'Routine Inspection';
    const freq = frequency_days ? parseInt(frequency_days) : 30;
    const dueDate = next_due_date || scheduledDate ? new Date(next_due_date || scheduledDate) : new Date(Date.now() + freq * 24 * 60 * 60 * 1000);

    // Resolve equipment_id
    let resolvedEquipmentId = equipment_id;
    if (!resolvedEquipmentId && eqInput) {
      const eqDoc = await equipment.findOne({
        $or: [{ _id: eqInput }, { id: eqInput }, { name: eqInput }]
      });
      if (eqDoc) resolvedEquipmentId = eqDoc._id;
    }

    if (!resolvedEquipmentId) {
      return res.status(400).json({ error: 'Valid equipment_id is required.' });
    }

    // Resolve technician
    let resolvedTechId = assigned_tech_id;
    if (!resolvedTechId && technician) {
      const tech = await users.findOne({
        $or: [{ _id: technician }, { id: technician }, { name: technician }]
      });
      if (tech) resolvedTechId = tech._id;
    }

    const doc = {
      _id: pmId,
      id: pmId,
      task_name: taskName,
      frequency_days: freq,
      next_due_date: dueDate,
      compliance_status: 'SCHEDULED',
      equipment_id: resolvedEquipmentId,
      assigned_tech_id: resolvedTechId || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await maintenance.insertOne(doc);

    const formatted = await enrichMaintenance(doc);
    return res.status(201).json(formatted);
  } catch (err) {
    console.error('Error creating maintenance schedule:', err);
    return res.status(500).json({ error: 'Failed to create maintenance schedule', details: err.message });
  }
});

// PATCH /api/maintenance/:id (Admin and Technician)
router.patch('/:id', authenticateToken, requireRole(['ADMIN', 'TECHNICIAN']), async (req, res) => {
  try {
    const id = req.params.id;
    const { task_name, compliance_status, status, next_due_date, scheduledDate, frequency_days, assigned_tech_id } = req.body;

    const current = await maintenance.findOne({
      $or: [{ _id: id }, { id }]
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
        await equipment.updateOne(
          { $or: [{ _id: current.equipment_id }, { id: current.equipment_id }] },
          { $set: { last_serviced_at: new Date() } }
        );
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
    data.updatedAt = new Date();

    await maintenance.updateOne(
      { $or: [{ _id: id }, { id }] },
      { $set: data }
    );

    const updated = await maintenance.findOne({ $or: [{ _id: id }, { id }] });
    const formatted = await enrichMaintenance(updated);

    return res.json(formatted);
  } catch (err) {
    console.error('Error updating maintenance schedule:', err);
    return res.status(500).json({ error: 'Failed to update maintenance schedule', details: err.message });
  }
});

// DELETE /api/maintenance/:id (Admin only)
router.delete('/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const id = req.params.id;
    const result = await maintenance.deleteOne({
      $or: [{ _id: id }, { id }]
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: `Maintenance task ${id} not found.` });
    }

    return res.json({ success: true, message: `Maintenance task ${id} deleted.` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete maintenance task', details: err.message });
  }
});

module.exports = router;

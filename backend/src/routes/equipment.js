const express = require('express');
const router = express.Router();
const { Equipment, WorkOrder, MaintenanceSchedule, FaultReport } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

function formatEquipment(eq) {
  if (!eq) return null;
  const e = eq.toObject ? eq.toObject({ virtuals: true }) : eq;
  const lastDate = e.last_serviced_at ? (e.last_serviced_at instanceof Date ? e.last_serviced_at.toISOString().split('T')[0] : String(e.last_serviced_at).split('T')[0]) : '';
  return {
    ...e,
    id: e._id || e.id,
    type: e.category,
    location: e.bay_location,
    lastMaintenanceDate: lastDate,
    lastMaintenance: lastDate
  };
}

// GET /api/equipment (Supports ?status= and ?bay= query filters)
// Accessible by: ADMIN, TECHNICIAN, OPERATOR
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, bay } = req.query;
    const filter = {};

    if (status && status !== 'All') {
      filter.status = status;
    }

    if (bay && bay !== 'All') {
      filter.bay_location = { $regex: bay, $options: 'i' };
    }

    const equipmentList = await Equipment.find(filter)
      .sort({ _id: 1 })
      .populate({ path: 'work_orders', select: '_id id status priority' })
      .populate({ path: 'maintenance_schedules', select: '_id id task_name compliance_status next_due_date' });

    return res.json(equipmentList.map(formatEquipment));
  } catch (err) {
    console.error('Error fetching equipment:', err);
    return res.status(500).json({ error: 'Failed to retrieve equipment', details: err.message });
  }
});

// GET /api/equipment/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const eq = await Equipment.findById(req.params.id)
      .populate('work_orders')
      .populate('maintenance_schedules')
      .populate('fault_reports');

    if (!eq) {
      return res.status(404).json({ error: `Equipment with ID ${req.params.id} not found.` });
    }

    return res.json(formatEquipment(eq));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve equipment record', details: err.message });
  }
});

// POST /api/equipment (Admin only)
router.post('/', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id, name, category, type, bay_location, location, status, health_score, last_serviced_at } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: 'Equipment ID and Name are required.' });
    }

    const existing = await Equipment.findById(id);
    if (existing) {
      return res.status(400).json({ error: `Equipment with ID ${id} already exists.` });
    }

    const newEq = await Equipment.create({
      _id: id,
      name,
      category: category || type || 'General Machinery',
      bay_location: bay_location || location || 'Bay 01',
      status: status || 'OPERATIONAL',
      health_score: health_score !== undefined ? parseInt(health_score, 10) : 100,
      last_serviced_at: last_serviced_at ? new Date(last_serviced_at) : new Date()
    });

    await logActivity({
      actor: req.user?.name || 'Administrator',
      role: 'ADMIN',
      action: 'REGISTERED_EQUIPMENT',
      target: `${newEq._id} - ${newEq.name} (${newEq.bay_location})`,
      category: 'SYSTEM',
      badge_class: 'badge-operational'
    });

    return res.status(201).json(formatEquipment(newEq));
  } catch (err) {
    console.error('Error creating equipment:', err);
    return res.status(500).json({ error: 'Failed to create equipment', details: err.message });
  }
});

// PATCH /api/equipment/:id (Admin and Technician)
router.patch('/:id', authenticateToken, requireRole(['ADMIN', 'TECHNICIAN']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, type, bay_location, location, status, health_score, last_serviced_at, lastMaintenanceDate } = req.body;

    const existing = await Equipment.findById(id);
    if (!existing) {
      return res.status(404).json({ error: `Equipment ${id} not found.` });
    }

    const data = {};
    if (name) data.name = name;
    if (category || type) data.category = category || type;
    if (bay_location || location) data.bay_location = bay_location || location;
    if (status) data.status = status;
    if (health_score !== undefined) data.health_score = parseInt(health_score, 10);
    if (last_serviced_at || lastMaintenanceDate) {
      data.last_serviced_at = new Date(last_serviced_at || lastMaintenanceDate);
    }

    const updated = await Equipment.findByIdAndUpdate(id, { $set: data }, { returnDocument: 'after' });

    const statusChanged = status && status !== existing.status;
    await logActivity({
      actor: req.user?.name || 'Plant Personnel',
      role: req.user?.role || 'TECHNICIAN',
      action: statusChanged ? `STATUS_CHANGE_${status}` : 'UPDATED_EQUIPMENT',
      target: `${updated._id} - ${updated.name} (${updated.status})`,
      category: 'MAINTENANCE',
      badge_class: updated.status === 'OPERATIONAL' ? 'badge-operational' : (updated.status === 'MAINTENANCE' ? 'badge-maintenance' : 'badge-faulty')
    });

    return res.json(formatEquipment(updated));
  } catch (err) {
    console.error('Error updating equipment:', err);
    return res.status(500).json({ error: 'Failed to update equipment', details: err.message });
  }
});

// DELETE /api/equipment/:id (Admin only)
router.delete('/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Equipment.findById(id);
    if (!existing) {
      return res.status(404).json({ error: `Equipment ${id} not found.` });
    }

    await Promise.all([
      FaultReport.deleteMany({ equipment_id: id }),
      WorkOrder.deleteMany({ equipment_id: id }),
      MaintenanceSchedule.deleteMany({ equipment_id: id }),
      Equipment.findByIdAndDelete(id)
    ]);

    await logActivity({
      actor: req.user?.name || 'Administrator',
      role: 'ADMIN',
      action: 'DECOMMISSIONED_EQUIPMENT',
      target: `${id} - ${existing.name}`,
      category: 'SYSTEM',
      badge_class: 'badge-faulty'
    });

    return res.json({ success: true, message: `Equipment ${id} deleted successfully.` });
  } catch (err) {
    console.error('Error deleting equipment:', err);
    return res.status(500).json({ error: 'Failed to delete equipment', details: err.message });
  }
});

module.exports = router;

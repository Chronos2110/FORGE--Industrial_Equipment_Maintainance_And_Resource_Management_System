const express = require('express');
const router = express.Router();
const { equipment, workOrders, maintenance, faults } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

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

    const items = await equipment.find(filter).sort({ _id: 1 }).toArray();

    const formatted = await Promise.all(items.map(async (eq) => {
      const eqOrders = await workOrders
        .find({ equipment_id: eq._id })
        .project({ _id: 1, id: 1, status: 1, priority: 1 })
        .toArray();

      const eqMaintenance = await maintenance
        .find({ equipment_id: eq._id })
        .project({ _id: 1, id: 1, task_name: 1, compliance_status: 1, next_due_date: 1 })
        .toArray();

      return {
        ...eq,
        id: eq.id || eq._id,
        type: eq.category,
        location: eq.bay_location,
        lastMaintenanceDate: eq.last_serviced_at ? new Date(eq.last_serviced_at).toISOString().split('T')[0] : '',
        lastMaintenance: eq.last_serviced_at ? new Date(eq.last_serviced_at).toISOString().split('T')[0] : '',
        work_orders: eqOrders,
        maintenance_schedules: eqMaintenance
      };
    }));

    return res.json(formatted);
  } catch (err) {
    console.error('Error fetching equipment:', err);
    return res.status(500).json({ error: 'Failed to retrieve equipment', details: err.message });
  }
});

// GET /api/equipment/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    const eq = await equipment.findOne({
      $or: [{ _id: id }, { id }]
    });

    if (!eq) {
      return res.status(404).json({ error: `Equipment with ID ${id} not found.` });
    }

    const eqOrders = await workOrders.find({ equipment_id: eq._id }).toArray();
    const eqMaint = await maintenance.find({ equipment_id: eq._id }).toArray();
    const eqFaults = await faults.find({ equipment_id: eq._id }).toArray();

    return res.json({
      ...eq,
      id: eq.id || eq._id,
      type: eq.category,
      location: eq.bay_location,
      lastMaintenanceDate: eq.last_serviced_at ? new Date(eq.last_serviced_at).toISOString().split('T')[0] : '',
      work_orders: eqOrders,
      maintenance_schedules: eqMaint,
      fault_reports: eqFaults
    });
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

    const existing = await equipment.findOne({
      $or: [{ _id: id }, { id }]
    });
    if (existing) {
      return res.status(400).json({ error: `Equipment with ID ${id} already exists.` });
    }

    const newEq = {
      _id: id,
      id: id,
      name,
      category: category || type || 'General Machinery',
      bay_location: bay_location || location || 'Production Floor',
      status: status || 'OPERATIONAL',
      health_score: health_score !== undefined ? parseInt(health_score) : 100,
      last_serviced_at: last_serviced_at ? new Date(last_serviced_at) : new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await equipment.insertOne(newEq);

    return res.status(201).json({
      ...newEq,
      type: newEq.category,
      location: newEq.bay_location,
      lastMaintenanceDate: newEq.last_serviced_at ? new Date(newEq.last_serviced_at).toISOString().split('T')[0] : ''
    });
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

    const data = {};
    if (name) data.name = name;
    if (category || type) data.category = category || type;
    if (bay_location || location) data.bay_location = bay_location || location;
    if (status) data.status = status;
    if (health_score !== undefined) data.health_score = parseInt(health_score);
    if (last_serviced_at || lastMaintenanceDate) {
      data.last_serviced_at = new Date(last_serviced_at || lastMaintenanceDate);
    }
    data.updatedAt = new Date();

    const result = await equipment.findOneAndUpdate(
      { $or: [{ _id: id }, { id }] },
      { $set: data },
      { returnDocument: 'after' }
    );

    const doc = result && result.value ? result.value : await equipment.findOne({ $or: [{ _id: id }, { id }] });

    if (!doc) {
      return res.status(404).json({ error: `Equipment with ID ${id} not found.` });
    }

    return res.json({
      ...doc,
      id: doc.id || doc._id,
      type: doc.category,
      location: doc.bay_location,
      lastMaintenanceDate: doc.last_serviced_at ? new Date(doc.last_serviced_at).toISOString().split('T')[0] : ''
    });
  } catch (err) {
    console.error('Error updating equipment:', err);
    return res.status(500).json({ error: 'Failed to update equipment', details: err.message });
  }
});

// DELETE /api/equipment/:id (Admin only)
router.delete('/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await equipment.deleteOne({
      $or: [{ _id: id }, { id }]
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: `Equipment with ID ${id} not found.` });
    }

    return res.json({ success: true, message: `Equipment ${id} deleted successfully.` });
  } catch (err) {
    console.error('Error deleting equipment:', err);
    return res.status(500).json({ error: 'Failed to delete equipment', details: err.message });
  }
});

module.exports = router;

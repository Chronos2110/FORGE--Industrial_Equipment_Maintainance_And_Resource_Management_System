const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

// GET /api/equipment (Supports ?status= and ?bay= query filters)
// Accessible by: ADMIN, TECHNICIAN, OPERATOR
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, bay } = req.query;
    const where = {};

    if (status && status !== 'All') {
      where.status = {
        equals: status
      };
    }

    if (bay && bay !== 'All') {
      where.bay_location = {
        contains: bay
      };
    }

    const equipmentList = await prisma.equipment.findMany({
      where,
      orderBy: { id: 'asc' },
      include: {
        work_orders: {
          select: { id: true, status: true, priority: true }
        },
        maintenance_schedules: {
          select: { id: true, task_name: true, compliance_status: true, next_due_date: true }
        }
      }
    });

    // Format for full compatibility with both database schema and existing UI templates
    const formatted = equipmentList.map(eq => ({
      ...eq,
      type: eq.category,
      location: eq.bay_location,
      lastMaintenanceDate: eq.last_serviced_at ? eq.last_serviced_at.toISOString().split('T')[0] : '',
      lastMaintenance: eq.last_serviced_at ? eq.last_serviced_at.toISOString().split('T')[0] : ''
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
    const eq = await prisma.equipment.findUnique({
      where: { id: req.params.id },
      include: {
        work_orders: true,
        maintenance_schedules: true,
        fault_reports: true
      }
    });

    if (!eq) {
      return res.status(404).json({ error: `Equipment with ID ${req.params.id} not found.` });
    }

    return res.json({
      ...eq,
      type: eq.category,
      location: eq.bay_location,
      lastMaintenanceDate: eq.last_serviced_at ? eq.last_serviced_at.toISOString().split('T')[0] : ''
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

    const existing = await prisma.equipment.findUnique({ where: { id } });
    if (existing) {
      return res.status(400).json({ error: `Equipment with ID ${id} already exists.` });
    }

    const newEq = await prisma.equipment.create({
      data: {
        id,
        name,
        category: category || type || 'General Machinery',
        bay_location: bay_location || location || 'Bay 01',
        status: status || 'OPERATIONAL',
        health_score: health_score !== undefined ? parseInt(health_score, 10) : 100,
        last_serviced_at: last_serviced_at ? new Date(last_serviced_at) : new Date()
      }
    });

    await logActivity({
      actor: req.user?.name || 'Administrator',
      role: 'ADMIN',
      action: 'REGISTERED_EQUIPMENT',
      target: `${newEq.id} - ${newEq.name} (${newEq.bay_location})`,
      category: 'SYSTEM',
      badge_class: 'badge-operational'
    });

    return res.status(201).json({
      ...newEq,
      type: newEq.category,
      location: newEq.bay_location,
      lastMaintenanceDate: newEq.last_serviced_at ? newEq.last_serviced_at.toISOString().split('T')[0] : ''
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

    const existing = await prisma.equipment.findUnique({ where: { id } });
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

    const updated = await prisma.equipment.update({
      where: { id },
      data
    });

    const statusChanged = status && status !== existing.status;
    await logActivity({
      actor: req.user?.name || 'Plant Personnel',
      role: req.user?.role || 'TECHNICIAN',
      action: statusChanged ? `STATUS_CHANGE_${status}` : 'UPDATED_EQUIPMENT',
      target: `${updated.id} - ${updated.name} (${updated.status})`,
      category: 'MAINTENANCE',
      badge_class: updated.status === 'OPERATIONAL' ? 'badge-operational' : (updated.status === 'MAINTENANCE' ? 'badge-maintenance' : 'badge-faulty')
    });

    return res.json({
      ...updated,
      type: updated.category,
      location: updated.bay_location,
      lastMaintenanceDate: updated.last_serviced_at ? updated.last_serviced_at.toISOString().split('T')[0] : ''
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
    const existing = await prisma.equipment.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: `Equipment ${id} not found.` });
    }

    // Cascade delete linked entities in transaction
    await prisma.$transaction(async (tx) => {
      await tx.workOrderPart.deleteMany({
        where: { work_order: { equipment_id: id } }
      });
      await tx.faultReport.deleteMany({ where: { equipment_id: id } });
      await tx.workOrder.deleteMany({ where: { equipment_id: id } });
      await tx.maintenanceSchedule.deleteMany({ where: { equipment_id: id } });
      await tx.equipment.delete({ where: { id } });
    });

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

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { users, technicianProfiles } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Format workforce technician for front-end compatibility
function formatTechnician(u) {
  if (!u) return null;
  const prof = u.technician_profile || {};
  return {
    id: u.id || u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    bay_assignment: u.bay_assignment,
    status: u.status,
    availability: u.status === 'ACTIVE' ? (prof.active_wo_count > 0 ? 'Busy' : 'Available') : 'Unavailable',
    specialization: prof.specialization || 'General',
    skill: prof.specialization || 'General',
    certifications: 'ISO-9001 Safety / Master Tech',
    certification: 'ISO-9001 Safety / Master Tech',
    max_concurrent_wos: prof.max_concurrent_wos || 3,
    active_wo_count: prof.active_wo_count || 0,
    activeWorkload: prof.active_wo_count || 0,
    workload: `${prof.active_wo_count || 0} Active Orders`
  };
}

// GET /api/workforce
// Admin: full access to all technicians
// Technician: read-only access to own profile/metrics
// Operator: 403 Forbidden
router.get('/', authenticateToken, async (req, res) => {
  try {
    const role = req.user.role;

    if (role === 'OPERATOR') {
      return res.status(403).json({ error: 'Forbidden: Operators do not have access to Workforce management.' });
    }

    if (role === 'TECHNICIAN') {
      // Technician reads only own record
      const self = await users.findOne({
        $or: [{ _id: req.user.id }, { id: req.user.id }]
      });
      return res.json([formatTechnician(self)]);
    }

    // Admin: full list of technicians
    const technicians = await users.find({ role: 'TECHNICIAN' }).sort({ name: 1 }).toArray();

    return res.json(technicians.map(formatTechnician));
  } catch (err) {
    console.error('Error fetching workforce:', err);
    return res.status(500).json({ error: 'Failed to retrieve workforce', details: err.message });
  }
});

// POST /api/workforce (Admin only: create new technician)
router.post('/', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { name, email, password, bay_assignment, specialization, max_concurrent_wos } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required to create a technician.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await users.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({ error: `User with email '${cleanEmail}' already exists.` });
    }

    const techId = crypto.randomUUID();
    const defaultPassword = password || 'tech123';
    const passwordHash = bcrypt.hashSync(defaultPassword, 10);
    const maxWos = max_concurrent_wos ? parseInt(max_concurrent_wos) : 3;
    const spec = specialization || 'MECHANICAL';

    const techProfile = {
      specialization: spec,
      max_concurrent_wos: maxWos,
      active_wo_count: 0
    };

    const newTech = {
      _id: techId,
      id: techId,
      name: name.trim(),
      email: cleanEmail,
      password_hash: passwordHash,
      role: 'TECHNICIAN',
      bay_assignment: bay_assignment || 'Production Floor',
      status: 'ACTIVE',
      technician_profile: techProfile,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await users.insertOne(newTech);

    // Also populate technician_profiles collection (Table 2 in PDF)
    await technicianProfiles.insertOne({
      _id: `tech-prof-${techId}`,
      id: `tech-prof-${techId}`,
      user_id: techId,
      specialization: spec,
      max_concurrent_wos: maxWos,
      active_wo_count: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return res.status(201).json({
      success: true,
      message: `Technician ${newTech.name} created successfully.`,
      technician: formatTechnician(newTech)
    });
  } catch (err) {
    console.error('Error creating technician:', err);
    return res.status(500).json({ error: 'Failed to create technician', details: err.message });
  }
});

// PATCH /api/workforce/:id (Admin only: update technician details)
router.patch('/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, bay_assignment, status, specialization, max_concurrent_wos } = req.body;

    const existing = await users.findOne({
      $or: [{ _id: id }, { id }]
    });

    if (!existing) {
      return res.status(404).json({ error: `Technician ${id} not found.` });
    }

    const userUpdates = { updatedAt: new Date() };
    if (name) userUpdates.name = name.trim();
    if (bay_assignment) userUpdates.bay_assignment = bay_assignment;
    if (status) userUpdates.status = status;

    if (specialization || max_concurrent_wos !== undefined) {
      const currentProf = existing.technician_profile || {};
      const updatedProf = {
        ...currentProf,
        specialization: specialization || currentProf.specialization || 'MECHANICAL',
        max_concurrent_wos: max_concurrent_wos !== undefined ? parseInt(max_concurrent_wos) : (currentProf.max_concurrent_wos || 3)
      };
      userUpdates.technician_profile = updatedProf;

      await technicianProfiles.updateOne(
        { $or: [{ user_id: id }, { user_id: existing.id || existing._id }] },
        {
          $set: {
            specialization: updatedProf.specialization,
            max_concurrent_wos: updatedProf.max_concurrent_wos,
            updatedAt: new Date()
          }
        }
      );
    }

    await users.updateOne(
      { $or: [{ _id: id }, { id }] },
      { $set: userUpdates }
    );

    const updated = await users.findOne({ $or: [{ _id: id }, { id }] });
    return res.json({
      success: true,
      message: `Technician ${updated.name} updated successfully.`,
      technician: formatTechnician(updated)
    });
  } catch (err) {
    console.error('Error updating technician:', err);
    return res.status(500).json({ error: 'Failed to update technician', details: err.message });
  }
});

// PATCH /api/workforce/:id/availability
// Admin can update any technician's status; Technician can update own availability; Operator 403 Forbidden
router.patch('/:id/availability', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, availability } = req.body;
    const userRole = req.user.role;

    if (userRole === 'OPERATOR') {
      return res.status(403).json({ error: 'Forbidden: Operators cannot alter workforce availability.' });
    }

    if (userRole === 'TECHNICIAN' && req.user.id !== id) {
      return res.status(403).json({ error: 'Forbidden: Technicians may only update their own availability.' });
    }

    let targetStatus = 'ACTIVE';
    const val = (status || availability || '').toUpperCase();
    if (val === 'OFF_SHIFT' || val === 'UNAVAILABLE' || val === 'ON LEAVE') {
      targetStatus = 'OFF_SHIFT';
    } else if (val === 'ACTIVE' || val === 'AVAILABLE' || val === 'BUSY') {
      targetStatus = 'ACTIVE';
    }

    await users.updateOne(
      { $or: [{ _id: id }, { id }] },
      { $set: { status: targetStatus, updatedAt: new Date() } }
    );

    const updated = await users.findOne({
      $or: [{ _id: id }, { id }]
    });

    if (!updated) {
      return res.status(404).json({ error: `Technician with ID ${id} not found.` });
    }

    return res.json({
      success: true,
      message: `Technician ${updated.name} availability updated to ${targetStatus}.`,
      technician: formatTechnician(updated)
    });
  } catch (err) {
    console.error('Error updating availability:', err);
    return res.status(500).json({ error: 'Failed to update availability', details: err.message });
  }
});

// DELETE /api/workforce/:id (Admin only: remove technician)
router.delete('/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;

    const target = await users.findOne({
      $or: [{ _id: id }, { id }]
    });

    if (!target) {
      return res.status(404).json({ error: `Technician with ID ${id} not found.` });
    }

    await users.deleteOne({ $or: [{ _id: id }, { id }] });
    await technicianProfiles.deleteOne({ $or: [{ user_id: id }, { user_id: target.id || target._id }] });

    return res.json({
      success: true,
      message: `Technician ${target.name} removed successfully.`
    });
  } catch (err) {
    console.error('Error deleting technician:', err);
    return res.status(500).json({ error: 'Failed to delete technician', details: err.message });
  }
});

module.exports = router;


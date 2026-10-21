const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { User, TechnicianProfile, WorkOrder, MaintenanceSchedule } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

// Format workforce technician for front-end compatibility
function formatTechnician(u) {
  if (!u) return null;
  const prof = u.technician_profile || {};
  const avail = u.availability_status || (u.status === 'ACTIVE' ? (prof.active_wo_count > 0 ? 'Busy' : 'Available') : 'Off Shift');
  return {
    id: u.id || u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    badge_id: u.badge_id || 'TECH-00',
    badge: u.badge_id || 'TECH-00',
    bay_assignment: u.bay_assignment || 'Bay 01',
    bay: u.bay_assignment || 'Bay 01',
    status: u.status,
    shift_pattern: u.shift_pattern || 'Day Shift',
    shift: u.shift_pattern || 'Day Shift',
    assigned_machine: u.assigned_machine || '',
    availability_status: avail,
    availability: avail,
    specialization: prof.specialization || 'General Machinery',
    skill: prof.specialization || 'General Machinery',
    certifications: prof.certifications || 'ISO-9001 Safety / Master Tech',
    certification: prof.certifications || 'ISO-9001 Safety / Master Tech',
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
      const self = await User.findById(req.user.id).populate('technician_profile');
      return res.json(self ? [formatTechnician(self)] : []);
    }

    // Admin: full list of technicians
    const technicians = await User.find({ role: 'TECHNICIAN' })
      .sort({ name: 1 })
      .populate('technician_profile');

    return res.json(technicians.map(formatTechnician));
  } catch (err) {
    console.error('Error fetching workforce:', err);
    return res.status(500).json({ error: 'Failed to retrieve workforce', details: err.message });
  }
});

// GET /api/workforce/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    let tech = await User.findById(id).populate('technician_profile');

    if (!tech) {
      tech = await User.findOne({
        $or: [{ email: id }, { name: id }, { badge_id: id }]
      }).populate('technician_profile');
    }

    if (!tech) {
      return res.status(404).json({ error: `Technician ${id} not found.` });
    }

    return res.json(formatTechnician(tech));
  } catch (err) {
    console.error('Error retrieving technician:', err);
    return res.status(500).json({ error: 'Failed to retrieve technician', details: err.message });
  }
});

// POST /api/workforce (Admin only: onboard new technician directly from workforce UI)
router.post('/', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const {
      id,
      name,
      email,
      password,
      badge_id,
      specialization,
      bay_assignment,
      shift_pattern,
      availability_status,
      certifications,
      max_concurrent_wos,
      assigned_machine
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required for technician onboarding.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: `User with email '${email}' already exists.` });
    }

    const hashedPassword = await bcrypt.hash(password || 'tech123', 10);
    const techBadge = badge_id || `TECH-0${Math.floor(10 + Math.random() * 90)}`;
    const userId = id || `usr_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const user = await User.create({
      _id: userId,
      name,
      email,
      password_hash: hashedPassword,
      role: 'TECHNICIAN',
      badge_id: techBadge,
      bay_assignment: bay_assignment || 'Bay 01',
      shift_pattern: shift_pattern || 'Day Shift',
      assigned_machine: assigned_machine || null,
      availability_status: availability_status || 'Available',
      status: 'ACTIVE'
    });

    const profile = await TechnicianProfile.create({
      _id: `TP-${userId}`,
      user_id: user._id,
      specialization: specialization || 'General Machinery',
      certifications: certifications || 'ISO-9001 Safety / Master Tech',
      max_concurrent_wos: max_concurrent_wos ? parseInt(max_concurrent_wos, 10) : 3,
      active_wo_count: 0
    });

    const populated = await User.findById(user._id).populate('technician_profile');

    await logActivity({
      actor: req.user?.name || 'Administrator',
      role: 'ADMIN',
      action: 'ONBOARDED_TECHNICIAN',
      target: `${populated.name} (${populated.badge_id} - ${profile.specialization})`,
      category: 'SYSTEM',
      badge_class: 'badge-operational'
    });

    return res.status(201).json(formatTechnician(populated));
  } catch (err) {
    console.error('Error onboarding technician:', err);
    return res.status(500).json({ error: 'Failed to onboard technician', details: err.message });
  }
});

// PATCH /api/workforce/:id (Admin and self Technician)
// Updates technician specialization, bay, shift, certifications, workload limit
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user.role;

    if (userRole === 'OPERATOR') {
      return res.status(403).json({ error: 'Forbidden: Operators cannot modify workforce records.' });
    }

    let targetUser = await User.findById(id).populate('technician_profile');

    if (!targetUser) {
      targetUser = await User.findOne({
        $or: [{ email: id }, { name: id }, { badge_id: id }]
      }).populate('technician_profile');
    }

    if (!targetUser) {
      return res.status(404).json({ error: `Technician '${id}' not found.` });
    }

    const targetUserId = targetUser._id || targetUser.id;
    if (userRole === 'TECHNICIAN' && req.user.id !== targetUserId) {
      return res.status(403).json({ error: 'Forbidden: Technicians may only update their own profile.' });
    }

    const {
      name,
      email,
      bay_assignment,
      bay,
      shift_pattern,
      shift,
      assigned_machine,
      availability_status,
      availability,
      status,
      specialization,
      skill,
      certifications,
      certification,
      max_concurrent_wos
    } = req.body;

    const userData = {};
    if (name) userData.name = name;
    if (email && userRole === 'ADMIN') userData.email = email;
    if (bay_assignment || bay) userData.bay_assignment = bay_assignment || bay;
    if (shift_pattern || shift) userData.shift_pattern = shift_pattern || shift;
    if (assigned_machine !== undefined) userData.assigned_machine = assigned_machine;

    const availVal = availability_status || availability;
    if (availVal) {
      userData.availability_status = availVal;
      if (availVal.toUpperCase() === 'OFF SHIFT' || availVal.toUpperCase() === 'OFF_SHIFT') {
        userData.status = 'OFF_SHIFT';
      } else {
        userData.status = 'ACTIVE';
      }
    }

    if (status) userData.status = status;

    const profileData = {};
    if (specialization || skill) profileData.specialization = specialization || skill;
    if (certifications || certification) profileData.certifications = certifications || certification;
    if (max_concurrent_wos !== undefined) profileData.max_concurrent_wos = parseInt(max_concurrent_wos, 10);

    if (Object.keys(userData).length > 0) {
      await User.findByIdAndUpdate(targetUserId, userData);
    }

    if (Object.keys(profileData).length > 0) {
      const existingProfile = await TechnicianProfile.findOne({ user_id: targetUserId });
      if (existingProfile) {
        await TechnicianProfile.findOneAndUpdate({ user_id: targetUserId }, profileData);
      } else {
        await TechnicianProfile.create({
          _id: `TP-${targetUserId}`,
          user_id: targetUserId,
          specialization: profileData.specialization || 'General Machinery',
          certifications: profileData.certifications || 'ISO-9001 Safety / Master Tech',
          max_concurrent_wos: profileData.max_concurrent_wos || 3,
          active_wo_count: 0
        });
      }
    }

    const updated = await User.findById(targetUserId).populate('technician_profile');

    await logActivity({
      actor: req.user?.name || 'Administrator',
      role: req.user?.role || 'ADMIN',
      action: 'UPDATED_TECHNICIAN_PROFILE',
      target: `${updated.name} (${updated.badge_id || updated.id})`,
      category: 'SYSTEM',
      badge_class: 'badge-scheduled'
    });

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

// PATCH /api/workforce/:id/availability (Convenience alias for shift status toggle)
router.patch('/:id/availability', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, availability } = req.body;
    const userRole = req.user.role;

    if (userRole === 'OPERATOR') {
      return res.status(403).json({ error: 'Forbidden: Operators cannot alter workforce availability.' });
    }

    let targetUser = await User.findById(id).populate('technician_profile');

    if (!targetUser) {
      targetUser = await User.findOne({
        $or: [{ email: id }, { name: id }]
      }).populate('technician_profile');
    }

    if (!targetUser) {
      return res.status(404).json({ error: `Technician with identifier '${id}' not found.` });
    }

    const targetUserId = targetUser._id || targetUser.id;
    if (userRole === 'TECHNICIAN' && req.user.id !== targetUserId) {
      return res.status(403).json({ error: 'Forbidden: Technicians may only update their own availability.' });
    }

    let targetStatus = 'ACTIVE';
    const val = (status || availability || '').toUpperCase();
    let availStatus = 'Available';

    if (val === 'OFF_SHIFT' || val === 'OFF SHIFT' || val === 'UNAVAILABLE' || val === 'ON LEAVE') {
      targetStatus = 'OFF_SHIFT';
      availStatus = 'Off Shift';
    } else if (val === 'ON BREAK' || val === 'ON_BREAK') {
      targetStatus = 'ACTIVE';
      availStatus = 'On Break';
    } else if (val === 'BUSY') {
      targetStatus = 'ACTIVE';
      availStatus = 'Busy';
    } else {
      targetStatus = 'ACTIVE';
      availStatus = 'Available';
    }

    const updated = await User.findByIdAndUpdate(
      targetUserId,
      { status: targetStatus, availability_status: availStatus },
      { returnDocument: 'after' }
    ).populate('technician_profile');

    await logActivity({
      actor: req.user?.name || targetUser.name,
      role: req.user?.role || 'TECHNICIAN',
      action: 'SHIFT_STATUS_CHANGE',
      target: `${updated.name} -> ${availStatus}`,
      category: 'SYSTEM',
      badge_class: availStatus === 'Available' ? 'badge-operational' : 'badge-maintenance'
    });

    return res.json({
      success: true,
      message: `Technician ${updated.name} availability updated to ${availStatus}.`,
      technician: formatTechnician(updated)
    });
  } catch (err) {
    console.error('Error updating availability:', err);
    return res.status(500).json({ error: 'Failed to update availability', details: err.message });
  }
});

// DELETE /api/workforce/:id (Admin only)
router.delete('/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;

    let targetUser = await User.findById(id);
    if (!targetUser) {
      targetUser = await User.findOne({
        $or: [{ email: id }, { badge_id: id }]
      });
    }

    if (!targetUser) {
      return res.status(404).json({ error: `User with ID ${id} not found.` });
    }

    const targetUserId = targetUser._id || targetUser.id;

    // Unassign open work orders
    await WorkOrder.updateMany(
      { assigned_to: targetUserId, status: { $nin: ['COMPLETED', 'CANCELLED'] } },
      { assigned_to: null, status: 'OPEN' }
    );

    // Unassign maintenance schedules
    await MaintenanceSchedule.updateMany(
      { assigned_tech_id: targetUserId },
      { assigned_tech_id: null }
    );

    // Delete technician profile if exists
    await TechnicianProfile.deleteMany({ user_id: targetUserId });

    // Delete user
    await User.findByIdAndDelete(targetUserId);

    await logActivity({
      actor: req.user?.name || 'Administrator',
      role: 'ADMIN',
      action: 'OFFBOARDED_PERSONNEL',
      target: `${targetUser.name} (${targetUser.badge_id || targetUser.email})`,
      category: 'SYSTEM',
      badge_class: 'badge-faulty'
    });

    return res.json({ success: true, message: `Personnel ${targetUser.name} (${id}) offboarded successfully.` });
  } catch (err) {
    console.error('Error offboarding technician:', err);
    return res.status(500).json({ error: 'Failed to offboard technician', details: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Format workforce technician for front-end compatibility
function formatTechnician(u) {
  const prof = u.technician_profile || {};
  return {
    id: u.id,
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
      const self = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { technician_profile: true }
      });
      return res.json([formatTechnician(self)]);
    }

    // Admin: full list of technicians
    const technicians = await prisma.user.findMany({
      where: {
        role: 'TECHNICIAN'
      },
      include: {
        technician_profile: true
      },
      orderBy: { name: 'asc' }
    });

    return res.json(technicians.map(formatTechnician));
  } catch (err) {
    console.error('Error fetching workforce:', err);
    return res.status(500).json({ error: 'Failed to retrieve workforce', details: err.message });
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

    const updated = await prisma.user.update({
      where: { id },
      data: { status: targetStatus },
      include: { technician_profile: true }
    });

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

module.exports = router;

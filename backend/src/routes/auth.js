const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User, TechnicianProfile } = require('../models');
const { JWT_SECRET, authenticateToken, normalizeRole } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

function formatUserResponse(u) {
  if (!u) return null;
  const obj = u.toObject ? u.toObject({ virtuals: true }) : u;
  return {
    id: obj.id || obj._id,
    _id: obj._id,
    name: obj.name,
    email: obj.email,
    role: obj.role,
    badgeId: obj.badge_id || '',
    badge_id: obj.badge_id || '',
    bay_assignment: obj.bay_assignment || 'Production Floor',
    bay: obj.bay_assignment || 'Production Floor',
    shift_pattern: obj.shift_pattern || 'Day Shift',
    shiftPattern: obj.shift_pattern || 'Day Shift',
    assigned_machine: obj.assigned_machine || '',
    assignedMachine: obj.assigned_machine || '',
    availability_status: obj.availability_status || 'Available',
    availabilityStatus: obj.availability_status || 'Available',
    status: obj.status,
    technician_profile: obj.technician_profile
  };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const {
      name, email, username, password, confirmPassword, role,
      bay_assignment, bay, specialization, certifications,
      badge_id, badgeId, shift_pattern, shiftPattern,
      assigned_machine, assignedMachine, availability_status, availabilityStatus
    } = req.body;

    const rawEmail = (email || username || '').trim().toLowerCase();
    const displayName = (name || rawEmail.split('@')[0]).trim();

    if (!rawEmail || !password) {
      return res.status(400).json({ error: 'Username/email and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    if (!role) {
      return res.status(400).json({ error: 'A role must be selected.' });
    }

    const normalizedRole = normalizeRole(role);
    if (!['ADMIN', 'TECHNICIAN', 'OPERATOR'].includes(normalizedRole)) {
      return res.status(400).json({ error: `Invalid role '${role}'. Must be Administrator, Technician, or Operator.` });
    }

    const storedEmail = rawEmail.includes('@') ? rawEmail : `${rawEmail}@forge.industrial`;

    // Check uniqueness
    const existing = await User.findOne({
      $or: [
        { email: storedEmail },
        { email: rawEmail }
      ]
    });
    if (existing) {
      return res.status(409).json({ error: `An account with username '${rawEmail}' already exists. Please log in instead.` });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const resolvedBadge = badge_id || badgeId || null;
    const resolvedShift = shift_pattern || shiftPattern || 'Day Shift';
    const resolvedMachine = assigned_machine || assignedMachine || null;
    const resolvedAvail = availability_status || availabilityStatus || 'Available';
    const resolvedBay = bay_assignment || bay || 'Production Floor';
    const newUserId = crypto.randomUUID();

    const newUser = await User.create({
      _id: newUserId,
      name: displayName,
      email: storedEmail,
      password_hash: passwordHash,
      role: normalizedRole,
      badge_id: resolvedBadge,
      bay_assignment: resolvedBay,
      shift_pattern: resolvedShift,
      assigned_machine: resolvedMachine,
      availability_status: resolvedAvail,
      status: 'ACTIVE'
    });

    if (normalizedRole === 'TECHNICIAN') {
      await TechnicianProfile.create({
        user_id: newUser._id,
        specialization: specialization || 'MECHANICAL',
        certifications: certifications || 'ISO-9001 Safety / Master Tech',
        max_concurrent_wos: 3,
        active_wo_count: 0
      });
    }

    const populatedUser = await User.findById(newUser._id).populate('technician_profile');

    await logActivity({
      actor: populatedUser.name,
      role: populatedUser.role,
      action: `Personnel registered & provisioned (${populatedUser.badge_id || 'ID'})`,
      target: populatedUser.badge_id || populatedUser.name,
      category: 'SYSTEM',
      badge_class: 'badge-scheduled'
    });

    const token = jwt.sign(
      { id: populatedUser._id, email: populatedUser.email, role: normalizedRole, name: populatedUser.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.status(201).json({
      success: true,
      message: `Account created successfully. Welcome to FORGE, ${populatedUser.name}!`,
      token,
      user: formatUserResponse(populatedUser)
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.', details: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, username, password, role } = req.body;
    const identifier = (email || username || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Username/email and password are required.' });
    }

    const idLower = identifier.toLowerCase();
    const idUpper = identifier.toUpperCase();

    const queryOr = [
      { email: idLower },
      { email: idLower.includes('@') ? idLower : `${idLower}@forge.industrial` },
      { email: idLower.includes('@') ? idLower : `${idLower}@forge.io` },
      { badge_id: idUpper },
      { badge_id: identifier },
      { name: new RegExp(`^${identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      { name: new RegExp(identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
    ];

    if (idLower === 'op_floor') queryOr.push({ email: 'operator@forge.io' });
    if (idLower === 'tech_rajesh') queryOr.push({ email: 'rajesh@forge.io' });

    const user = await User.findOne({ $or: queryOr }).populate('technician_profile');

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials. User not found.' });
    }

    const isPasswordValid = bcrypt.compareSync(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials. Incorrect password.' });
    }

    if (role) {
      const normalizedReqRole = normalizeRole(role);
      const normalizedUserRole = normalizeRole(user.role);
      if (normalizedReqRole !== normalizedUserRole) {
        return res.status(403).json({
          error: `Role mismatch: User is registered as '${user.role}', but tried logging in as '${role}'.`
        });
      }
    }

    const tokenPayload = {
      id: user._id,
      email: user.email,
      role: normalizeRole(user.role),
      name: user.name
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    await logActivity({
      actor: user.name,
      role: user.role,
      action: `Personnel logged in to terminal`,
      target: user.badge_id || user.name,
      category: 'SYSTEM',
      badge_class: 'badge-scheduled'
    });

    return res.json({
      success: true,
      token,
      user: formatUserResponse(user)
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error during login', details: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const fullUser = await User.findById(req.user.id).populate('technician_profile');

    if (!fullUser) {
      return res.status(404).json({ error: 'User record not found.' });
    }

    return res.json({
      success: true,
      user: formatUserResponse(fullUser)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve session', details: err.message });
  }
});

// PATCH /api/auth/profile
// Allows logged-in personnel to update their operational profile attributes in MongoDB
router.patch('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name, bay_assignment, bay, shift_pattern, shift,
      assigned_machine, machine, availability_status, status,
      specialization, certifications
    } = req.body;

    const userData = {};
    if (name) userData.name = name.trim();
    if (bay_assignment || bay) userData.bay_assignment = (bay_assignment || bay).trim();
    if (shift_pattern || shift) userData.shift_pattern = (shift_pattern || shift).trim();
    if (assigned_machine !== undefined || machine !== undefined) {
      userData.assigned_machine = (assigned_machine !== undefined ? assigned_machine : machine) || null;
    }
    if (availability_status || status) {
      const avail = (availability_status || status).trim();
      userData.availability_status = avail;
      if (avail.toUpperCase() === 'OFF SHIFT' || avail.toUpperCase() === 'OFF_SHIFT') {
        userData.status = 'OFF_SHIFT';
      } else {
        userData.status = 'ACTIVE';
      }
    }

    const updatedUser = await User.findByIdAndUpdate(userId, { $set: userData }, { returnDocument: 'after' });

    if (updatedUser.role === 'TECHNICIAN' && (specialization || certifications)) {
      await TechnicianProfile.findOneAndUpdate(
        { user_id: userId },
        {
          $set: {
            ...(specialization ? { specialization } : {}),
            ...(certifications ? { certifications } : {})
          },
          $setOnInsert: {
            specialization: specialization || 'MECHANICAL',
            certifications: certifications || 'ISO-9001 Safety / Master Tech',
            max_concurrent_wos: 3,
            active_wo_count: 0
          }
        },
        { upsert: true, new: true }
      );
    }

    const finalUser = await User.findById(userId).populate('technician_profile');

    await logActivity({
      actor: finalUser.name,
      role: finalUser.role,
      action: `Updated personnel profile attributes & shift status (${finalUser.availability_status})`,
      target: finalUser.badge_id || finalUser.name,
      category: 'SYSTEM',
      badge_class: 'badge-operational'
    });

    return res.json({
      success: true,
      message: 'Personnel profile successfully updated.',
      user: formatUserResponse(finalUser)
    });
  } catch (err) {
    console.error('Error updating profile:', err);
    return res.status(500).json({ error: 'Failed to update personnel profile', details: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;

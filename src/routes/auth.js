const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { users } = require('../db');
const { JWT_SECRET, authenticateToken, normalizeRole } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, username, password, confirmPassword, role, bay_assignment, specialization } = req.body;

    // Resolve identifier: prefer email, fall back to username
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

    // Build the email to store (if raw input has no @, append a forge domain)
    const storedEmail = rawEmail.includes('@') ? rawEmail : rawEmail + '@forge.industrial';

    // Check uniqueness in MongoDB
    const existing = await users.findOne({
      $or: [
        { email: storedEmail },
        { email: rawEmail }
      ]
    });
    if (existing) {
      return res.status(409).json({ error: `An account with username '${rawEmail}' already exists. Please log in instead.` });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const userId = crypto.randomUUID();

    // Create user in MongoDB
    const newUser = {
      _id: userId,
      id: userId,
      name: displayName,
      email: storedEmail,
      password_hash: passwordHash,
      role: normalizedRole,
      bay_assignment: bay_assignment || 'Production Floor',
      status: 'ACTIVE',
      technician_profile: normalizedRole === 'TECHNICIAN' ? {
        specialization: specialization || 'MECHANICAL',
        max_concurrent_wos: 3,
        active_wo_count: 0
      } : null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await users.insertOne(newUser);

    // Issue JWT immediately so they're auto-logged in after registration
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: normalizedRole, name: newUser.name },
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
      message: `Account created successfully. Welcome to FORGE, ${newUser.name}!`,
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        bay_assignment: newUser.bay_assignment,
        status: newUser.status,
        technician_profile: newUser.technician_profile
      }
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
    const identifier = (email || username || '').trim().toLowerCase();

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Username/email and password are required.' });
    }

    const user = await users.findOne({
      $or: [
        { email: identifier },
        { email: identifier.includes('@') ? identifier : `${identifier}@forge.industrial` }
      ]
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials. User not found.' });
    }

    // Verify password hash
    const isPasswordValid = bcrypt.compareSync(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials. Incorrect password.' });
    }

    // If a role was explicitly specified in the login form, check compatibility
    if (role) {
      const normalizedReqRole = normalizeRole(role);
      const normalizedUserRole = normalizeRole(user.role);
      if (normalizedReqRole !== normalizedUserRole) {
        return res.status(403).json({
          error: `Role mismatch: User is registered as '${user.role}', but tried logging in as '${role}'.`
        });
      }
    }

    // Generate JWT
    const tokenPayload = {
      id: user.id || user._id,
      email: user.email,
      role: normalizeRole(user.role),
      name: user.name
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

    // Set HttpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      token,
      user: {
        id: user.id || user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        bay_assignment: user.bay_assignment,
        status: user.status,
        technician_profile: user.technician_profile
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error during login', details: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    return res.json({
      success: true,
      user: req.user
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve session', details: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;

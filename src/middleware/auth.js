const jwt = require('jsonwebtoken');
const { users } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'forge-super-secret-jwt-key-2026-industrial-spec';

// Normalize role names: 'Administrator' -> 'ADMIN', etc.
function normalizeRole(role) {
  if (!role) return '';
  const r = role.toUpperCase();
  if (r === 'ADMINISTRATOR' || r === 'ADMIN') return 'ADMIN';
  if (r === 'TECHNICIAN' || r === 'TECH') return 'TECHNICIAN';
  if (r === 'OPERATOR' || r === 'OPER') return 'OPERATOR';
  return r;
}

// Authentication Middleware
async function authenticateToken(req, res, next) {
  let token = null;

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized: Authentication token is missing or invalid'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Fetch live user status from MongoDB users collection
    const user = await users.findOne({
      $or: [{ _id: decoded.id }, { id: decoded.id }]
    });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }

    req.user = {
      id: user.id || user._id,
      name: user.name,
      email: user.email,
      role: normalizeRole(user.role),
      bay_assignment: user.bay_assignment,
      status: user.status,
      technician_profile: user.technician_profile
    };

    next();
  } catch (err) {
    return res.status(401).json({
      error: 'Unauthorized: Token is expired or invalid',
      details: err.message
    });
  }
}

// Optional Auth (e.g. for development or flexible routes)
async function optionalAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await users.findOne({
      $or: [{ _id: decoded.id }, { id: decoded.id }]
    });
    if (user) {
      req.user = {
        id: user.id || user._id,
        name: user.name,
        email: user.email,
        role: normalizeRole(user.role),
        bay_assignment: user.bay_assignment,
        status: user.status,
        technician_profile: user.technician_profile
      };
    }
  } catch (err) {
    req.user = null;
  }
  next();
}

// Role-based Access Control Guard
function requireRole(allowedRoles) {
  const normalizedAllowed = allowedRoles.map(normalizeRole);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: Please log in to proceed' });
    }

    const userRole = normalizeRole(req.user.role);

    if (!normalizedAllowed.includes(userRole)) {
      return res.status(403).json({
        error: `Forbidden: Action requires role [${normalizedAllowed.join(', ')}]. Current role: ${userRole}`
      });
    }

    next();
  };
}

module.exports = {
  JWT_SECRET,
  normalizeRole,
  authenticateToken,
  optionalAuth,
  requireRole
};

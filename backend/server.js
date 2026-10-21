const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const { connectDB } = require('./src/db');
const { User } = require('./src/models');

const authRoutes = require('./src/routes/auth');
const equipmentRoutes = require('./src/routes/equipment');
const workOrdersRoutes = require('./src/routes/workOrders');
const faultsRoutes = require('./src/routes/faults');
const maintenanceRoutes = require('./src/routes/maintenance');
const workforceRoutes = require('./src/routes/workforce');
const inventoryRoutes = require('./src/routes/inventory');
const analyticsRoutes = require('./src/routes/analytics');
const activityRoutes = require('./src/routes/activity');
const shellRoutes = require('./src/routes/shell');

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_DIR = path.join(__dirname, '../frontend');

// Ensure database connection middleware
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database connection error in request:', err);
    res.status(500).json({ error: 'Database service unavailable', details: err.message });
  }
});

// Allow the registration/login pages even when opened from Live Server or file://
app.use(cors({
  origin: function (origin, callback) {
    callback(null, true);
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static frontend files directly from the frontend directory
app.use(express.static(FRONTEND_DIR));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/work-orders', workOrdersRoutes);
app.use('/api/workorders', workOrdersRoutes);
app.use('/api/faults', faultsRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/workforce', workforceRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api', shellRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    system: 'FORGE - Industrial Maintenance & Resource Management System',
    database: 'MongoDB',
    timestamp: new Date().toISOString()
  });
});

// Unknown API routes return JSON 404
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API route ${req.method} ${req.originalUrl} not found.` });
});

// Root and friendly routes
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'register.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'pages/dashboard.html')));

async function startServer() {
  try {
    await connectDB();
    let userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('  Initial database empty. Auto-seeding 6-bay plant dataset...');
      const { seedDatabase } = require('./src/seed');
      await seedDatabase();
      userCount = await User.countDocuments();
    }
    console.log(`  Database connected. Users in MongoDB: ${userCount}`);
  } catch (err) {
    console.error('  Database connection failed:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  FORGE Backend Server running on port ${PORT} [MongoDB]`);
    console.log(`  Open register: http://localhost:${PORT}/register.html`);
    console.log(`  Open login:    http://localhost:${PORT}/login.html`);
    console.log(`  API Status:    http://localhost:${PORT}/api/health`);
    console.log(`=======================================================`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;

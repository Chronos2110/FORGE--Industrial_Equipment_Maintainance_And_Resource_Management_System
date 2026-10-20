require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./src/routes/auth');
const equipmentRoutes = require('./src/routes/equipment');
const workOrdersRoutes = require('./src/routes/workOrders');
const faultsRoutes = require('./src/routes/faults');
const maintenanceRoutes = require('./src/routes/maintenance');
const workforceRoutes = require('./src/routes/workforce');
const inventoryRoutes = require('./src/routes/inventory');
const analyticsRoutes = require('./src/routes/analytics');
const shellRoutes = require('./src/routes/shell');

const prisma = require('./src/db');

const app = express();
const PORT = process.env.PORT || 5000;

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

// Serve static frontend files directly from the repository root
app.use(express.static(path.join(__dirname)));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/work-orders', workOrdersRoutes);
app.use('/api/faults', faultsRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/workforce', workforceRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api', shellRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    system: 'FORGE - Industrial Maintenance & Resource Management System',
    timestamp: new Date().toISOString()
  });
});

// Unknown API routes return JSON 404
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API route ${req.method} ${req.originalUrl} not found.` });
});

// Root route handler serves index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

async function startServer() {
  try {
    await prisma.$connect();
    const userCount = await prisma.user.count();
    console.log(`  Database connected. Users in SQLite: ${userCount}`);
    if (userCount === 0) {
      console.log(`  Warning: users table is empty. Run: npm run seed`);
    }
  } catch (err) {
    console.error('  Database connection failed:', err.message);
    console.error('  Run: npx prisma generate && npx prisma db push && npm run seed');
  }

  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  FORGE Backend Server running on port ${PORT}`);
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

# FORGE — Industrial Equipment Maintenance & Resource Management System
## Complete Project Overview & Changes (Native Node.js + Express.js + MongoDB)

---

## 📌 What Was Changed

The entire backend has been refactored to use **pure Node.js and Express.js** connected directly to **MongoDB** via the official native MongoDB driver (`mongodb` `MongoClient`).
- **Removed**: Prisma ORM, SQLite (`dev.db`), and Mongoose.
- **Added**: Official native `mongodb` driver (`MongoClient`).
- **Database Engine**: MongoDB database `forge` with all 8 collections specified in the architecture document (`users`, `technician_profiles`, `equipment`, `inventory_parts`, `work_orders`, `work_order_parts`, `maintenance_schedules`, `fault_reports`).

---

## 📂 Key Files In This Project

| File | Purpose |
|---|---|
| [`.env`](.env) | Contains `MONGODB_URI` (`mongodb://127.0.0.1:27017/forge`), `JWT_SECRET`, `PORT` |
| [`package.json`](package.json) | Node scripts and dependencies (`express`, `mongodb`, `bcryptjs`, `jsonwebtoken`, `cors`, `cookie-parser`, `dotenv`) |
| [`server.js`](server.js) | Main Express server entry point, initializes MongoDB connection, registers all API routes, serves frontend |
| [`src/db.js`](src/db.js) | Native `MongoClient` connection manager and lazy accessors for all 8 collections (`users`, `technicianProfiles`, `equipment`, `inventory`, `workOrders`, `workOrderParts`, `maintenance`, `faults`) |
| [`src/seed.js`](src/seed.js) | Standalone database seeder script to populate initial demo data into all 8 MongoDB collections and create schema indexes |
| [`src/middleware/auth.js`](src/middleware/auth.js) | JWT verification middleware and Role-Based Access Control (RBAC: Admin, Technician, Operator) |
| [`src/routes/auth.js`](src/routes/auth.js) | User registration (`/register`), login (`/login`), profile (`/me`), and logout (`/logout`) |
| [`src/routes/equipment.js`](src/routes/equipment.js) | Machinery catalog CRUD, status tracking, bay filtering, and health scores |
| [`src/routes/workOrders.js`](src/routes/workOrders.js) | Work order dispatching, auto-assign technician algorithm, lifecycle progression, and transactional inventory stock deduction on completion |
| [`src/routes/faults.js`](src/routes/faults.js) | Operator fault reporting, automatic machine state updates (`DOWN`/`WARNING`), and fault escalation |
| [`src/routes/maintenance.js`](src/routes/maintenance.js) | Preventive maintenance schedule tracking and compliance |
| [`src/routes/workforce.js`](src/routes/workforce.js) | Full technician roster CRUD, availability, and active workload tracking |
| [`src/routes/inventory.js`](src/routes/inventory.js) | Warehouse spare parts inventory and restocking |
| [`src/routes/analytics.js`](src/routes/analytics.js) | Plant-wide reliability metrics: MTTR, MTBF, availability percentage, and completion trends |
| [`src/routes/shell.js`](src/routes/shell.js) | Ctrl+K Command Palette search, bottom dock telemetry, and demo data reset endpoint |
| [`test/backend_test.js`](test/backend_test.js) | Automated 16-test integration suite testing all backend APIs and 8 collections against MongoDB |
| [`index.html`](index.html) | FORGE industrial landing page |
| [`login.html`](login.html) | Dedicated industrial login console |
| [`register.html`](register.html) | Operator registration page |
| [`pages/dashboard.html`](pages/dashboard.html) | Operations control center & KPIs |
| [`pages/equipment.html`](pages/equipment.html) | Equipment management page |
| [`pages/workorders.html`](pages/workorders.html) | Maintenance dispatch console |
| [`pages/maintenance.html`](pages/maintenance.html) | Maintenance schedule page |
| [`pages/inventory.html`](pages/inventory.html) | Warehouse spare parts inventory page |
| [`pages/workforce.html`](pages/workforce.html) | Personnel management page |
| [`pages/analytics.html`](pages/analytics.html) | Reliability & operational intelligence page |
| [`js/api.js`](js/api.js) | REST API bridge synchronizing backend data to frontend `localStorage` |

---

## 🚀 How to Run

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Seed MongoDB with initial demo data**:
   ```bash
   npm run seed
   ```

3. **Start the server**:
   ```bash
   npm start
   ```
   Open in your browser: `http://localhost:5000`

4. **Run integration tests**:
   ```bash
   npm test
   ```

# FORGE — Industrial Equipment Maintenance & Resource Management System

A premium, enterprise-grade industrial operations and asset management software suite designed for modern manufacturing plants and built with pure HTML5, CSS3, Bootstrap 5, and Vanilla JavaScript.

---

## 📌 Project Overview

**FORGE** is an industrial asset management and plant operations platform engineered to monitor equipment health, schedule preventive and corrective maintenance, dispatch work orders, balance technician workloads, track warehouse spare parts, and deliver quantitative operational analytics.

Designed with a high-contrast **Obsidian Black + Industrial Gold** visual identity, FORGE delivers the aesthetic and structural fidelity of enterprise industrial systems (such as Zebra Technologies and Siemens Industrial Software).

---

## 🛠️ Technology Stack

- **Frontend**: Semantic HTML5, Vanilla CSS3 + Bootstrap 5 (Custom "Industrial Technology" design system in `css/style.css`), Inter + IBM Plex Mono fonts, Vanilla JavaScript (ES6 DOM APIs)
- **Database Engine**: MongoDB with official native MongoDB Driver (`mongodb` MongoClient)
- **Backend Architecture**: Pure Node.js & Express.js REST API (No Mongoose, No Prisma)
- **Authentication**: JWT (JSON Web Tokens) with HttpOnly cookies & RBAC guards (Admin, Technician, Operator)
- **Dual Persistence**: Live synchronization between MongoDB backend and client-side `localStorage` bridge (`js/api.js`) for offline resiliency

---

## 🍃 MongoDB Backend Setup

1. **Environment Configuration (`.env`)**:
   ```env
   # Local MongoDB:
   MONGODB_URI=mongodb://127.0.0.1:27017/forge

   # Or Cloud MongoDB Atlas:
   # MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/forge?retryWrites=true&w=majority

   JWT_SECRET="forge-super-secret-jwt-key-2026-industrial-spec"
   PORT=5000
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Seed MongoDB with Demo Factory Data**:
   ```bash
   npm run seed
   ```

4. **Start Backend Server**:
   ```bash
   npm start
   ```

5. **Run Integration Test Suite**:
   ```bash
   npm test
   ```

---

## 📂 Project Architecture

```
Mini-Project/
│
├── index.html                  # FORGE Industrial Product Landing Page
├── login.html                  # Dedicated Industrial Access & Authentication Console
├── README.md                   # System documentation & viva reference
│
├── pages/
│   ├── dashboard.html          # Industrial Operations Control Center & KPIs
│   ├── equipment.html          # Master machinery catalog & asset registry
│   ├── maintenance.html        # Maintenance lifecycle state machine & scheduling
│   ├── workorders.html         # Maintenance dispatch console & fault tracking
│   ├── workforce.html          # Operational personnel allocation & skill routing
│   ├── inventory.html          # Warehouse spare-parts inventory & stock triggers
│   └── analytics.html          # Operational intelligence, reliability & MTBF indices
│
├── css/
│   └── style.css               # Black + Industrial Gold design tokens & styles
│
├── js/
│   ├── common.js               # Shared role display, active nav, alerts, data seeding
│   ├── app.js                  # Authentication validation and session management
│   ├── dashboard.js            # KPI metrics calculation and dynamic dashboard loaders
│   ├── equipment.js            # Equipment CRUD, filtering, modal state
│   ├── maintenance.js          # Maintenance schedule CRUD and type filters
│   ├── workorders.js           # Work order management and auto-assign skill routing
│   ├── workforce.js            # Technician roster management and workload tracking
│   ├── inventory.js            # Spare parts CRUD, low-stock trigger evaluation
│   └── analytics.js            # Dynamic reliability metrics, progress bars & resource logs
│
└── assets/                     # Static media and assets (if needed)
```

---

## 🚀 Key Operational Features

1. **Dedicated Product Landing Page**:
   - High-impact industrial hero section with real-time operational telemetry.
   - Root-cause analysis of manufacturing bottlenecks.
   - Interactive maintenance lifecycle visualization.
   - Comprehensive module directory and embedded intelligence overview.

2. **Operations Control Center**:
   - Operational KPIs (Total Equipment, Operational, Under Maintenance, Open Work Orders).
   - Upcoming Maintenance table, Inventory Alerts, and chronological Recent Audit log.

3. **Deterministic Maintenance Lifecycle**:
   - Primary track: `Scheduled → Assigned → In Progress → Completed`.
   - Exception pathway: `Waiting for Parts → Ready to Resume`.
   - Bidirectional equipment status synchronization.

4. **Intelligent Work Order Dispatching**:
   - Algorithmic skill keyword matching + lowest active workload routing.
   - Integrated warehouse spare parts availability checks and automatic stock decrements.

5. **Dynamic Roster Workload Balancing**:
   - Calculates real-time active order count per technician.
   - Frees workload when orders enter "Waiting for Parts" bottleneck.

6. **Client-Side Persistence (`localStorage`)**:
   - Preserves all plant data across browser restarts via `JSON.stringify()` / `JSON.parse()`.

---

## 🎓 Web Programming Lab Viva Explanation Guide

If asked by the external examiner during the lab viva:

- **How is data persisted without a database?**
  > *"We use browser `localStorage` with `JSON.stringify()` to serialize JavaScript objects into key-value storage and `JSON.parse()` to retrieve them when rendering tables. This keeps the application fully functional and persistent offline."*

- **How does the auto-assign technician algorithm work?**
  > *"In `js/common.js`, `autoAssignTechnician()` inspects the equipment type or problem description, matches it against specialized skill keywords in `SKILL_KEYWORD_MAP`, filters available technicians, and selects the qualified technician who currently has the lowest active workload."*

- **How are status badges and low-stock alerts determined?**
  > *"In `js/inventory.js`, each part's current quantity is compared against its minimum stock threshold (`item.quantity <= item.minStock`). If true, the system dynamically assigns the `badge-low-stock` CSS class."*

- **How do the pages stay synchronized?**
  > *"Each page modifies the shared `localStorage` arrays (`iemrs_equipment`, `iemrs_maintenance`, `iemrs_inventory`, etc.). When you navigate to Dashboard or Analytics, those scripts read the latest `localStorage` state and recalculate the statistics on the fly."*

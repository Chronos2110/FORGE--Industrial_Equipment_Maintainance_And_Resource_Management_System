# FORGE — Industrial Equipment Maintenance & Resource Management System (V5)

An enterprise-grade, production-hardened Industrial Operations, Computerized Maintenance Management System (CMMS), and Resource Allocation Platform engineered with a cleanly segregated architecture (`frontend/` and `backend/`), powered by **Express.js**, **Prisma ORM**, and **SQLite**, with pure semantic **HTML5/Vanilla CSS/JavaScript** frontend hydration.

---

## 📌 Architectural Overview (V5 Segregated Architecture)

FORGE is structured as a full-stack industrial web system featuring a decoupled frontend client and a transactional RESTful backend:

1. **Frontend Client (`frontend/`)**:
   - Zero-dependency, pure HTML5/CSS3/JavaScript interface.
   - Obsidian Black & Industrial Gold visual language (`#08090C` canvas, `#D49A3D` gold accents, `#28A745` operational status).
   - Dynamic SVG Industrial Floor Schematic with live plant bay overlays across all 6 production bays.
   - 4-Lane Preventive Maintenance Compliance Timeline (`Overdue / Critical`, `Due This Week`, `Upcoming Schedule`, `Completed / Verified`).
   - Drag-and-drop / stage-transitioning 4-stage Work Order Kanban Board (`Scheduled`, `Assigned`, `In Progress`, `Waiting for Parts`, `Completed`).
   - Full-stack hydration engine (`ForgeApiClient.hydrateAll()` and `ForgeDataService`) that mirrors backend Prisma records directly into the UI.

2. **Backend Engine (`backend/`)**:
   - Node.js & Express REST API running on port `5000` with JWT cookie/header authentication and Role-Based Access Control (RBAC).
   - **Prisma ORM** interacting with an embedded, zero-config **SQLite** database (`backend/prisma/dev.db`).
   - Transactional business logic guaranteeing stockout protection, atomic inventory decrements upon order completion, and auto-rescheduling for PM tasks.
   - ISO-55000 compliant persistent `ActivityLog` audit trail capturing shift handovers, fault reports, work order dispatch, and equipment lifecycle events.

---

## 📂 Repository Structure

```
Mini-Project/
├── package.json                      # Root npm scripts (start, seed, test, dev)
├── README.md                         # Full-stack documentation & API specifications
│
├── frontend/                         # Pure Frontend Application Assets
│   ├── index.html                    # Industrial Marketing & Telemetry Landing Page
│   ├── login.html                    # Role-Gated Authentication Console
│   ├── register.html                 # Personnel Provisioning & Onboarding Terminal
│   ├── pages/
│   │   ├── dashboard.html            # Plant Operations Control Center & Bay Triage Strip
│   │   ├── equipment.html            # Machinery Catalog & Interactive Floor Schematic
│   │   ├── workorders.html           # 4-Stage Work Order Kanban & Auto-Assign Dispatch
│   │   ├── maintenance.html          # 4-Lane PM Compliance Timeline & Scheduler
│   │   ├── workforce.html            # Certified Technician Roster & Capacity Manager
│   │   ├── inventory.html            # Spare Parts Warehouse & Stockout Warning Desk
│   │   └── analytics.html            # Reliability Engineering, MTBF & MTTR Telemetry
│   ├── css/
│   │   ├── style.css                 # Industrial Technology Design Tokens & Grid Styles
│   │   └── bootstrap.min.css         # Bootstrap 5 Grid Framework
│   ├── js/
│   │   ├── common.js                 # Hydration engine, ForgeDataService, ForgeApiClient
│   │   ├── api.js                    # Dual-mode API adapter
│   │   ├── app.js                    # Session lifecycle & role authentication
│   │   ├── dashboard.js              # Schematic bay rendering & KPI calculators
│   │   ├── equipment.js              # Equipment registry & bay filter handlers
│   │   ├── workorders.js             # Kanban stage transitions & modal dispatch
│   │   ├── maintenance.js            # PM timeline rendering & auto-rescheduling UI
│   │   ├── workforce.js              # Technician onboarding & shift availability toggles
│   │   ├── inventory.js              # Stock restock & SKU threshold controllers
│   │   └── analytics.js              # MTBF/MTTR graphs & ISO-55000 audit drawer
│   └── assets/                       # SVG schematics and industrial iconography
│
└── backend/                          # Production-Grade Express & Prisma Backend
    ├── server.js                     # Express app setup, CORS, route mounting, static serving
    ├── prisma/
    │   ├── schema.prisma             # Relational schema (User, Equipment, WorkOrder, Parts, ActivityLog)
    │   ├── seed.js                   # Comprehensive plant database seeding script
    │   └── dev.db                    # Embedded SQLite plant database
    ├── src/
    │   ├── db.js                     # Shared PrismaClient singleton
    │   ├── middleware/
    │   │   └── auth.js               # JWT verification & RBAC role guards
    │   ├── utils/
    │   │   └── activity.js           # Shared ISO-55000 activity logging utility
    │   └── routes/
    │       ├── auth.js               # Login, register, /me, and PATCH /profile
    │       ├── equipment.js          # Machinery CRUD across Bay 01 to Bay 06
    │       ├── workOrders.js         # Work order dispatch, auto-assign, status transitions
    │       ├── maintenance.js        # PM schedules with auto +30 days rescheduling
    │       ├── workforce.js          # Technician roster onboarding & availability
    │       ├── inventory.js          # Spare parts inventory, restocking, stock alerts
    │       ├── faults.js             # Operator fault reporting & escalation to work orders
    │       ├── activity.js           # ISO-55000 audit log retrieval & manual log entries
    │       ├── analytics.js          # Plant-wide MTBF, MTTR, availability & personal metrics
    │       └── shell.js              # Command palette search, dock telemetry, factory reset
    └── test/
        └── backend_test.js           # 20-point enterprise integration test suite
```

---

## ⚡ Quick-Start Guide

### 1. Prerequisites
- **Node.js** (v18.x or higher)
- **npm** (v9.x or higher)

### 2. Installation & Setup
Clone the repository and install all project dependencies:
```bash
# Clone repository
git clone https://github.com/Chronos2110/FORGE--Industrial_Equipment_Maintainance_And_Resource_Management_System.git
cd Mini-Project

# Install backend dependencies & generate Prisma client
npm install
```

### 3. Populate Database (Seed Rich Industrial Data)
Seed SQLite with 8+ accounts, 12 machines across all 6 bays, 10 inventory SKUs (with 3 stockouts), 10 work orders, 8 PM timeline schedules, 4 fault reports, and 15 ISO-55000 audit logs:
```bash
npm run seed
```

### 4. Run Automated Integration Tests
Verify 100% backend health, RBAC security, transactional inventory deduction, and auto-rescheduling:
```bash
npm test
```

### 5. Launch Application
Start the unified full-stack server on `http://localhost:5000`:
```bash
npm start
```
Open your browser to `http://localhost:5000` (or `http://localhost:5000/login.html`).

---

## 🔑 Default Demo Credentials

FORGE comes pre-populated with accounts for every industrial operational tier:

| Role | Name | Email / Username | Password | Badge ID | Primary Assignment |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Administrator** | Marcus Vance | `admin@forge.io` (or `admin`) | `admin123` | `ADM-001` | Plant Control Bay |
| **Operator** | Elena Rostova | `operator@forge.io` (or `op_floor`) | `oper123` | `OP-104` | Bay 01 (Machining) |
| **Operator** | Kenji Sato | `operator2@forge.io` | `oper123` | `OP-105` | Bay 04 (Robotics) |
| **Technician (CNC)** | Rajesh Kumar | `rajesh@forge.io` (or `tech_rajesh`) | `tech123` | `TECH-01` | Bay 01 (`CNC Mechanics & Milling`) |
| **Technician (Hydraulics)**| Sarah Jenkins | `sarah@forge.io` | `tech123` | `TECH-02` | Bay 02 (`Hydraulic & Fluid Power`) |
| **Technician (Pneumatics)**| Vikram Patel | `vikram@forge.io` | `tech123` | `TECH-03` | Bay 03 (`Pneumatics & Compressors`) |
| **Technician (Electrical)**| David Chen | `david@forge.io` | `tech123` | `TECH-04` | Bay 04 (`Electrical Systems & PLC`) |
| **Technician (Piping)** | Alex Morgan | `alex@forge.io` | `tech123` | `TECH-05` | Bay 05 (`Pumps & Industrial Piping`) |
| **Technician (Sensors)** | Priya Sharma | `priya@forge.io` | `tech123` | `TECH-06` | Bay 06 (`Predictive Analytics & Sensors`) |

---

## 📡 RESTful API Documentation

All protected endpoints require an `Authorization: Bearer <JWT>` header or an authenticated `token` cookie.

### Authentication & Personnel (`/api/auth`)
- `POST /api/auth/register`: Create a new user (with automatic `TechnicianProfile` creation for technicians).
- `POST /api/auth/login`: Authenticate by email, username, or `badge_id`.
- `GET /api/auth/me`: Retrieve current authenticated user profile.
- `PATCH /api/auth/profile`: Update personal shift status (`Available`, `On Break`, `Off Shift`), assigned machine, and bay location.
- `POST /api/auth/logout`: Invalidate session and clear auth cookies.

### Industrial Equipment (`/api/equipment`)
- `GET /api/equipment`: Retrieve all machinery (supports `?status=` and `?bay=` filters).
- `GET /api/equipment/:id`: Retrieve single equipment asset with linked work orders and maintenance history.
- `POST /api/equipment`: Register new asset [Admin only].
- `PATCH /api/equipment/:id`: Update asset telemetry, status, health score, or bay [Admin & Tech].
- `DELETE /api/equipment/:id`: Cascade decommission equipment and clear linked history [Admin only].

### Work Orders & Dispatching (`/api/work-orders`)
- `GET /api/work-orders`: List all work orders (supports `?status=`, `?priority=`, and `?assigned_to=`).
- `GET /api/work-orders/:id`: Detailed work order inspection with spare parts bill.
- `POST /api/work-orders`: Dispatch a work order, link required spare parts, and update equipment status.
- `POST /api/work-orders/:id/auto-assign`: Algorithmic dispatch matching technician specialization to machine category with workload balancing.
- `PATCH /api/work-orders/:id/status`: Transition work order stage. Transitioning to `COMPLETED` automatically verifies inventory, atomically decrements spare part stock, decrements technician active workload, and restores machine status to `OPERATIONAL`.
- `DELETE /api/work-orders/:id`: Cancel and delete work order [Admin only].

### Preventive Maintenance (`/api/maintenance`)
- `GET /api/maintenance`: List scheduled PM tasks ordered by `next_due_date`.
- `GET /api/maintenance/:id`: Retrieve specific PM task.
- `POST /api/maintenance`: Schedule a recurring inspection [Admin only].
- `PATCH /api/maintenance/:id`: Update schedule or mark `COMPLETED`. When marked `COMPLETED`, automatically reschedules `next_due_date` by `+frequency_days` (default +30 days) and updates equipment `last_serviced_at`.
- `DELETE /api/maintenance/:id`: Remove PM schedule [Admin only].

### Workforce & Personnel Management (`/api/workforce`)
- `GET /api/workforce`: List certified technicians (Admin views full plant; Technician views self; Operator 403 Forbidden).
- `GET /api/workforce/:id`: Detailed technician record.
- `POST /api/workforce`: Onboard a new certified technician in a single database transaction [Admin only].
- `PATCH /api/workforce/:id`: Update technician specialization, certifications, bay assignment, and capacity limits.
- `PATCH /api/workforce/:id/availability`: Toggle technician shift status (`Available`, `On Break`, `Off Shift`).
- `DELETE /api/workforce/:id`: Offboard technician and unassign pending orders [Admin only].

### Warehouse Spare Parts Inventory (`/api/inventory`)
- `GET /api/inventory`: List all warehouse spare part SKUs.
- `GET /api/inventory/:id`: Inspect individual SKU stock and storage bin.
- `POST /api/inventory`: Register new spare part SKU [Admin only].
- `PATCH /api/inventory/:id` & `PATCH /api/inventory/:id/restock`: Restock stock quantities and modify minimum safety thresholds.
- `DELETE /api/inventory/:id`: Remove SKU from inventory registry [Admin only].

### Fault Reporting (`/api/faults`)
- `GET /api/faults`: List operator fault reports.
- `GET /api/faults/:id`: Inspect individual fault incident.
- `POST /api/faults`: File an operational fault report. `CRITICAL` severity automatically transitions the target machine status to `DOWN`.
- `POST /api/faults/:id/escalate`: Escalate fault into a linked maintenance work order in an atomic transaction [Admin & Tech].
- `DELETE /api/faults/:id`: Dismiss fault report [Admin only].

### ISO-55000 Audit Logging (`/api/activity`)
- `GET /api/activity`: Retrieve chronological audit trail records (supports `?category=` and `?limit=`).
- `POST /api/activity`: Record a manual shift handover or plant inspection event.

### Operations Telemetry & Shell (`/api/analytics`, `/api/search`, `/api/telemetry`, `/api/dev`)
- `GET /api/analytics/summary`: Quantitative plant analytics including MTBF (Mean Time Between Failures), MTTR (Mean Time to Repair), Availability percentage, and recent audit activity.
- `GET /api/search?q=<query>`: Fast search powering the Ctrl+K Command Palette across machines, work orders, and parts.
- `GET /api/telemetry/dock`: Live badge counter feeding the bottom Control Dock alert pill.
- `POST /api/dev/reset`: Re-runs factory seed script on demand [Admin only].

---

## 🧪 Enterprise Test Suite Verification

Run the integration test suite:
```bash
npm test
```

Expected output:
```
--- STARTING FORGE ENTERPRISE BACKEND INTEGRATION TESTS ---

✅ PASSED: API Health Check returns ONLINE
✅ PASSED: Admin login returns valid JWT token
✅ PASSED: Technician login returns technician role
✅ PASSED: Operator login returns operator role
✅ PASSED: GET /api/auth/me returns current session user (admin@forge.io)
✅ PASSED: Operator is forbidden (403) from accessing Workforce management
✅ PASSED: Operator is forbidden (403) from accessing Analytics telemetry
✅ PASSED: Admin retrieves full plant analytics (MTTR: 24h, MTBF: 2160h, Availability: 75%, Activity: 18 logs)
✅ PASSED: Operator reads filtered equipment list (returned 9 operational units across 6 bays)
✅ PASSED: Auto-assign algorithm assigned candidate: Rajesh Kumar
✅ PASSED: Transactional completion of WO-301 succeeded
✅ PASSED: Inventory deduction verified: PRT-103 stock correctly decremented to 3
✅ PASSED: Operator can report fault with CRITICAL severity
✅ PASSED: Equipment EQ004 status automatically transitioned to DOWN on CRITICAL fault
✅ PASSED: Fault escalated to linked Work Order: WO-539
✅ PASSED: Telemetry dock badge returns count: 7 alerts
✅ PASSED: Ctrl+K search returned 2 equipment matches
✅ PASSED: GET /api/activity retrieved 22 persistent ISO-55000 audit trail records
✅ PASSED: POST /api/activity persists custom operational audit entry
✅ PASSED: PATCH /api/auth/profile successfully updated personnel shift pattern and availability
✅ PASSED: Admin successfully onboarded new certified technician: Elena Rostova (Tech Test) [Robotic Welding & Automation]
✅ PASSED: PATCH /api/workforce/:id/availability updated technician shift availability
✅ PASSED: DELETE /api/workforce/:id cleanly offboarded test technician
✅ PASSED: POST /api/maintenance scheduled task: High-Pressure Booster Valve Inspection
✅ PASSED: PATCH /api/maintenance/:id marked task COMPLETED and auto-rescheduled next due date to 2026-11-19
✅ PASSED: DELETE /api/maintenance/:id removed test task
✅ PASSED: POST /api/inventory created spare part: High-Temperature Silicone O-Ring
✅ PASSED: PATCH /api/inventory/:id/restock incremented stock to 75
✅ PASSED: DELETE /api/inventory/:id deleted test part SKU

🎉 ALL 20 ENTERPRISE BACKEND INTEGRATION TESTS PASSED SUCCESSFULLY!
```

---

## 🔒 Security & Industry Compliance
- **ISO-55000 Standard**: Comprehensive lifecycle asset tracking, timestamped audit logging, and shift handover records.
- **Role-Based Access Control (RBAC)**: Strict separation of privileges preventing unauthorized equipment modifications or analytics viewing.
- **Transactional Integrity**: Multi-table updates executed via `prisma.$transaction()` preventing race conditions and inventory drift.
- **Fail-Safe Offline Mode**: If disconnected from the Express backend, `ForgeDataService` gracefully falls back to browser storage, guaranteeing zero plant downtime.

---

## 👨‍💻 Authors & Academic Context
Engineered as part of the Web Programming Laboratory (WPL) Mini-Project. Designed and implemented to demonstrate production-grade architectural segregation, modern relational modeling with Prisma ORM, and high-performance vanilla web development.

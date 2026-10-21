# FORGE — Industrial Equipment Maintenance & Resource Management

**A full-stack industrial operations management platform for equipment, maintenance, work orders, workforce coordination, and spare-parts inventory.**

FORGE brings essential maintenance and resource-management workflows into one centralized application. It is designed to help industrial teams track equipment conditions, organize maintenance activities, coordinate technicians, manage inventory, and review operational performance.

## Overview

Industrial equipment requires regular maintenance, timely fault reporting, skilled technicians, and readily available spare parts. When these activities are managed separately, delays and resource shortages can make maintenance harder to coordinate.

FORGE connects these workflows so that users can manage equipment records, schedule maintenance, create and assign work orders, report faults, track spare parts, and review activity through a shared system.

## Key Features

### Equipment Management
- Maintain an equipment registry with identifiers, categories, locations, operational status, and health information.
- View equipment records and their related work orders, maintenance schedules, and fault reports.
- Update equipment information and monitor reported faults.

### Maintenance Management
- Maintain preventive-maintenance schedules and due dates.
- Track maintenance compliance and completion.
- Connect maintenance activities to the relevant equipment and assigned personnel.

### Work Order Management
- Create and track maintenance work orders.
- Record work descriptions, priorities, equipment, assignments, and status.
- Match technician specializations to equipment categories when assigning work.
- Track required spare parts and their inventory impact.

### Fault Reporting
- Allow personnel to report equipment faults with descriptions and severity levels.
- Reflect critical and high-severity faults in equipment status.
- Escalate eligible fault reports into linked work orders to support follow-up.

### Workforce Management
- Maintain technician profiles, specializations, certifications, shifts, and availability.
- Track active workloads and concurrent work-order limits.
- Apply role-based permissions to workforce information.

### Spare-Parts Inventory
- Maintain part records, quantities, minimum stock thresholds, costs, storage locations, and suppliers.
- Identify parts that have reached or fallen below their minimum stock threshold.
- Support inventory updates and restocking workflows.

### Operational Analytics and Activity Logs
- Summarize equipment status, work orders, inventory risks, and maintenance activity.
- Calculate operational indicators such as equipment availability, Mean Time to Repair (MTTR), and Mean Time Between Failures (MTBF).
- Record significant actions in an activity log.

### Authentication and User Roles
FORGE supports three roles:
- **Administrator:** manages equipment, personnel, inventory, and operational workflows.
- **Technician:** accesses assigned work and relevant maintenance and technical information.
- **Operator:** views relevant operational information and reports equipment faults.

Access to protected API endpoints is controlled through authentication middleware and role-based authorization.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | HTML5, CSS3, Bootstrap 5, Vanilla JavaScript |
| Backend | Node.js, Express.js |
| Database | MongoDB, Mongoose |
| Authentication | JSON Web Tokens (JWT), bcryptjs |
| API | REST-style HTTP endpoints with JSON |
| Persistence and fallback | MongoDB with an in-memory MongoDB fallback; frontend localStorage caching |
| Testing | Node.js backend integration tests |

## Project Structure

```text
FORGE/
├── frontend/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── api.js
│   │   ├── common.js
│   │   ├── app.js
│   │   ├── dashboard.js
│   │   ├── equipment.js
│   │   ├── maintenance.js
│   │   ├── workorders.js
│   │   ├── workforce.js
│   │   ├── inventory.js
│   │   ├── analytics.js
│   │   └── register.js
│   └── pages/
│       ├── dashboard.html
│       ├── equipment.html
│       ├── maintenance.html
│       ├── workorders.html
│       ├── workforce.html
│       ├── inventory.html
│       └── analytics.html
├── backend/
│   ├── server.js
│   ├── src/
│   │   ├── db.js
│   │   ├── seed.js
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   ├── models/
│   │   │   └── index.js
│   │   ├── routes/
│   │   └── utils/
│   └── test/
│       └── backend_test.js
├── package.json
└── README.md
```

## Prerequisites

- Node.js and npm
- MongoDB, either a local instance or a configured MongoDB connection
- A modern web browser

The project also includes `mongodb-memory-server` as a fallback when a primary MongoDB connection cannot be established. This fallback is intended for development and testing, not persistent production storage.

## Getting Started

### 1. Clone the repository

```bash
git clone <YOUR_REPOSITORY_URL>
cd <YOUR_REPOSITORY_FOLDER>
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the repository root:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/forge_industrial
JWT_SECRET=replace_with_a_long_random_secret
NODE_ENV=development
```

Use a private, strong secret. Never commit `.env` or production credentials to GitHub.

### 4. Start the application

Ensure MongoDB is running, then execute:

```bash
npm start
```

Open `http://localhost:5000` in your browser. The Express server serves the frontend and API from the same origin.

### 5. Seed the database

To initialize the sample dataset, run:

```bash
npm run seed
```

Use sample data for demonstration and testing. Review the seed script before running it against an existing database.

### 6. Run backend integration tests

```bash
npm test
```

The integration tests exercise important API behavior, including authentication, role restrictions, and operational endpoints. A passing test suite is evidence of the scenarios covered by those tests, not proof that every feature or production security requirement has been verified.

## API Overview

The backend exposes endpoints for the following resources:

| Endpoint | Purpose |
|---|---|
| `/api/auth` | Registration, login, session, profile, and logout |
| `/api/equipment` | Equipment records |
| `/api/work-orders` | Work-order management |
| `/api/maintenance` | Maintenance schedules |
| `/api/faults` | Fault reporting and escalation |
| `/api/workforce` | Technician and workforce information |
| `/api/inventory` | Spare-parts inventory |
| `/api/analytics` | Operational analytics |
| `/api/activity` | Activity and audit records |
| `/api/health` | API health check |

Protected endpoints require a valid authentication token. Permissions depend on the user's role and the individual route.

## Sustainable Development Goals (SDGs)

FORGE has potential alignment with the following United Nations Sustainable Development Goals:

- **SDG 8 — Decent Work and Economic Growth:** supports more organized maintenance work, technician coordination, and operational efficiency.
- **SDG 9 — Industry, Innovation and Infrastructure:** supports equipment reliability, preventive maintenance, and better industrial resource coordination.
- **SDG 12 — Responsible Consumption and Production:** supports inventory visibility, maintenance planning, and more deliberate use of spare parts and equipment.

These are the project's intended contributions. Actual environmental, economic, or workplace improvements would need to be measured after implementation in a real operational setting.

## Current Scope and Limitations

FORGE is an academic full-stack prototype demonstrating industrial maintenance workflows and backend integration.

Before production deployment, it would require a security review, hardened secret management, validated input and error handling, stronger authorization and session controls, deployment configuration, persistent production database operations, backups, monitoring, and broader automated testing.

The application's demo data and calculated indicators should not be interpreted as verified live factory telemetry or measured real-world performance.

## Future Enhancements

- Industrial sensor and IoT integrations for verified equipment telemetry.
- Notifications for faults, overdue maintenance, and stock shortages.
- More detailed maintenance cost and reliability reporting.
- Deployment with production-grade monitoring, backups, and security controls.
- Measurement of maintenance efficiency, resource consumption, and waste reduction.

## Academic Project

FORGE demonstrates the application of frontend development, REST API design, database modeling, authentication, role-based access control, and connected industrial maintenance workflows.

**Project name:** FORGE  
**Full title:** Industrial Equipment Maintenance & Resource Management System

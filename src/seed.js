require('dotenv').config();
const bcrypt = require('bcryptjs');
const {
  connectDB,
  closeDB,
  users,
  technicianProfiles,
  equipment,
  inventory,
  workOrders,
  workOrderParts,
  maintenance,
  faults
} = require('./db');

async function seedData() {
  console.log('--- Starting Native MongoDB Database Seed ---');

  await connectDB();

  // Clear existing collections across all 8 core entities
  await workOrderParts.deleteMany({});
  await workOrders.deleteMany({});
  await faults.deleteMany({});
  await maintenance.deleteMany({});
  await inventory.deleteMany({});
  await equipment.deleteMany({});
  await technicianProfiles.deleteMany({});
  await users.deleteMany({});

  const saltRounds = 10;
  const adminPasswordHash = bcrypt.hashSync('admin123', saltRounds);
  const techPasswordHash = bcrypt.hashSync('tech123', saltRounds);
  const operPasswordHash = bcrypt.hashSync('oper123', saltRounds);

  // 1. Seed Users
  console.log('Seeding Users & Technicians in MongoDB...');
  const usersData = [
    {
      _id: '00000000-0000-0000-0000-000000000001',
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Admin User',
      email: 'admin@forge.industrial',
      password_hash: adminPasswordHash,
      role: 'ADMIN',
      bay_assignment: 'Control Room',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: '00000000-0000-0000-0000-000000000002',
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Rajesh Kumar',
      email: 'tech_rajesh@forge.industrial',
      password_hash: techPasswordHash,
      role: 'TECHNICIAN',
      bay_assignment: 'Production Floor',
      status: 'ACTIVE',
      technician_profile: {
        specialization: 'MECHANICAL',
        max_concurrent_wos: 3,
        active_wo_count: 0
      },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: '00000000-0000-0000-0000-000000000003',
      id: '00000000-0000-0000-0000-000000000003',
      name: 'Sarah Jenkins',
      email: 'tech_sarah@forge.industrial',
      password_hash: techPasswordHash,
      role: 'TECHNICIAN',
      bay_assignment: 'Workshop A',
      status: 'ACTIVE',
      technician_profile: {
        specialization: 'HYDRAULICS',
        max_concurrent_wos: 3,
        active_wo_count: 0
      },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: '00000000-0000-0000-0000-000000000004',
      id: '00000000-0000-0000-0000-000000000004',
      name: 'Vikram Patel',
      email: 'tech_vikram@forge.industrial',
      password_hash: techPasswordHash,
      role: 'TECHNICIAN',
      bay_assignment: 'Utility Area',
      status: 'ACTIVE',
      technician_profile: {
        specialization: 'MECHANICAL',
        max_concurrent_wos: 3,
        active_wo_count: 1
      },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: '00000000-0000-0000-0000-000000000005',
      id: '00000000-0000-0000-0000-000000000005',
      name: 'David Chen',
      email: 'tech_david@forge.industrial',
      password_hash: techPasswordHash,
      role: 'TECHNICIAN',
      bay_assignment: 'Production Floor',
      status: 'ACTIVE',
      technician_profile: {
        specialization: 'ELECTRICAL',
        max_concurrent_wos: 3,
        active_wo_count: 1
      },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: '00000000-0000-0000-0000-000000000006',
      id: '00000000-0000-0000-0000-000000000006',
      name: 'Alex Morgan',
      email: 'tech_alex@forge.industrial',
      password_hash: techPasswordHash,
      role: 'TECHNICIAN',
      bay_assignment: 'Cooling Plant',
      status: 'ACTIVE',
      technician_profile: {
        specialization: 'MECHANICAL',
        max_concurrent_wos: 3,
        active_wo_count: 0
      },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: '00000000-0000-0000-0000-000000000007',
      id: '00000000-0000-0000-0000-000000000007',
      name: 'Priya Sharma',
      email: 'tech_priya@forge.industrial',
      password_hash: techPasswordHash,
      role: 'TECHNICIAN',
      bay_assignment: 'Sensor Lab',
      status: 'OFF_SHIFT',
      technician_profile: {
        specialization: 'PLC_AUTOMATION',
        max_concurrent_wos: 3,
        active_wo_count: 0
      },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: '00000000-0000-0000-0000-000000000008',
      id: '00000000-0000-0000-0000-000000000008',
      name: 'Floor Operator',
      email: 'op_floor@forge.industrial',
      password_hash: operPasswordHash,
      role: 'OPERATOR',
      bay_assignment: 'Production Floor',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  await users.insertMany(usersData);

  // 1b. Seed Technician Profiles Collection (Table 2: technician_profiles)
  console.log('Seeding Technician Profiles in MongoDB...');
  const techProfilesData = usersData
    .filter(u => u.technician_profile)
    .map(u => ({
      _id: `tech-prof-${u.id}`,
      id: `tech-prof-${u.id}`,
      user_id: u.id,
      specialization: u.technician_profile.specialization,
      max_concurrent_wos: u.technician_profile.max_concurrent_wos,
      active_wo_count: u.technician_profile.active_wo_count,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  await technicianProfiles.insertMany(techProfilesData);

  // 2. Seed Equipment

  console.log('Seeding Equipment in MongoDB...');
  const equipmentData = [
    { _id: 'EQ001', id: 'EQ001', name: 'CNC Machine 01', category: 'CNC Machine', bay_location: 'Production Floor', status: 'OPERATIONAL', health_score: 95, last_serviced_at: new Date('2026-09-10T00:00:00Z'), createdAt: new Date(), updatedAt: new Date() },
    { _id: 'EQ002', id: 'EQ002', name: 'Hydraulic Press 02', category: 'Hydraulic Press', bay_location: 'Workshop A', status: 'MAINTENANCE', health_score: 68, last_serviced_at: new Date('2026-09-05T00:00:00Z'), createdAt: new Date(), updatedAt: new Date() },
    { _id: 'EQ003', id: 'EQ003', name: 'Compressor 04', category: 'Compressor', bay_location: 'Utility Area', status: 'DOWN', health_score: 42, last_serviced_at: new Date('2026-09-01T00:00:00Z'), createdAt: new Date(), updatedAt: new Date() },
    { _id: 'EQ004', id: 'EQ004', name: 'Lathe Machine 03', category: 'Lathe', bay_location: 'Production Floor', status: 'OPERATIONAL', health_score: 90, last_serviced_at: new Date('2026-09-12T00:00:00Z'), createdAt: new Date(), updatedAt: new Date() },
    { _id: 'EQ005', id: 'EQ005', name: 'Industrial Pump 01', category: 'Pump', bay_location: 'Cooling Plant', status: 'OPERATIONAL', health_score: 88, last_serviced_at: new Date('2026-08-28T00:00:00Z'), createdAt: new Date(), updatedAt: new Date() },
    { _id: 'EQ006', id: 'EQ006', name: 'Conveyor Belt 02', category: 'Conveyor', bay_location: 'Assembly Line 1', status: 'OPERATIONAL', health_score: 92, last_serviced_at: new Date('2026-09-15T00:00:00Z'), createdAt: new Date(), updatedAt: new Date() },
    { _id: 'EQ007', id: 'EQ007', name: 'Generator Unit 01', category: 'Generator', bay_location: 'Powerhouse', status: 'OPERATIONAL', health_score: 98, last_serviced_at: new Date('2026-08-20T00:00:00Z'), createdAt: new Date(), updatedAt: new Date() }
  ];

  await equipment.insertMany(equipmentData);

  // 3. Seed Inventory Parts
  console.log('Seeding Inventory Parts in MongoDB...');
  const partsData = [
    { _id: 'PRT-101', id: 'PRT-101', name: 'Hydraulic Filter HF-90', category: 'Filters', quantity_on_hand: 3, min_threshold: 5, unit_cost: 145.50, storage_bin: 'Bin A-12', createdAt: new Date(), updatedAt: new Date() },
    { _id: 'PRT-102', id: 'PRT-102', name: 'Machine Oil ISO VG 46', category: 'Lubricants', quantity_on_hand: 5, min_threshold: 10, unit_cost: 65.00, storage_bin: 'Bin B-04', createdAt: new Date(), updatedAt: new Date() },
    { _id: 'PRT-103', id: 'PRT-103', name: 'Deep Groove Ball Bearings 6205', category: 'Bearings', quantity_on_hand: 4, min_threshold: 8, unit_cost: 32.50, storage_bin: 'Bin C-09', createdAt: new Date(), updatedAt: new Date() },
    { _id: 'PRT-104', id: 'PRT-104', name: 'Drive Belt V-B52', category: 'Mechanical', quantity_on_hand: 18, min_threshold: 6, unit_cost: 48.00, storage_bin: 'Bin D-01', createdAt: new Date(), updatedAt: new Date() },
    { _id: 'PRT-105', id: 'PRT-105', name: 'Pressure Relief Valve 200B', category: 'Mechanical', quantity_on_hand: 12, min_threshold: 4, unit_cost: 220.00, storage_bin: 'Bin E-07', createdAt: new Date(), updatedAt: new Date() },
    { _id: 'PRT-106', id: 'PRT-106', name: 'Contactor Relay 24V DC', category: 'Electrical', quantity_on_hand: 25, min_threshold: 5, unit_cost: 75.00, storage_bin: 'Bin F-03', createdAt: new Date(), updatedAt: new Date() }
  ];

  await inventory.insertMany(partsData);

  // 4. Seed Work Orders
  console.log('Seeding Work Orders in MongoDB...');
  const workOrdersData = [
    {
      _id: 'WO-301',
      id: 'WO-301',
      title: 'Compressor vibration & pressure drop',
      description: 'Pressure drop below 120 bar and unusual vibration',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      created_at: new Date('2026-09-20T08:30:00Z'),
      completed_at: null,
      equipment_id: 'EQ003',
      assigned_to: '00000000-0000-0000-0000-000000000004',
      created_by: '00000000-0000-0000-0000-000000000001',
      parts_required: [
        { part_id: 'PRT-103', quantity_required: 1, quantity_deducted: false }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: 'WO-302',
      id: 'WO-302',
      title: 'Hydraulic cylinder seal leakage',
      description: 'Cylinder seal leakage and fluid temperature high',
      priority: 'HIGH',
      status: 'ASSIGNED',
      created_at: new Date('2026-09-21T09:45:00Z'),
      completed_at: null,
      equipment_id: 'EQ002',
      assigned_to: '00000000-0000-0000-0000-000000000003',
      created_by: '00000000-0000-0000-0000-000000000001',
      parts_required: [
        { part_id: 'PRT-101', quantity_required: 2, quantity_deducted: false }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: 'WO-303',
      id: 'WO-303',
      title: 'Tool holder alignment calibration',
      description: 'Tool holder alignment calibration required',
      priority: 'MEDIUM',
      status: 'ASSIGNED',
      created_at: new Date('2026-09-19T11:00:00Z'),
      completed_at: null,
      equipment_id: 'EQ004',
      assigned_to: '00000000-0000-0000-0000-000000000005',
      created_by: '00000000-0000-0000-0000-000000000001',
      parts_required: [],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: 'WO-304',
      id: 'WO-304',
      title: 'Suction valve inspection',
      description: 'Suction valve inspection and routine flush',
      priority: 'LOW',
      status: 'COMPLETED',
      created_at: new Date('2026-09-18T07:15:00Z'),
      completed_at: new Date('2026-09-18T16:30:00Z'),
      equipment_id: 'EQ005',
      assigned_to: '00000000-0000-0000-0000-000000000006',
      created_by: '00000000-0000-0000-0000-000000000001',
      parts_required: [],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: 'WO-305',
      id: 'WO-305',
      title: 'Spindle lubrication & tray cleaning',
      description: 'Spindle bearing lubrication and chip tray cleaning',
      priority: 'MEDIUM',
      status: 'OPEN',
      created_at: new Date('2026-09-21T14:20:00Z'),
      completed_at: null,
      equipment_id: 'EQ001',
      assigned_to: null,
      created_by: '00000000-0000-0000-0000-000000000001',
      parts_required: [
        { part_id: 'PRT-102', quantity_required: 1, quantity_deducted: false }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: 'WO-306',
      id: 'WO-306',
      title: 'Drive belt replacement',
      description: 'Belt tension adjustment on drive pulley',
      priority: 'LOW',
      status: 'COMPLETED',
      created_at: new Date('2026-09-15T10:00:00Z'),
      completed_at: new Date('2026-09-15T14:45:00Z'),
      equipment_id: 'EQ006',
      assigned_to: '00000000-0000-0000-0000-000000000002',
      created_by: '00000000-0000-0000-0000-000000000001',
      parts_required: [
        { part_id: 'PRT-104', quantity_required: 1, quantity_deducted: true }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  await workOrders.insertMany(workOrdersData);

  // 4b. Seed Work Order Parts Collection (Table 2: work_order_parts)
  console.log('Seeding Work Order Parts in MongoDB...');
  const workOrderPartsData = [];
  workOrdersData.forEach(wo => {
    (wo.parts_required || []).forEach((p, idx) => {
      workOrderPartsData.push({
        _id: `wop-${wo.id}-${idx + 1}`,
        id: `wop-${wo.id}-${idx + 1}`,
        work_order_id: wo.id,
        part_id: p.part_id,
        quantity_required: p.quantity_required,
        quantity_deducted: p.quantity_deducted || false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    });
  });
  if (workOrderPartsData.length > 0) {
    await workOrderParts.insertMany(workOrderPartsData);
  }

  // 5. Seed Maintenance Schedules
  console.log('Seeding Maintenance Schedules in MongoDB...');
  const maintenanceData = [
    { _id: 'PM-301', id: 'PM-301', task_name: 'CNC Spindle & Way Lube Inspection', frequency_days: 14, next_due_date: new Date('2026-09-24T00:00:00Z'), compliance_status: 'SCHEDULED', equipment_id: 'EQ001', assigned_tech_id: '00000000-0000-0000-0000-000000000002', createdAt: new Date(), updatedAt: new Date() },
    { _id: 'PM-302', id: 'PM-302', task_name: 'Hydraulic Fluid & Valve Pressure Check', frequency_days: 21, next_due_date: new Date('2026-09-22T00:00:00Z'), compliance_status: 'SCHEDULED', equipment_id: 'EQ002', assigned_tech_id: '00000000-0000-0000-0000-000000000003', createdAt: new Date(), updatedAt: new Date() },
    { _id: 'PM-303', id: 'PM-303', task_name: 'Air Compressor Filter & Valve Check', frequency_days: 14, next_due_date: new Date('2026-09-20T00:00:00Z'), compliance_status: 'OVERDUE', equipment_id: 'EQ003', assigned_tech_id: '00000000-0000-0000-0000-000000000004', createdAt: new Date(), updatedAt: new Date() },
    { _id: 'PM-304', id: 'PM-304', task_name: 'Lathe Bed Alignment & Chuck Greasing', frequency_days: 30, next_due_date: new Date('2026-09-30T00:00:00Z'), compliance_status: 'SCHEDULED', equipment_id: 'EQ004', assigned_tech_id: '00000000-0000-0000-0000-000000000005', createdAt: new Date(), updatedAt: new Date() },
    { _id: 'PM-305', id: 'PM-305', task_name: 'Industrial Pump Impeller & Seal Test', frequency_days: 30, next_due_date: new Date('2026-10-05T00:00:00Z'), compliance_status: 'COMPLETED', equipment_id: 'EQ005', assigned_tech_id: '00000000-0000-0000-0000-000000000006', createdAt: new Date(), updatedAt: new Date() },
    { _id: 'PM-306', id: 'PM-306', task_name: 'Conveyor Roller Alignment & Tension', frequency_days: 14, next_due_date: new Date('2026-10-02T00:00:00Z'), compliance_status: 'COMPLETED', equipment_id: 'EQ006', assigned_tech_id: '00000000-0000-0000-0000-000000000002', createdAt: new Date(), updatedAt: new Date() }
  ];

  await maintenance.insertMany(maintenanceData);

  // 6. Seed Fault Reports
  console.log('Seeding Fault Reports in MongoDB...');
  const faultsData = [
    {
      _id: 'FLT-001',
      id: 'FLT-001',
      equipment_id: 'EQ003',
      reported_by: '00000000-0000-0000-0000-000000000008',
      severity: 'HIGH',
      description: 'Pressure drop below 120 bar and unusual vibration detected',
      status: 'CONVERTED_TO_WO',
      linked_wo_id: 'WO-301',
      created_at: new Date('2026-09-20T08:00:00Z')
    },
    {
      _id: 'FLT-002',
      id: 'FLT-002',
      equipment_id: 'EQ002',
      reported_by: '00000000-0000-0000-0000-000000000008',
      severity: 'HIGH',
      description: 'Cylinder seal visibly leaking, fluid on floor near machine',
      status: 'CONVERTED_TO_WO',
      linked_wo_id: 'WO-302',
      created_at: new Date('2026-09-21T09:30:00Z')
    },
    {
      _id: 'FLT-003',
      id: 'FLT-003',
      equipment_id: 'EQ001',
      reported_by: '00000000-0000-0000-0000-000000000008',
      severity: 'MEDIUM',
      description: 'Spindle overheating at high RPM, unusual noise reported',
      status: 'REPORTED',
      linked_wo_id: null,
      created_at: new Date('2026-09-28T07:15:00Z')
    }
  ];

  await faults.insertMany(faultsData);

  // 7. Create Indexes according to Relational Database Schema specification
  console.log('Building MongoDB Indexes for fast queries & unique constraints...');
  try {
    await users.createIndex({ email: 1 }, { unique: true });
    await technicianProfiles.createIndex({ user_id: 1 }, { unique: true });
    await equipment.createIndex({ status: 1 });
    await equipment.createIndex({ bay_location: 1 });
    await workOrders.createIndex({ equipment_id: 1 });
    await workOrders.createIndex({ assigned_to: 1 });
    await workOrders.createIndex({ status: 1 });
    await workOrderParts.createIndex({ work_order_id: 1 });
    await workOrderParts.createIndex({ part_id: 1 });
    await maintenance.createIndex({ equipment_id: 1 });
    await maintenance.createIndex({ assigned_tech_id: 1 });
    await faults.createIndex({ equipment_id: 1 });
    await faults.createIndex({ reported_by: 1 });
  } catch (idxErr) {
    console.log('Index setup note:', idxErr.message);
  }

  console.log('--- Native MongoDB Database Seed Completed Successfully ---');
}

if (require.main === module) {
  seedData()
    .catch((err) => {
      console.error('MongoDB Seed Error:', err);
      process.exit(1);
    })
    .finally(async () => {
      await closeDB();
    });
}

module.exports = { seedData };

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Database Seed ---');

  // Clear existing records in correct foreign key order
  await prisma.workOrderPart.deleteMany({});
  await prisma.faultReport.deleteMany({});
  await prisma.maintenanceSchedule.deleteMany({});
  await prisma.workOrder.deleteMany({});
  await prisma.technicianProfile.deleteMany({});
  await prisma.inventoryPart.deleteMany({});
  await prisma.equipment.deleteMany({});
  await prisma.user.deleteMany({});

  const saltRounds = 10;
  const adminPasswordHash = bcrypt.hashSync('admin123', saltRounds);
  const techPasswordHash = bcrypt.hashSync('tech123', saltRounds);
  const operPasswordHash = bcrypt.hashSync('oper123', saltRounds);

  // 1. Seed Users & Technician Profiles
  console.log('Seeding Users & Technicians...');
  const adminUser = await prisma.user.create({
    data: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Admin User',
      email: 'admin@forge.industrial',
      password_hash: adminPasswordHash,
      role: 'ADMIN',
      bay_assignment: 'Control Room',
      status: 'ACTIVE'
    }
  });

  const techRajesh = await prisma.user.create({
    data: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Rajesh Kumar',
      email: 'tech_rajesh@forge.industrial',
      password_hash: techPasswordHash,
      role: 'TECHNICIAN',
      bay_assignment: 'Production Floor',
      status: 'ACTIVE',
      technician_profile: {
        create: {
          specialization: 'MECHANICAL',
          max_concurrent_wos: 3,
          active_wo_count: 0
        }
      }
    }
  });

  const techSarah = await prisma.user.create({
    data: {
      id: '00000000-0000-0000-0000-000000000003',
      name: 'Sarah Jenkins',
      email: 'tech_sarah@forge.industrial',
      password_hash: techPasswordHash,
      role: 'TECHNICIAN',
      bay_assignment: 'Workshop A',
      status: 'ACTIVE',
      technician_profile: {
        create: {
          specialization: 'HYDRAULICS',
          max_concurrent_wos: 3,
          active_wo_count: 0
        }
      }
    }
  });

  const techVikram = await prisma.user.create({
    data: {
      id: '00000000-0000-0000-0000-000000000004',
      name: 'Vikram Patel',
      email: 'tech_vikram@forge.industrial',
      password_hash: techPasswordHash,
      role: 'TECHNICIAN',
      bay_assignment: 'Utility Area',
      status: 'ACTIVE',
      technician_profile: {
        create: {
          specialization: 'MECHANICAL',
          max_concurrent_wos: 3,
          active_wo_count: 1
        }
      }
    }
  });

  const techDavid = await prisma.user.create({
    data: {
      id: '00000000-0000-0000-0000-000000000005',
      name: 'David Chen',
      email: 'tech_david@forge.industrial',
      password_hash: techPasswordHash,
      role: 'TECHNICIAN',
      bay_assignment: 'Production Floor',
      status: 'ACTIVE',
      technician_profile: {
        create: {
          specialization: 'ELECTRICAL',
          max_concurrent_wos: 3,
          active_wo_count: 1
        }
      }
    }
  });

  const techAlex = await prisma.user.create({
    data: {
      id: '00000000-0000-0000-0000-000000000006',
      name: 'Alex Morgan',
      email: 'tech_alex@forge.industrial',
      password_hash: techPasswordHash,
      role: 'TECHNICIAN',
      bay_assignment: 'Cooling Plant',
      status: 'ACTIVE',
      technician_profile: {
        create: {
          specialization: 'MECHANICAL',
          max_concurrent_wos: 3,
          active_wo_count: 0
        }
      }
    }
  });

  const techPriya = await prisma.user.create({
    data: {
      id: '00000000-0000-0000-0000-000000000007',
      name: 'Priya Sharma',
      email: 'tech_priya@forge.industrial',
      password_hash: techPasswordHash,
      role: 'TECHNICIAN',
      bay_assignment: 'Sensor Lab',
      status: 'OFF_SHIFT',
      technician_profile: {
        create: {
          specialization: 'PLC_AUTOMATION',
          max_concurrent_wos: 3,
          active_wo_count: 0
        }
      }
    }
  });

  const operatorUser = await prisma.user.create({
    data: {
      id: '00000000-0000-0000-0000-000000000008',
      name: 'Floor Operator',
      email: 'op_floor@forge.industrial',
      password_hash: operPasswordHash,
      role: 'OPERATOR',
      bay_assignment: 'Production Floor',
      status: 'ACTIVE'
    }
  });

  // 2. Seed Equipment
  console.log('Seeding Equipment...');
  const equipmentData = [
    { id: 'EQ001', name: 'CNC Machine 01', category: 'CNC Machine', bay_location: 'Production Floor', status: 'OPERATIONAL', health_score: 95, last_serviced_at: new Date('2026-09-10T00:00:00Z') },
    { id: 'EQ002', name: 'Hydraulic Press 02', category: 'Hydraulic Press', bay_location: 'Workshop A', status: 'MAINTENANCE', health_score: 68, last_serviced_at: new Date('2026-09-05T00:00:00Z') },
    { id: 'EQ003', name: 'Compressor 04', category: 'Compressor', bay_location: 'Utility Area', status: 'DOWN', health_score: 42, last_serviced_at: new Date('2026-09-01T00:00:00Z') },
    { id: 'EQ004', name: 'Lathe Machine 03', category: 'Lathe', bay_location: 'Production Floor', status: 'OPERATIONAL', health_score: 90, last_serviced_at: new Date('2026-09-12T00:00:00Z') },
    { id: 'EQ005', name: 'Industrial Pump 01', category: 'Pump', bay_location: 'Cooling Plant', status: 'OPERATIONAL', health_score: 88, last_serviced_at: new Date('2026-08-28T00:00:00Z') },
    { id: 'EQ006', name: 'Conveyor Belt 02', category: 'Conveyor', bay_location: 'Assembly Line 1', status: 'OPERATIONAL', health_score: 92, last_serviced_at: new Date('2026-09-15T00:00:00Z') },
    { id: 'EQ007', name: 'Generator Unit 01', category: 'Generator', bay_location: 'Powerhouse', status: 'OPERATIONAL', health_score: 98, last_serviced_at: new Date('2026-08-20T00:00:00Z') }
  ];

  for (const eq of equipmentData) {
    await prisma.equipment.create({ data: eq });
  }

  // 3. Seed Inventory Parts
  console.log('Seeding Inventory Parts...');
  const partsData = [
    { id: 'PRT-101', name: 'Hydraulic Filter HF-90', category: 'Filters', quantity_on_hand: 3, min_threshold: 5, unit_cost: 145.50, storage_bin: 'Bin A-12' },
    { id: 'PRT-102', name: 'Machine Oil ISO VG 46', category: 'Lubricants', quantity_on_hand: 5, min_threshold: 10, unit_cost: 65.00, storage_bin: 'Bin B-04' },
    { id: 'PRT-103', name: 'Deep Groove Ball Bearings 6205', category: 'Bearings', quantity_on_hand: 4, min_threshold: 8, unit_cost: 32.50, storage_bin: 'Bin C-09' },
    { id: 'PRT-104', name: 'Drive Belt V-B52', category: 'Mechanical', quantity_on_hand: 18, min_threshold: 6, unit_cost: 48.00, storage_bin: 'Bin D-01' },
    { id: 'PRT-105', name: 'Pressure Relief Valve 200B', category: 'Mechanical', quantity_on_hand: 12, min_threshold: 4, unit_cost: 220.00, storage_bin: 'Bin E-07' },
    { id: 'PRT-106', name: 'Contactor Relay 24V DC', category: 'Electrical', quantity_on_hand: 25, min_threshold: 5, unit_cost: 75.00, storage_bin: 'Bin F-03' }
  ];

  for (const part of partsData) {
    await prisma.inventoryPart.create({ data: part });
  }

  // 4. Seed Work Orders
  console.log('Seeding Work Orders...');
  const workOrdersData = [
    {
      id: 'WO-301',
      title: 'Compressor vibration & pressure drop',
      description: 'Pressure drop below 120 bar and unusual vibration',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      created_at: new Date('2026-09-20T08:30:00Z'),
      equipment_id: 'EQ003',
      assigned_to: techVikram.id,
      created_by: adminUser.id,
      parts: [
        { part_id: 'PRT-103', quantity_required: 1, quantity_deducted: false }
      ]
    },
    {
      id: 'WO-302',
      title: 'Hydraulic cylinder seal leakage',
      description: 'Cylinder seal leakage and fluid temperature high',
      priority: 'HIGH',
      status: 'ASSIGNED',
      created_at: new Date('2026-09-21T09:45:00Z'),
      equipment_id: 'EQ002',
      assigned_to: techSarah.id,
      created_by: adminUser.id,
      parts: [
        { part_id: 'PRT-101', quantity_required: 2, quantity_deducted: false }
      ]
    },
    {
      id: 'WO-303',
      title: 'Tool holder alignment calibration',
      description: 'Tool holder alignment calibration required',
      priority: 'MEDIUM',
      status: 'ASSIGNED',
      created_at: new Date('2026-09-19T11:00:00Z'),
      equipment_id: 'EQ004',
      assigned_to: techDavid.id,
      created_by: adminUser.id
    },
    {
      id: 'WO-304',
      title: 'Suction valve inspection',
      description: 'Suction valve inspection and routine flush',
      priority: 'LOW',
      status: 'COMPLETED',
      created_at: new Date('2026-09-18T07:15:00Z'),
      completed_at: new Date('2026-09-18T16:30:00Z'),
      equipment_id: 'EQ005',
      assigned_to: techAlex.id,
      created_by: adminUser.id
    },
    {
      id: 'WO-305',
      title: 'Spindle lubrication & tray cleaning',
      description: 'Spindle bearing lubrication and chip tray cleaning',
      priority: 'MEDIUM',
      status: 'OPEN',
      created_at: new Date('2026-09-21T14:20:00Z'),
      equipment_id: 'EQ001',
      assigned_to: null,
      created_by: adminUser.id,
      parts: [
        { part_id: 'PRT-102', quantity_required: 1, quantity_deducted: false }
      ]
    },
    {
      id: 'WO-306',
      title: 'Drive belt replacement',
      description: 'Belt tension adjustment on drive pulley',
      priority: 'LOW',
      status: 'COMPLETED',
      created_at: new Date('2026-09-15T10:00:00Z'),
      completed_at: new Date('2026-09-15T14:45:00Z'),
      equipment_id: 'EQ006',
      assigned_to: techRajesh.id,
      created_by: adminUser.id,
      parts: [
        { part_id: 'PRT-104', quantity_required: 1, quantity_deducted: true }
      ]
    }
  ];

  for (const wo of workOrdersData) {
    const { parts, ...woFields } = wo;
    const createdWo = await prisma.workOrder.create({ data: woFields });
    if (parts && parts.length > 0) {
      for (const p of parts) {
        await prisma.workOrderPart.create({
          data: {
            work_order_id: createdWo.id,
            part_id: p.part_id,
            quantity_required: p.quantity_required,
            quantity_deducted: p.quantity_deducted
          }
        });
      }
    }
  }

  // 5. Seed Maintenance Schedules
  console.log('Seeding Maintenance Schedules...');
  const maintenanceData = [
    { id: 'PM-301', task_name: 'CNC Spindle & Way Lube Inspection', frequency_days: 14, next_due_date: new Date('2026-09-24T00:00:00Z'), compliance_status: 'SCHEDULED', equipment_id: 'EQ001', assigned_tech_id: techRajesh.id },
    { id: 'PM-302', task_name: 'Hydraulic Fluid & Valve Pressure Check', frequency_days: 21, next_due_date: new Date('2026-09-22T00:00:00Z'), compliance_status: 'SCHEDULED', equipment_id: 'EQ002', assigned_tech_id: techSarah.id },
    { id: 'PM-303', task_name: 'Air Compressor Filter & Valve Check', frequency_days: 14, next_due_date: new Date('2026-09-20T00:00:00Z'), compliance_status: 'OVERDUE', equipment_id: 'EQ003', assigned_tech_id: techVikram.id },
    { id: 'PM-304', task_name: 'Lathe Bed Alignment & Chuck Greasing', frequency_days: 30, next_due_date: new Date('2026-09-30T00:00:00Z'), compliance_status: 'SCHEDULED', equipment_id: 'EQ004', assigned_tech_id: techDavid.id },
    { id: 'PM-305', task_name: 'Industrial Pump Impeller & Seal Test', frequency_days: 30, next_due_date: new Date('2026-10-05T00:00:00Z'), compliance_status: 'COMPLETED', equipment_id: 'EQ005', assigned_tech_id: techAlex.id },
    { id: 'PM-306', task_name: 'Conveyor Roller Alignment & Tension', frequency_days: 14, next_due_date: new Date('2026-10-02T00:00:00Z'), compliance_status: 'COMPLETED', equipment_id: 'EQ006', assigned_tech_id: techRajesh.id }
  ];

  for (const m of maintenanceData) {
    await prisma.maintenanceSchedule.create({ data: m });
  }

  // 6. Seed Fault Reports
  console.log('Seeding Fault Reports...');
  const faultsData = [
    {
      id: 'FLT-001',
      equipment_id: 'EQ003',
      reported_by: operatorUser.id,
      severity: 'HIGH',
      description: 'Pressure drop below 120 bar and unusual vibration detected',
      status: 'CONVERTED_TO_WO',
      linked_wo_id: 'WO-301',
      created_at: new Date('2026-09-20T08:00:00Z')
    },
    {
      id: 'FLT-002',
      equipment_id: 'EQ002',
      reported_by: operatorUser.id,
      severity: 'HIGH',
      description: 'Cylinder seal visibly leaking, fluid on floor near machine',
      status: 'CONVERTED_TO_WO',
      linked_wo_id: 'WO-302',
      created_at: new Date('2026-09-21T09:30:00Z')
    },
    {
      id: 'FLT-003',
      equipment_id: 'EQ001',
      reported_by: operatorUser.id,
      severity: 'MEDIUM',
      description: 'Spindle overheating at high RPM, unusual noise reported',
      status: 'REPORTED',
      linked_wo_id: null,
      created_at: new Date('2026-09-28T07:15:00Z')
    }
  ];

  for (const f of faultsData) {
    await prisma.faultReport.create({ data: f });
  }

  console.log('--- Database Seed Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

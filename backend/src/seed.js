const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config();
const bcrypt = require('bcryptjs');

const { connectDB } = require('./db');
const {
  User,
  TechnicianProfile,
  Equipment,
  InventoryPart,
  WorkOrder,
  MaintenanceSchedule,
  FaultReport,
  ActivityLog
} = require('./models');

async function seedDatabase() {
  console.log('--- Starting Enterprise-Grade Database Seed (Milestone 11 - MongoDB) ---');
  await connectDB();

  // Clear existing collections
  await Promise.all([
    ActivityLog.deleteMany({}),
    FaultReport.deleteMany({}),
    MaintenanceSchedule.deleteMany({}),
    WorkOrder.deleteMany({}),
    TechnicianProfile.deleteMany({}),
    InventoryPart.deleteMany({}),
    Equipment.deleteMany({}),
    User.deleteMany({})
  ]);

  const saltRounds = 10;
  const adminPasswordHash = bcrypt.hashSync('admin123', saltRounds);
  const techPasswordHash = bcrypt.hashSync('tech123', saltRounds);
  const operPasswordHash = bcrypt.hashSync('oper123', saltRounds);

  // 1. Seed Users & Workforce
  console.log('Seeding Users & Workforce (Admins, Operators, and Certified Technicians)...');

  const adminUser = await User.create({
    _id: '00000000-0000-0000-0000-000000000001',
    name: 'Marcus Vance',
    email: 'admin@forge.io',
    password_hash: adminPasswordHash,
    role: 'ADMIN',
    badge_id: 'ADM-001',
    bay_assignment: 'Control Bay',
    shift_pattern: 'Day Shift',
    availability_status: 'Available',
    status: 'ACTIVE'
  });

  const operatorUser = await User.create({
    _id: '00000000-0000-0000-0000-000000000008',
    name: 'Elena Rostova',
    email: 'operator@forge.io',
    password_hash: operPasswordHash,
    role: 'OPERATOR',
    badge_id: 'OP-104',
    bay_assignment: 'Bay 01',
    shift_pattern: 'Shift A (06:00-14:00)',
    availability_status: 'Available',
    status: 'ACTIVE'
  });

  const operatorUser2 = await User.create({
    _id: '00000000-0000-0000-0000-000000000009',
    name: 'Kenji Sato',
    email: 'operator2@forge.io',
    password_hash: operPasswordHash,
    role: 'OPERATOR',
    badge_id: 'OP-105',
    bay_assignment: 'Bay 04',
    shift_pattern: 'Shift B (14:00-22:00)',
    availability_status: 'Available',
    status: 'ACTIVE'
  });

  // 6 Specialized Technicians (TECH-01 to TECH-06)
  const techRajesh = await User.create({
    _id: '00000000-0000-0000-0000-000000000002',
    name: 'Rajesh Kumar',
    email: 'rajesh@forge.io',
    password_hash: techPasswordHash,
    role: 'TECHNICIAN',
    badge_id: 'TECH-01',
    bay_assignment: 'Bay 01',
    shift_pattern: 'Day Shift',
    availability_status: 'Available',
    assigned_machine: 'EQ001 (5-Axis CNC Milling Center)',
    status: 'ACTIVE'
  });
  await TechnicianProfile.create({
    user_id: techRajesh._id,
    specialization: 'CNC Mechanics & Milling',
    certifications: 'ISO-9001 Safety / Master CNC Tech',
    max_concurrent_wos: 3,
    active_wo_count: 1
  });

  const techSarah = await User.create({
    _id: '00000000-0000-0000-0000-000000000003',
    name: 'Sarah Jenkins',
    email: 'sarah@forge.io',
    password_hash: techPasswordHash,
    role: 'TECHNICIAN',
    badge_id: 'TECH-02',
    bay_assignment: 'Bay 02',
    shift_pattern: 'Day Shift',
    availability_status: 'Busy',
    assigned_machine: 'EQ003 (Hydraulic Stamping Press 500T)',
    status: 'ACTIVE'
  });
  await TechnicianProfile.create({
    user_id: techSarah._id,
    specialization: 'Hydraulic & Fluid Power',
    certifications: 'IFPS Certified Fluid Power Specialist',
    max_concurrent_wos: 3,
    active_wo_count: 2
  });

  const techVikram = await User.create({
    _id: '00000000-0000-0000-0000-000000000004',
    name: 'Vikram Patel',
    email: 'vikram@forge.io',
    password_hash: techPasswordHash,
    role: 'TECHNICIAN',
    badge_id: 'TECH-03',
    bay_assignment: 'Bay 03',
    shift_pattern: 'Day Shift',
    availability_status: 'Busy',
    assigned_machine: 'EQ005 (Rotary Screw Compressor 01)',
    status: 'ACTIVE'
  });
  await TechnicianProfile.create({
    user_id: techVikram._id,
    specialization: 'Pneumatics & Compressors',
    certifications: 'CAGI Certified Compressed Air Master',
    max_concurrent_wos: 3,
    active_wo_count: 1
  });

  const techDavid = await User.create({
    _id: '00000000-0000-0000-0000-000000000005',
    name: 'David Chen',
    email: 'david@forge.io',
    password_hash: techPasswordHash,
    role: 'TECHNICIAN',
    badge_id: 'TECH-04',
    bay_assignment: 'Bay 04',
    shift_pattern: 'Night Shift',
    availability_status: 'Available',
    assigned_machine: 'EQ007 (Robotic Arc Welding Cell A)',
    status: 'ACTIVE'
  });
  await TechnicianProfile.create({
    user_id: techDavid._id,
    specialization: 'Electrical Systems & PLC',
    certifications: 'IEEE Automation & PLC Master Fellow',
    max_concurrent_wos: 3,
    active_wo_count: 1
  });

  const techAlex = await User.create({
    _id: '00000000-0000-0000-0000-000000000006',
    name: 'Alex Morgan',
    email: 'alex@forge.io',
    password_hash: techPasswordHash,
    role: 'TECHNICIAN',
    badge_id: 'TECH-05',
    bay_assignment: 'Bay 05',
    shift_pattern: 'Day Shift',
    availability_status: 'On Break',
    assigned_machine: 'EQ009 (Centrifugal Slurry Pump)',
    status: 'ACTIVE'
  });
  await TechnicianProfile.create({
    user_id: techAlex._id,
    specialization: 'Pumps & Industrial Piping',
    certifications: 'Hydraulic Institute Level III Master Inspector',
    max_concurrent_wos: 3,
    active_wo_count: 0
  });

  const techPriya = await User.create({
    _id: '00000000-0000-0000-0000-000000000007',
    name: 'Priya Sharma',
    email: 'priya@forge.io',
    password_hash: techPasswordHash,
    role: 'TECHNICIAN',
    badge_id: 'TECH-06',
    bay_assignment: 'Bay 06',
    shift_pattern: 'Off Shift',
    availability_status: 'Off Shift',
    assigned_machine: 'EQ011 (Bridge CMM Inspection)',
    status: 'OFF_SHIFT'
  });
  await TechnicianProfile.create({
    user_id: techPriya._id,
    specialization: 'Predictive Analytics & Sensors',
    certifications: 'ISO-18436 Vibration Analyst Cat III',
    max_concurrent_wos: 3,
    active_wo_count: 0
  });

  // 2. Seed Equipment Across All 6 Plant Bays (12 Assets: 9 OPERATIONAL, 2 MAINTENANCE, 1 DOWN)
  console.log('Seeding 12 Equipment Assets across all 6 plant bays...');
  const now = Date.now();
  const dayMs = 86400000;

  const equipmentData = [
    { _id: 'EQ001', name: '5-Axis CNC Milling Center 01', category: 'CNC Machine', bay_location: 'Bay 01', status: 'OPERATIONAL', health_score: 94, last_serviced_at: new Date(now - 10 * dayMs) },
    { _id: 'EQ002', name: 'High-Precision CNC Lathe 02', category: 'CNC Machine', bay_location: 'Bay 01', status: 'OPERATIONAL', health_score: 89, last_serviced_at: new Date(now - 18 * dayMs) },
    { _id: 'EQ003', name: 'Hydraulic Stamping Press 500T', category: 'Hydraulic Press', bay_location: 'Bay 02', status: 'MAINTENANCE', health_score: 65, last_serviced_at: new Date(now - 5 * dayMs) },
    { _id: 'EQ004', name: 'Deep Draw Hydraulic Former 02', category: 'Hydraulic Press', bay_location: 'Bay 02', status: 'OPERATIONAL', health_score: 92, last_serviced_at: new Date(now - 22 * dayMs) },
    { _id: 'EQ005', name: 'Rotary Screw Air Compressor 01', category: 'Compressor', bay_location: 'Bay 03', status: 'DOWN', health_score: 38, last_serviced_at: new Date(now - 35 * dayMs) },
    { _id: 'EQ006', name: 'High-Pressure Booster Station', category: 'Compressor', bay_location: 'Bay 03', status: 'OPERATIONAL', health_score: 96, last_serviced_at: new Date(now - 12 * dayMs) },
    { _id: 'EQ007', name: 'Robotic Arc Welding Cell A', category: 'Robotic Cell', bay_location: 'Bay 04', status: 'OPERATIONAL', health_score: 91, last_serviced_at: new Date(now - 15 * dayMs) },
    { _id: 'EQ008', name: 'Dual-Arm Spot Welding Station', category: 'Robotic Cell', bay_location: 'Bay 04', status: 'MAINTENANCE', health_score: 72, last_serviced_at: new Date(now - 8 * dayMs) },
    { _id: 'EQ009', name: 'High-Flow Centrifugal Slurry Pump', category: 'Pump', bay_location: 'Bay 05', status: 'OPERATIONAL', health_score: 88, last_serviced_at: new Date(now - 25 * dayMs) },
    { _id: 'EQ010', name: 'Reciprocating Chemical Feed Pump', category: 'Pump', bay_location: 'Bay 05', status: 'OPERATIONAL', health_score: 93, last_serviced_at: new Date(now - 14 * dayMs) },
    { _id: 'EQ011', name: 'Bridge Coordinate Measuring Machine (CMM)', category: 'CMM Inspection', bay_location: 'Bay 06', status: 'OPERATIONAL', health_score: 97, last_serviced_at: new Date(now - 7 * dayMs) },
    { _id: 'EQ012', name: 'Main Substation Diesel Generator', category: 'Generator', bay_location: 'Bay 06', status: 'OPERATIONAL', health_score: 99, last_serviced_at: new Date(now - 30 * dayMs) }
  ];

  await Equipment.insertMany(equipmentData);

  // 3. Seed Inventory Warehouse (10 Spare Part SKUs with 3 low-stock alert triggers)
  console.log('Seeding 10 Inventory Spare Part SKUs (3 stockout alerts)...');
  const partsData = [
    { _id: 'PRT-101', name: 'Hydraulic Filter HF-90', category: 'Filters', quantity_on_hand: 2, min_threshold: 6, unit_cost: 145.50, storage_bin: 'Rack A-12' },
    { _id: 'PRT-102', name: 'Machine Oil ISO VG 46 (Drum)', category: 'Lubricants', quantity_on_hand: 4, min_threshold: 10, unit_cost: 65.00, storage_bin: 'Rack B-04' },
    { _id: 'PRT-103', name: 'Deep Groove Ball Bearings 6205', category: 'Bearings', quantity_on_hand: 4, min_threshold: 8, unit_cost: 32.50, storage_bin: 'Drawer C-09' },
    { _id: 'PRT-104', name: 'Drive Belt V-B52 Reinforced', category: 'Mechanical', quantity_on_hand: 18, min_threshold: 6, unit_cost: 48.00, storage_bin: 'Rack D-01' },
    { _id: 'PRT-105', name: 'Pressure Relief Valve 200B', category: 'Hydraulics', quantity_on_hand: 12, min_threshold: 4, unit_cost: 220.00, storage_bin: 'Rack E-07' },
    { _id: 'PRT-106', name: 'Contactor Relay 24V DC', category: 'Electrical', quantity_on_hand: 25, min_threshold: 8, unit_cost: 75.00, storage_bin: 'Drawer F-03' },
    { _id: 'PRT-107', name: 'Optical Linear Scale Encoder', category: 'Sensors', quantity_on_hand: 14, min_threshold: 4, unit_cost: 310.00, storage_bin: 'Cabinet G-02' },
    { _id: 'PRT-108', name: 'Pneumatic Solenoid Valve 5/2', category: 'Pneumatics', quantity_on_hand: 16, min_threshold: 5, unit_cost: 95.00, storage_bin: 'Rack H-05' },
    { _id: 'PRT-109', name: 'Tungsten Carbide Milling Insert', category: 'Tooling', quantity_on_hand: 45, min_threshold: 15, unit_cost: 22.00, storage_bin: 'Drawer T-01' },
    { _id: 'PRT-110', name: 'Mechanical Face Seal Type 21', category: 'Pumps', quantity_on_hand: 11, min_threshold: 5, unit_cost: 115.00, storage_bin: 'Cabinet P-08' }
  ];

  await InventoryPart.insertMany(partsData);

  // 4. Seed Work Orders Across All Kanban Stages (10 Work Orders)
  console.log('Seeding 10 Work Orders across all Kanban stages...');
  const workOrdersData = [
    {
      _id: 'WO-301',
      title: 'Main Rotary Screw Compressor Overhaul',
      description: 'Sudden discharge pressure drop below 80 PSI accompanied by severe bearing chatter.',
      priority: 'CRITICAL',
      status: 'IN_PROGRESS',
      created_at: new Date(now - 2 * dayMs),
      equipment_id: 'EQ005',
      assigned_to: techVikram._id,
      created_by: adminUser._id,
      parts_required: [
        { part_id: 'PRT-103', quantity_required: 1, quantity_deducted: false }
      ]
    },
    {
      _id: 'WO-302',
      title: 'Hydraulic Main Ram Seal Replacement',
      description: 'Active fluid weeping along lower piston gland. High operating temperatures detected.',
      priority: 'HIGH',
      status: 'WAITING_FOR_PARTS',
      created_at: new Date(now - 1.5 * dayMs),
      equipment_id: 'EQ003',
      assigned_to: techSarah._id,
      created_by: adminUser._id,
      parts_required: [
        { part_id: 'PRT-101', quantity_required: 2, quantity_deducted: false }
      ]
    },
    {
      _id: 'WO-303',
      title: 'Spot Welder Electrode Gripper Calibration',
      description: 'Electrode pneumatic feed misalignment producing substandard weld seam depth.',
      priority: 'HIGH',
      status: 'ASSIGNED',
      created_at: new Date(now - 1 * dayMs),
      equipment_id: 'EQ008',
      assigned_to: techSarah._id,
      created_by: adminUser._id,
      parts_required: [
        { part_id: 'PRT-108', quantity_required: 1, quantity_deducted: false }
      ]
    },
    {
      _id: 'WO-304',
      title: '5-Axis Milling Spindle Bearings Vibration Analysis',
      description: 'Periodic harmonic vibration observed on Z-axis plunge at speeds exceeding 8000 RPM.',
      priority: 'MEDIUM',
      status: 'ASSIGNED',
      created_at: new Date(now - 12 * 3600000),
      equipment_id: 'EQ001',
      assigned_to: techRajesh._id,
      created_by: adminUser._id,
      parts_required: [
        { part_id: 'PRT-109', quantity_required: 2, quantity_deducted: false }
      ]
    },
    {
      _id: 'WO-305',
      title: 'CNC Lathe Way Lube Distribution Check',
      description: 'Way oil delivery pressure switch reporting intermittent low lubrication pressure.',
      priority: 'MEDIUM',
      status: 'OPEN',
      created_at: new Date(now - 8 * 3600000),
      equipment_id: 'EQ002',
      assigned_to: null,
      created_by: adminUser._id,
      parts_required: [
        { part_id: 'PRT-102', quantity_required: 1, quantity_deducted: false }
      ]
    },
    {
      _id: 'WO-306',
      title: 'Robotic Arc Cell Wire Feed Liner Cleansing',
      description: 'Routine quarterly wire feeder clearance and inert gas flow nozzle inspection.',
      priority: 'LOW',
      status: 'OPEN',
      created_at: new Date(now - 5 * 3600000),
      equipment_id: 'EQ007',
      assigned_to: null,
      created_by: adminUser._id,
      parts_required: []
    },
    {
      _id: 'WO-307',
      title: 'Substation ATS Transfer Switch Relay Diagnostics',
      description: 'Auto-transfer switch control contactor showing elevated contact resistance.',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      created_at: new Date(now - 16 * 3600000),
      equipment_id: 'EQ012',
      assigned_to: techDavid._id,
      created_by: adminUser._id,
      parts_required: [
        { part_id: 'PRT-106', quantity_required: 1, quantity_deducted: false }
      ]
    },
    {
      _id: 'WO-308',
      title: 'Centrifugal Slurry Pump Impeller Re-shimming',
      description: 'Clearance gap between wear plate and impeller exceeds allowable tolerance by 0.8mm.',
      priority: 'MEDIUM',
      status: 'WAITING_FOR_PARTS',
      created_at: new Date(now - 20 * 3600000),
      equipment_id: 'EQ009',
      assigned_to: techAlex._id,
      created_by: adminUser._id,
      parts_required: [
        { part_id: 'PRT-110', quantity_required: 1, quantity_deducted: false }
      ]
    },
    {
      _id: 'WO-309',
      title: 'CMM Optical Laser Probe Zero-Datum Calibration',
      description: 'Annual ISO 10360 certification verification using step gauge artifacts.',
      priority: 'LOW',
      status: 'COMPLETED',
      created_at: new Date(now - 3 * dayMs),
      completed_at: new Date(now - 2 * dayMs),
      equipment_id: 'EQ011',
      assigned_to: techPriya._id,
      created_by: adminUser._id,
      parts_required: []
    },
    {
      _id: 'WO-310',
      title: 'Hydraulic Forming Press Proportional Valve Flush',
      description: 'Flushed proportional directional valve spool and renewed fine mesh return filters.',
      priority: 'MEDIUM',
      status: 'COMPLETED',
      created_at: new Date(now - 5 * dayMs),
      completed_at: new Date(now - 4 * dayMs),
      equipment_id: 'EQ004',
      assigned_to: techSarah._id,
      created_by: adminUser._id,
      parts_required: [
        { part_id: 'PRT-105', quantity_required: 1, quantity_deducted: true }
      ]
    }
  ];

  await WorkOrder.insertMany(workOrdersData);

  // 5. Seed Preventive Maintenance Schedules (8 Schedules with dynamic dates)
  console.log('Seeding 8 Preventive Maintenance Schedules across all 4 timeline lanes...');
  const maintenanceData = [
    {
      _id: 'MN101',
      task_name: 'Rotary Compressor Air/Oil Separator Inspection',
      frequency_days: 14,
      next_due_date: new Date(now - 3 * dayMs),
      compliance_status: 'OVERDUE',
      equipment_id: 'EQ005',
      assigned_tech_id: techVikram._id
    },
    {
      _id: 'MN102',
      task_name: 'Hydraulic Stamping Press Strain Gauge Check',
      frequency_days: 21,
      next_due_date: new Date(now - 1 * dayMs),
      compliance_status: 'OVERDUE',
      equipment_id: 'EQ003',
      assigned_tech_id: techSarah._id
    },
    {
      _id: 'MN103',
      task_name: 'CNC Milling High-Speed Spindle Lubrication',
      frequency_days: 14,
      next_due_date: new Date(now + 2 * dayMs),
      compliance_status: 'SCHEDULED',
      equipment_id: 'EQ001',
      assigned_tech_id: techRajesh._id
    },
    {
      _id: 'MN104',
      task_name: 'Robotic Welding Arm Cable Harness Continuity',
      frequency_days: 30,
      next_due_date: new Date(now + 5 * dayMs),
      compliance_status: 'SCHEDULED',
      equipment_id: 'EQ007',
      assigned_tech_id: techDavid._id
    },
    {
      _id: 'MN105',
      task_name: 'Slurry Pump Mechanical Seal Flush & Pressure Test',
      frequency_days: 30,
      next_due_date: new Date(now + 14 * dayMs),
      compliance_status: 'SCHEDULED',
      equipment_id: 'EQ009',
      assigned_tech_id: techAlex._id
    },
    {
      _id: 'MN106',
      task_name: 'Substation Generator 250hr Load Bank Run',
      frequency_days: 60,
      next_due_date: new Date(now + 21 * dayMs),
      compliance_status: 'SCHEDULED',
      equipment_id: 'EQ012',
      assigned_tech_id: techDavid._id
    },
    {
      _id: 'MN107',
      task_name: 'Bridge CMM Laser Interferometer Verification',
      frequency_days: 30,
      next_due_date: new Date(now - 5 * dayMs),
      compliance_status: 'COMPLETED',
      equipment_id: 'EQ011',
      assigned_tech_id: techPriya._id
    },
    {
      _id: 'MN108',
      task_name: 'Deep Draw Former Pressure Relief Valve Recertification',
      frequency_days: 45,
      next_due_date: new Date(now - 7 * dayMs),
      compliance_status: 'COMPLETED',
      equipment_id: 'EQ004',
      assigned_tech_id: techSarah._id
    }
  ];

  await MaintenanceSchedule.insertMany(maintenanceData);

  // 6. Seed Operator Fault Reports (4 Reports)
  console.log('Seeding 4 Operator Fault Reports...');
  const faultsData = [
    {
      _id: 'FLT-001',
      equipment_id: 'EQ005',
      reported_by: operatorUser._id,
      severity: 'CRITICAL',
      description: 'Severe rattling vibration from compressor intake casing; air output dropped below 4.5 bar.',
      status: 'CONVERTED_TO_WO',
      linked_wo_id: 'WO-301',
      created_at: new Date(now - 2 * dayMs)
    },
    {
      _id: 'FLT-002',
      equipment_id: 'EQ003',
      reported_by: operatorUser._id,
      severity: 'HIGH',
      description: 'Hydraulic main cylinder seal visibly weeping; fluid pool accumulating on Bay 02 floor.',
      status: 'CONVERTED_TO_WO',
      linked_wo_id: 'WO-302',
      created_at: new Date(now - 1.5 * dayMs)
    },
    {
      _id: 'FLT-003',
      equipment_id: 'EQ008',
      reported_by: operatorUser2._id,
      severity: 'HIGH',
      description: 'Welding arm pneumatic clamp slipping during weld cycle; misaligned weld bead.',
      status: 'CONVERTED_TO_WO',
      linked_wo_id: 'WO-303',
      created_at: new Date(now - 1 * dayMs)
    },
    {
      _id: 'FLT-004',
      equipment_id: 'EQ002',
      reported_by: operatorUser._id,
      severity: 'MEDIUM',
      description: 'Tailstock guide rail friction higher than normal; chip wiper degraded on Z-axis.',
      status: 'REPORTED',
      linked_wo_id: null,
      created_at: new Date(now - 6 * 3600000)
    }
  ];

  await FaultReport.insertMany(faultsData);

  // 7. Seed ISO-55000 Activity Logs (15 Rich Entries)
  console.log('Seeding 15 ISO-55000 Audit Trail entries for Shift Handover Drawer...');
  const activityLogsData = [
    {
      _id: 'ACT-001',
      actor: 'Elena Rostova',
      role: 'OPERATOR',
      action: 'REPORTED_FAULT',
      target: 'FLT-001 (EQ005 Compressor Air Intake)',
      category: 'FAULTS',
      badge_class: 'badge-faulty',
      timestamp: new Date(now - 48 * 3600000)
    },
    {
      _id: 'ACT-002',
      actor: 'Marcus Vance',
      role: 'ADMIN',
      action: 'ESCALATED_FAULT_TO_WO',
      target: 'FLT-001 -> WO-301',
      category: 'WORK_ORDERS',
      badge_class: 'badge-scheduled',
      timestamp: new Date(now - 47 * 3600000)
    },
    {
      _id: 'ACT-003',
      actor: 'Marcus Vance',
      role: 'ADMIN',
      action: 'AUTO_ASSIGNED_TECHNICIAN',
      target: 'WO-301 -> Vikram Patel [Pneumatics & Compressors]',
      category: 'WORK_ORDERS',
      badge_class: 'badge-scheduled',
      timestamp: new Date(now - 46 * 3600000)
    },
    {
      _id: 'ACT-004',
      actor: 'Sarah Jenkins',
      role: 'TECHNICIAN',
      action: 'COMPLETED_PM',
      target: 'MN108 - Deep Draw Former Valve Recertification',
      category: 'MAINTENANCE',
      badge_class: 'badge-operational',
      timestamp: new Date(now - 40 * 3600000)
    },
    {
      _id: 'ACT-005',
      actor: 'Marcus Vance',
      role: 'ADMIN',
      action: 'RESTOCKED_PART',
      target: 'PRT-106 Contactor Relay 24V (+15 units)',
      category: 'INVENTORY',
      badge_class: 'badge-operational',
      timestamp: new Date(now - 36 * 3600000)
    },
    {
      _id: 'ACT-006',
      actor: 'Elena Rostova',
      role: 'OPERATOR',
      action: 'REPORTED_FAULT',
      target: 'FLT-002 (EQ003 Hydraulic Press Weeping)',
      category: 'FAULTS',
      badge_class: 'badge-faulty',
      timestamp: new Date(now - 32 * 3600000)
    },
    {
      _id: 'ACT-007',
      actor: 'Priya Sharma',
      role: 'TECHNICIAN',
      action: 'COMPLETED_WORK_ORDER',
      target: 'WO-309 (CMM Probe Calibration)',
      category: 'WORK_ORDERS',
      badge_class: 'badge-operational',
      timestamp: new Date(now - 28 * 3600000)
    },
    {
      _id: 'ACT-008',
      actor: 'David Chen',
      role: 'TECHNICIAN',
      action: 'STATUS_CHANGE_IN_PROGRESS',
      target: 'WO-307 - Substation ATS Transfer Relay',
      category: 'WORK_ORDERS',
      badge_class: 'badge-maintenance',
      timestamp: new Date(now - 24 * 3600000)
    },
    {
      _id: 'ACT-009',
      actor: 'Kenji Sato',
      role: 'OPERATOR',
      action: 'REPORTED_FAULT',
      target: 'FLT-003 (EQ008 Spot Welder Slipping)',
      category: 'FAULTS',
      badge_class: 'badge-faulty',
      timestamp: new Date(now - 20 * 3600000)
    },
    {
      _id: 'ACT-010',
      actor: 'Sarah Jenkins',
      role: 'TECHNICIAN',
      action: 'STATUS_CHANGE_WAITING_PARTS',
      target: 'WO-302 - Awaiting PRT-101 Gland Seals',
      category: 'WORK_ORDERS',
      badge_class: 'badge-scheduled',
      timestamp: new Date(now - 16 * 3600000)
    },
    {
      _id: 'ACT-011',
      actor: 'Rajesh Kumar',
      role: 'TECHNICIAN',
      action: 'SHIFT_STATUS_CHANGE',
      target: 'Rajesh Kumar -> Available (Bay 01)',
      category: 'SYSTEM',
      badge_class: 'badge-operational',
      timestamp: new Date(now - 12 * 3600000)
    },
    {
      _id: 'ACT-012',
      actor: 'Marcus Vance',
      role: 'ADMIN',
      action: 'REGISTERED_EQUIPMENT',
      target: 'EQ011 - Bridge CMM Inspection (Bay 06)',
      category: 'SYSTEM',
      badge_class: 'badge-operational',
      timestamp: new Date(now - 10 * 3600000)
    },
    {
      _id: 'ACT-013',
      actor: 'Elena Rostova',
      role: 'OPERATOR',
      action: 'REPORTED_FAULT',
      target: 'FLT-004 (EQ002 Lathe Tailstock Rail)',
      category: 'FAULTS',
      badge_class: 'badge-faulty',
      timestamp: new Date(now - 6 * 3600000)
    },
    {
      _id: 'ACT-014',
      actor: 'Vikram Patel',
      role: 'TECHNICIAN',
      action: 'STATUS_CHANGE_IN_PROGRESS',
      target: 'WO-301 - Compressor Overhaul Active Tear-down',
      category: 'WORK_ORDERS',
      badge_class: 'badge-maintenance',
      timestamp: new Date(now - 3 * 3600000)
    },
    {
      _id: 'ACT-015',
      actor: 'Marcus Vance',
      role: 'ADMIN',
      action: 'SHIFT_HANDOVER_DISPATCH',
      target: 'ISO-55000 Handover Log Verified by Plant Admin',
      category: 'SYSTEM',
      badge_class: 'badge-operational',
      timestamp: new Date(now - 30 * 60000)
    }
  ];

  await ActivityLog.insertMany(activityLogsData);

  console.log('--- Enterprise Plant Seed Completed Successfully (MongoDB) ---');
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed execution error:', err);
      process.exit(1);
    });
}

module.exports = { seedDatabase };

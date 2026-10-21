const mongoose = require('mongoose');
const crypto = require('crypto');

const baseSchemaOptions = {
  timestamps: false,
  versionKey: false,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id;
      return ret;
    }
  },
  toObject: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id;
      return ret;
    }
  }
};

// -------------------------------------------------------------
// 1. User Model
// -------------------------------------------------------------
const UserSchema = new mongoose.Schema({
  _id: { type: String, default: () => crypto.randomUUID() },
  badge_id: { type: String, default: null },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password_hash: { type: String, required: true },
  role: { type: String, default: 'OPERATOR', enum: ['ADMIN', 'TECHNICIAN', 'OPERATOR'] },
  bay_assignment: { type: String, default: 'Production Floor' },
  shift_pattern: { type: String, default: 'Day Shift' },
  assigned_machine: { type: String, default: null },
  availability_status: { type: String, default: 'Available' },
  status: { type: String, default: 'ACTIVE', enum: ['ACTIVE', 'OFF_SHIFT'] },
  created_at: { type: Date, default: Date.now }
}, baseSchemaOptions);

UserSchema.virtual('id').get(function () {
  return this._id;
});

UserSchema.virtual('technician_profile', {
  ref: 'TechnicianProfile',
  localField: '_id',
  foreignField: 'user_id',
  justOne: true
});

// -------------------------------------------------------------
// 2. TechnicianProfile Model
// -------------------------------------------------------------
const TechnicianProfileSchema = new mongoose.Schema({
  _id: { type: String, default: () => crypto.randomUUID() },
  user_id: { type: String, ref: 'User', required: true, unique: true },
  specialization: { type: String, default: 'General Machinery' },
  certifications: { type: String, default: 'ISO-9001 Safety / Master Tech' },
  max_concurrent_wos: { type: Number, default: 3 },
  active_wo_count: { type: Number, default: 0 }
}, baseSchemaOptions);

TechnicianProfileSchema.virtual('id').get(function () {
  return this._id;
});

TechnicianProfileSchema.virtual('user', {
  ref: 'User',
  localField: 'user_id',
  foreignField: '_id',
  justOne: true
});

// -------------------------------------------------------------
// 3. Equipment Model
// -------------------------------------------------------------
const EquipmentSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g., "EQ001"
  name: { type: String, required: true },
  category: { type: String, required: true },
  bay_location: { type: String, required: true },
  status: {
    type: String,
    default: 'OPERATIONAL',
    enum: ['OPERATIONAL', 'MAINTENANCE', 'WARNING', 'DOWN']
  },
  health_score: { type: Number, default: 100 },
  last_serviced_at: { type: Date, default: Date.now }
}, baseSchemaOptions);

EquipmentSchema.virtual('id').get(function () {
  return this._id;
});

EquipmentSchema.virtual('work_orders', {
  ref: 'WorkOrder',
  localField: '_id',
  foreignField: 'equipment_id'
});

EquipmentSchema.virtual('maintenance_schedules', {
  ref: 'MaintenanceSchedule',
  localField: '_id',
  foreignField: 'equipment_id'
});

EquipmentSchema.virtual('fault_reports', {
  ref: 'FaultReport',
  localField: '_id',
  foreignField: 'equipment_id'
});

// -------------------------------------------------------------
// 4. InventoryPart Model
// -------------------------------------------------------------
const InventoryPartSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g., "PRT-101"
  name: { type: String, required: true },
  category: { type: String, required: true },
  quantity_on_hand: { type: Number, default: 0, min: 0 },
  min_threshold: { type: Number, default: 5 },
  unit_cost: { type: Number, default: 50.0 },
  storage_bin: { type: String, default: 'Bin General' },
  supplier: { type: String, default: 'Industrial OEM Supply' }
}, baseSchemaOptions);

InventoryPartSchema.virtual('id').get(function () {
  return this._id;
});

// -------------------------------------------------------------
// 5. WorkOrderPart Subdocument Schema & WorkOrder Model
// -------------------------------------------------------------
const WorkOrderPartSchema = new mongoose.Schema({
  _id: { type: String, default: () => `WOP-${Math.floor(1000 + Math.random() * 9000)}` },
  part_id: { type: String, ref: 'InventoryPart', required: true },
  quantity_required: { type: Number, default: 1 },
  quantity_deducted: { type: Boolean, default: false }
}, baseSchemaOptions);

WorkOrderPartSchema.virtual('id').get(function () {
  return this._id;
});

WorkOrderPartSchema.virtual('part', {
  ref: 'InventoryPart',
  localField: 'part_id',
  foreignField: '_id',
  justOne: true
});

const WorkOrderSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g., "WO-301"
  title: { type: String, required: true },
  description: { type: String, default: '' },
  priority: { type: String, default: 'MEDIUM' },
  status: { type: String, default: 'OPEN' },
  created_at: { type: Date, default: Date.now },
  completed_at: { type: Date, default: null },
  equipment_id: { type: String, ref: 'Equipment', required: true },
  assigned_to: { type: String, ref: 'User', default: null },
  created_by: { type: String, ref: 'User', default: null },
  parts_required: [WorkOrderPartSchema]
}, baseSchemaOptions);

WorkOrderSchema.virtual('id').get(function () {
  return this._id;
});

WorkOrderSchema.virtual('equipment', {
  ref: 'Equipment',
  localField: 'equipment_id',
  foreignField: '_id',
  justOne: true
});

WorkOrderSchema.virtual('technician', {
  ref: 'User',
  localField: 'assigned_to',
  foreignField: '_id',
  justOne: true
});

WorkOrderSchema.virtual('creator', {
  ref: 'User',
  localField: 'created_by',
  foreignField: '_id',
  justOne: true
});

// -------------------------------------------------------------
// 6. MaintenanceSchedule Model
// -------------------------------------------------------------
const MaintenanceScheduleSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g., "MN101"
  task_name: { type: String, required: true },
  frequency_days: { type: Number, default: 30 },
  next_due_date: { type: Date, required: true },
  compliance_status: {
    type: String,
    default: 'SCHEDULED',
    enum: ['SCHEDULED', 'OVERDUE', 'COMPLETED']
  },
  equipment_id: { type: String, ref: 'Equipment', required: true },
  assigned_tech_id: { type: String, ref: 'User', default: null }
}, baseSchemaOptions);

MaintenanceScheduleSchema.virtual('id').get(function () {
  return this._id;
});

MaintenanceScheduleSchema.virtual('equipment', {
  ref: 'Equipment',
  localField: 'equipment_id',
  foreignField: '_id',
  justOne: true
});

MaintenanceScheduleSchema.virtual('assigned_tech', {
  ref: 'User',
  localField: 'assigned_tech_id',
  foreignField: '_id',
  justOne: true
});

// -------------------------------------------------------------
// 7. FaultReport Model
// -------------------------------------------------------------
const FaultReportSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g., "FLT-001"
  equipment_id: { type: String, ref: 'Equipment', required: true },
  reported_by: { type: String, ref: 'User', required: true },
  severity: { type: String, default: 'MEDIUM' },
  description: { type: String, required: true },
  status: {
    type: String,
    default: 'REPORTED',
    enum: ['REPORTED', 'CONVERTED_TO_WO', 'RESOLVED', 'DISMISSED']
  },
  linked_wo_id: { type: String, ref: 'WorkOrder', default: null },
  created_at: { type: Date, default: Date.now }
}, baseSchemaOptions);

FaultReportSchema.virtual('id').get(function () {
  return this._id;
});

FaultReportSchema.virtual('equipment', {
  ref: 'Equipment',
  localField: 'equipment_id',
  foreignField: '_id',
  justOne: true
});

FaultReportSchema.virtual('reporter', {
  ref: 'User',
  localField: 'reported_by',
  foreignField: '_id',
  justOne: true
});

FaultReportSchema.virtual('work_order', {
  ref: 'WorkOrder',
  localField: 'linked_wo_id',
  foreignField: '_id',
  justOne: true
});

// -------------------------------------------------------------
// 8. ActivityLog Model
// -------------------------------------------------------------
const ActivityLogSchema = new mongoose.Schema({
  _id: { type: String, default: () => `ACT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}` },
  timestamp: { type: Date, default: Date.now },
  actor: { type: String, required: true },
  role: { type: String, default: 'SYSTEM' },
  action: { type: String, required: true },
  target: { type: String, default: 'General' },
  category: { type: String, default: 'SYSTEM' },
  badge_class: { type: String, default: 'badge-operational' }
}, baseSchemaOptions);

ActivityLogSchema.virtual('id').get(function () {
  return this._id;
});

// Model registrations (prevent re-compilation in dev environments)
const User = mongoose.models.User || mongoose.model('User', UserSchema);
const TechnicianProfile = mongoose.models.TechnicianProfile || mongoose.model('TechnicianProfile', TechnicianProfileSchema);
const Equipment = mongoose.models.Equipment || mongoose.model('Equipment', EquipmentSchema);
const InventoryPart = mongoose.models.InventoryPart || mongoose.model('InventoryPart', InventoryPartSchema);
const WorkOrder = mongoose.models.WorkOrder || mongoose.model('WorkOrder', WorkOrderSchema);
const MaintenanceSchedule = mongoose.models.MaintenanceSchedule || mongoose.model('MaintenanceSchedule', MaintenanceScheduleSchema);
const FaultReport = mongoose.models.FaultReport || mongoose.model('FaultReport', FaultReportSchema);
const ActivityLog = mongoose.models.ActivityLog || mongoose.model('ActivityLog', ActivityLogSchema);

module.exports = {
  User,
  TechnicianProfile,
  Equipment,
  InventoryPart,
  WorkOrder,
  MaintenanceSchedule,
  FaultReport,
  ActivityLog
};

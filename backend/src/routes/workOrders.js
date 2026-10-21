const express = require('express');
const router = express.Router();
const { WorkOrder, Equipment, User, TechnicianProfile, InventoryPart, FaultReport } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

// Map specialization to equipment category keywords
function isSpecializationMatch(specialization, equipmentCategory) {
  if (!specialization || !equipmentCategory) return false;
  const spec = specialization.toUpperCase();
  const cat = equipmentCategory.toUpperCase();

  if (spec.includes('MECHANIC') && (cat.includes('CNC') || cat.includes('LATHE') || cat.includes('CONVEYOR') || cat.includes('MECHANICAL') || cat.includes('PUMP') || cat.includes('COMPRESSOR'))) {
    return true;
  }
  if (spec.includes('HYDRAULIC') && (cat.includes('HYDRAULIC') || cat.includes('PRESS') || cat.includes('FLUID'))) {
    return true;
  }
  if (spec.includes('ELECTRICAL') && (cat.includes('ELECTRICAL') || cat.includes('GENERATOR') || cat.includes('POWER') || cat.includes('PLC'))) {
    return true;
  }
  if (spec.includes('PLC') || spec.includes('AUTOMATION') || spec.includes('SENSOR')) {
    if (cat.includes('PLC') || cat.includes('AUTOMATION') || cat.includes('GENERATOR') || cat.includes('CNC') || cat.includes('MEASURING') || cat.includes('CMM') || cat.includes('SENSOR')) {
      return true;
    }
  }

  return spec.includes(cat) || cat.includes(spec);
}

// Format Work Order response for front-end compatibility
function formatWorkOrder(wo) {
  if (!wo) return null;
  const parts = wo.parts_required || [];
  const requiredPartItem = parts.length > 0 ? parts[0] : null;

  const eqName = wo.equipment ? (wo.equipment.name || wo.equipment) : wo.equipment_id;
  const techName = wo.technician ? (wo.technician.name || wo.technician) : (wo.assigned_to || 'Unassigned');
  const creatorName = wo.creator ? (wo.creator.name || wo.creator) : wo.created_by;
  const partName = requiredPartItem ? (requiredPartItem.part ? requiredPartItem.part.name : (requiredPartItem.name || requiredPartItem.part_id)) : '';

  return {
    id: wo.id || wo._id,
    title: wo.title,
    problem: wo.description,
    description: wo.description,
    priority: wo.priority,
    status: wo.status,
    created_at: wo.created_at,
    completed_at: wo.completed_at,
    date: wo.created_at ? new Date(wo.created_at).toISOString().split('T')[0] : '',
    scheduledDate: wo.created_at ? new Date(wo.created_at).toISOString().split('T')[0] : '',
    equipmentId: wo.equipment_id,
    equipment: eqName,
    equipmentObj: wo.equipment,
    technicianId: wo.assigned_to,
    technician: techName,
    technicianObj: wo.technician,
    createdBy: creatorName,
    requiredPartId: requiredPartItem ? requiredPartItem.part_id : '',
    requiredPart: partName,
    requiredQuantity: requiredPartItem ? requiredPartItem.quantity_required : 0,
    quantityDeducted: requiredPartItem ? requiredPartItem.quantity_deducted : false,
    parts_required: parts
  };
}

// GET /api/work-orders (Supports ?status=, ?priority=, and ?assigned_to= filters)
// Accessible by: ADMIN, TECHNICIAN, OPERATOR (all can view)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, priority, assigned_to } = req.query;
    const filter = {};

    if (status && status !== 'All') {
      filter.status = status;
    }

    if (priority && priority !== 'All') {
      filter.priority = priority;
    }

    if (assigned_to && assigned_to !== 'All') {
      filter.assigned_to = assigned_to;
    }

    const workOrders = await WorkOrder.find(filter)
      .sort({ created_at: -1 })
      .populate('equipment')
      .populate({
        path: 'technician',
        populate: { path: 'technician_profile' }
      })
      .populate('creator', 'id name email')
      .populate('parts_required.part');

    return res.json(workOrders.map(formatWorkOrder));
  } catch (err) {
    console.error('Error fetching work orders:', err);
    return res.status(500).json({ error: 'Failed to retrieve work orders', details: err.message });
  }
});

// GET /api/work-orders/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const wo = await WorkOrder.findById(req.params.id)
      .populate('equipment')
      .populate({
        path: 'technician',
        populate: { path: 'technician_profile' }
      })
      .populate('creator')
      .populate('parts_required.part');

    if (!wo) {
      return res.status(404).json({ error: `Work Order ${req.params.id} not found.` });
    }

    return res.json(formatWorkOrder(wo));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve work order', details: err.message });
  }
});

// POST /api/work-orders (Admin and Technician)
router.post('/', authenticateToken, requireRole(['ADMIN', 'TECHNICIAN']), async (req, res) => {
  try {
    const {
      id,
      title,
      description,
      problem,
      priority,
      status,
      equipment_id,
      equipment,
      assigned_to,
      technician,
      requiredPartId,
      requiredPart,
      requiredQuantity
    } = req.body;

    const woId = id || `WO-${Math.floor(100 + Math.random() * 900)}`;
    const woTitle = title || problem || description || 'Maintenance Work Order';
    const woDesc = description || problem || title || '';
    const woPriority = priority || 'MEDIUM';
    const woStatus = status || 'OPEN';

    // Resolve equipment_id if name was passed
    let resolvedEquipmentId = equipment_id;
    if (!resolvedEquipmentId && equipment) {
      const eq = await Equipment.findOne({
        $or: [{ _id: equipment }, { name: equipment }]
      });
      if (eq) resolvedEquipmentId = eq._id || eq.id;
    }

    if (!resolvedEquipmentId) {
      return res.status(400).json({ error: 'Valid equipment_id or equipment name is required.' });
    }

    // Resolve assigned_to technician if name was passed
    let resolvedTechId = assigned_to;
    if (!resolvedTechId && technician) {
      const techUser = await User.findOne({
        $or: [{ _id: technician }, { name: technician }, { email: technician }]
      });
      if (techUser) resolvedTechId = techUser._id || techUser.id;
    }

    // Resolve part_id if part name was passed
    let resolvedPartId = requiredPartId;
    if (!resolvedPartId && requiredPart) {
      const p = await InventoryPart.findOne({
        $or: [{ _id: requiredPart }, { name: requiredPart }]
      });
      if (p) resolvedPartId = p._id || p.id;
    }

    const partsList = [];
    if (resolvedPartId && requiredQuantity > 0) {
      partsList.push({
        part_id: resolvedPartId,
        quantity_required: parseInt(requiredQuantity, 10),
        quantity_deducted: false
      });
    }

    const finalStatus = resolvedTechId && woStatus === 'OPEN' ? 'ASSIGNED' : woStatus;

    const createdWo = await WorkOrder.create({
      _id: woId,
      title: woTitle,
      description: woDesc,
      priority: woPriority,
      status: finalStatus,
      equipment_id: resolvedEquipmentId,
      assigned_to: resolvedTechId || null,
      created_by: req.user.id,
      parts_required: partsList
    });

    // If assigned to a technician, increment active_wo_count
    if (resolvedTechId) {
      await TechnicianProfile.updateMany(
        { user_id: resolvedTechId },
        { $inc: { active_wo_count: 1 } }
      );
    }

    // If status is ASSIGNED or IN_PROGRESS, set equipment status to MAINTENANCE
    if (finalStatus === 'ASSIGNED' || finalStatus === 'IN_PROGRESS') {
      await Equipment.findByIdAndUpdate(resolvedEquipmentId, {
        status: 'MAINTENANCE'
      });
    }

    await logActivity({
      actor: req.user?.name || 'Supervisor',
      role: req.user?.role || 'ADMIN',
      action: 'CREATED_WORK_ORDER',
      target: `${createdWo.id || createdWo._id} - ${createdWo.title}`,
      category: 'WORK_ORDERS',
      badge_class: 'badge-scheduled'
    });

    const fullWo = await WorkOrder.findById(createdWo._id)
      .populate('equipment')
      .populate('technician')
      .populate('parts_required.part');

    return res.status(201).json(formatWorkOrder(fullWo));
  } catch (err) {
    console.error('Error creating work order:', err);
    return res.status(500).json({ error: 'Failed to create work order', details: err.message });
  }
});

// POST /api/work-orders/:id/auto-assign (Executes the technician matching algorithm)
// Accessible by: ADMIN and TECHNICIAN
router.post('/:id/auto-assign', authenticateToken, requireRole(['ADMIN', 'TECHNICIAN']), async (req, res) => {
  try {
    const { id } = req.params;

    const workOrder = await WorkOrder.findById(id).populate('equipment');

    if (!workOrder) {
      return res.status(404).json({ error: `Work Order ${id} not found.` });
    }

    // 1. Query users joined with technician_profiles where status = 'ACTIVE' and active_wo_count < max_concurrent_wos
    const candidates = await User.find({
      role: 'TECHNICIAN',
      status: 'ACTIVE'
    }).populate('technician_profile');

    const availableCandidates = candidates.filter(u => {
      const prof = u.technician_profile;
      return prof && prof.active_wo_count < prof.max_concurrent_wos;
    });

    if (availableCandidates.length === 0) {
      return res.status(400).json({
        error: 'No available technicians found. All technicians are currently at maximum workload or off-shift.'
      });
    }

    // 2. Rank candidates by matching specialization against equipment category first, then sort by lowest active_wo_count
    const eqCategory = workOrder.equipment ? workOrder.equipment.category : '';

    availableCandidates.sort((a, b) => {
      const aMatches = isSpecializationMatch(a.technician_profile?.specialization, eqCategory);
      const bMatches = isSpecializationMatch(b.technician_profile?.specialization, eqCategory);

      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;

      // Tiebreaker: sort by lowest active_wo_count
      const aCount = a.technician_profile ? a.technician_profile.active_wo_count : 0;
      const bCount = b.technician_profile ? b.technician_profile.active_wo_count : 0;
      return aCount - bCount;
    });

    const topCandidate = availableCandidates[0];
    const topCandidateId = topCandidate._id || topCandidate.id;
    const previousTechId = workOrder.assigned_to;

    // 3. Decrement previous technician's active count if previously assigned and not completed
    if (previousTechId && previousTechId !== topCandidateId && workOrder.status !== 'COMPLETED') {
      await TechnicianProfile.updateMany(
        { user_id: previousTechId, active_wo_count: { $gt: 0 } },
        { $inc: { active_wo_count: -1 } }
      );
    }

    // Increment new topCandidate's active count
    await TechnicianProfile.findOneAndUpdate(
      { user_id: topCandidateId },
      { $inc: { active_wo_count: 1 } }
    );

    // Update work order
    const updatedWo = await WorkOrder.findByIdAndUpdate(
      id,
      {
        assigned_to: topCandidateId,
        status: 'ASSIGNED'
      },
      { returnDocument: 'after' }
    )
      .populate('equipment')
      .populate({ path: 'technician', populate: { path: 'technician_profile' } })
      .populate('parts_required.part');

    await logActivity({
      actor: req.user?.name || 'Dispatcher',
      role: req.user?.role || 'ADMIN',
      action: 'AUTO_ASSIGNED_TECHNICIAN',
      target: `${workOrder.id || workOrder._id} -> ${topCandidate.name} (${topCandidate.technician_profile?.specialization})`,
      category: 'WORK_ORDERS',
      badge_class: 'badge-scheduled'
    });

    return res.json({
      success: true,
      message: `Assigned to ${topCandidate.name} [${topCandidate.technician_profile?.specialization}] based on category match and workload balance.`,
      workOrder: formatWorkOrder(updatedWo)
    });
  } catch (err) {
    console.error('Error auto-assigning technician:', err);
    return res.status(500).json({ error: 'Failed to auto-assign technician', details: err.message });
  }
});

// PATCH /api/work-orders/:id/status (Executes state transitions and transactional inventory deduction)
// Accessible by: ADMIN and TECHNICIAN
router.patch('/:id/status', authenticateToken, requireRole(['ADMIN', 'TECHNICIAN']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Target status is required.' });
    }

    const normalizedStatus = status.toUpperCase().replace(/\s+/g, '_');

    // Case 1: Work Order Completion and Inventory Sync
    if (normalizedStatus === 'COMPLETED') {
      // Step 1: Verify work order state
      const wo = await WorkOrder.findById(id).populate('equipment');

      if (!wo) {
        return res.status(404).json({ error: `Work order ${id} not found.` });
      }

      const currentStatus = (wo.status || '').toUpperCase().replace(/\s+/g, '_');
      if (currentStatus !== 'IN_PROGRESS' && currentStatus !== 'ASSIGNED' && currentStatus !== 'WAITING_FOR_PARTS') {
        return res.status(400).json({
          error: `Cannot complete Work Order ${id}: Current state is '${wo.status}'. Only IN_PROGRESS or ASSIGNED orders can be completed.`
        });
      }

      // Step 2: Query work_order_parts for all spare parts linked to the work order where quantity_deducted is false
      const parts = wo.parts_required || [];
      const unDeductedParts = parts.filter(p => !p.quantity_deducted);

      // Step 3: Verify inventory_parts.quantity_on_hand is sufficient for each required part
      for (const item of unDeductedParts) {
        const invPart = await InventoryPart.findById(item.part_id);

        if (!invPart) {
          return res.status(400).json({
            error: `Spare part SKU '${item.part_id}' not found in inventory.`
          });
        }

        if (invPart.quantity_on_hand < item.quantity_required) {
          return res.status(400).json({
            error: `Insufficient stock for SKU '${invPart.id || invPart._id}' (${invPart.name}): Required ${item.quantity_required}, available ${invPart.quantity_on_hand}. Transaction aborted.`
          });
        }
      }

      // Step 4: Deduct quantity_required from inventory_parts.quantity_on_hand and mark quantity_deducted = true
      for (const item of unDeductedParts) {
        await InventoryPart.findByIdAndUpdate(item.part_id, {
          $inc: { quantity_on_hand: -item.quantity_required }
        });
        item.quantity_deducted = true;
      }

      // Step 5: Decrement assigned technician's active_wo_count by 1
      if (wo.assigned_to) {
        await TechnicianProfile.updateMany(
          { user_id: wo.assigned_to, active_wo_count: { $gt: 0 } },
          { $inc: { active_wo_count: -1 } }
        );
      }

      // Step 6: Set status = "COMPLETED", record completed_at = NOW()
      wo.status = 'COMPLETED';
      wo.completed_at = new Date();
      await wo.save();

      // Check if other open work orders exist for that equipment
      const otherOpenWos = await WorkOrder.countDocuments({
        equipment_id: wo.equipment_id,
        _id: { $ne: id },
        status: { $in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_PARTS'] }
      });

      if (otherOpenWos === 0) {
        await Equipment.findByIdAndUpdate(wo.equipment_id, {
          status: 'OPERATIONAL',
          last_serviced_at: new Date()
        });
      }

      const completedWo = await WorkOrder.findById(id)
        .populate('equipment')
        .populate('technician')
        .populate('parts_required.part');

      await logActivity({
        actor: req.user?.name || 'Technician',
        role: req.user?.role || 'TECHNICIAN',
        action: 'COMPLETED_WORK_ORDER',
        target: `${id} - ${completedWo.title} (Parts consumed, equipment operational)`,
        category: 'WORK_ORDERS',
        badge_class: 'badge-operational'
      });

      return res.json({
        success: true,
        message: `Work Order ${id} completed successfully. Inventory deducted and equipment status restored.`,
        workOrder: formatWorkOrder(completedWo)
      });
    }

    // Case 2: Other state transitions (IN_PROGRESS, ASSIGNED, WAITING_FOR_PARTS, CANCELLED)
    const existing = await WorkOrder.findById(id);
    if (!existing) {
      return res.status(404).json({ error: `Work order ${id} not found.` });
    }

    // If transitioning from WAITING_FOR_PARTS or OPEN to IN_PROGRESS, ensure equipment is MAINTENANCE
    if (normalizedStatus === 'IN_PROGRESS' || normalizedStatus === 'ASSIGNED') {
      await Equipment.findByIdAndUpdate(existing.equipment_id, {
        status: 'MAINTENANCE'
      });
    }

    // If cancelled and was assigned, decrement technician count
    if (normalizedStatus === 'CANCELLED' && existing.assigned_to && existing.status !== 'COMPLETED' && existing.status !== 'CANCELLED') {
      await TechnicianProfile.updateMany(
        { user_id: existing.assigned_to, active_wo_count: { $gt: 0 } },
        { $inc: { active_wo_count: -1 } }
      );
    }

    const updated = await WorkOrder.findByIdAndUpdate(
      id,
      { status: status },
      { returnDocument: 'after' }
    )
      .populate('equipment')
      .populate('technician')
      .populate('parts_required.part');

    await logActivity({
      actor: req.user?.name || 'Operator',
      role: req.user?.role || 'TECHNICIAN',
      action: `TRANSITIONED_TO_${normalizedStatus}`,
      target: `${id} - ${updated.title}`,
      category: 'WORK_ORDERS',
      badge_class: normalizedStatus === 'IN_PROGRESS' ? 'badge-maintenance' : 'badge-scheduled'
    });

    return res.json({
      success: true,
      message: `Work Order ${id} updated to status '${status}'.`,
      workOrder: formatWorkOrder(updated)
    });
  } catch (err) {
    console.error('Status update error:', err);
    return res.status(500).json({ error: 'Failed to update work order status', details: err.message });
  }
});

// DELETE /api/work-orders/:id (Admin only)
router.delete('/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const wo = await WorkOrder.findById(id);
    if (!wo) {
      return res.status(404).json({ error: `Work Order ${id} not found.` });
    }

    if (wo.assigned_to && wo.status !== 'COMPLETED' && wo.status !== 'CANCELLED') {
      await TechnicianProfile.updateMany(
        { user_id: wo.assigned_to, active_wo_count: { $gt: 0 } },
        { $inc: { active_wo_count: -1 } }
      );
    }

    await FaultReport.updateMany({ linked_wo_id: id }, { linked_wo_id: null });
    await WorkOrder.findByIdAndDelete(id);

    await logActivity({
      actor: req.user?.name || 'Administrator',
      role: 'ADMIN',
      action: 'DELETED_WORK_ORDER',
      target: `${id} - ${wo.title}`,
      category: 'WORK_ORDERS',
      badge_class: 'badge-faulty'
    });

    return res.json({ success: true, message: `Work Order ${id} deleted.` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete work order', details: err.message });
  }
});

module.exports = router;

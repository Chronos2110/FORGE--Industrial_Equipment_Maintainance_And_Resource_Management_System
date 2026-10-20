const express = require('express');
const router = express.Router();
const { workOrders, workOrderParts, equipment, users, technicianProfiles, inventory } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

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
  if (spec.includes('PLC') || spec.includes('AUTOMATION')) {
    if (cat.includes('PLC') || cat.includes('AUTOMATION') || cat.includes('GENERATOR') || cat.includes('CNC')) {
      return true;
    }
  }

  return spec.includes(cat) || cat.includes(spec);
}

// Format and enrich Work Order for front-end compatibility
async function enrichWorkOrder(wo) {
  if (!wo) return null;

  const eq = wo.equipment_id
    ? await equipment.findOne({ $or: [{ _id: wo.equipment_id }, { id: wo.equipment_id }] })
    : null;

  const tech = wo.assigned_to
    ? await users.findOne({ $or: [{ _id: wo.assigned_to }, { id: wo.assigned_to }] })
    : null;

  const creator = wo.created_by
    ? await users.findOne({ $or: [{ _id: wo.created_by }, { id: wo.created_by }] })
    : null;

  const enrichedParts = await Promise.all((wo.parts_required || []).map(async (p) => {
    const partDoc = await inventory.findOne({ $or: [{ _id: p.part_id }, { id: p.part_id }] });
    return {
      ...p,
      part: partDoc || null
    };
  }));

  const requiredPartItem = enrichedParts.length > 0 ? enrichedParts[0] : null;

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
    equipment: eq ? eq.name : wo.equipment_id,
    equipmentObj: eq,
    technicianId: wo.assigned_to,
    technician: tech ? tech.name : (wo.assigned_to || 'Unassigned'),
    technicianObj: tech,
    createdBy: creator ? creator.name : wo.created_by,
    requiredPartId: requiredPartItem ? requiredPartItem.part_id : '',
    requiredPart: requiredPartItem && requiredPartItem.part ? requiredPartItem.part.name : '',
    requiredQuantity: requiredPartItem ? requiredPartItem.quantity_required : 0,
    quantityDeducted: requiredPartItem ? requiredPartItem.quantity_deducted : false,
    parts_required: enrichedParts
  };
}

// GET /api/work-orders
// Accessible by: ADMIN, TECHNICIAN, OPERATOR
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

    const rawOrders = await workOrders.find(filter).sort({ created_at: -1 }).toArray();
    const enriched = await Promise.all(rawOrders.map(enrichWorkOrder));

    return res.json(enriched);
  } catch (err) {
    console.error('Error fetching work orders:', err);
    return res.status(500).json({ error: 'Failed to retrieve work orders', details: err.message });
  }
});

// GET /api/work-orders/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    const wo = await workOrders.findOne({
      $or: [{ _id: id }, { id }]
    });

    if (!wo) {
      return res.status(404).json({ error: `Work Order ${id} not found.` });
    }

    const formatted = await enrichWorkOrder(wo);
    return res.json(formatted);
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
      equipment: eqInput,
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
    if (!resolvedEquipmentId && eqInput) {
      const eqDoc = await equipment.findOne({
        $or: [{ _id: eqInput }, { id: eqInput }, { name: eqInput }]
      });
      if (eqDoc) resolvedEquipmentId = eqDoc._id;
    }

    if (!resolvedEquipmentId) {
      return res.status(400).json({ error: 'Valid equipment_id or equipment name is required.' });
    }

    // Resolve assigned_to technician if name was passed
    let resolvedTechId = assigned_to;
    if (!resolvedTechId && technician) {
      const techUser = await users.findOne({
        $or: [{ _id: technician }, { id: technician }, { name: technician }, { email: technician }]
      });
      if (techUser) resolvedTechId = techUser._id;
    }

    // Resolve part_id if part name was passed
    let resolvedPartId = requiredPartId;
    if (!resolvedPartId && requiredPart) {
      const p = await inventory.findOne({
        $or: [{ _id: requiredPart }, { id: requiredPart }, { name: requiredPart }]
      });
      if (p) resolvedPartId = p._id;
    }

    const partsArray = [];
    if (resolvedPartId && requiredQuantity > 0) {
      partsArray.push({
        part_id: resolvedPartId,
        quantity_required: parseInt(requiredQuantity),
        quantity_deducted: false
      });
    }

    const initialStatus = resolvedTechId && woStatus === 'OPEN' ? 'ASSIGNED' : woStatus;

    const newWo = {
      _id: woId,
      id: woId,
      title: woTitle,
      description: woDesc,
      priority: woPriority,
      status: initialStatus,
      equipment_id: resolvedEquipmentId,
      assigned_to: resolvedTechId || null,
      created_by: req.user.id,
      parts_required: partsArray,
      created_at: new Date(),
      completed_at: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await workOrders.insertOne(newWo);

    // Also populate work_order_parts collection (Table 2 in PDF)
    if (partsArray.length > 0) {
      for (const p of partsArray) {
        await workOrderParts.insertOne({
          _id: `wop-${woId}-${Date.now()}`,
          id: `wop-${woId}-${Date.now()}`,
          work_order_id: woId,
          part_id: p.part_id,
          quantity_required: p.quantity_required,
          quantity_deducted: false,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }

    // If assigned to a technician, increment active_wo_count
    if (resolvedTechId) {
      await users.updateOne(
        { $or: [{ _id: resolvedTechId }, { id: resolvedTechId }] },
        { $inc: { 'technician_profile.active_wo_count': 1 } }
      );
      await technicianProfiles.updateOne(
        { $or: [{ user_id: resolvedTechId }, { id: resolvedTechId }] },
        { $inc: { active_wo_count: 1 } }
      );
    }

    // If status is ASSIGNED or IN_PROGRESS, set equipment status to MAINTENANCE
    if (initialStatus === 'ASSIGNED' || initialStatus === 'IN_PROGRESS') {
      await equipment.updateOne(
        { $or: [{ _id: resolvedEquipmentId }, { id: resolvedEquipmentId }] },
        { $set: { status: 'MAINTENANCE' } }
      );
    }

    const formatted = await enrichWorkOrder(newWo);
    return res.status(201).json(formatted);
  } catch (err) {
    console.error('Error creating work order:', err);
    return res.status(500).json({ error: 'Failed to create work order', details: err.message });
  }
});

// POST /api/work-orders/:id/auto-assign (Executes technician matching algorithm)
// Accessible by: ADMIN and TECHNICIAN
router.post('/:id/auto-assign', authenticateToken, requireRole(['ADMIN', 'TECHNICIAN']), async (req, res) => {
  try {
    const id = req.params.id;
    const workOrder = await workOrders.findOne({
      $or: [{ _id: id }, { id }]
    });

    if (!workOrder) {
      return res.status(404).json({ error: `Work Order ${id} not found.` });
    }

    const eqDoc = workOrder.equipment_id
      ? await equipment.findOne({ $or: [{ _id: workOrder.equipment_id }, { id: workOrder.equipment_id }] })
      : null;

    // 1. Query active technicians in MongoDB
    const candidates = await users.find({
      role: 'TECHNICIAN',
      status: 'ACTIVE',
      'technician_profile': { $ne: null }
    }).toArray();

    const availableCandidates = candidates.filter(u => {
      const prof = u.technician_profile;
      return prof && prof.active_wo_count < prof.max_concurrent_wos;
    });

    if (availableCandidates.length === 0) {
      return res.status(400).json({
        error: 'No available technicians found. All technicians are currently at maximum workload or off-shift.'
      });
    }

    // 2. Rank candidates by matching specialization against equipment category first, then lowest workload
    const eqCategory = eqDoc ? eqDoc.category : '';

    availableCandidates.sort((a, b) => {
      const aMatches = isSpecializationMatch(a.technician_profile.specialization, eqCategory);
      const bMatches = isSpecializationMatch(b.technician_profile.specialization, eqCategory);

      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;

      return a.technician_profile.active_wo_count - b.technician_profile.active_wo_count;
    });

    const topCandidate = availableCandidates[0];
    const previousTechId = workOrder.assigned_to;

    // Decrement previous technician's active count if previously assigned and not completed
    if (previousTechId && previousTechId !== topCandidate._id && workOrder.status !== 'COMPLETED') {
      await users.updateOne(
        { $or: [{ _id: previousTechId }, { id: previousTechId }], 'technician_profile.active_wo_count': { $gt: 0 } },
        { $inc: { 'technician_profile.active_wo_count': -1 } }
      );
      await technicianProfiles.updateOne(
        { $or: [{ user_id: previousTechId }, { id: previousTechId }], active_wo_count: { $gt: 0 } },
        { $inc: { active_wo_count: -1 } }
      );
    }

    // Increment new topCandidate's active count
    await users.updateOne(
      { $or: [{ _id: topCandidate._id }, { id: topCandidate.id }] },
      { $inc: { 'technician_profile.active_wo_count': 1 } }
    );
    await technicianProfiles.updateOne(
      { $or: [{ user_id: topCandidate._id }, { user_id: topCandidate.id }] },
      { $inc: { active_wo_count: 1 } }
    );

    // Update work order
    await workOrders.updateOne(
      { $or: [{ _id: id }, { id }] },
      {
        $set: {
          assigned_to: topCandidate._id,
          status: 'ASSIGNED',
          updatedAt: new Date()
        }
      }
    );

    const updatedWo = await workOrders.findOne({ $or: [{ _id: id }, { id }] });
    const formatted = await enrichWorkOrder(updatedWo);

    return res.json({
      success: true,
      message: `Assigned to ${topCandidate.name} [${topCandidate.technician_profile.specialization}] based on category match and workload balance.`,
      workOrder: formatted
    });
  } catch (err) {
    console.error('Error auto-assigning technician:', err);
    return res.status(500).json({ error: 'Failed to auto-assign technician', details: err.message });
  }
});

// PATCH /api/work-orders/:id/status (Executes state transitions and inventory deduction)
// Accessible by: ADMIN and TECHNICIAN
router.patch('/:id/status', authenticateToken, requireRole(['ADMIN', 'TECHNICIAN']), async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Target status is required.' });
    }

    const normalizedStatus = status.toUpperCase().replace(/\s+/g, '_');

    // Case 1: Work Order Completion and Inventory Sync
    if (normalizedStatus === 'COMPLETED') {
      const wo = await workOrders.findOne({
        $or: [{ _id: id }, { id }]
      });

      if (!wo) {
        return res.status(404).json({ error: `Work order ${id} not found.` });
      }

      const currentStatus = (wo.status || '').toUpperCase().replace(/\s+/g, '_');
      if (currentStatus !== 'IN_PROGRESS' && currentStatus !== 'ASSIGNED' && currentStatus !== 'WAITING_FOR_PARTS') {
        return res.status(400).json({
          error: `Cannot complete Work Order ${id}: Current state is '${wo.status}'. Only IN_PROGRESS or ASSIGNED orders can be completed.`
        });
      }

      // Step 2: Check spare parts stock where quantity_deducted is false
      const unDeductedParts = (wo.parts_required || []).filter(p => !p.quantity_deducted);

      for (const item of unDeductedParts) {
        const invPart = await inventory.findOne({
          $or: [{ _id: item.part_id }, { id: item.part_id }]
        });
        if (!invPart) {
          return res.status(400).json({ error: `Spare part SKU '${item.part_id}' not found in inventory.` });
        }
        if (invPart.quantity_on_hand < item.quantity_required) {
          return res.status(400).json({
            error: `Insufficient stock for SKU '${invPart._id}' (${invPart.name}): Required ${item.quantity_required}, available ${invPart.quantity_on_hand}. Transaction aborted.`
          });
        }
      }

      // Step 3: Deduct stock and mark quantity_deducted = true
      for (const item of unDeductedParts) {
        await inventory.updateOne(
          { $or: [{ _id: item.part_id }, { id: item.part_id }] },
          { $inc: { quantity_on_hand: -item.quantity_required } }
        );
        item.quantity_deducted = true;
      }

      await workOrderParts.updateMany(
        { work_order_id: wo.id || wo._id },
        { $set: { quantity_deducted: true, updatedAt: new Date() } }
      );

      // Step 4: Decrement assigned technician active count
      if (wo.assigned_to) {
        await users.updateOne(
          { $or: [{ _id: wo.assigned_to }, { id: wo.assigned_to }], 'technician_profile.active_wo_count': { $gt: 0 } },
          { $inc: { 'technician_profile.active_wo_count': -1 } }
        );
        await technicianProfiles.updateOne(
          { $or: [{ user_id: wo.assigned_to }, { id: wo.assigned_to }], active_wo_count: { $gt: 0 } },
          { $inc: { active_wo_count: -1 } }
        );
      }

      // Step 5: Mark work order completed
      await workOrders.updateOne(
        { $or: [{ _id: id }, { id }] },
        {
          $set: {
            status: 'COMPLETED',
            completed_at: new Date(),
            parts_required: wo.parts_required,
            updatedAt: new Date()
          }
        }
      );

      // Step 6: If no other open orders exist for equipment, restore to OPERATIONAL
      const otherOpenWos = await workOrders.countDocuments({
        equipment_id: wo.equipment_id,
        _id: { $ne: wo._id },
        status: { $in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_PARTS'] }
      });

      if (otherOpenWos === 0) {
        await equipment.updateOne(
          { $or: [{ _id: wo.equipment_id }, { id: wo.equipment_id }] },
          {
            $set: {
              status: 'OPERATIONAL',
              last_serviced_at: new Date(),
              updatedAt: new Date()
            }
          }
        );
      }

      const completedWo = await workOrders.findOne({ $or: [{ _id: id }, { id }] });
      const formatted = await enrichWorkOrder(completedWo);

      return res.json({
        success: true,
        message: `Work Order ${id} completed successfully. Inventory deducted and equipment status restored.`,
        workOrder: formatted
      });
    }

    // Case 2: Other state transitions
    const existing = await workOrders.findOne({ $or: [{ _id: id }, { id }] });
    if (!existing) {
      return res.status(404).json({ error: `Work order ${id} not found.` });
    }

    // If transitioning to IN_PROGRESS or ASSIGNED, set equipment to MAINTENANCE
    if (normalizedStatus === 'IN_PROGRESS' || normalizedStatus === 'ASSIGNED') {
      await equipment.updateOne(
        { $or: [{ _id: existing.equipment_id }, { id: existing.equipment_id }] },
        { $set: { status: 'MAINTENANCE', updatedAt: new Date() } }
      );
    }

    // If cancelled and was assigned, decrement technician count
    if (normalizedStatus === 'CANCELLED' && existing.assigned_to && existing.status !== 'COMPLETED' && existing.status !== 'CANCELLED') {
      await users.updateOne(
        { $or: [{ _id: existing.assigned_to }, { id: existing.assigned_to }], 'technician_profile.active_wo_count': { $gt: 0 } },
        { $inc: { 'technician_profile.active_wo_count': -1 } }
      );
    }

    await workOrders.updateOne(
      { $or: [{ _id: id }, { id }] },
      { $set: { status, updatedAt: new Date() } }
    );

    const updated = await workOrders.findOne({ $or: [{ _id: id }, { id }] });
    const formatted = await enrichWorkOrder(updated);

    return res.json({
      success: true,
      message: `Work Order ${id} updated to status '${status}'.`,
      workOrder: formatted
    });
  } catch (err) {
    console.error('Status update error:', err);
    return res.status(500).json({ error: 'Failed to update work order status', details: err.message });
  }
});

// DELETE /api/work-orders/:id (Admin only)
router.delete('/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const id = req.params.id;
    const wo = await workOrders.findOne({ $or: [{ _id: id }, { id }] });
    if (!wo) {
      return res.status(404).json({ error: `Work Order ${id} not found.` });
    }

    if (wo.assigned_to && wo.status !== 'COMPLETED' && wo.status !== 'CANCELLED') {
      await users.updateOne(
        { $or: [{ _id: wo.assigned_to }, { id: wo.assigned_to }], 'technician_profile.active_wo_count': { $gt: 0 } },
        { $inc: { 'technician_profile.active_wo_count': -1 } }
      );
    }

    await workOrders.deleteOne({ $or: [{ _id: id }, { id }] });
    return res.json({ success: true, message: `Work Order ${id} deleted.` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete work order', details: err.message });
  }
});

module.exports = router;

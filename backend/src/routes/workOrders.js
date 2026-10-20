const express = require('express');
const router = express.Router();
const prisma = require('../db');
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
  const requiredPartItem = wo.parts_required && wo.parts_required.length > 0 ? wo.parts_required[0] : null;

  return {
    id: wo.id,
    title: wo.title,
    problem: wo.description,
    description: wo.description,
    priority: wo.priority,
    status: wo.status,
    created_at: wo.created_at,
    completed_at: wo.completed_at,
    date: wo.created_at ? wo.created_at.toISOString().split('T')[0] : '',
    scheduledDate: wo.created_at ? wo.created_at.toISOString().split('T')[0] : '',
    equipmentId: wo.equipment_id,
    equipment: wo.equipment ? wo.equipment.name : wo.equipment_id,
    equipmentObj: wo.equipment,
    technicianId: wo.assigned_to,
    technician: wo.technician ? wo.technician.name : (wo.assigned_to || 'Unassigned'),
    technicianObj: wo.technician,
    createdBy: wo.creator ? wo.creator.name : wo.created_by,
    requiredPartId: requiredPartItem ? requiredPartItem.part_id : '',
    requiredPart: requiredPartItem && requiredPartItem.part ? requiredPartItem.part.name : '',
    requiredQuantity: requiredPartItem ? requiredPartItem.quantity_required : 0,
    quantityDeducted: requiredPartItem ? requiredPartItem.quantity_deducted : false,
    parts_required: wo.parts_required || []
  };
}

// GET /api/work-orders (Supports ?status=, ?priority=, and ?assigned_to= filters)
// Accessible by: ADMIN, TECHNICIAN, OPERATOR (all can view)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, priority, assigned_to } = req.query;
    const where = {};

    if (status && status !== 'All') {
      where.status = { equals: status };
    }

    if (priority && priority !== 'All') {
      where.priority = { equals: priority };
    }

    if (assigned_to && assigned_to !== 'All') {
      where.assigned_to = { equals: assigned_to };
    }

    const workOrders = await prisma.workOrder.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        equipment: true,
        technician: {
          select: { id: true, name: true, email: true, status: true, technician_profile: true }
        },
        creator: {
          select: { id: true, name: true }
        },
        parts_required: {
          include: { part: true }
        }
      }
    });

    return res.json(workOrders.map(formatWorkOrder));
  } catch (err) {
    console.error('Error fetching work orders:', err);
    return res.status(500).json({ error: 'Failed to retrieve work orders', details: err.message });
  }
});

// GET /api/work-orders/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const wo = await prisma.workOrder.findUnique({
      where: { id: req.params.id },
      include: {
        equipment: true,
        technician: {
          include: { technician_profile: true }
        },
        creator: true,
        parts_required: {
          include: { part: true }
        }
      }
    });

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
      const eq = await prisma.equipment.findFirst({
        where: {
          OR: [{ id: equipment }, { name: equipment }]
        }
      });
      if (eq) resolvedEquipmentId = eq.id;
    }

    if (!resolvedEquipmentId) {
      return res.status(400).json({ error: 'Valid equipment_id or equipment name is required.' });
    }

    // Resolve assigned_to technician if name was passed
    let resolvedTechId = assigned_to;
    if (!resolvedTechId && technician) {
      const techUser = await prisma.user.findFirst({
        where: {
          OR: [{ id: technician }, { name: technician }, { email: technician }]
        }
      });
      if (techUser) resolvedTechId = techUser.id;
    }

    // Resolve part_id if part name was passed
    let resolvedPartId = requiredPartId;
    if (!resolvedPartId && requiredPart) {
      const p = await prisma.inventoryPart.findFirst({
        where: {
          OR: [{ id: requiredPart }, { name: requiredPart }]
        }
      });
      if (p) resolvedPartId = p.id;
    }

    const createdWo = await prisma.$transaction(async (tx) => {
      const wo = await tx.workOrder.create({
        data: {
          id: woId,
          title: woTitle,
          description: woDesc,
          priority: woPriority,
          status: resolvedTechId && woStatus === 'OPEN' ? 'ASSIGNED' : woStatus,
          equipment_id: resolvedEquipmentId,
          assigned_to: resolvedTechId || null,
          created_by: req.user.id
        }
      });

      if (resolvedPartId && requiredQuantity > 0) {
        await tx.workOrderPart.create({
          data: {
            work_order_id: wo.id,
            part_id: resolvedPartId,
            quantity_required: parseInt(requiredQuantity, 10),
            quantity_deducted: false
          }
        });
      }

      // If assigned to a technician, increment active_wo_count
      if (resolvedTechId) {
        await tx.technicianProfile.updateMany({
          where: { user_id: resolvedTechId },
          data: { active_wo_count: { increment: 1 } }
        });
      }

      // If status is ASSIGNED or IN_PROGRESS, set equipment status to MAINTENANCE
      if (wo.status === 'ASSIGNED' || wo.status === 'IN_PROGRESS') {
        await tx.equipment.update({
          where: { id: resolvedEquipmentId },
          data: { status: 'MAINTENANCE' }
        });
      }

      return wo;
    });

    await logActivity({
      actor: req.user?.name || 'Supervisor',
      role: req.user?.role || 'ADMIN',
      action: 'CREATED_WORK_ORDER',
      target: `${createdWo.id} - ${createdWo.title}`,
      category: 'WORK_ORDERS',
      badge_class: 'badge-scheduled'
    });

    const fullWo = await prisma.workOrder.findUnique({
      where: { id: createdWo.id },
      include: {
        equipment: true,
        technician: true,
        parts_required: { include: { part: true } }
      }
    });

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

    const workOrder = await prisma.workOrder.findUnique({
      where: { id },
      include: { equipment: true }
    });

    if (!workOrder) {
      return res.status(404).json({ error: `Work Order ${id} not found.` });
    }

    // 1. Query users joined with technician_profiles where status = 'ACTIVE' and active_wo_count < max_concurrent_wos
    const candidates = await prisma.user.findMany({
      where: {
        role: 'TECHNICIAN',
        status: 'ACTIVE',
        technician_profile: {
          isNot: null
        }
      },
      include: {
        technician_profile: true
      }
    });

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
      const aMatches = isSpecializationMatch(a.technician_profile.specialization, eqCategory);
      const bMatches = isSpecializationMatch(b.technician_profile.specialization, eqCategory);

      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;

      // Tiebreaker: sort by lowest active_wo_count
      return a.technician_profile.active_wo_count - b.technician_profile.active_wo_count;
    });

    const topCandidate = availableCandidates[0];
    const previousTechId = workOrder.assigned_to;

    // 3. Assign top candidate, update work order status to ASSIGNED, increment active_wo_count, return payload
    const updatedWo = await prisma.$transaction(async (tx) => {
      // Decrement previous technician's active count if previously assigned and not completed
      if (previousTechId && previousTechId !== topCandidate.id && workOrder.status !== 'COMPLETED') {
        await tx.technicianProfile.updateMany({
          where: { user_id: previousTechId, active_wo_count: { gt: 0 } },
          data: { active_wo_count: { decrement: 1 } }
        });
      }

      // Increment new topCandidate's active count
      await tx.technicianProfile.update({
        where: { user_id: topCandidate.id },
        data: { active_wo_count: { increment: 1 } }
      });

      // Update work order
      const updated = await tx.workOrder.update({
        where: { id },
        data: {
          assigned_to: topCandidate.id,
          status: 'ASSIGNED'
        },
        include: {
          equipment: true,
          technician: { include: { technician_profile: true } },
          parts_required: { include: { part: true } }
        }
      });

      return updated;
    });

    await logActivity({
      actor: req.user?.name || 'Dispatcher',
      role: req.user?.role || 'ADMIN',
      action: 'AUTO_ASSIGNED_TECHNICIAN',
      target: `${workOrder.id} -> ${topCandidate.name} (${topCandidate.technician_profile.specialization})`,
      category: 'WORK_ORDERS',
      badge_class: 'badge-scheduled'
    });

    return res.json({
      success: true,
      message: `Assigned to ${topCandidate.name} [${topCandidate.technician_profile.specialization}] based on category match and workload balance.`,
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
    const { status, waitingReason } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Target status is required.' });
    }

    const normalizedStatus = status.toUpperCase().replace(/\s+/g, '_');

    // Case 1: Transactional Work Order Completion and Inventory Sync
    if (normalizedStatus === 'COMPLETED') {
      const result = await prisma.$transaction(async (tx) => {
        // Step 1: Verify work order state
        const wo = await tx.workOrder.findUnique({
          where: { id },
          include: {
            parts_required: {
              include: { part: true }
            },
            equipment: true
          }
        });

        if (!wo) {
          throw { status: 404, message: `Work order ${id} not found.` };
        }

        const currentStatus = wo.status.toUpperCase().replace(/\s+/g, '_');
        if (currentStatus !== 'IN_PROGRESS' && currentStatus !== 'ASSIGNED' && currentStatus !== 'WAITING_FOR_PARTS') {
          throw {
            status: 400,
            message: `Cannot complete Work Order ${id}: Current state is '${wo.status}'. Only IN_PROGRESS or ASSIGNED orders can be completed.`
          };
        }

        // Step 2: Query work_order_parts for all spare parts linked to the work order where quantity_deducted is false
        const unDeductedParts = wo.parts_required.filter(p => !p.quantity_deducted);

        // Step 3: Verify inventory_parts.quantity_on_hand is sufficient for each required part
        for (const item of unDeductedParts) {
          const invPart = await tx.inventoryPart.findUnique({
            where: { id: item.part_id }
          });

          if (!invPart) {
            throw {
              status: 400,
              message: `Spare part SKU '${item.part_id}' not found in inventory.`
            };
          }

          if (invPart.quantity_on_hand < item.quantity_required) {
            throw {
              status: 400,
              message: `Insufficient stock for SKU '${invPart.id}' (${invPart.name}): Required ${item.quantity_required}, available ${invPart.quantity_on_hand}. Transaction aborted.`
            };
          }
        }

        // Step 4: Deduct quantity_required from inventory_parts.quantity_on_hand and mark quantity_deducted = true
        for (const item of unDeductedParts) {
          await tx.inventoryPart.update({
            where: { id: item.part_id },
            data: {
              quantity_on_hand: {
                decrement: item.quantity_required
              }
            }
          });

          await tx.workOrderPart.update({
            where: { id: item.id },
            data: { quantity_deducted: true }
          });
        }

        // Step 5: Decrement assigned technician's active_wo_count by 1
        if (wo.assigned_to) {
          await tx.technicianProfile.updateMany({
            where: { user_id: wo.assigned_to, active_wo_count: { gt: 0 } },
            data: { active_wo_count: { decrement: 1 } }
          });
        }

        // Step 6: Set work_orders.status = "COMPLETED", record completed_at = NOW(),
        // and restore linked equipment status to OPERATIONAL if no other open work orders exist for that machine
        const completedWo = await tx.workOrder.update({
          where: { id },
          data: {
            status: 'COMPLETED',
            completed_at: new Date()
          },
          include: {
            equipment: true,
            technician: true,
            parts_required: { include: { part: true } }
          }
        });

        // Check if other open work orders exist for that equipment
        const otherOpenWos = await tx.workOrder.count({
          where: {
            equipment_id: wo.equipment_id,
            id: { not: id },
            status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_PARTS'] }
          }
        });

        if (otherOpenWos === 0) {
          await tx.equipment.update({
            where: { id: wo.equipment_id },
            data: {
              status: 'OPERATIONAL',
              last_serviced_at: new Date()
            }
          });
        }

        return completedWo;
      });

      await logActivity({
        actor: req.user?.name || 'Technician',
        role: req.user?.role || 'TECHNICIAN',
        action: 'COMPLETED_WORK_ORDER',
        target: `${id} - ${result.title} (Parts consumed, equipment operational)`,
        category: 'WORK_ORDERS',
        badge_class: 'badge-operational'
      });

      return res.json({
        success: true,
        message: `Work Order ${id} completed successfully. Inventory deducted and equipment status restored.`,
        workOrder: formatWorkOrder(result)
      });
    }

    // Case 2: Other state transitions (IN_PROGRESS, ASSIGNED, WAITING_FOR_PARTS, CANCELLED)
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.workOrder.findUnique({ where: { id } });
      if (!existing) {
        throw { status: 404, message: `Work order ${id} not found.` };
      }

      // If transitioning from WAITING_FOR_PARTS or OPEN to IN_PROGRESS, ensure equipment is MAINTENANCE
      if (normalizedStatus === 'IN_PROGRESS' || normalizedStatus === 'ASSIGNED') {
        await tx.equipment.update({
          where: { id: existing.equipment_id },
          data: { status: 'MAINTENANCE' }
        });
      }

      // If cancelled and was assigned, decrement technician count
      if (normalizedStatus === 'CANCELLED' && existing.assigned_to && existing.status !== 'COMPLETED' && existing.status !== 'CANCELLED') {
        await tx.technicianProfile.updateMany({
          where: { user_id: existing.assigned_to, active_wo_count: { gt: 0 } },
          data: { active_wo_count: { decrement: 1 } }
        });
      }

      return await tx.workOrder.update({
        where: { id },
        data: {
          status: status
        },
        include: {
          equipment: true,
          technician: true,
          parts_required: { include: { part: true } }
        }
      });
    });

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
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to update work order status', details: err.message });
  }
});

// DELETE /api/work-orders/:id (Admin only)
router.delete('/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const wo = await prisma.workOrder.findUnique({ where: { id } });
    if (!wo) {
      return res.status(404).json({ error: `Work Order ${id} not found.` });
    }

    if (wo.assigned_to && wo.status !== 'COMPLETED' && wo.status !== 'CANCELLED') {
      await prisma.technicianProfile.updateMany({
        where: { user_id: wo.assigned_to, active_wo_count: { gt: 0 } },
        data: { active_wo_count: { decrement: 1 } }
      });
    }

    await prisma.workOrderPart.deleteMany({ where: { work_order_id: id } });
    await prisma.faultReport.updateMany({ where: { linked_wo_id: id }, data: { linked_wo_id: null } });
    await prisma.workOrder.delete({ where: { id } });

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

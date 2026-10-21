const express = require('express');
const router = express.Router();
const { InventoryPart, WorkOrder } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

// Format inventory part for front-end compatibility
function formatPart(p) {
  if (!p) return null;
  return {
    id: p.id || p._id,
    partName: p.name,
    name: p.name,
    category: p.category,
    quantity: p.quantity_on_hand,
    quantity_on_hand: p.quantity_on_hand,
    minStock: p.min_threshold,
    minimumStock: p.min_threshold,
    min_threshold: p.min_threshold,
    unit_cost: p.unit_cost,
    storage_bin: p.storage_bin,
    supplier: p.supplier || 'Industrial OEM Supply'
  };
}

// GET /api/inventory
// Accessible by: ADMIN, TECHNICIAN, OPERATOR
router.get('/', authenticateToken, async (req, res) => {
  try {
    const parts = await InventoryPart.find().sort({ _id: 1 });
    return res.json(parts.map(formatPart));
  } catch (err) {
    console.error('Error fetching inventory:', err);
    return res.status(500).json({ error: 'Failed to retrieve inventory', details: err.message });
  }
});

// GET /api/inventory/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const part = await InventoryPart.findById(req.params.id);

    if (!part) {
      return res.status(404).json({ error: `Inventory item ${req.params.id} not found.` });
    }

    return res.json(formatPart(part));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve inventory item', details: err.message });
  }
});

// POST /api/inventory (Admin only)
router.post('/', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id, name, partName, category, quantity, quantity_on_hand, minStock, min_threshold, minimumStock, unit_cost, storage_bin, supplier } = req.body;

    const partId = id || `PRT-${Math.floor(100 + Math.random() * 900)}`;
    const pName = name || partName;

    if (!pName) {
      return res.status(400).json({ error: 'Part name is required.' });
    }

    const qty = quantity !== undefined ? parseInt(quantity, 10) : (quantity_on_hand !== undefined ? parseInt(quantity_on_hand, 10) : 0);
    const min = min_threshold !== undefined ? parseInt(min_threshold, 10) : (minimumStock !== undefined ? parseInt(minimumStock, 10) : (minStock !== undefined ? parseInt(minStock, 10) : 5));

    if (qty < 0) {
      return res.status(400).json({ error: 'Quantity on hand cannot be negative.' });
    }

    const created = await InventoryPart.create({
      _id: partId,
      name: pName,
      category: category || 'General Spare',
      quantity_on_hand: qty,
      min_threshold: min,
      unit_cost: unit_cost ? parseFloat(unit_cost) : 50.0,
      storage_bin: storage_bin || 'Bin General',
      supplier: supplier || 'Industrial OEM Supply'
    });

    await logActivity({
      actor: req.user?.name || 'Administrator',
      role: 'ADMIN',
      action: 'CREATED_INVENTORY_PART',
      target: `${created.id || created._id} - ${created.name} (${created.quantity_on_hand} in stock)`,
      category: 'INVENTORY',
      badge_class: 'badge-operational'
    });

    return res.status(201).json(formatPart(created));
  } catch (err) {
    console.error('Error adding inventory:', err);
    return res.status(500).json({ error: 'Failed to add inventory part', details: err.message });
  }
});

// Helper for updating part records
async function updatePartRecord(req, res, id) {
  const {
    name,
    partName,
    category,
    add_quantity,
    quantity,
    quantity_on_hand,
    min_threshold,
    minimumStock,
    minStock,
    unit_cost,
    storage_bin,
    supplier
  } = req.body;

  const existing = await InventoryPart.findById(id);
  if (!existing) {
    return res.status(404).json({ error: `Part ${id} not found in inventory.` });
  }

  const data = {};
  if (name || partName) data.name = name || partName;
  if (category) data.category = category;
  if (supplier) data.supplier = supplier;

  let isRestockAction = false;
  if (add_quantity !== undefined) {
    const added = parseInt(add_quantity, 10);
    if (existing.quantity_on_hand + added < 0) {
      return res.status(400).json({ error: 'Stock reduction exceeds quantity on hand. Cannot be negative.' });
    }
    data.quantity_on_hand = existing.quantity_on_hand + added;
    isRestockAction = true;
  } else if (quantity !== undefined || quantity_on_hand !== undefined) {
    const newQty = parseInt(quantity !== undefined ? quantity : quantity_on_hand, 10);
    if (newQty < 0) {
      return res.status(400).json({ error: 'Quantity on hand cannot be negative.' });
    }
    data.quantity_on_hand = newQty;
    if (newQty > existing.quantity_on_hand) isRestockAction = true;
  }

  if (min_threshold !== undefined || minimumStock !== undefined || minStock !== undefined) {
    data.min_threshold = parseInt(min_threshold !== undefined ? min_threshold : (minimumStock !== undefined ? minimumStock : minStock), 10);
  }

  if (unit_cost !== undefined) {
    data.unit_cost = parseFloat(unit_cost);
  }

  if (storage_bin !== undefined) {
    data.storage_bin = storage_bin;
  }

  const updated = await InventoryPart.findByIdAndUpdate(id, data, { returnDocument: 'after' });

  const actionName = isRestockAction ? 'RESTOCKED_PART' : 'UPDATED_PART_RECORD';
  await logActivity({
    actor: req.user?.name || 'Administrator',
    role: req.user?.role || 'ADMIN',
    action: actionName,
    target: `${updated.id || updated._id} - ${updated.name} (Qty: ${updated.quantity_on_hand}, Min: ${updated.min_threshold})`,
    category: 'INVENTORY',
    badge_class: updated.quantity_on_hand <= updated.min_threshold ? 'badge-faulty' : 'badge-operational'
  });

  return res.json({
    success: true,
    message: `Inventory SKU ${id} successfully updated.`,
    part: formatPart(updated)
  });
}

// PATCH /api/inventory/:id (Admin and Technician)
router.patch('/:id', authenticateToken, requireRole(['ADMIN', 'TECHNICIAN']), async (req, res) => {
  try {
    return await updatePartRecord(req, res, req.params.id);
  } catch (err) {
    console.error('Error updating inventory part:', err);
    return res.status(500).json({ error: 'Failed to update inventory', details: err.message });
  }
});

// PATCH /api/inventory/:id/restock (Admin only: restock quantities, adjust thresholds)
router.patch('/:id/restock', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    return await updatePartRecord(req, res, req.params.id);
  } catch (err) {
    console.error('Error restocking inventory:', err);
    return res.status(500).json({ error: 'Failed to update inventory', details: err.message });
  }
});

// DELETE /api/inventory/:id (Admin only)
router.delete('/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await InventoryPart.findById(id);
    if (!existing) {
      return res.status(404).json({ error: `Part ${id} not found.` });
    }

    // Clean up any work_orders embedded references
    await WorkOrder.updateMany({}, { $pull: { parts_required: { part_id: id } } });
    await InventoryPart.findByIdAndDelete(id);

    await logActivity({
      actor: req.user?.name || 'Administrator',
      role: 'ADMIN',
      action: 'DELETED_INVENTORY_PART',
      target: `${id} - ${existing.name}`,
      category: 'INVENTORY',
      badge_class: 'badge-faulty'
    });

    return res.json({ success: true, message: `Part ${id} deleted.` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete inventory part', details: err.message });
  }
});

module.exports = router;

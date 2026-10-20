const express = require('express');
const router = express.Router();
const { inventory } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

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
    supplier: 'Industrial OEM Supply'
  };
}

// GET /api/inventory
// Accessible by: ADMIN, TECHNICIAN, OPERATOR
router.get('/', authenticateToken, async (req, res) => {
  try {
    const parts = await inventory.find({}).sort({ _id: 1 }).toArray();
    return res.json(parts.map(formatPart));
  } catch (err) {
    console.error('Error fetching inventory:', err);
    return res.status(500).json({ error: 'Failed to retrieve inventory', details: err.message });
  }
});

// GET /api/inventory/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    const part = await inventory.findOne({
      $or: [{ _id: id }, { id }]
    });

    if (!part) {
      return res.status(404).json({ error: `Inventory item ${id} not found.` });
    }

    return res.json(formatPart(part));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve inventory item', details: err.message });
  }
});

// POST /api/inventory (Admin only)
router.post('/', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id, name, partName, category, quantity, quantity_on_hand, minStock, min_threshold, minimumStock, unit_cost, storage_bin } = req.body;

    const partId = id || `PRT-${Math.floor(100 + Math.random() * 900)}`;
    const pName = name || partName;

    if (!pName) {
      return res.status(400).json({ error: 'Part name is required.' });
    }

    const qty = quantity !== undefined ? parseInt(quantity) : (quantity_on_hand !== undefined ? parseInt(quantity_on_hand) : 0);
    const min = min_threshold !== undefined ? parseInt(min_threshold) : (minimumStock !== undefined ? parseInt(minimumStock) : (minStock !== undefined ? parseInt(minStock) : 5));

    if (qty < 0) {
      return res.status(400).json({ error: 'Quantity on hand cannot be negative.' });
    }

    const created = {
      _id: partId,
      id: partId,
      name: pName,
      category: category || 'General Spare',
      quantity_on_hand: qty,
      min_threshold: min,
      unit_cost: unit_cost ? parseFloat(unit_cost) : 50.0,
      storage_bin: storage_bin || 'Bin General',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await inventory.insertOne(created);

    return res.status(201).json(formatPart(created));
  } catch (err) {
    console.error('Error adding inventory:', err);
    return res.status(500).json({ error: 'Failed to add inventory part', details: err.message });
  }
});

// PATCH /api/inventory/:id/restock (Admin only: restock quantities, adjust thresholds)
router.patch('/:id/restock', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const id = req.params.id;
    const { add_quantity, quantity, quantity_on_hand, min_threshold, minimumStock, unit_cost, storage_bin } = req.body;

    const existing = await inventory.findOne({
      $or: [{ _id: id }, { id }]
    });

    if (!existing) {
      return res.status(404).json({ error: `Part ${id} not found in inventory.` });
    }

    const updateDoc = { $set: { updatedAt: new Date() } };

    if (add_quantity !== undefined) {
      const added = parseInt(add_quantity);
      if (existing.quantity_on_hand + added < 0) {
        return res.status(400).json({ error: 'Stock reduction exceeds quantity on hand. Cannot be negative.' });
      }
      updateDoc.$inc = { quantity_on_hand: added };
    } else if (quantity !== undefined || quantity_on_hand !== undefined) {
      const newQty = parseInt(quantity !== undefined ? quantity : quantity_on_hand);
      if (newQty < 0) {
        return res.status(400).json({ error: 'Quantity on hand cannot be negative.' });
      }
      updateDoc.$set.quantity_on_hand = newQty;
    }

    if (min_threshold !== undefined || minimumStock !== undefined) {
      updateDoc.$set.min_threshold = parseInt(min_threshold !== undefined ? min_threshold : minimumStock);
    }

    if (unit_cost !== undefined) {
      updateDoc.$set.unit_cost = parseFloat(unit_cost);
    }

    if (storage_bin !== undefined) {
      updateDoc.$set.storage_bin = storage_bin;
    }

    await inventory.updateOne(
      { $or: [{ _id: id }, { id }] },
      updateDoc
    );

    const updated = await inventory.findOne({ $or: [{ _id: id }, { id }] });

    return res.json({
      success: true,
      message: `Inventory SKU ${id} successfully updated.`,
      part: formatPart(updated)
    });
  } catch (err) {
    console.error('Error restocking inventory:', err);
    return res.status(500).json({ error: 'Failed to update inventory', details: err.message });
  }
});

// DELETE /api/inventory/:id (Admin only)
router.delete('/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const id = req.params.id;
    const result = await inventory.deleteOne({
      $or: [{ _id: id }, { id }]
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: `Part ${id} not found.` });
    }

    return res.json({ success: true, message: `Part ${id} deleted.` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete inventory part', details: err.message });
  }
});

module.exports = router;

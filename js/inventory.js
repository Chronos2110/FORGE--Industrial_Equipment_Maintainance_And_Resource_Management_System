// ==========================================================================
// FORGE - Inventory & Spare Parts JavaScript (js/inventory.js)
// Stock Level Evaluation, Category Filtering, and Waiting Parts Integration
// ==========================================================================

let inventoryList = [];
let inventoryModalInstance = null;
let restockModalInstance = null;

document.addEventListener("DOMContentLoaded", function () {
    // 1. Initialize modal instance
    let modalEl = document.getElementById("inventoryModal");
    inventoryModalInstance = new bootstrap.Modal(modalEl);

    // 1b. Initialize restock modal
    let restockEl = document.getElementById("restockModal");
    restockModalInstance = new bootstrap.Modal(restockEl);

    // 2. Load data
    loadInventoryData();

    // 3. Bind search and filter events
    document.getElementById("searchInput").addEventListener("input", filterAndRenderTable);
    document.getElementById("categoryFilter").addEventListener("change", filterAndRenderTable);
    let statusFilterEl = document.getElementById("statusFilter");
    if (statusFilterEl) {
        statusFilterEl.addEventListener("change", filterAndRenderTable);
    }

    // 4. Add button click
    document.getElementById("addNewPartBtn").addEventListener("click", resetForm);

    // 5. Form submit
    document.getElementById("inventoryForm").addEventListener("submit", handleFormSubmit);

    // 6. Restock form submit
    document.getElementById("restockForm").addEventListener("submit", handleRestockSubmit);
});

// Load records from localStorage
function loadInventoryData() {
    let saved = localStorage.getItem("forge_inventory") || localStorage.getItem("iemrs_inventory");
    if (saved) {
        inventoryList = JSON.parse(saved);
    } else {
        inventoryList = [];
    }
    filterAndRenderTable();
    updateKpiCards();
}

// Update summary metric cards
function updateKpiCards() {
    let total = inventoryList.length;
    let adequate = 0;
    let lowStock = 0;
    let categorySet = {};

    for (let i = 0; i < inventoryList.length; i++) {
        let item = inventoryList[i];
        if (item.quantity <= item.minStock) {
            lowStock++;
        } else {
            adequate++;
        }
        if (item.category) {
            categorySet[item.category] = true;
        }
    }

    document.getElementById("kpiTotalParts").textContent = total;
    document.getElementById("kpiAdequateStock").textContent = adequate;
    document.getElementById("kpiLowStock").textContent = lowStock;
    document.getElementById("kpiCategories").textContent = Object.keys(categorySet).length;
}

// Filter and render table rows
function filterAndRenderTable() {
    let query = document.getElementById("searchInput").value.toLowerCase().trim();
    let categoryVal = document.getElementById("categoryFilter").value;
    let statusFilterEl = document.getElementById("statusFilter");
    let statusVal = statusFilterEl ? statusFilterEl.value : "All";
    let tbody = document.getElementById("inventoryTableBody");
    let emptyState = document.getElementById("inventoryEmptyState");

    tbody.innerHTML = "";

    let filtered = [];

    for (let i = 0; i < inventoryList.length; i++) {
        let part = inventoryList[i];
        let matchesQuery =
            part.id.toLowerCase().includes(query) ||
            part.name.toLowerCase().includes(query) ||
            part.category.toLowerCase().includes(query) ||
            part.supplier.toLowerCase().includes(query);

        let matchesCat = (categoryVal === "All") || (part.category === categoryVal);

        let qty = parseInt(part.quantity) || 0;
        let min = parseInt(part.minStock) || 0;
        let partStatus = "In Stock";
        if (qty === 0) {
            partStatus = "Out of Stock";
        } else if (qty <= min) {
            partStatus = "Low Stock";
        }

        let matchesStatus = (statusVal === "All") || (partStatus === statusVal);

        if (matchesQuery && matchesCat && matchesStatus) {
            filtered.push(part);
        }
    }

    document.getElementById("recordsCount").textContent = filtered.length + " Items";

    if (filtered.length === 0) {
        emptyState.classList.remove("d-none");
        return;
    }

    emptyState.classList.add("d-none");

    let workorders = JSON.parse(localStorage.getItem("forge_workorders") || localStorage.getItem("iemrs_workorders")) || [];

    for (let j = 0; j < filtered.length; j++) {
        let p = filtered[j];
        let tr = document.createElement("tr");

        let qty = parseInt(p.quantity) || 0;
        let min = parseInt(p.minStock) || 0;
        let statusText = "In Stock";
        let statusBadgeClass = "badge-operational";
        if (qty === 0) {
            statusText = "Out of Stock";
            statusBadgeClass = "badge-faulty";
        } else if (qty <= min) {
            statusText = "Low Stock";
            statusBadgeClass = "badge-low-stock";
        }

        // Check if any work orders are currently waiting for this part
        let waitingOrders = workorders.filter(o => o.status === "Waiting for Parts" && o.requiredPart === p.name);
        let waitingTag = "";
        if (waitingOrders.length > 0) {
            let totalNeeded = waitingOrders.reduce((sum, o) => sum + (o.requiredQuantity || 1), 0);
            if (p.quantity >= totalNeeded) {
                waitingTag = "<br><span class='badge-ready-resume mt-1 d-inline-block'>Parts Restocked: Ready to Resume (" + waitingOrders.length + " WO)</span>";
            } else {
                waitingTag = "<br><span class='badge bg-warning text-dark border mt-1 d-inline-block'>⚠️ Needed by " + waitingOrders.length + " Work Order(s)</span>";
            }
        }

        tr.innerHTML =
            "<td><strong>" + escapeHTML(p.id) + "</strong></td>" +
            "<td>" + escapeHTML(p.name) + waitingTag + "</td>" +
            "<td><span class='badge bg-light text-dark border'>" + escapeHTML(p.category) + "</span></td>" +
            "<td><strong>" + escapeHTML(p.quantity) + "</strong> units</td>" +
            "<td>" + escapeHTML(p.minStock) + " units</td>" +
            "<td>" + escapeHTML(p.supplier) + "</td>" +
            "<td><span class='badge-status " + statusBadgeClass + "'>" + statusText + "</span></td>" +
            "<td class='text-center'>" +
            "  <div class='btn-action-group justify-content-center'>" +
            "    <button type='button' class='btn-action-edit' onclick='editPart(\"" + escapeHTML(p.id) + "\")'>Edit</button>" +
            "    <button type='button' class='btn-action-resume' onclick='openRestockModal(\"" + escapeHTML(p.id) + "\")'> Restock</button>" +
            "    <button type='button' class='btn-action-delete' onclick='deletePart(\"" + escapeHTML(p.id) + "\")'>Delete</button>" +
            "  </div>" +
            "</td>";

        tbody.appendChild(tr);
    }

    applyRolePermissions();
}

// Reset form
function resetForm() {
    document.getElementById("inventoryForm").reset();
    document.getElementById("editIndex").value = "-1";
    document.getElementById("partId").removeAttribute("readonly");
    document.getElementById("inventoryModalLabel").textContent = "Add Spare Part";
}

// Form Submit Handler
function handleFormSubmit(event) {
    event.preventDefault();

    let editIndexVal = parseInt(document.getElementById("editIndex").value);
    let id = document.getElementById("partId").value.trim();
    let name = document.getElementById("partName").value.trim();
    let category = document.getElementById("partCategory").value;
    let supplier = document.getElementById("partSupplier").value.trim();
    let quantity = parseInt(document.getElementById("partQuantity").value);
    let minStock = parseInt(document.getElementById("partMinStock").value);

    if (!id || !name || !category || !supplier || isNaN(quantity) || isNaN(minStock)) {
        showAlert("Please fill in all fields with valid numbers.", "danger");
        return;
    }

    let workorders = JSON.parse(localStorage.getItem("forge_workorders") || localStorage.getItem("iemrs_workorders")) || [];
    let waitingForThis = workorders.filter(o => o.status === "Waiting for Parts" && o.requiredPart === name);

    if (editIndexVal === -1) {
        // Add new
        for (let i = 0; i < inventoryList.length; i++) {
            if (inventoryList[i].id.toUpperCase() === id.toUpperCase()) {
                showAlert("Part ID already exists. Please choose a unique ID.", "danger");
                return;
            }
        }

        let newPart = {
            id: id,
            name: name,
            category: category,
            quantity: quantity,
            minStock: minStock,
            supplier: supplier
        };

        inventoryList.unshift(newPart);
        showAlert("Spare part " + name + " cataloged.", "success");
        logActivity(name, "Cataloged new spare part (Stock: " + quantity + " units, min: " + minStock + ")", "badge-available");
    } else {
        // Edit existing
        if (editIndexVal >= 0 && editIndexVal < inventoryList.length) {
            let oldPart = inventoryList[editIndexVal];
            let prevQty = oldPart.quantity;
            oldPart.name = name;
            oldPart.category = category;
            oldPart.quantity = quantity;
            oldPart.minStock = minStock;
            oldPart.supplier = supplier;

            if (quantity > prevQty && waitingForThis.length > 0) {
                showAlert("Stock replenished for " + name + ". Work orders waiting on this part can now be resumed manually.", "info");
                logActivity(name, "Stock replenished to " + quantity + " units (Pending work orders ready to resume)", "badge-available");
            } else {
                showAlert("Spare part " + name + " updated.", "success");
                logActivity(name, "Inventory updated (Stock: " + quantity + " units)", "badge-in-progress");
            }
        }
    }

    localStorage.setItem("forge_inventory", JSON.stringify(inventoryList));

    inventoryModalInstance.hide();
    filterAndRenderTable();
    updateKpiCards();
}

// Open Edit Modal
function editPart(id) {
    let index = -1;
    for (let i = 0; i < inventoryList.length; i++) {
        if (inventoryList[i].id === id) {
            index = i;
            break;
        }
    }

    if (index === -1) return;

    let p = inventoryList[index];

    document.getElementById("editIndex").value = index;
    document.getElementById("partId").value = p.id;
    document.getElementById("partId").setAttribute("readonly", true);
    document.getElementById("partName").value = p.name;
    document.getElementById("partCategory").value = p.category;
    document.getElementById("partSupplier").value = p.supplier;
    document.getElementById("partQuantity").value = p.quantity;
    document.getElementById("partMinStock").value = p.minStock;

    document.getElementById("inventoryModalLabel").textContent = "Edit Spare Part (" + p.id + ")";
    inventoryModalInstance.show();
}

// Delete Part
function deletePart(id) {
    let confirmed = confirm("Are you sure you want to remove part [" + id + "] from inventory?");
    if (!confirmed) return;

    let target = inventoryList.find(p => p.id === id);
    inventoryList = inventoryList.filter(p => p.id !== id);
    localStorage.setItem("forge_inventory", JSON.stringify(inventoryList));

    if (target) {
        logActivity(target.name, "Spare part " + id + " removed from inventory", "badge-faulty");
    }

    showAlert("Spare part " + id + " removed.", "danger");
    filterAndRenderTable();
    updateKpiCards();
}

// Open Restock Modal
function openRestockModal(id) {
    let part = inventoryList.find(p => p.id === id);
    if (!part) return;

    document.getElementById("restockPartId").value = part.id;
    document.getElementById("restockPartName").value = part.name + " (Current: " + part.quantity + " units)";
    document.getElementById("restockQuantity").value = 5;

    restockModalInstance.show();
}

// Handle Restock Form Submit
function handleRestockSubmit(event) {
    event.preventDefault();

    let partId = document.getElementById("restockPartId").value;
    let addQty = parseInt(document.getElementById("restockQuantity").value);

    if (!partId || isNaN(addQty) || addQty < 1) {
        showAlert("Please enter a valid quantity.", "danger");
        return;
    }

    let index = -1;
    for (let i = 0; i < inventoryList.length; i++) {
        if (inventoryList[i].id === partId) { index = i; break; }
    }

    if (index === -1) {
        showAlert("Part not found.", "danger");
        return;
    }

    let part = inventoryList[index];
    let prevQty = part.quantity;
    part.quantity = prevQty + addQty;

    localStorage.setItem("forge_inventory", JSON.stringify(inventoryList));

    // Check if any work orders can now be resumed
    let workorders = JSON.parse(localStorage.getItem("forge_workorders") || localStorage.getItem("iemrs_workorders")) || [];
    let waitingForThis = workorders.filter(o => o.status === "Waiting for Parts" && o.requiredPart === part.name);

    if (waitingForThis.length > 0 && part.quantity >= waitingForThis.reduce((s, o) => s + (o.requiredQuantity || 1), 0)) {
        showAlert("Stock replenished for " + part.name + ". " + waitingForThis.length + " work order(s) can now be resumed.", "info");
        logActivity(part.name, "Restocked +" + addQty + " units (Pending WOs ready to resume)", "badge-available");
    } else {
        showAlert(part.name + " restocked: +" + addQty + " units (Total: " + part.quantity + " units).", "success");
        logActivity(part.name, "Restocked +" + addQty + " units (Total stock: " + part.quantity + ")", "badge-available");
    }

    restockModalInstance.hide();
    filterAndRenderTable();
    updateKpiCards();
}


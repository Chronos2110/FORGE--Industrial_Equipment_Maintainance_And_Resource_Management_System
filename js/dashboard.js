// ==========================================================================
// FORGE - Dashboard JavaScript (js/dashboard.js)
// Operations Dashboard: Equipment Overview, Upcoming Maintenance,
// Open Work Orders, Warehouse Inventory Alerts & Chronological Recent Activity
// ==========================================================================

document.addEventListener("DOMContentLoaded", function () {
    refreshDashboard();
});

function refreshDashboard() {
    loadDashboardMetrics();
    loadUpcomingMaintenance();
    loadOpenWorkOrders();
    loadInventoryAlerts();
    loadRecentActivities();
    applyRolePermissions();
}

// 1. Calculate and update Equipment Overview metrics
function loadDashboardMetrics() {
    let equipment = JSON.parse(localStorage.getItem("iemrs_equipment")) || [];

    let total = equipment.length;
    let operational = 0;
    let inMaintenance = 0;
    let faulty = 0;

    for (let i = 0; i < equipment.length; i++) {
        let status = equipment[i].status;
        if (status === "Operational") {
            operational++;
        } else if (status === "Maintenance") {
            inMaintenance++;
        } else if (status === "Faulty") {
            faulty++;
        }
    }

    // Calculate Open Work Orders
    let workorders = JSON.parse(localStorage.getItem("iemrs_workorders")) || [];
    let openOrdersCount = 0;
    for (let j = 0; j < workorders.length; j++) {
        let st = workorders[j].status;
        if (st !== "Completed" && st !== "Cancelled") {
            openOrdersCount++;
        }
    }

    // Update Overview DOM Elements
    let totalEl = document.getElementById("totalEquipment");
    let opEl = document.getElementById("operationalEquipment");
    let maintEl = document.getElementById("maintenanceEquipment");
    let faultyEl = document.getElementById("faultyEquipment");
    let openOrdersEl = document.getElementById("openWorkOrdersMetric");

    if (totalEl) totalEl.textContent = total;
    if (opEl) opEl.textContent = operational;
    if (maintEl) maintEl.textContent = inMaintenance;
    if (faultyEl) faultyEl.textContent = faulty;
    if (openOrdersEl) openOrdersEl.textContent = openOrdersCount;
}

// 2. Load Upcoming Maintenance Tasks
// Columns: Equipment | Maintenance Type | Technician | Date | Status
function loadUpcomingMaintenance() {
    let maintenanceList = JSON.parse(localStorage.getItem("iemrs_maintenance")) || [];
    let tbody = document.getElementById("upcomingMaintenanceBody");
    let emptyState = document.getElementById("maintenanceEmptyState");

    if (!tbody) return;
    tbody.innerHTML = "";

    // Filter upcoming (Scheduled, Assigned, In Progress, Waiting for Parts)
    let upcoming = [];
    for (let i = 0; i < maintenanceList.length; i++) {
        let st = maintenanceList[i].status;
        if (st === "Scheduled" || st === "Assigned" || st === "In Progress" || st === "Waiting for Parts") {
            upcoming.push(maintenanceList[i]);
        }
    }

    if (upcoming.length === 0) {
        if (emptyState) emptyState.classList.remove("d-none");
        return;
    }

    if (emptyState) emptyState.classList.add("d-none");

    let countToShow = Math.min(upcoming.length, 5);
    for (let k = 0; k < countToShow; k++) {
        let item = upcoming[k];
        let tr = document.createElement("tr");

        let statusBadgeClass = "badge-scheduled";
        if (item.status === "Assigned") statusBadgeClass = "badge-assigned";
        else if (item.status === "In Progress") statusBadgeClass = "badge-in-progress";
        else if (item.status === "Waiting for Parts") statusBadgeClass = "badge-waiting";

        tr.innerHTML =
            "<td><strong>" + escapeHTML(item.equipment) + "</strong></td>" +
            "<td><span class='badge bg-light text-dark border'>" + escapeHTML(item.type) + "</span></td>" +
            "<td>" + escapeHTML(item.technician || "Unassigned") + "</td>" +
            "<td>" + escapeHTML(item.scheduledDate) + "</td>" +
            "<td><span class='badge-status " + statusBadgeClass + "'>" + escapeHTML(item.status) + "</span></td>";

        tbody.appendChild(tr);
    }
}

// 3. Load Open Work Orders
// Columns: WO ID | Equipment | Priority | Assigned To | Status | Action
function loadOpenWorkOrders() {
    let workorders = JSON.parse(localStorage.getItem("iemrs_workorders")) || [];
    let inventory = JSON.parse(localStorage.getItem("iemrs_inventory")) || [];
    let tbody = document.getElementById("openWorkOrdersBody");
    let emptyState = document.getElementById("workOrdersEmptyState");

    if (!tbody) return;
    tbody.innerHTML = "";

    let openOrders = [];
    for (let i = 0; i < workorders.length; i++) {
        let st = workorders[i].status;
        if (st !== "Completed" && st !== "Cancelled") {
            openOrders.push(workorders[i]);
        }
    }

    if (openOrders.length === 0) {
        if (emptyState) emptyState.classList.remove("d-none");
        return;
    }

    if (emptyState) emptyState.classList.add("d-none");

    let countToShow = Math.min(openOrders.length, 5);
    for (let j = 0; j < countToShow; j++) {
        let order = openOrders[j];
        let tr = document.createElement("tr");

        let priorityBadge = "badge-low";
        if (order.priority === "High") priorityBadge = "badge-high";
        else if (order.priority === "Medium") priorityBadge = "badge-medium";

        let statusBadgeClass = "badge-scheduled";
        if (order.status === "Assigned") statusBadgeClass = "badge-assigned";
        else if (order.status === "In Progress") statusBadgeClass = "badge-in-progress";
        else if (order.status === "Waiting for Parts") statusBadgeClass = "badge-waiting";

        // Action button
        let actionBtnHtml = "<a href='workorders.html' class='btn btn-sm btn-outline-secondary' style='font-size:0.78rem; padding:3px 8px;'>View</a>";
        if (order.status === "Waiting for Parts") {
            let partObj = inventory.find(p => p.name === order.requiredPart);
            let isRestocked = partObj && partObj.quantity >= (order.requiredQuantity || 1);
            if (isRestocked) {
                actionBtnHtml = "<button type='button' class='btn btn-sm btn-success fw-bold' style='font-size:0.78rem; padding:3px 8px;' onclick='resumeOrderFromDashboard(\"" + escapeHTML(order.id) + "\")'>Resume Work</button>";
            } else {
                actionBtnHtml = "<a href='inventory.html' class='btn btn-sm btn-outline-danger' style='font-size:0.78rem; padding:3px 8px;'>Restock Part</a>";
            }
        }

        tr.innerHTML =
            "<td><strong>" + escapeHTML(order.id) + "</strong></td>" +
            "<td>" + escapeHTML(order.equipment) + "</td>" +
            "<td><span class='badge-priority " + priorityBadge + "'>" + escapeHTML(order.priority) + "</span></td>" +
            "<td>" + escapeHTML(order.technician || "Unassigned") + "</td>" +
            "<td><span class='badge-status " + statusBadgeClass + "'>" + escapeHTML(order.status) + "</span></td>" +
            "<td class='text-center'>" + actionBtnHtml + "</td>";

        tbody.appendChild(tr);
    }
}

// Direct action to resume a work order when parts are available
function resumeOrderFromDashboard(orderId) {
    let workorders = JSON.parse(localStorage.getItem("iemrs_workorders")) || [];
    let order = workorders.find(o => o.id === orderId);
    if (!order) return;

    order.status = "In Progress";
    order.waitingReason = "";
    localStorage.setItem("iemrs_workorders", JSON.stringify(workorders));

    syncEquipmentStatusOnWorkOrder(order.equipment, "In Progress");
    logActivity(order.equipment, "Work order " + orderId + " resumed from Dashboard (In Progress)", "badge-in-progress");

    showAlert("Work Order " + orderId + " resumed to In Progress.", "success");
    refreshDashboard();
}

// 4. Load Warehouse Inventory Alerts
// Columns: Part | Current Stock | Minimum Stock | Status
function loadInventoryAlerts() {
    let inventory = JSON.parse(localStorage.getItem("iemrs_inventory")) || [];
    let tbody = document.getElementById("inventoryAlertsBody");
    let emptyState = document.getElementById("inventoryEmptyState");

    if (!tbody) return;
    tbody.innerHTML = "";

    let lowStockItems = [];
    for (let i = 0; i < inventory.length; i++) {
        if (inventory[i].quantity <= inventory[i].minStock) {
            lowStockItems.push(inventory[i]);
        }
    }

    if (lowStockItems.length === 0) {
        if (emptyState) emptyState.classList.remove("d-none");
        return;
    }

    if (emptyState) emptyState.classList.add("d-none");

    let countToShow = Math.min(lowStockItems.length, 5);
    for (let j = 0; j < countToShow; j++) {
        let item = lowStockItems[j];
        let tr = document.createElement("tr");

        let qty = parseInt(item.quantity) || 0;
        let statusBadgeClass = "badge-low-stock";
        let statusText = "Low Stock";
        if (qty === 0) {
            statusBadgeClass = "badge-faulty";
            statusText = "Out of Stock";
        }

        tr.innerHTML =
            "<td><strong>" + escapeHTML(item.name) + "</strong> <small class='text-muted d-block' style='font-size:0.75rem;'>" + escapeHTML(item.id) + "</small></td>" +
            "<td><strong class='" + (qty === 0 ? "text-danger" : "text-warning") + "'>" + qty + "</strong> units</td>" +
            "<td>" + escapeHTML(item.minStock) + " units</td>" +
            "<td><span class='badge-status " + statusBadgeClass + "'>" + statusText + "</span></td>";

        tbody.appendChild(tr);
    }
}

// 5. Load Recent Audit Activity (Simple Chronological List)
// Columns: Time | Asset / Part | Activity Description | Recorded By
function loadRecentActivities() {
    let activities = JSON.parse(localStorage.getItem("iemrs_activities")) || [];
    let tbody = document.getElementById("recentActivityBody");

    if (!tbody) return;
    tbody.innerHTML = "";

    let countToShow = Math.min(activities.length, 5);
    for (let i = 0; i < countToShow; i++) {
        let act = activities[i];
        let tr = document.createElement("tr");

        tr.innerHTML =
            "<td><small class='text-muted'>" + escapeHTML(act.time) + "</small></td>" +
            "<td><strong>" + escapeHTML(act.item) + "</strong></td>" +
            "<td>" + escapeHTML(act.activity) + "</td>" +
            "<td><span class='badge bg-light text-dark border'>" + escapeHTML(act.user || "System") + "</span></td>";

        tbody.appendChild(tr);
    }
}
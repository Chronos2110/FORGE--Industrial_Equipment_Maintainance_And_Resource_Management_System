// ==========================================================================
// FORGE V4 - Dashboard JavaScript (js/dashboard.js)
// Role-Specific Views: Administrator | Technician | Operator
// Storage: forge_equipment, forge_workorders, forge_maintenance,
//          forge_inventory, forge_activity, forge_faults
// ==========================================================================

document.addEventListener("DOMContentLoaded", function () {
    var role = getActiveRole();
    activateRoleView(role);
    refreshDashboard();
});

// ==========================================================================
// Activate the correct role panel
// ==========================================================================
function activateRoleView(role) {
    document.querySelectorAll(".role-view-panel").forEach(function (panel) {
        panel.classList.remove("active");
    });

    var panelMap = {
        "Administrator": "panelAdmin",
        "Technician":    "panelTechnician",
        "Operator":      "panelOperator"
    };

    var panelId = panelMap[role] || "panelAdmin";
    var panel = document.getElementById(panelId);
    if (panel) panel.classList.add("active");
}

// ==========================================================================
// Master refresh dispatcher
// ==========================================================================
function refreshDashboard() {
    var role = getActiveRole();

    if (role === "Administrator") {
        loadAdminMetrics();
        loadUpcomingMaintenance();
        loadOpenWorkOrders();
        loadInventoryAlerts();
        loadRecentActivities();
        applyRolePermissions();

    } else if (role === "Technician") {
        loadTechnicianDashboard();
        applyRolePermissions();

    } else if (role === "Operator") {
        loadOperatorDashboard();
        applyRolePermissions();
    }
}

// ==========================================================================
// ADMINISTRATOR VIEW
// ==========================================================================
function loadAdminMetrics() {
    var equipment = JSON.parse(localStorage.getItem("forge_equipment")) ||
                    JSON.parse(localStorage.getItem("iemrs_equipment")) || [];
    var workorders = JSON.parse(localStorage.getItem("forge_workorders")) ||
                     JSON.parse(localStorage.getItem("iemrs_workorders")) || [];
    var inventory  = JSON.parse(localStorage.getItem("forge_inventory"))  ||
                     JSON.parse(localStorage.getItem("iemrs_inventory"))  || [];

    var total = equipment.length;
    var operational = 0, inMaintenance = 0, faulty = 0;
    for (var i = 0; i < equipment.length; i++) {
        var st = equipment[i].status;
        if (st === "Operational") operational++;
        else if (st === "Maintenance") inMaintenance++;
        else if (st === "Faulty") faulty++;
    }

    var openOrders = 0;
    for (var j = 0; j < workorders.length; j++) {
        var ws = workorders[j].status;
        if (ws !== "Completed" && ws !== "Cancelled") openOrders++;
    }

    var lowStock = 0;
    for (var k = 0; k < inventory.length; k++) {
        var p = inventory[k];
        var min = p.minimumStock !== undefined ? p.minimumStock : (p.minStock || 0);
        if (parseInt(p.quantity) <= parseInt(min)) lowStock++;
    }

    setEl("totalEquipment",      total);
    setEl("operationalEquipment", operational);
    setEl("maintenanceEquipment", inMaintenance);
    setEl("faultyEquipment",     faulty);
    setEl("openWorkOrdersMetric", openOrders);
    setEl("adminLowStockCount",   lowStock);
    setEl("adminFleetPct", total > 0 ? Math.round((operational / total) * 100) + "%" : "—");
}

function loadUpcomingMaintenance() {
    var list = JSON.parse(localStorage.getItem("forge_maintenance")) ||
               JSON.parse(localStorage.getItem("iemrs_maintenance")) || [];
    var tbody = document.getElementById("upcomingMaintenanceBody");
    var empty = document.getElementById("maintenanceEmptyState");
    if (!tbody) return;
    tbody.innerHTML = "";

    var upcoming = list.filter(function (m) {
        return m.status === "Scheduled" || m.status === "Assigned" ||
               m.status === "In Progress" || m.status === "Waiting for Parts";
    });

    if (upcoming.length === 0) { if (empty) empty.classList.remove("d-none"); return; }
    if (empty) empty.classList.add("d-none");

    var count = Math.min(upcoming.length, 5);
    for (var i = 0; i < count; i++) {
        var item = upcoming[i];
        var tr = document.createElement("tr");
        var sc = statusBadgeClass(item.status);
        tr.innerHTML =
            "<td><strong>" + escapeHTML(item.equipment) + "</strong></td>" +
            "<td><span class='badge bg-light text-dark border' style='font-size:0.72rem;'>" + escapeHTML(item.type) + "</span></td>" +
            "<td>" + escapeHTML(item.technician || "Unassigned") + "</td>" +
            "<td>" + escapeHTML(item.scheduledDate) + "</td>" +
            "<td><span class='badge-status " + sc + "'>" + escapeHTML(item.status) + "</span></td>";
        tbody.appendChild(tr);
    }
}

function loadOpenWorkOrders() {
    var workorders = JSON.parse(localStorage.getItem("forge_workorders")) ||
                     JSON.parse(localStorage.getItem("iemrs_workorders")) || [];
    var inventory  = JSON.parse(localStorage.getItem("forge_inventory"))  ||
                     JSON.parse(localStorage.getItem("iemrs_inventory"))  || [];
    var tbody = document.getElementById("openWorkOrdersBody");
    var empty = document.getElementById("workOrdersEmptyState");
    if (!tbody) return;
    tbody.innerHTML = "";

    var open = workorders.filter(function (o) {
        return o.status !== "Completed" && o.status !== "Cancelled";
    });

    if (open.length === 0) { if (empty) empty.classList.remove("d-none"); return; }
    if (empty) empty.classList.add("d-none");

    var count = Math.min(open.length, 5);
    for (var j = 0; j < count; j++) {
        var o = open[j];
        var tr = document.createElement("tr");
        var priBadge = "badge-low";
        if (o.priority === "High") priBadge = "badge-high";
        else if (o.priority === "Medium") priBadge = "badge-medium";

        var sc = statusBadgeClass(o.status);
        var isWaiting = o.status === "Waiting for Parts";
        var actionHtml = "<a href='workorders.html' class='btn btn-sm btn-outline-secondary' style='font-size:0.78rem;padding:3px 8px;'>View</a>";

        if (isWaiting) {
            var partName = o.requiredPart || o.requiredPartId || "";
            var partObj = inventory.find(function (p) { return p.name === partName || p.partName === partName; });
            var needed = parseInt(o.requiredQuantity) || 1;
            var inStock = partObj && parseInt(partObj.quantity) >= needed;
            if (inStock) {
                actionHtml = "<button type='button' class='btn btn-sm btn-success fw-bold' style='font-size:0.78rem;padding:3px 8px;' onclick='resumeOrderFromDashboard(\"" + escapeHTML(o.id) + "\")'>Resume Work</button>";
            } else {
                actionHtml = "<a href='inventory.html' class='btn btn-sm btn-outline-danger' style='font-size:0.78rem;padding:3px 8px;'>Restock Part</a>";
            }
        }

        tr.innerHTML =
            "<td><strong>" + escapeHTML(o.id) + "</strong></td>" +
            "<td>" + escapeHTML(o.equipment) + "</td>" +
            "<td><span class='badge-priority " + priBadge + "'>" + escapeHTML(o.priority) + "</span></td>" +
            "<td>" + escapeHTML(o.technician || "Unassigned") + "</td>" +
            "<td><span class='badge-status " + sc + "'>" + escapeHTML(o.status) + "</span></td>" +
            "<td class='text-center'>" + actionHtml + "</td>";
        tbody.appendChild(tr);
    }
}

function resumeOrderFromDashboard(orderId) {
    var workorders = JSON.parse(localStorage.getItem("forge_workorders")) ||
                     JSON.parse(localStorage.getItem("iemrs_workorders")) || [];
    var order = workorders.find(function (o) { return o.id === orderId; });
    if (!order) return;

    order.status = "In Progress";
    order.waitingReason = "";
    localStorage.setItem("forge_workorders",  JSON.stringify(workorders));
    localStorage.setItem("iemrs_workorders",  JSON.stringify(workorders));

    syncEquipmentStatusOnWorkOrder(order.equipment, "In Progress");
    logActivity(order.equipment, "Work order " + orderId + " resumed from Dashboard (In Progress)", "badge-in-progress");
    showAlert("Work Order " + orderId + " resumed to In Progress.", "success");
    refreshDashboard();
}

function loadInventoryAlerts() {
    var inventory = JSON.parse(localStorage.getItem("forge_inventory")) ||
                    JSON.parse(localStorage.getItem("iemrs_inventory")) || [];
    var tbody = document.getElementById("inventoryAlertsBody");
    var empty = document.getElementById("inventoryEmptyState");
    if (!tbody) return;
    tbody.innerHTML = "";

    var lowStock = inventory.filter(function (p) {
        var min = p.minimumStock !== undefined ? p.minimumStock : (p.minStock || 0);
        return parseInt(p.quantity) <= parseInt(min);
    });

    if (lowStock.length === 0) { if (empty) empty.classList.remove("d-none"); return; }
    if (empty) empty.classList.add("d-none");

    var count = Math.min(lowStock.length, 5);
    for (var j = 0; j < count; j++) {
        var item = lowStock[j];
        var tr = document.createElement("tr");
        var qty = parseInt(item.quantity) || 0;
        var min = item.minimumStock !== undefined ? item.minimumStock : (item.minStock || 0);
        var stText = qty === 0 ? "Out of Stock" : "Low Stock";
        var stClass = qty === 0 ? "badge-faulty" : "badge-low-stock";

        tr.innerHTML =
            "<td><strong>" + escapeHTML(item.name || item.partName) + "</strong>" +
            "<small class='text-muted d-block' style='font-size:0.75rem;'>" + escapeHTML(item.id) + "</small></td>" +
            "<td><strong class='" + (qty === 0 ? "text-danger" : "text-warning") + "'>" + qty + "</strong> units</td>" +
            "<td>" + escapeHTML(String(min)) + " units</td>" +
            "<td><span class='badge-status " + stClass + "'>" + stText + "</span></td>";
        tbody.appendChild(tr);
    }
}

function loadRecentActivities() {
    var acts = JSON.parse(localStorage.getItem("forge_activity")) || [];
    // Fallback to legacy
    if (acts.length === 0) {
        var legacy = JSON.parse(localStorage.getItem("iemrs_activities")) || [];
        acts = legacy.map(function (a) {
            return { timestamp: a.time, actor: a.user, action: a.activity, target: a.item, badgeClass: a.badge };
        });
    }
    var tbody = document.getElementById("recentActivityBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    var count = Math.min(acts.length, 8);
    for (var i = 0; i < count; i++) {
        var act = acts[i];
        var tr = document.createElement("tr");
        tr.innerHTML =
            "<td><small class='text-muted'>" + escapeHTML(act.timestamp || act.time || "—") + "</small></td>" +
            "<td><strong>" + escapeHTML(act.target || act.item || "—") + "</strong></td>" +
            "<td>" + escapeHTML(act.action || act.activity || "—") + "</td>" +
            "<td><span class='badge bg-light text-dark border' style='font-size:0.72rem;'>" + escapeHTML(act.actor || act.user || "System") + "</span></td>";
        tbody.appendChild(tr);
    }
}

// ==========================================================================
// TECHNICIAN VIEW
// ==========================================================================
function loadTechnicianDashboard() {
    var role      = getActiveRole();
    var techName  = sessionStorage.getItem("forge_tech_name") || "";
    var workorders = JSON.parse(localStorage.getItem("forge_workorders")) ||
                     JSON.parse(localStorage.getItem("iemrs_workorders")) || [];

    // Filter by technician name (if saved) or show all for demo
    var myOrders = workorders.filter(function (o) {
        if (techName) return o.technician === techName;
        return o.status !== "Completed" && o.status !== "Cancelled";
    });

    var myOpen    = myOrders.filter(function (o) { return o.status === "Assigned" || o.status === "In Progress"; }).length;
    var myWaiting = myOrders.filter(function (o) { return o.status === "Waiting for Parts"; }).length;
    var myToday   = myOrders.filter(function (o) { return o.scheduledDate === new Date().toISOString().split("T")[0]; }).length;

    setEl("techOpenTickets",   myOpen);
    setEl("techWaitingParts",  myWaiting);
    setEl("techTodaySchedule", myToday);

    // Render task cards
    var container = document.getElementById("techTaskList");
    if (!container) return;
    container.innerHTML = "";

    if (myOrders.length === 0) {
        container.innerHTML = "<div class='empty-state text-center py-4'><h5>No Active Tasks</h5><p class='text-muted'>All work orders have been completed or none assigned.</p></div>";
        return;
    }

    myOrders.forEach(function (o) {
        var sc = statusBadgeClass(o.status);
        var priBadge = "badge-low";
        if (o.priority === "High") priBadge = "badge-high";
        else if (o.priority === "Medium") priBadge = "badge-medium";

        var isWaiting = o.status === "Waiting for Parts";
        var isInProg  = o.status === "In Progress";
        var isAssigned = o.status === "Assigned";

        var actionsHtml = "<div class='tech-task-actions'>";
        if (isAssigned) {
            actionsHtml += "<button class='btn btn-sm btn-primary fw-bold' onclick='techUpdateStatus(\"" + escapeHTML(o.id) + "\",\"In Progress\")'>▶ Start</button>";
        }
        if (isInProg) {
            actionsHtml += "<button class='btn btn-sm btn-warning fw-bold' onclick='techUpdateStatus(\"" + escapeHTML(o.id) + "\",\"Waiting for Parts\")'>⏸ Hold — Waiting for Parts</button>";
            actionsHtml += "<button class='btn btn-sm btn-success fw-bold' onclick='techUpdateStatus(\"" + escapeHTML(o.id) + "\",\"Completed\")'>✔ Complete</button>";
        }
        if (isWaiting) {
            actionsHtml += "<button class='btn btn-sm btn-info fw-bold' onclick='techUpdateStatus(\"" + escapeHTML(o.id) + "\",\"In Progress\")'>▶ Resume</button>";
        }
        actionsHtml += "<a href='workorders.html' class='btn btn-sm btn-outline-secondary'>Details</a>";
        actionsHtml += "</div>";

        var div = document.createElement("div");
        div.className = "tech-task-card";
        div.innerHTML =
            "<div class='d-flex justify-content-between align-items-start flex-wrap gap-2'>" +
            "  <div>" +
            "    <span class='task-id'>" + escapeHTML(o.id) + "</span>" +
            "    <div class='task-title'>" + escapeHTML(o.equipment) + "</div>" +
            "    <div class='task-meta'>" + escapeHTML(o.problem || o.description || "") + "</div>" +
            "  </div>" +
            "  <div class='d-flex gap-2 align-items-center'>" +
            "    <span class='badge-priority " + priBadge + "'>" + escapeHTML(o.priority) + "</span>" +
            "    <span class='badge-status " + sc + "'>" + escapeHTML(o.status) + "</span>" +
            "  </div>" +
            "</div>" +
            (o.scheduledDate ? "<div class='task-meta mt-1'>📅 Scheduled: " + escapeHTML(o.scheduledDate) + "</div>" : "") +
            (isWaiting && o.waitingReason ? "<div class='task-meta mt-1 text-warning'>⏸ Hold: " + escapeHTML(o.waitingReason) + "</div>" : "") +
            actionsHtml;
        container.appendChild(div);
    });
}

function techUpdateStatus(orderId, newStatus) {
    var workorders = JSON.parse(localStorage.getItem("forge_workorders")) ||
                     JSON.parse(localStorage.getItem("iemrs_workorders")) || [];
    var order = workorders.find(function (o) { return o.id === orderId; });
    if (!order) return;

    var prevStatus = order.status;
    order.status = newStatus;

    if (newStatus === "Waiting for Parts" && !order.waitingReason) {
        var reason = prompt("Enter hold reason (e.g. part name or reason):");
        if (reason) { order.waitingReason = reason; }
        else { order.waitingReason = "Awaiting spare parts"; }
    }
    if (newStatus === "In Progress" || newStatus === "Completed") {
        order.waitingReason = newStatus === "In Progress" ? "" : order.waitingReason;
    }

    localStorage.setItem("forge_workorders", JSON.stringify(workorders));
    localStorage.setItem("iemrs_workorders", JSON.stringify(workorders));

    syncEquipmentStatusOnWorkOrder(order.equipment, newStatus);

    if (newStatus === "Completed" && order.requiredPart && order.requiredQuantity > 0) {
        consumeSparePartsOnComplete(order.requiredPart, parseInt(order.requiredQuantity), orderId);
    }

    logActivity(order.equipment, "WO " + orderId + " updated: " + prevStatus + " → " + newStatus, statusBadgeClass(newStatus));
    showAlert("Work Order " + orderId + " → " + newStatus, "success");
    loadTechnicianDashboard();
}

// ==========================================================================
// OPERATOR VIEW
// ==========================================================================
function loadOperatorDashboard() {
    var equipment = JSON.parse(localStorage.getItem("forge_equipment")) ||
                    JSON.parse(localStorage.getItem("iemrs_equipment")) || [];
    var workorders = JSON.parse(localStorage.getItem("forge_workorders")) ||
                     JSON.parse(localStorage.getItem("iemrs_workorders")) || [];
    var faults = JSON.parse(localStorage.getItem("forge_faults")) || [];

    // KPIs
    var opCount   = equipment.filter(function (e) { return e.status === "Operational"; }).length;
    var downCount = equipment.filter(function (e) { return e.status === "Faulty" || e.status === "Maintenance"; }).length;
    var openWOs   = workorders.filter(function (o) { return o.status !== "Completed" && o.status !== "Cancelled"; }).length;
    var openFaultCount = faults.filter(function (f) { return f.status === "Open" || f.status === "Reviewing"; }).length;

    setEl("opRunning",    opCount);
    setEl("opDown",       downCount);
    // Show open work orders count (more useful for operators than fault count which may be zero)
    setEl("opOpenFaults", openWOs > 0 ? openWOs : openFaultCount);

    // Machine status grid
    var grid = document.getElementById("operatorMachineGrid");
    if (grid) {
        grid.innerHTML = "";
        if (equipment.length === 0) {
            grid.innerHTML = "<div class='col-12'><div class='empty-state'><div class='empty-state-icon'>🏭</div><h5>No Equipment Registered</h5><p>Equipment records will appear here once added.</p></div></div>";
        } else {
            equipment.forEach(function (eq) {
                var dotClass = "operational";
                if (eq.status === "Maintenance") dotClass = "maintenance";
                else if (eq.status === "Faulty") dotClass = "faulty";

                var col = document.createElement("div");
                col.className = "col-md-4 col-sm-6";
                col.innerHTML =
                    "<div class='operator-machine-card'>" +
                    "  <div class='d-flex align-items-center mb-1'>" +
                    "    <span class='op-status-dot " + dotClass + "'></span>" +
                    "    <span class='machine-name'>" + escapeHTML(eq.name) + "</span>" +
                    "  </div>" +
                    "  <div class='machine-loc'>" + escapeHTML(eq.location || "—") + " — " + escapeHTML(eq.type || "—") + "</div>" +
                    "  <div class='mt-2'><span class='badge-status " + (eq.status === "Operational" ? "badge-operational" : eq.status === "Maintenance" ? "badge-maintenance" : "badge-faulty") + "'>" + escapeHTML(eq.status) + "</span></div>" +
                    "</div>";
                grid.appendChild(col);
            });
        }
    }

    // Fault / Work Order table — show open work orders if no forge_faults exist
    var faultTbody = document.getElementById("operatorFaultBody");
    if (faultTbody) {
        faultTbody.innerHTML = "";

        // Prefer forge_faults; if none, fall back to open work orders
        var openFaults = faults.filter(function (f) { return f.status !== "Closed"; });
        if (openFaults.length > 0) {
            openFaults.forEach(function (f) {
                var tr = document.createElement("tr");
                var stClass = "badge-fault-open";
                if (f.status === "Converted to WO") stClass = "badge-fault-converted";
                else if (f.status === "Reviewing") stClass = "badge-fault-reviewing";
                tr.innerHTML =
                    "<td><strong>" + escapeHTML(f.id) + "</strong></td>" +
                    "<td>" + escapeHTML(f.equipmentName || f.equipmentId || "—") + "</td>" +
                    "<td><span class='badge-priority badge-" + (f.priority || "medium").toLowerCase() + "'>" + escapeHTML(f.priority || "—") + "</span></td>" +
                    "<td><span class='badge-status " + stClass + "'>" + escapeHTML(f.status) + "</span>" +
                    (f.workOrderId ? " <small class='text-muted'>→ " + escapeHTML(f.workOrderId) + "</small>" : "") + "</td>";
                faultTbody.appendChild(tr);
            });
        } else {
            // Show open work orders instead (useful for operator who can see WO status)
            var openOrders = workorders.filter(function (o) { return o.status !== "Completed" && o.status !== "Cancelled"; });
            var count = Math.min(openOrders.length, 6);
            if (count === 0) {
                faultTbody.innerHTML = "<tr><td colspan='4' class='text-center text-muted py-3' style='font-size:0.85rem;'>No active work orders or fault reports.</td></tr>";
            } else {
                for (var i = 0; i < count; i++) {
                    var o = openOrders[i];
                    var tr = document.createElement("tr");
                    var sc = statusBadgeClass(o.status);
                    var priBadge = "badge-low";
                    if (o.priority === "High") priBadge = "badge-high";
                    else if (o.priority === "Medium") priBadge = "badge-medium";
                    tr.innerHTML =
                        "<td><strong>" + escapeHTML(o.id) + "</strong></td>" +
                        "<td>" + escapeHTML(o.equipment || "—") + "</td>" +
                        "<td><span class='badge-priority " + priBadge + "'>" + escapeHTML(o.priority || "—") + "</span></td>" +
                        "<td><span class='badge-status " + sc + "'>" + escapeHTML(o.status) + "</span></td>";
                    faultTbody.appendChild(tr);
                }
            }
        }
    }
}

// ==========================================================================
// Spare parts deduction on WO completion (called from technician view)
// ==========================================================================
function consumeSparePartsOnComplete(partName, qty, orderId) {
    var inventory = JSON.parse(localStorage.getItem("forge_inventory")) ||
                    JSON.parse(localStorage.getItem("iemrs_inventory")) || [];
    var idx = -1;
    for (var i = 0; i < inventory.length; i++) {
        if ((inventory[i].name || inventory[i].partName) === partName) { idx = i; break; }
    }
    if (idx === -1) return;
    var p = inventory[idx];
    var cur = parseInt(p.quantity) || 0;
    p.quantity = Math.max(0, cur - Math.min(cur, qty));
    localStorage.setItem("forge_inventory", JSON.stringify(inventory));
    localStorage.setItem("iemrs_inventory", JSON.stringify(inventory));
    logActivity(partName, "Consumed " + qty + " units for Work Order " + orderId, "badge-maintenance");
}

// ==========================================================================
// Helpers
// ==========================================================================
function setEl(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
}

function statusBadgeClass(status) {
    var map = {
        "Scheduled":         "badge-scheduled",
        "Assigned":          "badge-assigned",
        "In Progress":       "badge-in-progress",
        "Waiting for Parts": "badge-waiting",
        "Ready to Resume":   "badge-ready-resume",
        "Completed":         "badge-completed",
        "Cancelled":         "badge-cancelled"
    };
    return map[status] || "badge-scheduled";
}
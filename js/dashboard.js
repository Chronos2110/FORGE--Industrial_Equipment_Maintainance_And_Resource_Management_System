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
        loadAdminExceptions();
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
// ADMINISTRATOR VIEW: Operational Exceptions & Bottlenecks
// ==========================================================================
function loadAdminExceptions() {
    var banner = document.getElementById("adminExceptionsBanner");
    var list = document.getElementById("adminExceptionsList");
    var countEl = document.getElementById("adminExceptionsCount");
    if (!banner || !list) return;

    var equipment = JSON.parse(localStorage.getItem("forge_equipment")) || [];
    var workorders = JSON.parse(localStorage.getItem("forge_workorders")) || [];
    var inventory = JSON.parse(localStorage.getItem("forge_inventory")) || [];

    var exceptions = [];

    // 1. Faulty or Down Machinery
    equipment.forEach(function (eq) {
        if (eq.status === "Faulty") {
            exceptions.push({
                type: "danger",
                tag: "DOWN MACHINERY",
                title: eq.name + " (" + (eq.location || "Floor") + ")",
                desc: "Critical breakdown reported — immediate maintenance intervention needed.",
                actionText: "Inspect Asset",
                actionHref: "equipment.html?id=" + encodeURIComponent(eq.id)
            });
        } else if (eq.status === "Maintenance") {
            exceptions.push({
                type: "warning",
                tag: "UNDER SERVICE",
                title: eq.name,
                desc: "Currently offline for preventive service or work order repairs.",
                actionText: "View Asset",
                actionHref: "equipment.html?id=" + encodeURIComponent(eq.id)
            });
        }
    });

    // 2. Bottlenecked / High-Priority Work Orders
    workorders.forEach(function (wo) {
        if (wo.status === "Waiting for Parts") {
            exceptions.push({
                type: "warning",
                tag: "PARTS BOTTLENECK",
                title: wo.id + " — " + wo.equipment,
                desc: "Hold: " + (wo.waitingReason || "Awaiting spare parts") + (wo.expectedResumeDate ? " (Est. resume: " + wo.expectedResumeDate + ")" : ""),
                actionText: "Dispatch Console",
                actionHref: "workorders.html?id=" + encodeURIComponent(wo.id)
            });
        } else if ((wo.priority === "High" || wo.priority === "Critical") && wo.status !== "Completed" && wo.status !== "Cancelled") {
            exceptions.push({
                type: "danger",
                tag: "CRITICAL DISPATCH",
                title: wo.id + " — " + wo.equipment,
                desc: "High priority order assigned to " + (wo.technician || "Unassigned") + ": " + (wo.problem || wo.description || ""),
                actionText: "Open Order",
                actionHref: "workorders.html?id=" + encodeURIComponent(wo.id)
            });
        }
    });

    // 3. Low-Stock Parts Below Minimum
    inventory.forEach(function (p) {
        var qty = parseInt(p.quantity) || 0;
        var min = parseInt(p.minimumStock !== undefined ? p.minimumStock : (p.minStock || 0));
        if (qty <= min) {
            exceptions.push({
                type: qty === 0 ? "danger" : "warning",
                tag: qty === 0 ? "OUT OF STOCK" : "STOCKOUT RISK",
                title: p.name || p.partName,
                desc: "Available: " + qty + " units | Safety threshold: " + min + " units.",
                actionText: "Restock Part",
                actionHref: "inventory.html?id=" + encodeURIComponent(p.id)
            });
        }
    });

    if (exceptions.length === 0) {
        banner.classList.add("d-none");
        return;
    }

    banner.classList.remove("d-none");
    if (countEl) countEl.textContent = exceptions.length + " Active Exception" + (exceptions.length === 1 ? "" : "s");

    list.innerHTML = "";
    var displayCount = Math.min(exceptions.length, 6);
    for (var i = 0; i < displayCount; i++) {
        var ex = exceptions[i];
        var itemDiv = document.createElement("div");
        itemDiv.className = "exception-item";
        itemDiv.innerHTML =
            "<div class='exception-item-left'>" +
                "<span class='exception-tag text-" + ex.type + "'>" + ex.tag + "</span>" +
                "<span class='exception-title'>" + escapeHTML(ex.title) + "</span>" +
                "<span class='exception-desc'>" + escapeHTML(ex.desc) + "</span>" +
            "</div>" +
            "<a href='" + ex.actionHref + "' class='exception-action-btn'>" + ex.actionText + " &rarr;</a>";
        list.appendChild(itemDiv);
    }
}

// ==========================================================================
// ADMINISTRATOR VIEW: Metrics & Overview
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
            "<td><a href='javascript:void(0)' data-action='view-dossier' data-equipment-id='" + escapeHTML(item.equipment) + "' class='badge-eq-dossier' title='Open 360° Technical Dossier' style='color:var(--text-primary); font-weight:700; text-decoration:underline; cursor:pointer;'><strong>" + escapeHTML(item.equipment) + "</strong></a></td>" +
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
            "<td><a href='javascript:void(0)' data-action='view-dossier' data-equipment-id='" + escapeHTML(o.equipment) + "' class='badge-eq-dossier' title='Open 360° Technical Dossier' style='color:var(--text-primary); font-weight:700; text-decoration:underline; cursor:pointer;'>" + escapeHTML(o.equipment) + "</a></td>" +
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
    var role       = getActiveRole();
    var techName   = sessionStorage.getItem("forge_tech_name") || "";
    var workorders = JSON.parse(localStorage.getItem("forge_workorders")) ||
                     JSON.parse(localStorage.getItem("iemrs_workorders")) || [];
    var inventory  = JSON.parse(localStorage.getItem("forge_inventory")) || [];
    var maintenance= JSON.parse(localStorage.getItem("forge_maintenance")) || [];

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
    if (container) {
        container.innerHTML = "";
        if (myOrders.length === 0) {
            container.innerHTML = "<div class='empty-state text-center py-4'><div class='empty-state-icon'>🔧</div><h5>No Active Tasks</h5><p class='text-muted'>All work orders have been completed or none assigned.</p></div>";
        } else {
            myOrders.forEach(function (o) {
                var sc = statusBadgeClass(o.status);
                var priBadge = "badge-low";
                if (o.priority === "High" || o.priority === "Critical") priBadge = "badge-high";
                else if (o.priority === "Medium") priBadge = "badge-medium";

                var isWaiting  = o.status === "Waiting for Parts";
                var isInProg   = o.status === "In Progress";
                var isAssigned = o.status === "Assigned";

                // Check spare parts availability in inventory
                var partsHtml = "";
                if (o.requiredPart && o.requiredQuantity > 0) {
                    var partObj = inventory.find(function (p) {
                        return (p.name || p.partName) === o.requiredPart;
                    });
                    var curQty = partObj ? parseInt(partObj.quantity) : 0;
                    var hasStock = curQty >= parseInt(o.requiredQuantity);
                    var pillClass = hasStock ? "in-stock" : "low-stock";
                    var pillText = hasStock
                        ? "✔ Stock Available (" + curQty + " in warehouse)"
                        : "⚠ Stock Deficit (" + curQty + " available / " + o.requiredQuantity + " required)";
                    partsHtml = "<div class='tech-part-pill " + pillClass + "'>🔩 " + escapeHTML(o.requiredPart) + " &bull; " + o.requiredQuantity + " pcs &bull; " + pillText + "</div>";
                }

                var actionsHtml = "<div class='tech-task-actions'>";
                if (isAssigned) {
                    actionsHtml += "<button class='btn btn-sm btn-primary fw-bold' onclick='techUpdateStatus(\"" + escapeHTML(o.id) + "\",\"In Progress\")'>▶ Start Job</button>";
                }
                if (isInProg) {
                    actionsHtml += "<button class='btn btn-sm btn-warning fw-bold' onclick='techUpdateStatus(\"" + escapeHTML(o.id) + "\",\"Waiting for Parts\")'>⏸ Hold (Waiting for Parts)</button>";
                    actionsHtml += "<button class='btn btn-sm btn-success fw-bold' onclick='techUpdateStatus(\"" + escapeHTML(o.id) + "\",\"Completed\")'>✔ Complete Job</button>";
                }
                if (isWaiting) {
                    actionsHtml += "<button class='btn btn-sm btn-info fw-bold' onclick='techUpdateStatus(\"" + escapeHTML(o.id) + "\",\"In Progress\")'>▶ Resume Job</button>";
                }
                actionsHtml += "<a href='workorders.html?id=" + encodeURIComponent(o.id) + "' class='btn btn-sm btn-outline-secondary'>Details</a>";
                actionsHtml += "</div>";

                var div = document.createElement("div");
                div.className = "tech-task-card";
                div.innerHTML =
                    "<div class='d-flex justify-content-between align-items-start flex-wrap gap-2'>" +
                    "  <div>" +
                    "    <span class='task-id font-mono'>" + escapeHTML(o.id) + " &bull; Assigned to " + escapeHTML(o.technician || "Unassigned") + "</span>" +
                    "    <div class='task-title'>" + escapeHTML(o.equipment) + "</div>" +
                    "    <div class='task-meta'>" + escapeHTML(o.problem || o.description || "") + "</div>" +
                    "  </div>" +
                    "  <div class='d-flex gap-2 align-items-center'>" +
                    "    <span class='badge-priority " + priBadge + "'>" + escapeHTML(o.priority) + "</span>" +
                    "    <span class='badge-status " + sc + "'>" + escapeHTML(o.status) + "</span>" +
                    "  </div>" +
                    "</div>" +
                    partsHtml +
                    (o.scheduledDate ? "<div class='task-meta mt-1 font-mono'>📅 Scheduled: " + escapeHTML(o.scheduledDate) + "</div>" : "") +
                    (isWaiting && o.waitingReason ? "<div class='task-meta mt-1 text-warning font-mono'>⏸ Hold: " + escapeHTML(o.waitingReason) + (o.expectedResumeDate ? " &bull; Resume Est: " + escapeHTML(o.expectedResumeDate) : "") + "</div>" : "") +
                    actionsHtml;
                container.appendChild(div);
            });
        }
    }

    // Render upcoming preventive maintenance for tech
    var maintTbody = document.getElementById("techUpcomingMaintBody");
    var maintEmpty = document.getElementById("techMaintEmptyState");
    if (maintTbody) {
        maintTbody.innerHTML = "";
        var openMaint = maintenance.filter(function (m) {
            return m.status !== "Completed" && m.status !== "Cancelled";
        });
        if (openMaint.length === 0) {
            if (maintEmpty) maintEmpty.classList.remove("d-none");
        } else {
            if (maintEmpty) maintEmpty.classList.add("d-none");
            var count = Math.min(openMaint.length, 5);
            for (var m = 0; m < count; m++) {
                var item = openMaint[m];
                var tr = document.createElement("tr");
                var sc = statusBadgeClass(item.status);
                tr.innerHTML =
                    "<td><strong>" + escapeHTML(item.equipment) + "</strong></td>" +
                    "<td><span class='badge bg-light text-dark border font-mono' style='font-size:0.72rem;'>" + escapeHTML(item.type) + "</span></td>" +
                    "<td class='font-mono'>" + escapeHTML(item.scheduledDate) + "</td>" +
                    "<td>" + escapeHTML(item.technician || "Unassigned") + "</td>" +
                    "<td><span class='badge-status " + sc + "'>" + escapeHTML(item.status) + "</span></td>";
                maintTbody.appendChild(tr);
            }
        }
    }
}

function techUpdateStatus(orderId, newStatus) {
    var workorders = JSON.parse(localStorage.getItem("forge_workorders")) ||
                     JSON.parse(localStorage.getItem("iemrs_workorders")) || [];
    var order = workorders.find(function (o) { return o.id === orderId; });
    if (!order) return;

    var prevStatus = order.status;
    order.status = newStatus;

    if (newStatus === "Waiting for Parts" && !order.waitingReason) {
        order.waitingReason = "Awaiting spare parts restock from central warehouse";
        order.expectedResumeDate = new Date(Date.now() + 4 * 86400000).toISOString().split("T")[0];
    }
    if (newStatus === "In Progress") {
        order.waitingReason = "";
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
    var equipment  = JSON.parse(localStorage.getItem("forge_equipment")) ||
                     JSON.parse(localStorage.getItem("iemrs_equipment")) || [];
    var workorders = JSON.parse(localStorage.getItem("forge_workorders")) ||
                     JSON.parse(localStorage.getItem("iemrs_workorders")) || [];
    var faults     = JSON.parse(localStorage.getItem("forge_faults")) || [];

    // KPIs
    var opCount   = equipment.filter(function (e) { return e.status === "Operational"; }).length;
    var downCount = equipment.filter(function (e) { return e.status === "Faulty" || e.status === "Maintenance"; }).length;
    var openWOs   = workorders.filter(function (o) { return o.status !== "Completed" && o.status !== "Cancelled"; }).length;
    var openFaultCount = faults.filter(function (f) { return f.status === "Open" || f.status === "Reviewing" || f.status === "Converted to WO"; }).length;

    setEl("opRunning",    opCount);
    setEl("opDown",       downCount);
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

                var isOp = eq.status === "Operational";
                var actionBtn = isOp
                    ? "<button type='button' class='btn btn-sm btn-outline-warning w-100 mt-2 font-mono' style='font-size:0.75rem;' onclick='openQuickFaultModal(\"" + escapeHTML(eq.name) + "\")'>⚠️ Report Issue</button>"
                    : "<a href='workorders.html' class='btn btn-sm btn-outline-primary w-100 mt-2 font-mono' style='font-size:0.75rem;'>📋 Track Fix Status</a>";

                var col = document.createElement("div");
                col.className = "col-md-4 col-sm-6";
                col.innerHTML =
                    "<div class='operator-machine-card'>" +
                    "  <div class='d-flex align-items-center justify-content-between mb-1'>" +
                    "    <div class='d-flex align-items-center'>" +
                    "      <span class='op-status-dot " + dotClass + "'></span>" +
                    "      <span class='machine-name'>" + escapeHTML(eq.name) + "</span>" +
                    "    </div>" +
                    "    <span class='badge-status " + (eq.status === "Operational" ? "badge-operational" : eq.status === "Maintenance" ? "badge-maintenance" : "badge-faulty") + "'>" + escapeHTML(eq.status) + "</span>" +
                    "  </div>" +
                    "  <div class='machine-loc'><span class='font-mono'>[" + escapeHTML(eq.id) + "]</span> " + escapeHTML(eq.location || "Floor") + " &bull; " + escapeHTML(eq.type || "Machinery") + "</div>" +
                    actionBtn +
                    "</div>";
                grid.appendChild(col);
            });
        }
    }

    // Incident / Fault Tracking Table
    var faultTbody = document.getElementById("operatorFaultBody");
    if (faultTbody) {
        faultTbody.innerHTML = "";

        // Combine faults and active work orders
        var displayRows = [];

        // Map work orders by faultId or equipment
        var woMap = {};
        workorders.forEach(function (w) {
            if (w.faultId) woMap[w.faultId] = w;
            if (!woMap[w.equipment]) woMap[w.equipment] = w;
        });

        if (faults.length > 0) {
            faults.forEach(function (f) {
                var linkedWO = (f.workOrderId && woMap[f.workOrderId]) ? woMap[f.workOrderId] : (woMap[f.id] || woMap[f.equipmentName]);
                displayRows.push({
                    id: f.id,
                    equipment: f.equipmentName || f.equipmentId || "—",
                    symptom: f.description || "Machine abnormality reported",
                    priority: f.priority || "High",
                    status: linkedWO ? linkedWO.status : f.status,
                    technician: linkedWO ? (linkedWO.technician || "Auto-Assigning...") : "Dispatched",
                    workOrderId: f.workOrderId || (linkedWO ? linkedWO.id : "")
                });
            });
        }

        // Also add open work orders that might not be in faults
        workorders.forEach(function (wo) {
            if (wo.status !== "Completed" && wo.status !== "Cancelled") {
                var already = displayRows.some(function (r) { return r.id === wo.id || r.workOrderId === wo.id; });
                if (!already) {
                    displayRows.push({
                        id: wo.id,
                        equipment: wo.equipment,
                        symptom: wo.problem || wo.description || "Active Work Order",
                        priority: wo.priority || "Medium",
                        status: wo.status,
                        technician: wo.technician || "Unassigned",
                        workOrderId: wo.id
                    });
                }
            }
        });

        if (displayRows.length === 0) {
            faultTbody.innerHTML = "<tr><td colspan='6' class='text-center text-muted py-4 font-mono' style='font-size:0.82rem;'>No active fault reports or floor incidents recorded. All machines operating normally.</td></tr>";
        } else {
            var count = Math.min(displayRows.length, 8);
            for (var i = 0; i < count; i++) {
                var row = displayRows[i];
                var tr = document.createElement("tr");
                var sc = statusBadgeClass(row.status);
                var priBadge = "badge-low";
                if (row.priority === "High" || row.priority === "Critical") priBadge = "badge-high";
                else if (row.priority === "Medium") priBadge = "badge-medium";

                tr.innerHTML =
                    "<td class='font-mono'><strong>" + escapeHTML(row.id) + "</strong></td>" +
                    "<td><a href='javascript:void(0)' data-action='view-dossier' data-equipment-id='" + escapeHTML(row.equipment) + "' class='badge-eq-dossier' title='Open 360° Technical Dossier' style='color:var(--text-primary); font-weight:700; text-decoration:underline; cursor:pointer;'><strong>" + escapeHTML(row.equipment) + "</strong></a></td>" +
                    "<td><span class='text-muted small'>" + escapeHTML(row.symptom) + "</span></td>" +
                    "<td><span class='badge-priority " + priBadge + "'>" + escapeHTML(row.priority) + "</span></td>" +
                    "<td><span class='badge-status " + sc + "'>" + escapeHTML(row.status) + "</span>" +
                        (row.workOrderId && row.workOrderId !== row.id ? "<br><small class='text-muted font-mono'>WO: " + escapeHTML(row.workOrderId) + "</small>" : "") + "</td>" +
                    "<td><span class='font-mono small'>" + escapeHTML(row.technician) + "</span></td>";
                faultTbody.appendChild(tr);
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
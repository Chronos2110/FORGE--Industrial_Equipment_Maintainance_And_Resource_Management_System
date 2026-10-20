// ==========================================================================
// FORGE - Analytics & Reporting JavaScript (js/analytics.js)
// Dynamically calculates statistics, equipment health & resource consumption
// ==========================================================================

document.addEventListener("DOMContentLoaded", function () {
    calculateSummaryCards();
    calculateEquipmentHealth();
    calculateMaintenanceEfficiency();
    renderResourceUsageTable();
    renderRecentActivities();
    applyRolePermissions();
});

// 1. Calculate Summary Cards
function calculateSummaryCards() {
    let equipment = JSON.parse(localStorage.getItem("forge_equipment") || localStorage.getItem("iemrs_equipment")) || [];
    let maintenance = JSON.parse(localStorage.getItem("forge_maintenance") || localStorage.getItem("iemrs_maintenance")) || [];
    let workorders = JSON.parse(localStorage.getItem("forge_workorders") || localStorage.getItem("iemrs_workorders")) || [];
    let inventory = JSON.parse(localStorage.getItem("forge_inventory") || localStorage.getItem("iemrs_inventory")) || [];

    // Total Equipment
    document.getElementById("analyticTotalEq").textContent = equipment.length;

    // Completed Maintenance
    let completedMaint = 0;
    for (let i = 0; i < maintenance.length; i++) {
        if (maintenance[i].status === "Completed") {
            completedMaint++;
        }
    }
    document.getElementById("analyticMaintDone").textContent = completedMaint;

    // Open Work Orders (not Completed or Cancelled)
    let openOrders = 0;
    for (let j = 0; j < workorders.length; j++) {
        let st = workorders[j].status;
        if (st !== "Completed" && st !== "Cancelled") {
            openOrders++;
        }
    }
    document.getElementById("analyticOpenOrders").textContent = openOrders;

    // Low Stock Items
    let lowStock = 0;
    for (let k = 0; k < inventory.length; k++) {
        if (inventory[k].quantity <= inventory[k].minStock) {
            lowStock++;
        }
    }
    document.getElementById("analyticLowStock").textContent = lowStock;
}

// 2. Calculate Equipment Health Progress Bars
function calculateEquipmentHealth() {
    let equipment = JSON.parse(localStorage.getItem("forge_equipment") || localStorage.getItem("iemrs_equipment")) || [];
    let total = equipment.length;

    let operational = 0;
    let inMaint = 0;
    let faulty = 0;

    for (let i = 0; i < equipment.length; i++) {
        let st = equipment[i].status;
        if (st === "Operational") operational++;
        else if (st === "Maintenance") inMaint++;
        else if (st === "Faulty") faulty++;
    }

    let opPct = total > 0 ? Math.round((operational / total) * 100) : 0;
    let maintPct = total > 0 ? Math.round((inMaint / total) * 100) : 0;
    let faultyPct = total > 0 ? Math.round((faulty / total) * 100) : 0;

    // Update Counts & Labels
    document.getElementById("countOperational").textContent = operational;
    document.getElementById("countMaintenance").textContent = inMaint;
    document.getElementById("countFaulty").textContent = faulty;

    document.getElementById("labelOperational").textContent = opPct + "%";
    document.getElementById("labelMaintenance").textContent = maintPct + "%";
    document.getElementById("labelFaulty").textContent = faultyPct + "%";

    document.getElementById("operationalPercent").textContent = opPct + "%";

    // Update Progress Bars
    document.getElementById("barOperational").style.width = opPct + "%";
    document.getElementById("barMaintenance").style.width = maintPct + "%";
    document.getElementById("barFaulty").style.width = faultyPct + "%";
}

// 3. Calculate Maintenance Execution Breakdown
function calculateMaintenanceEfficiency() {
    let maintenance = JSON.parse(localStorage.getItem("forge_maintenance") || localStorage.getItem("iemrs_maintenance")) || [];
    let total = maintenance.length;

    let completed = 0;
    let inProgress = 0;
    let scheduled = 0;

    for (let i = 0; i < maintenance.length; i++) {
        let st = maintenance[i].status;
        if (st === "Completed") completed++;
        else if (st === "In Progress" || st === "Waiting for Parts") inProgress++;
        else if (st === "Scheduled" || st === "Assigned") scheduled++;
    }

    let compPct = total > 0 ? Math.round((completed / total) * 100) : 0;
    let inProgPct = total > 0 ? Math.round((inProgress / total) * 100) : 0;
    let schedPct = total > 0 ? Math.round((scheduled / total) * 100) : 0;

    document.getElementById("countCompletedMaint").textContent = completed;
    document.getElementById("countInProgressMaint").textContent = inProgress;
    document.getElementById("countScheduledMaint").textContent = scheduled;

    document.getElementById("labelCompletedMaint").textContent = compPct + "%";
    document.getElementById("labelInProgressMaint").textContent = inProgPct + "%";
    document.getElementById("labelScheduledMaint").textContent = schedPct + "%";

    document.getElementById("maintEfficiency").textContent = compPct + "%";

    document.getElementById("barCompletedMaint").style.width = compPct + "%";
    document.getElementById("barInProgressMaint").style.width = inProgPct + "%";
    document.getElementById("barScheduledMaint").style.width = schedPct + "%";
}

// 4. Render Resource Usage Table
function renderResourceUsageTable() {
    let inventory = JSON.parse(localStorage.getItem("forge_inventory") || localStorage.getItem("iemrs_inventory")) || [];
    let tbody = document.getElementById("resourceUsageBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (inventory.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' class='text-center text-muted py-3'>No inventory records available.</td></tr>";
        return;
    }

    for (let i = 0; i < inventory.length; i++) {
        let item = inventory[i];
        let tr = document.createElement("tr");

        let isLow = item.quantity <= item.minStock;
        let isHigh = item.quantity > item.minStock * 2;

        let statusBadge = "";
        if (isLow) {
            statusBadge = "<span class='badge-status badge-low-stock font-mono'>LOW STOCK ALERT</span>";
        } else if (isHigh) {
            statusBadge = "<span class='badge-status badge-available font-mono'>OPTIMAL RESERVE</span>";
        } else {
            statusBadge = "<span class='badge-status badge-scheduled font-mono'>NORMAL USAGE</span>";
        }

        tr.innerHTML =
            "<td><strong>" + escapeHTML(item.name) + "</strong>" + (item.id ? " <small class='text-muted font-mono'>(" + escapeHTML(item.id) + ")</small>" : "") + "</td>" +
            "<td><span class='badge bg-secondary font-mono'>" + escapeHTML(item.category) + "</span></td>" +
            "<td class='font-mono'><strong>" + escapeHTML(item.quantity) + "</strong> units</td>" +
            "<td class='font-mono text-muted'>" + escapeHTML(item.minStock) + " units</td>" +
            "<td>" + statusBadge + "</td>";

        tbody.appendChild(tr);
    }
}

// 5. Render Recent Activities
function renderRecentActivities() {
    let activities = JSON.parse(localStorage.getItem("forge_activity") || localStorage.getItem("iemrs_activities")) || [];
    let tbody = document.getElementById("analyticsActivityBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (activities.length === 0) {
        tbody.innerHTML = "<tr><td colspan='3' class='text-center text-muted py-3'>No recent activity events recorded.</td></tr>";
        return;
    }

    // Limit to latest 15 activities
    let displayList = activities.slice(0, 15);

    for (let i = 0; i < displayList.length; i++) {
        let act = displayList[i];
        let tr = document.createElement("tr");

        let timeStr = act.timestamp || act.time || "Recent";
        let targetStr = act.target || act.item || act.actor || "System";
        let descStr = act.action || act.activity || "";
        let badgeClass = act.badgeClass || "badge-scheduled";

        tr.innerHTML =
            "<td class='font-mono text-nowrap'><small class='text-muted'>" + escapeHTML(timeStr) + "</small></td>" +
            "<td><strong class='font-mono'>" + escapeHTML(targetStr) + "</strong></td>" +
            "<td>" + (act.badgeClass ? "<span class='badge-status " + badgeClass + " me-1'>LOG</span> " : "") + escapeHTML(descStr) + "</td>";

        tbody.appendChild(tr);
    }
}

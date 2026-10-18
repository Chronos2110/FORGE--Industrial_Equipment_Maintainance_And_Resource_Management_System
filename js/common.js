// ==========================================================================
// FORGE V4 - Common Shared Frontend JavaScript (js/common.js)
// Handles: V4 Storage Schema (forge_*), Legacy Migration (iemrs_* → forge_*),
//          Role-Driven Route Guards, Theme System (default: light),
//          Auto-Assign, Equipment Sync, Activity Logging, XSS Protection
// ==========================================================================

// Apply theme immediately before anything renders (default: light)
(function () {
    var theme = localStorage.getItem("forge_theme") || "light";
    document.documentElement.setAttribute("data-theme", theme);
})();

document.addEventListener("DOMContentLoaded", function () {
    migrateLegacyKeys();
    initDefaultData();
    migrateLegacyData();
    initCommon();
    enforceRouteGuard();
    applyRolePermissions();
    initSidebarShell();
    initTopbarShell();
    initControlDock();
    initCommandPalette();
});

// ==========================================================================
// STEP 0: Migrate old iemrs_* keys to forge_* keys (one-time, non-destructive)
// ==========================================================================
function migrateLegacyKeys() {
    var keyMap = {
        "iemrs_equipment":  "forge_equipment",
        "iemrs_workforce":  "forge_technicians",
        "iemrs_workorders": "forge_workorders",
        "iemrs_maintenance":"forge_maintenance",
        "iemrs_inventory":  "forge_inventory",
        "iemrs_activities": "forge_activity"
    };

    for (var oldKey in keyMap) {
        var newKey = keyMap[oldKey];
        var oldData = localStorage.getItem(oldKey);
        var newData = localStorage.getItem(newKey);
        // Only migrate if old key exists and new key is NOT already set
        if (oldData && !newData) {
            localStorage.setItem(newKey, oldData);
            // Keep old key in place so old JS still works during transition
        }
    }

    // Also migrate role key
    var oldRole = sessionStorage.getItem("iemrs_role");
    if (oldRole && !sessionStorage.getItem("forge_role")) {
        sessionStorage.setItem("forge_role", oldRole);
    }
}

// ==========================================================================
// initCommon: Nav, Role Badge, Theme Toggle, Logout, Sidebar Active Link
// ==========================================================================
function initCommon() {
    var role = getActiveRole();

    // 1. Display current role in topbar badge
    document.querySelectorAll(".topbar-role, #currentRole").forEach(function (el) {
        el.textContent = role;
    });

    var topbarRight = document.querySelector(".topbar-right");

    // 2. Inject theme toggle
    if (topbarRight && !document.getElementById("forgeThemeToggle")) {
        var currentTheme = localStorage.getItem("forge_theme") || "light";
        var toggleWrapper = document.createElement("div");
        toggleWrapper.className = "theme-toggle";
        toggleWrapper.id = "forgeThemeToggle";
        toggleWrapper.setAttribute("role", "group");
        toggleWrapper.setAttribute("aria-label", "Theme selector");
        toggleWrapper.innerHTML =
            '<button class="theme-toggle-btn ' + (currentTheme === "light" ? "active" : "") + '" id="themeBtnLight" title="Light Mode" aria-pressed="' + (currentTheme === "light") + '">&#9728; Light</button>' +
            '<span class="theme-toggle-divider" aria-hidden="true"></span>' +
            '<button class="theme-toggle-btn ' + (currentTheme === "dark" ? "active" : "") + '" id="themeBtnDark" title="Dark Mode" aria-pressed="' + (currentTheme === "dark") + '">&#9790; Dark</button>';
        topbarRight.insertBefore(toggleWrapper, topbarRight.firstChild);

        document.getElementById("themeBtnLight").addEventListener("click", function () { applyTheme("light"); });
        document.getElementById("themeBtnDark").addEventListener("click",  function () { applyTheme("dark");  });
    }

    // 3. Quick role switcher
    if (topbarRight && !document.getElementById("roleSwitcherSelect")) {
        var switcherDiv = document.createElement("div");
        switcherDiv.className = "d-flex align-items-center gap-2";
        switcherDiv.innerHTML =
            '<small class="text-muted d-none d-md-inline" style="font-size:0.75rem;">Role:</small>' +
            '<select id="roleSwitcherSelect" class="form-select form-select-sm" style="font-size:0.78rem;padding:2px 24px 2px 8px;width:auto;font-weight:600;">' +
            '<option value="Administrator"' + (role === "Administrator" ? " selected" : "") + '>Admin</option>' +
            '<option value="Technician"'    + (role === "Technician"    ? " selected" : "") + '>Technician</option>' +
            '<option value="Operator"'      + (role === "Operator"      ? " selected" : "") + '>Operator</option>' +
            '</select>';
        topbarRight.appendChild(switcherDiv);

        document.getElementById("roleSwitcherSelect").addEventListener("change", function (e) {
            var newRole = e.target.value;
            sessionStorage.setItem("forge_role", newRole);
            sessionStorage.setItem("iemrs_role", newRole); // keep legacy in sync
            showAlert("Switched to " + newRole + " view.", "info");
            setTimeout(function () { window.location.reload(); }, 300);
        });
    }

    // 4. Active sidebar link
    var currentPath = window.location.pathname.toLowerCase();
    document.querySelectorAll(".sidebar a:not(.logout)").forEach(function (link) {
        var href = (link.getAttribute("href") || "").toLowerCase().replace("../", "");
        if (href && currentPath.includes(href)) {
            link.classList.add("active");
        } else {
            link.classList.remove("active");
        }
    });

    // 5. Build role-filtered sidebar nav
    buildRoleNav(role);

    // 6. Logout
    document.querySelectorAll(".sidebar .logout, #logoutBtn").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
            e.preventDefault();
            sessionStorage.removeItem("forge_role");
            sessionStorage.removeItem("iemrs_role");
            window.location.href = "../login.html";
        });
    });
}

// ==========================================================================
// Build sidebar nav based on role (hide restricted links)
// ==========================================================================
var ROLE_NAV_ACCESS = {
    "Administrator": ["dashboard","equipment","maintenance","workorders","workforce","inventory","analytics","faults"],
    "Technician":    ["dashboard","equipment","maintenance","workorders","inventory","faults"],
    "Operator":      ["dashboard","equipment","maintenance","workorders","inventory","faults"]
};

function buildRoleNav(role) {
    var allowed = ROLE_NAV_ACCESS[role] || ROLE_NAV_ACCESS["Operator"];
    document.querySelectorAll(".sidebar a:not(.logout)").forEach(function (link) {
        var href = (link.getAttribute("href") || "").toLowerCase();
        var isAllowed = false;
        for (var i = 0; i < allowed.length; i++) {
            if (href.indexOf(allowed[i]) !== -1) { isAllowed = true; break; }
        }
        if (!isAllowed) {
            link.style.display = "none";
        } else {
            link.style.display = "";
        }
    });

    // Also hide nav section labels that have no visible children
    document.querySelectorAll(".nav-section-label").forEach(function (label) {
        var next = label.nextElementSibling;
        var hasVisible = false;
        while (next && !next.classList.contains("nav-section-label")) {
            if (next.tagName === "A" && next.style.display !== "none") {
                hasVisible = true;
                break;
            }
            next = next.nextElementSibling;
        }
        label.style.display = hasVisible ? "" : "none";
    });
}

// ==========================================================================
// Route Guard: redirect unauthorized roles away from restricted pages
// ==========================================================================
var PAGE_ROLE_RULES = {
    "analytics.html":  ["Administrator"],
    "workforce.html":  ["Administrator"],
    "inventory.html":  ["Administrator", "Technician", "Operator"],
    "workorders.html": ["Administrator", "Technician", "Operator"],
    "maintenance.html":["Administrator", "Technician", "Operator"]
};

function enforceRouteGuard() {
    var role = getActiveRole();
    var path = window.location.pathname.toLowerCase();

    for (var page in PAGE_ROLE_RULES) {
        if (path.indexOf(page) !== -1) {
            var allowed = PAGE_ROLE_RULES[page];
            var isAllowed = false;
            for (var i = 0; i < allowed.length; i++) {
                if (role === allowed[i]) { isAllowed = true; break; }
            }
            if (!isAllowed) {
                showAlert("Access Restricted to " + allowed.join("/") + ". Redirecting…", "danger");
                setTimeout(function () {
                    window.location.href = "dashboard.html";
                }, 1200);
                return;
            }
        }
    }
}

// ==========================================================================
// Theme Management (default: light)
// ==========================================================================
function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("forge_theme", theme);

    var btnLight = document.getElementById("themeBtnLight");
    var btnDark  = document.getElementById("themeBtnDark");
    if (btnLight && btnDark) {
        btnLight.classList.toggle("active", theme === "light");
        btnLight.setAttribute("aria-pressed", String(theme === "light"));
        btnDark.classList.toggle("active",  theme === "dark");
        btnDark.setAttribute("aria-pressed",  String(theme === "dark"));
    }

    // Sync login page toggles if present
    var lBtnL = document.getElementById("loginThemeBtnLight");
    var lBtnD = document.getElementById("loginThemeBtnDark");
    if (lBtnL && lBtnD) {
        lBtnL.classList.toggle("active", theme === "light");
        lBtnD.classList.toggle("active", theme === "dark");
        lBtnL.setAttribute("aria-pressed", String(theme === "light"));
        lBtnD.setAttribute("aria-pressed", String(theme === "dark"));
    }

    // Sync dock theme icon
    var dockThemeIcon = document.getElementById("dockThemeIcon");
    if (dockThemeIcon) {
        dockThemeIcon.textContent = theme === "dark" ? "☀" : "🌙";
    }
}

// ==========================================================================
// Role helper — reads forge_role, falls back to iemrs_role, then Admin
// ==========================================================================
function getActiveRole() {
    return sessionStorage.getItem("forge_role") ||
           sessionStorage.getItem("iemrs_role") ||
           "Administrator";
}

// ==========================================================================
// Role-Aware UI Permission Enforcement
// ==========================================================================
function applyRolePermissions() {
    var role = getActiveRole();

    if (role === "Administrator") {
        document.querySelectorAll(".btn-action-delete").forEach(function (el) { el.classList.remove("d-none"); });
        document.querySelectorAll(".admin-only").forEach(function (el) { el.classList.remove("d-none"); });
        document.querySelectorAll(".technician-only").forEach(function (el) { el.classList.add("d-none"); });
        document.querySelectorAll(".operator-only").forEach(function (el) { el.classList.add("d-none"); });

    } else if (role === "Technician") {
        // Technicians: read-only equipment/maintenance, can update WO status
        document.querySelectorAll(".btn-action-delete").forEach(function (el) { el.classList.add("d-none"); });
        var addEq   = document.getElementById("addNewEquipmentBtn");
        var addTech = document.getElementById("addNewTechBtn");
        var addPart = document.getElementById("addNewPartBtn");
        if (addEq)   addEq.classList.add("d-none");
        if (addTech) addTech.classList.add("d-none");
        if (addPart) addPart.classList.add("d-none");
        // Hide edit buttons on equipment page (read-only)
        if (window.location.pathname.toLowerCase().indexOf("equipment") !== -1) {
            document.querySelectorAll(".btn-action-edit").forEach(function (el) { el.classList.add("d-none"); });
        }
        document.querySelectorAll(".admin-only").forEach(function (el) { el.classList.add("d-none"); });
        document.querySelectorAll(".technician-only").forEach(function (el) { el.classList.remove("d-none"); });
        document.querySelectorAll(".operator-only").forEach(function (el) { el.classList.add("d-none"); });

    } else if (role === "Operator") {
        document.querySelectorAll(".btn-action-delete, .btn-action-edit, .btn-action-reschedule, .btn-action-resume, .btn-action-restock").forEach(function (el) {
            el.classList.add("d-none");
        });
        var ids = ["addNewEquipmentBtn", "addNewTechBtn", "addNewMaintBtn", "addNewPartBtn", "addNewOrderBtn", "btnAutoAssignWO", "btnAutoAssignMaint"];
        ids.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.classList.add("d-none");
        });
        document.querySelectorAll(".admin-only").forEach(function (el) { el.classList.add("d-none"); });
        document.querySelectorAll(".technician-only").forEach(function (el) { el.classList.add("d-none"); });
        document.querySelectorAll(".operator-only").forEach(function (el) { el.classList.remove("d-none"); });

        // Add Operator Read-Only Indicator badge if on an operational page
        var currentPath = window.location.pathname.toLowerCase();
        var isRestrictedModule = currentPath.indexOf("workorders") !== -1 ||
                                 currentPath.indexOf("maintenance") !== -1 ||
                                 currentPath.indexOf("inventory") !== -1 ||
                                 currentPath.indexOf("equipment") !== -1;
        if (isRestrictedModule && !document.getElementById("operatorReadonlyBadge")) {
            var targetContainer = document.querySelector(".action-bar") || document.querySelector(".topbar-left");
            if (targetContainer) {
                var roBadge = document.createElement("div");
                roBadge.id = "operatorReadonlyBadge";
                roBadge.className = "operator-readonly-pill";
                roBadge.innerHTML = '<span class="badge bg-secondary font-mono">OPERATOR READ-ONLY</span> <span class="text-muted small ms-1">(Modifications locked)</span>';
                targetContainer.appendChild(roBadge);
            }
        }
    }
}

// ==========================================================================
// XSS Protection
// ==========================================================================
function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ==========================================================================
// Activity Logger (forge_activity)
// ==========================================================================
function logActivity(target, action, badgeClass) {
    var activities = JSON.parse(localStorage.getItem("forge_activity")) || [];
    var actor = getActiveRole();

    activities.unshift({
        id: "ACT-" + Date.now(),
        timestamp: new Date().toLocaleString(),
        actor: actor,
        action: action,
        target: target || "System",
        badgeClass: badgeClass || "badge-scheduled"
    });

    if (activities.length > 30) { activities = activities.slice(0, 30); }
    localStorage.setItem("forge_activity", JSON.stringify(activities));

    // Also write to legacy key so old dashboard.js still reads it
    var legacyActivities = JSON.parse(localStorage.getItem("iemrs_activities")) || [];
    legacyActivities.unshift({
        time: "Just now",
        item: target || "System",
        activity: action,
        user: actor,
        badge: badgeClass || "badge-scheduled"
    });
    if (legacyActivities.length > 20) { legacyActivities = legacyActivities.slice(0, 20); }
    localStorage.setItem("iemrs_activities", JSON.stringify(legacyActivities));
}

// ==========================================================================
// Active Workload Calculation (reads forge_workorders)
// Counts Assigned + In Progress only (not Waiting for Parts = paused)
// Supports matching by technicianId or technician name
// ==========================================================================
function calculateActiveWorkload(technicianIdOrName) {
    if (!technicianIdOrName) return 0;
    var workorders = JSON.parse(localStorage.getItem("forge_workorders")) ||
                     JSON.parse(localStorage.getItem("iemrs_workorders")) || [];
    var count = 0;
    var needle = String(technicianIdOrName).toLowerCase().trim();
    for (var i = 0; i < workorders.length; i++) {
        var o = workorders[i];
        var tId = (o.technicianId || "").toLowerCase().trim();
        var tName = (o.technician || "").toLowerCase().trim();
        var st = o.status || "";
        if ((tId === needle || tName === needle) && (st === "Assigned" || st === "In Progress")) {
            count++;
        }
    }
    return count;
}

// ==========================================================================
// Auto-Assign Algorithm (deterministic, viva-explainable)
// 1. Filter availability !== Unavailable/On Leave
// 2. Match technician specialization to equipment category keywords
// 3. Pick lowest active workload; fallback to any if no skill match
// ==========================================================================
var SKILL_KEYWORD_MAP = {
    "CNC Machine": ["cnc", "milling", "mechanics", "lathe"],
    "Hydraulic Press": ["hydraulic", "fluid", "press", "valves", "seals"],
    "Compressor": ["pneumatics", "compressor", "air", "vibration"],
    "Lathe": ["cnc", "lathe", "mechanics", "milling"],
    "Pump": ["pumps", "piping", "fluid", "valves"],
    "Conveyor": ["conveyor", "belts", "mechanics", "motors"],
    "Generator": ["electrical", "plc", "automation", "power"],
    "Drill": ["mechanics", "cnc"],
    "Electrical": ["electrical", "plc", "automation", "power"],
    "Mechanical": ["mechanics", "cnc", "lathe", "milling"]
};

function autoAssignTechnician(machineryTypeOrName) {
    var workforce = JSON.parse(localStorage.getItem("forge_technicians")) ||
                    JSON.parse(localStorage.getItem("iemrs_workforce")) || [];

    // 1. Filter available technicians
    var available = [];
    for (var i = 0; i < workforce.length; i++) {
        var t = workforce[i];
        var avail = t.availability || "";
        var workload = (t.activeWorkload || t.workload || "").toString().toLowerCase();
        if (avail !== "Unavailable" && !workload.includes("leave") && avail !== "On Leave") {
            available.push(t);
        }
    }

    if (available.length === 0) {
        return { technician: null, name: "", isFallback: false, message: "No available technicians on roster." };
    }

    // 2. Build keyword list for this machine
    var searchTarget = (machineryTypeOrName || "").toLowerCase();
    var keywords = [];
    for (var key in SKILL_KEYWORD_MAP) {
        if (searchTarget.includes(key.toLowerCase()) || key.toLowerCase().includes(searchTarget)) {
            keywords = keywords.concat(SKILL_KEYWORD_MAP[key]);
        }
    }
    if (keywords.length === 0) {
        keywords = searchTarget.split(" ").filter(function (w) { return w.length > 3; });
    }

    // 3. Match by skill
    var skilled = [];
    for (var j = 0; j < available.length; j++) {
        var tech = available[j];
        var techSkill = ((tech.specialization || tech.skill || "") + " " + (tech.certifications || tech.certification || "")).toLowerCase();
        var matched = keywords.some(function (kw) { return techSkill.includes(kw.toLowerCase()); });
        if (matched) { skilled.push(tech); }
    }

    var pool = skilled.length > 0 ? skilled : available;
    var isFallback = skilled.length === 0;

    // 4. Pick lowest workload
    var best = pool[0];
    var lowestWL = calculateActiveWorkload(best.name);

    for (var k = 1; k < pool.length; k++) {
        var cur = pool[k];
        var curWL = calculateActiveWorkload(cur.name);
        if (curWL < lowestWL || (curWL === lowestWL && cur.availability === "Available" && best.availability !== "Available")) {
            best = cur;
            lowestWL = curWL;
        }
    }

    var msg = isFallback
        ? "General assignment: " + best.name + " (Lowest workload: " + lowestWL + " active orders)"
        : "Skill matched: " + best.name + " [" + (best.specialization || best.skill) + "] — " + lowestWL + " active orders";

    return { technician: best, name: best.name, isFallback: isFallback, workload: lowestWL, message: msg };
}

// ==========================================================================
// Equipment Status Synchronization
// In Progress / Waiting for Parts → Maintenance
// Completed → Operational (lastMaintenanceDate updated)
// ==========================================================================
function syncEquipmentStatusOnWorkOrder(equipmentName, newStatus, completedDate) {
    if (!equipmentName) return;

    var equipmentList = JSON.parse(localStorage.getItem("forge_equipment")) ||
                        JSON.parse(localStorage.getItem("iemrs_equipment")) || [];
    var updated = false;

    for (var i = 0; i < equipmentList.length; i++) {
        var eq = equipmentList[i];
        var eqName = (eq.name || "").toLowerCase();
        var eqId   = (eq.id   || "").toLowerCase();
        var target = equipmentName.toLowerCase();

        if (eqName === target || eqId === target) {
            if (newStatus === "In Progress" || newStatus === "Waiting for Parts" || newStatus === "Assigned") {
                if (eq.status !== "Maintenance") {
                    eq.status = "Maintenance";
                    updated = true;
                }
            } else if (newStatus === "Completed") {
                eq.status = "Operational";
                var today = completedDate || new Date().toISOString().split("T")[0];
                eq.lastMaintenance = today;
                eq.lastMaintenanceDate = today;
                updated = true;
            }
        }
    }

    if (updated) {
        localStorage.setItem("forge_equipment",  JSON.stringify(equipmentList));
        localStorage.setItem("iemrs_equipment",  JSON.stringify(equipmentList));
    }
}

// ==========================================================================
// Central Spare Parts Deduction Helper
// ==========================================================================
function consumeSpareParts(partName, quantity, orderId) {
    return consumeSparePartsOnComplete(partName, quantity, orderId);
}

function consumeSparePartsOnComplete(partName, qty, orderId) {
    if (!partName || !qty || qty <= 0) return false;
    var inventory = JSON.parse(localStorage.getItem("forge_inventory")) ||
                    JSON.parse(localStorage.getItem("iemrs_inventory")) || [];
    var idx = -1;
    for (var i = 0; i < inventory.length; i++) {
        var pName = inventory[i].name || inventory[i].partName || "";
        if (pName.toLowerCase() === partName.toLowerCase()) { idx = i; break; }
    }
    if (idx === -1) return false;

    var p = inventory[idx];
    var cur = parseInt(p.quantity, 10) || 0;
    var deduct = Math.min(cur, parseInt(qty, 10));
    p.quantity = Math.max(0, cur - deduct);

    localStorage.setItem("forge_inventory", JSON.stringify(inventory));
    localStorage.setItem("iemrs_inventory", JSON.stringify(inventory));
    logActivity(partName, "Consumed " + deduct + " units for Work Order " + (orderId || "WO-DISPATCH"), "badge-maintenance");
    return true;
}

// ==========================================================================
// Show alert toast
// ==========================================================================
function showAlert(message, type) {
    if (!type) type = "success";
    var container = document.getElementById("alertContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "alertContainer";
        document.body.appendChild(container);
    }

    var alertDiv = document.createElement("div");
    alertDiv.className = "custom-alert custom-alert-" + type;
    alertDiv.innerHTML = "<span>" + message + "</span><button type='button' class='btn-close btn-close-sm' aria-label='Close'></button>";
    alertDiv.querySelector(".btn-close").addEventListener("click", function () { alertDiv.remove(); });
    container.appendChild(alertDiv);

    setTimeout(function () { if (alertDiv.parentNode) alertDiv.remove(); }, 4000);
}

// ==========================================================================
// Legacy V2/V3 Data Migration Guard (field-level normalization)
// ==========================================================================
function migrateLegacyData() {
    var equipment = JSON.parse(localStorage.getItem("forge_equipment") || localStorage.getItem("iemrs_equipment")) || [];
    var technicians = JSON.parse(localStorage.getItem("forge_technicians") || localStorage.getItem("iemrs_workforce")) || [];
    var inventory = JSON.parse(localStorage.getItem("forge_inventory") || localStorage.getItem("iemrs_inventory")) || [];

    function findEqId(nameOrId) {
        if (!nameOrId) return "";
        for (var i = 0; i < equipment.length; i++) {
            if (equipment[i].id === nameOrId || equipment[i].name === nameOrId) return equipment[i].id;
        }
        return nameOrId;
    }
    function findTechId(nameOrId) {
        if (!nameOrId) return "";
        for (var i = 0; i < technicians.length; i++) {
            if (technicians[i].id === nameOrId || technicians[i].name === nameOrId) return technicians[i].id;
        }
        return nameOrId;
    }
    function findPartId(nameOrId) {
        if (!nameOrId) return "";
        for (var i = 0; i < inventory.length; i++) {
            if (inventory[i].id === nameOrId || inventory[i].partName === nameOrId || inventory[i].name === nameOrId) return inventory[i].id;
        }
        return nameOrId;
    }

    // 1. Work Orders normalization
    var woKey = localStorage.getItem("forge_workorders") ? "forge_workorders" : "iemrs_workorders";
    var workorders = JSON.parse(localStorage.getItem(woKey)) || [];
    var woChanged = false;

    for (var i = 0; i < workorders.length; i++) {
        var wo = workorders[i];
        if (wo.status === "Open") { wo.status = "Scheduled"; woChanged = true; }
        if (!wo.equipmentId && wo.equipment) { wo.equipmentId = findEqId(wo.equipment); woChanged = true; }
        if (!wo.technicianId && wo.technician) { wo.technicianId = findTechId(wo.technician); woChanged = true; }
        if (!wo.requiredPartId && wo.requiredPart) { wo.requiredPartId = findPartId(wo.requiredPart); woChanged = true; }
        if (wo.problem !== undefined && wo.description === undefined) { wo.description = wo.problem; woChanged = true; }
        if (wo.description === undefined) { wo.description = wo.problem || ""; woChanged = true; }
        if (wo.faultId === undefined) { wo.faultId = ""; woChanged = true; }
        if (wo.requiredPart === undefined) { wo.requiredPart = ""; woChanged = true; }
        if (wo.requiredPartId === undefined) { wo.requiredPartId = ""; woChanged = true; }
        if (wo.requiredQuantity === undefined) { wo.requiredQuantity = 0; woChanged = true; }
        if (wo.waitingReason === undefined) { wo.waitingReason = ""; woChanged = true; }
        if (wo.expectedResumeDate === undefined) { wo.expectedResumeDate = ""; woChanged = true; }
        if (wo.waitingNotes === undefined) { wo.waitingNotes = ""; woChanged = true; }
        if (wo.notes === undefined) { wo.notes = wo.waitingNotes || ""; woChanged = true; }
        if (wo.originalDate === undefined) { wo.originalDate = ""; woChanged = true; }
        if (wo.rescheduledDate === undefined) { wo.rescheduledDate = ""; woChanged = true; }
        if (wo.rescheduleReason === undefined) { wo.rescheduleReason = ""; woChanged = true; }
    }
    if (woChanged) {
        localStorage.setItem("forge_workorders", JSON.stringify(workorders));
        localStorage.setItem("iemrs_workorders", JSON.stringify(workorders));
    }

    // 2. Maintenance normalization
    var mnKey = localStorage.getItem("forge_maintenance") ? "forge_maintenance" : "iemrs_maintenance";
    var maintenance = JSON.parse(localStorage.getItem(mnKey)) || [];
    var mnChanged = false;

    for (var j = 0; j < maintenance.length; j++) {
        var mn = maintenance[j];
        if (!mn.equipmentId && mn.equipment) { mn.equipmentId = findEqId(mn.equipment); mnChanged = true; }
        if (!mn.technicianId && mn.technician) { mn.technicianId = findTechId(mn.technician); mnChanged = true; }
        if (mn.originalDate === undefined) { mn.originalDate = ""; mnChanged = true; }
        if (mn.rescheduledDate === undefined) { mn.rescheduledDate = ""; mnChanged = true; }
        if (mn.rescheduleReason === undefined) { mn.rescheduleReason = ""; mnChanged = true; }
        if (mn.workOrderId === undefined) { mn.workOrderId = ""; mnChanged = true; }
        if (mn.notes === undefined) { mn.notes = ""; mnChanged = true; }
    }
    if (mnChanged) {
        localStorage.setItem("forge_maintenance", JSON.stringify(maintenance));
        localStorage.setItem("iemrs_maintenance", JSON.stringify(maintenance));
    }

    // 3. Equipment normalization
    var eqKey = localStorage.getItem("forge_equipment") ? "forge_equipment" : "iemrs_equipment";
    var eqList = JSON.parse(localStorage.getItem(eqKey)) || [];
    var eqChanged = false;

    for (var k = 0; k < eqList.length; k++) {
        var eq = eqList[k];
        if (eq.lastMaintenance !== undefined && !eq.lastMaintenanceDate) {
            eq.lastMaintenanceDate = eq.lastMaintenance;
            eqChanged = true;
        }
        if (!eq.lastMaintenanceDate) { eq.lastMaintenanceDate = eq.lastMaintenance || ""; eqChanged = true; }
    }
    if (eqChanged) {
        localStorage.setItem("forge_equipment", JSON.stringify(eqList));
        localStorage.setItem("iemrs_equipment", JSON.stringify(eqList));
    }

    // 4. Technicians normalization (skill→specialization, certification→certifications, workload→activeWorkload)
    var techKey = localStorage.getItem("forge_technicians") ? "forge_technicians" : "iemrs_workforce";
    var techList = JSON.parse(localStorage.getItem(techKey)) || [];
    var techChanged = false;

    for (var m = 0; m < techList.length; m++) {
        var t = techList[m];
        if (t.skill !== undefined && !t.specialization) { t.specialization = t.skill; techChanged = true; }
        if (t.certification !== undefined && !t.certifications) { t.certifications = t.certification; techChanged = true; }
        if (!t.specialization) { t.specialization = t.skill || ""; techChanged = true; }
        if (!t.certifications) { t.certifications = t.certification || ""; techChanged = true; }
        if (t.activeWorkload === undefined) {
            t.activeWorkload = calculateActiveWorkload(t.id || t.name);
            techChanged = true;
        }
    }
    if (techChanged) {
        localStorage.setItem("forge_technicians", JSON.stringify(techList));
        localStorage.setItem("iemrs_workforce",   JSON.stringify(techList));
    }

    // 5. Inventory normalization (minStock→minimumStock)
    var invKey = localStorage.getItem("forge_inventory") ? "forge_inventory" : "iemrs_inventory";
    var invList = JSON.parse(localStorage.getItem(invKey)) || [];
    var invChanged = false;

    for (var n = 0; n < invList.length; n++) {
        var p = invList[n];
        if (p.name !== undefined && !p.partName) { p.partName = p.name; invChanged = true; }
        if (p.partName !== undefined && !p.name) { p.name = p.partName; invChanged = true; }
        if (p.minStock !== undefined && p.minimumStock === undefined) { p.minimumStock = p.minStock; invChanged = true; }
        if (p.minimumStock === undefined) { p.minimumStock = 0; invChanged = true; }
        if (p.minStock === undefined) { p.minStock = p.minimumStock; invChanged = true; }
    }
    if (invChanged) {
        localStorage.setItem("forge_inventory", JSON.stringify(invList));
        localStorage.setItem("iemrs_inventory", JSON.stringify(invList));
    }
}

// ==========================================================================
// Seed realistic initial data (forge_* keys) if not already present
// 3NF Relational Schema with Foreign Keys
// ==========================================================================
function initDefaultData() {

    // 1. forge_equipment: { id, name, type, location, status, lastMaintenanceDate }
    if (!localStorage.getItem("forge_equipment") && !localStorage.getItem("iemrs_equipment")) {
        var eq = [
            { id: "EQ001", name: "CNC Machine 01",     type: "CNC Machine",     location: "Production Floor", status: "Operational", lastMaintenanceDate: "2026-09-10", lastMaintenance: "2026-09-10", nextMaintenance: "2026-09-24" },
            { id: "EQ002", name: "Hydraulic Press 02", type: "Hydraulic Press", location: "Workshop A",       status: "Maintenance", lastMaintenanceDate: "2026-09-05", lastMaintenance: "2026-09-05", nextMaintenance: "2026-09-26" },
            { id: "EQ003", name: "Compressor 04",      type: "Compressor",      location: "Utility Area",     status: "Faulty",      lastMaintenanceDate: "2026-09-01", lastMaintenance: "2026-09-01", nextMaintenance: "2026-09-28" },
            { id: "EQ004", name: "Lathe Machine 03",   type: "Lathe",           location: "Production Floor", status: "Operational", lastMaintenanceDate: "2026-09-12", lastMaintenance: "2026-09-12", nextMaintenance: "2026-09-30" },
            { id: "EQ005", name: "Industrial Pump 01", type: "Pump",            location: "Cooling Plant",    status: "Operational", lastMaintenanceDate: "2026-08-28", lastMaintenance: "2026-08-28", nextMaintenance: "2026-10-05" },
            { id: "EQ006", name: "Conveyor Belt 02",   type: "Conveyor",        location: "Assembly Line 1",  status: "Operational", lastMaintenanceDate: "2026-09-15", lastMaintenance: "2026-09-15", nextMaintenance: "2026-10-02" },
            { id: "EQ007", name: "Generator Unit 01",  type: "Generator",       location: "Powerhouse",       status: "Operational", lastMaintenanceDate: "2026-08-20", lastMaintenance: "2026-08-20", nextMaintenance: "2026-10-12" }
        ];
        localStorage.setItem("forge_equipment", JSON.stringify(eq));
        localStorage.setItem("iemrs_equipment", JSON.stringify(eq));
    }

    // 2. forge_technicians: { id, name, specialization, certifications, availability, activeWorkload }
    if (!localStorage.getItem("forge_technicians") && !localStorage.getItem("iemrs_workforce")) {
        var techs = [
            { id: "TECH-01", name: "Rajesh Kumar",  specialization: "CNC Mechanics & Milling",       certifications: "ISO-9001 Safety / Master Tech",    availability: "Available",   activeWorkload: 0, skill: "CNC Mechanics & Milling",       certification: "ISO-9001 Safety / Master Tech",    workload: "0 Active Orders" },
            { id: "TECH-02", name: "Sarah Jenkins", specialization: "Hydraulic & Fluid Power",        certifications: "CMRP (Certified Maintenance)",      availability: "Available",   activeWorkload: 0, skill: "Hydraulic & Fluid Power",        certification: "CMRP (Certified Maintenance)",      workload: "0 Active Orders" },
            { id: "TECH-03", name: "Vikram Patel",  specialization: "Pneumatics & Compressors",       certifications: "Level 2 Vibration Analyst",         availability: "Busy",        activeWorkload: 1, skill: "Pneumatics & Compressors",       certification: "Level 2 Vibration Analyst",         workload: "1 Active Order"  },
            { id: "TECH-04", name: "David Chen",    specialization: "Electrical Systems & PLC",       certifications: "Certified Automation Professional", availability: "Busy",        activeWorkload: 1, skill: "Electrical Systems & PLC",       certification: "Certified Automation Professional", workload: "1 Active Order"  },
            { id: "TECH-05", name: "Alex Morgan",   specialization: "Pumps & Industrial Piping",      certifications: "Industrial Safety Standards",       availability: "Available",   activeWorkload: 0, skill: "Pumps & Industrial Piping",      certification: "Industrial Safety Standards",       workload: "0 Active Orders" },
            { id: "TECH-06", name: "Priya Sharma",  specialization: "Predictive Analytics & Sensors", certifications: "IIoT Maintenance Specialist",       availability: "Unavailable", activeWorkload: 0, skill: "Predictive Analytics & Sensors", certification: "IIoT Maintenance Specialist",       workload: "On Training Leave" }
        ];
        localStorage.setItem("forge_technicians", JSON.stringify(techs));
        localStorage.setItem("iemrs_workforce",   JSON.stringify(techs));
    }

    // 3. forge_maintenance: { id, equipmentId, technicianId, type, scheduledDate, status, notes }
    if (!localStorage.getItem("forge_maintenance") && !localStorage.getItem("iemrs_maintenance")) {
        var maint = [
            { id: "MN101", equipmentId: "EQ001", equipment: "CNC Machine 01",     technicianId: "TECH-01", technician: "Rajesh Kumar",  type: "Preventive", scheduledDate: "2026-09-24", status: "Scheduled",   originalDate: "", rescheduledDate: "", rescheduleReason: "", workOrderId: "",      notes: "" },
            { id: "MN102", equipmentId: "EQ002", equipment: "Hydraulic Press 02", technicianId: "TECH-02", technician: "Sarah Jenkins", type: "Corrective", scheduledDate: "2026-09-22", status: "In Progress", originalDate: "", rescheduledDate: "", rescheduleReason: "", workOrderId: "WO-302", notes: "" },
            { id: "MN103", equipmentId: "EQ003", equipment: "Compressor 04",      technicianId: "TECH-03", technician: "Vikram Patel",  type: "Corrective", scheduledDate: "2026-09-20", status: "In Progress", originalDate: "", rescheduledDate: "", rescheduleReason: "", workOrderId: "WO-301", notes: "" },
            { id: "MN104", equipmentId: "EQ004", equipment: "Lathe Machine 03",   technicianId: "TECH-04", technician: "David Chen",    type: "Preventive", scheduledDate: "2026-09-30", status: "Scheduled",   originalDate: "", rescheduledDate: "", rescheduleReason: "", workOrderId: "",      notes: "" },
            { id: "MN105", equipmentId: "EQ005", equipment: "Industrial Pump 01", technicianId: "TECH-05", technician: "Alex Morgan",   type: "Preventive", scheduledDate: "2026-09-14", status: "Completed",   originalDate: "", rescheduledDate: "", rescheduleReason: "", workOrderId: "WO-304", notes: "" },
            { id: "MN106", equipmentId: "EQ006", equipment: "Conveyor Belt 02",   technicianId: "TECH-01", technician: "Rajesh Kumar",  type: "Preventive", scheduledDate: "2026-09-15", status: "Completed",   originalDate: "", rescheduledDate: "", rescheduleReason: "", workOrderId: "WO-306", notes: "" }
        ];
        localStorage.setItem("forge_maintenance", JSON.stringify(maint));
        localStorage.setItem("iemrs_maintenance", JSON.stringify(maint));
    }

    // 4. forge_workorders: { id, equipmentId, faultId, technicianId, priority, status, scheduledDate, expectedResumeDate, description, requiredPartId, requiredQuantity, waitingReason, notes }
    if (!localStorage.getItem("forge_workorders") && !localStorage.getItem("iemrs_workorders")) {
        var orders = [
            { id: "WO-301", equipmentId: "EQ003", equipment: "Compressor 04",      faultId: "FLT-001", technicianId: "TECH-03", technician: "Vikram Patel",  priority: "High",   status: "In Progress",      date: "2026-09-20", scheduledDate: "2026-09-20", expectedResumeDate: "",          description: "Pressure drop below 120 bar and unusual vibration", problem: "Pressure drop below 120 bar and unusual vibration", requiredPartId: "PRT-103", requiredPart: "Deep Groove Ball Bearings 6205", requiredQuantity: 1, waitingReason: "",                                            notes: "", originalDate: "", rescheduledDate: "", rescheduleReason: "" },
            { id: "WO-302", equipmentId: "EQ002", equipment: "Hydraulic Press 02", faultId: "FLT-002", technicianId: "TECH-02", technician: "Sarah Jenkins", priority: "High",   status: "Waiting for Parts", date: "2026-09-21", scheduledDate: "2026-09-21", expectedResumeDate: "2026-09-25", description: "Cylinder seal leakage and fluid temperature high",   problem: "Cylinder seal leakage and fluid temperature high",   requiredPartId: "PRT-101", requiredPart: "Hydraulic Filter HF-90",          requiredQuantity: 2, waitingReason: "Hydraulic seal kit unavailable in warehouse", notes: "Supplier PO #884 dispatched", originalDate: "", rescheduledDate: "", rescheduleReason: "" },
            { id: "WO-303", equipmentId: "EQ004", equipment: "Lathe Machine 03",   faultId: "",        technicianId: "TECH-04", technician: "David Chen",    priority: "Medium", status: "Assigned",          date: "2026-09-19", scheduledDate: "2026-09-19", expectedResumeDate: "",          description: "Tool holder alignment calibration required",          problem: "Tool holder alignment calibration required",          requiredPartId: "",        requiredPart: "",                               requiredQuantity: 0, waitingReason: "",                                            notes: "", originalDate: "", rescheduledDate: "", rescheduleReason: "" },
            { id: "WO-304", equipmentId: "EQ005", equipment: "Industrial Pump 01", faultId: "",        technicianId: "TECH-05", technician: "Alex Morgan",   priority: "Low",    status: "Completed",         date: "2026-09-18", scheduledDate: "2026-09-18", expectedResumeDate: "",          description: "Suction valve inspection and routine flush",          problem: "Suction valve inspection and routine flush",          requiredPartId: "",        requiredPart: "",                               requiredQuantity: 0, waitingReason: "",                                            notes: "", originalDate: "", rescheduledDate: "", rescheduleReason: "" },
            { id: "WO-305", equipmentId: "EQ001", equipment: "CNC Machine 01",     faultId: "",        technicianId: "TECH-01", technician: "Rajesh Kumar",  priority: "Medium", status: "Scheduled",         date: "2026-09-21", scheduledDate: "2026-09-21", expectedResumeDate: "",          description: "Spindle bearing lubrication and chip tray cleaning",  problem: "Spindle bearing lubrication and chip tray cleaning",  requiredPartId: "PRT-102", requiredPart: "Machine Oil ISO VG 46",           requiredQuantity: 1, waitingReason: "",                                            notes: "", originalDate: "", rescheduledDate: "", rescheduleReason: "" },
            { id: "WO-306", equipmentId: "EQ006", equipment: "Conveyor Belt 02",   faultId: "",        technicianId: "TECH-01", technician: "Rajesh Kumar",  priority: "Low",    status: "Completed",         date: "2026-09-15", scheduledDate: "2026-09-15", expectedResumeDate: "",          description: "Belt tension adjustment on drive pulley",             problem: "Belt tension adjustment on drive pulley",             requiredPartId: "PRT-104", requiredPart: "Drive Belt V-B52",                requiredQuantity: 1, waitingReason: "",                                            notes: "", originalDate: "", rescheduledDate: "", rescheduleReason: "" }
        ];
        localStorage.setItem("forge_workorders", JSON.stringify(orders));
        localStorage.setItem("iemrs_workorders", JSON.stringify(orders));
    }

    // 5. forge_inventory: { id, partName, category, quantity, minimumStock, supplier }
    if (!localStorage.getItem("forge_inventory") && !localStorage.getItem("iemrs_inventory")) {
        var inv = [
            { id: "PRT-101", partName: "Hydraulic Filter HF-90",         name: "Hydraulic Filter HF-90",         category: "Filters",    quantity: 3,  minimumStock: 5,  minStock: 5,  supplier: "Bosch Rexroth" },
            { id: "PRT-102", partName: "Machine Oil ISO VG 46",          name: "Machine Oil ISO VG 46",          category: "Lubricants", quantity: 5,  minimumStock: 10, minStock: 10, supplier: "Shell Industrial" },
            { id: "PRT-103", partName: "Deep Groove Ball Bearings 6205", name: "Deep Groove Ball Bearings 6205", category: "Bearings",   quantity: 4,  minimumStock: 8,  minStock: 8,  supplier: "SKF Bearings" },
            { id: "PRT-104", partName: "Drive Belt V-B52",               name: "Drive Belt V-B52",               category: "Mechanical", quantity: 18, minimumStock: 6,  minStock: 6,  supplier: "Gates Corporation" },
            { id: "PRT-105", partName: "Pressure Relief Valve 200B",     name: "Pressure Relief Valve 200B",     category: "Mechanical", quantity: 12, minimumStock: 4,  minStock: 4,  supplier: "Parker Hannifin" },
            { id: "PRT-106", partName: "Contactor Relay 24V DC",         name: "Contactor Relay 24V DC",         category: "Electrical", quantity: 25, minimumStock: 5,  minStock: 5,  supplier: "Siemens Industrial" }
        ];
        localStorage.setItem("forge_inventory", JSON.stringify(inv));
        localStorage.setItem("iemrs_inventory", JSON.stringify(inv));
    }

    // 6. forge_faults: { id, equipmentId, reportedBy, description, priority, status, createdAt }
    if (!localStorage.getItem("forge_faults")) {
        var faults = [
            { id: "FLT-001", equipmentId: "EQ003", equipmentName: "Compressor 04",      reportedBy: "op_floor", description: "Pressure drop below 120 bar and unusual vibration detected", priority: "High",   status: "Converted to WO", createdAt: "2026-09-20T08:00:00", workOrderId: "WO-301" },
            { id: "FLT-002", equipmentId: "EQ002", equipmentName: "Hydraulic Press 02", reportedBy: "op_floor", description: "Cylinder seal visibly leaking, fluid on floor near machine",  priority: "High",   status: "Converted to WO", createdAt: "2026-09-21T09:30:00", workOrderId: "WO-302" },
            { id: "FLT-003", equipmentId: "EQ001", equipmentName: "CNC Machine 01",     reportedBy: "Operator", description: "Spindle overheating at high RPM, unusual noise reported",       priority: "Medium", status: "Open",            createdAt: "2026-09-28T07:15:00", workOrderId: "" }
        ];
        localStorage.setItem("forge_faults", JSON.stringify(faults));
    }

    // 7. forge_activity: { id, timestamp, actor, action, target, badgeClass }
    if (!localStorage.getItem("forge_activity") && !localStorage.getItem("iemrs_activities")) {
        var acts = [
            { id: "ACT-1", timestamp: "10 mins ago", actor: "Operator",       action: "WO-302 put on hold — Waiting for Parts: Hydraulic Filter HF-90", target: "Hydraulic Press 02", badgeClass: "badge-waiting" },
            { id: "ACT-2", timestamp: "45 mins ago", actor: "System Monitor",  action: "Stock level fell below minimum threshold (3 left)",               target: "Hydraulic Filter HF-90", badgeClass: "badge-faulty" },
            { id: "ACT-3", timestamp: "2 hours ago", actor: "Vikram Patel",    action: "Work order WO-301 started — In Progress",                          target: "Compressor 04",      badgeClass: "badge-in-progress" },
            { id: "ACT-4", timestamp: "4 hours ago", actor: "Alex Morgan",     action: "Preventive maintenance completed successfully",                     target: "Industrial Pump 01", badgeClass: "badge-completed" },
            { id: "ACT-5", timestamp: "1 day ago",   actor: "Rajesh Kumar",    action: "Work order WO-306 closed and belt replaced",                       target: "Conveyor Belt 02",   badgeClass: "badge-completed" }
        ];
        localStorage.setItem("forge_activity",   JSON.stringify(acts));
        localStorage.setItem("iemrs_activities", JSON.stringify(acts.map(function(a) {
            return { time: a.timestamp, item: a.target, activity: a.action, user: a.actor, badge: a.badgeClass };
        })));
    }
}

// ==========================================================================
// Relational 3NF Query & Foreign Key Resolution Helpers
// ==========================================================================
function getEquipmentList() {
    return JSON.parse(localStorage.getItem("forge_equipment")) ||
           JSON.parse(localStorage.getItem("iemrs_equipment")) || [];
}

function getEquipmentById(id) {
    if (!id) return null;
    var list = getEquipmentList();
    for (var i = 0; i < list.length; i++) {
        if (list[i].id === id || list[i].name === id) return list[i];
    }
    return null;
}

function getEquipmentName(idOrName) {
    if (!idOrName) return "";
    var eq = getEquipmentById(idOrName);
    return eq ? eq.name : idOrName;
}

function getTechniciansList() {
    return JSON.parse(localStorage.getItem("forge_technicians")) ||
           JSON.parse(localStorage.getItem("iemrs_workforce")) || [];
}

function getTechnicianById(id) {
    if (!id) return null;
    var list = getTechniciansList();
    for (var i = 0; i < list.length; i++) {
        if (list[i].id === id || list[i].name === id) return list[i];
    }
    return null;
}

function getTechnicianName(idOrName) {
    if (!idOrName) return "";
    var t = getTechnicianById(idOrName);
    return t ? t.name : idOrName;
}

function getInventoryList() {
    return JSON.parse(localStorage.getItem("forge_inventory")) ||
           JSON.parse(localStorage.getItem("iemrs_inventory")) || [];
}

function getPartById(id) {
    if (!id) return null;
    var list = getInventoryList();
    for (var i = 0; i < list.length; i++) {
        if (list[i].id === id || list[i].partName === id || list[i].name === id) return list[i];
    }
    return null;
}

function getPartName(idOrName) {
    if (!idOrName) return "";
    var p = getPartById(idOrName);
    return p ? (p.partName || p.name) : idOrName;
}

function getWorkOrdersList() {
    return JSON.parse(localStorage.getItem("forge_workorders")) ||
           JSON.parse(localStorage.getItem("iemrs_workorders")) || [];
}

function getWorkOrderById(id) {
    if (!id) return null;
    var list = getWorkOrdersList();
    for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i];
    }
    return null;
}

function getMaintenanceList() {
    return JSON.parse(localStorage.getItem("forge_maintenance")) ||
           JSON.parse(localStorage.getItem("iemrs_maintenance")) || [];
}

function getMaintenanceById(id) {
    if (!id) return null;
    var list = getMaintenanceList();
    for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i];
    }
    return null;
}

function getFaultsList() {
    return JSON.parse(localStorage.getItem("forge_faults")) || [];
}

function getFaultById(id) {
    if (!id) return null;
    var list = getFaultsList();
    for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i];
    }
    return null;
}

function getActivityList() {
    return JSON.parse(localStorage.getItem("forge_activity")) ||
           JSON.parse(localStorage.getItem("iemrs_activities")) || [];
}

// ==========================================================================
// MILESTONE 2: APPLICATION SHELL & NAVIGATION OVERHAUL
// ==========================================================================

var PAGE_CONTEXT_MAP = {
    "dashboard.html":   { section: "OPERATIONS", label: "COMMAND DASHBOARD", tag: "BAY 04" },
    "equipment.html":   { section: "OPERATIONS", label: "ASSET REGISTRY",    tag: "BAY 04" },
    "maintenance.html": { section: "OPERATIONS", label: "PREVENTIVE OPS",    tag: "BAY 04" },
    "workorders.html":  { section: "OPERATIONS", label: "DISPATCH CONSOLE",  tag: "BAY 04" },
    "workforce.html":   { section: "RESOURCES",  label: "ROSTER & SKILLS",   tag: "BAY 04" },
    "inventory.html":   { section: "RESOURCES",  label: "SPARES WAREHOUSE",  tag: "BAY 04" },
    "analytics.html":   { section: "INSIGHTS",   label: "SYSTEM TELEMETRY",  tag: "BAY 04" }
};

var NAV_ICON_MAP = {
    "dashboard":   "⊞",
    "equipment":   "⚙",
    "maintenance": "🛠",
    "workorders":  "📋",
    "work orders": "📋",
    "workforce":   "👥",
    "inventory":   "📦",
    "analytics":   "📈",
    "faults":      "⚠️"
};

// ==========================================================================
// SIDEBAR SHELL: Collapsible Desktop Rail & Off-canvas Mobile/Tablet Drawer
// ==========================================================================
function initSidebarShell() {
    var dashboard = document.querySelector(".dashboard");
    var sidebar = document.querySelector(".sidebar");
    if (!dashboard || !sidebar) return;

    // A. Augment sidebar links with icons & data-tooltip
    sidebar.querySelectorAll(".sidebar-nav a:not(.logout)").forEach(function (link) {
        if (!link.querySelector(".nav-icon")) {
            var rawText = link.textContent.trim();
            var lowerText = rawText.toLowerCase();
            var icon = "▸";
            for (var key in NAV_ICON_MAP) {
                if (lowerText.indexOf(key) !== -1) {
                    icon = NAV_ICON_MAP[key];
                    break;
                }
            }
            link.setAttribute("data-tooltip", rawText);
            link.innerHTML = '<span class="nav-icon" aria-hidden="true">' + icon + '</span><span class="nav-text">' + escapeHTML(rawText) + '</span>';
        }
    });

    // B. Augment sidebar brand with close button (for mobile drawer)
    var sidebarBrand = sidebar.querySelector(".sidebar-brand");
    if (sidebarBrand && !sidebar.querySelector(".sidebar-close-btn")) {
        var h2 = sidebarBrand.querySelector("h2");
        var brandSub = sidebarBrand.querySelector(".brand-sub");
        if (h2 && !sidebarBrand.querySelector(".sidebar-brand-left")) {
            var brandLeft = document.createElement("div");
            brandLeft.className = "sidebar-brand-left";
            var h2Title = h2.textContent.trim();
            brandLeft.innerHTML = '<h2><span class="brand-text">' + escapeHTML(h2Title) + '</span></h2>';
            if (brandSub) brandLeft.appendChild(brandSub);
            sidebarBrand.innerHTML = "";
            sidebarBrand.appendChild(brandLeft);

            var closeBtn = document.createElement("button");
            closeBtn.className = "sidebar-close-btn";
            closeBtn.id = "sidebarCloseBtn";
            closeBtn.setAttribute("type", "button");
            closeBtn.setAttribute("aria-label", "Close navigation drawer");
            closeBtn.innerHTML = "&times;";
            sidebarBrand.appendChild(closeBtn);

            closeBtn.addEventListener("click", closeMobileSidebar);
        }
    }

    // C. Inject backdrop for tablet/mobile drawer if absent
    if (!document.getElementById("sidebarBackdrop")) {
        var backdrop = document.createElement("div");
        backdrop.className = "sidebar-backdrop";
        backdrop.id = "sidebarBackdrop";
        backdrop.setAttribute("aria-hidden", "true");
        dashboard.appendChild(backdrop);
        backdrop.addEventListener("click", closeMobileSidebar);
    }

    // D. Persist collapsed or expanded state for desktop
    var isDesktop = window.innerWidth >= 993;
    var savedCollapsed = localStorage.getItem("forge_sidebar_collapsed") === "true";
    if (isDesktop && savedCollapsed) {
        dashboard.classList.add("sidebar-collapsed");
    }

    // E. Handle responsive resize boundaries
    window.addEventListener("resize", function () {
        if (window.innerWidth >= 993) {
            dashboard.classList.remove("sidebar-mobile-open");
            if (localStorage.getItem("forge_sidebar_collapsed") === "true") {
                dashboard.classList.add("sidebar-collapsed");
            }
        } else {
            dashboard.classList.remove("sidebar-collapsed");
        }
    });

    // F. Global Escape key listener to close mobile drawer
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && dashboard.classList.contains("sidebar-mobile-open")) {
            closeMobileSidebar();
        }
    });
}

function toggleSidebar() {
    var dashboard = document.querySelector(".dashboard");
    if (!dashboard) return;
    if (window.innerWidth >= 993) {
        var isNowCollapsed = dashboard.classList.toggle("sidebar-collapsed");
        localStorage.setItem("forge_sidebar_collapsed", isNowCollapsed ? "true" : "false");
    } else {
        if (dashboard.classList.contains("sidebar-mobile-open")) {
            closeMobileSidebar();
        } else {
            openMobileSidebar();
        }
    }
}

function openMobileSidebar() {
    var dashboard = document.querySelector(".dashboard");
    if (!dashboard) return;
    dashboard.classList.add("sidebar-mobile-open");
    var firstLink = dashboard.querySelector(".sidebar-nav a:not([style*='display: none'])");
    if (firstLink) firstLink.focus();
}

function closeMobileSidebar() {
    var dashboard = document.querySelector(".dashboard");
    if (!dashboard) return;
    dashboard.classList.remove("sidebar-mobile-open");
    var toggleBtn = document.getElementById("sidebarToggleBtn");
    if (toggleBtn) toggleBtn.focus();
}

// ==========================================================================
// TOPBAR SHELL: Context Strip, Search Trigger, Semantic ARIA Standards
// ==========================================================================
function initTopbarShell() {
    var topbar = document.querySelector(".topbar");
    if (!topbar) return;

    var topbarLeft = topbar.querySelector(".topbar-left");
    var topbarRight = topbar.querySelector(".topbar-right");

    // A. Inject sidebar toggle button in topbarLeft if missing
    if (topbarLeft && !document.getElementById("sidebarToggleBtn")) {
        var toggleBtn = document.createElement("button");
        toggleBtn.className = "btn-sidebar-toggle";
        toggleBtn.id = "sidebarToggleBtn";
        toggleBtn.setAttribute("type", "button");
        toggleBtn.setAttribute("aria-label", "Toggle navigation rail");
        toggleBtn.setAttribute("title", "Toggle navigation rail ([)");
        toggleBtn.innerHTML = '<span class="toggle-icon" aria-hidden="true">☰</span>';
        topbarLeft.insertBefore(toggleBtn, topbarLeft.firstChild);

        toggleBtn.addEventListener("click", toggleSidebar);
    }

    // B. Inject industrial context strip
    if (topbarLeft && !topbarLeft.querySelector(".topbar-context-strip")) {
        var currentPath = window.location.pathname.toLowerCase();
        var ctx = { section: "OPERATIONS", label: "COMMAND CONSOLE", tag: "BAY 04" };
        for (var pKey in PAGE_CONTEXT_MAP) {
            if (currentPath.indexOf(pKey) !== -1) {
                ctx = PAGE_CONTEXT_MAP[pKey];
                break;
            }
        }

        var h3 = topbarLeft.querySelector("h3");
        var subtitle = topbarLeft.querySelector(".topbar-subtitle");

        var titleGroup = document.createElement("div");
        titleGroup.className = "topbar-title-group";

        var contextStrip = document.createElement("div");
        contextStrip.className = "topbar-context-strip";
        contextStrip.innerHTML =
            '<span class="context-tag">' + ctx.tag + '</span>' +
            '<span aria-hidden="true">//</span>' +
            '<span class="context-section">' + ctx.section + '</span>' +
            '<span aria-hidden="true">//</span>' +
            '<span class="context-module">' + ctx.label + '</span>';

        titleGroup.appendChild(contextStrip);
        if (h3) {
            titleGroup.appendChild(h3);
        }
        if (subtitle) {
            titleGroup.appendChild(subtitle);
        }
        topbarLeft.appendChild(titleGroup);
    }

    // C. Inject Command Palette search trigger button
    if (!document.getElementById("topbarSearchTrigger")) {
        var isMac = (navigator.platform || "").toUpperCase().indexOf("MAC") >= 0;
        var shortcutText = isMac ? "⌘K" : "Ctrl+K";

        var searchTrigger = document.createElement("button");
        searchTrigger.className = "topbar-search-btn";
        searchTrigger.id = "topbarSearchTrigger";
        searchTrigger.setAttribute("type", "button");
        searchTrigger.setAttribute("aria-label", "Search records or jump to... (" + shortcutText + ")");
        searchTrigger.innerHTML =
            '<span class="search-ico" aria-hidden="true">⌕</span>' +
            '<span class="search-text">Search records or jump to...</span>' +
            '<span class="search-shortcut">' + shortcutText + '</span>';

        if (topbarRight) {
            topbar.insertBefore(searchTrigger, topbarRight);
        } else {
            topbar.appendChild(searchTrigger);
        }

        searchTrigger.addEventListener("click", function () {
            openCommandPalette();
        });
    }

    // D. Refine topbar accessibility
    var roleBadge = topbar.querySelector(".role-badge");
    if (roleBadge) {
        var role = getActiveRole();
        roleBadge.setAttribute("aria-label", "Active session role: " + role);
        roleBadge.setAttribute("tabindex", "0");
    }
}

// ==========================================================================
// FORGE CONTROL DOCK (Bespoke Industrial Instrument Bar)
// ==========================================================================
function initControlDock() {
    if (document.getElementById("forgeControlDock")) return;
    if (!document.querySelector(".dashboard")) return;

    var role = getActiveRole();
    var currentTheme = localStorage.getItem("forge_theme") || "light";

    // Compute live urgent counts
    var workorders = getWorkOrdersList();
    var inventory = getInventoryList();
    var urgentCount = 0;
    for (var i = 0; i < workorders.length; i++) {
        var wo = workorders[i];
        var p = (wo.priority || "").toLowerCase();
        var s = (wo.status || "").toLowerCase();
        if ((p === "high" || p === "critical" || p === "emergency") && s !== "completed") {
            urgentCount++;
        }
    }
    for (var j = 0; j < inventory.length; j++) {
        var part = inventory[j];
        if (Number(part.quantity) <= Number(part.minimumStock)) {
            urgentCount++;
        }
    }

    // Role-specific action config
    var actionConfig = {
        icon: "+",
        label: "CREATE WO",
        title: "Create Work Order (Shortcut: N)",
        handler: function () {
            if (window.location.pathname.toLowerCase().indexOf("workorders") !== -1) {
                var btn = document.getElementById("addNewOrderBtn");
                if (btn) btn.click();
            } else {
                window.location.href = "workorders.html?action=new";
            }
        }
    };
    if (role === "Technician") {
        actionConfig = {
            icon: "🛠",
            label: "LOG WO",
            title: "Log or Update Work Order (Shortcut: L)",
            handler: function () {
                window.location.href = "workorders.html";
            }
        };
    } else if (role === "Operator") {
        actionConfig = {
            icon: "⚠️",
            label: "FAULT",
            title: "Report Equipment Breakdown (Shortcut: F)",
            handler: function () {
                openQuickFaultModal();
            }
        };
    }

    var isMac = (navigator.platform || "").toUpperCase().indexOf("MAC") >= 0;
    var kbdSearch = isMac ? "⌘K" : "^K";

    var dock = document.createElement("div");
    dock.className = "forge-control-dock";
    dock.id = "forgeControlDock";
    dock.setAttribute("role", "toolbar");
    dock.setAttribute("aria-label", "FORGE Industrial Control Dock");

    var isDash = window.location.pathname.toLowerCase().indexOf("dashboard") !== -1;

    dock.innerHTML =
        '<button class="dock-btn" id="dockSearchBtn" type="button" title="Search records or actions (' + (isMac ? 'Cmd+K' : 'Ctrl+K') + ')" aria-label="Search records">' +
            '<span class="dock-icon" aria-hidden="true">⌕</span>' +
            '<span class="dock-label">SEARCH</span>' +
            '<span class="dock-shortcut">' + kbdSearch + '</span>' +
        '</button>' +
        '<span class="dock-divider" aria-hidden="true"></span>' +
        '<a href="dashboard.html" class="dock-btn ' + (isDash ? 'active' : '') + '" id="dockDashBtn" title="Jump to Operations Dashboard (D)" aria-label="Dashboard">' +
            '<span class="dock-icon" aria-hidden="true">⊞</span>' +
            '<span class="dock-label">DASH</span>' +
            '<span class="dock-shortcut">D</span>' +
        '</a>' +
        '<button class="dock-btn dock-btn-primary" id="dockActionBtn" type="button" title="' + actionConfig.title + '" aria-label="' + actionConfig.label + '">' +
            '<span class="dock-icon" aria-hidden="true">' + actionConfig.icon + '</span>' +
            '<span class="dock-label">' + actionConfig.label + '</span>' +
        '</button>' +
        '<button class="dock-btn" id="dockAlertsBtn" type="button" title="Urgent Alerts: ' + urgentCount + ' active items" aria-label="Urgent alerts (' + urgentCount + ')">' +
            '<span class="dock-icon" style="color:var(--danger);" aria-hidden="true">⚡</span>' +
            '<span class="dock-label">ALERTS</span>' +
            (urgentCount > 0 ? '<span class="dock-badge" id="dockAlertsBadge">' + urgentCount + '</span>' : '') +
        '</button>' +
        '<span class="dock-divider" aria-hidden="true"></span>' +
        '<button class="dock-btn" id="dockSidebarBtn" type="button" title="Toggle Sidebar Rail ([)" aria-label="Toggle Sidebar">' +
            '<span class="dock-icon" aria-hidden="true">⫷</span>' +
            '<span class="dock-shortcut">[</span>' +
        '</button>' +
        '<button class="dock-btn" id="dockThemeBtn" type="button" title="Toggle Theme (T)" aria-label="Toggle Theme">' +
            '<span class="dock-icon" id="dockThemeIcon" aria-hidden="true">' + (currentTheme === "dark" ? "☀" : "🌙") + '</span>' +
            '<span class="dock-shortcut">T</span>' +
        '</button>';

    document.body.appendChild(dock);

    // Event listeners
    document.getElementById("dockSearchBtn").addEventListener("click", function () { openCommandPalette(); });
    document.getElementById("dockActionBtn").addEventListener("click", actionConfig.handler);
    document.getElementById("dockAlertsBtn").addEventListener("click", function () {
        if (urgentCount > 0) {
            showAlert("Urgent Items: " + urgentCount + " high-priority work orders / low stock items.", "warning");
            setTimeout(function () { window.location.href = "workorders.html"; }, 800);
        } else {
            showAlert("All systems nominal. Zero active urgent alerts.", "success");
        }
    });
    document.getElementById("dockSidebarBtn").addEventListener("click", toggleSidebar);
    document.getElementById("dockThemeBtn").addEventListener("click", function () {
        var current = localStorage.getItem("forge_theme") || "light";
        applyTheme(current === "dark" ? "light" : "dark");
    });
}

// ==========================================================================
// OPERATOR QUICK FAULT MODAL DIALOG
// ==========================================================================
function openQuickFaultModal(preselectedEqName) {
    var modalEl = document.getElementById("forgeQuickFaultModal");
    if (!modalEl) {
        modalEl = document.createElement("div");
        modalEl.className = "modal fade";
        modalEl.id = "forgeQuickFaultModal";
        modalEl.tabIndex = -1;
        modalEl.setAttribute("aria-labelledby", "forgeQuickFaultModalLabel");
        modalEl.setAttribute("aria-hidden", "true");
        modalEl.innerHTML =
            '<div class="modal-dialog modal-dialog-centered">' +
                '<div class="modal-content">' +
                    '<div class="modal-header">' +
                        '<div>' +
                            '<div class="text-gold font-mono small" style="font-size:0.75rem; letter-spacing:0.5px;">INCIDENT DISPATCH // OPERATOR</div>' +
                            '<h5 class="modal-title" id="forgeQuickFaultModalLabel">Report Equipment Breakdown</h5>' +
                        '</div>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<form id="forgeQuickFaultForm">' +
                        '<div class="modal-body">' +
                            '<div class="mb-3">' +
                                '<label for="quickFaultEquipment" class="form-label">Impacted Machinery</label>' +
                                '<select id="quickFaultEquipment" class="form-select" required>' +
                                    '<option value="">-- Select Target Equipment --</option>' +
                                '</select>' +
                            '</div>' +
                            '<div class="mb-3">' +
                                '<label for="quickFaultPriority" class="form-label">Severity Level</label>' +
                                '<select id="quickFaultPriority" class="form-select" required>' +
                                    '<option value="High" selected>High (Production Stoppage)</option>' +
                                    '<option value="Critical">Critical (Immediate Danger)</option>' +
                                    '<option value="Medium">Medium (Degraded Performance)</option>' +
                                    '<option value="Low">Low (Minor Inspection)</option>' +
                                '</select>' +
                            '</div>' +
                            '<div class="mb-3">' +
                                '<label for="quickFaultDescription" class="form-label">Diagnostics / Symptom Description</label>' +
                                '<textarea id="quickFaultDescription" class="form-control" rows="3" placeholder="Describe abnormal noise, overheating, fluid leak, error code, or stoppage..." required></textarea>' +
                            '</div>' +
                        '</div>' +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>' +
                            '<button type="submit" class="btn btn-primary">Dispatch Incident Report</button>' +
                        '</div>' +
                    '</form>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modalEl);

        document.getElementById("forgeQuickFaultForm").addEventListener("submit", function (e) {
            e.preventDefault();
            var eqSelect = document.getElementById("quickFaultEquipment");
            var eqVal = eqSelect.value;
            var eqOpt = eqSelect.options[eqSelect.selectedIndex];
            var eqId = eqOpt ? eqOpt.getAttribute("data-id") : "";
            var pri = document.getElementById("quickFaultPriority").value;
            var desc = document.getElementById("quickFaultDescription").value.trim();

            if (!eqVal || !desc) return;

            // Generate IDs
            var faults = JSON.parse(localStorage.getItem("forge_faults")) || [];
            var faultId = "FLT-00" + (faults.length + 1);
            var workorders = JSON.parse(localStorage.getItem("forge_workorders")) ||
                             JSON.parse(localStorage.getItem("iemrs_workorders")) || [];
            var woId = "WO-" + (300 + workorders.length + 1);

            // Auto-assign technician with matching skill
            var techResult = autoAssignTechnician(eqVal);
            var techName = (techResult && techResult.name) ? techResult.name : "Unassigned";
            var techId = (techResult && techResult.technician) ? techResult.technician.id : "";

            // 1. Create fault record
            var newFault = {
                id: faultId,
                equipmentId: eqId,
                equipmentName: eqVal,
                reportedBy: "Operator",
                description: desc,
                priority: pri,
                status: "Converted to WO",
                createdAt: new Date().toISOString(),
                workOrderId: woId
            };
            faults.unshift(newFault);
            localStorage.setItem("forge_faults", JSON.stringify(faults));

            // 2. Create corresponding work order
            var newWO = {
                id: woId,
                equipmentId: eqId,
                equipment: eqVal,
                faultId: faultId,
                technicianId: techId,
                technician: techName,
                priority: pri,
                status: techName !== "Unassigned" ? "Assigned" : "Scheduled",
                date: new Date().toISOString().split("T")[0],
                scheduledDate: new Date().toISOString().split("T")[0],
                expectedResumeDate: "",
                description: desc,
                problem: desc,
                requiredPartId: "",
                requiredPart: "",
                requiredQuantity: 0,
                waitingReason: "",
                notes: "Operator reported incident via Control Dock"
            };
            workorders.unshift(newWO);
            localStorage.setItem("forge_workorders", JSON.stringify(workorders));
            localStorage.setItem("iemrs_workorders", JSON.stringify(workorders));

            // 3. Update equipment status to Faulty
            var eqList = getEquipmentList();
            for (var k = 0; k < eqList.length; k++) {
                if (eqList[k].name === eqVal || eqList[k].id === eqId) {
                    eqList[k].status = "Faulty";
                    break;
                }
            }
            localStorage.setItem("forge_equipment", JSON.stringify(eqList));
            localStorage.setItem("iemrs_equipment", JSON.stringify(eqList));

            // 4. Log activity
            logActivity(eqVal, "Operator reported fault " + faultId + " → Dispatched " + woId + " (" + pri + " Priority)", "badge-danger");

            // Close modal
            var inst = bootstrap.Modal.getInstance(modalEl);
            if (inst) inst.hide();

            showAlert("Incident " + faultId + " reported. Work Order " + woId + " dispatched to " + techName + ".", "success");

            // If on dashboard or related page, reload
            setTimeout(function () {
                var p = window.location.pathname.toLowerCase();
                if (p.indexOf("dashboard") !== -1 || p.indexOf("workorders") !== -1 || p.indexOf("equipment") !== -1) {
                    window.location.reload();
                }
            }, 600);
        });
    }

    // Populate equipment select
    var eqSelect = document.getElementById("quickFaultEquipment");
    if (eqSelect) {
        eqSelect.innerHTML = '<option value="">-- Select Target Equipment --</option>';
        var eqList = getEquipmentList();
        eqList.forEach(function (eq) {
            var opt = document.createElement("option");
            opt.value = eq.name;
            opt.setAttribute("data-id", eq.id);
            opt.textContent = eq.name + " (" + eq.type + " - " + (eq.location || "Plant Floor") + ") - " + eq.status;
            if (preselectedEqName && (eq.name === preselectedEqName || eq.id === preselectedEqName)) {
                opt.selected = true;
            }
            eqSelect.appendChild(opt);
        });
    }

    document.getElementById("quickFaultDescription").value = "";
    document.getElementById("quickFaultPriority").value = "High";

    var bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    bsModal.show();
}

// ==========================================================================
// ACCESSIBLE COMMAND PALETTE (Ctrl+K / Cmd+K)
// ==========================================================================
var cmdPaletteState = {
    isOpen: false,
    selectedIndex: 0,
    items: [],
    lastFocused: null
};

function initCommandPalette() {
    if (document.getElementById("cmdPalette")) return;

    var role = getActiveRole();

    var paletteBackdrop = document.createElement("div");
    paletteBackdrop.className = "cmd-palette-backdrop";
    paletteBackdrop.id = "cmdPalette";
    paletteBackdrop.style.display = "none";
    paletteBackdrop.setAttribute("role", "dialog");
    paletteBackdrop.setAttribute("aria-modal", "true");
    paletteBackdrop.setAttribute("aria-label", "Command Palette");

    paletteBackdrop.innerHTML =
        '<div class="cmd-palette-modal">' +
            '<div class="cmd-palette-header">' +
                '<span class="cmd-search-icon" aria-hidden="true">⌕</span>' +
                '<input type="text" class="cmd-palette-input" id="cmdPaletteInput" placeholder="Search navigation, records, or system actions..." autocomplete="off" spellcheck="false" aria-autocomplete="list">' +
                '<span class="cmd-esc-badge" aria-hidden="true">ESC</span>' +
            '</div>' +
            '<div class="cmd-palette-body" id="cmdPaletteBody" role="listbox"></div>' +
            '<div class="cmd-palette-footer">' +
                '<div class="cmd-footer-hints">' +
                    '<span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>' +
                    '<span><kbd>↵</kbd> Execute</span>' +
                    '<span><kbd>ESC</kbd> Close</span>' +
                '</div>' +
                '<span class="cmd-footer-role" id="cmdFooterRole">ROLE: ' + role.toUpperCase() + '</span>' +
            '</div>' +
        '</div>';

    document.body.appendChild(paletteBackdrop);

    var input = document.getElementById("cmdPaletteInput");

    // Backdrop click dismisses
    paletteBackdrop.addEventListener("click", function (e) {
        if (e.target === paletteBackdrop) {
            closeCommandPalette();
        }
    });

    // Input filter
    input.addEventListener("input", function () {
        renderCommandPaletteResults(input.value.trim());
    });

    // Keyboard navigation inside palette & global hotkeys
    document.addEventListener("keydown", function (e) {
        var isMac = (navigator.platform || "").toUpperCase().indexOf("MAC") >= 0;
        var isCmdK = (isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "k";

        if (isCmdK) {
            e.preventDefault();
            if (cmdPaletteState.isOpen) {
                closeCommandPalette();
            } else {
                openCommandPalette();
            }
            return;
        }

        if (cmdPaletteState.isOpen) {
            if (e.key === "Escape") {
                e.preventDefault();
                closeCommandPalette();
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                navigateCommandPalette(1);
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                navigateCommandPalette(-1);
            } else if (e.key === "Enter") {
                e.preventDefault();
                executeCommandPaletteItem(cmdPaletteState.selectedIndex);
            }
            return;
        }

        // Global shortcuts when not inside an editable element
        var activeEl = document.activeElement;
        var activeTag = (activeEl && activeEl.tagName) ? activeEl.tagName.toUpperCase() : "";
        var isEditable = !!(activeEl && (
            activeTag === "INPUT" ||
            activeTag === "TEXTAREA" ||
            activeTag === "SELECT" ||
            activeEl.isContentEditable ||
            activeEl.getAttribute("contenteditable") === "true"
        ));
        if (isEditable) {
            return;
        }

        var key = e.key.toLowerCase();
        if (key === "[") {
            e.preventDefault();
            toggleSidebar();
        } else if (key === "t") {
            e.preventDefault();
            var cur = localStorage.getItem("forge_theme") || "light";
            applyTheme(cur === "dark" ? "light" : "dark");
        } else if (key === "d") {
            if (window.location.pathname.toLowerCase().indexOf("dashboard") === -1) {
                e.preventDefault();
                window.location.href = "dashboard.html";
            }
        } else if (key === "n") {
            // New Work Order shortcut (Admin)
            e.preventDefault();
            if (window.location.pathname.toLowerCase().indexOf("workorders") !== -1) {
                var btn = document.getElementById("addNewOrderBtn");
                if (btn && btn.style.display !== "none" && !btn.classList.contains("d-none")) {
                    btn.click();
                }
            } else if (role === "Administrator") {
                window.location.href = "workorders.html?action=new";
            }
        } else if (key === "l") {
            // Log / Update Work Order shortcut (Technician)
            e.preventDefault();
            if (window.location.pathname.toLowerCase().indexOf("workorders") === -1) {
                window.location.href = "workorders.html";
            }
        } else if (key === "f") {
            // Report Fault shortcut (Operator)
            e.preventDefault();
            openQuickFaultModal();
        }
    });

    // Handle deep linked actions, e.g. ?action=new
    if (window.location.search.indexOf("action=new") !== -1) {
        setTimeout(function () {
            var btn = document.getElementById("addNewOrderBtn");
            if (btn) btn.click();
        }, 350);
    }
}

function openCommandPalette() {
    var palette = document.getElementById("cmdPalette");
    var input = document.getElementById("cmdPaletteInput");
    if (!palette || !input) return;

    cmdPaletteState.lastFocused = document.activeElement;
    cmdPaletteState.isOpen = true;
    cmdPaletteState.selectedIndex = 0;
    palette.style.display = "flex";
    input.value = "";

    renderCommandPaletteResults("");
    input.focus();
}

function closeCommandPalette() {
    var palette = document.getElementById("cmdPalette");
    if (!palette) return;

    palette.style.display = "none";
    cmdPaletteState.isOpen = false;
    cmdPaletteState.items = [];

    if (cmdPaletteState.lastFocused && typeof cmdPaletteState.lastFocused.focus === "function") {
        cmdPaletteState.lastFocused.focus();
    }
}

function getCommandPaletteData() {
    var role = getActiveRole();
    var navItems = [];
    var recordItems = [];
    var actionItems = [];

    // 1. Navigation items (role-filtered)
    var allowedNav = ROLE_NAV_ACCESS[role] || ROLE_NAV_ACCESS["Operator"];
    var allNav = [
        { id: "nav-dash",  category: "Navigation", icon: "⊞", title: "Operations Dashboard", meta: "Module // Overview", href: "dashboard.html", key: "dashboard" },
        { id: "nav-eq",    category: "Navigation", icon: "⚙", title: "Equipment Registry", meta: "Module // Operations", href: "equipment.html", key: "equipment" },
        { id: "nav-maint", category: "Navigation", icon: "🛠", title: "Maintenance Schedules", meta: "Module // Operations", href: "maintenance.html", key: "maintenance" },
        { id: "nav-wo",    category: "Navigation", icon: "📋", title: "Work Orders Dispatch", meta: "Module // Operations", href: "workorders.html", key: "workorders" },
        { id: "nav-wf",    category: "Navigation", icon: "👥", title: "Workforce & Roster", meta: "Module // Resources", href: "workforce.html", key: "workforce" },
        { id: "nav-inv",   category: "Navigation", icon: "📦", title: "Spares Inventory", meta: "Module // Resources", href: "inventory.html", key: "inventory" },
        { id: "nav-an",    category: "Navigation", icon: "📈", title: "System Analytics", meta: "Module // Insights", href: "analytics.html", key: "analytics" }
    ];

    allNav.forEach(function (n) {
        if (allowedNav.indexOf(n.key) !== -1) {
            navItems.push({
                category: "Navigation",
                icon: n.icon,
                title: n.title,
                meta: n.meta,
                action: function () { window.location.href = n.href; }
            });
        }
    });

    // 2. Operational Records
    // Equipment
    var eqList = getEquipmentList();
    for (var e = 0; e < eqList.length; e++) {
        var eq = eqList[e];
        recordItems.push({
            category: "Operational Records",
            icon: "⚙",
            title: "[" + eq.id + "] " + eq.name,
            meta: (eq.status || "Unknown").toUpperCase() + " • " + (eq.location || "BAY 04"),
            action: (function (targetEq) {
                return function () { window.location.href = "equipment.html"; };
            })(eq)
        });
    }

    // Work Orders
    var woList = getWorkOrdersList();
    for (var w = 0; w < woList.length; w++) {
        var wo = woList[w];
        recordItems.push({
            category: "Operational Records",
            icon: "📋",
            title: "[" + wo.id + "] " + (wo.title || wo.description || "Work Order"),
            meta: (wo.priority || "Normal").toUpperCase() + " • " + (wo.status || "Pending"),
            action: (function (targetWo) {
                return function () { window.location.href = "workorders.html"; };
            })(wo)
        });
    }

    // Inventory Parts
    var invList = getInventoryList();
    for (var p = 0; p < invList.length; p++) {
        var prt = invList[p];
        recordItems.push({
            category: "Operational Records",
            icon: "📦",
            title: "[" + prt.id + "] " + (prt.partName || prt.name || "Spare Part"),
            meta: "QTY: " + prt.quantity + " • MIN: " + prt.minimumStock,
            action: (function (targetPart) {
                return function () { window.location.href = "inventory.html"; };
            })(prt)
        });
    }

    // 3. System Actions
    var currentTheme = localStorage.getItem("forge_theme") || "light";
    actionItems.push({
        category: "System Actions",
        icon: currentTheme === "dark" ? "☀" : "🌙",
        title: "Toggle Theme (" + (currentTheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode") + ")",
        meta: "SYSTEM // THEME",
        action: function () {
            applyTheme(currentTheme === "dark" ? "light" : "dark");
            closeCommandPalette();
        }
    });

    // Role switch actions
    var roles = ["Administrator", "Technician", "Operator"];
    roles.forEach(function (r) {
        if (r !== role) {
            actionItems.push({
                category: "System Actions",
                icon: "👤",
                title: "Switch Role: " + r,
                meta: "SYSTEM // RBAC",
                action: function () {
                    sessionStorage.setItem("forge_role", r);
                    sessionStorage.setItem("iemrs_role", r);
                    closeCommandPalette();
                    showAlert("Switched to " + r + " view.", "info");
                    setTimeout(function () { window.location.reload(); }, 300);
                }
            });
        }
    });

    if (role === "Administrator") {
        actionItems.push({
            category: "System Actions",
            icon: "+",
            title: "Create New Work Order",
            meta: "ACTION // DISPATCH",
            action: function () {
                closeCommandPalette();
                if (window.location.pathname.toLowerCase().indexOf("workorders") !== -1) {
                    var btn = document.getElementById("addNewOrderBtn");
                    if (btn) btn.click();
                } else {
                    window.location.href = "workorders.html?action=new";
                }
            }
        });
    }

    return { navigation: navItems, records: recordItems, actions: actionItems };
}

function renderCommandPaletteResults(query) {
    var body = document.getElementById("cmdPaletteBody");
    if (!body) return;

    var data = getCommandPaletteData();
    var q = query.toLowerCase().trim();

    var filteredNav = data.navigation.filter(function (it) {
        return !q || it.title.toLowerCase().indexOf(q) !== -1 || it.meta.toLowerCase().indexOf(q) !== -1;
    });

    var filteredRecords = data.records.filter(function (it) {
        return !q || it.title.toLowerCase().indexOf(q) !== -1 || it.meta.toLowerCase().indexOf(q) !== -1;
    }).slice(0, 10);

    var filteredActions = data.actions.filter(function (it) {
        return !q || it.title.toLowerCase().indexOf(q) !== -1 || it.meta.toLowerCase().indexOf(q) !== -1;
    });

    var allFiltered = [];
    var html = "";

    function renderGroup(title, items) {
        if (items.length === 0) return "";
        var gHtml = '<div class="cmd-group-title">' + title + '</div>';
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var globalIdx = allFiltered.length;
            allFiltered.push(item);
            var isSelected = globalIdx === cmdPaletteState.selectedIndex;
            gHtml +=
                '<div class="cmd-item ' + (isSelected ? 'selected' : '') + '" data-index="' + globalIdx + '" role="option" aria-selected="' + isSelected + '">' +
                    '<div class="cmd-item-left">' +
                        '<span class="cmd-item-icon" aria-hidden="true">' + item.icon + '</span>' +
                        '<span class="cmd-item-title">' + escapeHTML(item.title) + '</span>' +
                    '</div>' +
                    '<span class="cmd-item-meta">' + escapeHTML(item.meta) + '</span>' +
                '</div>';
        }
        return gHtml;
    }

    html += renderGroup("Navigation", filteredNav);
    html += renderGroup("Operational Records", filteredRecords);
    html += renderGroup("System Actions", filteredActions);

    if (allFiltered.length === 0) {
        html = '<div class="cmd-empty">NO MATCHING INDUSTRIAL RECORDS FOUND</div>';
    }

    body.innerHTML = html;
    cmdPaletteState.items = allFiltered;

    if (cmdPaletteState.selectedIndex >= allFiltered.length) {
        cmdPaletteState.selectedIndex = 0;
        updateSelectedCommandItem();
    }

    body.querySelectorAll(".cmd-item").forEach(function (el) {
        el.addEventListener("click", function () {
            var idx = parseInt(el.getAttribute("data-index"), 10);
            executeCommandPaletteItem(idx);
        });
    });
}

function navigateCommandPalette(delta) {
    if (cmdPaletteState.items.length === 0) return;
    cmdPaletteState.selectedIndex = (cmdPaletteState.selectedIndex + delta + cmdPaletteState.items.length) % cmdPaletteState.items.length;
    updateSelectedCommandItem();
}

function updateSelectedCommandItem() {
    var body = document.getElementById("cmdPaletteBody");
    if (!body) return;
    var items = body.querySelectorAll(".cmd-item");
    items.forEach(function (el, idx) {
        if (idx === cmdPaletteState.selectedIndex) {
            el.classList.add("selected");
            el.setAttribute("aria-selected", "true");
            el.scrollIntoView({ block: "nearest" });
        } else {
            el.classList.remove("selected");
            el.setAttribute("aria-selected", "false");
        }
    });
}

function executeCommandPaletteItem(idx) {
    if (idx >= 0 && idx < cmdPaletteState.items.length) {
        var item = cmdPaletteState.items[idx];
        closeCommandPalette();
        if (item && typeof item.action === "function") {
            item.action();
        }
    }
}



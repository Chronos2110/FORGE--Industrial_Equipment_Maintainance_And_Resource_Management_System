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
    "Technician":    ["dashboard","equipment","maintenance","workorders","faults"],
    "Operator":      ["dashboard","equipment","faults"]
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
    "inventory.html":  ["Administrator", "Technician"],
    "workorders.html": ["Administrator", "Technician"],
    "maintenance.html":["Administrator", "Technician"]
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
        document.querySelectorAll(".btn-action-delete").forEach(function (el) { el.classList.add("d-none"); });
        document.querySelectorAll(".btn-action-edit").forEach(function (el) { el.classList.add("d-none"); });
        var ids = ["addNewEquipmentBtn", "addNewTechBtn", "addNewMaintBtn", "addNewPartBtn", "addNewOrderBtn"];
        ids.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.classList.add("d-none");
        });
        document.querySelectorAll(".admin-only").forEach(function (el) { el.classList.add("d-none"); });
        document.querySelectorAll(".technician-only").forEach(function (el) { el.classList.add("d-none"); });
        document.querySelectorAll(".operator-only").forEach(function (el) { el.classList.remove("d-none"); });
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


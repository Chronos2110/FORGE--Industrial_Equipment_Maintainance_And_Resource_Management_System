// ==========================================================================
// FORGE - Common Shared Frontend JavaScript (js/common.js)
// Handles: Data Seeding, Migration Guard, Workload Calculation,
//          Auto-Assign Skill Mapping, Equipment Status Sync,
//          Activity Logging, XSS Protection, and Role-Aware UI
// ==========================================================================

document.addEventListener("DOMContentLoaded", function () {
    initDefaultData();
    migrateLegacyData();
    initCommon();
    applyRolePermissions();
});

// Display active navigation, role, quick role switcher, and bind logout
function initCommon() {
    let role = sessionStorage.getItem("iemrs_role") || "Administrator";

    // 1. Display Current Role
    let roleElements = document.querySelectorAll(".topbar-role, #currentRole");
    roleElements.forEach(function (el) {
        el.textContent = role;
    });

    // 2. Add quick role switch dropdown if not already added
    let topbarRight = document.querySelector(".topbar-right");
    if (topbarRight && !document.getElementById("roleSwitcherSelect")) {
        let switcherWrapper = document.createElement("div");
        switcherWrapper.className = "d-flex align-items-center gap-2";
        switcherWrapper.innerHTML = `
            <small class="text-muted d-none d-md-inline" style="font-size:0.75rem;">Role:</small>
            <select id="roleSwitcherSelect" class="form-select form-select-sm" style="font-size:0.78rem; padding: 2px 24px 2px 8px; width:auto; font-weight:600;">
                <option value="Administrator" ${role === "Administrator" ? "selected" : ""}>Admin</option>
                <option value="Technician" ${role === "Technician" ? "selected" : ""}>Technician</option>
                <option value="Operator" ${role === "Operator" ? "selected" : ""}>Operator</option>
            </select>
        `;
        topbarRight.appendChild(switcherWrapper);

        document.getElementById("roleSwitcherSelect").addEventListener("change", function (e) {
            let newRole = e.target.value;
            sessionStorage.setItem("iemrs_role", newRole);
            showAlert("Switched active view to " + newRole + " mode.", "info");
            setTimeout(function () {
                window.location.reload();
            }, 300);
        });
    }

    // 3. Active Sidebar Navigation
    let currentPath = window.location.pathname.toLowerCase();
    let navLinks = document.querySelectorAll(".sidebar a:not(.logout)");

    navLinks.forEach(function (link) {
        let href = link.getAttribute("href");
        if (href && currentPath.includes(href.toLowerCase().replace("../", ""))) {
            link.classList.add("active");
        } else {
            link.classList.remove("active");
        }
    });

    // 4. Logout handling
    let logoutLinks = document.querySelectorAll(".sidebar .logout, #logoutBtn");
    logoutLinks.forEach(function (btn) {
        btn.addEventListener("click", function (e) {
            e.preventDefault();
            sessionStorage.removeItem("iemrs_role");
            window.location.href = "../login.html";
        });
    });
}

// ==========================================================================
// Role-Aware UI Permission Enforcement
// ==========================================================================
function applyRolePermissions() {
    let role = sessionStorage.getItem("iemrs_role") || "Administrator";

    if (role === "Technician") {
        // Technicians cannot delete items, nor add equipment/technicians/inventory
        document.querySelectorAll(".btn-action-delete").forEach(el => el.classList.add("d-none"));
        let addEq = document.getElementById("addNewEquipmentBtn");
        if (addEq) addEq.classList.add("d-none");
        let addTech = document.getElementById("addNewTechBtn");
        if (addTech) addTech.classList.add("d-none");
        let addPart = document.getElementById("addNewPartBtn");
        if (addPart) addPart.classList.add("d-none");
    } else if (role === "Operator") {
        // Operators can view and file work orders, but cannot delete or edit master registers
        document.querySelectorAll(".btn-action-delete").forEach(el => el.classList.add("d-none"));
        let addEq = document.getElementById("addNewEquipmentBtn");
        if (addEq) addEq.classList.add("d-none");
        let addTech = document.getElementById("addNewTechBtn");
        if (addTech) addTech.classList.add("d-none");
        let addMaint = document.getElementById("addNewMaintBtn");
        if (addMaint) addMaint.classList.add("d-none");
        let addPart = document.getElementById("addNewPartBtn");
        if (addPart) addPart.classList.add("d-none");
    } else {
        // Administrator: Full access
        document.querySelectorAll(".btn-action-delete").forEach(el => el.classList.remove("d-none"));
    }
}

// ==========================================================================
// Safe HTML Escaping (Prevents DOM-Based XSS)
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
// Live Activity Logger
// ==========================================================================
function logActivity(item, activity, badgeClass) {
    let activities = JSON.parse(localStorage.getItem("iemrs_activities")) || [];
    let currentRole = sessionStorage.getItem("iemrs_role") || "Administrator";

    let newEntry = {
        time: "Just now",
        item: item,
        activity: activity,
        user: currentRole,
        badge: badgeClass || "badge-scheduled"
    };

    activities.unshift(newEntry);
    if (activities.length > 20) {
        activities = activities.slice(0, 20);
    }
    localStorage.setItem("iemrs_activities", JSON.stringify(activities));
}

// ==========================================================================
// Dynamic Workforce Active Workload Calculation
// Count work orders assigned to technician with status 'Assigned' or 'In Progress'
// (Excludes: 'Waiting for Parts', 'Completed', 'Cancelled', 'Scheduled')
// ==========================================================================
function calculateActiveWorkload(technicianName) {
    let workorders = JSON.parse(localStorage.getItem("iemrs_workorders")) || [];
    let count = 0;
    for (let i = 0; i < workorders.length; i++) {
        let order = workorders[i];
        if (order.technician === technicianName && (order.status === "Assigned" || order.status === "In Progress")) {
            count++;
        }
    }
    return count;
}

// ==========================================================================
// Explainable Auto-Assign Algorithm with Skill Mapping & Lowest Workload
// ==========================================================================
const SKILL_KEYWORD_MAP = {
    "CNC Machine": ["cnc", "milling", "mechanics", "lathe"],
    "Hydraulic Press": ["hydraulic", "fluid", "press", "valves", "seals"],
    "Compressor": ["pneumatics", "compressor", "air", "vibration"],
    "Lathe": ["cnc", "lathe", "mechanics", "milling"],
    "Pump": ["pumps", "piping", "fluid", "valves"],
    "Conveyor": ["conveyor", "belts", "mechanics", "motors"],
    "Generator": ["electrical", "plc", "automation", "power"],
    "Drill": ["mechanics", "cnc"]
};

function autoAssignTechnician(machineryTypeOrName) {
    let workforce = JSON.parse(localStorage.getItem("iemrs_workforce")) || [];

    // 1. Filter out unavailable or on-leave technicians
    let availableTechs = [];
    for (let i = 0; i < workforce.length; i++) {
        let t = workforce[i];
        if (t.availability !== "Unavailable" && !t.workload.toLowerCase().includes("leave")) {
            availableTechs.push(t);
        }
    }

    if (availableTechs.length === 0) {
        return {
            technician: null,
            name: "",
            isFallback: false,
            message: "No available technicians found on roster."
        };
    }

    // 2. Identify relevant skill keywords for this machine
    let searchTarget = (machineryTypeOrName || "").toLowerCase();
    let targetKeywords = [];

    // Check pre-mapped machinery keys
    for (let key in SKILL_KEYWORD_MAP) {
        if (searchTarget.includes(key.toLowerCase()) || key.toLowerCase().includes(searchTarget)) {
            targetKeywords = targetKeywords.concat(SKILL_KEYWORD_MAP[key]);
        }
    }

    // Fallback search words from machine name if nothing mapped
    if (targetKeywords.length === 0) {
        targetKeywords = searchTarget.split(" ").filter(w => w.length > 3);
    }

    // 3. Find technicians with matching domain skills
    let skilledTechs = [];
    for (let j = 0; j < availableTechs.length; j++) {
        let tech = availableTechs[j];
        let techSkill = (tech.skill + " " + tech.certification).toLowerCase();
        let hasMatch = targetKeywords.some(keyword => techSkill.includes(keyword.toLowerCase()));
        if (hasMatch) {
            skilledTechs.push(tech);
        }
    }

    let candidatePool = skilledTechs.length > 0 ? skilledTechs : availableTechs;
    let isFallback = skilledTechs.length === 0;

    // 4. Select candidate with lowest active workload
    let bestTech = candidatePool[0];
    let lowestWorkload = calculateActiveWorkload(bestTech.name);

    for (let k = 1; k < candidatePool.length; k++) {
        let curTech = candidatePool[k];
        let curWorkload = calculateActiveWorkload(curTech.name);

        if (curWorkload < lowestWorkload) {
            bestTech = curTech;
            lowestWorkload = curWorkload;
        } else if (curWorkload === lowestWorkload) {
            // Prefer 'Available' over 'Busy'
            if (curTech.availability === "Available" && bestTech.availability !== "Available") {
                bestTech = curTech;
            }
        }
    }

    let message = isFallback
        ? "General assignment: " + bestTech.name + " (Lowest active workload: " + lowestWorkload + ")"
        : "Skill matched: " + bestTech.name + " (" + bestTech.skill + ", " + lowestWorkload + " active orders)";

    return {
        technician: bestTech,
        name: bestTech.name,
        isFallback: isFallback,
        workload: lowestWorkload,
        message: message
    };
}

// ==========================================================================
// Equipment Status Synchronization (Crucial Loop)
// In Progress or Waiting for Parts -> Machine becomes 'Maintenance'
// Completed -> Machine becomes 'Operational', lastMaintenance set to today
// ==========================================================================
function syncEquipmentStatusOnWorkOrder(equipmentName, newStatus, completedDate) {
    if (!equipmentName) return;
    let equipmentList = JSON.parse(localStorage.getItem("iemrs_equipment")) || [];
    let updated = false;

    for (let i = 0; i < equipmentList.length; i++) {
        let eq = equipmentList[i];
        if (eq.name.toLowerCase() === equipmentName.toLowerCase() || eq.id.toLowerCase() === equipmentName.toLowerCase()) {
            if (newStatus === "In Progress" || newStatus === "Waiting for Parts") {
                if (eq.status !== "Maintenance") {
                    eq.status = "Maintenance";
                    updated = true;
                }
            } else if (newStatus === "Completed") {
                eq.status = "Operational";
                eq.lastMaintenance = completedDate || new Date().toISOString().split("T")[0];
                updated = true;
            }
        }
    }

    if (updated) {
        localStorage.setItem("iemrs_equipment", JSON.stringify(equipmentList));
    }
}

// Show a temporary feedback alert banner
function showAlert(message, type = "success") {
    let container = document.getElementById("alertContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "alertContainer";
        document.body.appendChild(container);
    }

    let alertDiv = document.createElement("div");
    alertDiv.className = "custom-alert custom-alert-" + type;
    alertDiv.innerHTML = "<span>" + message + "</span><button type='button' class='btn-close btn-close-sm' aria-label='Close'></button>";

    let closeBtn = alertDiv.querySelector(".btn-close");
    closeBtn.addEventListener("click", function () {
        alertDiv.remove();
    });

    container.appendChild(alertDiv);

    setTimeout(function () {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 3500);
}

// ==========================================================================
// Legacy LocalStorage Migration Guard
// Ensures existing records map smoothly without undefined errors
// ==========================================================================
function migrateLegacyData() {
    // 1. Work Orders Migration
    let workorders = JSON.parse(localStorage.getItem("iemrs_workorders")) || [];
    let woChanged = false;

    for (let i = 0; i < workorders.length; i++) {
        let wo = workorders[i];
        // Map legacy "Open" status to "Scheduled"
        if (wo.status === "Open") {
            wo.status = "Scheduled";
            woChanged = true;
        }
        // Ensure new V3 properties exist safely
        if (wo.requiredPart === undefined) { wo.requiredPart = ""; woChanged = true; }
        if (wo.requiredQuantity === undefined) { wo.requiredQuantity = 0; woChanged = true; }
        if (wo.waitingReason === undefined) { wo.waitingReason = ""; woChanged = true; }
        if (wo.expectedResumeDate === undefined) { wo.expectedResumeDate = ""; woChanged = true; }
        if (wo.waitingNotes === undefined) { wo.waitingNotes = ""; woChanged = true; }
        if (wo.originalDate === undefined) { wo.originalDate = ""; woChanged = true; }
        if (wo.rescheduledDate === undefined) { wo.rescheduledDate = ""; woChanged = true; }
        if (wo.rescheduleReason === undefined) { wo.rescheduleReason = ""; woChanged = true; }
    }
    if (woChanged) {
        localStorage.setItem("iemrs_workorders", JSON.stringify(workorders));
    }

    // 2. Maintenance Migration
    let maintenance = JSON.parse(localStorage.getItem("iemrs_maintenance")) || [];
    let mnChanged = false;

    for (let j = 0; j < maintenance.length; j++) {
        let mn = maintenance[j];
        if (mn.originalDate === undefined) { mn.originalDate = ""; mnChanged = true; }
        if (mn.rescheduledDate === undefined) { mn.rescheduledDate = ""; mnChanged = true; }
        if (mn.rescheduleReason === undefined) { mn.rescheduleReason = ""; mnChanged = true; }
        if (mn.workOrderId === undefined) { mn.workOrderId = ""; mnChanged = true; }
    }
    if (mnChanged) {
        localStorage.setItem("iemrs_maintenance", JSON.stringify(maintenance));
    }
}

// ==========================================================================
// Seed realistic initial data in localStorage if not already present
// ==========================================================================
function initDefaultData() {
    // 1. Equipment Seed
    if (!localStorage.getItem("iemrs_equipment")) {
        let initialEquipment = [
            { id: "EQ001", name: "CNC Machine 01", type: "CNC Machine", location: "Production Floor", status: "Operational", lastMaintenance: "2026-09-10", nextMaintenance: "2026-09-24" },
            { id: "EQ002", name: "Hydraulic Press 02", type: "Hydraulic Press", location: "Workshop A", status: "Maintenance", lastMaintenance: "2026-09-05", nextMaintenance: "2026-09-26" },
            { id: "EQ003", name: "Compressor 04", type: "Compressor", location: "Utility Area", status: "Faulty", lastMaintenance: "2026-09-01", nextMaintenance: "2026-09-28" },
            { id: "EQ004", name: "Lathe Machine 03", type: "Lathe", location: "Production Floor", status: "Operational", lastMaintenance: "2026-09-12", nextMaintenance: "2026-09-30" },
            { id: "EQ005", name: "Industrial Pump 01", type: "Pump", location: "Cooling Plant", status: "Operational", lastMaintenance: "2026-08-28", nextMaintenance: "2026-10-05" },
            { id: "EQ006", name: "Conveyor Belt 02", type: "Conveyor", location: "Assembly Line 1", status: "Operational", lastMaintenance: "2026-09-15", nextMaintenance: "2026-10-02" },
            { id: "EQ007", name: "Generator Unit 01", type: "Generator", location: "Powerhouse", status: "Operational", lastMaintenance: "2026-08-20", nextMaintenance: "2026-10-12" }
        ];
        localStorage.setItem("iemrs_equipment", JSON.stringify(initialEquipment));
    }

    // 2. Maintenance Seed
    if (!localStorage.getItem("iemrs_maintenance")) {
        let initialMaintenance = [
            { id: "MN101", equipment: "CNC Machine 01", type: "Preventive", technician: "Rajesh Kumar", scheduledDate: "2026-09-24", status: "Scheduled", originalDate: "", rescheduledDate: "", rescheduleReason: "", workOrderId: "" },
            { id: "MN102", equipment: "Hydraulic Press 02", type: "Corrective", technician: "Sarah Jenkins", scheduledDate: "2026-09-22", status: "In Progress", originalDate: "", rescheduledDate: "", rescheduleReason: "", workOrderId: "WO-302" },
            { id: "MN103", equipment: "Compressor 04", type: "Corrective", technician: "Vikram Patel", scheduledDate: "2026-09-20", status: "In Progress", originalDate: "", rescheduledDate: "", rescheduleReason: "", workOrderId: "WO-301" },
            { id: "MN104", equipment: "Lathe Machine 03", type: "Preventive", technician: "David Chen", scheduledDate: "2026-09-30", status: "Scheduled", originalDate: "", rescheduledDate: "", rescheduleReason: "", workOrderId: "" },
            { id: "MN105", equipment: "Industrial Pump 01", type: "Preventive", technician: "Alex Morgan", scheduledDate: "2026-09-14", status: "Completed", originalDate: "", rescheduledDate: "", rescheduleReason: "", workOrderId: "WO-304" },
            { id: "MN106", equipment: "Conveyor Belt 02", type: "Preventive", technician: "Rajesh Kumar", scheduledDate: "2026-09-15", status: "Completed", originalDate: "", rescheduledDate: "", rescheduleReason: "", workOrderId: "WO-306" }
        ];
        localStorage.setItem("iemrs_maintenance", JSON.stringify(initialMaintenance));
    }

    // 3. Work Orders Seed
    if (!localStorage.getItem("iemrs_workorders")) {
        let initialOrders = [
            { id: "WO-301", equipment: "Compressor 04", problem: "Pressure drop below 120 bar and unusual vibration", technician: "Vikram Patel", priority: "High", date: "2026-09-20", status: "In Progress", requiredPart: "Deep Groove Ball Bearings 6205", requiredQuantity: 1, waitingReason: "", expectedResumeDate: "", waitingNotes: "", originalDate: "", rescheduledDate: "", rescheduleReason: "" },
            { id: "WO-302", equipment: "Hydraulic Press 02", problem: "Cylinder seal leakage and fluid temperature high", technician: "Sarah Jenkins", priority: "High", date: "2026-09-21", status: "Waiting for Parts", requiredPart: "Hydraulic Filter HF-90", requiredQuantity: 2, waitingReason: "Hydraulic seal kit unavailable in warehouse", expectedResumeDate: "2026-09-25", waitingNotes: "Supplier PO #884 dispatched", originalDate: "", rescheduledDate: "", rescheduleReason: "" },
            { id: "WO-303", equipment: "Lathe Machine 03", problem: "Tool holder alignment calibration required", technician: "David Chen", priority: "Medium", date: "2026-09-19", status: "Assigned", requiredPart: "", requiredQuantity: 0, waitingReason: "", expectedResumeDate: "", waitingNotes: "", originalDate: "", rescheduledDate: "", rescheduleReason: "" },
            { id: "WO-304", equipment: "Industrial Pump 01", problem: "Suction valve inspection and routine flush", technician: "Alex Morgan", priority: "Low", date: "2026-09-18", status: "Completed", requiredPart: "", requiredQuantity: 0, waitingReason: "", expectedResumeDate: "", waitingNotes: "", originalDate: "", rescheduledDate: "", rescheduleReason: "" },
            { id: "WO-305", equipment: "CNC Machine 01", problem: "Spindle bearing lubrication and chip tray cleaning", technician: "Rajesh Kumar", priority: "Medium", date: "2026-09-21", status: "Scheduled", requiredPart: "Machine Oil ISO VG 46", requiredQuantity: 1, waitingReason: "", expectedResumeDate: "", waitingNotes: "", originalDate: "", rescheduledDate: "", rescheduleReason: "" },
            { id: "WO-306", equipment: "Conveyor Belt 02", problem: "Belt tension adjustment on drive pulley", technician: "Rajesh Kumar", priority: "Low", date: "2026-09-15", status: "Completed", requiredPart: "Drive Belt V-B52", requiredQuantity: 1, waitingReason: "", expectedResumeDate: "", waitingNotes: "", originalDate: "", rescheduledDate: "", rescheduleReason: "" }
        ];
        localStorage.setItem("iemrs_workorders", JSON.stringify(initialOrders));
    }

    // 4. Workforce Seed
    if (!localStorage.getItem("iemrs_workforce")) {
        let initialWorkforce = [
            { id: "TECH-01", name: "Rajesh Kumar", skill: "CNC Mechanics & Milling", certification: "ISO-9001 Safety / Master Tech", availability: "Available", workload: "0 Active Orders" },
            { id: "TECH-02", name: "Sarah Jenkins", skill: "Hydraulic & Fluid Power", certification: "CMRP (Certified Maintenance)", availability: "Available", workload: "0 Active Orders" },
            { id: "TECH-03", name: "Vikram Patel", skill: "Pneumatics & Compressors", certification: "Level 2 Vibration Analyst", availability: "Busy", workload: "1 Active Order" },
            { id: "TECH-04", name: "David Chen", skill: "Electrical Systems & PLC", certification: "Certified Automation Professional", availability: "Busy", workload: "1 Active Order" },
            { id: "TECH-05", name: "Alex Morgan", skill: "Pumps & Industrial Piping", certification: "Industrial Safety Standards", availability: "Available", workload: "0 Active Orders" },
            { id: "TECH-06", name: "Priya Sharma", skill: "Predictive Analytics & Sensors", certification: "IIoT Maintenance Specialist", availability: "Unavailable", workload: "On Training Leave" }
        ];
        localStorage.setItem("iemrs_workforce", JSON.stringify(initialWorkforce));
    }

    // 5. Inventory Seed
    if (!localStorage.getItem("iemrs_inventory")) {
        let initialInventory = [
            { id: "PRT-101", name: "Hydraulic Filter HF-90", category: "Filters", quantity: 3, minStock: 5, supplier: "Bosch Rexroth" },
            { id: "PRT-102", name: "Machine Oil ISO VG 46", category: "Lubricants", quantity: 5, minStock: 10, supplier: "Shell Industrial" },
            { id: "PRT-103", name: "Deep Groove Ball Bearings 6205", category: "Bearings", quantity: 4, minStock: 8, supplier: "SKF Bearings" },
            { id: "PRT-104", name: "Drive Belt V-B52", category: "Mechanical", quantity: 18, minStock: 6, supplier: "Gates Corporation" },
            { id: "PRT-105", name: "Pressure Relief Valve 200B", category: "Mechanical", quantity: 12, minStock: 4, supplier: "Parker Hannifin" },
            { id: "PRT-106", name: "Contactor Relay 24V DC", category: "Electrical", quantity: 25, minStock: 5, supplier: "Siemens Industrial" }
        ];
        localStorage.setItem("iemrs_inventory", JSON.stringify(initialInventory));
    }

    // 6. Recent Activity Log Seed
    if (!localStorage.getItem("iemrs_activities")) {
        let initialActivities = [
            { time: "10 mins ago", item: "Hydraulic Press 02", activity: "WO-302 put on hold (Waiting for Parts: Hydraulic Filter HF-90)", user: "Sarah Jenkins", badge: "badge-waiting" },
            { time: "45 mins ago", item: "Hydraulic Filter HF-90", activity: "Stock level fell below minimum threshold (3 left)", user: "System Monitor", badge: "badge-faulty" },
            { time: "2 hours ago", item: "WO-301 Compressor", activity: "Work order started (In Progress)", user: "Vikram Patel", badge: "badge-in-progress" },
            { time: "4 hours ago", item: "Industrial Pump 01", activity: "Preventive maintenance completed successfully", user: "Alex Morgan", badge: "badge-completed" },
            { time: "1 day ago", item: "Conveyor Belt 02", activity: "Work order WO-306 closed", user: "Rajesh Kumar", badge: "badge-completed" }
        ];
        localStorage.setItem("iemrs_activities", JSON.stringify(initialActivities));
    }
}

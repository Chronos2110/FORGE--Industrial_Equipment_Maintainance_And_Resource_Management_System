// ==========================================================================
// FORGE Milestone 11 - Full-Stack Hybrid API Bridge (js/api.js)
// Transparently connects frontend pages to the Node.js Express & MongoDB
// (Mongoose) backend while maintaining resilient offline localStorage caching.
// ==========================================================================

var FORGE_API = (function () {
    var BASE_URL = (window.location.protocol === "http:" || window.location.protocol === "https:")
        ? window.location.origin
        : "http://localhost:5000";

    function getToken() {
        return sessionStorage.getItem("forge_token") || localStorage.getItem("forge_token") || null;
    }

    function setToken(token) {
        if (token) {
            sessionStorage.setItem("forge_token", token);
            localStorage.setItem("forge_token", token);
        } else {
            sessionStorage.removeItem("forge_token");
            localStorage.removeItem("forge_token");
        }
    }

    function getHeaders() {
        var headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        };
        var token = getToken();
        if (token) {
            headers["Authorization"] = "Bearer " + token;
        }
        return headers;
    }

    async function request(method, path, body) {
        try {
            var opts = {
                method: method,
                headers: getHeaders(),
                credentials: "include"
            };
            if (body && (method === "POST" || method === "PATCH" || method === "PUT")) {
                opts.body = JSON.stringify(body);
            }
            var res = await fetch(BASE_URL + path, opts);
            if (res.status === 401) {
                console.warn("[FORGE API] 401 Unauthorized: " + path);
                return null;
            }
            if (!res.ok) {
                var errData = await res.json().catch(function () { return {}; });
                console.warn("[FORGE API] " + method + " " + path + " -> " + res.status, errData.error || "");
                return null;
            }
            return await res.json();
        } catch (err) {
            console.warn("[FORGE API] Server offline or unreachable (" + err.message + "). Fallback to local cache.");
            return null;
        }
    }

    // Health check
    async function checkHealth() {
        try {
            var res = await fetch(BASE_URL + "/api/health", { method: "GET" });
            if (res.ok) {
                var data = await res.json();
                return data && data.status === "ONLINE";
            }
        } catch (e) {}
        return false;
    }

    // Full database hydration into localStorage
    async function hydrateAll() {
        var token = getToken();
        if (!token) return false;

        var [equipment, workorders, maintenance, inventory, faults, activities] = await Promise.all([
            request("GET", "/api/equipment"),
            request("GET", "/api/work-orders"),
            request("GET", "/api/maintenance"),
            request("GET", "/api/inventory"),
            request("GET", "/api/faults"),
            request("GET", "/api/activity")
        ]);

        if (equipment && Array.isArray(equipment)) {
            var mappedEq = equipment.map(function (eq) {
                var s = (eq.status || "").toUpperCase();
                var statusLabel = (s === "MAINTENANCE" || s === "WARNING") ? "Maintenance" : (s === "DOWN" ? "Faulty" : "Operational");
                return {
                    id: eq.id,
                    name: eq.name,
                    type: eq.category || eq.type || "Industrial Asset",
                    category: eq.category || eq.type || "Industrial Asset",
                    location: eq.bay_location || eq.location || "Bay 01",
                    bay_location: eq.bay_location || eq.location || "Bay 01",
                    status: statusLabel,
                    health: eq.health_score !== undefined ? eq.health_score : 100,
                    health_score: eq.health_score !== undefined ? eq.health_score : 100,
                    lastMaintenance: eq.last_serviced_at ? String(eq.last_serviced_at).split("T")[0] : "",
                    lastMaintenanceDate: eq.last_serviced_at ? String(eq.last_serviced_at).split("T")[0] : "",
                    assignedTechnician: "Rajesh Kumar",
                    operatingHours: 1200
                };
            });
            localStorage.setItem("forge_equipment", JSON.stringify(mappedEq));
            localStorage.setItem("iemrs_equipment", JSON.stringify(mappedEq));
        }

        if (workorders && Array.isArray(workorders)) {
            var mappedWo = workorders.map(function (wo) {
                var s = (wo.status || "").toUpperCase().replace(/\s+/g, "_");
                var statusLabel = (s === "WAITING_FOR_PARTS") ? "Waiting for Parts" :
                    ((s === "OPEN" || s === "SCHEDULED") ? "Scheduled" :
                    ((s === "ASSIGNED") ? "Assigned" :
                    ((s === "IN_PROGRESS") ? "In Progress" :
                    ((s === "COMPLETED") ? "Completed" : "Pending"))));
                var p = (wo.priority || "").toUpperCase();
                var prioLabel = (p === "CRITICAL" || p === "HIGH") ? "High" : ((p === "LOW") ? "Low" : "Medium");
                var partItem = wo.parts_required && wo.parts_required.length > 0 ? wo.parts_required[0] : null;

                return {
                    id: wo.id,
                    equipment: (wo.equipment && wo.equipment.name) ? wo.equipment.name : (wo.equipment || wo.equipmentId || "EQ001"),
                    equipmentId: wo.equipment_id || wo.equipmentId || "EQ001",
                    problem: wo.description || wo.title || wo.problem || "",
                    description: wo.description || wo.title || wo.problem || "",
                    priority: prioLabel,
                    status: statusLabel,
                    technician: (wo.technician && wo.technician.name) ? wo.technician.name : (wo.technician || "Unassigned"),
                    technicianId: wo.assigned_to || wo.technicianId || "",
                    date: wo.created_at ? String(wo.created_at).split("T")[0] : (wo.date || ""),
                    scheduledDate: wo.created_at ? String(wo.created_at).split("T")[0] : (wo.scheduledDate || ""),
                    requiredPart: (partItem && partItem.part) ? partItem.part.name : (wo.requiredPart || "Hydraulic Filter HF-90"),
                    requiredPartId: partItem ? partItem.part_id : (wo.requiredPartId || "PRT-101"),
                    requiredQuantity: partItem ? partItem.quantity_required : (wo.requiredQuantity || 1),
                    notes: ""
                };
            });
            localStorage.setItem("forge_workorders", JSON.stringify(mappedWo));
            localStorage.setItem("iemrs_workorders", JSON.stringify(mappedWo));
        }

        if (maintenance && Array.isArray(maintenance)) {
            var mappedPm = maintenance.map(function (m) {
                var s = (m.compliance_status || m.status || "").toUpperCase();
                var statusLabel = (s === "COMPLETED") ? "Completed" : ((s === "OVERDUE") ? "Overdue" : "Scheduled");
                return {
                    id: m.id,
                    equipment: (m.equipment && m.equipment.name) ? m.equipment.name : (m.equipment || m.equipmentId || "EQ001"),
                    equipmentId: m.equipment_id || m.equipmentId || "EQ001",
                    type: m.task_name || m.type || "Routine PM",
                    task_name: m.task_name || m.type || "Routine PM",
                    scheduledDate: m.next_due_date ? String(m.next_due_date).split("T")[0] : (m.scheduledDate || ""),
                    frequency_days: m.frequency_days || 30,
                    technician: (m.assigned_tech && m.assigned_tech.name) ? m.assigned_tech.name : (m.technician || "Unassigned"),
                    technicianId: m.assigned_tech_id || m.technicianId || "",
                    status: statusLabel,
                    compliance_status: s
                };
            });
            localStorage.setItem("forge_maintenance", JSON.stringify(mappedPm));
            localStorage.setItem("iemrs_maintenance", JSON.stringify(mappedPm));
        }

        if (inventory && Array.isArray(inventory)) {
            var mappedInv = inventory.map(function (p) {
                return {
                    id: p.id,
                    partName: p.name || p.partName || "Spare Part",
                    name: p.name || p.partName || "Spare Part",
                    category: p.category || "General",
                    quantity: p.quantity_on_hand !== undefined ? p.quantity_on_hand : (p.quantity || 0),
                    quantity_on_hand: p.quantity_on_hand !== undefined ? p.quantity_on_hand : (p.quantity || 0),
                    minimumStock: p.min_threshold !== undefined ? p.min_threshold : (p.minimumStock || 5),
                    minStock: p.min_threshold !== undefined ? p.min_threshold : (p.minStock || 5),
                    min_threshold: p.min_threshold !== undefined ? p.min_threshold : (p.minStock || 5),
                    unit_cost: p.unit_cost !== undefined ? p.unit_cost : 50.0,
                    storage_bin: p.storage_bin || "Bin A-01",
                    supplier: p.supplier || "Industrial OEM Supply"
                };
            });
            localStorage.setItem("forge_inventory", JSON.stringify(mappedInv));
            localStorage.setItem("iemrs_inventory", JSON.stringify(mappedInv));
        }

        // Workforce (skip if Operator)
        var role = (sessionStorage.getItem("forge_role") || "").toLowerCase();
        if (role !== "operator") {
            var workforce = await request("GET", "/api/workforce");
            if (workforce && Array.isArray(workforce)) {
                var mappedWf = workforce.map(function (t) {
                    var prof = t.technician_profile || {};
                    var avail = "Available";
                    if (t.status === "OFF_SHIFT") avail = "Unavailable";
                    else if (t.availability === "On Break") avail = "On Break";
                    else avail = "Available";

                    return {
                        id: t.id,
                        name: t.name,
                        email: t.email || "",
                        role: "Technician",
                        bay: t.bay_assignment || "Bay 01",
                        specialization: prof.specialization || t.specialization || "Mechanical",
                        skill: prof.specialization || t.specialization || "Mechanical",
                        certifications: "ISO-9001 Safety / Master Tech",
                        certification: "ISO-9001 Safety / Master Tech",
                        availability: avail,
                        activeWorkload: prof.active_wo_count || t.activeWorkload || 0,
                        workload: (prof.active_wo_count || t.activeWorkload || 0) + " Active Orders"
                    };
                });
                localStorage.setItem("forge_technicians", JSON.stringify(mappedWf));
                localStorage.setItem("iemrs_workforce", JSON.stringify(mappedWf));
            }
        }

        if (faults && Array.isArray(faults)) {
            var mappedFlt = faults.map(function (f) {
                return {
                    id: f.id,
                    equipmentId: f.equipment_id || f.equipmentId || "",
                    equipment: (f.equipment && f.equipment.name) ? f.equipment.name : (f.equipmentName || f.equipment || ""),
                    equipmentName: (f.equipment && f.equipment.name) ? f.equipment.name : (f.equipmentName || f.equipment || ""),
                    reportedBy: (f.reporter && f.reporter.name) ? f.reporter.name : (f.reportedBy || "Operator"),
                    priority: (f.severity === "CRITICAL" || f.severity === "HIGH") ? "High" : ((f.severity === "LOW") ? "Low" : "Medium"),
                    severity: f.severity || "MEDIUM",
                    description: f.description || "",
                    status: f.status === "CONVERTED_TO_WO" ? "Converted to WO" : (f.status === "REPORTED" ? "Open" : (f.status || "Open")),
                    workOrderId: f.linked_wo_id || f.workOrderId || "",
                    createdAt: f.created_at || f.createdAt || new Date().toISOString()
                };
            });
            localStorage.setItem("forge_faults", JSON.stringify(mappedFlt));
        }

        if (activities && Array.isArray(activities)) {
            var mappedAct = activities.map(function (a) {
                return {
                    id: a.id,
                    timestamp: a.timestamp || a.time || new Date().toISOString(),
                    time: a.time || (a.timestamp ? String(a.timestamp).replace("T", " ").substring(0, 19) : ""),
                    actor: a.actor || a.user || "System",
                    user: a.actor || a.user || "System",
                    role: a.role || "SYSTEM",
                    action: a.action || a.activity || "",
                    activity: a.action || a.activity || "",
                    target: a.target || a.item || "",
                    item: a.target || a.item || "",
                    category: a.category || "SYSTEM",
                    badge_class: a.badge_class || a.statusClass || "badge-operational",
                    statusClass: a.badge_class || a.statusClass || "badge-operational"
                };
            });
            localStorage.setItem("forge_activity", JSON.stringify(mappedAct));
            localStorage.setItem("iemrs_activities", JSON.stringify(mappedAct));
        }

        return true;
    }

    return {
        checkHealth: checkHealth,
        hydrateAll: hydrateAll,
        getToken: getToken,
        setToken: setToken,
        request: request,

        // Write Operations
        createWorkOrder: async function (payload) {
            var res = await request("POST", "/api/work-orders", payload);
            if (res) await hydrateAll();
            return res;
        },

        updateWorkOrderStatus: async function (woId, newStatus) {
            var statusMap = {
                "Scheduled": "OPEN",
                "Pending": "OPEN",
                "Assigned": "ASSIGNED",
                "In Progress": "IN_PROGRESS",
                "Waiting for Parts": "WAITING_FOR_PARTS",
                "Completed": "COMPLETED",
                "Cancelled": "CANCELLED"
            };
            var apiStatus = statusMap[newStatus] || newStatus;
            var res = await request("PATCH", "/api/work-orders/" + encodeURIComponent(woId) + "/status", { status: apiStatus });
            if (res) await hydrateAll();
            return res;
        },

        autoAssign: async function (woId) {
            var res = await request("POST", "/api/work-orders/" + encodeURIComponent(woId) + "/auto-assign");
            if (res) await hydrateAll();
            return res;
        },

        reportFault: async function (payload) {
            var res = await request("POST", "/api/faults", payload);
            if (res) await hydrateAll();
            return res;
        },

        escalateFault: async function (faultId) {
            var res = await request("POST", "/api/faults/" + encodeURIComponent(faultId) + "/escalate");
            if (res) await hydrateAll();
            return res;
        },

        completeMaintenance: async function (pmId) {
            var res = await request("PATCH", "/api/maintenance/" + encodeURIComponent(pmId), { status: "COMPLETED" });
            if (res) await hydrateAll();
            return res;
        },

        updateTechnicianAvailability: async function (techId, status, availability) {
            var res = await request("PATCH", "/api/workforce/" + encodeURIComponent(techId) + "/availability", {
                status: status,
                availability: availability
            });
            if (res) await hydrateAll();
            return res;
        },

        getDockTelemetry: async function () {
            return await request("GET", "/api/telemetry/dock");
        },

        getAnalytics: async function () {
            return await request("GET", "/api/analytics/summary");
        },

        searchAll: async function (query) {
            return await request("GET", "/api/search?q=" + encodeURIComponent(query));
        }
    };
})();

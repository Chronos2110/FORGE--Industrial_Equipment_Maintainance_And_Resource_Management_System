// ==========================================================================
// FORGE V4 - Backend API Bridge (js/api.js)
// Transparently hydrates localStorage from the backend REST API on load,
// so ALL existing page scripts (dashboard.js, workorders.js, etc.) continue
// to work unchanged while real data comes from the SQLite database.
// ==========================================================================

const FORGE_API = (function () {
    const BASE_URL = window.location.origin;

    function getToken() {
        return sessionStorage.getItem("forge_token") || null;
    }

    function getHeaders() {
        const headers = { "Content-Type": "application/json" };
        const token = getToken();
        if (token) {
            headers["Authorization"] = "Bearer " + token;
        }
        return headers;
    }

    async function request(method, path, body) {
        try {
            const opts = {
                method: method,
                headers: getHeaders(),
                credentials: "include"
            };
            if (body) {
                opts.body = JSON.stringify(body);
            }
            const res = await fetch(BASE_URL + path, opts);
            if (res.status === 401) {
                // Token expired — clear session and redirect to login
                sessionStorage.clear();
                window.location.href = "../login.html";
                return null;
            }
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.warn("[FORGE API] " + method + " " + path + " -> " + res.status, err.error || "");
                return null;
            }
            return await res.json();
        } catch (err) {
            console.warn("[FORGE API] Server offline. Falling back to localStorage.", err.message);
            return null;
        }
    }

    // Convert API equipment status to frontend status labels
    function mapEquipmentStatus(status) {
        const map = {
            "OPERATIONAL": "Operational",
            "MAINTENANCE": "Maintenance",
            "WARNING": "Maintenance",
            "DOWN": "Faulty"
        };
        return map[status] || status;
    }

    // Convert API work order status to frontend status labels
    function mapWOStatus(status) {
        const map = {
            "OPEN": "Scheduled",
            "ASSIGNED": "Assigned",
            "IN_PROGRESS": "In Progress",
            "WAITING_FOR_PARTS": "Waiting for Parts",
            "COMPLETED": "Completed",
            "CANCELLED": "Cancelled"
        };
        return map[status] || status;
    }

    // Convert API priority to frontend labels
    function mapPriority(priority) {
        const map = {
            "CRITICAL": "High",
            "HIGH": "High",
            "MEDIUM": "Medium",
            "LOW": "Low"
        };
        return map[priority] || priority;
    }

    // Convert frontend priority to API priority
    function reversePriority(priority) {
        const map = {
            "High": "HIGH",
            "Medium": "MEDIUM",
            "Low": "LOW",
            "Critical": "CRITICAL"
        };
        return map[priority] || priority;
    }

    // ==================================================================
    // HYDRATION: Fetch all data from backend → populate localStorage
    // Called once on page load by initAPIBridge()
    // ==================================================================
    async function hydrateAll() {
        const token = getToken();
        if (!token) return false; // Not authenticated — let common.js handle login redirect

        const [equipment, workorders, maintenance, inventory, workforce, faults] = await Promise.all([
            request("GET", "/api/equipment"),
            request("GET", "/api/work-orders"),
            request("GET", "/api/maintenance"),
            request("GET", "/api/inventory"),
            request("GET", "/api/workforce"),
            request("GET", "/api/faults")
        ]);

        // Map and store Equipment
        if (equipment) {
            const mapped = equipment.map(eq => ({
                id: eq.id,
                name: eq.name,
                type: eq.category || eq.type || "Machinery",
                location: eq.bay_location || eq.location || "Plant Floor",
                status: mapEquipmentStatus(eq.status),
                lastMaintenanceDate: eq.lastMaintenanceDate || eq.last_serviced_at ? String(eq.lastMaintenanceDate || eq.last_serviced_at || "").split("T")[0] : "",
                lastMaintenance: eq.lastMaintenanceDate || "",
                nextMaintenance: "",
                health_score: eq.health_score || 100
            }));
            localStorage.setItem("forge_equipment", JSON.stringify(mapped));
            localStorage.setItem("iemrs_equipment", JSON.stringify(mapped));
        }

        // Map and store Work Orders
        if (workorders) {
            const mapped = workorders.map(wo => ({
                id: wo.id,
                equipment: wo.equipment || wo.equipmentId || "",
                equipmentId: wo.equipmentId || "",
                problem: wo.problem || wo.description || wo.title || "",
                description: wo.description || wo.problem || wo.title || "",
                technician: wo.technician || wo.technicianId || "Unassigned",
                technicianId: wo.technicianId || "",
                priority: mapPriority(wo.priority),
                date: wo.date || wo.scheduledDate || "",
                scheduledDate: wo.scheduledDate || wo.date || "",
                status: mapWOStatus(wo.status),
                requiredPart: wo.requiredPart || "",
                requiredPartId: wo.requiredPartId || "",
                requiredQuantity: wo.requiredQuantity || 0,
                waitingReason: wo.waitingReason || "",
                expectedResumeDate: wo.expectedResumeDate || "",
                waitingNotes: wo.waitingNotes || "",
                originalDate: wo.date || "",
                rescheduledDate: "",
                rescheduleReason: "",
                faultId: wo.faultId || "",
                notes: wo.notes || ""
            }));
            localStorage.setItem("forge_workorders", JSON.stringify(mapped));
            localStorage.setItem("iemrs_workorders", JSON.stringify(mapped));
        }

        // Map and store Maintenance Schedules
        if (maintenance) {
            const mapped = maintenance.map(m => ({
                id: m.id,
                equipment: m.equipment || m.equipmentId || "",
                equipmentId: m.equipmentId || "",
                technician: m.technician || m.technicianId || "Unassigned",
                technicianId: m.technicianId || "",
                type: m.type || m.task_name || "Preventive",
                scheduledDate: m.scheduledDate || m.next_due_date ? String(m.scheduledDate || m.next_due_date || "").split("T")[0] : "",
                status: m.status || "Scheduled",
                originalDate: "",
                rescheduledDate: "",
                rescheduleReason: "",
                workOrderId: "",
                notes: ""
            }));
            localStorage.setItem("forge_maintenance", JSON.stringify(mapped));
            localStorage.setItem("iemrs_maintenance", JSON.stringify(mapped));
        }

        // Map and store Inventory Parts
        if (inventory) {
            const mapped = inventory.map(p => ({
                id: p.id,
                partName: p.name || p.partName || "",
                name: p.name || p.partName || "",
                category: p.category || "General",
                quantity: p.quantity_on_hand !== undefined ? p.quantity_on_hand : (p.quantity || 0),
                minimumStock: p.min_threshold || p.minimumStock || 5,
                minStock: p.min_threshold || p.minimumStock || 5,
                supplier: p.supplier || "Industrial OEM Supply",
                unit_cost: p.unit_cost || 0,
                storage_bin: p.storage_bin || ""
            }));
            localStorage.setItem("forge_inventory", JSON.stringify(mapped));
            localStorage.setItem("iemrs_inventory", JSON.stringify(mapped));
        }

        // Map and store Workforce / Technicians
        if (workforce) {
            const mapped = workforce.map(t => ({
                id: t.id,
                name: t.name || "",
                specialization: t.specialization || t.skill || "General",
                skill: t.specialization || t.skill || "General",
                certifications: t.certifications || "ISO-9001 Safety",
                certification: t.certifications || "ISO-9001 Safety",
                availability: t.availability || (t.status === "ACTIVE" ? "Available" : "Unavailable"),
                activeWorkload: t.active_wo_count || t.activeWorkload || 0,
                workload: (t.active_wo_count || t.activeWorkload || 0) + " Active Orders"
            }));
            localStorage.setItem("forge_technicians", JSON.stringify(mapped));
            localStorage.setItem("iemrs_workforce", JSON.stringify(mapped));
        }

        // Map and store Faults
        if (faults) {
            const mapped = faults.map(f => ({
                id: f.id,
                equipmentId: f.equipmentId || "",
                equipmentName: f.equipmentName || f.equipment || "",
                reportedBy: f.reportedBy || "Operator",
                description: f.description || "",
                priority: f.priority || "Medium",
                status: f.status || "Open",
                createdAt: f.createdAt || f.created_at || new Date().toISOString(),
                workOrderId: f.workOrderId || ""
            }));
            localStorage.setItem("forge_faults", JSON.stringify(mapped));
        }

        return true;
    }

    // ==================================================================
    // WRITE HELPERS — for use by page scripts to call backend directly
    // These also keep localStorage in sync after writes
    // ==================================================================

    async function createWorkOrder(payload) {
        // Map frontend status strings to backend enums
        const apiPayload = Object.assign({}, payload, {
            priority: reversePriority(payload.priority),
            status: reverseStatus(payload.status)
        });
        const result = await request("POST", "/api/work-orders", apiPayload);
        if (result) {
            await hydrateWorkOrders();
        }
        return result;
    }

    async function updateWorkOrderStatus(woId, newStatus) {
        // Map frontend status to API status
        const reverseStatusMap = {
            "Scheduled": "OPEN",
            "Assigned": "ASSIGNED",
            "In Progress": "IN_PROGRESS",
            "Waiting for Parts": "WAITING_FOR_PARTS",
            "Completed": "COMPLETED",
            "Cancelled": "CANCELLED"
        };
        const apiStatus = reverseStatusMap[newStatus] || newStatus;
        const result = await request("PATCH", "/api/work-orders/" + woId + "/status", { status: apiStatus });
        if (result) {
            await hydrateAll();
        }
        return result;
    }

    async function autoAssign(woId) {
        const result = await request("POST", "/api/work-orders/" + woId + "/auto-assign");
        if (result) {
            await hydrateAll();
        }
        return result;
    }

    async function reportFault(payload) {
        const result = await request("POST", "/api/faults", payload);
        if (result) {
            await hydrateAll();
        }
        return result;
    }

    async function hydrateWorkOrders() {
        const workorders = await request("GET", "/api/work-orders");
        if (workorders) {
            const mapped = workorders.map(wo => ({
                id: wo.id,
                equipment: wo.equipment || wo.equipmentId || "",
                equipmentId: wo.equipmentId || "",
                problem: wo.problem || wo.description || wo.title || "",
                description: wo.description || wo.problem || wo.title || "",
                technician: wo.technician || wo.technicianId || "Unassigned",
                technicianId: wo.technicianId || "",
                priority: mapPriority(wo.priority),
                date: wo.date || wo.scheduledDate || "",
                scheduledDate: wo.scheduledDate || wo.date || "",
                status: mapWOStatus(wo.status),
                requiredPart: wo.requiredPart || "",
                requiredPartId: wo.requiredPartId || "",
                requiredQuantity: wo.requiredQuantity || 0,
                waitingReason: wo.waitingReason || "",
                expectedResumeDate: wo.expectedResumeDate || "",
                waitingNotes: wo.waitingNotes || "",
                originalDate: wo.date || "",
                rescheduledDate: "",
                rescheduleReason: "",
                faultId: "",
                notes: ""
            }));
            localStorage.setItem("forge_workorders", JSON.stringify(mapped));
            localStorage.setItem("iemrs_workorders", JSON.stringify(mapped));
        }
    }

    function reverseStatus(status) {
        const map = {
            "Scheduled": "OPEN",
            "Assigned": "ASSIGNED",
            "In Progress": "IN_PROGRESS",
            "Waiting for Parts": "WAITING_FOR_PARTS",
            "Completed": "COMPLETED",
            "Cancelled": "CANCELLED"
        };
        return map[status] || status;
    }

    async function getDockTelemetry() {
        return await request("GET", "/api/telemetry/dock");
    }

    async function searchAll(query) {
        return await request("GET", "/api/search?q=" + encodeURIComponent(query));
    }

    async function getAnalytics() {
        return await request("GET", "/api/analytics/summary");
    }

    // ==================================================================
    // INIT: Called from each page HTML before page-specific scripts run
    // ==================================================================
    async function initAPIBridge() {
        const token = getToken();
        if (!token) return; // Not logged in yet — login page handles this

        const success = await hydrateAll();
        if (success) {
            console.log("[FORGE API] Live data hydrated from backend ✓");
        }
    }

    // Expose public API
    return {
        init: initAPIBridge,
        hydrateAll: hydrateAll,
        createWorkOrder: createWorkOrder,
        updateWorkOrderStatus: updateWorkOrderStatus,
        autoAssign: autoAssign,
        reportFault: reportFault,
        getDockTelemetry: getDockTelemetry,
        searchAll: searchAll,
        getAnalytics: getAnalytics,
        request: request,
        getToken: getToken
    };
})();

// Auto-init when DOM is ready
document.addEventListener("DOMContentLoaded", function () {
    FORGE_API.init().catch(function (err) {
        console.warn("[FORGE API] Hydration skipped (fallback to localStorage):", err.message);
    });
});

// ==========================================================================
// FORGE - Maintenance Management JavaScript (js/maintenance.js)
// Lifecycle: Scheduled -> Assigned -> In Progress -> Waiting for Parts -> Completed / Cancelled
// Auto-Assign, Equipment Sync, Work Order Generation & Rescheduling
// ==========================================================================

let maintenanceList = [];
let maintenanceModalInstance = null;
let maintRescheduleModalInstance = null;

document.addEventListener("DOMContentLoaded", function () {
    // 1. Initialize modal instances
    let modalElement = document.getElementById("maintenanceModal");
    maintenanceModalInstance = new bootstrap.Modal(modalElement);

    let reschedEl = document.getElementById("rescheduleModal");
    maintRescheduleModalInstance = new bootstrap.Modal(reschedEl);

    // 2. Load data from localStorage
    loadMaintenanceData();

    // 3. Bind search and filter events
    document.getElementById("searchInput").addEventListener("input", filterAndRenderTable);
    document.getElementById("typeFilter").addEventListener("change", filterAndRenderTable);
    document.getElementById("statusFilter").addEventListener("change", filterAndRenderTable);

    // 4. Bind Add button
    document.getElementById("addNewMaintBtn").addEventListener("click", resetForm);

    // 5. Bind form submit
    document.getElementById("maintenanceForm").addEventListener("submit", handleFormSubmit);

    // 6. Reschedule form submit
    document.getElementById("rescheduleForm").addEventListener("submit", handleRescheduleSubmit);

    // 7. Auto-Assign button is wired via inline onclick on the HTML button
});

// Load records from localStorage
function loadMaintenanceData() {
    let saved = localStorage.getItem("forge_maintenance") || localStorage.getItem("iemrs_maintenance");
    if (saved) {
        maintenanceList = JSON.parse(saved);
    } else {
        maintenanceList = [];
    }
    filterAndRenderTable();
    updateKpiCards();
    populateFormDropdowns();
}

// Update summary metric cards
function updateKpiCards() {
    let total = maintenanceList.length;
    let scheduled = 0;
    let inProgress = 0;
    let completed = 0;

    for (let i = 0; i < maintenanceList.length; i++) {
        let st = maintenanceList[i].status;
        if (st === "Scheduled" || st === "Assigned") scheduled++;
        else if (st === "In Progress" || st === "Waiting for Parts") inProgress++;
        else if (st === "Completed") completed++;
    }

    document.getElementById("kpiTotalMaint").textContent = total;
    document.getElementById("kpiScheduled").textContent = scheduled;
    document.getElementById("kpiInProgress").textContent = inProgress;
    document.getElementById("kpiCompleted").textContent = completed;
}

// Populate Equipment & Technician dropdowns
function populateFormDropdowns() {
    let equipmentList = JSON.parse(localStorage.getItem("forge_equipment") || localStorage.getItem("iemrs_equipment")) || [];
    let eqSelect = document.getElementById("maintEquipment");
    if (eqSelect) {
        eqSelect.innerHTML = '<option value="">-- Select Target Equipment --</option>';
        equipmentList.forEach(function (eq) {
            let opt = document.createElement("option");
            opt.value = eq.name;
            opt.textContent = eq.name + " (" + eq.type + " - " + eq.location + ")";
            opt.dataset.type = eq.type;
            eqSelect.appendChild(opt);
        });
    }

    let workforce = JSON.parse(localStorage.getItem("forge_technicians") || localStorage.getItem("iemrs_workforce")) || [];
    let techSelect = document.getElementById("maintTechnician");
    if (techSelect) {
        techSelect.innerHTML = '<option value="">-- Select or Auto-Assign Technician --</option>';
        workforce.forEach(function (t) {
            let activeOrders = calculateActiveWorkload(t.name);
            let opt = document.createElement("option");
            opt.value = t.name;
            opt.textContent = t.name + " [" + t.skill + "] (" + activeOrders + " Active Orders)";
            techSelect.appendChild(opt);
        });
    }
}

// Trigger Auto-Assign via explainable algorithm
function triggerAutoAssign() {
    let eqSelect = document.getElementById("maintEquipment");
    let selectedEqName = eqSelect.value;
    let selectedOption = eqSelect.options[eqSelect.selectedIndex];
    let eqType = selectedOption ? selectedOption.dataset.type : "";

    let result = autoAssignTechnician(eqType || selectedEqName);
    let feedback = document.getElementById("maintAutoAssignFeedback");

    if (result.technician) {
        document.getElementById("maintTechnician").value = result.name;
        feedback.textContent = "⚡ " + result.message;
        feedback.className = "text-success d-block mt-1 font-weight-bold";
        showAlert("Assigned to " + result.name + " based on workload and skills.", "info");
    } else {
        feedback.textContent = "⚠️ " + result.message;
        feedback.className = "text-danger d-block mt-1";
    }
}

// Filter and render table rows
function filterAndRenderTable() {
    let query = document.getElementById("searchInput").value.toLowerCase().trim();
    let typeVal = document.getElementById("typeFilter").value;
    let statusVal = document.getElementById("statusFilter").value;
    let tbody = document.getElementById("maintenanceTableBody");
    let emptyState = document.getElementById("maintenanceEmptyState");

    tbody.innerHTML = "";

    let filtered = [];

    for (let i = 0; i < maintenanceList.length; i++) {
        let item = maintenanceList[i];
        let matchesQuery =
            item.id.toLowerCase().includes(query) ||
            item.equipment.toLowerCase().includes(query) ||
            item.technician.toLowerCase().includes(query);

        let matchesType = (typeVal === "All") || (item.type === typeVal);
        let matchesStatus = (statusVal === "All") || (item.status === statusVal);

        if (matchesQuery && matchesType && matchesStatus) {
            filtered.push(item);
        }
    }

    document.getElementById("recordsCount").textContent = filtered.length + " Records";

    if (filtered.length === 0) {
        emptyState.classList.remove("d-none");
        return;
    }

    emptyState.classList.add("d-none");

    for (let j = 0; j < filtered.length; j++) {
        let m = filtered[j];
        let tr = document.createElement("tr");

        let typeBadgeClass = m.type === "Preventive" ? "badge-preventive" : "badge-corrective";

        let statusBadgeClass = "badge-scheduled";
        if (m.status === "Assigned") statusBadgeClass = "badge-assigned";
        else if (m.status === "In Progress") statusBadgeClass = "badge-in-progress";
        else if (m.status === "Waiting for Parts") statusBadgeClass = "badge-waiting";
        else if (m.status === "Completed") statusBadgeClass = "badge-completed";
        else if (m.status === "Cancelled") statusBadgeClass = "badge-cancelled";

        // Date snippet with rescheduling note
        let dateHtml = "<div>" + escapeHTML(m.scheduledDate) + "</div>";
        if (m.originalDate && m.originalDate !== m.scheduledDate) {
            dateHtml += "<span class='badge-rescheduled d-inline-block mt-1' title='Reason: " + escapeHTML(m.rescheduleReason) + "'>Orig: " + escapeHTML(m.originalDate) + "</span>";
        }

        // Linked Work Order badge if created
        let woBadge = "";
        if (m.workOrderId) {
            woBadge = "<br><small class='text-muted'>Linked: <a href='workorders.html' class='text-primary fw-bold'>" + escapeHTML(m.workOrderId) + "</a></small>";
        }

        // Action buttons
        let actionsHtml = "<div class='btn-action-group justify-content-center'>";
        if (!m.workOrderId && m.status !== "Completed" && m.status !== "Cancelled") {
            actionsHtml += "<button type='button' class='btn-action-order' onclick='generateWorkOrderFromMaint(\"" + escapeHTML(m.id) + "\")'>+ Work Order</button>";
        }
        actionsHtml += "<button type='button' class='btn-action-edit' onclick='editMaintenance(\"" + escapeHTML(m.id) + "\")'>Edit</button>";
        if (m.status !== "Completed" && m.status !== "Cancelled") {
            actionsHtml += "<button type='button' class='btn-action-reschedule' onclick='openRescheduleModal(\"" + escapeHTML(m.id) + "\")'>Reschedule</button>";
        }
        actionsHtml += "<button type='button' class='btn-action-delete' onclick='deleteMaintenance(\"" + escapeHTML(m.id) + "\")'>Delete</button>";
        actionsHtml += "</div>";

        tr.innerHTML =
            "<td><strong>" + escapeHTML(m.id) + "</strong>" + woBadge + "</td>" +
            "<td><strong>" + escapeHTML(m.equipment) + "</strong></td>" +
            "<td><span class='badge-status " + typeBadgeClass + "'>" + escapeHTML(m.type) + "</span></td>" +
            "<td>" + escapeHTML(m.technician) + "</td>" +
            "<td>" + dateHtml + "</td>" +
            "<td><span class='badge-status " + statusBadgeClass + "'>" + escapeHTML(m.status) + "</span></td>" +
            "<td class='text-center'>" + actionsHtml + "</td>";

        tbody.appendChild(tr);
    }

    applyRolePermissions();
}

// Reset form for new schedule
function resetForm() {
    document.getElementById("maintenanceForm").reset();
    document.getElementById("editIndex").value = "-1";
    document.getElementById("maintId").removeAttribute("readonly");
    document.getElementById("maintModalLabel").textContent = "Schedule Maintenance";
    document.getElementById("maintAutoAssignFeedback").textContent = "";
    document.getElementById("maintDate").value = new Date().toISOString().split("T")[0];
    populateFormDropdowns();
}

// Form Submit Handler
function handleFormSubmit(event) {
    event.preventDefault();

    let editIndexVal = parseInt(document.getElementById("editIndex").value);
    let id = document.getElementById("maintId").value.trim();
    let equipment = document.getElementById("maintEquipment").value.trim();
    let type = document.getElementById("maintType").value;
    let technician = document.getElementById("maintTechnician").value.trim();
    let scheduledDate = document.getElementById("maintDate").value;
    let status = document.getElementById("maintStatus").value;

    if (!id || !equipment || !type || !technician || !scheduledDate || !status) {
        showAlert("Please fill in all required fields.", "danger");
        return;
    }

    if (editIndexVal === -1) {
        // Add new
        for (let i = 0; i < maintenanceList.length; i++) {
            if (maintenanceList[i].id.toUpperCase() === id.toUpperCase()) {
                showAlert("Maintenance ID already exists. Please choose a unique ID.", "danger");
                return;
            }
        }

        let newMaint = {
            id: id,
            equipment: equipment,
            type: type,
            technician: technician,
            scheduledDate: scheduledDate,
            status: status,
            originalDate: scheduledDate,
            rescheduledDate: "",
            rescheduleReason: "",
            workOrderId: ""
        };

        maintenanceList.unshift(newMaint);
        showAlert("Maintenance task " + id + " scheduled successfully.", "success");
        logActivity(equipment, "Maintenance task " + id + " scheduled (" + type + ", tech: " + technician + ")", "badge-scheduled");
    } else {
        // Edit existing
        if (editIndexVal >= 0 && editIndexVal < maintenanceList.length) {
            let oldM = maintenanceList[editIndexVal];
            oldM.equipment = equipment;
            oldM.type = type;
            oldM.technician = technician;
            oldM.scheduledDate = scheduledDate;
            oldM.status = status;
            showAlert("Maintenance task " + id + " updated.", "success");
            logActivity(equipment, "Maintenance task " + id + " updated to status '" + status + "'", "badge-in-progress");
        }
    }

    // Crucial loop: sync equipment status
    syncEquipmentStatusOnWorkOrder(equipment, status, scheduledDate);

    localStorage.setItem("forge_maintenance", JSON.stringify(maintenanceList));

    maintenanceModalInstance.hide();
    filterAndRenderTable();
    updateKpiCards();
}

// Generate an actionable Work Order from a Maintenance Schedule
function generateWorkOrderFromMaint(id) {
    let maint = maintenanceList.find(m => m.id === id);
    if (!maint) return;

    let workorders = JSON.parse(localStorage.getItem("forge_workorders") || localStorage.getItem("iemrs_workorders")) || [];
    let newOrderId = "WO-" + (300 + workorders.length + 1);

    let priority = maint.type === "Corrective" ? "High" : "Medium";
    let problemDesc = maint.type + " maintenance protocol: full system inspection and diagnostics on " + maint.equipment;

    let newOrder = {
        id: newOrderId,
        equipment: maint.equipment,
        problem: problemDesc,
        technician: maint.technician,
        priority: priority,
        date: maint.scheduledDate,
        status: "Assigned",
        requiredPart: "",
        requiredQuantity: 0,
        waitingReason: "",
        expectedResumeDate: "",
        waitingNotes: "",
        originalDate: maint.scheduledDate,
        rescheduledDate: "",
        rescheduleReason: "",
        maintenanceId: maint.id
    };

    workorders.unshift(newOrder);
    localStorage.setItem("forge_workorders", JSON.stringify(workorders));

    maint.workOrderId = newOrderId;
    maint.status = "Assigned";
    localStorage.setItem("forge_maintenance", JSON.stringify(maintenanceList));

    logActivity(maint.equipment, "Generated work order " + newOrderId + " from maintenance schedule " + id, "badge-assigned");
    showAlert("Created Work Order " + newOrderId + " assigned to " + maint.technician + ".", "success");

    filterAndRenderTable();
    updateKpiCards();
}

// Open Edit Modal
function editMaintenance(id) {
    let index = -1;
    for (let i = 0; i < maintenanceList.length; i++) {
        if (maintenanceList[i].id === id) {
            index = i;
            break;
        }
    }

    if (index === -1) return;

    populateFormDropdowns();

    let m = maintenanceList[index];

    document.getElementById("editIndex").value = index;
    document.getElementById("maintId").value = m.id;
    document.getElementById("maintId").setAttribute("readonly", true);
    document.getElementById("maintEquipment").value = m.equipment;
    document.getElementById("maintType").value = m.type;
    document.getElementById("maintTechnician").value = m.technician;
    document.getElementById("maintDate").value = m.scheduledDate;
    document.getElementById("maintStatus").value = m.status;

    document.getElementById("maintModalLabel").textContent = "Edit Maintenance Task (" + m.id + ")";
    maintenanceModalInstance.show();
}

// Reschedule Modal
function openRescheduleModal(id) {
    let maint = maintenanceList.find(m => m.id === id);
    if (!maint) return;

    document.getElementById("rescheduleMaintId").value = maint.id;
    document.getElementById("rescheduleMaintDisplay").value = maint.id + " - " + maint.equipment;
    document.getElementById("rescheduleMaintOriginalDate").value = maint.originalDate || maint.scheduledDate;
    document.getElementById("rescheduleMaintNewDate").value = "";
    document.getElementById("rescheduleMaintReason").value = "";

    maintRescheduleModalInstance.show();
}

function handleRescheduleSubmit(event) {
    event.preventDefault();

    let id = document.getElementById("rescheduleMaintId").value;
    let newDate = document.getElementById("rescheduleMaintNewDate").value;
    let reason = document.getElementById("rescheduleMaintReason").value.trim();

    if (!newDate || !reason) {
        showAlert("Please specify both new date and reason.", "danger");
        return;
    }

    let maint = maintenanceList.find(m => m.id === id);
    if (!maint) return;

    if (!maint.originalDate) {
        maint.originalDate = maint.scheduledDate;
    }
    maint.scheduledDate = newDate;
    maint.rescheduledDate = newDate;
    maint.rescheduleReason = reason;

    localStorage.setItem("forge_maintenance", JSON.stringify(maintenanceList));

    maintRescheduleModalInstance.hide();
    showAlert("Maintenance task " + id + " rescheduled to " + newDate + ".", "info");
    logActivity(maint.equipment, "Maintenance " + id + " rescheduled to " + newDate + " (Reason: " + reason + ")", "badge-scheduled");

    filterAndRenderTable();
}

// Delete Record
function deleteMaintenance(id) {
    let confirmed = confirm("Are you sure you want to delete maintenance schedule [" + id + "]?");
    if (!confirmed) return;

    let target = maintenanceList.find(m => m.id === id);
    maintenanceList = maintenanceList.filter(m => m.id !== id);
    localStorage.setItem("forge_maintenance", JSON.stringify(maintenanceList));

    if (target) {
        logActivity(target.equipment, "Maintenance schedule " + id + " removed", "badge-faulty");
    }

    showAlert("Maintenance record " + id + " removed.", "danger");
    filterAndRenderTable();
    updateKpiCards();
}


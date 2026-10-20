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
    if (modalElement && typeof bootstrap !== "undefined") maintenanceModalInstance = new bootstrap.Modal(modalElement);

    let reschedEl = document.getElementById("rescheduleModal");
    if (reschedEl && typeof bootstrap !== "undefined") maintRescheduleModalInstance = new bootstrap.Modal(reschedEl);

    // 2. Load data from localStorage
    loadMaintenanceData();

    // 3. Bind search and filter events
    let sInput = document.getElementById("searchInput");
    if (sInput) sInput.addEventListener("input", function () { filterAndRenderTable(); renderComplianceTimeline(); });

    let tFilter = document.getElementById("typeFilter");
    if (tFilter) tFilter.addEventListener("change", function () { filterAndRenderTable(); renderComplianceTimeline(); });

    let stFilter = document.getElementById("statusFilter");
    if (stFilter) stFilter.addEventListener("change", function () { filterAndRenderTable(); renderComplianceTimeline(); });

    // 3b. Bind Segmented View Switcher (Schedule Table vs Compliance Timeline)
    let btnTable = document.getElementById("btnMaintViewTable");
    let btnTimeline = document.getElementById("btnMaintViewTimeline");
    if (btnTable) btnTable.addEventListener("click", function () { setMaintenanceView("table"); });
    if (btnTimeline) btnTimeline.addEventListener("click", function () { setMaintenanceView("timeline"); });

    // 4. Bind Add button
    let addBtn = document.getElementById("addNewMaintBtn");
    if (addBtn) addBtn.addEventListener("click", resetForm);

    // 5. Bind form submit
    let mForm = document.getElementById("maintenanceForm");
    if (mForm) mForm.addEventListener("submit", handleFormSubmit);

    // 6. Reschedule form submit
    let reschedForm = document.getElementById("rescheduleForm");
    if (reschedForm) reschedForm.addEventListener("submit", handleRescheduleSubmit);

    // 7. Handle URL parameters (?action=new, ?id=MNT-001, ?view=timeline)
    handleUrlParams();

    // 8. Bind Export CSV button
    let exportBtn = document.getElementById("exportMaintenanceCsvBtn");
    if (exportBtn) exportBtn.addEventListener("click", exportMaintenanceCSV);
});

// Switch between Schedule Table Register and Visual Compliance Timeline View
function setMaintenanceView(view) {
    let btnTable = document.getElementById("btnMaintViewTable");
    let btnTimeline = document.getElementById("btnMaintViewTimeline");
    let tableView = document.getElementById("maintTableView");
    let timelineView = document.getElementById("maintTimelineView");

    if (view === "timeline") {
        if (btnTimeline) btnTimeline.classList.add("active");
        if (btnTable) btnTable.classList.remove("active");
        if (timelineView) timelineView.classList.remove("d-none");
        if (tableView) tableView.classList.add("d-none");
        renderComplianceTimeline();
    } else {
        if (btnTable) btnTable.classList.add("active");
        if (btnTimeline) btnTimeline.classList.remove("active");
        if (tableView) tableView.classList.remove("d-none");
        if (timelineView) timelineView.classList.add("d-none");
        filterAndRenderTable();
    }
}

// Load records from localStorage
function loadMaintenanceData() {
    let saved = localStorage.getItem("forge_maintenance") || localStorage.getItem("iemrs_maintenance");
    if (saved) {
        maintenanceList = JSON.parse(saved);
    } else {
        maintenanceList = [];
    }
    filterAndRenderTable();
    renderComplianceTimeline();
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
        var role = (typeof getActiveRole === "function") ? getActiveRole() : "Administrator";
        let actionsHtml = "";
        if (role === "Operator") {
            actionsHtml = "<span class='badge bg-secondary font-mono' style='font-size:0.7rem;'>READ-ONLY</span>";
        } else {
            actionsHtml = "<div class='btn-action-group justify-content-center'>";
            if (!m.workOrderId && m.status !== "Completed" && m.status !== "Cancelled") {
                actionsHtml += "<button type='button' class='btn-action-order' onclick='generateWorkOrderFromMaint(\"" + escapeHTML(m.id) + "\")'>+ Work Order</button>";
            }
            actionsHtml += "<button type='button' class='btn-action-edit' onclick='editMaintenance(\"" + escapeHTML(m.id) + "\")'>Edit</button>";
            if (m.status !== "Completed" && m.status !== "Cancelled") {
                actionsHtml += "<button type='button' class='btn-action-reschedule' onclick='openRescheduleModal(\"" + escapeHTML(m.id) + "\")'>Reschedule</button>";
            }
            if (role === "Administrator") {
                actionsHtml += "<button type='button' class='btn-action-delete' onclick='deleteMaintenance(\"" + escapeHTML(m.id) + "\")'>Delete</button>";
            }
            actionsHtml += "</div>";
        }

        tr.innerHTML =
            "<td class='font-mono'><strong>" + escapeHTML(m.id) + "</strong>" + woBadge + "</td>" +
            "<td><a href='javascript:void(0)' data-action='view-dossier' data-equipment-id='" + escapeHTML(m.equipment) + "' class='badge-eq-dossier' title='Open 360° Technical Dossier' style='color:var(--primary); font-weight:700; text-decoration:underline; cursor:pointer;'><strong>" + escapeHTML(m.equipment) + "</strong></a></td>" +
            "<td><span class='badge-status " + typeBadgeClass + "'>" + escapeHTML(m.type) + "</span></td>" +
            "<td>" + escapeHTML(m.technician) + "</td>" +
            "<td class='font-mono'>" + dateHtml + "</td>" +
            "<td><span class='badge-status " + statusBadgeClass + "'>" + escapeHTML(m.status) + "</span></td>" +
            "<td class='text-center'>" + actionsHtml + "</td>";

        tbody.appendChild(tr);
    }

    applyRolePermissions();
}

// Deep-linking URL query handler
function handleUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get("id");
    var search = params.get("search");
    var action = params.get("action");

    if (action === "new") {
        var role = (typeof getActiveRole === "function") ? getActiveRole() : "Administrator";
        if (role === "Administrator") {
            setTimeout(function () {
                resetForm();
                if (maintenanceModalInstance) maintenanceModalInstance.show();
            }, 100);
        }
    } else if (id) {
        var input = document.getElementById("searchInput");
        if (input) {
            input.value = id;
            filterAndRenderTable();
        }
    } else if (search) {
        var input = document.getElementById("searchInput");
        if (input) {
            input.value = search;
            filterAndRenderTable();
        }
    }

    var viewParam = params.get("view");
    if (viewParam === "timeline") {
        setMaintenanceView("timeline");
    }
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

    let submitBtn = event.target ? event.target.querySelector("button[type='submit']") : null;
    if (submitBtn) {
        if (submitBtn.disabled) return;
        submitBtn.disabled = true;
        setTimeout(() => { if (submitBtn) submitBtn.disabled = false; }, 1000);
    }

    let editIndexVal = parseInt(document.getElementById("editIndex").value);
    let id = document.getElementById("maintId").value.trim();
    let equipment = document.getElementById("maintEquipment").value.trim();
    let type = document.getElementById("maintType").value;
    let technician = document.getElementById("maintTechnician").value.trim();
    let scheduledDate = document.getElementById("maintDate").value;
    let status = document.getElementById("maintStatus").value;

    if (!id || !equipment || !type || !technician || !scheduledDate || !status) {
        showAlert("Please fill in all required fields.", "danger");
        if (submitBtn) submitBtn.disabled = false;
        return;
    }

    if (editIndexVal === -1) {
        // Add new
        for (let i = 0; i < maintenanceList.length; i++) {
            if (maintenanceList[i].id.toUpperCase() === id.toUpperCase()) {
                showAlert("Maintenance ID already exists. Please choose a unique ID.", "danger");
                if (submitBtn) submitBtn.disabled = false;
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

// Delete Record after styled confirmation
function deleteMaintenance(id) {
    let target = maintenanceList.find(m => m.id === id);
    let targetName = target ? (target.equipment + " (" + target.type + ")") : id;

    forgeConfirm({
        title: "CANCEL / DELETE SCHEDULE",
        message: "Are you sure you want to remove maintenance schedule [" + id + " — " + targetName + "]?",
        confirmText: "Delete Schedule",
        confirmBtnClass: "btn-danger",
        onConfirm: function () {
            maintenanceList = maintenanceList.filter(m => m.id !== id);
            localStorage.setItem("forge_maintenance", JSON.stringify(maintenanceList));
            localStorage.setItem("iemrs_maintenance", JSON.stringify(maintenanceList));

            if (target) {
                logActivity(target.equipment, "Maintenance schedule " + id + " removed", "badge-faulty");
            }

            showAlert("Maintenance record " + id + " removed.", "danger");
            filterAndRenderTable();
            updateKpiCards();
        }
    });
}

// Export Filtered Maintenance Table to CSV
function exportMaintenanceCSV() {
    let query = (document.getElementById("searchInput") ? document.getElementById("searchInput").value : "").toLowerCase().trim();
    let typeVal = document.getElementById("typeFilter") ? document.getElementById("typeFilter").value : "All";
    let statusVal = document.getElementById("statusFilter") ? document.getElementById("statusFilter").value : "All";

    let filtered = maintenanceList.filter(function (m) {
        let matchesQuery = !query ||
            m.id.toLowerCase().includes(query) ||
            m.equipment.toLowerCase().includes(query) ||
            m.technician.toLowerCase().includes(query);

        let matchesType = (typeVal === "All") || (m.type === typeVal);
        let matchesStatus = (statusVal === "All") || (m.status === statusVal);

        return matchesQuery && matchesType && matchesStatus;
    });

    let rows = filtered.map(function (m) {
        return {
            "Schedule ID": m.id,
            "Target Machine": m.equipment,
            "Maintenance Type": m.type,
            "Lead Specialist": m.technician,
            "Scheduled Date": m.scheduledDate,
            "Execution Status": m.status,
            "Linked Work Order": m.workOrderId || "None"
        };
    });

    exportTableToCSV("forge_maintenance_schedules_" + new Date().toISOString().split("T")[0] + ".csv", rows);
}

// ==========================================================================
// PREVENTIVE MAINTENANCE VISUAL COMPLIANCE TIMELINE (MILESTONE 6)
// Dynamic Compliance Gauge & 4-Lane Milestone Matrix
// ==========================================================================

function renderComplianceTimeline() {
    let timelineContainer = document.getElementById("maintTimelineView");
    if (!timelineContainer) return;

    let role = (typeof getActiveRole === "function") ? getActiveRole() : "Administrator";
    let isReadOnly = (role === "Operator");

    let laneOverdue = document.getElementById("timelineCardsOverdue");
    let laneDueWeek = document.getElementById("timelineCardsDueWeek");
    let laneUpcoming = document.getElementById("timelineCardsUpcoming");
    let laneCompleted = document.getElementById("timelineCardsCompleted");

    if (laneOverdue) laneOverdue.innerHTML = "";
    if (laneDueWeek) laneDueWeek.innerHTML = "";
    if (laneUpcoming) laneUpcoming.innerHTML = "";
    if (laneCompleted) laneCompleted.innerHTML = "";

    let equipmentList = (typeof getEquipmentList === "function") ? getEquipmentList() : [];
    let workforce = (typeof getTechniciansList === "function") ? getTechniciansList() : [];

    let now = new Date();
    now.setHours(0, 0, 0, 0);

    let counts = { overdue: 0, dueWeek: 0, upcoming: 0, completed: 0 };

    let query = (document.getElementById("searchInput") ? document.getElementById("searchInput").value : "").toLowerCase().trim();
    let typeFilter = document.getElementById("typeFilter") ? document.getElementById("typeFilter").value : "All";
    let statusFilter = document.getElementById("statusFilter") ? document.getElementById("statusFilter").value : "All";

    maintenanceList.forEach(function (m) {
        let matchesQuery = !query ||
            m.id.toLowerCase().includes(query) ||
            m.equipment.toLowerCase().includes(query) ||
            m.technician.toLowerCase().includes(query);
        let matchesType = (typeFilter === "All") || (m.type === typeFilter);
        let matchesStatus = (statusFilter === "All") || (m.status === statusFilter);

        if (!matchesQuery || !matchesType || !matchesStatus) return;

        let schedDate = m.scheduledDate || "";
        let mDate = new Date(schedDate);
        mDate.setHours(0, 0, 0, 0);
        let diffDays = Math.round((mDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        let eqObj = equipmentList.find(function (e) { return e.name === m.equipment || e.id === m.equipmentId; });
        let eqId = eqObj ? eqObj.id : (m.equipmentId || "ASSET");

        let techObj = workforce.find(function (t) { return t.name === m.technician; });
        let techSkill = techObj ? techObj.specialization || techObj.skill : "Technician Specialist";

        // Determine destination lane
        let laneTarget = null;
        let countdownBadgeHtml = "";

        if (m.status === "Completed") {
            laneTarget = laneCompleted;
            counts.completed++;
            countdownBadgeHtml = '<span class="timeline-countdown-badge countdown-completed">✓ Verified &amp; Closed</span>';
        } else if (diffDays < 0) {
            laneTarget = laneOverdue;
            counts.overdue++;
            let daysPast = Math.abs(diffDays);
            countdownBadgeHtml = '<span class="timeline-countdown-badge countdown-overdue">⚠️ Overdue (' + daysPast + 'd past)</span>';
        } else if (diffDays <= 7) {
            laneTarget = laneDueWeek;
            counts.dueWeek++;
            let dueText = diffDays === 0 ? "⚡ Due Today" : "⏳ Due in " + diffDays + "d";
            countdownBadgeHtml = '<span class="timeline-countdown-badge countdown-due-soon">' + dueText + '</span>';
        } else {
            laneTarget = laneUpcoming;
            counts.upcoming++;
            countdownBadgeHtml = '<span class="timeline-countdown-badge countdown-upcoming">📅 In ' + diffDays + 'd</span>';
        }

        // Quick action button
        let actionBtnHtml = "";
        if (!isReadOnly && m.status !== "Completed") {
            actionBtnHtml = '<button type="button" class="btn-pm-complete" onclick="quickCompleteMaintenance(\'' + escapeHTML(m.id) + '\')">✓ Mark Complete</button>';
        }

        let editBtnHtml = "";
        if (!isReadOnly) {
            editBtnHtml = '<button type="button" class="btn btn-sm btn-outline-secondary font-mono" style="font-size:0.68rem; padding: 2px 6px;" onclick="editMaintenance(\'' + escapeHTML(m.id) + '\')">Edit</button>';
        }

        let card = document.createElement("div");
        card.className = "timeline-node-card";
        card.innerHTML =
            '<div class="timeline-node-top">' +
                '<span class="timeline-pm-id">' + escapeHTML(m.id) + '</span>' +
                countdownBadgeHtml +
            '</div>' +
            '<div class="timeline-node-asset">' +
                '<a href="javascript:void(0)" data-action="view-dossier" data-equipment-id="' + escapeHTML(eqId) + '" title="Open 360° Technical Dossier">' +
                    escapeHTML(eqId) + ' // ' + escapeHTML(m.equipment) +
                '</a>' +
            '</div>' +
            '<div class="timeline-node-details">' +
                '<div class="d-flex justify-content-between mb-1">' +
                    '<span>Procedure: <strong class="text-gold">' + escapeHTML(m.type) + '</strong></span>' +
                    '<span class="font-mono text-muted">' + escapeHTML(schedDate) + '</span>' +
                '</div>' +
                '<div>' +
                    '<span>Lead: ' + escapeHTML(m.technician) + ' <small class="text-muted">(' + escapeHTML(techSkill) + ')</small></span>' +
                '</div>' +
            '</div>' +
            '<div class="timeline-node-actions">' +
                '<div>' + editBtnHtml + '</div>' +
                '<div>' + actionBtnHtml + '</div>' +
            '</div>';

        if (laneTarget) laneTarget.appendChild(card);
    });

    // Update counts & compliance index
    let totalPMs = maintenanceList.length;
    let complianceRate = 100;
    if (totalPMs > 0) {
        complianceRate = Math.max(0, Math.min(100, Math.round(((totalPMs - counts.overdue) / totalPMs) * 100)));
    }

    let gaugeCircle = document.getElementById("pmGaugeCircle");
    let gaugeVal = document.getElementById("pmGaugeValue");
    let gaugeLabel = document.getElementById("pmComplianceLabel");

    if (gaugeCircle) gaugeCircle.style.setProperty("--gauge-percent", complianceRate + "%");
    if (gaugeVal) gaugeVal.textContent = complianceRate + "%";
    if (gaugeLabel) {
        if (complianceRate >= 90) {
            gaugeLabel.textContent = "Compliant & Healthy";
            gaugeLabel.className = "text-success font-weight-bold";
        } else {
            gaugeLabel.textContent = "Overdue Actions Require Resolution";
            gaugeLabel.className = "text-danger font-weight-bold";
        }
    }

    if (document.getElementById("statOverdueCount")) document.getElementById("statOverdueCount").textContent = counts.overdue;
    if (document.getElementById("statDueWeekCount")) document.getElementById("statDueWeekCount").textContent = counts.dueWeek;
    if (document.getElementById("statUpcomingCount")) document.getElementById("statUpcomingCount").textContent = counts.upcoming;
    if (document.getElementById("statVerifiedCount")) document.getElementById("statVerifiedCount").textContent = counts.completed;

    if (document.getElementById("laneCountOverdue")) document.getElementById("laneCountOverdue").textContent = counts.overdue;
    if (document.getElementById("laneCountDueWeek")) document.getElementById("laneCountDueWeek").textContent = counts.dueWeek;
    if (document.getElementById("laneCountUpcoming")) document.getElementById("laneCountUpcoming").textContent = counts.upcoming;
    if (document.getElementById("laneCountCompleted")) document.getElementById("laneCountCompleted").textContent = counts.completed;

    // Empty states
    if (laneOverdue && counts.overdue === 0) laneOverdue.innerHTML = '<div class="bay-empty-placeholder">NO OVERDUE SCHEDULES</div>';
    if (laneDueWeek && counts.dueWeek === 0) laneDueWeek.innerHTML = '<div class="bay-empty-placeholder">NO SCHEDULES DUE THIS WEEK</div>';
    if (laneUpcoming && counts.upcoming === 0) laneUpcoming.innerHTML = '<div class="bay-empty-placeholder">NO FUTURE SCHEDULES PENDING</div>';
    if (laneCompleted && counts.completed === 0) laneCompleted.innerHTML = '<div class="bay-empty-placeholder">NO COMPLETED LOGS IN PERIOD</div>';
}

function quickCompleteMaintenance(id) {
    let role = (typeof getActiveRole === "function") ? getActiveRole() : "Administrator";
    if (role === "Operator") {
        showAlert("Operator role cannot execute or verify preventive maintenance.", "warning");
        return;
    }

    let mIndex = maintenanceList.findIndex(function (item) { return item.id === id; });
    if (mIndex === -1) return;

    let m = maintenanceList[mIndex];
    m.status = "Completed";

    let today = new Date();
    let todayStr = today.toISOString().split("T")[0];

    // Compute next maintenance date (+30 days)
    let nextDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Synchronize equipment register
    let eqList = (typeof getEquipmentList === "function") ? getEquipmentList() : [];
    let eqTarget = eqList.find(function (e) { return e.name === m.equipment || e.id === m.equipmentId; });
    if (eqTarget) {
        eqTarget.lastMaintenance = todayStr;
        eqTarget.lastMaintenanceDate = todayStr;
        eqTarget.nextMaintenance = nextDate;
        if (eqTarget.status === "Maintenance") {
            eqTarget.status = "Operational";
        }
        localStorage.setItem("forge_equipment", JSON.stringify(eqList));
        localStorage.setItem("iemrs_equipment", JSON.stringify(eqList));
        if (typeof ForgeSync !== "undefined" && ForgeSync.broadcast) {
            ForgeSync.broadcast("equipment", "UPDATE", eqTarget);
        }
    }

    localStorage.setItem("forge_maintenance", JSON.stringify(maintenanceList));
    localStorage.setItem("iemrs_maintenance", JSON.stringify(maintenanceList));

    if (typeof logActivity === "function") {
        logActivity(m.equipment, "PM Log " + m.id + " completed & verified for " + m.equipment, "badge-completed");
    }

    if (typeof ForgeSync !== "undefined" && ForgeSync.broadcast) {
        ForgeSync.broadcast("maintenance", "UPDATE", m);
    }

    showAlert("✓ Preventive maintenance " + m.id + " successfully completed and verified.", "success");
    filterAndRenderTable();
    renderComplianceTimeline();
    updateKpiCards();
}




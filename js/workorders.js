// ==========================================================================
// FORGE - Work Orders JavaScript (js/workorders.js)
// Lifecycle: Scheduled -> Assigned -> In Progress -> Waiting for Parts -> Completed / Cancelled
// Auto-Assign, Equipment Sync, Spare Parts Deduction & Rescheduling
// ==========================================================================

let ordersList = [];
let orderModalInstance = null;
let rescheduleModalInstance = null;

document.addEventListener("DOMContentLoaded", function () {
    // 1. Initialize modal instances
    let modalEl = document.getElementById("workOrderModal");
    if (modalEl && typeof bootstrap !== "undefined") orderModalInstance = new bootstrap.Modal(modalEl);

    let reschedEl = document.getElementById("rescheduleModal");
    if (reschedEl && typeof bootstrap !== "undefined") rescheduleModalInstance = new bootstrap.Modal(reschedEl);

    // 2. Load data
    loadWorkOrdersData();

    // 3. Bind search and filter events
    let sInput = document.getElementById("searchInput");
    if (sInput) sInput.addEventListener("input", filterAndRenderTable);

    let pFilter = document.getElementById("priorityFilter");
    if (pFilter) pFilter.addEventListener("change", filterAndRenderTable);

    let stFilter = document.getElementById("statusFilter");
    if (stFilter) stFilter.addEventListener("change", filterAndRenderTable);

    // 4. Add button click
    let addBtn = document.getElementById("addNewOrderBtn");
    if (addBtn) addBtn.addEventListener("click", resetForm);

    // 5. Form submit
    let woForm = document.getElementById("workOrderForm");
    if (woForm) woForm.addEventListener("submit", handleFormSubmit);

    // 6. Reschedule form submit
    let reschedForm = document.getElementById("rescheduleForm");
    if (reschedForm) reschedForm.addEventListener("submit", handleRescheduleSubmit);

    // 7. Auto-Assign button
    let autoBtn = document.getElementById("btnAutoAssignWO");
    if (autoBtn) autoBtn.addEventListener("click", triggerAutoAssign);

    // 8. Part selection stock notice
    let partEl = document.getElementById("orderRequiredPart");
    if (partEl) partEl.addEventListener("change", updatePartAvailabilityNotice);

    let qtyEl = document.getElementById("orderRequiredQty");
    if (qtyEl) qtyEl.addEventListener("input", updatePartAvailabilityNotice);

    // 9. Read URL parameters for deep-linking (?action=new, ?id=WO-301)
    handleUrlParams();

    // 10. Bind Export CSV button
    let exportBtn = document.getElementById("exportWorkOrdersCsvBtn");
    if (exportBtn) exportBtn.addEventListener("click", exportWorkOrdersCSV);
});

// Load records from localStorage
function loadWorkOrdersData() {
    let saved = localStorage.getItem("forge_workorders") || localStorage.getItem("iemrs_workorders");
    if (saved) {
        ordersList = JSON.parse(saved);
    } else {
        ordersList = [];
    }
    filterAndRenderTable();
    updateKpiCards();
    populateFormDropdowns();
}

// Update summary metric cards
function updateKpiCards() {
    let total = ordersList.length;
    let inProgress = 0;
    let waiting = 0;
    let completed = 0;

    for (let i = 0; i < ordersList.length; i++) {
        let st = ordersList[i].status;
        if (st === "In Progress") inProgress++;
        else if (st === "Waiting for Parts") waiting++;
        else if (st === "Completed") completed++;
    }

    document.getElementById("kpiTotalOrders").textContent = total;
    document.getElementById("kpiInProgressOrders").textContent = inProgress;
    document.getElementById("kpiWaitingParts").textContent = waiting;
    document.getElementById("kpiCompletedOrders").textContent = completed;
}

// Populate Equipment, Technician & Inventory dropdowns
function populateFormDropdowns() {
    let equipmentList = JSON.parse(localStorage.getItem("forge_equipment") || localStorage.getItem("iemrs_equipment")) || [];
    let eqSelect = document.getElementById("orderEquipment");
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
    let techSelect = document.getElementById("orderTechnician");
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

    let inventory = JSON.parse(localStorage.getItem("forge_inventory") || localStorage.getItem("iemrs_inventory")) || [];
    let partSelect = document.getElementById("orderRequiredPart");
    if (partSelect) {
        partSelect.innerHTML = '<option value="">-- No Spare Part Required --</option>';
        inventory.forEach(function (p) {
            let opt = document.createElement("option");
            opt.value = p.name;
            opt.textContent = p.name + " [Stock: " + p.quantity + " units]";
            opt.dataset.quantity = p.quantity;
            partSelect.appendChild(opt);
        });
    }
}

// Trigger Auto-Assign via explainable algorithm
function triggerAutoAssign() {
    let eqSelect = document.getElementById("orderEquipment");
    let selectedEqName = eqSelect.value;
    let selectedOption = eqSelect.options[eqSelect.selectedIndex];
    let eqType = selectedOption ? selectedOption.dataset.type : "";

    let result = autoAssignTechnician(eqType || selectedEqName);
    let feedback = document.getElementById("autoAssignFeedback");

    if (result.technician) {
        document.getElementById("orderTechnician").value = result.name;
        feedback.textContent = "⚡ " + result.message;
        feedback.className = "text-success d-block mt-1 font-weight-bold";
        showAlert("Assigned to " + result.name + " based on workload and skills.", "info");
    } else {
        feedback.textContent = "⚠️ " + result.message;
        feedback.className = "text-danger d-block mt-1";
    }
}

// Check real-time stock when part is selected in modal
function updatePartAvailabilityNotice() {
    let partName = document.getElementById("orderRequiredPart").value;
    let qty = parseInt(document.getElementById("orderRequiredQty").value) || 0;
    let notice = document.getElementById("partAvailabilityNotice");

    if (!partName || qty <= 0) {
        notice.textContent = "";
        return;
    }

    let inventory = JSON.parse(localStorage.getItem("forge_inventory") || localStorage.getItem("iemrs_inventory")) || [];
    let found = inventory.find(p => p.name === partName);

    if (found) {
        if (found.quantity >= qty) {
            notice.innerHTML = "<span class='text-success fw-bold'>✔ In Stock:</span> " + found.quantity + " available (Sufficient for this order)";
        } else {
            notice.innerHTML = "<span class='text-danger fw-bold'>⚠️ Insufficient Stock:</span> Only " + found.quantity + " in warehouse. Order can be moved to 'Waiting for Parts'.";
            // Pre-fill waiting reason if empty
            let reasonInput = document.getElementById("orderWaitingReason");
            if (!reasonInput.value) {
                reasonInput.value = partName + " stock insufficient (needed: " + qty + ", available: " + found.quantity + ")";
            }
        }
    } else {
        notice.textContent = "";
    }
}

// Filter and render table rows
function filterAndRenderTable() {
    let query = document.getElementById("searchInput").value.toLowerCase().trim();
    let priorityVal = document.getElementById("priorityFilter").value;
    let statusVal = document.getElementById("statusFilter").value;
    let tbody = document.getElementById("workordersTableBody");
    let emptyState = document.getElementById("workordersEmptyState");

    tbody.innerHTML = "";

    let filtered = [];

    for (let i = 0; i < ordersList.length; i++) {
        let order = ordersList[i];
        let matchesQuery =
            order.id.toLowerCase().includes(query) ||
            order.equipment.toLowerCase().includes(query) ||
            order.problem.toLowerCase().includes(query) ||
            order.technician.toLowerCase().includes(query);

        let matchesPriority = (priorityVal === "All") || (order.priority === priorityVal);
        let matchesStatus = (statusVal === "All") || (order.status === statusVal);

        if (matchesQuery && matchesPriority && matchesStatus) {
            filtered.push(order);
        }
    }

    document.getElementById("recordsCount").textContent = filtered.length + " Orders";

    if (filtered.length === 0) {
        emptyState.classList.remove("d-none");
        return;
    }

    emptyState.classList.add("d-none");

    let inventory = JSON.parse(localStorage.getItem("forge_inventory") || localStorage.getItem("iemrs_inventory")) || [];

    for (let j = 0; j < filtered.length; j++) {
        let o = filtered[j];
        let tr = document.createElement("tr");

        // Priority Badge Class
        let priorityBadgeClass = "badge-low";
        if (o.priority === "High") priorityBadgeClass = "badge-high";
        else if (o.priority === "Medium") priorityBadgeClass = "badge-medium";

        // Status Badge Class
        let statusBadgeClass = "badge-scheduled";
        if (o.status === "Assigned") statusBadgeClass = "badge-assigned";
        else if (o.status === "In Progress") statusBadgeClass = "badge-in-progress";
        else if (o.status === "Waiting for Parts") statusBadgeClass = "badge-waiting";
        else if (o.status === "Completed") statusBadgeClass = "badge-completed";
        else if (o.status === "Cancelled") statusBadgeClass = "badge-cancelled";

        // Check if waiting order now has restocked parts
        let readyToResumeBadge = "";
        let isWaiting = o.status === "Waiting for Parts";
        if (isWaiting && o.requiredPart) {
            let partObj = inventory.find(p => p.name === o.requiredPart);
            if (partObj && partObj.quantity >= (o.requiredQuantity || 1)) {
                readyToResumeBadge = "<br><span class='badge-ready-resume mt-1 d-inline-block'>Parts Restocked: Ready to Resume</span>";
            }
        }

        // Details snippet: problem, spare parts, waiting reason
        let detailsHtml = "<div>" + escapeHTML(o.problem) + "</div>";
        if (o.requiredPart && o.requiredQuantity > 0) {
            detailsHtml += "<small class='text-muted d-block mt-1'>🔩 Required: <strong>" + escapeHTML(o.requiredPart) + "</strong> (" + o.requiredQuantity + " pcs)</small>";
        }
        if (isWaiting && o.waitingReason) {
            detailsHtml += "<small class='text-danger d-block mt-1'><strong>Hold Reason:</strong> " + escapeHTML(o.waitingReason) + (o.expectedResumeDate ? " | Resume: " + o.expectedResumeDate : "") + "</small>";
        }

        // Date snippet with rescheduling note
        let dateHtml = "<div>" + escapeHTML(o.date) + "</div>";
        if (o.originalDate && o.originalDate !== o.date) {
            dateHtml += "<span class='badge-rescheduled d-inline-block mt-1' title='Reason: " + escapeHTML(o.rescheduleReason) + "'>Orig: " + escapeHTML(o.originalDate) + "</span>";
        }

        // Action buttons
        var role = (typeof getActiveRole === "function") ? getActiveRole() : "Administrator";
        let jobSheetBtn = "<button type='button' class='btn-action-view' onclick='openJobTravelerModal(\"" + escapeHTML(o.id) + "\")' title='Open Shop-Floor Job Sheet / LOTO Traveler' style='background:var(--surface-elevated);border:1px solid var(--border-color);color:var(--text-primary);padding:3px 7px;font-size:0.72rem;font-weight:600;'>🖨 Job Sheet</button>";
        let actionsHtml = "";

        if (role === "Operator") {
            actionsHtml = "<div class='btn-action-group justify-content-center'>" + jobSheetBtn + "</div>";
        } else {
            actionsHtml = "<div class='btn-action-group justify-content-center'>";
            actionsHtml += jobSheetBtn;
            if (isWaiting) {
                actionsHtml += "<button type='button' class='btn-action-resume' onclick='resumeWorkOrder(\"" + escapeHTML(o.id) + "\")'>Resume</button>";
            }
            actionsHtml += "<button type='button' class='btn-action-edit' onclick='editOrder(\"" + escapeHTML(o.id) + "\")'>Edit</button>";
            if (o.status !== "Completed" && o.status !== "Cancelled") {
                actionsHtml += "<button type='button' class='btn-action-reschedule' onclick='openRescheduleModal(\"" + escapeHTML(o.id) + "\")'>Reschedule</button>";
            }
            actionsHtml += "<button type='button' class='btn-action-delete' onclick='deleteOrder(\"" + escapeHTML(o.id) + "\")'>Delete</button>";
            actionsHtml += "</div>";
        }

        tr.innerHTML =
            "<td class='font-mono'><strong>" + escapeHTML(o.id) + "</strong></td>" +
            "<td><a href='javascript:void(0)' data-action='view-dossier' data-equipment-id='" + escapeHTML(o.equipment) + "' class='badge-eq-dossier' title='Open 360° Technical Dossier' style='color:var(--primary); font-weight:700; text-decoration:underline; cursor:pointer;'><strong>" + escapeHTML(o.equipment) + "</strong></a></td>" +
            "<td>" + detailsHtml + "</td>" +
            "<td>" + escapeHTML(o.technician) + "</td>" +
            "<td><span class='badge-status " + priorityBadgeClass + "'>" + escapeHTML(o.priority) + "</span></td>" +
            "<td class='font-mono'>" + dateHtml + "</td>" +
            "<td><span class='badge-status " + statusBadgeClass + "'>" + escapeHTML(o.status) + "</span>" + readyToResumeBadge + "</td>" +
            "<td class='text-center'>" + actionsHtml + "</td>";

        tbody.appendChild(tr);
    }

    applyRolePermissions();
}

// Deep-linking URL query handler
function handleUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var action = params.get("action");
    var id = params.get("id");
    var search = params.get("search");

    if (action === "new") {
        var role = (typeof getActiveRole === "function") ? getActiveRole() : "Administrator";
        if (role !== "Operator") {
            setTimeout(function () {
                resetForm();
                if (orderModalInstance) orderModalInstance.show();
            }, 100);
        }
    } else if (id) {
        var searchInput = document.getElementById("searchInput");
        if (searchInput) {
            searchInput.value = id;
            filterAndRenderTable();
        }
    } else if (search) {
        var searchInput = document.getElementById("searchInput");
        if (searchInput) {
            searchInput.value = search;
            filterAndRenderTable();
        }
    }
}

// Reset form for new order
function resetForm() {
    document.getElementById("workOrderForm").reset();
    document.getElementById("editIndex").value = "-1";
    document.getElementById("orderId").removeAttribute("readonly");
    document.getElementById("orderModalLabel").textContent = "Create Work Order";
    document.getElementById("autoAssignFeedback").textContent = "";
    document.getElementById("partAvailabilityNotice").textContent = "";
    document.getElementById("orderDate").value = new Date().toISOString().split("T")[0];
    populateFormDropdowns();
}

// Form Submit Handler (Add or Edit)
function handleFormSubmit(event) {
    event.preventDefault();

    let submitBtn = event.target ? event.target.querySelector("button[type='submit']") : null;
    if (submitBtn) {
        if (submitBtn.disabled) return;
        submitBtn.disabled = true;
        setTimeout(() => { if (submitBtn) submitBtn.disabled = false; }, 1000);
    }

    let editIndexVal = parseInt(document.getElementById("editIndex").value);
    let id = document.getElementById("orderId").value.trim();
    let equipment = document.getElementById("orderEquipment").value.trim();
    let problem = document.getElementById("orderProblem").value.trim();
    let technician = document.getElementById("orderTechnician").value.trim();
    let priority = document.getElementById("orderPriority").value;
    let date = document.getElementById("orderDate").value;
    let status = document.getElementById("orderStatus").value;

    let requiredPart = document.getElementById("orderRequiredPart").value.trim();
    let rawQty = parseInt(document.getElementById("orderRequiredQty").value, 10);
    let requiredQuantity = isNaN(rawQty) ? 0 : rawQty;
    let waitingReason = document.getElementById("orderWaitingReason").value.trim();
    let expectedResumeDate = document.getElementById("orderExpectedResume").value;
    let waitingNotes = document.getElementById("orderWaitingNotes").value.trim();

    if (!id || !equipment || !problem || !technician || !priority || !date || !status) {
        showAlert("Please fill in all required fields.", "danger");
        if (submitBtn) submitBtn.disabled = false;
        return;
    }

    if (requiredQuantity < 0) {
        showAlert("Required spare parts quantity cannot be negative.", "danger");
        if (submitBtn) submitBtn.disabled = false;
        return;
    }

    // If status is Waiting for Parts, require a reason
    if (status === "Waiting for Parts" && !waitingReason) {
        waitingReason = "Awaiting required spare part or replacement components";
    }

    if (editIndexVal === -1) {
        // Add new: verify unique ID
        for (let i = 0; i < ordersList.length; i++) {
            if (ordersList[i].id.toUpperCase() === id.toUpperCase()) {
                showAlert("Work Order ID already exists. Please choose a unique ID.", "danger");
                return;
            }
        }

        let newOrder = {
            id: id,
            equipment: equipment,
            problem: problem,
            technician: technician,
            priority: priority,
            date: date,
            status: status,
            requiredPart: requiredPart,
            requiredQuantity: requiredQuantity,
            waitingReason: waitingReason,
            expectedResumeDate: expectedResumeDate,
            waitingNotes: waitingNotes,
            originalDate: date,
            rescheduledDate: "",
            rescheduleReason: ""
        };

        ordersList.unshift(newOrder);
        showAlert("Work order " + id + " created successfully.", "success");
        logActivity(equipment, "Work order " + id + " created (" + priority + " Priority, assigned to " + technician + ")", "badge-scheduled");
    } else {
        // Edit existing
        if (editIndexVal >= 0 && editIndexVal < ordersList.length) {
            let oldOrder = ordersList[editIndexVal];
            oldOrder.equipment = equipment;
            oldOrder.problem = problem;
            oldOrder.technician = technician;
            oldOrder.priority = priority;
            oldOrder.date = date;
            oldOrder.status = status;
            oldOrder.requiredPart = requiredPart;
            oldOrder.requiredQuantity = requiredQuantity;
            oldOrder.waitingReason = waitingReason;
            oldOrder.expectedResumeDate = expectedResumeDate;
            oldOrder.waitingNotes = waitingNotes;

            showAlert("Work order " + id + " updated.", "success");
            logActivity(equipment, "Work order " + id + " updated to status '" + status + "'", status === "Waiting for Parts" ? "badge-waiting" : "badge-in-progress");
        }
    }

    // Crucial Loop: Synchronize machine status in iemrs_equipment
    syncEquipmentStatusOnWorkOrder(equipment, status, date);

    // If Completed, consume spare parts from inventory if available
    if (status === "Completed" && requiredPart && requiredQuantity > 0) {
        consumeSpareParts(requiredPart, requiredQuantity, id);
    }

    localStorage.setItem("forge_workorders", JSON.stringify(ordersList));

    orderModalInstance.hide();
    filterAndRenderTable();
    updateKpiCards();
}

// Open Edit Modal
function editOrder(id) {
    let index = -1;
    for (let i = 0; i < ordersList.length; i++) {
        if (ordersList[i].id === id) {
            index = i;
            break;
        }
    }

    if (index === -1) return;

    populateFormDropdowns();

    let o = ordersList[index];

    document.getElementById("editIndex").value = index;
    document.getElementById("orderId").value = o.id;
    document.getElementById("orderId").setAttribute("readonly", true);
    document.getElementById("orderEquipment").value = o.equipment;
    document.getElementById("orderProblem").value = o.problem;
    document.getElementById("orderTechnician").value = o.technician;
    document.getElementById("orderPriority").value = o.priority;
    document.getElementById("orderDate").value = o.date;
    document.getElementById("orderStatus").value = o.status;

    document.getElementById("orderRequiredPart").value = o.requiredPart || "";
    document.getElementById("orderRequiredQty").value = o.requiredQuantity || 0;
    document.getElementById("orderWaitingReason").value = o.waitingReason || "";
    document.getElementById("orderExpectedResume").value = o.expectedResumeDate || "";
    document.getElementById("orderWaitingNotes").value = o.waitingNotes || "";

    document.getElementById("orderModalLabel").textContent = "Edit Work Order (" + o.id + ")";
    updatePartAvailabilityNotice();
    orderModalInstance.show();
}

// Resume Work Order manually (Waiting for Parts -> In Progress)
function resumeWorkOrder(id) {
    let order = ordersList.find(o => o.id === id);
    if (!order) return;

    order.status = "In Progress";
    order.waitingReason = "";
    localStorage.setItem("forge_workorders", JSON.stringify(ordersList));

    syncEquipmentStatusOnWorkOrder(order.equipment, "In Progress");
    logActivity(order.equipment, "Work order " + id + " resumed (Waiting for Parts -> In Progress)", "badge-in-progress");

    showAlert("Work order " + id + " resumed to In Progress.", "success");
    filterAndRenderTable();
    updateKpiCards();
}

// Reschedule Modal Operations
function openRescheduleModal(id) {
    let order = ordersList.find(o => o.id === id);
    if (!order) return;

    document.getElementById("rescheduleOrderId").value = order.id;
    document.getElementById("rescheduleOrderDisplay").value = order.id + " - " + order.equipment;
    document.getElementById("rescheduleOriginalDate").value = order.originalDate || order.date;
    document.getElementById("rescheduleNewDate").value = "";
    document.getElementById("rescheduleReason").value = "";

    rescheduleModalInstance.show();
}

function handleRescheduleSubmit(event) {
    event.preventDefault();

    let id = document.getElementById("rescheduleOrderId").value;
    let newDate = document.getElementById("rescheduleNewDate").value;
    let reason = document.getElementById("rescheduleReason").value.trim();

    if (!newDate || !reason) {
        showAlert("Please specify both new date and reason.", "danger");
        return;
    }

    let order = ordersList.find(o => o.id === id);
    if (!order) return;

    if (!order.originalDate) {
        order.originalDate = order.date;
    }
    order.date = newDate;
    order.rescheduledDate = newDate;
    order.rescheduleReason = reason;

    localStorage.setItem("forge_workorders", JSON.stringify(ordersList));

    rescheduleModalInstance.hide();
    showAlert("Work order " + id + " rescheduled to " + newDate + ".", "info");
    logActivity(order.equipment, "Work order " + id + " rescheduled to " + newDate + " (Reason: " + reason + ")", "badge-scheduled");

    filterAndRenderTable();
}

// Consume spare parts from inventory upon Work Order completion
function consumeSpareParts(partName, quantity, orderId) {
    let inventory = JSON.parse(localStorage.getItem("forge_inventory") || localStorage.getItem("iemrs_inventory")) || [];
    let partIndex = inventory.findIndex(p => p.name === partName);

    if (partIndex !== -1) {
        let part = inventory[partIndex];
        let currentQty = parseInt(part.quantity) || 0;
        let deductQty = Math.min(currentQty, quantity);
        part.quantity = Math.max(0, currentQty - deductQty);

        localStorage.setItem("forge_inventory", JSON.stringify(inventory));
        logActivity(part.name, "Consumed " + deductQty + " units for Work Order " + orderId, "badge-maintenance");

        // If stock level dropped below minStock, log warning
        if (part.quantity <= part.minStock) {
            logActivity(part.name, "Stock alert: only " + part.quantity + " left after WO-" + orderId + " repair", "badge-faulty");
        }
    }
}

// Delete Order after styled confirmation
function deleteOrder(id) {
    let target = ordersList.find(o => o.id === id);
    let targetName = target ? (target.equipment + " — " + (target.problem || target.description || "Work Order")) : id;

    forgeConfirm({
        title: "CANCEL / DELETE WORK ORDER",
        message: "Are you sure you want to permanently delete work order [" + id + "] for " + targetName + "?",
        confirmText: "Delete Order",
        confirmBtnClass: "btn-danger",
        onConfirm: function () {
            ordersList = ordersList.filter(o => o.id !== id);
            localStorage.setItem("forge_workorders", JSON.stringify(ordersList));
            localStorage.setItem("iemrs_workorders", JSON.stringify(ordersList));

            if (target) {
                logActivity(target.equipment, "Work order " + id + " deleted from records", "badge-faulty");
            }

            showAlert("Work order " + id + " deleted.", "danger");
            filterAndRenderTable();
            updateKpiCards();
        }
    });
}

// Export Filtered Work Orders Table to CSV
function exportWorkOrdersCSV() {
    let query = (document.getElementById("searchInput") ? document.getElementById("searchInput").value : "").toLowerCase().trim();
    let priorityVal = document.getElementById("priorityFilter") ? document.getElementById("priorityFilter").value : "All";
    let statusVal = document.getElementById("statusFilter") ? document.getElementById("statusFilter").value : "All";

    let filtered = ordersList.filter(function (order) {
        let matchesQuery = !query ||
            order.id.toLowerCase().includes(query) ||
            order.equipment.toLowerCase().includes(query) ||
            (order.problem || "").toLowerCase().includes(query) ||
            (order.technician || "").toLowerCase().includes(query);

        let matchesPriority = (priorityVal === "All") || (order.priority === priorityVal);
        let matchesStatus = (statusVal === "All") || (order.status === statusVal);

        return matchesQuery && matchesPriority && matchesStatus;
    });

    let rows = filtered.map(function (o) {
        return {
            "Work Order ID": o.id,
            "Target Equipment": o.equipment,
            "Incident / Scope": o.problem || o.description || "",
            "Assigned Technician": o.technician,
            "Priority": o.priority,
            "Scheduled Date": o.date || o.scheduledDate || "",
            "Operational Status": o.status,
            "Required Spare Part": o.requiredPart || "None",
            "Quantity Required": o.requiredQuantity || 0,
            "Bottleneck Reason": o.waitingReason || ""
        };
    });

    exportTableToCSV("forge_work_orders_dispatch_" + new Date().toISOString().split("T")[0] + ".csv", rows);
}



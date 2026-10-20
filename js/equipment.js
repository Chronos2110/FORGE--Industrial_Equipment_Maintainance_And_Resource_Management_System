// ==========================================================================
// FORGE - Equipment Management JavaScript (js/equipment.js)
// Simple CRUD, Search, Status Filter & localStorage Persistence
// ==========================================================================

let equipmentList = [];
let equipmentModalInstance = null;

document.addEventListener("DOMContentLoaded", function () {
    // 1. Initialize modal instance
    let modalElement = document.getElementById("equipmentModal");
    if (modalElement && typeof bootstrap !== "undefined") {
        equipmentModalInstance = new bootstrap.Modal(modalElement);
    }

    // 2. Load data from localStorage
    loadEquipmentData();

    // 3. Bind search and filter events
    let searchInput = document.getElementById("searchInput");
    if (searchInput) searchInput.addEventListener("input", filterAndRenderTable);

    let statusFilter = document.getElementById("statusFilter");
    if (statusFilter) statusFilter.addEventListener("change", filterAndRenderTable);

    // 3b. Bind Segmented View Switcher (Table vs Floor Schematic)
    let btnTable = document.getElementById("btnEquipmentViewTable");
    let btnSchematic = document.getElementById("btnEquipmentViewSchematic");
    if (btnTable) btnTable.addEventListener("click", function () { setEquipmentView("table"); });
    if (btnSchematic) btnSchematic.addEventListener("click", function () { setEquipmentView("schematic"); });

    // 4. Bind Add Equipment button
    let addBtn = document.getElementById("addNewEquipmentBtn");
    if (addBtn) addBtn.addEventListener("click", resetForm);

    // 5. Bind form submit for Add / Edit
    let formEl = document.getElementById("equipmentForm");
    if (formEl) formEl.addEventListener("submit", handleFormSubmit);

    // 6. Handle URL parameters (?action=new, ?id=EQ001, ?view=schematic)
    handleUrlParams();

    // 7. Bind Export CSV button
    let exportBtn = document.getElementById("exportEquipmentCsvBtn");
    if (exportBtn) exportBtn.addEventListener("click", exportEquipmentCSV);
});

// Switch between Register Table and Live Floor Schematic View
function setEquipmentView(view) {
    let btnTable = document.getElementById("btnEquipmentViewTable");
    let btnSchematic = document.getElementById("btnEquipmentViewSchematic");
    let tableView = document.getElementById("equipmentTableView");
    let schematicView = document.getElementById("equipmentSchematicView");

    if (view === "schematic") {
        if (btnSchematic) btnSchematic.classList.add("active");
        if (btnTable) btnTable.classList.remove("active");
        if (schematicView) schematicView.classList.remove("d-none");
        if (tableView) tableView.classList.add("d-none");
        if (typeof ForgeFloorSchematic !== "undefined") {
            ForgeFloorSchematic.render("equipmentFloorSchematicContainer");
        }
    } else {
        if (btnTable) btnTable.classList.add("active");
        if (btnSchematic) btnSchematic.classList.remove("active");
        if (tableView) tableView.classList.remove("d-none");
        if (schematicView) schematicView.classList.add("d-none");
        filterAndRenderTable();
    }
}

// Load data from localStorage
function loadEquipmentData() {
    let saved = localStorage.getItem("forge_equipment") || localStorage.getItem("iemrs_equipment");
    if (saved) {
        equipmentList = JSON.parse(saved);
    } else {
        equipmentList = [];
    }
    filterAndRenderTable();
    updateKpiCards();
}

// Update summary metric cards
function updateKpiCards() {
    let total = equipmentList.length;
    let operational = 0;
    let maintenance = 0;
    let faulty = 0;

    for (let i = 0; i < equipmentList.length; i++) {
        let st = equipmentList[i].status;
        if (st === "Operational") operational++;
        else if (st === "Maintenance") maintenance++;
        else if (st === "Faulty") faulty++;
    }

    document.getElementById("kpiTotal").textContent = total;
    document.getElementById("kpiOperational").textContent = operational;
    document.getElementById("kpiMaintenance").textContent = maintenance;
    document.getElementById("kpiFaulty").textContent = faulty;
}

// Filter and render table rows
function filterAndRenderTable() {
    let query = document.getElementById("searchInput").value.toLowerCase().trim();
    let filterStatus = document.getElementById("statusFilter").value;
    let tbody = document.getElementById("equipmentTableBody");
    let emptyState = document.getElementById("equipmentEmptyState");

    tbody.innerHTML = "";

    let filtered = [];

    for (let i = 0; i < equipmentList.length; i++) {
        let item = equipmentList[i];
        let matchesQuery =
            item.id.toLowerCase().includes(query) ||
            item.name.toLowerCase().includes(query) ||
            item.type.toLowerCase().includes(query) ||
            item.location.toLowerCase().includes(query);

        let matchesStatus = (filterStatus === "All") || (item.status === filterStatus);

        if (matchesQuery && matchesStatus) {
            filtered.push(item);
        }
    }

    // Update records count label
    document.getElementById("recordsCount").textContent = filtered.length + " Records";

    // Handle Empty State
    if (filtered.length === 0) {
        emptyState.classList.remove("d-none");
        return;
    }

    emptyState.classList.add("d-none");

    // Render Rows
    for (let j = 0; j < filtered.length; j++) {
        let eq = filtered[j];
        let tr = document.createElement("tr");

        let badgeClass = "badge-operational";
        if (eq.status === "Maintenance") {
            badgeClass = "badge-maintenance";
        } else if (eq.status === "Faulty") {
            badgeClass = "badge-faulty";
        }

        var role = (typeof getActiveRole === "function") ? getActiveRole() : "Administrator";
        var dossierBtn = "<button type='button' class='btn-action-view' data-action='view-dossier' data-equipment-id='" + escapeHTML(eq.id) + "' title='Open 360° Technical Dossier' style='background:var(--surface-elevated);border:1px solid var(--border-color);color:var(--text-primary);padding:3px 7px;font-size:0.72rem;font-weight:600;'>Dossier</button>";
        var actionsHtml = "";

        if (role === "Operator" || role === "Technician") {
            actionsHtml = "<div class='btn-action-group justify-content-center'>" + dossierBtn + "</div>";
        } else {
            actionsHtml =
                "  <div class='btn-action-group justify-content-center'>" +
                dossierBtn +
                "    <button type='button' class='btn-action-edit' onclick='editEquipment(\"" + escapeHTML(eq.id) + "\")'>Edit</button>" +
                "    <button type='button' class='btn-action-delete' onclick='deleteEquipment(\"" + escapeHTML(eq.id) + "\")'>Delete</button>" +
                "  </div>";
        }

        tr.innerHTML =
            "<td class='font-mono'><a href='javascript:void(0)' data-action='view-dossier' data-equipment-id='" + escapeHTML(eq.id) + "' class='badge-eq-dossier' title='Open 360° Technical Dossier' style='color:var(--primary); font-weight:700; text-decoration:underline; cursor:pointer;'><strong>" + escapeHTML(eq.id) + "</strong></a></td>" +
            "<td><a href='javascript:void(0)' data-action='view-dossier' data-equipment-id='" + escapeHTML(eq.id) + "' class='badge-eq-dossier' title='Open 360° Technical Dossier' style='color:var(--text-primary); font-weight:700; text-decoration:none; cursor:pointer;'><strong>" + escapeHTML(eq.name) + "</strong></a></td>" +
            "<td>" + escapeHTML(eq.type) + "</td>" +
            "<td>" + escapeHTML(eq.location) + "</td>" +
            "<td><span class='badge-status " + badgeClass + "'>" + escapeHTML(eq.status) + "</span></td>" +
            "<td class='font-mono'>" + escapeHTML(eq.lastMaintenance) + "</td>" +
            "<td class='font-mono'>" + escapeHTML(eq.nextMaintenance) + "</td>" +
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
                if (equipmentModalInstance) equipmentModalInstance.show();
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
    if (viewParam === "schematic") {
        setEquipmentView("schematic");
    }
}

// Reset form for new equipment
function resetForm() {
    document.getElementById("equipmentForm").reset();
    document.getElementById("editIndex").value = "-1";
    document.getElementById("eqId").removeAttribute("readonly");
    document.getElementById("equipmentModalLabel").textContent = "Add New Equipment";
}

// Handle Form Submission (Add or Edit)
function handleFormSubmit(event) {
    event.preventDefault();

    let submitBtn = event.target ? event.target.querySelector("button[type='submit']") : null;
    if (submitBtn) {
        if (submitBtn.disabled) return;
        submitBtn.disabled = true;
        setTimeout(() => { if (submitBtn) submitBtn.disabled = false; }, 1000);
    }

    let editIndexVal = parseInt(document.getElementById("editIndex").value);
    let id = document.getElementById("eqId").value.trim();
    let name = document.getElementById("eqName").value.trim();
    let type = document.getElementById("eqType").value;
    let location = document.getElementById("eqLocation").value.trim();
    let status = document.getElementById("eqStatus").value;
    let lastMaint = document.getElementById("eqLastMaint").value;
    let nextMaint = document.getElementById("eqNextMaint").value;

    if (!id || !name || !type || !location || !status || !lastMaint || !nextMaint) {
        showAlert("Please fill in all required fields.", "danger");
        if (submitBtn) submitBtn.disabled = false;
        return;
    }

    if (editIndexVal === -1) {
        // Adding new record: check ID uniqueness
        for (let i = 0; i < equipmentList.length; i++) {
            if (equipmentList[i].id.toUpperCase() === id.toUpperCase()) {
                showAlert("Equipment ID already exists. Please choose a unique ID.", "danger");
                if (submitBtn) submitBtn.disabled = false;
                return;
            }
        }

        let newEquipment = {
            id: id,
            name: name,
            type: type,
            location: location,
            status: status,
            lastMaintenance: lastMaint,
            nextMaintenance: nextMaint
        };

        equipmentList.unshift(newEquipment);
        showAlert("Equipment " + id + " registered successfully.", "success");
        logActivity(name, "New equipment " + id + " registered (" + type + ", " + location + ")", "badge-operational");
    } else {
        // Editing existing record
        if (editIndexVal >= 0 && editIndexVal < equipmentList.length) {
            equipmentList[editIndexVal].name = name;
            equipmentList[editIndexVal].type = type;
            equipmentList[editIndexVal].location = location;
            equipmentList[editIndexVal].status = status;
            equipmentList[editIndexVal].lastMaintenance = lastMaint;
            equipmentList[editIndexVal].nextMaintenance = nextMaint;
            showAlert("Equipment " + id + " updated successfully.", "success");
            logActivity(name, "Equipment " + id + " details updated (Status: " + status + ")", status === "Maintenance" ? "badge-maintenance" : "badge-operational");
        }
    }

    // Persist in localStorage
    localStorage.setItem("forge_equipment", JSON.stringify(equipmentList));

    // Hide Modal & Refresh
    equipmentModalInstance.hide();
    filterAndRenderTable();
    updateKpiCards();
}

// Open Edit Modal for specified Equipment ID
function editEquipment(id) {
    let index = -1;
    for (let i = 0; i < equipmentList.length; i++) {
        if (equipmentList[i].id === id) {
            index = i;
            break;
        }
    }

    if (index === -1) return;

    let eq = equipmentList[index];

    document.getElementById("editIndex").value = index;
    document.getElementById("eqId").value = eq.id;
    document.getElementById("eqId").setAttribute("readonly", true);
    document.getElementById("eqName").value = eq.name;
    document.getElementById("eqType").value = eq.type;
    document.getElementById("eqLocation").value = eq.location;
    document.getElementById("eqStatus").value = eq.status;
    document.getElementById("eqLastMaint").value = eq.lastMaintenance;
    document.getElementById("eqNextMaint").value = eq.nextMaintenance;

    document.getElementById("equipmentModalLabel").textContent = "Edit Equipment (" + eq.id + ")";
    equipmentModalInstance.show();
}

// Delete specified Equipment after styled confirmation
function deleteEquipment(id) {
    var target = equipmentList.find(e => e.id === id);
    var targetName = target ? target.name : id;

    forgeConfirm({
        title: "DELETE ASSET REGISTRATION",
        message: "Are you sure you want to remove equipment [" + id + " — " + targetName + "] from the master plant registry? This cannot be undone.",
        confirmText: "Delete Asset",
        confirmBtnClass: "btn-danger",
        onConfirm: function () {
            equipmentList = equipmentList.filter(e => e.id !== id);
            localStorage.setItem("forge_equipment", JSON.stringify(equipmentList));
            localStorage.setItem("iemrs_equipment", JSON.stringify(equipmentList));

            if (target) {
                logActivity(target.name, "Equipment " + id + " removed from plant registry", "badge-faulty");
            }

            showAlert("Equipment " + id + " deleted from registry.", "danger");
            filterAndRenderTable();
            updateKpiCards();
        }
    });
}

// Export Filtered Equipment Table to CSV
function exportEquipmentCSV() {
    var query = (document.getElementById("searchInput") ? document.getElementById("searchInput").value : "").toLowerCase().trim();
    var filterStatus = document.getElementById("statusFilter") ? document.getElementById("statusFilter").value : "All";

    var filtered = equipmentList.filter(function (item) {
        var matchesQuery = !query ||
            item.id.toLowerCase().includes(query) ||
            item.name.toLowerCase().includes(query) ||
            item.type.toLowerCase().includes(query) ||
            item.location.toLowerCase().includes(query);
        var matchesStatus = (filterStatus === "All") || (item.status === filterStatus);
        return matchesQuery && matchesStatus;
    });

    var rows = filtered.map(function (eq) {
        return {
            "Equipment ID": eq.id,
            "Equipment Name": eq.name,
            "Machinery Type": eq.type,
            "Location / Bay": eq.location,
            "Operational Status": eq.status,
            "Last Serviced": eq.lastMaintenance || eq.lastMaintenanceDate || "N/A",
            "Next PM Due": eq.nextMaintenance || "N/A"
        };
    });

    exportTableToCSV("forge_equipment_register_" + new Date().toISOString().split("T")[0] + ".csv", rows);
}


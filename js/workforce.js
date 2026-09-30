// ==========================================================================
// FORGE - Workforce JavaScript (js/workforce.js)
// Dynamic Active Workload Calculation, Skill Allocation & Availability Tracking
// ==========================================================================

let workforceList = [];
let workforceModalInstance = null;

document.addEventListener("DOMContentLoaded", function () {
    // 1. Initialize modal instance
    let modalEl = document.getElementById("workforceModal");
    workforceModalInstance = new bootstrap.Modal(modalEl);

    // 2. Load data
    loadWorkforceData();

    // 3. Bind search and filter events
    document.getElementById("searchInput").addEventListener("input", filterAndRenderTable);
    document.getElementById("availabilityFilter").addEventListener("change", filterAndRenderTable);

    // 4. Add button click
    document.getElementById("addNewTechBtn").addEventListener("click", resetForm);

    // 5. Form submit
    document.getElementById("workforceForm").addEventListener("submit", handleFormSubmit);
});

// Load records from localStorage
function loadWorkforceData() {
    let saved = localStorage.getItem("forge_technicians") || localStorage.getItem("iemrs_workforce");
    if (saved) {
        workforceList = JSON.parse(saved);
    } else {
        workforceList = [];
    }
    filterAndRenderTable();
    updateKpiCards();
}

// Update summary metric cards with dynamic active workload calculation
function updateKpiCards() {
    let total = workforceList.length;
    let available = 0;
    let busy = 0;
    let unavailable = 0;

    for (let i = 0; i < workforceList.length; i++) {
        let t = workforceList[i];
        let activeOrders = calculateActiveWorkload(t.name);

        if (t.availability === "Unavailable" || t.availability === "On Leave") {
            unavailable++;
        } else if (activeOrders > 0) {
            busy++;
        } else {
            available++;
        }
    }

    document.getElementById("kpiTotalTechs").textContent = total;
    document.getElementById("kpiAvailableTechs").textContent = available;
    document.getElementById("kpiBusyTechs").textContent = busy;
    document.getElementById("kpiUnavailableTechs").textContent = unavailable;
}

// Filter and render table rows
function filterAndRenderTable() {
    let query = document.getElementById("searchInput").value.toLowerCase().trim();
    let availVal = document.getElementById("availabilityFilter").value;
    let tbody = document.getElementById("workforceTableBody");
    let emptyState = document.getElementById("workforceEmptyState");

    tbody.innerHTML = "";

    let filtered = [];

    for (let i = 0; i < workforceList.length; i++) {
        let tech = workforceList[i];
        let matchesQuery =
            tech.id.toLowerCase().includes(query) ||
            tech.name.toLowerCase().includes(query) ||
            (tech.skill || tech.specialization || "").toLowerCase().includes(query) ||
            (tech.certification || tech.certifications || "").toLowerCase().includes(query);

        let activeOrders = calculateActiveWorkload(tech.name);
        let dynamicAvail = (tech.availability === "Unavailable" || tech.availability === "On Leave")
            ? "On Leave"
            : (activeOrders > 0 ? "Busy" : "Available");

        let matchesAvail = (availVal === "All") || (dynamicAvail === availVal) || (tech.availability === availVal);

        if (matchesQuery && matchesAvail) {
            filtered.push(tech);
        }
    }

    document.getElementById("recordsCount").textContent = filtered.length + " Technicians";

    if (filtered.length === 0) {
        emptyState.classList.remove("d-none");
        return;
    }

    emptyState.classList.add("d-none");

    for (let j = 0; j < filtered.length; j++) {
        let t = filtered[j];
        let tr = document.createElement("tr");

        let activeOrders = calculateActiveWorkload(t.name);
        let dynamicAvail = (t.availability === "Unavailable" || t.availability === "On Leave")
            ? "On Leave"
            : (activeOrders > 0 ? "Busy" : "Available");

        let availBadgeClass = "badge-available";
        if (dynamicAvail === "Busy") availBadgeClass = "badge-busy";
        else if (dynamicAvail === "On Leave") availBadgeClass = "badge-unavailable";

        // Workload indicator
        let workloadHtml = "";
        if (dynamicAvail === "On Leave") {
            workloadHtml = "<span class='text-muted small'>On Leave</span>";
        } else if (activeOrders === 0) {
            workloadHtml = "<span class='badge-status badge-operational'>Low (0/3)</span>";
        } else if (activeOrders === 1) {
            workloadHtml = "<span class='badge-status badge-in-progress'>Medium (1/3)</span>";
        } else {
            workloadHtml = "<span class='badge-status badge-waiting'>High (" + activeOrders + "/3)</span>";
        }

        tr.innerHTML =
            "<td><strong>" + escapeHTML(t.id) + "</strong></td>" +
            "<td>" + escapeHTML(t.name) + "</td>" +
            "<td>" + escapeHTML(t.skill) + "</td>" +
            "<td><small class='text-muted'>" + escapeHTML(t.certification) + "</small></td>" +
            "<td><span class='badge-status " + availBadgeClass + "'>" + escapeHTML(dynamicAvail) + "</span></td>" +
            "<td><strong>" + activeOrders + "</strong></td>" +
            "<td>" + workloadHtml + "</td>" +
            "<td class='text-center'>" +
            "  <div class='btn-action-group justify-content-center'>" +
            "    <button type='button' class='btn-action-edit' onclick='editTechnician(\"" + escapeHTML(t.id) + "\")'>Edit</button>" +
            "    <button type='button' class='btn-action-delete' onclick='deleteTechnician(\"" + escapeHTML(t.id) + "\")'>Delete</button>" +
            "  </div>" +
            "</td>";

        tbody.appendChild(tr);
    }

    applyRolePermissions();
}

// Reset form
function resetForm() {
    document.getElementById("workforceForm").reset();
    document.getElementById("editIndex").value = "-1";
    document.getElementById("techId").removeAttribute("readonly");
    document.getElementById("workforceModalLabel").textContent = "Register Technician";
}

// Form Submit Handler
function handleFormSubmit(event) {
    event.preventDefault();

    let editIndexVal = parseInt(document.getElementById("editIndex").value);
    let id = document.getElementById("techId").value.trim();
    let name = document.getElementById("techName").value.trim();
    let skill = document.getElementById("techSkill").value.trim();
    let certification = document.getElementById("techCert").value.trim();
    let availability = document.getElementById("techAvailability").value;
    let workloadNote = document.getElementById("techWorkload").value.trim() || "Active Personnel";

    if (!id || !name || !skill || !certification || !availability) {
        showAlert("Please fill in all required fields.", "danger");
        return;
    }

    if (editIndexVal === -1) {
        // Add new
        for (let i = 0; i < workforceList.length; i++) {
            if (workforceList[i].id.toUpperCase() === id.toUpperCase()) {
                showAlert("Technician ID already exists. Please choose a unique ID.", "danger");
                return;
            }
        }

        let newTech = {
            id: id,
            name: name,
            skill: skill,
            certification: certification,
            availability: availability,
            workload: workloadNote
        };

        workforceList.unshift(newTech);
        showAlert("Technician " + name + " registered.", "success");
        logActivity(name, "New technician registered (" + skill + ")", "badge-available");
    } else {
        // Edit existing
        if (editIndexVal >= 0 && editIndexVal < workforceList.length) {
            workforceList[editIndexVal].name = name;
            workforceList[editIndexVal].skill = skill;
            workforceList[editIndexVal].certification = certification;
            workforceList[editIndexVal].availability = availability;
            workforceList[editIndexVal].workload = workloadNote;
            showAlert("Technician " + name + " profile updated.", "success");
            logActivity(name, "Technician profile updated (Availability: " + availability + ")", "badge-in-progress");
        }
    }

    localStorage.setItem("forge_technicians", JSON.stringify(workforceList));

    workforceModalInstance.hide();
    filterAndRenderTable();
    updateKpiCards();
}

// Open Edit Modal
function editTechnician(id) {
    let index = -1;
    for (let i = 0; i < workforceList.length; i++) {
        if (workforceList[i].id === id) {
            index = i;
            break;
        }
    }

    if (index === -1) return;

    let t = workforceList[index];

    document.getElementById("editIndex").value = index;
    document.getElementById("techId").value = t.id;
    document.getElementById("techId").setAttribute("readonly", true);
    document.getElementById("techName").value = t.name;
    document.getElementById("techSkill").value = t.skill;
    document.getElementById("techCert").value = t.certification;
    document.getElementById("techAvailability").value = t.availability;
    document.getElementById("techWorkload").value = t.workload || "";

    document.getElementById("workforceModalLabel").textContent = "Edit Technician (" + t.id + ")";
    workforceModalInstance.show();
}

// Delete Technician
function deleteTechnician(id) {
    let confirmed = confirm("Are you sure you want to remove technician [" + id + "] from roster?");
    if (!confirmed) return;

    let target = workforceList.find(t => t.id === id);
    workforceList = workforceList.filter(t => t.id !== id);
    localStorage.setItem("forge_technicians", JSON.stringify(workforceList));

    if (target) {
        logActivity(target.name, "Technician " + id + " removed from roster", "badge-faulty");
    }

    showAlert("Technician " + id + " removed.", "danger");
    filterAndRenderTable();
    updateKpiCards();
}


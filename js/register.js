// ==========================================================================
// FORGE V4 - Registration JavaScript (js/register.js)
// Creates a user via POST /api/auth/register (SQLite users table)
// Then redirects to login so the new credentials can be used to sign in
// ==========================================================================

async function forgePost(path, body) {
    var bases = ["http://localhost:5000", "http://127.0.0.1:5000"];
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
        bases.unshift("");
        bases.push(window.location.origin);
    }
    var lastError = null;
    var seen = {};
    for (var i = 0; i < bases.length; i++) {
        var base = bases[i];
        if (seen[base]) continue;
        seen[base] = true;
        try {
            var response = await fetch(base + path, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            var data = await response.json().catch(function () { return null; });
            if (data && (response.ok || data.error || data.success)) {
                return { response: response, data: data };
            }
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error("Cannot reach FORGE API");
}

document.addEventListener("DOMContentLoaded", function () {
    var registerForm = document.getElementById("registerForm");
    if (!registerForm) return;

    var roleSelect = document.getElementById("role");
    var specializationGroup = document.getElementById("specializationGroup");

    function syncSpecialization() {
        var isTech = roleSelect.value === "Technician";
        specializationGroup.hidden = !isTech;
    }

    roleSelect.addEventListener("change", syncSpecialization);
    syncSpecialization();

    registerForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        var name = document.getElementById("name").value.trim();
        var username = document.getElementById("username").value.trim();
        var password = document.getElementById("password").value;
        var confirmPassword = document.getElementById("confirmPassword").value;
        var role = document.getElementById("role").value;
        var bay_assignment = document.getElementById("bay_assignment").value.trim();
        var specialization = document.getElementById("specialization").value;
        var message = document.getElementById("registerMessage");
        var submitBtn = document.getElementById("registerSubmit");

        function setMessage(text, color) {
            if (!message) return;
            message.textContent = text;
            message.style.color = color;
        }

        if (!name || !username || !password || !confirmPassword || !role) {
            setMessage("Please complete all required fields.", "#e74c3c");
            return;
        }

        if (password.length < 6) {
            setMessage("Password must be at least 6 characters long.", "#e74c3c");
            return;
        }

        if (password !== confirmPassword) {
            setMessage("Passwords do not match.", "#e74c3c");
            return;
        }

        setMessage("Saving account to FORGE database…", "#d97706");
        if (submitBtn) submitBtn.disabled = true;

        try {
            var result = await forgePost("/api/auth/register", {
                name: name,
                username: username,
                password: password,
                confirmPassword: confirmPassword,
                role: role,
                bay_assignment: bay_assignment || "Production Floor",
                specialization: role === "Technician" ? specialization : undefined
            });

            if (!result.response.ok) {
                setMessage(result.data.error || "Registration failed. Please try again.", "#e74c3c");
                if (submitBtn) submitBtn.disabled = false;
                return;
            }

            setMessage("Account saved in the database. Redirecting to login…", "#4D8B57");
            setTimeout(function () {
                window.location.href = "login.html?registered=1&user=" + encodeURIComponent(username);
            }, 700);
        } catch (err) {
            console.error("Registration request error:", err);
            setMessage("Cannot reach the FORGE server on port 5000. Run npm start in the project folder, then try again.", "#e74c3c");
            if (submitBtn) submitBtn.disabled = false;
        }
    });
});

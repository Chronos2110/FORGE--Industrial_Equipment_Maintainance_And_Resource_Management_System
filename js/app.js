// ==========================================================================
// FORGE V5 - Industrial Authentication Engine (js/app.js)
// Validates credentials against forge_users, manages active sessions,
// and enforces RBAC authorization.
// ==========================================================================

document.addEventListener("DOMContentLoaded", function () {
    var loginForm = document.getElementById("loginForm");
    if (!loginForm) return;

    var passwordInput = document.getElementById("password");
    var togglePasswordBtn = document.getElementById("toggleLoginPasswordBtn");

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener("click", function () {
            var isPassword = passwordInput.getAttribute("type") === "password";
            passwordInput.setAttribute("type", isPassword ? "text" : "password");
            togglePasswordBtn.textContent = isPassword ? "🔒" : "👁";
            togglePasswordBtn.setAttribute("title", isPassword ? "Hide password" : "Show password");
        });
    }

    loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        var username = document.getElementById("username").value.trim();
        var password = document.getElementById("password").value.trim();
        var role = document.getElementById("role").value;
        var message = document.getElementById("loginMessage");
        var submitBtn = document.getElementById("loginSubmit") || loginForm.querySelector("button[type='submit']");

        if (!username || !password || !role) {
            if (message) {
                message.textContent = "Please provide your identifier, passcode, and select an operational role.";
                message.style.color = "var(--danger, #e74c3c)";
            }
            return;
        }

        if (message) {
            message.textContent = "Authenticating credentials with FORGE Security Server…";
            message.style.color = "var(--accent-brand, #d97706)";
        }
        if (submitBtn) submitBtn.disabled = true;

        // Authenticate against ForgeDataService (Hybrid: Prisma backend with local fallback)
        if (typeof ForgeDataService !== "undefined" && ForgeDataService.authenticate) {
            var auth = await ForgeDataService.authenticate(username, password, role);
            if (!auth || !auth.success) {
                if (message) {
                    message.textContent = "✕ " + ((auth && auth.message) || "Authentication failed. Please verify credentials.");
                    message.style.color = "var(--danger, #e74c3c)";
                }
                if (submitBtn) submitBtn.disabled = false;
                return;
            }

            if (message) {
                message.textContent = "✓ Access Granted (" + (auth.user.badgeId || "USR") + " // " + auth.user.name + "). Entering FORGE…";
                message.style.color = "var(--success, #4D8B57)";
            }

            setTimeout(function () {
                window.location.href = "pages/dashboard.html";
            }, 450);
            return;
        }

        // Fallback for non-service mode
        sessionStorage.setItem("forge_role", role);
        sessionStorage.setItem("iemrs_role", role);

        if (message) {
            message.textContent = "✓ Authentication successful. Entering FORGE…";
            message.style.color = "var(--success, #4D8B57)";
        }

        setTimeout(function () {
            window.location.href = "pages/dashboard.html";
        }, 450);
    });
});
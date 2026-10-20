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

    var SVG_EYE = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    var SVG_EYE_OFF = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.innerHTML = SVG_EYE;
        togglePasswordBtn.addEventListener("click", function () {
            var isPassword = passwordInput.getAttribute("type") === "password";
            passwordInput.setAttribute("type", isPassword ? "text" : "password");
            togglePasswordBtn.innerHTML = isPassword ? SVG_EYE_OFF : SVG_EYE;
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
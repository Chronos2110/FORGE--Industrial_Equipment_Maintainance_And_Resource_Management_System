// ==========================================================================
// FORGE V4 - Login JavaScript (js/app.js)
// Stores role in both forge_role and iemrs_role for backward compatibility
// ==========================================================================

document.addEventListener("DOMContentLoaded", function () {
    var loginForm = document.getElementById("loginForm");
    if (!loginForm) return;

    loginForm.addEventListener("submit", function (event) {
        event.preventDefault();

        var username = document.getElementById("username").value.trim();
        var password = document.getElementById("password").value.trim();
        var role = document.getElementById("role").value;
        var message = document.getElementById("loginMessage");

        if (!username || !password || !role) {
            if (message) {
                message.innerHTML = "Please enter username, password, and select a role.";
                message.style.color = "#e74c3c";
            }
            return;
        }

        if (message) {
            message.innerHTML = "Authentication successful. Redirecting…";
            message.style.color = "#4D8B57";
        }

        // Store role in both keys for full V4 + legacy compatibility
        sessionStorage.setItem("forge_role",  role);
        sessionStorage.setItem("iemrs_role",  role);

        setTimeout(function () {
            window.location.href = "pages/dashboard.html";
        }, 500);
    });
});
// ==========================================================================
// FORGE V4 - Login JavaScript (js/app.js)
// Authenticates credentials against backend /api/auth/login
// Stores JWT token and user profile in sessionStorage
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
            if (data && (response.ok || data.error || data.success || data.token)) {
                return { response: response, data: data };
            }
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error("Cannot reach FORGE API");
}

document.addEventListener("DOMContentLoaded", function () {
    var loginForm = document.getElementById("loginForm");
    if (!loginForm) return;

    var params = new URLSearchParams(window.location.search);
    var message = document.getElementById("loginMessage");
    if (params.get("registered") === "1" && message) {
        message.textContent = "Account created. Sign in with your new credentials.";
        message.style.color = "#4D8B57";
        var registeredUser = params.get("user");
        if (registeredUser) {
            document.getElementById("username").value = registeredUser;
        }
    }

    loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        var username = document.getElementById("username").value.trim();
        var password = document.getElementById("password").value;
        var role = document.getElementById("role").value;
        var messageEl = document.getElementById("loginMessage");

        if (!username || !password || !role) {
            if (messageEl) {
                messageEl.textContent = "Please enter username, password, and select a role.";
                messageEl.style.color = "#e74c3c";
            }
            return;
        }

        if (messageEl) {
            messageEl.textContent = "Authenticating with FORGE Security Server…";
            messageEl.style.color = "#d97706";
        }

        try {
            var result = await forgePost("/api/auth/login", {
                username: username,
                password: password,
                role: role
            });

            if (!result.response.ok) {
                if (messageEl) {
                    messageEl.textContent = result.data.error || "Authentication failed.";
                    messageEl.style.color = "#e74c3c";
                }
                return;
            }

            if (messageEl) {
                messageEl.textContent = "Authentication verified. Loading plant telemetry…";
                messageEl.style.color = "#4D8B57";
            }

            sessionStorage.setItem("forge_token", result.data.token);
            sessionStorage.setItem("forge_user", JSON.stringify(result.data.user));
            sessionStorage.setItem("forge_role", role);
            sessionStorage.setItem("iemrs_role", role);

            setTimeout(function () {
                window.location.href = "pages/dashboard.html";
            }, 400);
        } catch (err) {
            console.warn("Backend server offline, activating offline fallback:", err.message);
            if (messageEl) {
                messageEl.textContent = "Live backend offline. Entering in Offline Demo Mode...";
                messageEl.style.color = "#d97706";
            }
            sessionStorage.setItem("forge_role", role);
            sessionStorage.setItem("iemrs_role", role);
            sessionStorage.setItem("forge_user", JSON.stringify({
                name: username,
                email: (username.includes('@') ? username : username + '@forge.industrial'),
                role: role
            }));
            setTimeout(function () {
                window.location.href = "pages/dashboard.html";
            }, 500);
        }
    });
});

// ==========================================================================
// FORGE V5 - Dedicated Personnel Self-Registration & Auto-Provisioning (js/register.js)
// Handles: Dynamic Role-Adaptive Forms, Automated Badge Generation,
//          Password Strength Meter, and Workforce Auto-Provisioning
// ==========================================================================

document.addEventListener("DOMContentLoaded", function () {
    var registerForm = document.getElementById("registerForm");
    if (!registerForm) return;

    var selectedRoleInput = document.getElementById("selectedRole");
    var roleCards = document.querySelectorAll(".role-select-card");
    var adaptiveContainer = document.getElementById("roleAdaptiveSection");
    var badgeInput = document.getElementById("regBadgeId");
    var btnAutoBadge = document.getElementById("btnAutoBadge");
    var passwordInput = document.getElementById("regPassword");
    var confirmPasswordInput = document.getElementById("regPasswordConfirm");
    var togglePassBtn = document.getElementById("toggleRegPassword");
    var toggleConfirmBtn = document.getElementById("toggleRegPasswordConfirm");
    var messageEl = document.getElementById("registerMessage");

    var currentRole = "Technician";

    // 1. Role Selector Card Click & Keyboard Handlers
    roleCards.forEach(function (card) {
        function activateCard() {
            var r = card.getAttribute("data-role");
            setRole(r);
        }

        card.addEventListener("click", activateCard);
        card.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                activateCard();
            }
        });
    });

    function setRole(role) {
        currentRole = role;
        if (selectedRoleInput) selectedRoleInput.value = role;

        roleCards.forEach(function (c) {
            var isTarget = c.getAttribute("data-role") === role;
            c.classList.toggle("active", isTarget);
            c.setAttribute("aria-checked", String(isTarget));
        });

        renderAdaptiveFields(role);
        suggestBadgeId(role);
    }

    // 2. Render Role-Adaptive Form Fields
    function renderAdaptiveFields(role) {
        if (!adaptiveContainer) return;

        if (role === "Administrator") {
            adaptiveContainer.innerHTML =
                '<div class="mb-2">' +
                    '<div class="d-flex justify-content-between align-items-center mb-1">' +
                        '<label for="regClearanceCode" class="form-label small mb-0 font-weight-bold">Plant Security Clearance Code</label>' +
                        '<button type="button" class="btn btn-sm btn-outline-warning font-mono" id="btnFillDemoClearance" style="font-size:0.7rem; padding: 2px 8px;">' +
                            '🔑 Fill Demo Clearance Code (FORGE-ADM-2026)' +
                        '</button>' +
                    '</div>' +
                    '<input type="text" id="regClearanceCode" class="form-control form-control-sm font-mono" placeholder="Enter security clearance code" required autocomplete="off">' +
                    '<div class="form-text small text-muted font-mono" style="font-size:0.72rem;">' +
                        'Security clearance required for plant supervisor privilege gating and asset administration.' +
                    '</div>' +
                '</div>';

            var fillBtn = document.getElementById("btnFillDemoClearance");
            if (fillBtn) {
                fillBtn.addEventListener("click", function () {
                    var input = document.getElementById("regClearanceCode");
                    if (input) {
                        input.value = "FORGE-ADM-2026";
                        input.classList.add("border-success");
                        fillBtn.classList.remove("btn-outline-warning");
                        fillBtn.classList.add("btn-success");
                        fillBtn.textContent = "✓ Clearance Code Applied";
                        setTimeout(function () {
                            fillBtn.classList.add("btn-outline-warning");
                            fillBtn.classList.remove("btn-success");
                            fillBtn.textContent = "🔑 Fill Demo Clearance Code (FORGE-ADM-2026)";
                        }, 2000);
                    }
                });
            }

        } else if (role === "Technician") {
            adaptiveContainer.innerHTML =
                '<div class="row g-2">' +
                    '<div class="col-md-6">' +
                        '<label for="regTechSpecialization" class="form-label small font-weight-bold">Primary Technical Specialization</label>' +
                        '<select id="regTechSpecialization" class="form-select form-select-sm" required>' +
                            '<option value="Mechanical" selected>Mechanical (Milling, Lathes, Drive Systems)</option>' +
                            '<option value="Electrical">Electrical (High Voltage, Motors, Control Panels)</option>' +
                            '<option value="Hydraulics">Hydraulics (Presses, Fluid Power, Valves & Seals)</option>' +
                            '<option value="PLC & Automation">PLC &amp; Automation (Siemens, Sensors, SCADA)</option>' +
                            '<option value="Instrumentation">Instrumentation (Sensors, Flow Meters, Vibration)</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="col-md-6">' +
                        '<label for="regTechShift" class="form-label small font-weight-bold">Assigned Shift Pattern</label>' +
                        '<select id="regTechShift" class="form-select form-select-sm" required>' +
                            '<option value="Day Shift (06:00 - 14:00)" selected>Day Shift (06:00 - 14:00)</option>' +
                            '<option value="Swing Shift (14:00 - 22:00)">Swing Shift (14:00 - 22:00)</option>' +
                            '<option value="Night Shift (22:00 - 06:00)">Night Shift (22:00 - 06:00)</option>' +
                        '</select>' +
                    '</div>' +
                '</div>' +
                '<div class="mt-2 text-gold font-mono small d-flex align-items-center gap-1" style="font-size:0.72rem;">' +
                    '<span>⚡ Automatic Provisioning:</span> Account will immediately appear in Workforce Roster &amp; receive dispatch orders.' +
                '</div>';

        } else if (role === "Operator") {
            var eqOptions = "";
            if (typeof getEquipmentList === "function") {
                var eqList = getEquipmentList();
                eqOptions = eqList.map(function (eq) {
                    return '<option value="' + escapeHTML(eq.name) + '">' + escapeHTML(eq.name) + ' [' + escapeHTML(eq.id) + ' — ' + escapeHTML(eq.type) + ']</option>';
                }).join("");
            } else {
                eqOptions =
                    '<option value="CNC Machine 01" selected>CNC Machine 01 [EQ001]</option>' +
                    '<option value="Hydraulic Press 02">Hydraulic Press 02 [EQ002]</option>' +
                    '<option value="Compressor 04">Compressor 04 [EQ003]</option>' +
                    '<option value="Lathe Machine 03">Lathe Machine 03 [EQ004]</option>' +
                    '<option value="Industrial Pump 01">Industrial Pump 01 [EQ005]</option>' +
                    '<option value="Conveyor Belt 02">Conveyor Belt 02 [EQ006]</option>';
            }

            adaptiveContainer.innerHTML =
                '<div class="row g-2">' +
                    '<div class="col-md-7">' +
                        '<label for="regOperatorMachine" class="form-label small font-weight-bold">Primary Assigned Machine / Bay Station</label>' +
                        '<select id="regOperatorMachine" class="form-select form-select-sm" required>' +
                            eqOptions +
                        '</select>' +
                    '</div>' +
                    '<div class="col-md-5">' +
                        '<label for="regOperatorShift" class="form-label small font-weight-bold">Assigned Shift Pattern</label>' +
                        '<select id="regOperatorShift" class="form-select form-select-sm" required>' +
                            '<option value="Day Shift (06:00 - 14:00)" selected>Day Shift (06:00 - 14:00)</option>' +
                            '<option value="Swing Shift (14:00 - 22:00)">Swing Shift (14:00 - 22:00)</option>' +
                            '<option value="Night Shift (22:00 - 06:00)">Night Shift (22:00 - 06:00)</option>' +
                        '</select>' +
                    '</div>' +
                '</div>' +
                '<div class="mt-2 text-muted font-mono small" style="font-size:0.72rem;">' +
                    'Station assignment connects operator account to shop-floor telemetry and fault incident logging.' +
                '</div>';
        }
    }

    // 3. Automated Badge ID Generation
    function suggestBadgeId(role) {
        if (!badgeInput) return;

        var users = (typeof ForgeDataService !== "undefined" && ForgeDataService.getUsers) ? ForgeDataService.getUsers() : [];
        var techs = (typeof ForgeDataService !== "undefined" && ForgeDataService.list) ? ForgeDataService.list("technicians") : [];

        var prefix = "TECH-";
        var maxNum = 0;

        if (role === "Technician") {
            prefix = "TECH-";
            techs.forEach(function (t) {
                var m = (t.id || "").match(/TECH-(\d+)/i);
                if (m) {
                    var n = parseInt(m[1], 10);
                    if (n > maxNum) maxNum = n;
                }
            });
            users.forEach(function (u) {
                var m = (u.badgeId || "").match(/TECH-(\d+)/i);
                if (m) {
                    var n = parseInt(m[1], 10);
                    if (n > maxNum) maxNum = n;
                }
            });
            var nextTech = (maxNum > 0 ? maxNum + 1 : 7);
            badgeInput.value = "TECH-" + (nextTech < 10 ? "0" + nextTech : nextTech);

        } else if (role === "Operator") {
            prefix = "OP-";
            users.forEach(function (u) {
                var m = (u.badgeId || "").match(/OP-(\d+)/i);
                if (m) {
                    var n = parseInt(m[1], 10);
                    if (n > maxNum) maxNum = n;
                }
            });
            var nextOp = (maxNum > 0 ? maxNum + 1 : 105);
            badgeInput.value = "OP-" + nextOp;

        } else if (role === "Administrator") {
            prefix = "ADM-";
            users.forEach(function (u) {
                var m = (u.badgeId || "").match(/ADM-(\d+)/i);
                if (m) {
                    var n = parseInt(m[1], 10);
                    if (n > maxNum) maxNum = n;
                }
            });
            var nextAdm = (maxNum > 0 ? maxNum + 1 : 2);
            badgeInput.value = "ADM-" + (nextAdm < 10 ? "00" + nextAdm : (nextAdm < 100 ? "0" + nextAdm : nextAdm));
        }
    }

    if (btnAutoBadge) {
        btnAutoBadge.addEventListener("click", function () {
            suggestBadgeId(currentRole);
        });
    }

    // 4. Password Visibility Toggles
    if (togglePassBtn && passwordInput) {
        togglePassBtn.addEventListener("click", function () {
            var isPass = passwordInput.getAttribute("type") === "password";
            passwordInput.setAttribute("type", isPass ? "text" : "password");
            togglePassBtn.textContent = isPass ? "🔒" : "👁";
        });
    }

    if (toggleConfirmBtn && confirmPasswordInput) {
        toggleConfirmBtn.addEventListener("click", function () {
            var isPass = confirmPasswordInput.getAttribute("type") === "password";
            confirmPasswordInput.setAttribute("type", isPass ? "text" : "password");
            toggleConfirmBtn.textContent = isPass ? "🔒" : "👁";
        });
    }

    // 5. Password Strength Meter & Matching Verification
    function updatePasswordStrength() {
        var pwd = passwordInput.value;
        var confirmPwd = confirmPasswordInput.value;

        var s1 = document.getElementById("strengthSeg1");
        var s2 = document.getElementById("strengthSeg2");
        var s3 = document.getElementById("strengthSeg3");
        var s4 = document.getElementById("strengthSeg4");
        var label = document.getElementById("strengthText");
        var matchText = document.getElementById("matchText");

        var segments = [s1, s2, s3, s4];
        segments.forEach(function (s) {
            if (s) s.className = "strength-segment";
        });

        if (!pwd) {
            if (label) label.textContent = "STRENGTH: AWAITING INPUT";
            if (matchText) matchText.textContent = "";
            return;
        }

        var score = 0;
        if (pwd.length >= 6) score++;
        if (pwd.length >= 10) score++;
        if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
        if (/[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++;

        if (score === 1) {
            if (s1) s1.classList.add("active-weak");
            if (label) label.textContent = "STRENGTH: WEAK (ADD NUMBERS OR SYMBOLS)";
        } else if (score === 2) {
            if (s1) s1.classList.add("active-fair");
            if (s2) s2.classList.add("active-fair");
            if (label) label.textContent = "STRENGTH: FAIR";
        } else if (score === 3) {
            if (s1) s1.classList.add("active-good");
            if (s2) s2.classList.add("active-good");
            if (s3) s3.classList.add("active-good");
            if (label) label.textContent = "STRENGTH: GOOD";
        } else if (score >= 4) {
            segments.forEach(function (s) { if (s) s.classList.add("active-strong"); });
            if (label) label.textContent = "STRENGTH: STRONG (COMPLIANT)";
        }

        if (confirmPwd) {
            if (pwd === confirmPwd) {
                if (matchText) {
                    matchText.textContent = "✓ PASSWORDS MATCH";
                    matchText.style.color = "var(--success, #10b981)";
                }
            } else {
                if (matchText) {
                    matchText.textContent = "✕ PASSWORDS DO NOT MATCH";
                    matchText.style.color = "var(--danger, #ef4444)";
                }
            }
        } else {
            if (matchText) matchText.textContent = "";
        }
    }

    passwordInput.addEventListener("input", updatePasswordStrength);
    confirmPasswordInput.addEventListener("input", updatePasswordStrength);

    // Initial setup
    renderAdaptiveFields("Technician");
    suggestBadgeId("Technician");

    // 6. Form Submission & Auto-Provisioning
    registerForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        var fullName = document.getElementById("regFullName").value.trim();
        var email = document.getElementById("regEmail").value.trim();
        var badgeId = document.getElementById("regBadgeId").value.trim().toUpperCase();
        var bay = document.getElementById("regBay").value;
        var role = currentRole;
        var password = passwordInput.value;
        var confirmPassword = confirmPasswordInput.value;

        if (!fullName || !email || !badgeId || !password) {
            showFormError("Please fill in all required registration fields.");
            return;
        }

        if (password.length < 6) {
            showFormError("Passcode must contain at least 6 characters.");
            return;
        }

        if (password !== confirmPassword) {
            showFormError("Passcode and confirmation passcode do not match.");
            return;
        }

        var registrationPayload = {
            name: fullName,
            email: email,
            badgeId: badgeId,
            bay: bay,
            role: role,
            password: password
        };

        if (role === "Administrator") {
            var clearanceInput = document.getElementById("regClearanceCode");
            var clearanceCode = clearanceInput ? clearanceInput.value.trim() : "";
            if (!clearanceCode) {
                showFormError("Security Clearance Code is required for Administrator enrollment.");
                return;
            }
            if (clearanceCode !== "FORGE-ADM-2026") {
                showFormError("Invalid Security Clearance Code. Click 'Fill Demo Clearance Code' to test with FORGE-ADM-2026.");
                return;
            }
            registrationPayload.clearanceCode = clearanceCode;
        } else if (role === "Technician") {
            var specSelect = document.getElementById("regTechSpecialization");
            var shiftSelect = document.getElementById("regTechShift");
            registrationPayload.specialization = specSelect ? specSelect.value : "Mechanical";
            registrationPayload.shift = shiftSelect ? shiftSelect.value : "Day Shift (06:00 - 14:00)";
        } else if (role === "Operator") {
            var machineSelect = document.getElementById("regOperatorMachine");
            var opShiftSelect = document.getElementById("regOperatorShift");
            registrationPayload.assignedMachine = machineSelect ? machineSelect.value : "CNC Machine 01";
            registrationPayload.shift = opShiftSelect ? opShiftSelect.value : "Day Shift (06:00 - 14:00)";
        }

        var submitBtn = document.getElementById("btnRegisterSubmit");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "PROVISIONING WORKFORCE ACCOUNT…";
        }

        // Call ForgeDataService to register user and auto-provision workforce (Hybrid: Prisma + local)
        if (typeof ForgeDataService !== "undefined" && ForgeDataService.registerUser) {
            var result = await ForgeDataService.registerUser(registrationPayload);
            if (!result || !result.success) {
                showFormError((result && result.message) || "Registration failed. Please check form fields.");
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "INITIALIZE & ENROLL PERSONNEL →";
                }
                return;
            }

            showFormSuccess("✓ Personnel account registered & provisioned (" + result.user.badgeId + " // " + result.user.name + "). Entering FORGE…");

            setTimeout(function () {
                window.location.href = "pages/dashboard.html";
            }, 600);
            return;
        }

        // Fallback if data service not loaded
        sessionStorage.setItem("forge_role", role);
        sessionStorage.setItem("iemrs_role", role);
        showFormSuccess("✓ Registered successfully. Redirecting to Dashboard…");
        setTimeout(function () {
            window.location.href = "pages/dashboard.html";
        }, 500);
    });

    function showFormError(msg) {
        if (!messageEl) return;
        messageEl.textContent = "✕ " + msg;
        messageEl.style.color = "var(--danger, #ef4444)";
    }

    function showFormSuccess(msg) {
        if (!messageEl) return;
        messageEl.textContent = msg;
        messageEl.style.color = "var(--success, #10b981)";
    }
});

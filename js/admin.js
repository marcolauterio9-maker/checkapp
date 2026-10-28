/**
 * Lógica del Panel de Administración (admin.html)
 * Autenticación por PIN, gestión de citas, pasos para reservar, horarios y notificaciones
 */

document.addEventListener("DOMContentLoaded", async () => {
    let data = await window.appStore.getData();
    let currentFilter = "all";
    let knownAppointmentIds = new Set((data.appointments || []).map(a => a.id));
    let notificationsEnabled = false;

    // 1. Verificación de Autenticación por PIN
    const authOverlay = document.getElementById("auth-overlay");
    const dashboardLayout = document.getElementById("admin-dashboard-layout");
    const pinForm = document.getElementById("auth-pin-form");
    const pinInput = document.getElementById("auth-pin-input");
    const errorMsg = document.getElementById("auth-error-msg");
    const logoutBtn = document.getElementById("btn-logout");
    const forgotPinButton = document.getElementById("btn-forgot-pin");
    const recoveryPanel = document.getElementById("auth-recovery-panel");
    const recoveryError = document.getElementById("auth-recovery-error");
    const sendRecoveryCodeButton = document.getElementById("btn-send-recovery-code");
    const resetPinForm = document.getElementById("auth-reset-pin-form");
    const backToLoginButton = document.getElementById("btn-back-to-login");
    const defaultPinForm = document.getElementById("auth-default-pin-form");
    const defaultPinError = document.getElementById("auth-default-pin-error");

    if (sessionStorage.getItem("admin_authenticated") === "true") {
        try {
            if (await window.appStore.adminSession()) {
                unlockDashboard();
            } else {
                sessionStorage.removeItem("admin_authenticated");
            }
        } catch (error) {
            console.error("No se pudo comprobar la sesión del administrador.", error);
            errorMsg.textContent = error.message;
        }
    }

    pinForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
            await window.appStore.adminLogin(pinInput.value.trim());
            sessionStorage.setItem("admin_authenticated", "true");
            unlockDashboard();
        } catch (error) {
            if (error.code === "PIN_CHANGE_REQUIRED") {
                pinForm.style.display = "none";
                recoveryPanel.style.display = "none";
                defaultPinForm.style.display = "block";
                return;
            }
            if (error.code === "PIN_SETUP_REQUIRED") {
                pinForm.style.display = "none";
                defaultPinForm.style.display = "block";
                defaultPinError.textContent = error.message;
                return;
            }
            errorMsg.textContent = error.message;
            pinInput.value = "";
            pinInput.focus();
        }
    });

    defaultPinForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        defaultPinError.textContent = "";
        try {
            await window.appStore.setupAdminPin(document.getElementById("auth-default-new-pin").value.trim());
            sessionStorage.setItem("admin_authenticated", "true");
            unlockDashboard();
        } catch (error) {
            defaultPinError.textContent = error.message;
        }
    });

    forgotPinButton.addEventListener("click", () => {
        pinForm.style.display = "none";
        recoveryPanel.style.display = "block";
        recoveryError.textContent = "";
    });

    sendRecoveryCodeButton.addEventListener("click", async () => {
        sendRecoveryCodeButton.disabled = true;
        recoveryError.textContent = "";
        try {
            await window.appStore.requestAdminRecovery();
            recoveryError.style.color = "#198754";
            recoveryError.textContent = "Código enviado. Revisa tu correo y también la carpeta de spam.";
            resetPinForm.style.display = "block";
        } catch (error) {
            recoveryError.style.color = "#dc3545";
            recoveryError.textContent = error.message;
        } finally {
            sendRecoveryCodeButton.disabled = false;
        }
    });

    resetPinForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        recoveryError.style.color = "#dc3545";
        recoveryError.textContent = "";
        try {
            await window.appStore.completeAdminRecovery(
                document.getElementById("auth-recovery-code").value.trim(),
                document.getElementById("auth-new-pin").value.trim()
            );
            sessionStorage.setItem("admin_authenticated", "true");
            unlockDashboard();
        } catch (error) {
            recoveryError.textContent = error.message;
        }
    });

    backToLoginButton.addEventListener("click", () => {
        recoveryPanel.style.display = "none";
        pinForm.style.display = "block";
        recoveryError.textContent = "";
        resetPinForm.reset();
        resetPinForm.style.display = "none";
    });

    logoutBtn.addEventListener("click", async () => {
        try {
            await window.appStore.adminLogout();
        } catch (error) {
            console.error("No se pudo cerrar la sesión del servidor.", error);
        }
        sessionStorage.removeItem("admin_authenticated");
        window.location.reload();
    });

    window.addEventListener("admin-session-expired", () => {
        sessionStorage.removeItem("admin_authenticated");
        window.location.reload();
    });

    function unlockDashboard() {
        authOverlay.style.display = "none";
        dashboardLayout.style.display = "flex";
        initDashboard();
    }

    // 2. Inicialización del Dashboard
    async function initDashboard() {
        data = await window.appStore.getData();
        knownAppointmentIds = new Set((data.appointments || []).map(a => a.id));
        applyBusinessAppearance(data.business);
        applyBusinessFavicon(data.business);
        document.title = `Administración - ${data.business.name}`;
        document.getElementById("sidebar-biz-name").textContent = data.business.name;

        setupSidebarNavigation();
        setupTeamsCalendar();
        renderAppointments();
        setupBookingStepsAdmin();
        renderServicesTable();
        renderScheduleForm();
        renderReviewsTable();
        renderBusinessForm();
        renderReportsSection();
        setupServiceModal();
        setupRealtimeNotifications();
    }

    // --- NAVEGACIÓN ENTRE SECCIONES ---
    function setupSidebarNavigation() {
        const navItems = document.querySelectorAll(".sidebar-nav li");
        const sections = document.querySelectorAll(".admin-section");
        const titleEl = document.getElementById("admin-page-title");

        const titlesMap = {
            appointments: "Citas Agendadas",
            "booking-steps": "Pasos para reservar",
            services: "Servicios y precios",
            schedule: "Horarios de Atención",
            reviews: "Gestión de Reseñas",
            business: "Datos del Negocio",
            reports: "📊 Reporte Mensual & Ganancias"
        };

        navItems.forEach(item => {
            item.addEventListener("click", (e) => {
                e.preventDefault();
                const targetSec = item.getAttribute("data-section");

                navItems.forEach(i => i.classList.remove("active"));
                item.classList.add("active");

                sections.forEach(s => s.style.display = "none");
                const activeSec = document.getElementById(`section-${targetSec}`);
                if (activeSec) activeSec.style.display = "block";

                if (titleEl) titleEl.textContent = titlesMap[targetSec] || "Administración";
            });
        });

        // Filtros de Citas
        const filterBtns = document.querySelectorAll(".filter-tab-btn");
        filterBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                filterBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                currentFilter = btn.getAttribute("data-filter");
                renderAppointments();
            });
        });
    }

    // --- ESTADO DEL CALENDARIO TIPO TEAMS ---
    const teamsCalState = {
        currentDate: new Date(),
        viewType: "week", // 'workWeek', 'week', 'day', 'month'
        layoutMode: "calendar", // 'calendar' or 'table'
        filterStatus: "all",
    };

    let currentDetailAppt = null;

    function getMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.getFullYear(), d.getMonth(), diff);
    }

    function formatDateIso(d) {
        const y = d.getFullYear();
        const m = (d.getMonth() + 1).toString().padStart(2, "0");
        const day = d.getDate().toString().padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    function isSameDay(d1, d2) {
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    }

    function timeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(":").map(Number);
        return h * 60 + (m || 0);
    }

    function getAppointmentDurationMins(appointment) {
        if (Number(appointment.durationMins) > 0) return Number(appointment.durationMins);
        const duration = (appointment.services || []).reduce((sum, bookedService) => {
            const service = (data.services || []).find(item => item.id === bookedService.id);
            return sum + (service ? Number(service.duration) || 0 : 0);
        }, 0);
        return duration > 0 ? duration : 60;
    }

    function setupTeamsCalendar() {
        // 1. Botón Hoy
        const btnToday = document.getElementById("btn-teams-today");
        if (btnToday) {
            btnToday.addEventListener("click", () => {
                teamsCalState.currentDate = new Date();
                renderAppointments();
            });
        }

        // 2. Navegación Anterior / Siguiente
        const btnPrev = document.getElementById("btn-teams-prev");
        const btnNext = document.getElementById("btn-teams-next");
        if (btnPrev) btnPrev.addEventListener("click", () => navigateTeamsCalendar(-1));
        if (btnNext) btnNext.addEventListener("click", () => navigateTeamsCalendar(1));

        // 3. Vistas Teams (Semana laboral, Semana, Día, Mes)
        const viewBtns = document.querySelectorAll(".teams-view-btn");
        viewBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                viewBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                teamsCalState.viewType = btn.getAttribute("data-view");
                renderAppointments();
            });
        });

        // 4. Alternar Calendario / Tabla
        const btnCal = document.getElementById("btn-mode-calendar");
        const btnTable = document.getElementById("btn-mode-table");
        const calContainer = document.getElementById("teams-calendar-container");
        const tableContainer = document.getElementById("teams-table-container");

        if (btnCal && btnTable) {
            btnCal.addEventListener("click", () => {
                teamsCalState.layoutMode = "calendar";
                btnCal.classList.add("active");
                btnTable.classList.remove("active");
                if (calContainer) calContainer.style.display = "flex";
                if (tableContainer) tableContainer.style.display = "none";
                renderAppointments();
            });

            btnTable.addEventListener("click", () => {
                teamsCalState.layoutMode = "table";
                btnTable.classList.add("active");
                btnCal.classList.remove("active");
                if (calContainer) calContainer.style.display = "none";
                if (tableContainer) tableContainer.style.display = "block";
                renderAppointments();
            });
        }

        // 5. Filtro de estado
        const filterStatusSelect = document.getElementById("teams-filter-status");
        if (filterStatusSelect) {
            filterStatusSelect.addEventListener("change", (e) => {
                teamsCalState.filterStatus = e.target.value;
                renderAppointments();
            });
        }

        // 6. Botón + Nueva Cita
        const btnNewAppt = document.getElementById("btn-open-new-appt");
        if (btnNewAppt) {
            btnNewAppt.addEventListener("click", () => {
                openNewApptModal(formatDateIso(teamsCalState.currentDate), "16:00");
            });
        }

        // 7. Modales de Detalle y Nueva Cita
        setupDetailModal();
        setupNewApptModal();
    }

    function navigateTeamsCalendar(direction) {
        const d = new Date(teamsCalState.currentDate);
        if (teamsCalState.viewType === "day") {
            d.setDate(d.getDate() + direction);
        } else if (teamsCalState.viewType === "month") {
            d.setMonth(d.getMonth() + direction);
        } else {
            // week or workWeek
            d.setDate(d.getDate() + direction * 7);
        }
        teamsCalState.currentDate = d;
        renderAppointments();
    }

    // --- SECCIÓN 1: CITAS AGENDADAS (CALENDARIO TEAMS + TABLA) ---
    function renderAppointments() {
        const totalMetric = document.getElementById("metric-total-appts");
        const pendingMetric = document.getElementById("metric-pending-appts");
        const revenueMetric = document.getElementById("metric-total-revenue");

        const appts = data.appointments || [];

        // Calcular métricas
        const totalCount = appts.length;
        const pendingCount = appts.filter(a => a.status === "pendiente").length;
        const revenue = appts
            .filter(a => a.status === "confirmada" || a.status === "completada")
            .reduce((sum, a) => sum + (a.totalPrice || 0), 0);

        if (totalMetric) totalMetric.textContent = totalCount;
        if (pendingMetric) pendingMetric.textContent = pendingCount;
        if (revenueMetric) revenueMetric.textContent = `$${revenue} MXN`;

        // Filtrar citas
        const filtered = appts.filter(a => {
            if (teamsCalState.filterStatus !== "all" && (a.status || "confirmada").toLowerCase() !== teamsCalState.filterStatus) return false;
            return true;
        });

        // Renderizar Calendario y Tabla
        renderTeamsCalendar(filtered);
        renderAppointmentsTable(filtered);
    }

    function renderTeamsCalendar(filteredAppts) {
        const calContainer = document.getElementById("teams-calendar-container");
        const rangeLabel = document.getElementById("teams-range-label");
        if (!calContainer) return;

        const d = teamsCalState.currentDate;
        const monthNamesShort = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
        const monthNamesFull = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
        const dayNamesFull = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

        // Actualizar título de rango según la vista
        if (rangeLabel) {
            if (teamsCalState.viewType === "day") {
                rangeLabel.textContent = `${dayNamesFull[d.getDay()]}, ${d.getDate()} de ${monthNamesFull[d.getMonth()]} de ${d.getFullYear()}`;
            } else if (teamsCalState.viewType === "month") {
                rangeLabel.textContent = `${monthNamesFull[d.getMonth()]} de ${d.getFullYear()}`;
            } else {
                const mon = getMonday(d);
                const numDays = teamsCalState.viewType === "workWeek" ? 5 : 7;
                const end = new Date(mon);
                end.setDate(end.getDate() + (numDays - 1));
                rangeLabel.textContent = `${mon.getDate()} ${monthNamesShort[mon.getMonth()]} - ${end.getDate()} ${monthNamesShort[end.getMonth()]} ${end.getFullYear()}`;
            }
        }

        if (teamsCalState.viewType === "month") {
            renderTeamsMonthView(calContainer, filteredAppts);
        } else if (teamsCalState.viewType === "day") {
            renderTeamsDayView(calContainer, filteredAppts);
        } else {
            renderTeamsWeekView(calContainer, filteredAppts, teamsCalState.viewType === "workWeek");
        }
    }

    function renderTeamsWeekView(container, filteredAppts, isWorkWeek) {
        const mon = getMonday(teamsCalState.currentDate);
        const numDays = isWorkWeek ? 5 : 7;
        const days = [];
        for (let i = 0; i < numDays; i++) {
            const dayObj = new Date(mon);
            dayObj.setDate(mon.getDate() + i);
            days.push(dayObj);
        }

        const dayNamesShort = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
        const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
        const today = new Date();

        let headerHtml = `
            <div class="teams-cal-header-row" style="grid-template-columns: 65px repeat(${numDays}, 1fr);">
                <div class="teams-time-corner"></div>
                ${days.map(dayObj => {
                    const isToday = isSameDay(dayObj, today);
                    const isWeekend = (dayObj.getDay() === 0 || dayObj.getDay() === 6);
                    return `
                        <div class="teams-day-col-header ${isToday ? 'is-today' : ''} ${isWeekend ? 'is-weekend' : ''}">
                            <span class="teams-day-name">${dayNamesShort[dayObj.getDay()]}</span>
                            <span class="teams-day-num">${dayObj.getDate()}</span>
                        </div>
                    `;
                }).join("")}
            </div>
        `;

        let bodyHtml = `
            <div class="teams-cal-body-scroll">
                <div class="teams-cal-body-grid" style="grid-template-columns: 65px repeat(${numDays}, 1fr);">
                    <!-- Columna de horas -->
                    <div class="teams-time-gutter">
                        ${hours.map(h => `<div class="teams-time-label">${h.toString().padStart(2, '0')}:00</div>`).join("")}
                    </div>

                    <!-- Columnas de días -->
                    ${days.map(dayObj => {
                        const dateIso = formatDateIso(dayObj);
                        const isToday = isSameDay(dayObj, today);
                        const isWeekend = (dayObj.getDay() === 0 || dayObj.getDay() === 6);

                        const dayAppts = filteredAppts.filter(a => a.date === dateIso);

                        let nowLineHtml = "";
                        if (isToday) {
                            const now = new Date();
                            const nowMins = now.getHours() * 60 + now.getMinutes();
                            if (nowMins >= 480 && nowMins <= 1260) {
                                const topPx = nowMins - 480;
                                nowLineHtml = `<div class="teams-now-line" style="top: ${topPx}px;" title="Hora actual"></div>`;
                            }
                        }

                        const apptsHtml = dayAppts.map(a => {
                            const startMins = timeToMinutes(a.time);
                            const dur = getAppointmentDurationMins(a);
                            const topPx = Math.max(0, startMins - 480);
                            const heightPx = Math.max(36, dur - 4);
                            const statusKey = getAppointmentStatusKey(a.status);
                            const serviceText = (a.services || []).map(s => s.name).join(", ") || "Servicio";

                            return `
                                <div class="teams-event-block event-status-${statusKey}" 
                                     style="top: ${topPx}px; height: ${heightPx}px;" 
                                     data-id="${escapeHtml(a.id)}" 
                                     title="${escapeHtml(a.clientName)} (${escapeHtml(a.time)} - ${escapeHtml(a.endTime || '')})">
                                    <div class="teams-event-title">${escapeHtml(a.clientName)}</div>
                                    <div class="teams-event-service">• ${escapeHtml(serviceText)}</div>
                                    <div class="teams-event-time">⏰ ${escapeHtml(a.time)} - ${escapeHtml(a.endTime || '')}</div>
                                </div>
                            `;
                        }).join("");

                        return `
                            <div class="teams-day-column ${isWeekend ? 'is-weekend' : ''}" data-date="${dateIso}">
                                ${hours.map(h => `
                                    <div class="teams-hour-cell" data-date="${dateIso}" data-time="${h.toString().padStart(2, '0')}:00" title="Clic para reservar a las ${h.toString().padStart(2, '0')}:00"></div>
                                `).join("")}
                                ${nowLineHtml}
                                ${apptsHtml}
                            </div>
                        `;
                    }).join("")}
                </div>
            </div>
        `;

        container.innerHTML = headerHtml + bodyHtml;

        // Clic en bloque abre detalles
        container.querySelectorAll(".teams-event-block").forEach(block => {
            block.addEventListener("click", (e) => {
                e.stopPropagation();
                openApptDetailModal(block.getAttribute("data-id"));
            });
        });

        // Clic en celda horaria abre modal para agendar
        container.querySelectorAll(".teams-hour-cell").forEach(cell => {
            cell.addEventListener("click", () => {
                openNewApptModal(cell.getAttribute("data-date"), cell.getAttribute("data-time"));
            });
        });
    }

    function renderTeamsDayView(container, filteredAppts) {
        const dayObj = teamsCalState.currentDate;
        const dateIso = formatDateIso(dayObj);
        const today = new Date();
        const isToday = isSameDay(dayObj, today);
        const dayNamesShort = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
        const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

        const dayAppts = filteredAppts.filter(a => a.date === dateIso);

        let nowLineHtml = "";
        if (isToday) {
            const now = new Date();
            const nowMins = now.getHours() * 60 + now.getMinutes();
            if (nowMins >= 480 && nowMins <= 1260) {
                const topPx = nowMins - 480;
                nowLineHtml = `<div class="teams-now-line" style="top: ${topPx}px;" title="Hora actual"></div>`;
            }
        }

        const apptsHtml = dayAppts.map(a => {
            const startMins = timeToMinutes(a.time);
            const dur = getAppointmentDurationMins(a);
            const topPx = Math.max(0, startMins - 480);
            const heightPx = Math.max(48, dur - 4);
            const statusKey = getAppointmentStatusKey(a.status);
            const serviceText = (a.services || []).map(s => s.name).join(", ") || "Servicio";

            return `
                <div class="teams-event-block event-status-${statusKey}" 
                     style="top: ${topPx}px; height: ${heightPx}px; left: 8px; right: 8px;" 
                     data-id="${escapeHtml(a.id)}">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span class="teams-event-title" style="font-size: 13.5px;">${escapeHtml(a.clientName)}</span>
                        <span class="status-badge status-${statusKey}" style="font-size: 11px;">${statusKey}</span>
                    </div>
                    <div class="teams-event-service" style="font-size: 12px; margin-top: 2px;">• ${escapeHtml(serviceText)}</div>
                    <div class="teams-event-time" style="font-size: 11.5px;">⏰ ${escapeHtml(a.time)} - ${escapeHtml(a.endTime || '')} · 📞 ${escapeHtml(a.clientPhone || '')}</div>
                </div>
            `;
        }).join("");

        container.innerHTML = `
            <div class="teams-cal-header-row" style="grid-template-columns: 65px 1fr;">
                <div class="teams-time-corner"></div>
                <div class="teams-day-col-header ${isToday ? 'is-today' : ''}" style="border-right: none;">
                    <span class="teams-day-name">${dayNamesShort[dayObj.getDay()]}</span>
                    <span class="teams-day-num">${dayObj.getDate()}</span>
                </div>
            </div>
            <div class="teams-cal-body-scroll">
                <div class="teams-cal-body-grid" style="grid-template-columns: 65px 1fr;">
                    <div class="teams-time-gutter">
                        ${hours.map(h => `<div class="teams-time-label">${h.toString().padStart(2, '0')}:00</div>`).join("")}
                    </div>
                    <div class="teams-day-column" style="border-right: none;" data-date="${dateIso}">
                        ${hours.map(h => `
                            <div class="teams-hour-cell" data-date="${dateIso}" data-time="${h.toString().padStart(2, '0')}:00"></div>
                        `).join("")}
                        ${nowLineHtml}
                        ${apptsHtml}
                    </div>
                </div>
            </div>
        `;

        container.querySelectorAll(".teams-event-block").forEach(block => {
            block.addEventListener("click", (e) => {
                e.stopPropagation();
                openApptDetailModal(block.getAttribute("data-id"));
            });
        });

        container.querySelectorAll(".teams-hour-cell").forEach(cell => {
            cell.addEventListener("click", () => {
                openNewApptModal(cell.getAttribute("data-date"), cell.getAttribute("data-time"));
            });
        });
    }

    function renderTeamsMonthView(container, filteredAppts) {
        const d = teamsCalState.currentDate;
        const year = d.getFullYear();
        const month = d.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();

        let startDayOfWeek = firstDay.getDay() - 1;
        if (startDayOfWeek < 0) startDayOfWeek = 6;

        const dayHeaders = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
        const today = new Date();

        let headerHtml = `
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); border-bottom: 1px solid #e5e7eb;">
                ${dayHeaders.map(h => `<div class="teams-month-header">${h}</div>`).join("")}
            </div>
        `;

        let cellsHtml = `<div class="teams-month-grid">`;

        // Días previos del mes anterior
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            const prevDayNum = prevMonthLastDay - i;
            cellsHtml += `
                <div class="teams-month-cell is-other-month">
                    <span class="teams-month-day-num">${prevDayNum}</span>
                </div>
            `;
        }

        // Días del mes actual
        for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
            const thisDate = new Date(year, month, dayNum);
            const dateIso = formatDateIso(thisDate);
            const isToday = isSameDay(thisDate, today);

            const dayAppts = filteredAppts.filter(a => a.date === dateIso);
            const chipsHtml = dayAppts.map(a => {
                const statusKey = getAppointmentStatusKey(a.status);
                return `
                    <div class="teams-month-chip event-status-${statusKey}" data-id="${escapeHtml(a.id)}">
                        <span>${escapeHtml(a.time)}</span> <strong>${escapeHtml(a.clientName)}</strong>
                    </div>
                `;
            }).join("");

            cellsHtml += `
                <div class="teams-month-cell ${isToday ? 'is-today' : ''}" data-date="${dateIso}">
                    <span class="teams-month-day-num">${dayNum}</span>
                    <div style="display: flex; flex-direction: column; gap: 3px; overflow: hidden;">
                        ${chipsHtml}
                    </div>
                </div>
            `;
        }

        // Días posteriores
        const totalRendered = startDayOfWeek + daysInMonth;
        const remaining = (7 - (totalRendered % 7)) % 7;
        for (let nextDay = 1; nextDay <= remaining; nextDay++) {
            cellsHtml += `
                <div class="teams-month-cell is-other-month">
                    <span class="teams-month-day-num">${nextDay}</span>
                </div>
            `;
        }

        cellsHtml += `</div>`;
        container.innerHTML = headerHtml + cellsHtml;

        container.querySelectorAll(".teams-month-chip").forEach(chip => {
            chip.addEventListener("click", (e) => {
                e.stopPropagation();
                openApptDetailModal(chip.getAttribute("data-id"));
            });
        });

        container.querySelectorAll(".teams-month-cell:not(.is-other-month)").forEach(cell => {
            cell.addEventListener("click", () => {
                const dateIso = cell.getAttribute("data-date");
                if (dateIso) {
                    const [y, m, day] = dateIso.split("-").map(Number);
                    teamsCalState.currentDate = new Date(y, m - 1, day);
                    teamsCalState.viewType = "day";
                    document.querySelectorAll(".teams-view-btn").forEach(b => {
                        b.classList.toggle("active", b.getAttribute("data-view") === "day");
                    });
                    renderAppointments();
                }
            });
        });
    }

    function renderAppointmentsTable(filteredAppts) {
        const tbody = document.getElementById("appts-table-body");
        if (!tbody) return;

        if (filteredAppts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 25px; color:#888;">No hay citas con este filtro.</td></tr>`;
            return;
        }

        tbody.innerHTML = filteredAppts.map(a => {
            const cleanPhone = (a.clientPhone || "").replace(/\D/g, "");
            const waMsg = encodeURIComponent(`Hola ${a.clientName}, te escribimos de ${data.business.name} respecto a tu cita para el ${a.date} a las ${a.time}.`);
            const waLink = `https://wa.me/${cleanPhone}?text=${waMsg}`;
            const servicesText = (a.services || []).map(s => s.name).join(", ") || "-";

            return `
                <tr style="cursor: pointer;" data-id="${escapeHtml(a.id)}">
                    <td>
                        <div style="font-weight: 600;">${escapeHtml(a.clientName)}</div>
                        <div style="font-size: 12px; color: #777;">📞 ${escapeHtml(a.clientPhone)}</div>
                    </td>
                    <td style="max-width: 180px;">${escapeHtml(servicesText)}</td>
                    <td>
                        <div>📅 ${escapeHtml(a.date)}</div>
                        <div style="font-size: 12px; color: #777;">⏰ ${escapeHtml(a.time)} - ${escapeHtml(a.endTime || '')}</div>
                    </td>
                    <td><strong style="color: var(--admin-primary);">$${escapeHtml(a.totalPrice || 0)}</strong></td>
                    <td>
                        <span class="status-badge status-${getAppointmentStatusKey(a.status)}">
                            ${escapeHtml(a.status || 'confirmada')}
                        </span>
                    </td>
                    <td onclick="event.stopPropagation();">
                        <div class="table-actions">
                            <a href="${waLink}" target="_blank" class="btn-table-action btn-action-wa" title="Escribir por WhatsApp">
                                WA
                            </a>
                            <select class="btn-table-action btn-action-status" data-id="${escapeHtml(a.id)}">
                                <option value="confirmada" ${a.status === 'confirmada' ? 'selected' : ''}>Confirmada</option>
                                <option value="pendiente" ${a.status === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                                <option value="completada" ${a.status === 'completada' ? 'selected' : ''}>Completada</option>
                                <option value="cancelada" ${a.status === 'cancelada' ? 'selected' : ''}>Cancelada</option>
                            </select>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        tbody.querySelectorAll("tr").forEach(tr => {
            tr.addEventListener("click", () => {
                const id = tr.getAttribute("data-id");
                if (id) openApptDetailModal(id);
            });
        });

        tbody.querySelectorAll(".btn-action-status").forEach(select => {
            select.addEventListener("change", async (e) => {
                e.stopPropagation();
                const apptId = select.getAttribute("data-id");
                const newStatus = select.value;
                const previousAppointment = data.appointments.find(appointment => appointment.id === apptId);
                const oldStatus = previousAppointment ? previousAppointment.status : "confirmada";
                try {
                    await window.appStore.updateAppointmentStatus(apptId, newStatus);
                    data = await window.appStore.getData();
                    renderAppointments();
                } catch (error) {
                    console.error("No se pudo actualizar el estado de la cita.", error);
                    alert(`No se pudo actualizar la cita: ${error.message}`);
                    select.value = oldStatus;
                }
            });
        });
    }

    function setupDetailModal() {
        const modal = document.getElementById("appt-detail-modal");
        const closeBtn = document.getElementById("btn-close-detail-modal");
        const deleteBtn = document.getElementById("modal-detail-delete-btn");

        if (closeBtn && modal) {
            closeBtn.addEventListener("click", () => {
                modal.style.display = "none";
            });
        }

        if (modal) {
            modal.addEventListener("click", (e) => {
                if (e.target === modal) modal.style.display = "none";
            });
        }

        document.querySelectorAll(".btn-change-status").forEach(btn => {
            btn.addEventListener("click", async () => {
                if (!currentDetailAppt) return;
                const newStatus = btn.getAttribute("data-status");
                try {
                    await window.appStore.updateAppointmentStatus(currentDetailAppt.id, newStatus);
                    data = await window.appStore.getData();
                    currentDetailAppt = data.appointments.find(a => a.id === currentDetailAppt.id);
                    if (currentDetailAppt) {
                        const badge = document.getElementById("modal-detail-status-badge");
                        if (badge) {
                            badge.textContent = newStatus;
                            badge.className = `status-badge status-${newStatus}`;
                        }
                    }
                    renderAppointments();
                } catch (error) {
                    console.error("No se pudo actualizar el estado de la cita.", error);
                    alert(`No se pudo actualizar la cita: ${error.message}`);
                }
            });
        });

        if (deleteBtn) {
            deleteBtn.addEventListener("click", async () => {
                if (!currentDetailAppt) return;
                if (confirm(`¿Estás seguro de eliminar la cita de ${currentDetailAppt.clientName}?`)) {
                    try {
                        await window.appStore.deleteAppointment(currentDetailAppt.id);
                        data = await window.appStore.getData();
                        if (modal) modal.style.display = "none";
                        renderAppointments();
                    } catch (error) {
                        console.error("No se pudo eliminar la cita.", error);
                        alert(`No se pudo eliminar la cita: ${error.message}`);
                    }
                }
            });
        }
    }

    function openApptDetailModal(apptId) {
        const appt = (data.appointments || []).find(a => a.id === apptId);
        if (!appt) return;

        currentDetailAppt = appt;
        const modal = document.getElementById("appt-detail-modal");
        if (!modal) return;

        const badge      = document.getElementById("modal-detail-status-badge");
        const title      = document.getElementById("modal-detail-title");
        const client     = document.getElementById("modal-detail-client");
        const phone      = document.getElementById("modal-detail-phone");
        const email      = document.getElementById("modal-detail-email");
        const services   = document.getElementById("modal-detail-services");
        const datetime   = document.getElementById("modal-detail-datetime");
        const duration   = document.getElementById("modal-detail-duration");
        const price      = document.getElementById("modal-detail-price");
        const notes      = document.getElementById("modal-detail-notes");
        const waBtn      = document.getElementById("modal-detail-wa-btn");
        const avatar     = document.getElementById("modal-detail-avatar");

        // Icono del avatar segun estado
        const statusIcons = { confirmada: "✓", pendiente: "⏳", completada: "✨", cancelada: "✕" };
        const statusKey = getAppointmentStatusKey(appt.status);

        if (avatar)      avatar.textContent      = statusIcons[statusKey] || "•";
        if (badge) {
            badge.textContent = statusKey;
            badge.className = `status-badge status-${statusKey}`;
        }
        if (title)       title.textContent       = appt.clientName;
        if (client)      client.textContent      = appt.clientName;
        if (phone)       phone.textContent       = appt.clientPhone || "No registrado";
        if (email)       email.textContent       = appt.clientEmail || "No especificado";
        if (services)    services.textContent    = (appt.services || []).map(s => s.name).join(", ") || "Servicio";

        // Fecha legible
        const dateParts  = (appt.date || "").split("-");
        const dayNames   = ["dom","lun","mar","mié","jue","vie","sáb"];
        const monthNames = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
        let dateLabel = appt.date;
        if (dateParts.length === 3) {
            const d = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]));
            dateLabel = `${dayNames[d.getDay()]} ${dateParts[2]} ${monthNames[d.getMonth()]} ${dateParts[0]}`;
        }
        if (datetime)    datetime.textContent    = `${dateLabel} · ${appt.time} - ${appt.endTime || ""}`;
        if (duration)    duration.textContent    = `${getAppointmentDurationMins(appt)} min`;
        if (price)       price.textContent       = `$${appt.totalPrice || 0} MXN`;
        if (notes)       notes.textContent       = appt.notes || "Sin notas adicionales";

        if (waBtn) {
            const cleanPhone = (appt.clientPhone || "").replace(/\D/g, "");
            const waMsg = encodeURIComponent(
                `Hola ${appt.clientName}, te escribimos de ${data.business.name} para confirmar tu cita el ${dateLabel} a las ${appt.time}.`
            );
            waBtn.href = `https://wa.me/${cleanPhone}?text=${waMsg}`;
        }

        modal.style.display = "flex";
    }


    function setupNewApptModal() {
        const modal = document.getElementById("new-appt-admin-modal");
        const closeBtn = document.getElementById("btn-close-new-appt-modal");
        const form = document.getElementById("new-appt-admin-form");

        if (closeBtn && modal) {
            closeBtn.addEventListener("click", () => modal.style.display = "none");
        }
        if (modal) {
            modal.addEventListener("click", (e) => {
                if (e.target === modal) modal.style.display = "none";
            });
        }

        if (form) {
            form.addEventListener("submit", async (e) => {
                e.preventDefault();

                const name = document.getElementById("manual-client-name").value.trim();
                const phone = document.getElementById("manual-client-phone").value.trim();
                const email = document.getElementById("manual-client-email").value.trim();
                const serviceId = document.getElementById("manual-service-select").value;
                const dateStr = document.getElementById("manual-date").value;
                const timeStr = document.getElementById("manual-time").value;
                const notesStr = document.getElementById("manual-notes").value.trim();

                const srv = (data.services || []).find(s => s.id === serviceId);
                const spec = (data.specialists || []).find(specialist => specialist.active !== false);

                const dur = srv ? (srv.duration || 45) : 45;
                const price = srv ? (srv.price || 0) : 350;

                const newAppt = {
                    clientName: name,
                    clientPhone: phone,
                    clientEmail: email,
                    specialistId: spec ? spec.id : "profesional-principal",
                    specialistName: spec ? spec.name : "Valeria Mística",
                    date: dateStr,
                    time: timeStr,
                    durationMins: dur,
                    services: srv ? [{ id: srv.id, name: srv.name, price: srv.price }] : [{ id: "srv-manual", name: "Servicio", price: price }],
                    totalPrice: price,
                    notes: notesStr,
                    createdAt: new Date().toISOString()
                };

                try {
                    await window.appStore.saveAdminAppointment(newAppt);
                    data = await window.appStore.getData();

                    form.reset();
                    if (modal) modal.style.display = "none";
                    renderAppointments();
                } catch (error) {
                    console.error("No se pudo guardar la cita manual.", error);
                    alert(`No se pudo guardar la cita: ${error.message}`);
                }
            });
        }
    }

    function openNewApptModal(defaultDate, defaultTime) {
        const modal = document.getElementById("new-appt-admin-modal");
        if (!modal) return;

        const srvSelect = document.getElementById("manual-service-select");
        const dateInput = document.getElementById("manual-date");
        const timeInput = document.getElementById("manual-time");

        if (srvSelect) {
            const activeServices = (data.services || []).filter(s => s.active !== false);
            srvSelect.innerHTML = activeServices.map(s => `
                <option value="${s.id}">• ${escapeHtml(s.name)} - $${s.price} (${s.durationText || s.duration + ' min'})</option>
            `).join("");
        }

        if (dateInput) dateInput.value = defaultDate || formatDateIso(new Date());
        if (timeInput) timeInput.value = defaultTime || "16:00";

        modal.style.display = "flex";
    }

    function setupBookingStepsAdmin() {
        const list = document.getElementById("booking-steps-admin-list");
        const addButton = document.getElementById("btn-add-booking-step");
        const saveButton = document.getElementById("btn-save-booking-steps");
        if (!list || !addButton || !saveButton) return;

        let steps = (Array.isArray(data.bookingSteps) && data.bookingSteps.length > 0
            ? data.bookingSteps
            : DEFAULT_DATA.bookingSteps).map(step => ({ title: step.title, description: step.description }));

        const render = () => {
            list.innerHTML = steps.map((step, index) => `
                <div class="booking-step-admin-row">
                    <strong style="padding:10px 0;">${index + 1}.</strong>
                    <input type="text" class="booking-step-title" data-index="${index}" value="${escapeHtml(step.title)}" aria-label="Título del paso ${index + 1}" placeholder="Título" required>
                    <textarea class="booking-step-description" data-index="${index}" aria-label="Descripción del paso ${index + 1}" placeholder="Descripción" required>${escapeHtml(step.description)}</textarea>
                    <div class="booking-step-admin-actions">
                        <button type="button" class="btn-move-booking-step" data-index="${index}" data-direction="-1" ${index === 0 ? "disabled" : ""} aria-label="Subir paso">↑</button>
                        <button type="button" class="btn-move-booking-step" data-index="${index}" data-direction="1" ${index === steps.length - 1 ? "disabled" : ""} aria-label="Bajar paso">↓</button>
                        <button type="button" class="btn-remove-booking-step" data-index="${index}" aria-label="Eliminar paso">✕</button>
                    </div>
                </div>
            `).join("");

            list.querySelectorAll(".booking-step-title, .booking-step-description").forEach(input => {
                input.addEventListener("input", () => {
                    const index = Number(input.dataset.index);
                    steps[index][input.classList.contains("booking-step-title") ? "title" : "description"] = input.value;
                });
            });
            list.querySelectorAll(".btn-move-booking-step").forEach(button => {
                button.addEventListener("click", () => {
                    const index = Number(button.dataset.index);
                    const nextIndex = index + Number(button.dataset.direction);
                    [steps[index], steps[nextIndex]] = [steps[nextIndex], steps[index]];
                    render();
                });
            });
            list.querySelectorAll(".btn-remove-booking-step").forEach(button => {
                button.addEventListener("click", () => {
                    if (steps.length === 1) {
                        alert("Debe quedar al menos un paso para reservar.");
                        return;
                    }
                    steps.splice(Number(button.dataset.index), 1);
                    render();
                });
            });
        };

        addButton.addEventListener("click", () => {
            steps.push({ title: "", description: "" });
            render();
            list.lastElementChild.querySelector(".booking-step-title").focus();
        });
        saveButton.addEventListener("click", async () => {
            if (steps.some(step => !step.title.trim() || !step.description.trim())) {
                alert("Completa el título y la descripción de cada paso antes de guardar.");
                return;
            }
            saveButton.disabled = true;
            try {
                await window.appStore.saveBookingSteps(steps);
                data.bookingSteps = steps.map(step => ({ ...step }));
                alert("Los pasos para reservar se guardaron correctamente.");
            } catch (error) {
                console.error("No se pudieron guardar los pasos para reservar.", error);
                alert(`No se pudieron guardar los pasos para reservar: ${error.message}`);
            } finally {
                saveButton.disabled = false;
            }
        });
        render();
    }

    // --- SECCIÓN 2: SERVICIOS ---
    function renderServicesTable() {
        const tbody = document.getElementById("services-table-body");
        if (!tbody) return;

        const services = data.services || [];
        const categories = data.categories || [];

        tbody.innerHTML = services.map(s => {
            const cat = categories.find(c => c.id === s.categoryId);
            const catName = cat ? cat.name : "General";

            return `
                <tr>
                    <td>
                        <div style="font-weight:600;">${escapeHtml(s.name)}</div>
                        <div style="font-size:11.5px; color:#777; max-width:260px;">${escapeHtml(s.description || '')}</div>
                    </td>
                    <td><span style="font-size:12px; background:#eee; padding:2px 8px; border-radius:4px;">${escapeHtml(catName)}</span></td>
                    <td><strong>$${s.price}</strong></td>
                    <td>${s.durationText || s.duration + ' min'}</td>
                    <td>
                        <span style="font-size:12px; color:${s.active !== false ? '#28a745' : '#dc3545'}; font-weight:600;">
                            ${s.active !== false ? 'Activo' : 'Pausado'}
                        </span>
                    </td>
                    <td>
                        <div class="table-actions">
                            <button class="btn-table-action btn-edit-service" data-id="${s.id}" style="background:#eef1f6; color:#333;">
                                Editar
                            </button>
                            <button class="btn-table-action btn-toggle-service" data-id="${s.id}" style="background:${s.active !== false ? '#ffc107' : '#28a745'}; color:#000;">
                                ${s.active !== false ? 'Pausar' : 'Activar'}
                            </button>
                            <button class="btn-table-action btn-delete-service" data-id="${s.id}" style="background:#dc3545; color:#fff;">
                                ✕
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        // Eventos botones
        tbody.querySelectorAll(".btn-edit-service").forEach(btn => {
            btn.addEventListener("click", () => {
                const srvId = btn.getAttribute("data-id");
                openServiceModal(srvId);
            });
        });

        tbody.querySelectorAll(".btn-toggle-service").forEach(btn => {
            btn.addEventListener("click", async () => {
                const srvId = btn.getAttribute("data-id");
                const srv = data.services.find(s => s.id === srvId);
                if (srv) {
                    srv.active = (srv.active === false);
                    await window.appStore.saveServices(data.services);
                    renderServicesTable();
                }
            });
        });

        tbody.querySelectorAll(".btn-delete-service").forEach(btn => {
            btn.addEventListener("click", async () => {
                const srvId = btn.getAttribute("data-id");
                if (confirm("¿Estás seguro de eliminar este servicio?")) {
                    data.services = data.services.filter(s => s.id !== srvId);
                    await window.appStore.saveServices(data.services);
                    renderServicesTable();
                }
            });
        });
    }

    function setupServiceModal() {
        const modal = document.getElementById("service-modal");
        const openBtn = document.getElementById("btn-add-service");
        const closeBtn = document.getElementById("btn-close-service-modal");
        const form = document.getElementById("service-form");
        const catSelect = document.getElementById("modal-service-category");

        catSelect.innerHTML = (data.categories || []).map(c => `
            <option value="${c.id}">${escapeHtml(c.name)}</option>
        `).join("");

        openBtn.addEventListener("click", () => openServiceModal(null));
        closeBtn.addEventListener("click", () => modal.style.display = "none");

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const idInput = document.getElementById("modal-service-id").value;
            const nameInput = document.getElementById("modal-service-name").value.trim();
            const catInput = document.getElementById("modal-service-category").value;
            const priceInput = parseFloat(document.getElementById("modal-service-price").value) || 0;
            const durationInput = parseInt(document.getElementById("modal-service-duration").value, 10) || 60;
            const descInput = document.getElementById("modal-service-desc").value.trim();

            if (idInput) {
                const srv = data.services.find(s => s.id === idInput);
                if (srv) {
                    srv.name = nameInput;
                    srv.categoryId = catInput;
                    srv.price = priceInput;
                    srv.duration = durationInput;
                    srv.durationText = durationInput >= 60 ? `${durationInput / 60} h` : `${durationInput} min`;
                    srv.description = descInput;
                }
            } else {
                const newSrv = {
                    id: "srv-" + Date.now(),
                    name: nameInput,
                    categoryId: catInput,
                    price: priceInput,
                    duration: durationInput,
                    durationText: durationInput >= 60 ? `${durationInput / 60} h` : `${durationInput} min`,
                    description: descInput,
                    active: true
                };
                data.services.push(newSrv);
            }

            await window.appStore.saveServices(data.services);
            renderServicesTable();
            modal.style.display = "none";
        });
    }

    function openServiceModal(serviceId) {
        const modal = document.getElementById("service-modal");
        const titleEl = document.getElementById("service-modal-title");
        const idInput = document.getElementById("modal-service-id");
        const nameInput = document.getElementById("modal-service-name");
        const catSelect = document.getElementById("modal-service-category");
        const priceInput = document.getElementById("modal-service-price");
        const durationInput = document.getElementById("modal-service-duration");
        const descInput = document.getElementById("modal-service-desc");

        if (serviceId) {
            const srv = data.services.find(s => s.id === serviceId);
            if (!srv) return;
            titleEl.textContent = "Editar servicio";
            idInput.value = srv.id;
            nameInput.value = srv.name;
            catSelect.value = srv.categoryId;
            priceInput.value = srv.price;
            durationInput.value = srv.duration;
            descInput.value = srv.description || "";
        } else {
            titleEl.textContent = "Nuevo servicio";
            idInput.value = "";
            nameInput.value = "";
            priceInput.value = "";
            durationInput.value = "60";
            descInput.value = "";
        }

        modal.style.display = "flex";
    }

    // --- SECCIÓN 3: HORARIOS ---
    function renderScheduleForm() {
        const container = document.getElementById("schedule-days-container");
        const intervalSelect = document.getElementById("schedule-interval-select");
        const form = document.getElementById("schedule-config-form");
        if (!container || !data.schedule) return;

        const timeOffBody = document.getElementById("time-off-periods-body");
        const timeOffStartInput = document.getElementById("time-off-start");
        const timeOffEndInput = document.getElementById("time-off-end");
        const timeOffReasonInput = document.getElementById("time-off-reason");
        const addTimeOffButton = document.getElementById("btn-add-time-off");
        const bookingWindowStartInput = document.getElementById("booking-window-start");
        const bookingWindowEndInput = document.getElementById("booking-window-end");
        let timeOffPeriods = (data.schedule.timeOff || []).map(period => ({ ...period }));
        const bookingWindow = data.schedule.bookingWindow || {};
        if (bookingWindowStartInput) bookingWindowStartInput.value = bookingWindow.startDate || "";
        if (bookingWindowEndInput) bookingWindowEndInput.value = bookingWindow.endDate || "";

        const timezoneInfo = document.getElementById("schedule-timezone-info");
        const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (timezoneInfo) {
            timezoneInfo.textContent = `Zona horaria actual del horario: ${data.business.timeZone || "No configurada"}. Al guardar se usará la zona de este dispositivo: ${detectedTimeZone}.`;
        }

        function renderTimeOffPeriods() {
            if (!timeOffBody) return;
            if (timeOffPeriods.length === 0) {
                timeOffBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #888; padding: 12px;">No hay períodos fuera de atención configurados.</td></tr>`;
                return;
            }
            timeOffBody.innerHTML = timeOffPeriods.map((period, index) => `
                <tr>
                    <td>${escapeHtml(period.startDate)}</td>
                    <td>${escapeHtml(period.endDate)}</td>
                    <td>${escapeHtml(period.reason || "-")}</td>
                    <td><button type="button" class="btn-table-action remove-time-off" data-index="${index}" style="background: #dc3545; color: #fff; padding: 5px 9px;">Quitar</button></td>
                </tr>
            `).join("");
            timeOffBody.querySelectorAll(".remove-time-off").forEach(button => {
                button.addEventListener("click", () => {
                    timeOffPeriods.splice(Number(button.getAttribute("data-index")), 1);
                    renderTimeOffPeriods();
                });
            });
        }

        renderTimeOffPeriods();
        if (addTimeOffButton) {
            addTimeOffButton.addEventListener("click", () => {
                const startDate = timeOffStartInput.value;
                const endDate = timeOffEndInput.value;
                const isValidDate = value => {
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
                    const date = new Date(`${value}T00:00:00Z`);
                    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
                };
                if (!isValidDate(startDate) || !isValidDate(endDate)) {
                    alert("Selecciona las fechas de inicio y fin del período fuera de atención.");
                    return;
                }
                if (endDate < startDate) {
                    alert("La fecha final debe ser igual o posterior a la fecha inicial.");
                    return;
                }
                timeOffPeriods.push({
                    startDate,
                    endDate,
                    reason: timeOffReasonInput.value.trim()
                });
                timeOffPeriods.sort((a, b) => a.startDate.localeCompare(b.startDate));
                timeOffStartInput.value = "";
                timeOffEndInput.value = "";
                timeOffReasonInput.value = "";
                renderTimeOffPeriods();
            });
        }

        if (intervalSelect) {
            intervalSelect.value = data.business.bookingIntervalMinutes || 30;
        }

        const days = [0, 1, 2, 3, 4, 5, 6];
        container.innerHTML = days.map(dayNum => {
            const s = data.schedule[dayNum] || { dayName: `Día ${dayNum}`, open: "11:00", close: "19:00", active: true };
            return `
                <div class="schedule-day-row">
                    <label class="schedule-day-name">
                        <input type="checkbox" class="sched-day-active" data-day="${dayNum}" ${s.active ? 'checked' : ''}>
                        <span>${escapeHtml(s.dayName)}</span>
                    </label>
                    <input type="time" aria-label="${escapeHtml(s.dayName)}: apertura" class="sched-day-open" data-day="${dayNum}" value="${s.open}">
                    <input type="time" aria-label="${escapeHtml(s.dayName)}: cierre" class="sched-day-close" data-day="${dayNum}" value="${s.close}">
                    <input type="time" aria-label="${escapeHtml(s.dayName)}: inicio de comida" class="sched-day-lunch-start" data-day="${dayNum}" value="${s.lunchStart || ''}">
                    <input type="time" aria-label="${escapeHtml(s.dayName)}: fin de comida" class="sched-day-lunch-end" data-day="${dayNum}" value="${s.lunchEnd || ''}">
                </div>
            `;
        }).join("");
        container.insertAdjacentHTML("afterbegin", `
            <div class="schedule-day-row schedule-day-heading" aria-hidden="true">
                <span>Día</span>
                <span>Abre</span>
                <span>Cierra</span>
                <span>Comida desde</span>
                <span>Comida hasta</span>
            </div>
        `);

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const newSched = {};
            let validationError = "";
            days.forEach(dayNum => {
                const activeBox = container.querySelector(`.sched-day-active[data-day="${dayNum}"]`);
                const openInput = container.querySelector(`.sched-day-open[data-day="${dayNum}"]`);
                const closeInput = container.querySelector(`.sched-day-close[data-day="${dayNum}"]`);
                const lunchStartInput = container.querySelector(`.sched-day-lunch-start[data-day="${dayNum}"]`);
                const lunchEndInput = container.querySelector(`.sched-day-lunch-end[data-day="${dayNum}"]`);
                const lunchStart = lunchStartInput.value;
                const lunchEnd = lunchEndInput.value;
                const existingDay = data.schedule[dayNum] || { dayName: `Día ${dayNum}` };

                const openMinutes = timeToMinutes(openInput.value);
                const closeMinutes = timeToMinutes(closeInput.value);
                if (!openInput.value || !closeInput.value || openMinutes >= closeMinutes) {
                    validationError = `La hora de apertura debe ser anterior a la hora de cierre para ${existingDay.dayName}.`;
                    return;
                }

                if (Boolean(lunchStart) !== Boolean(lunchEnd)) {
                    validationError = `Completa el inicio y fin del horario de comida para ${existingDay.dayName}.`;
                    return;
                }

                if (lunchStart) {
                    const lunchStartMinutes = timeToMinutes(lunchStart);
                    const lunchEndMinutes = timeToMinutes(lunchEnd);
                    if (lunchStartMinutes >= lunchEndMinutes || lunchStartMinutes < openMinutes || lunchEndMinutes > closeMinutes) {
                        validationError = `El horario de comida para ${existingDay.dayName} debe tener inicio antes del fin y quedar dentro del horario de atención.`;
                        return;
                    }
                }

                newSched[dayNum] = {
                    dayName: existingDay.dayName,
                    open: openInput.value,
                    close: closeInput.value,
                    lunchStart,
                    lunchEnd,
                    active: activeBox.checked
                };
            });
            if (validationError) {
                alert(validationError);
                return;
            }

            const bookingStartDate = bookingWindowStartInput.value;
            const bookingEndDate = bookingWindowEndInput.value;
            const isValidDate = value => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
                const date = new Date(`${value}T00:00:00Z`);
                return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
            };
            if (Boolean(bookingStartDate) !== Boolean(bookingEndDate)) {
                alert("Completa las dos fechas permitidas para reservar o déjalas ambas vacías.");
                return;
            }
            if (bookingStartDate && (!isValidDate(bookingStartDate) || !isValidDate(bookingEndDate))) {
                alert("Selecciona fechas válidas para el período en que se aceptarán reservas.");
                return;
            }
            if (bookingStartDate && bookingEndDate < bookingStartDate) {
                alert("La fecha final para reservar debe ser igual o posterior a la fecha inicial.");
                return;
            }

            newSched.bookingWindow = {
                startDate: bookingStartDate,
                endDate: bookingEndDate
            };
            newSched.timeOff = timeOffPeriods;

            const interval = parseInt(intervalSelect.value, 10);
            try {
                await window.appStore.updateBusinessInfo({
                    bookingIntervalMinutes: interval,
                    timeZone: detectedTimeZone
                });
                await window.appStore.saveSchedule(newSched);

                data = await window.appStore.getData();
                if (timezoneInfo) {
                    timezoneInfo.textContent = `Zona horaria actual del horario: ${data.business.timeZone}. Al guardar se usará la zona de este dispositivo: ${detectedTimeZone}.`;
                }
                alert("¡Horarios actualizados exitosamente!");
            } catch (error) {
                console.error("No se pudieron guardar los horarios.", error);
                alert(`No se pudieron guardar los horarios: ${error.message}`);
            }
        });
    }

    // --- SECCIÓN 4: RESEÑAS ---
    function renderReviewsTable() {
        const tbody = document.getElementById("reviews-table-body");
        if (!tbody) return;

        const revs = data.reviews || [];
        if (revs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#888;">No hay reseñas registradas.</td></tr>`;
            return;
        }

        tbody.innerHTML = revs.map(r => `
            <tr>
                <td><strong>${escapeHtml(r.author)}</strong></td>
                <td><span style="color:#f5a623;">${"★".repeat(r.rating || 5)}</span> (${r.rating}/5)</td>
                <td>${escapeHtml(r.date || '')}</td>
                <td style="max-width: 300px;">${escapeHtml(r.comment)}</td>
                <td>
                    <button class="btn-table-action btn-delete-review" data-id="${escapeHtml(r.id)}" style="background:#dc3545; color:#fff;">
                        Eliminar
                    </button>
                </td>
            </tr>
        `).join("");

        tbody.querySelectorAll(".btn-delete-review").forEach(btn => {
            btn.addEventListener("click", async () => {
                const revId = btn.getAttribute("data-id");
                if (confirm("¿Deseas eliminar esta reseña?")) {
                    try {
                        await window.appStore.deleteReview(revId);
                        data = await window.appStore.getData();
                        renderReviewsTable();
                    } catch (error) {
                        console.error("No se pudo eliminar la reseña.", error);
                        alert(`No se pudo eliminar la reseña: ${error.message}`);
                    }
                }
            });
        });
    }

    // --- SECCIÓN 5: NEGOCIO & PERFIL ---
    function renderBusinessForm() {
        const b = data.business || {};
        const copy = b.pageCopy || {};
        let galleryItems = Array.isArray(data.gallery) ? [...data.gallery] : [];

        const renderSingleImagePreview = (previewId, imageData) => {
            const preview = document.getElementById(previewId);
            preview.src = imageData || "";
            preview.hidden = !imageData;
        };

        const processImageFile = file => new Promise((resolve, reject) => {
            if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
                reject(new Error("Elige una imagen JPG, PNG o WebP."));
                return;
            }
            if (file.size > 12 * 1024 * 1024) {
                reject(new Error("Cada imagen debe pesar menos de 12 MB."));
                return;
            }

            const reader = new FileReader();
            reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
            reader.onload = () => {
                const image = new Image();
                image.onerror = () => reject(new Error("El archivo no es una imagen válida."));
                image.onload = () => {
                    const maxDimension = 1440;
                    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
                    const canvas = document.createElement("canvas");
                    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
                    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
                    const context = canvas.getContext("2d");
                    if (!context) {
                        reject(new Error("No se pudo preparar la imagen."));
                        return;
                    }
                    context.drawImage(image, 0, 0, canvas.width, canvas.height);
                    const webp = canvas.toDataURL("image/webp", 0.8);
                    resolve(webp.startsWith("data:image/webp")
                        ? webp
                        : canvas.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.82));
                };
                image.src = reader.result;
            };
            reader.readAsDataURL(file);
        });

        document.getElementById("biz-input-name").value = b.name || "";
        document.getElementById("biz-input-spec").value = b.specialty || "";
        document.getElementById("biz-input-tagline").value = b.tagline || "";
        document.getElementById("biz-input-address").value = b.address || "";
        document.getElementById("biz-input-verified-badge").checked = b.showVerifiedBadge !== false;
        document.getElementById("biz-input-avatar").value = b.avatarUrl || "";
        document.getElementById("biz-input-cover").value = b.coverUrl || "";
        renderSingleImagePreview("biz-preview-avatar", b.avatarUrl);
        renderSingleImagePreview("biz-preview-cover", b.coverUrl);

        const setupSingleImageUpload = (uploadId, valueId, previewId, removeId) => {
            const upload = document.getElementById(uploadId);
            const value = document.getElementById(valueId);
            upload.addEventListener("change", async () => {
                try {
                    value.value = await processImageFile(upload.files[0]);
                    renderSingleImagePreview(previewId, value.value);
                } catch (error) {
                    alert(error.message);
                } finally {
                    upload.value = "";
                }
            });
            document.getElementById(removeId).addEventListener("click", () => {
                value.value = "";
                renderSingleImagePreview(previewId, "");
            });
        };
        setupSingleImageUpload("biz-upload-avatar", "biz-input-avatar", "biz-preview-avatar", "biz-remove-avatar");
        setupSingleImageUpload("biz-upload-cover", "biz-input-cover", "biz-preview-cover", "biz-remove-cover");

        const galleryPreview = document.getElementById("biz-gallery-preview");
        const renderGalleryPreview = () => {
            galleryPreview.innerHTML = galleryItems.length
                ? galleryItems.map((item, index) => `
                    <div class="business-gallery-item">
                        <img src="${item.thumb || item.src}" alt="${escapeHtml(item.title || "Foto de galería")}">
                        <span>${escapeHtml(item.title || "Foto")}</span>
                        <button type="button" data-gallery-index="${index}" aria-label="Quitar ${escapeHtml(item.title || "foto")}">Quitar</button>
                    </div>
                `).join("")
                : `<p class="business-gallery-empty">Todavía no has subido fotos.</p>`;
        };
        renderGalleryPreview();
        galleryPreview.addEventListener("click", event => {
            const button = event.target.closest("[data-gallery-index]");
            if (!button) return;
            galleryItems.splice(Number(button.dataset.galleryIndex), 1);
            renderGalleryPreview();
        });
        document.getElementById("biz-upload-gallery").addEventListener("change", async event => {
            const files = Array.from(event.target.files || []);
            const errors = [];
            for (const file of files) {
                if (galleryItems.length >= 20) {
                    errors.push("La galería admite hasta 20 fotos.");
                    break;
                }
                try {
                    const src = await processImageFile(file);
                    const title = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
                    galleryItems.push({
                        id: `gallery-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                        title,
                        album: "Galería",
                        src,
                        thumb: src
                    });
                } catch (error) {
                    errors.push(`${file.name}: ${error.message}`);
                }
            }
            renderGalleryPreview();
            event.target.value = "";
            if (errors.length) alert(errors.join("\n"));
        });
        document.getElementById("biz-input-primary-color").value = b.primaryColor || "#2563eb";
        document.getElementById("biz-input-secondary-color").value = b.secondaryColor || "#0f172a";
        document.getElementById("biz-input-background-color").value = b.backgroundColor || "#f5f5f8";
        document.getElementById("biz-input-font-family").value = b.fontFamily || "system";
        document.getElementById("biz-copy-home-welcome").value = copy.homeWelcome || "";
        document.getElementById("biz-copy-reserve-button").value = copy.reserveButton || "";
        document.getElementById("biz-copy-featured-services").value = copy.featuredServices || "";
        document.getElementById("biz-copy-catalog-link").value = copy.catalogLink || "";
        document.getElementById("biz-copy-tab-services").value = copy.tabServices || "";
        document.getElementById("biz-copy-tab-gallery").value = copy.tabGallery || "";
        document.getElementById("biz-copy-tab-reviews").value = copy.tabReviews || "";
        document.getElementById("biz-copy-tab-schedule").value = copy.tabSchedule || "";
        document.getElementById("biz-copy-booking-title").value = copy.bookingTitle || "";
        document.getElementById("biz-copy-schedule-title").value = copy.scheduleTitle || "";
        document.getElementById("biz-copy-confirmation-title").value = copy.bookingConfirmationTitle || "";
        document.getElementById("biz-copy-booking-services").value = copy.bookingStepServices || "";
        document.getElementById("biz-copy-booking-instructions").value = copy.bookingStepInstructions || "";
        document.getElementById("biz-copy-booking-date-time").value = copy.bookingStepDateTime || "";
        document.getElementById("biz-copy-booking-client").value = copy.bookingStepClient || "";
        document.getElementById("biz-input-whatsapp").value = b.whatsapp || "";
        document.getElementById("biz-input-phone").value = b.phone || "";
        document.getElementById("biz-input-instagram").value = b.instagram || "";
        document.getElementById("biz-input-pin").value = "";
        document.getElementById("biz-input-cabin").value = b.cabinNotes || "";

        if (b.bannerPromo) {
            document.getElementById("biz-input-promo-active").checked = b.bannerPromo.active !== false;
            document.getElementById("biz-input-promo-title").value = b.bannerPromo.title || "";
            document.getElementById("biz-input-promo-desc").value = b.bannerPromo.desc || "";
        } else {
            document.getElementById("biz-input-promo-active").checked = true;
        }

        const form = document.getElementById("business-config-form");
        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const newPin = document.getElementById("biz-input-pin").value.trim();
            const updatedBiz = {
                name: document.getElementById("biz-input-name").value.trim(),
                specialty: document.getElementById("biz-input-spec").value.trim(),
                tagline: document.getElementById("biz-input-tagline").value.trim(),
                address: document.getElementById("biz-input-address").value.trim(),
                showVerifiedBadge: document.getElementById("biz-input-verified-badge").checked,
                avatarUrl: document.getElementById("biz-input-avatar").value.trim(),
                coverUrl: document.getElementById("biz-input-cover").value.trim(),
                primaryColor: document.getElementById("biz-input-primary-color").value,
                secondaryColor: document.getElementById("biz-input-secondary-color").value,
                backgroundColor: document.getElementById("biz-input-background-color").value,
                fontFamily: document.getElementById("biz-input-font-family").value,
                pageCopy: {
                    ...data.business.pageCopy,
                    homeWelcome: document.getElementById("biz-copy-home-welcome").value.trim(),
                    reserveButton: document.getElementById("biz-copy-reserve-button").value.trim(),
                    featuredServices: document.getElementById("biz-copy-featured-services").value.trim(),
                    catalogLink: document.getElementById("biz-copy-catalog-link").value.trim(),
                    tabServices: document.getElementById("biz-copy-tab-services").value.trim(),
                    tabGallery: document.getElementById("biz-copy-tab-gallery").value.trim(),
                    tabReviews: document.getElementById("biz-copy-tab-reviews").value.trim(),
                    tabSchedule: document.getElementById("biz-copy-tab-schedule").value.trim(),
                    scheduleTitle: document.getElementById("biz-copy-schedule-title").value.trim(),
                    bookingTitle: document.getElementById("biz-copy-booking-title").value.trim(),
                    bookingStepServices: document.getElementById("biz-copy-booking-services").value.trim(),
                    bookingStepInstructions: document.getElementById("biz-copy-booking-instructions").value.trim(),
                    bookingStepDateTime: document.getElementById("biz-copy-booking-date-time").value.trim(),
                    bookingStepClient: document.getElementById("biz-copy-booking-client").value.trim(),
                    bookingConfirmationTitle: document.getElementById("biz-copy-confirmation-title").value.trim()
                },
                whatsapp: document.getElementById("biz-input-whatsapp").value.trim(),
                phone: document.getElementById("biz-input-phone").value.trim(),
                instagram: document.getElementById("biz-input-instagram").value.trim(),
                cabinNotes: document.getElementById("biz-input-cabin").value.trim(),
                bannerPromo: {
                    active: document.getElementById("biz-input-promo-active").checked,
                    title: document.getElementById("biz-input-promo-title").value.trim(),
                    desc: document.getElementById("biz-input-promo-desc").value.trim()
                }
            };

            try {
                await window.appStore.updateBusinessInfo(updatedBiz);
                await window.appStore.saveGallery(galleryItems);
                if (newPin) {
                    await window.appStore.changeAdminPin(newPin);
                    document.getElementById("biz-input-pin").value = "";
                }
                data = await window.appStore.getData();
                applyBusinessAppearance(data.business);
                applyBusinessFavicon(data.business);
                document.title = `Administración - ${data.business.name}`;
                document.getElementById("sidebar-biz-name").textContent = data.business.name;
                alert("¡Datos del negocio guardados exitosamente!");
            } catch (error) {
                console.error("No se pudieron guardar todos los datos del negocio.", error);
                alert(`No se pudieron guardar todos los datos del negocio: ${error.message}`);
            }
        });
    }

    // ==========================================================================
    // SISTEMA DE NOTIFICACIONES EN TIEMPO REAL (SONIDO, PUSH Y TOAST)
    // ==========================================================================

    function setupRealtimeNotifications() {
        const notifBtn = document.getElementById("btn-request-notif");
        const notifText = document.getElementById("notif-btn-text");

        // Comprobar permiso actual de notificaciones
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            notificationsEnabled = true;
            if (notifBtn) {
                notifBtn.classList.add("enabled");
                notifText.textContent = "Alertas Activadas ✓";
            }
        }

        if (notifBtn) {
            notifBtn.addEventListener("click", async () => {
                // Desbloquear audio contexto con clic del usuario
                playNotificationSound();

                if (typeof Notification !== "undefined") {
                    const perm = await Notification.requestPermission();
                    if (perm === "granted") {
                        notificationsEnabled = true;
                        notifBtn.classList.add("enabled");
                        notifText.textContent = "Alertas Activadas ✓";
                        showToastNotification({
                            clientName: "Sistema de Alertas",
                            services: [{ name: "Alertas sonoras y de escritorio activadas con éxito." }],
                            date: "Hoy",
                            time: "Ahora",
                            id: "OK"
                        });
                    }
                } else {
                    notifBtn.classList.add("enabled");
                    notifText.textContent = "Sonido Activado ✓";
                }
            });
        }

        // 1. Escuchar señal por BroadcastChannel
        try {
            if (window.BroadcastChannel) {
                const bc = new BroadcastChannel("tarot_agenda_events");
                bc.onmessage = (event) => {
                    if (event.data && event.data.type === "NEW_APPOINTMENT") {
                        handleIncomingNewAppointment(event.data.appointment);
                    }
                };
            }
        } catch (e) {}

        // 2. Escuchar cambios de localStorage entre pestañas
        window.addEventListener("storage", (e) => {
            if (e.key === "tarot_latest_appointment" && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue);
                    if (parsed && parsed.appointment) {
                        handleIncomingNewAppointment(parsed.appointment);
                    }
                } catch (err) {}
            }
        });

        // 3. Sondeo periódico automático (Polling cada 5 segundos)
        setInterval(async () => {
            try {
                const freshData = await window.appStore.getData();
                const freshAppts = freshData.appointments || [];

                freshAppts.forEach(appt => {
                    if (!knownAppointmentIds.has(appt.id)) {
                        knownAppointmentIds.add(appt.id);
                        handleIncomingNewAppointment(appt);
                    }
                });
            } catch (err) {}
        }, 5000);
    }

    function handleIncomingNewAppointment(appt) {
        if (!appt || !appt.id) return;
        if (knownAppointmentIds.has(appt.id)) return;
        knownAppointmentIds.add(appt.id);

        // 1. Reproducir campanilla sonora (Web Audio API)
        playNotificationSound();

        // 2. Mostrar banner Toast en pantalla
        showToastNotification(appt);

        // 3. Notificación de escritorio si está permitida
        showDesktopNotification(appt);

        // 4. Actualizar tabla y métricas en vivo sin recargar
        window.appStore.getData().then(freshData => {
            data = freshData;
            renderAppointments();
        });
    }

    // Sintetizador de audio nativo Web Audio API (campanilla de 2 tonos)
    function playNotificationSound() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const now = ctx.currentTime;

            // Tono 1 (D5 - 587.33 Hz)
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = "sine";
            osc1.frequency.setValueAtTime(587.33, now);
            gain1.gain.setValueAtTime(0.3, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.4);

            // Tono 2 más agudo y brillante (A5 - 880 Hz)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = "sine";
            osc2.frequency.setValueAtTime(880, now + 0.15);
            gain2.gain.setValueAtTime(0.35, now + 0.15);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.15);
            osc2.stop(now + 0.85);
        } catch (e) {
            console.log("Audio de alerta no reproducido", e);
        }
    }

    function showToastNotification(appt) {
        const toastContainer = document.getElementById("admin-toast-container");
        if (!toastContainer) return;

        const srvNames = (appt.services || []).map(s => s.name).join(", ");
        const toast = document.createElement("div");
        toast.className = "notification-toast";
        toast.innerHTML = `
            <div class="toast-icon">🔔</div>
            <div class="toast-body">
                <div class="toast-title">${appt.status === "pendiente" ? "¡Nueva Reserva Pendiente!" : "¡Nueva Reserva Confirmada!"}</div>
                <div class="toast-desc">
                    <strong>${escapeHtml(appt.clientName)}</strong> reservó <strong>${escapeHtml(srvNames)}</strong> para el <strong>${escapeHtml(appt.date)}</strong> a las <strong>${escapeHtml(appt.time)}</strong>.
                </div>
            </div>
            <button class="toast-close">&times;</button>
        `;

        toast.querySelector(".toast-close").addEventListener("click", () => {
            toast.remove();
        });

        toastContainer.appendChild(toast);

        // Auto remover después de 8 segundos
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.opacity = "0";
                toast.style.transform = "translateX(50px)";
                setTimeout(() => toast.remove(), 300);
            }
        }, 8000);
    }

    function showDesktopNotification(appt) {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            const srvNames = (appt.services || []).map(s => s.name).join(", ");
            try {
                new Notification(`¡Nueva Cita en ${data.business.name}!`, {
                    body: `${appt.clientName} agendó ${srvNames} para el ${appt.date} a las ${appt.time}.`,
                    icon: data.business.avatarUrl
                });
            } catch (e) {}
        }
    }

    function escapeHtml(text) {
        if (text === undefined || text === null) return "";
        const div = document.createElement("div");
        div.textContent = String(text);
        return div.innerHTML;
    }

    function getAppointmentStatusKey(status) {
        const allowedStatuses = ["confirmada", "completada", "pendiente", "cancelada"];
        const normalizedStatus = String(status || "confirmada").toLowerCase();
        return allowedStatuses.includes(normalizedStatus) ? normalizedStatus : "confirmada";
    }

    // =====================================================
    // SECCIÓN: REPORTE MENSUAL & GANANCIAS CON EXCEL
    // =====================================================
    function renderReportsSection() {
        const monthSelect = document.getElementById("report-month-select");
        const yearSelect = document.getElementById("report-year-select");
        const btnGenerate = document.getElementById("btn-generate-report");
        const btnExport = document.getElementById("btn-export-excel");
        if (!monthSelect || !yearSelect || !btnGenerate || !btnExport) return;

        // Poblar selector de años (últimos 3 años + año actual + siguiente)
        const currentYear = new Date().getFullYear();
        yearSelect.innerHTML = "";
        for (let y = currentYear + 1; y >= currentYear - 2; y--) {
            const opt = document.createElement("option");
            opt.value = y;
            opt.textContent = y;
            if (y === currentYear) opt.selected = true;
            yearSelect.appendChild(opt);
        }

        // Seleccionar mes actual por defecto
        monthSelect.value = new Date().getMonth();

        // Almacenar las citas filtradas para exportar
        let currentReportData = [];

        btnGenerate.addEventListener("click", () => {
            const selectedMonth = parseInt(monthSelect.value);
            const selectedYear = parseInt(yearSelect.value);
            generateReport(selectedMonth, selectedYear);
        });

        btnExport.addEventListener("click", () => {
            exportToExcel(currentReportData);
        });

        function generateReport(month, year) {
            const allAppts = data.appointments || [];
            const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

            // Filtrar citas del mes/año seleccionado
            const filtered = allAppts.filter(a => {
                if (!a.date) return false;
                const d = new Date(a.date + "T00:00:00");
                return d.getMonth() === month && d.getFullYear() === year;
            });

            currentReportData = filtered;

            // Ocultar/mostrar elementos
            document.getElementById("report-placeholder").style.display = "none";
            document.getElementById("report-empty").style.display = "none";
            document.getElementById("report-metrics").style.display = "none";
            document.getElementById("report-table-wrap").style.display = "none";
            btnExport.style.display = "none";

            if (filtered.length === 0) {
                document.getElementById("report-empty").style.display = "block";
                return;
            }

            // Calcular métricas
            const totalCitas = filtered.length;
            const totalIngresos = filtered.reduce((sum, a) => sum + (a.totalPrice || 0), 0);
            const promedio = totalCitas > 0 ? Math.round(totalIngresos / totalCitas) : 0;
            const totalServicios = filtered.reduce((sum, a) => sum + (a.services || []).length, 0);

            document.getElementById("rpt-metric-citas").textContent = totalCitas;
            document.getElementById("rpt-metric-ingresos").textContent = `$${totalIngresos.toLocaleString('es-MX')}`;
            document.getElementById("rpt-metric-promedio").textContent = `$${promedio.toLocaleString('es-MX')}`;
            document.getElementById("rpt-metric-servicios").textContent = totalServicios;
            document.getElementById("rpt-metric-ingresos").parentElement.previousElementSibling && null;

            document.getElementById("report-metrics").style.display = "grid";
            document.getElementById("report-period-title").textContent = `Detalle de Citas — ${monthNames[month]} ${year}`;
            document.getElementById("rpt-total-row").textContent = `$${totalIngresos.toLocaleString('es-MX')} MXN`;

            // Llenar tabla
            const tbody = document.getElementById("report-table-body");
            const statusLabels = { confirmada: "✅ Confirmada", completada: "🏁 Completada", pendiente: "⏳ Pendiente", cancelada: "❌ Cancelada" };

            tbody.innerHTML = filtered.map(a => {
                const srvNames = (a.services || []).map(s => s.name).join(", ") || "-";
                const status = Object.prototype.hasOwnProperty.call(statusLabels, a.status)
                    ? statusLabels[a.status]
                    : escapeHtml(a.status || "Confirmada");
                return `
                    <tr style="border-bottom: 1px solid #f0f0f0;">
                        <td style="padding: 9px 12px;">
                            <div style="font-weight: 600;">${escapeHtml(a.clientName)}</div>
                            <div style="font-size: 11px; color: #888;">${escapeHtml(a.clientPhone || "")}</div>
                        </td>
                        <td style="padding: 9px 12px; white-space: nowrap;">${escapeHtml(a.date)}</td>
                        <td style="padding: 9px 12px; white-space: nowrap;">${escapeHtml(a.time || "")}</td>
                        <td style="padding: 9px 12px; max-width: 200px; font-size: 12px;">${escapeHtml(srvNames)}</td>
                        <td style="padding: 9px 12px; text-align: right; font-weight: 700; color: #1d6f42;">$${escapeHtml((Number(a.totalPrice) || 0).toLocaleString('es-MX'))}</td>
                        <td style="padding: 9px 12px; font-size: 12px; white-space: nowrap;">${status}</td>
                    </tr>
                `;
            }).join("");

            // Desglose por servicio
            const serviceCounts = {};
            filtered.forEach(a => {
                (a.services || []).forEach(s => {
                    const key = s.name || "Sin nombre";
                    if (!serviceCounts[key]) serviceCounts[key] = { count: 0, revenue: 0 };
                    serviceCounts[key].count++;
                    serviceCounts[key].revenue += s.price || 0;
                });
            });

            const sortedServices = Object.entries(serviceCounts).sort((a, b) => b[1].count - a[1].count);
            const breakdown = document.getElementById("report-services-breakdown");
            breakdown.innerHTML = sortedServices.map(([name, info], i) => `
                <div style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 10px; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 12px; color: #999; font-weight: 600;">#${i + 1}</div>
                        <div style="font-weight: 700; font-size: 13.5px; margin-top: 2px;">${escapeHtml(name)}</div>
                        <div style="font-size: 12px; color: #777; margin-top: 2px;">${info.count} veces realizad${info.count === 1 ? 'o' : 'os'}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 15px; font-weight: 800; color: #1d6f42;">$${info.revenue.toLocaleString('es-MX')}</div>
                        <div style="font-size: 11px; color: #999;">ingresos</div>
                    </div>
                </div>
            `).join("");

            document.getElementById("report-table-wrap").style.display = "block";
            btnExport.style.display = "inline-block";
        }

        function exportToExcel(appts) {
            if (!appts || appts.length === 0) {
                alert("No hay datos para exportar.");
                return;
            }

            const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
            const month = parseInt(monthSelect.value);
            const year = parseInt(yearSelect.value);
            const periodName = `${monthNames[month]} ${year}`;

            // ---- HOJA 1: DETALLE DE CITAS ----
            const citasRows = [
                [`REPORTE MENSUAL DE CITAS — ${data.business.name}`],
                [`Período: ${periodName}`],
                [`Generado: ${new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}`],
                [],
                ["Cliente", "Teléfono", "Fecha", "Hora", "Hora Fin", "Servicios", "Notas", "Total (MXN)", "Estado"]
            ];

            appts.forEach(a => {
                const srvNames = (a.services || []).map(s => s.name).join(", ") || "-";
                citasRows.push([
                    a.clientName || "-",
                    a.clientPhone || "-",
                    a.date || "-",
                    a.time || "-",
                    a.endTime || "-",
                    srvNames,
                    a.notes || "-",
                    a.totalPrice || 0,
                    a.status || "confirmada"
                ]);
            });

            // Fila totales
            const totalIngresos = appts.reduce((s, a) => s + (a.totalPrice || 0), 0);
            citasRows.push([]);
            citasRows.push(            ["", "", "", "", "", "", "", "TOTAL DEL MES:", totalIngresos, ""]);

            // ---- HOJA 2: DESGLOSE POR SERVICIO ----
            const serviceCounts = {};
            appts.forEach(a => {
                (a.services || []).forEach(s => {
                    const key = s.name || "Sin nombre";
                    if (!serviceCounts[key]) serviceCounts[key] = { count: 0, revenue: 0 };
                    serviceCounts[key].count++;
                    serviceCounts[key].revenue += s.price || 0;
                });
            });

            const serviciosRows = [
                [`LECTURAS REALIZADAS — ${periodName}`],
                [],
                ["#", "Servicio", "Veces realizado", "Ingresos generados (MXN)"]
            ];

            Object.entries(serviceCounts)
                .sort((a, b) => b[1].count - a[1].count)
                .forEach(([name, info], i) => {
                    serviciosRows.push([i + 1, name, info.count, info.revenue]);
                });

            serviciosRows.push([]);
            serviciosRows.push(["", "TOTAL", appts.length, totalIngresos]);

            // ---- CREAR LIBRO EXCEL ----
            const wb = XLSX.utils.book_new();

            const ws1 = XLSX.utils.aoa_to_sheet(citasRows);
            // Estilos de ancho de columnas
            ws1["!cols"] = [
                { wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 8 },
                { wch: 8 }, { wch: 40 }, { wch: 30 }, { wch: 14 }, { wch: 12 }
            ];

            const ws2 = XLSX.utils.aoa_to_sheet(serviciosRows);
            ws2["!cols"] = [{ wch: 5 }, { wch: 36 }, { wch: 18 }, { wch: 22 }];

            XLSX.utils.book_append_sheet(wb, ws1, "Citas del Mes");
            XLSX.utils.book_append_sheet(wb, ws2, "Servicios realizados");

            const fileName = `Reporte_Servicios_${monthNames[month]}_${year}.xlsx`;
            XLSX.writeFile(wb, fileName);
        }
    }

});

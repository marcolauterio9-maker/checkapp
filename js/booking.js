/**
 * Motor del Flujo de Agendamiento de Citas (booking.html)
 * Control de pasos, selección múltiple, calendario interactivo, turnos y confirmación
 */

document.addEventListener("DOMContentLoaded", async () => {
    let data = await window.appStore.getData();
    const pageCopy = data.business.pageCopy || {};
    const getCopy = (key, fallback) => pageCopy[key] || fallback;
    applyBusinessAppearance(data.business);

    // Estado global de la reservación
    const bookingState = {
        currentStep: 1,
        selectedServices: [],
        selectedSpecialist: (data.specialists || []).find(specialist => specialist.active !== false) || { id: "profesional-principal", name: "Profesional" },
        selectedDate: null,
        selectedTime: null,
        selectedSlot: null,
        calYear: new Date().getFullYear(),
        calMonth: new Date().getMonth() // 0 = Ene, 8 = Sep, etc.
    };

    const businessTimeZone = data.business.timeZone || "America/Hermosillo";
    const clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const zonedFormatters = new Map();

    function timeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(":").map(Number);
        return hours * 60 + minutes;
    }

    function getZonedDateParts(date, timeZone) {
        let formatter = zonedFormatters.get(timeZone);
        if (!formatter) {
            formatter = new Intl.DateTimeFormat("en-US", {
                timeZone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23"
            });
            zonedFormatters.set(timeZone, formatter);
        }
        const parts = formatter.formatToParts(date);
        return Object.fromEntries(parts
            .filter(part => part.type !== "literal")
            .map(part => [part.type, Number(part.value)]));
    }

    function zonedDateTimeToDate(dateStr, timeStr, timeZone) {
        const [year, month, day] = dateStr.split("-").map(Number);
        const [hour, minute] = timeStr.split(":").map(Number);
        const targetUtc = Date.UTC(year, month - 1, day, hour, minute);
        let timestamp = targetUtc;

        for (let attempt = 0; attempt < 4; attempt++) {
            const parts = getZonedDateParts(new Date(timestamp), timeZone);
            const representedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
            const difference = targetUtc - representedUtc;
            timestamp += difference;
            if (difference === 0) break;
        }

        const result = new Date(timestamp);
        const actual = getZonedDateParts(result, timeZone);
        if (actual.year !== year || actual.month !== month || actual.day !== day
            || actual.hour !== hour || actual.minute !== minute) {
            return null;
        }
        return result;
    }

    function addDays(dateStr, days) {
        const [year, month, day] = dateStr.split("-").map(Number);
        const shifted = new Date(Date.UTC(year, month - 1, day + days));
        return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
    }

    function formatClientDate(date) {
        return new Intl.DateTimeFormat("es", {
            timeZone: clientTimeZone,
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        }).format(date);
    }

    function formatClientTime(date, includeZone) {
        return new Intl.DateTimeFormat("es", {
            timeZone: clientTimeZone,
            hour: "numeric",
            minute: "2-digit",
            hourCycle: "h12",
            ...(includeZone ? { timeZoneName: "short" } : {})
        }).format(date);
    }

    function getAppointmentStart(a) {
        if (a.startAt) return new Date(a.startAt);
        return zonedDateTimeToDate(a.date, a.time, a.timeZone || businessTimeZone);
    }

    function getAppointmentDuration(a) {
        if (Number(a.durationMins) > 0) return Number(a.durationMins);
        const duration = (a.services || []).reduce((sum, bookedService) => {
            const service = (data.services || []).find(item => item.id === bookedService.id);
            return sum + (service ? Number(service.duration) || 0 : 0);
        }, 0);
        return duration > 0 ? duration : 60;
    }

    // Inicializar vistas
    initHeader();
    renderCategoriesAndServices();
    renderBookingSteps();
    setupCalendar();
    setupNavigation();
    setupClientForm();
    checkUrlPreselection();

    // --- 1. CABECERA ---
    function initHeader() {
        applyBusinessFavicon(data.business);
        const avatarEl = document.getElementById("booking-biz-avatar");
        const bizNameEl = document.getElementById("step-biz-name");
        const avatarUrl = getBusinessImageUrl(data.business.avatarUrl)
            || getBusinessImageUrl("images/default-business-logo.svg");
        if (avatarEl) {
            avatarEl.src = avatarUrl;
            avatarEl.alt = `Logo de ${data.business.name}`;
        }
        if (bizNameEl) bizNameEl.textContent = data.business.name;
        document.title = `${getCopy("bookingTitle", "Reservar una cita")} - ${data.business.name}`;
        const clientDataTitle = document.getElementById("client-data-title");
        if (clientDataTitle) clientDataTitle.textContent = getCopy("bookingStepClient", "Tus datos");
        const confirmationTitle = document.getElementById("booking-confirmation-title");
        if (confirmationTitle) {
            confirmationTitle.textContent = getCopy("bookingConfirmationTitle", "¡Solicitud de reserva recibida!");
        }
    }

    // --- 2. PASO 1: SERVICIOS Y CATEGORÍAS ---
    function renderCategoriesAndServices() {
        const container = document.getElementById("services-accordions-container");
        if (!container) return;

        const categories = data.categories || [];
        const services = data.services || [];

        if (!services.some(service => service.active !== false)) {
            container.innerHTML = `<div class="empty-content-message">Aún no hay servicios disponibles para reservar. Comunícate con el negocio para más información.</div>`;
            return;
        }

        let html = "";
        categories.forEach(cat => {
            const catServices = services.filter(s => s.categoryId === cat.id && s.active !== false);
            if (catServices.length === 0) return;

            html += `
                <div class="category-accordion" id="cat-acc-${cat.id}">
                    <div class="category-header" data-cat="${cat.id}">
                        <div>
                            <span>${escapeHtml(cat.name)}</span>
                            <span class="cat-count" id="cat-count-${cat.id}"></span>
                        </div>
                        <span class="cat-caret">▼</span>
                    </div>
                    <div class="category-services-list">
                        ${catServices.map(srv => `
                            <div class="service-select-item" data-id="${srv.id}" id="srv-item-${srv.id}">
                                <div class="service-item-info">
                                    <div class="service-item-title">${escapeHtml(srv.name)}</div>
                                    <div class="service-item-meta">
                                        <span class="price">Desde $${srv.price}</span>
                                        <span>⏱ ${srv.durationText || srv.duration + ' min'}</span>
                                    </div>
                                    ${srv.description ? `
                                        <div class="service-item-desc" id="desc-${srv.id}">
                                            <span class="desc-toggle-btn">Lee más...</span>
                                            <div class="desc-text">
                                                <p>${escapeHtml(srv.description)}</p>
                                                <span class="desc-toggle-btn">Leer menos</span>
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                                <div class="service-select-check">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>
                                </div>
                            </div>
                        `).join("")}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Eventos acordeón
        container.querySelectorAll(".category-header").forEach(header => {
            header.addEventListener("click", () => {
                header.closest(".category-accordion").classList.toggle("collapsed");
            });
        });

        // Eventos toggle descripción "Lee más..."
        container.querySelectorAll(".desc-toggle-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const descWrap = btn.closest(".service-item-desc");
                descWrap.classList.toggle("expanded");
            });
        });

        // Eventos selección de servicio
        container.querySelectorAll(".service-select-item").forEach(item => {
            item.addEventListener("click", () => {
                const srvId = item.getAttribute("data-id");
                toggleServiceSelection(srvId);
            });
        });
    }

    function toggleServiceSelection(serviceId) {
        const service = (data.services || []).find(s => s.id === serviceId);
        if (!service) return;

        const idx = bookingState.selectedServices.findIndex(s => s.id === serviceId);
        const itemEl = document.getElementById(`srv-item-${serviceId}`);

        if (idx >= 0) {
            bookingState.selectedServices.splice(idx, 1);
            if (itemEl) itemEl.classList.remove("selected");
        } else {
            bookingState.selectedServices.push(service);
            if (itemEl) itemEl.classList.add("selected");
        }

        updateCategoryBadges();
        updateFloatingFooter();
    }

    function updateCategoryBadges() {
        (data.categories || []).forEach(cat => {
            const countInCat = bookingState.selectedServices.filter(s => s.categoryId === cat.id).length;
            const badgeEl = document.getElementById(`cat-count-${cat.id}`);
            if (badgeEl) {
                badgeEl.textContent = countInCat > 0 ? `(seleccionado: ${countInCat})` : "";
            }
        });
    }

    function updateFloatingFooter() {
        const footer = document.getElementById("booking-floating-footer");
        const countLabel = document.getElementById("footer-count-label");
        const priceLabel = document.getElementById("footer-price-label");
        const nextBtn = document.getElementById("btn-floating-next");
        nextBtn.textContent = bookingState.currentStep === 2 ? "Aceptar" : "Continuar";

        if (bookingState.currentStep === 1) {
            const count = bookingState.selectedServices.length;
            if (count > 0) {
                footer.style.display = "flex";
                const total = bookingState.selectedServices.reduce((sum, s) => sum + (s.price || 0), 0);
                countLabel.textContent = `${count} ${count === 1 ? 'servicio' : 'servicios'} seleccionado${count > 1 ? 's' : ''}`;
                priceLabel.textContent = `Total estimado: $${total}`;
                nextBtn.disabled = false;
            } else {
                footer.style.display = "none";
            }
        } else if (bookingState.currentStep === 2) {
            footer.style.display = "flex";
            countLabel.textContent = "Pasos para reservar";
            priceLabel.textContent = "Paso 2 de 4";
            nextBtn.disabled = false;
        } else if (bookingState.currentStep === 3) {
            if (bookingState.selectedDate && bookingState.selectedTime) {
                footer.style.display = "flex";
                countLabel.textContent = `${formatDateShort(bookingState.selectedDate)} a las ${bookingState.selectedSlot ? formatClientTime(bookingState.selectedSlot.start, true) : formatTime12h(bookingState.selectedTime)}`;
                priceLabel.textContent = "Horario listo";
                nextBtn.disabled = false;
            } else {
                footer.style.display = "none";
            }
        } else {
            footer.style.display = "none";
        }
    }

    function checkUrlPreselection() {
        const params = new URLSearchParams(window.location.search);
        const srvId = params.get("service");
        if (srvId) {
            toggleServiceSelection(srvId);
            const el = document.getElementById(`srv-item-${srvId}`);
            if (el) {
                setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
            }
        }
    }

    function renderBookingSteps() {
        const container = document.getElementById("booking-steps-list");
        if (!container) return;
        const steps = Array.isArray(data.bookingSteps) && data.bookingSteps.length > 0
            ? data.bookingSteps
            : DEFAULT_DATA.bookingSteps;

        container.innerHTML = steps.map((step, index) => `
            <div class="booking-instruction-step">
                <span class="booking-instruction-number">${index + 1}</span>
                <div>
                    <strong>${escapeHtml(step.title)}</strong>
                    <p>${escapeHtml(step.description)}</p>
                </div>
            </div>
        `).join("");
    }

    // --- 4. PASO 3: CALENDARIO Y GENERACIÓN DE TURNOS ---
    function setupCalendar() {
        const prevBtn = document.getElementById("cal-prev-month");
        const nextBtn = document.getElementById("cal-next-month");

        if (prevBtn) {
            prevBtn.addEventListener("click", () => {
                bookingState.calMonth--;
                if (bookingState.calMonth < 0) {
                    bookingState.calMonth = 11;
                    bookingState.calYear--;
                }
                bookingState.selectedDate = null;
                bookingState.selectedTime = null;
                bookingState.selectedSlot = null;
                renderMonthCalendar();
                updateFloatingFooter();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener("click", () => {
                bookingState.calMonth++;
                if (bookingState.calMonth > 11) {
                    bookingState.calMonth = 0;
                    bookingState.calYear++;
                }
                bookingState.selectedDate = null;
                bookingState.selectedTime = null;
                bookingState.selectedSlot = null;
                renderMonthCalendar();
                updateFloatingFooter();
            });
        }
    }

    function renderMonthCalendar() {
        const monthLabel = document.getElementById("cal-month-label");
        const tbody = document.getElementById("calendar-days-body");
        if (!monthLabel || !tbody) return;

        const monthsNames = [
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
        ];

        monthLabel.textContent = `${monthsNames[bookingState.calMonth]}, ${bookingState.calYear}`;

        const firstDayOfMonth = new Date(bookingState.calYear, bookingState.calMonth, 1);
        const daysInMonth = new Date(bookingState.calYear, bookingState.calMonth + 1, 0).getDate();
        const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Domingo, 1 = Lunes...

        const today = new Date();
        today.setHours(0,0,0,0);

        let html = "<tr>";
        let dayCounter = 1;

        // Días previos en blanco
        for (let i = 0; i < startDayOfWeek; i++) {
            html += `<td></td>`;
        }

        let currentDayOfWeek = startDayOfWeek;
        while (dayCounter <= daysInMonth) {
            if (currentDayOfWeek === 7) {
                html += `</tr><tr>`;
                currentDayOfWeek = 0;
            }

            const thisDate = new Date(bookingState.calYear, bookingState.calMonth, dayCounter);
            thisDate.setHours(0,0,0,0);

            const isPast = thisDate < today;
            const isToday = thisDate.getTime() === today.getTime();
            const dateStr = `${bookingState.calYear}-${(bookingState.calMonth + 1).toString().padStart(2, '0')}-${dayCounter.toString().padStart(2, '0')}`;
            const isSelected = (bookingState.selectedDate === dateStr);

            const isDayActive = !isPast && getAvailableSlotsForClientDate(dateStr).length > 0;

            let classes = ["cal-day"];
            if (isPast) classes.push("day-past");
            if (isToday) classes.push("day-today");
            if (isDayActive) classes.push("day-active");
            if (isSelected) classes.push("day-selected");

            html += `
                <td>
                    <div class="${classes.join(" ")}" data-date="${dateStr}" data-active="${isDayActive ? 'true' : 'false'}">
                        ${dayCounter}
                    </div>
                </td>
            `;

            dayCounter++;
            currentDayOfWeek++;
        }

        // Completar última semana
        while (currentDayOfWeek < 7) {
            html += `<td></td>`;
            currentDayOfWeek++;
        }
        html += `</tr>`;

        tbody.innerHTML = html;

        // Asignar clic a los días activos
        tbody.querySelectorAll(".cal-day").forEach(dayEl => {
            dayEl.addEventListener("click", () => {
                if (dayEl.getAttribute("data-active") !== "true") return;
                const chosenDate = dayEl.getAttribute("data-date");
                bookingState.selectedDate = chosenDate;
                bookingState.selectedTime = null; // Reiniciar slot
                bookingState.selectedSlot = null;

                tbody.querySelectorAll(".cal-day").forEach(d => d.classList.remove("day-selected"));
                dayEl.classList.add("day-selected");

                renderTimeSlotsForDate(chosenDate);
                updateFloatingFooter();
            });
        });

        // Si no hay día seleccionado, seleccionar automáticamente el primer día hábil
        if (!bookingState.selectedDate) {
            const firstActive = tbody.querySelector(".cal-day.day-active");
            if (firstActive) {
                firstActive.click();
            } else {
                const slotsContainer = document.getElementById("slots-container");
                if (slotsContainer) slotsContainer.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:15px; color:#888;">No hay turnos disponibles para este mes.</div>`;
            }
        }
    }

    function renderTimeSlotsForDate(dateStr) {
        const container = document.getElementById("slots-container");
        const titleEl = document.getElementById("selected-day-title");
        if (!container) return;

        if (titleEl) {
            titleEl.textContent = `Turnos disponibles para ${formatClientDate(new Date(`${dateStr}T12:00:00`))}`;
        }

        const slots = getAvailableSlotsForClientDate(dateStr);
        if (slots.length === 0) {
            container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:15px; color:#888;">No hay turnos disponibles para esta fecha.</div>`;
            return;
        }

        container.innerHTML = slots.map((slot, index) => {
            const isSelected = bookingState.selectedSlot && bookingState.selectedSlot.startAt === slot.startAt;
            return `
                <button type="button" class="time-slot-btn ${isSelected ? 'active' : ''}"
                        data-slot-index="${index}">
                    ${formatClientTime(slot.start, true)}
                </button>
            `;
        }).join("");

        container.querySelectorAll(".time-slot-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const slot = slots[Number(btn.getAttribute("data-slot-index"))];
                bookingState.selectedSlot = slot;
                bookingState.selectedTime = slot.clientTime;
                container.querySelectorAll(".time-slot-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                updateFloatingFooter();
            });
        });
    }

    function getAvailableSlotsForClientDate(clientDateStr) {
        const spec = bookingState.selectedSpecialist;
        const duration = bookingState.selectedServices.reduce((sum, service) => sum + (service.duration || 60), 0);
        const interval = data.business.bookingIntervalMinutes || 30;
        const availableSlots = [];

        for (let dayOffset = -2; dayOffset <= 2; dayOffset++) {
            const businessDate = addDays(clientDateStr, dayOffset);
            const bookingWindow = data.schedule.bookingWindow || {};
            if ((bookingWindow.startDate && businessDate < bookingWindow.startDate)
                || (bookingWindow.endDate && businessDate > bookingWindow.endDate)) continue;

            const timeOffPeriods = data.schedule.timeOff || [];
            const isTimeOff = timeOffPeriods.some(period =>
                period.startDate <= businessDate && businessDate <= period.endDate
            );
            if (isTimeOff) continue;

            const [year, month, day] = businessDate.split("-").map(Number);
            const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
            const businessSchedule = data.schedule && data.schedule[dayOfWeek];
            if (spec && spec.id !== "any") {
                if (spec.workDays && !spec.workDays.includes(dayOfWeek)) continue;
                if (spec.blockedDates && spec.blockedDates.includes(businessDate)) continue;
            } else {
                const activeSpecs = (data.specialists || []).filter(specialist => specialist.active !== false && specialist.id !== "any");
                const someoneWorks = activeSpecs.some(specialist =>
                    (!specialist.workDays || specialist.workDays.includes(dayOfWeek))
                    && (!specialist.blockedDates || !specialist.blockedDates.includes(businessDate))
                );
                if (!someoneWorks) continue;
            }

            const specialistSchedule = spec && spec.id !== "any" && spec.workHours
                ? spec.workHours[dayOfWeek]
                : null;
            const schedule = specialistSchedule || businessSchedule;
            if (!schedule || !schedule.active) continue;

            const openMinutes = timeToMinutes(schedule.open);
            const closeMinutes = timeToMinutes(schedule.close);
            const lunchStart = businessSchedule && businessSchedule.lunchStart ? timeToMinutes(businessSchedule.lunchStart) : null;
            const lunchEnd = businessSchedule && businessSchedule.lunchEnd ? timeToMinutes(businessSchedule.lunchEnd) : null;

            for (let minutes = openMinutes; minutes < closeMinutes; minutes += interval) {
                if (minutes + duration > closeMinutes) continue;
                const overlapsLunch = lunchStart !== null && lunchEnd !== null
                    && minutes < lunchEnd
                    && minutes + duration > lunchStart;
                if (overlapsLunch) continue;

                const businessTime = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
                const start = zonedDateTimeToDate(businessDate, businessTime, businessTimeZone);
                if (!start || start.getTime() <= Date.now()) continue;

                const clientParts = getZonedDateParts(start, clientTimeZone);
                const slotClientDate = `${clientParts.year}-${String(clientParts.month).padStart(2, "0")}-${String(clientParts.day).padStart(2, "0")}`;
                if (slotClientDate !== clientDateStr) continue;

                const end = new Date(start.getTime() + duration * 60 * 1000);
                const isOccupied = (data.appointments || []).some(appointment => {
                    if (appointment.status === "cancelada") return false;
                    const appointmentStart = getAppointmentStart(appointment);
                    const appointmentEnd = appointment.endAt
                        ? new Date(appointment.endAt)
                        : appointment.endDate && appointment.endTime
                            ? zonedDateTimeToDate(appointment.endDate, appointment.endTime, appointment.timeZone || businessTimeZone)
                            : appointmentStart
                                ? new Date(appointmentStart.getTime() + getAppointmentDuration(appointment) * 60 * 1000)
                                : null;
                    return appointmentStart && appointmentEnd
                        && start.getTime() < appointmentEnd.getTime()
                        && end.getTime() > appointmentStart.getTime();
                });
                if (isOccupied) continue;

                const endParts = getZonedDateParts(end, businessTimeZone);
                const businessEndDate = `${endParts.year}-${String(endParts.month).padStart(2, "0")}-${String(endParts.day).padStart(2, "0")}`;
                const businessEndTime = `${String(endParts.hour).padStart(2, "0")}:${String(endParts.minute).padStart(2, "0")}`;
                availableSlots.push({
                    start,
                    end,
                    startAt: start.toISOString(),
                    endAt: end.toISOString(),
                    businessDate,
                    businessTime,
                    businessEndDate,
                    businessEndTime,
                    clientDate: slotClientDate,
                    clientTime: `${String(clientParts.hour).padStart(2, "0")}:${String(clientParts.minute).padStart(2, "0")}`
                });
            }
        }

        return availableSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
    }

    // --- 5. NAVEGACIÓN ENTRE PASOS ---
    function setupNavigation() {
        const nextBtn = document.getElementById("btn-floating-next");
        const backBtn = document.getElementById("btn-booking-back");

        nextBtn.addEventListener("click", () => {
            if (bookingState.currentStep === 1) {
                if (bookingState.selectedServices.length === 0) {
                    alert("Por favor selecciona al menos un servicio.");
                    return;
                }
                goToStep(2);
            } else if (bookingState.currentStep === 2) {
                goToStep(3);
            } else if (bookingState.currentStep === 3) {
                if (!bookingState.selectedDate || !bookingState.selectedTime) {
                    alert("Por favor selecciona una fecha y horario.");
                    return;
                }
                goToStep(4);
            }
        });

        backBtn.addEventListener("click", () => {
            if (bookingState.currentStep > 1) {
                goToStep(bookingState.currentStep - 1);
            } else {
                window.location.href = "index.html";
            }
        });
    }

    function goToStep(stepNumber) {
        bookingState.currentStep = stepNumber;

        // Ocultar todos los paneles
        document.querySelectorAll(".booking-step-pane").forEach(p => p.classList.remove("active"));

        const titleText = document.getElementById("step-title-text");

        if (stepNumber === 1) {
            document.getElementById("pane-step-services").classList.add("active");
            titleText.textContent = getCopy("bookingStepServices", "Seleccionar servicio");
        } else if (stepNumber === 2) {
            document.getElementById("pane-step-instructions").classList.add("active");
            titleText.textContent = getCopy("bookingStepInstructions", "Pasos para reservar");

            const count = bookingState.selectedServices.length;
            const totalMins = bookingState.selectedServices.reduce((sum, s) => sum + (s.duration || 60), 0);
            document.getElementById("steps-summary-services").textContent = `${count} ${count === 1 ? 'servicio' : 'servicios'}`;
            document.getElementById("steps-summary-duration").textContent = formatDuration(totalMins);

        } else if (stepNumber === 3) {
            document.getElementById("pane-step-datetime").classList.add("active");
            titleText.textContent = getCopy("bookingStepDateTime", "Fecha y hora");

            const names = bookingState.selectedServices.map(s => s.name).join(", ");
            const total = bookingState.selectedServices.reduce((sum, s) => sum + (s.price || 0), 0);
            document.getElementById("date-summary-services").textContent = names;
            document.getElementById("date-summary-price").textContent = `$${total}`;

            renderMonthCalendar();

        } else if (stepNumber === 4) {
            document.getElementById("pane-step-client").classList.add("active");
            titleText.textContent = getCopy("bookingStepClient", "Tus datos");

            const total = bookingState.selectedServices.reduce((sum, s) => sum + (s.price || 0), 0);
            const totalMins = bookingState.selectedServices.reduce((sum, s) => sum + (s.duration || 60), 0);

            document.getElementById("review-services-name").textContent = bookingState.selectedServices.map(s => s.name).join(", ");
            document.getElementById("review-datetime").textContent = `${formatClientDate(bookingState.selectedSlot.start)} a las ${formatClientTime(bookingState.selectedSlot.start, true)}`;
            document.getElementById("review-duration").textContent = formatDuration(totalMins);
            document.getElementById("review-total-price").textContent = `$${total} ${data.business.currencyCode || 'MXN'}`;

        } else if (stepNumber === 5) {
            document.getElementById("pane-step-confirmation").classList.add("active");
            titleText.textContent = "Confirmación";
            document.getElementById("btn-booking-back").style.visibility = "hidden";
        }

        window.scrollTo({ top: 0, behavior: "smooth" });
        updateFloatingFooter();
    }

    // --- 6. PASO 4 Y 5: FORMULARIO Y AGENDAMIENTO AUTOMÁTICO ---
    function setupClientForm() {
        const form = document.getElementById("booking-client-form");
        if (!form) return;

        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const nameInput = document.getElementById("client-name");
            const phoneCodeSelect = document.getElementById("client-phone-code");
            const phoneInput = document.getElementById("client-phone");
            const emailInput = document.getElementById("client-email");
            const notesInput = document.getElementById("client-notes");

            const clientName = nameInput.value.trim();
            const rawPhone = phoneInput.value.trim().replace(/\D/g, "");
            const fullPhone = phoneCodeSelect.value + rawPhone;
            const clientEmail = emailInput.value.trim();
            const clientNotes = notesInput.value.trim();

            if (!clientName || !rawPhone) {
                alert("Por favor completa tu nombre y número de teléfono.");
                return;
            }

            const total = bookingState.selectedServices.reduce((sum, s) => sum + (s.price || 0), 0);
            const totalMins = bookingState.selectedServices.reduce((sum, s) => sum + (s.duration || 60), 0);

            const selectedSlot = bookingState.selectedSlot;
            if (!selectedSlot) {
                alert("Por favor selecciona nuevamente un horario disponible.");
                return;
            }

            // Mantener la reserva pendiente hasta que el administrador confirme el pago.
            const newAppointment = {
                clientName: clientName,
                clientPhone: fullPhone,
                clientEmail: clientEmail,
                specialistId: bookingState.selectedSpecialist.id,
                specialistName: bookingState.selectedSpecialist.name,
                specialistPhone: bookingState.selectedSpecialist.phone || data.business.whatsapp,
                date: selectedSlot.businessDate,
                time: selectedSlot.businessTime,
                endDate: selectedSlot.businessEndDate,
                endTime: selectedSlot.businessEndTime,
                timeZone: businessTimeZone,
                clientTimeZone,
                startAt: selectedSlot.startAt,
                endAt: selectedSlot.endAt,
                durationMins: totalMins,
                services: bookingState.selectedServices.map(s => ({ id: s.id, name: s.name, price: s.price })),
                totalPrice: total,
                status: "pendiente",
                notes: clientNotes,
                createdAt: new Date().toISOString()
            };

            // Guardar cita y emitir señal de notificación en vivo
            try {
                await window.appStore.saveAppointment(newAppointment);
            } catch (error) {
                console.error("No se pudo completar la reserva.", error);
                if (error.code === "APPOINTMENT_UNAVAILABLE") {
                    bookingState.selectedSlot = null;
                    bookingState.selectedTime = null;
                    let refreshMessage = "";
                    try {
                        data = await window.appStore.getData();
                    } catch (refreshError) {
                        console.error("No se pudo actualizar la disponibilidad.", refreshError);
                        refreshMessage = " No se pudo actualizar la lista de horarios; recarga la página e inténtalo nuevamente.";
                    }
                    renderTimeSlotsForDate(bookingState.selectedDate);
                    updateFloatingFooter();
                    alert(`Ese horario dejó de estar disponible o ya se empalma con otra cita. Selecciona otro horario.${refreshMessage}`);
                    return;
                }
                alert(`No se pudo guardar la cita: ${error.message}`);
                return;
            }

            // Preparar y mostrar pantalla de confirmación
            populateConfirmationScreen(newAppointment);
            goToStep(5);
        });
    }

    function populateConfirmationScreen(appt) {
        document.getElementById("conf-client-name").textContent = appt.clientName;
        document.getElementById("conf-services-list").textContent = appt.services.map(s => s.name).join(", ");
        const appointmentStart = getAppointmentStart(appt);
        const appointmentEnd = appt.endAt
            ? new Date(appt.endAt)
            : zonedDateTimeToDate(appt.endDate || appt.date, appt.endTime, appt.timeZone || businessTimeZone);
        document.getElementById("conf-date").textContent = formatClientDate(appointmentStart);
        document.getElementById("conf-time").textContent = `${formatClientTime(appointmentStart, true)} - ${formatClientTime(appointmentEnd, true)}`;
        document.getElementById("conf-total-price").textContent = `$${appt.totalPrice} MXN`;

        // =====================================================================
        // MENSAJE 1 — NOTIFICACIÓN AUTOMÁTICA AL NEGOCIO / DUEÑA
        // Se abre automáticamente desde el dispositivo de la clienta hacia el
        // número de contacto del negocio.
        // =====================================================================
        const ownerNumber = (data.business.whatsapp || "").replace(/\D/g, "");
        const ownerMessage =
            `Nueva solicitud de cita\n\n` +
            `Cliente: ${appt.clientName}\n` +
            `Teléfono: ${appt.clientPhone}\n` +
            `Servicio(s): ${appt.services.map(s => `${s.name} ($${s.price})`).join(", ")}\n` +
            `Fecha: ${formatDateFull(appt.date)}\n` +
            `Hora (${appt.timeZone || businessTimeZone}): ${formatTime12h(appt.time)} a ${formatTime12h(appt.endTime)}\n` +
            `Total: $${appt.totalPrice} MXN\n` +
            (appt.notes ? `Notas / Modalidad: ${appt.notes}\n` : ``) +
            `\nCita registrada automáticamente desde el sitio web.`;

        // Solo se abrirá WhatsApp si el usuario hace clic voluntariamente en el botón "Enviar mensaje por WhatsApp"

        // =====================================================================
        // MENSAJE 2 — CONFIRMACIÓN OPCIONAL DEL CONSULTANTE (botón en pantalla)
        // El texto es en primera persona: el consultante elige enviarlo o no.
        // =====================================================================
        const clientMessage =
            `Hola ${data.business.name}.\n\n` +
            `Acabo de solicitar una cita y quiero confirmar mi horario:\n\n` +
            `Servicio(s): ${appt.services.map(s => s.name).join(", ")}\n` +
            `Fecha: ${formatClientDate(appointmentStart)}\n` +
            `Hora: ${formatClientTime(appointmentStart, true)}\n\n` +
            `Muchas gracias. Quedo al pendiente.`;

        const waBtn = document.getElementById("btn-conf-whatsapp");
        waBtn.href = `https://wa.me/${ownerNumber}?text=${encodeURIComponent(clientMessage)}`;

    }

    // --- UTILIDADES ---
    function formatTime12h(timeStr) {
        if (!timeStr) return "";
        const [hours, minutes] = timeStr.split(":").map(Number);
        const period = hours >= 12 ? "p. m." : "a. m.";
        const h12 = hours % 12 === 0 ? 12 : hours % 12;
        return `${h12}:${minutes.toString().padStart(2, '0')} ${period}`;
    }

    function formatDateShort(dateStr) {
        if (!dateStr) return "";
        const parts = dateStr.split("-");
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    function formatDateFull(dateStr) {
        if (!dateStr) return "";
        const dateObj = new Date(dateStr + "T00:00:00");
        const days = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
        const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
        return `${days[dateObj.getDay()]}, ${dateObj.getDate()} de ${months[dateObj.getMonth()]} de ${dateObj.getFullYear()}`;
    }

    function formatDuration(mins) {
        if (mins < 60) return `${mins} min`;
        const hours = Math.floor(mins / 60);
        const remMins = mins % 60;
        if (remMins === 0) return `${hours} h`;
        return `${hours} h ${remMins} min`;
    }

    function escapeHtml(text) {
        if (!text) return "";
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
});

/**
 * Datos iniciales y gestor de almacenamiento local/API para la plantilla configurable.
 */

const DEFAULT_DATA = {
    business: {
        name: "Nombre de tu negocio",
        tagline: "Servicios y reservas en línea",
        about: "",
        specialty: "Agrega una descripción de tu negocio",
        address: "",
        phone: "",
        whatsapp: "",
        instagram: "",
        instagramHandle: "",
        mapCoordinates: { lat: 0, lng: 0 },
        timeZone: "America/Mexico_City",
        coverUrl: "",
        avatarUrl: "",
        cabinNotes: "",
        currencySymbol: "$",
        currencyCode: "MXN",
        bookingIntervalMinutes: 30,
        primaryColor: "#2563eb",
        secondaryColor: "#0f172a",
        backgroundColor: "#f5f5f8",
        fontFamily: "system",
        showVerifiedBadge: false,
        pageCopy: {
            homeWelcome: "Agenda tu cita en línea",
            reserveButton: "Reservar ahora",
            featuredServices: "Servicios destacados",
            catalogLink: "Ver catálogo completo",
            tabServices: "Servicios",
            tabGallery: "Galería",
            tabReviews: "Reseñas",
            tabSchedule: "Horarios",
            scheduleTitle: "Horario de atención",
            bookingTitle: "Reservar una cita",
            bookingStepServices: "Seleccionar servicio",
            bookingStepInstructions: "Pasos para reservar",
            bookingStepDateTime: "Fecha y hora",
            bookingStepClient: "Tus datos",
            bookingConfirmationTitle: "¡Solicitud de reserva recibida!"
        },
        bannerPromo: {
            active: false,
            title: "",
            desc: ""
        }
    },
    specialists: [{
        id: "profesional-principal",
        name: "Profesional",
        title: "Atención",
        bio: "",
        avatarUrl: "",
        phone: "",
        workDays: [1, 2, 3, 4, 5, 6],
        workHours: {
            "1": { open: "10:00", close: "20:00", active: true },
            "2": { open: "10:00", close: "20:00", active: true },
            "3": { open: "10:00", close: "20:00", active: true },
            "4": { open: "10:00", close: "20:00", active: true },
            "5": { open: "10:00", close: "20:00", active: true },
            "6": { open: "10:00", close: "19:00", active: true }
        },
        blockedDates: [],
        active: true
    }],
    bookingSteps: [
        { title: "Elige un servicio", description: "Selecciona uno o varios servicios para comenzar." },
        { title: "Selecciona fecha y hora", description: "Elige un día disponible y el horario que mejor te convenga." },
        { title: "Completa tus datos y confirma", description: "Déjanos tus datos de contacto para solicitar la cita." }
    ],
    schedule: {
        "0": { dayName: "Domingo", open: "11:00", close: "16:00", active: false },
        "1": { dayName: "Lunes", open: "10:00", close: "20:00", active: true },
        "2": { dayName: "Martes", open: "10:00", close: "20:00", active: true },
        "3": { dayName: "Miércoles", open: "10:00", close: "20:00", active: true },
        "4": { dayName: "Jueves", open: "10:00", close: "20:00", active: true },
        "5": { dayName: "Viernes", open: "10:00", close: "20:00", active: true },
        "6": { dayName: "Sábado", open: "10:00", close: "19:00", active: true }
    },
    categories: [{ id: "cat-general", name: "Servicios" }],
    services: [],
    gallery: [],
    reviews: [],
    appointments: []
};

function getBrandColor(value, fallback) {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function adjustBrandColor(color, amount) {
    const channels = color.slice(1).match(/.{2}/g).map(channel => parseInt(channel, 16));
    return `#${channels.map(channel => Math.round(amount >= 0
        ? channel + (255 - channel) * amount
        : channel * (1 + amount))
        .toString(16).padStart(2, "0")).join("")}`;
}

function applyBusinessAppearance(business) {
    const root = document.documentElement;
    const primary = getBrandColor(business.primaryColor, "#7c3aed");
    const secondary = getBrandColor(business.secondaryColor, "#d97706");
    const dark = getBrandColor(business.secondaryColor, "#222225");
    const background = getBrandColor(business.backgroundColor, "#f5f5f8");
    root.style.setProperty("--brand-primary", primary);
    root.style.setProperty("--brand-primary-hover", adjustBrandColor(primary, -0.12));
    root.style.setProperty("--brand-primary-light", adjustBrandColor(primary, 0.92));
    root.style.setProperty("--brand-secondary", secondary);
    root.style.setProperty("--brand-secondary-hover", adjustBrandColor(secondary, -0.12));
    root.style.setProperty("--brand-dark", dark);
    root.style.setProperty("--brand-bg", background);
    const fonts = {
        system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
        serif: 'Georgia, "Times New Roman", serif',
        rounded: '"Trebuchet MS", Arial, sans-serif'
    };
    const fontFamily = Object.prototype.hasOwnProperty.call(fonts, business.fontFamily)
        ? fonts[business.fontFamily]
        : fonts.system;
    root.style.setProperty("--font-stack", fontFamily);
}

function getBusinessImageUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    const trimmed = value.trim();
    if (/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/]+=*$/i.test(trimmed)) return trimmed;
    try {
        const url = new URL(trimmed, window.location.href);
        return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (error) {
        return "";
    }
}

function applyBusinessFavicon(business) {
    const favicon = document.querySelector('link[rel="icon"]');
    const avatarUrl = getBusinessImageUrl(business.avatarUrl);
    if (favicon && avatarUrl) favicon.href = avatarUrl;
}

/**
 * Gestor de persistencia híbrido y emisor de notificaciones en tiempo real
 */
class DataStore {
    constructor() {
        this.STORAGE_KEY = "tarot_agenda_data_v1";
        this.ADMIN_PIN_KEY = "tarot_admin_pin_v1";
        this.useApi = false;
        this.hasApi = null;
        this.broadcastChannel = null;
        if (typeof window !== "undefined") {
            window.addEventListener("unhandledrejection", event => {
                const message = event.reason instanceof Error
                    ? event.reason.message
                    : "La operación no pudo completarse.";
                this.showStorageError(`No se completó la operación: ${message}`);
            });
        }

        try {
            if (typeof window !== "undefined" && window.BroadcastChannel) {
                this.broadcastChannel = new BroadcastChannel("tarot_agenda_events");
            }
        } catch (e) {
            console.log("BroadcastChannel no soportado", e);
        }

        this.init();
    }

    init() {
        // Limpieza de claves previas de versiones anteriores para actualizar automáticamente
        try {
            const oldKeys = [
                "cleanface_app_data_v2",
                "cleanface_latest_appointment",
                "larav_studio_data_v1",
                "larav_studio_data_v2",
                "larav_latest_appointment"
            ];
            oldKeys.forEach(k => {
                if (localStorage.getItem(k)) localStorage.removeItem(k);
            });
        } catch (e) {}

        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (!stored) {
            this.saveLocal(DEFAULT_DATA);
        } else {
            try {
                const parsed = JSON.parse(stored);
                // Si la versión guardada no tiene la categoría o especialista de tarot
                if (!parsed.categories || !parsed.categories.some(c => c.id.startsWith("cat-"))) {
                    this.saveLocal(DEFAULT_DATA);
                    return;
                }

                let contactUpdated = false;
                if (parsed.business && parsed.business.name === "Tarot & Oráculos Místicos") {
                    parsed.business.name = DEFAULT_DATA.business.name;
                    contactUpdated = true;
                }
                if (parsed.business) {
                    if (parsed.business.avatarUrl === "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80") {
                        parsed.business.avatarUrl = DEFAULT_DATA.business.avatarUrl;
                        contactUpdated = true;
                    }
                    if (parsed.business.phone === "+526624511670") {
                        parsed.business.phone = DEFAULT_DATA.business.phone;
                        contactUpdated = true;
                    }
                    if (parsed.business.whatsapp === "526624511670") {
                        parsed.business.whatsapp = DEFAULT_DATA.business.whatsapp;
                        contactUpdated = true;
                    }
                }
                (parsed.specialists || []).forEach(specialist => {
                    if (specialist.phone === "526624511670") {
                        specialist.phone = DEFAULT_DATA.specialists[0].phone;
                        contactUpdated = true;
                    }
                });
                if (parsed.business) {
                    if (parsed.business.phone === "+526621819929") {
                        parsed.business.phone = DEFAULT_DATA.business.phone;
                        contactUpdated = true;
                    }
                    if (parsed.business.whatsapp === "526621819929") {
                        parsed.business.whatsapp = DEFAULT_DATA.business.whatsapp;
                        contactUpdated = true;
                    }
                }
                (parsed.specialists || []).forEach(specialist => {
                    if (specialist.phone === "526621819929") {
                        specialist.phone = DEFAULT_DATA.specialists[0].phone;
                        contactUpdated = true;
                    }
                });
                if (contactUpdated) this.saveLocal(parsed);
            } catch (e) {
                this.saveLocal(DEFAULT_DATA);
            }
        }
    }

    saveLocal(data) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    }

    showStorageError(message) {
        if (typeof document === "undefined" || !document.body) return;
        let notice = document.getElementById("storage-connection-error");
        if (!notice) {
            notice = document.createElement("div");
            notice.id = "storage-connection-error";
            notice.setAttribute("role", "alert");
            notice.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:20000;padding:12px 18px;background:#842029;color:#fff;text-align:center;font:600 14px/1.4 sans-serif;box-shadow:0 2px 8px #0003";
            document.body.appendChild(notice);
        }
        notice.textContent = message;
    }

    getLocal() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : DEFAULT_DATA;
        } catch (e) {
            console.error("Error al leer localStorage", e);
            return DEFAULT_DATA;
        }
    }

    async checkApi() {
        let res;
        try {
            res = await fetch("api.php?action=ping", { method: "GET" });
        } catch (error) {
            this.hasApi = false;
            const message = "No hay conexión con la API. Inicia Apache y MySQL y vuelve a intentarlo.";
            this.showStorageError(message);
            throw new Error(message);
        }

        if (res.url.startsWith("file:")) {
            this.hasApi = false;
            const message = "Abre el sitio desde http://localhost/TarodCheck para guardar en MySQL.";
            this.showStorageError(message);
            throw new Error(message);
        }
        this.hasApi = true;
        if (!res.ok) {
            const message = `La API respondió con HTTP ${res.status}; revisa la conexión con MySQL.`;
            this.showStorageError(message);
            throw new Error(message);
        }
        const json = await res.json();
        if (json.status !== "ok") {
            const message = "La API está disponible, pero la base de datos no respondió correctamente.";
            this.showStorageError(message);
            throw new Error(message);
        }
        const notice = document.getElementById("storage-connection-error");
        if (notice) notice.remove();
        return true;
    }

    async requestApi(action, body) {
        let res;
        try {
            res = await fetch(`api.php?action=${encodeURIComponent(action)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
        } catch (error) {
            const message = "No se pudo conectar con el servidor. No se confirmó el guardado; vuelve a intentarlo.";
            this.showStorageError(message);
            throw new Error(message);
        }
        const json = await res.json();
        if (!res.ok || json.status !== "ok") {
            if (res.status >= 500) {
                this.showStorageError("La base de datos no confirmó el guardado. Revisa Apache/MySQL y vuelve a intentarlo.");
            }
            if (res.status === 401 && ["save_admin_appointment", "update_appointment_status", "delete_appointment", "delete_review", "save_specialist", "delete_specialist", "save_specialists", "save_services", "save_categories", "save_schedule", "save_booking_steps", "update_business", "change_admin_pin", "save_all", "migrate_appointment_ids"].includes(action)) {
                window.dispatchEvent(new Event("admin-session-expired"));
            }
            const error = new Error(json.message || `Falló la acción ${action} (HTTP ${res.status}).`);
            error.code = json.code;
            throw error;
        }
        return json;
    }

    async adminSession() {
        if (!this.useApi) return sessionStorage.getItem("admin_authenticated") === "true";
        const res = await fetch("api.php?action=admin_session");
        const json = await res.json();
        if (!res.ok || json.status !== "ok") {
            throw new Error(json.message || `No se pudo comprobar la sesión (HTTP ${res.status}).`);
        }
        return json.authenticated === true;
    }

    async adminLogin(pin) {
        if (!this.useApi) {
            const savedPin = localStorage.getItem(this.ADMIN_PIN_KEY);
            if (!savedPin) {
                const error = new Error("Crea un PIN de seis dígitos para configurar el acceso al panel.");
                error.code = "PIN_SETUP_REQUIRED";
                throw error;
            }
            if (pin !== savedPin) throw new Error("El PIN no es correcto.");
            return { status: "ok" };
        }
        return this.requestApi("admin_login", { pin });
    }

    async setupAdminPin(newPin) {
        if (!this.useApi) {
            if (!/^\d{6}$/.test(newPin)) throw new Error("El PIN debe tener seis dígitos.");
            if (localStorage.getItem(this.ADMIN_PIN_KEY)) throw new Error("Ya existe un PIN. Inicia sesión para cambiarlo desde Datos del Negocio.");
            localStorage.setItem(this.ADMIN_PIN_KEY, newPin);
            return { status: "ok" };
        }
        return this.requestApi("setup_admin_pin", { newPin });
    }

    async adminLogout() {
        if (!this.useApi) return { status: "ok" };
        try {
            return await this.requestApi("admin_logout", {});
        } finally {
            localStorage.removeItem(this.STORAGE_KEY);
            localStorage.removeItem("tarot_latest_appointment");
        }
    }

    async requestAdminRecovery() {
        if (!this.useApi) throw new Error("La recuperación por correo estará disponible cuando se conecte el servidor. Usa el PIN configurado en este navegador.");
        return this.requestApi("request_admin_recovery", {});
    }

    async completeAdminRecovery(code, newPin) {
        if (!this.useApi) throw new Error("La recuperación por correo no está disponible en el modo navegador.");
        return this.requestApi("complete_admin_recovery", { code, newPin });
    }

    async changeAdminPin(newPin) {
        if (!this.useApi) {
            if (!/^\d{6}$/.test(newPin)) throw new Error("El PIN debe tener seis dígitos.");
            if (!(await this.adminSession())) throw new Error("Inicia sesión para cambiar el PIN.");
            localStorage.setItem(this.ADMIN_PIN_KEY, newPin);
            return { status: "ok" };
        }
        return this.requestApi("change_admin_pin", { newPin });
    }

    async getData() {
        if (!this.useApi) return this.getLocal();
        await this.checkApi();
        const res = await fetch("api.php?action=get_all");
        const json = await res.json();
        if (!res.ok || json.status !== "ok" || !json.data) {
            if (res.status >= 500) {
                this.showStorageError("No se pudieron cargar los datos desde MySQL. Intenta de nuevo cuando la base esté disponible.");
            }
            throw new Error(json.message || `No se pudieron cargar los datos (HTTP ${res.status}).`);
        }
        let data = json.data;
        const isAdmin = await this.adminSession();
        if (isAdmin && (data.appointments || []).some(appointment => /^TR-/i.test(appointment.id || ""))) {
            const migration = await this.requestApi("migrate_appointment_ids", {});
            if (!migration.data) {
                throw new Error("La API no devolvió las citas después de actualizar sus identificadores.");
            }
            data = migration.data;
        }
        this.saveLocal(data);
        return data;
    }

    async saveAppointment(appointment) {
        const data = await this.getData();
        if (!data.appointments) data.appointments = [];

        if (!appointment.id || /^TR-/i.test(appointment.id)) {
            appointment.id = this.createId();
        }
        appointment.status = appointment.status || "pendiente";
        this.assertAppointmentAvailable(data.appointments, appointment);
        let savedAppointment = appointment;
        if (this.useApi) {
            const response = await this.requestApi("save_appointment", appointment);
            savedAppointment = response.appointment || appointment;
        }
        data.appointments.unshift(savedAppointment);
        this.saveLocal(data);
        this.notifyNewAppointment(savedAppointment);

        return savedAppointment;
    }

    async saveAdminAppointment(appointment) {
        const data = await this.getData();
        if (!data.appointments) data.appointments = [];

        this.assertAppointmentAvailable(data.appointments, appointment);
        let savedAppointment = { ...appointment, id: appointment.id || this.createId() };
        if (this.useApi) {
            const response = await this.requestApi("save_admin_appointment", appointment);
            savedAppointment = response.appointment;
        }
        data.appointments.unshift(savedAppointment);
        this.saveLocal(data);
        this.notifyNewAppointment(savedAppointment);
        return savedAppointment;
    }

    notifyNewAppointment(appointment) {
        // 1. Emitir señal a través de localStorage (funciona entre pestañas y ventanas)
        try {
            localStorage.setItem("tarot_latest_appointment", JSON.stringify({
                timestamp: Date.now(),
                appointment: appointment
            }));
        } catch (e) {}

        // 2. Emitir a través de BroadcastChannel
        try {
            if (this.broadcastChannel) {
                this.broadcastChannel.postMessage({
                    type: "NEW_APPOINTMENT",
                    appointment: appointment
                });
            }
        } catch (e) {}
    }

    async updateAppointmentStatus(appointmentId, newStatus) {
        const data = await this.getData();
        const appt = data.appointments.find(a => a.id === appointmentId);
        if (appt) {
            if (this.useApi) await this.requestApi("update_appointment_status", { id: appointmentId, status: newStatus });
            appt.status = newStatus;
            this.saveLocal(data);
            return true;
        }
        return false;
    }

    async deleteAppointment(appointmentId) {
        const data = await this.getData();
        const exists = (data.appointments || []).some(appointment => appointment.id === appointmentId);
        if (!exists) return false;

        if (this.useApi) await this.requestApi("delete_appointment", { id: appointmentId });
        data.appointments = data.appointments.filter(appointment => appointment.id !== appointmentId);
        this.saveLocal(data);
        return true;
    }

    async deleteReview(reviewId) {
        const data = await this.getData();
        const exists = (data.reviews || []).some(review => review.id === reviewId);
        if (!exists) return false;

        if (this.useApi) await this.requestApi("delete_review", { id: reviewId });
        data.reviews = data.reviews.filter(review => review.id !== reviewId);
        this.saveLocal(data);
        return true;
    }

    // --- GESTIÓN DE ESPECIALISTAS / TAROTISTAS ---
    async saveSpecialist(specialist) {
        const data = await this.getData();
        if (!data.specialists) data.specialists = [];

        if (this.useApi) await this.requestApi("save_specialist", specialist);
        const idx = data.specialists.findIndex(s => s.id === specialist.id);
        if (idx >= 0) {
            data.specialists[idx] = { ...data.specialists[idx], ...specialist };
        } else {
            data.specialists.push(specialist);
        }

        this.saveLocal(data);
        return specialist;
    }

    async deleteSpecialist(specialistId) {
        if (specialistId === "any") return false;
        const data = await this.getData();
        if (this.useApi) await this.requestApi("delete_specialist", { id: specialistId });
        data.specialists = (data.specialists || []).filter(s => s.id !== specialistId);
        this.saveLocal(data);

        return true;
    }

    async saveSpecialists(specialistsList) {
        const data = await this.getData();
        if (this.useApi) await this.requestApi("save_specialists", specialistsList);
        data.specialists = specialistsList;
        this.saveLocal(data);
        return specialistsList;
    }

    async addReview(review) {
        const data = await this.getData();
        if (!data.reviews) data.reviews = [];
        if (this.useApi) await this.requestApi("add_review", review);
        data.reviews.unshift(review);
        this.saveLocal(data);
        return review;
    }

    async updateBusinessInfo(business) {
        const data = await this.getData();
        if (this.useApi) await this.requestApi("update_business", business);
        data.business = { ...data.business, ...business };
        this.saveLocal(data);
        return data.business;
    }

    async saveServices(services) {
        const data = await this.getData();
        if (this.useApi) await this.requestApi("save_services", services);
        data.services = services;
        this.saveLocal(data);
        return services;
    }

    async saveGallery(gallery) {
        const data = await this.getData();
        data.gallery = gallery;
        this.saveLocal(data);
        return gallery;
    }

    async saveSchedule(schedule) {
        const data = await this.getData();
        if (this.useApi) await this.requestApi("save_schedule", schedule);
        data.schedule = schedule;
        this.saveLocal(data);
        return schedule;
    }

    async saveBookingSteps(steps) {
        const data = await this.getData();
        if (this.useApi) await this.requestApi("save_booking_steps", steps);
        data.bookingSteps = steps;
        this.saveLocal(data);
        return steps;
    }

    createId() {
        return typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `appt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    assertAppointmentAvailable(appointments, candidate) {
        if (["cancelada", "completada"].includes(candidate.status)) return;
        const getRange = appointment => {
            const start = appointment.startAt
                ? new Date(appointment.startAt).getTime()
                : new Date(`${appointment.date}T${appointment.time}`).getTime();
            const end = appointment.endAt
                ? new Date(appointment.endAt).getTime()
                : start + (Number(appointment.durationMins) || 60) * 60000;
            return { start, end };
        };
        const candidateRange = getRange(candidate);
        const conflicts = appointments.some(appointment => {
            if (appointment.id === candidate.id || ["cancelada", "completada"].includes(appointment.status)) return false;
            if (candidate.specialistId && appointment.specialistId && candidate.specialistId !== appointment.specialistId) return false;
            const existingRange = getRange(appointment);
            return Number.isFinite(candidateRange.start) && Number.isFinite(candidateRange.end)
                && Number.isFinite(existingRange.start) && Number.isFinite(existingRange.end)
                && candidateRange.start < existingRange.end && candidateRange.end > existingRange.start;
        });
        if (conflicts) {
            const error = new Error("Ese horario ya no está disponible. Selecciona otro horario.");
            error.code = "APPOINTMENT_UNAVAILABLE";
            throw error;
        }
    }

    resetDefaults() {
        throw new Error("No se pueden restablecer los valores predeterminados desde el navegador.");
    }
}

window.appStore = new DataStore();

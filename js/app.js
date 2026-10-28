/**
 * Lógica principal de la página de inicio (index.html)
 * Manejo de pestañas, galería con visor lightbox, reseñas y horarios
 */

document.addEventListener("DOMContentLoaded", async () => {
    const data = await window.appStore.getData();
    let currentGalleryPhotos = [];
    let currentGalleryIndex = 0;
    let selectedRating = 5;
    const pageCopy = data.business.pageCopy || {};

    // 1. Cargar información del negocio en la cabecera
    renderBusinessHeader(data.business);
    applyBusinessAppearance(data.business);
    renderBusinessCopy(pageCopy);

    // 2. Renderizar banner promocional
    renderPromoBanner(data.business.bannerPromo);

    // 3. Renderizar vista previa de tratamientos populares
    renderPopularServices(data.services);

    // 4. Renderizar galería de fotos por álbumes
    renderGallery(data.gallery);

    // 5. Renderizar lista de reseñas
    renderReviews(data.reviews);

    // 6. Renderizar información, horarios de atención y contacto
    renderInfoTab(data.schedule);

    // 7. Configurar interactividad de pestañas (Tabs)
    setupTabs();

    // 8. Configurar visor Lightbox para galería
    setupLightbox();

    // 9. Configurar formulario modal de nueva reseña
    setupReviewModal();

    // --- FUNCIONES DE RENDERIZADO ---

    function renderBusinessHeader(biz) {
        document.title = `${biz.name} - ${biz.tagline}`;
        applyBusinessFavicon(biz);
        const avatarEl = document.getElementById("header-avatar");
        const coverEl = document.getElementById("header-cover");
        const nameEl = document.getElementById("header-name");
        const specEl = document.getElementById("header-specialty");
        const avatarUrl = getBusinessImageUrl(biz.avatarUrl)
            || getBusinessImageUrl("images/default-business-logo.svg");

        if (avatarEl) {
            avatarEl.src = avatarUrl;
            avatarEl.alt = `Logo de ${biz.name}`;
        }
        if (coverEl) {
            const coverUrl = getBusinessImageUrl(biz.coverUrl);
            coverEl.style.backgroundImage = coverUrl ? `url("${coverUrl}")` : "";
        }
        if (nameEl) nameEl.textContent = biz.name;
        if (specEl) specEl.textContent = biz.specialty || biz.tagline;
        const verifiedBadge = document.querySelector(".verified-icon");
        if (verifiedBadge) verifiedBadge.style.display = biz.showVerifiedBadge !== false ? "" : "none";
        const footerName = document.getElementById("footer-business-name");
        if (footerName) footerName.textContent = biz.name;
    }

    function renderBusinessCopy(copy) {
        const defaults = DEFAULT_DATA.business.pageCopy;
        const text = (key) => copy[key] || defaults[key];
        const values = {
            "home-welcome-title": text("homeWelcome"),
            "home-reserve-button": text("reserveButton"),
            "featured-services-title": text("featuredServices"),
            "catalog-link": `${text("catalogLink")} →`,
            "tab-label-services": text("tabServices"),
            "tab-label-gallery": text("tabGallery"),
            "tab-label-reviews": text("tabReviews"),
            "tab-label-schedule": text("tabSchedule"),
            "schedule-title": text("scheduleTitle")
        };
        Object.entries(values).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
    }

    function renderPromoBanner(promo) {
        const banner = document.getElementById("promo-banner-box");
        if (banner) banner.style.display = promo && promo.active === false ? "none" : "";
        if (!promo) return;
        const titleEl = document.getElementById("banner-promo-title");
        const descEl = document.getElementById("banner-promo-desc");
        if (titleEl) titleEl.textContent = promo.title;
        if (descEl) descEl.textContent = promo.desc;
    }

    function renderPopularServices(services) {
        const container = document.getElementById("popular-services-preview");
        if (!container) return;

        // Tomar primeros 5 servicios activos
        const popular = (services || []).filter(s => s.active !== false).slice(0, 5);
        if (popular.length === 0) {
            container.innerHTML = `<div class="empty-content-message">Aún no hay servicios publicados.</div>`;
            return;
        }
        container.innerHTML = popular.map(srv => `
            <div class="preview-service-card" onclick="location.href='booking.html?service=${srv.id}'">
                <div>
                    <div class="srv-name">${escapeHtml(srv.name)}</div>
                    <div class="srv-meta">⏱ ${srv.durationText || srv.duration + ' min'} · ${escapeHtml(srv.description ? srv.description.substring(0, 55) + '...' : '')}</div>
                </div>
                <div class="srv-price">
                    <span style="font-size: 11px; font-weight: normal; color: #888;">desde</span>
                    $${srv.price}
                </div>
            </div>
        `).join("");
    }

    function renderGallery(galleryItems) {
        const container = document.getElementById("gallery-container");
        const countBadge = document.getElementById("gallery-count-badge");
        if (!container) return;

        currentGalleryPhotos = galleryItems || [];
        if (countBadge) countBadge.textContent = currentGalleryPhotos.length;
        if (currentGalleryPhotos.length === 0) {
            container.innerHTML = `<div class="empty-content-message">Aún no hay imágenes en la galería.</div>`;
            return;
        }

        // Agrupar por álbumes
        const albums = {};
        currentGalleryPhotos.forEach((item, index) => {
            const albumName = (item.album || "Galería").toUpperCase();
            if (!albums[albumName]) albums[albumName] = [];
            albums[albumName].push({ ...item, globalIndex: index });
        });

        let html = "";
        for (const [albumName, items] of Object.entries(albums)) {
            html += `
                <div class="gallery-album-wrap">
                    <div class="gallery-album-title">${albumName}:</div>
                    <div class="gallery-grid">
                        ${items.map(item => `
                            <div class="gallery-item" data-index="${item.globalIndex}">
                                <img src="${item.thumb || item.src}" alt="${escapeHtml(item.title || '')}" loading="lazy">
                                <div class="gallery-item-caption">${escapeHtml(item.title || '')}</div>
                            </div>
                        `).join("")}
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;

        // Asignar eventos de clic a las fotos
        container.querySelectorAll(".gallery-item").forEach(item => {
            item.addEventListener("click", () => {
                const idx = parseInt(item.getAttribute("data-index"), 10);
                openLightbox(idx);
            });
        });
    }

    function renderReviews(reviews) {
        const listContainer = document.getElementById("reviews-list-container");
        const countText = document.getElementById("reviews-count-text");
        if (!listContainer) return;

        const revs = reviews || [];
        const starsElement = document.getElementById("reviews-stars");
        if (starsElement) starsElement.style.display = revs.length ? "" : "none";
        const averageElement = document.getElementById("reviews-average");
        if (averageElement) {
            const average = revs.length
                ? revs.reduce((sum, review) => sum + (Number(review.rating) || 0), 0) / revs.length
                : 0;
            averageElement.textContent = average ? average.toFixed(1) : "—";
        }
        if (countText) {
            countText.textContent = revs.length
                ? `Basado en ${revs.length} ${revs.length === 1 ? 'reseña' : 'reseñas'}`
                : "Aún no hay reseñas";
        }

        if (revs.length === 0) {
            listContainer.innerHTML = `<div class="empty-content-message">Aún no hay reseñas. ¡Sé la primera persona en compartir tu experiencia!</div>`;
            return;
        }

        listContainer.innerHTML = revs.map(rev => {
            const stars = "★".repeat(rev.rating || 5) + "☆".repeat(Math.max(0, 5 - (rev.rating || 5)));
            const initial = rev.author ? rev.author.charAt(0).toUpperCase() : "C";
            return `
                <div class="review-item-card">
                    <div class="review-author-header">
                        <div class="review-author-info">
                            <div class="review-avatar">${initial}</div>
                            <div>
                                <div class="review-author-name">${escapeHtml(rev.author)}</div>
                                <div class="stars-row" style="margin:0; font-size: 13px;">${stars}</div>
                            </div>
                        </div>
                        <div class="review-date">${escapeHtml(rev.date || 'Reciente')}</div>
                    </div>
                    <div class="review-body">${escapeHtml(rev.comment)}</div>
                </div>
            `;
        }).join("");
    }

    function renderInfoTab(schedule) {
        // Tabla de horarios
        const schedTable = document.getElementById("info-schedule-table");
        if (!schedTable || !schedule) return;

        const todayDayOfWeek = new Date().getDay(); // 0 = Domingo, 1 = Lunes...
        const daysOrder = [0, 1, 2, 3, 4, 5, 6];

        schedTable.innerHTML = daysOrder.map(dayNum => {
            const s = schedule[dayNum];
            if (!s) return "";
            const isToday = (dayNum === todayDayOfWeek);
            const hoursFormatted = s.active 
                ? `${formatTime12h(s.open)} - ${formatTime12h(s.close)}`
                : "Cerrado";

            return `
                <tr class="${isToday ? 'today-highlight' : ''}">
                    <td>${s.dayName} ${isToday ? '<span style="font-size:11px; background:var(--brand-primary); color:#fff; padding:1px 5px; border-radius:4px; margin-left:4px;">Hoy</span>' : ''}</td>
                    <td>${hoursFormatted}</td>
                </tr>
            `;
        }).join("");
    }

    // --- MANEJO DE PESTAÑAS (TABS) ---
    function setupTabs() {
        const tabButtons = document.querySelectorAll(".tab-btn");
        const tabPanes = document.querySelectorAll(".tab-pane");

        tabButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                const targetTab = btn.getAttribute("data-tab");
                tabButtons.forEach(b => b.classList.remove("active"));
                tabPanes.forEach(p => p.classList.remove("active"));

                btn.classList.add("active");
                const activePane = document.getElementById(`pane-${targetTab}`);
                if (activePane) activePane.classList.add("active");
                window.scrollTo({ top: 0, behavior: "smooth" });
            });
        });
    }

    // --- VISOR LIGHTBOX PARA GALERÍA ---
    function setupLightbox() {
        const lightbox = document.getElementById("gallery-lightbox");
        const closeBtn = document.getElementById("lightbox-close-btn");
        const prevBtn = document.getElementById("lightbox-prev-btn");
        const nextBtn = document.getElementById("lightbox-next-btn");

        if (!lightbox) return;

        closeBtn.addEventListener("click", closeLightbox);
        prevBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            navigateLightbox(-1);
        });
        nextBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            navigateLightbox(1);
        });

        lightbox.addEventListener("click", (e) => {
            if (e.target === lightbox) closeLightbox();
        });

        document.addEventListener("keydown", (e) => {
            if (!lightbox.classList.contains("active")) return;
            if (e.key === "Escape") closeLightbox();
            if (e.key === "ArrowLeft") navigateLightbox(-1);
            if (e.key === "ArrowRight") navigateLightbox(1);
        });
    }

    function openLightbox(index) {
        if (!currentGalleryPhotos || currentGalleryPhotos.length === 0) return;
        currentGalleryIndex = (index + currentGalleryPhotos.length) % currentGalleryPhotos.length;
        const photo = currentGalleryPhotos[currentGalleryIndex];

        const imgEl = document.getElementById("lightbox-img");
        const capEl = document.getElementById("lightbox-caption");
        const modal = document.getElementById("gallery-lightbox");

        imgEl.src = photo.src;
        capEl.textContent = photo.comment || photo.title || "";
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
    }

    function navigateLightbox(direction) {
        openLightbox(currentGalleryIndex + direction);
    }

    function closeLightbox() {
        const modal = document.getElementById("gallery-lightbox");
        if (modal) modal.classList.remove("active");
        document.body.style.overflow = "";
    }

    // --- FORMULARIO MODAL DE RESEÑAS ---
    function setupReviewModal() {
        const modal = document.getElementById("review-modal");
        const openBtn = document.getElementById("btn-open-review-modal");
        const closeBtn = document.getElementById("review-modal-close");
        const cancelBtn = document.getElementById("review-modal-cancel");
        const form = document.getElementById("new-review-form");
        const starPicker = document.getElementById("star-picker");

        if (!modal) return;

        openBtn.addEventListener("click", () => {
            modal.classList.add("active");
            document.body.style.overflow = "hidden";
        });

        const closeModal = () => {
            modal.classList.remove("active");
            document.body.style.overflow = "";
        };

        closeBtn.addEventListener("click", closeModal);
        cancelBtn.addEventListener("click", closeModal);
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });

        // Selector de estrellas
        if (starPicker) {
            const stars = starPicker.querySelectorAll(".star");
            stars.forEach(star => {
                star.addEventListener("click", () => {
                    selectedRating = parseInt(star.getAttribute("data-rating"), 10);
                    stars.forEach(s => {
                        const r = parseInt(s.getAttribute("data-rating"), 10);
                        if (r <= selectedRating) {
                            s.classList.add("active");
                        } else {
                            s.classList.remove("active");
                        }
                    });
                });
            });
        }

        // Envío de la reseña
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const authorInput = document.getElementById("review-author");
            const commentInput = document.getElementById("review-comment");

            const author = authorInput.value.trim();
            const comment = commentInput.value.trim();

            if (!author || !comment) return;

            const newReview = {
                id: "rev-" + Date.now(),
                author: author,
                rating: selectedRating,
                date: "Hoy",
                comment: comment
            };

            await window.appStore.addReview(newReview);
            const freshData = await window.appStore.getData();
            renderReviews(freshData.reviews);

            form.reset();
            selectedRating = 5;
            if (starPicker) {
                starPicker.querySelectorAll(".star").forEach(s => s.classList.add("active"));
            }

            closeModal();
            alert("¡Muchas gracias por tu reseña! Ha sido publicada.");
        });
    }

    // --- UTILIDADES ---
    function formatTime12h(timeStr) {
        if (!timeStr) return "";
        const [hours, minutes] = timeStr.split(":").map(Number);
        const period = hours >= 12 ? "p. m." : "a. m.";
        const h12 = hours % 12 === 0 ? 12 : hours % 12;
        return `${h12}:${minutes.toString().padStart(2, '0')} ${period}`;
    }

    function escapeHtml(text) {
        if (!text) return "";
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
});

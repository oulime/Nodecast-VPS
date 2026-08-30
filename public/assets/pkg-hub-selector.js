/**
 * Sleek 3D Perspective Roller Package Selector (Films & Séries)
 * High-End Dark Mode UI/UX Matching Reference Screen Design
 * Ultra-Fluid 120 FPS Physics Engine with Momentum Inertia & Spring Snapping
 */
(() => {
  "use strict";

  const COLOR_PALETTE = ["bg-blue", "bg-orange", "bg-yellow", "bg-pink", "bg-purple"];

  const DEFAULT_FALLBACK_PACKAGES = [
    { id: "", name: "TOUS LES GENRES", color: "bg-blue" },
    { id: "action", name: "ACTION", color: "bg-orange" },
    { id: "netflix", name: "NETFLIX", color: "bg-pink" },
    { id: "prime", name: "PRIME+", color: "bg-blue" },
    { id: "hbo", name: "HBO MAX", color: "bg-purple" },
    { id: "comedy", name: "COMÉDIE", color: "bg-yellow" },
    { id: "drama", name: "DRAME", color: "bg-pink" },
    { id: "thriller", name: "THRILLER", color: "bg-purple" },
    { id: "family", name: "FAMILLE", color: "bg-blue" },
    { id: "sci-fi", name: "SCIENCE-FICTION", color: "bg-orange" },
    { id: "doc", name: "DOCUMENTAIRES", color: "bg-purple" }
  ];

  function getPackageMetadata(name) {
    const clean = String(name || "").trim().toUpperCase();
    
    if (clean.includes("NETFLIX")) {
      return { 
        sub: "Plus de 500 films & séries originaux",
        badge: "PACK ACTIF" 
      };
    }
    if (clean.includes("PRIME")) {
      return { 
        sub: "Plus de 450 exclusivités & films",
        badge: "PACK ACTIF" 
      };
    }
    if (clean.includes("HBO") || clean.includes("MAX")) {
      return { 
        sub: "Plus de 380 séries cultes & films",
        badge: "PACK ACTIF" 
      };
    }
    if (clean.includes("DISNEY")) {
      return { 
        sub: "Marvel, Star Wars, Pixar & classiques",
        badge: "PACK ACTIF" 
      };
    }
    if (clean.includes("CANAL")) {
      return { 
        sub: "Cinéma récent & créations originales",
        badge: "PACK ACTIF" 
      };
    }
    if (clean.includes("ACTION") || clean.includes("AVENTURE")) {
      return { 
        sub: "Plus de 450 films & séries d'action",
        badge: "PACK ACTIF" 
      };
    }
    if (clean.includes("COMÉDIE") || clean.includes("COMEDY")) {
      return { 
        sub: "Plus de 320 comédies & spectacles",
        badge: "PACK ACTIF" 
      };
    }
    if (clean.includes("DRAME") || clean.includes("DRAMA")) {
      return { 
        sub: "Plus de 400 drames & histoires intenses",
        badge: "PACK ACTIF" 
      };
    }
    if (clean.includes("HORREUR") || clean.includes("THRILLER") || clean.includes("HORROR")) {
      return { 
        sub: "Plus de 280 thrillers & frissons",
        badge: "PACK ACTIF" 
      };
    }
    if (clean.includes("SCI-FI") || clean.includes("SCIENCE") || clean.includes("SCIFI")) {
      return { 
        sub: "Plus de 350 films de science-fiction",
        badge: "PACK ACTIF" 
      };
    }
    if (clean.includes("FAMILLE") || clean.includes("FAMILY") || clean.includes("ENFANT")) {
      return { 
        sub: "Plus de 500 films & animés familiaux",
        badge: "PACK ACTIF" 
      };
    }
    if (clean.includes("DOC") || clean.includes("DOCUMENTAIRE")) {
      return { 
        sub: "Plus de 250 documentaires & découvertes",
        badge: "PACK ACTIF" 
      };
    }
    if (clean.includes("ANIMATION") || clean.includes("MANGA") || clean.includes("ANIME")) {
      return { 
        sub: "Plus de 420 animés & séries d'animation",
        badge: "PACK ACTIF" 
      };
    }
    if (clean.includes("SPORT")) {
      return { 
        sub: "Replays & grands événements sportifs",
        badge: "PACK ACTIF" 
      };
    }
    return { 
      sub: "Plus de 600 films & séries en HD/4K",
      badge: "PACK ACTIF" 
    };
  }

  class PkgHubBridge {
    constructor() {
      this.hubWrapper = null;
      this.hubBtn = null;
      this.hubTitle = null;
      this.hintHand = null;
      this.dropdown = null;
      this.viewport = null;
      this.track = null;
      this.centerPill = null;
      this.reviewBtn = null;
      this.closeBtn = null;

      this.packages = [];
      this.items = [];
      this.currentIndex = 0;
      this.targetIndex = 0;
      this.selectedPackage = null;
      this.isOpen = false;

      this.animFrame = null;
      this.isDragging = false;
      this.activePointerId = null;
      this.dragStartY = 0;
      this.dragStartIndex = 0;
      this.pointerHistory = [];
      this.velocity = 0;
      this.lastFrameTime = 0;

      this.itemHeight = 56;
      this.viewportHeight = 360;
      this.centerY = 152;

      this.init();
    }

    init() {
      const observer = new MutationObserver((mutations) => {
        for (const mut of mutations) {
          if (mut.type === "attributes" && mut.attributeName === "data-vel-active-tab") {
            this.handleTabChange();
            break;
          }
        }
      });

      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["data-vel-active-tab"]
      });

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => this.handleTabChange());
      } else {
        this.handleTabChange();
      }

      document.addEventListener("pkg-hub-selected", (e) => {
        if (e.detail?.package?.name) {
          this.updateTitleText(e.detail.package.name);
        }
      });
      document.addEventListener("vel-media-package-selected", (e) => {
        if (e.detail?.name) {
          this.updateTitleText(e.detail.name);
        }
      });
    }

    isMediaTab() {
      const tab = document.body.dataset.velActiveTab || "";
      return tab === "movies" || tab === "series";
    }

    handleTabChange() {
      if (!this.isMediaTab()) {
        const nativePicker = document.getElementById("vel-media-package-picker");
        if (nativePicker) {
          nativePicker.style.removeProperty("display");
        }
        return;
      }
      this.syncAndMount();
    }

    extractPackagesFromDOM() {
      const list = [];
      const seenNames = new Set();
      const menuOptions = document.querySelectorAll("#vel-media-package-menu .vel-media-package-picker__option[data-package-id]");
      if (menuOptions.length > 0) {
        menuOptions.forEach((opt, idx) => {
          const rawText = opt.querySelector("span:first-child")?.textContent || opt.textContent || "";
          const cleaned = rawText.replace(/^GENRE\s*:\s*/i, "").trim().toUpperCase() || "CATÉGORIE";
          const id = opt.dataset.packageId || String(idx);
          if (!seenNames.has(cleaned)) {
            seenNames.add(cleaned);
            list.push({
              id: id,
              name: cleaned,
              color: COLOR_PALETTE[list.length % COLOR_PALETTE.length],
              nativeOption: opt,
              isSelected: opt.classList.contains("is-selected") || opt.getAttribute("aria-selected") === "true"
            });
          }
        });
        return list;
      }
      const packageCards = document.querySelectorAll("#packages-view .vel-package-card[data-package-id]");
      if (packageCards.length > 0) {
        packageCards.forEach((card, idx) => {
          const rawText = card.querySelector(".vel-package-card__title")?.textContent || 
                          card.getAttribute("aria-label") || 
                          "";
          const cleaned = rawText.replace(/^GENRE\s*:\s*/i, "").trim().toUpperCase() || "CATÉGORIE";
          const id = card.dataset.packageId || String(idx);
          if (!seenNames.has(cleaned)) {
            seenNames.add(cleaned);
            list.push({
              id: id,
              name: cleaned,
              color: COLOR_PALETTE[list.length % COLOR_PALETTE.length],
              nativeCard: card,
              isSelected: false
            });
          }
        });
        return list;
      }
      const select = document.querySelector(".vel-header select, #movies-category-select, #series-category-select");
      if (select && select.options && select.options.length > 0) {
        [...select.options].forEach((opt, idx) => {
          const rawText = opt.textContent || opt.value || "";
          const cleaned = rawText.replace(/^GENRE\s*:\s*/i, "").trim().toUpperCase() || "CATÉGORIE";
          const id = opt.value;
          if (!seenNames.has(cleaned)) {
            seenNames.add(cleaned);
            list.push({
              id: id,
              name: cleaned,
              color: COLOR_PALETTE[list.length % COLOR_PALETTE.length],
              selectOption: opt,
              isSelected: opt.selected || opt.value === select.value
            });
          }
        });
        return list;
      }
      return null;
    }

    getCurrentActiveName() {
      const nameEl = document.querySelector(".vel-media-package-picker__name");
      if (nameEl && nameEl.textContent && nameEl.textContent.trim() !== "Choisir") {
        return nameEl.textContent.replace(/^GENRE\s*:\s*/i, "").trim().toUpperCase();
      }
      const activeOption = document.querySelector("#vel-media-package-menu .is-selected span:first-child");
      if (activeOption && activeOption.textContent) {
        return activeOption.textContent.replace(/^GENRE\s*:\s*/i, "").trim().toUpperCase();
      }
      return null;
    }

    updateTitleText(name) {
      if (!name) return;
      const clean = String(name).replace(/^GENRE\s*:\s*/i, "").trim().toUpperCase();
      if (!this.selectedPackage) this.selectedPackage = {};
      this.selectedPackage.name = clean;
      if (this.hubTitle) {
        this.hubTitle.textContent = clean;
      }
      const allTitles = document.querySelectorAll("#pkgHubTitle, .pkg-hub-title");
      allTitles.forEach(el => { el.textContent = clean; });
    }

    syncAndMount() {
      const extracted = this.extractPackagesFromDOM();
      if (extracted && extracted.length > 0) {
        this.packages = extracted;
      } else if (this.packages.length === 0) {
        this.packages = DEFAULT_FALLBACK_PACKAGES.slice();
      }
      const activeName = this.getCurrentActiveName();
      let matched = null;
      if (activeName) matched = this.packages.find(p => p.name === activeName);
      if (!matched) matched = this.packages.find(p => p.isSelected) || this.packages[0];
      this.selectedPackage = matched;
      const idx = this.packages.indexOf(matched);
      this.currentIndex = idx >= 0 ? idx : 0;
      this.targetIndex = this.currentIndex;
      this.mountHub();
    }

    syncCurrentState() {
      const activeName = this.getCurrentActiveName();
      if (activeName && (!this.selectedPackage || this.selectedPackage.name !== activeName)) {
        const found = this.packages.find(p => p.name === activeName);
        if (found) {
          this.selectedPackage = found;
          this.updateTitleText(found.name);
          const idx = this.packages.indexOf(found);
          if (!this.isOpen && idx >= 0) {
            this.currentIndex = idx;
            this.targetIndex = idx;
            this.update3D();
          }
        }
      }
      const nativePicker = document.getElementById("vel-media-package-picker");
      if (nativePicker && nativePicker.style.display !== "none") {
        nativePicker.style.setProperty("display", "none", "important");
      }
      const extracted = this.extractPackagesFromDOM();
      if (extracted && extracted.length > 0 && extracted.length !== this.packages.length) {
        this.packages = extracted;
        this.renderItems();
      }
    }

    markUserInteracted() {
      window._pkgHubUserInteracted = true;
      if (this.hubWrapper) this.hubWrapper.classList.add("user-interacted");
    }

    updateMetrics() {
      const isSmallMobile = window.innerWidth <= 380;
      const isMobile = window.innerWidth <= 640;
      this.itemHeight = isSmallMobile ? 42 : (isMobile ? 44 : 46);
      this.viewportHeight = this.viewport ? (this.viewport.offsetHeight || 360) : 360;
      this.centerY = (this.viewportHeight - this.itemHeight) / 2;
    }

    mountHub() {
      if (!this.hubWrapper) {
        const wrapper = document.createElement("div");
        wrapper.className = "pkg-hub-wrapper";
        if (window._pkgHubUserInteracted) wrapper.classList.add("user-interacted");
        wrapper.id = "pkgHubWrapper";
        wrapper.innerHTML = `
          <div class="pkg-hub-trigger" id="pkgHubBtn" role="button" aria-expanded="false" aria-haspopup="listbox" tabindex="0">
            <div class="pkg-hub-title" id="pkgHubTitle">${this.selectedPackage.name}</div>
            <div class="pkg-hub-dots" aria-hidden="true">
              <span class="pkg-dot pkg-dot-blue"></span>
              <span class="pkg-dot pkg-dot-orange"></span>
              <span class="pkg-dot pkg-dot-yellow"></span>
              <span class="pkg-dot pkg-dot-pink"></span>
            </div>
            <div class="pkg-hub-hint-hand" id="pkgHubHintHand" aria-hidden="true">👆</div>
          </div>

          <div class="pkg-hub-dropdown" id="pkgHubDropdown" role="listbox" aria-label="Sélecteur de packs">
            <div class="pkg-wheel-header">
              <div class="pkg-wheel-header-title">
                SÉLECTION DES PACKS
              </div>
              <div class="pkg-wheel-header-actions">
                <button type="button" class="pkg-wheel-close-btn" id="pkgWheelCloseBtn" aria-label="Fermer">✕</button>
              </div>
            </div>

            <div class="pkg-wheel-viewport" id="pkgWheelViewport">
              <div class="pkg-barrel-rails">
                <div class="pkg-barrel-rail-left"></div>
                <div class="pkg-barrel-rail-right"></div>
              </div>

              <div class="pkg-wheel-center-pill" id="pkgWheelCenterPill"></div>
              <div class="pkg-wheel-track" id="pkgWheelTrack"></div>
            </div>

            <div class="pkg-wheel-bottom">
              <div class="pkg-wheel-swipe-hint">
                Glissez vers le haut ou le bas pour explorer les packs.
              </div>
              <button type="button" class="pkg-wheel-action-btn" id="pkgWheelReviewBtn">
                SÉLECTIONNER CE PACK
              </button>
            </div>
          </div>
        `;

        this.hubWrapper = wrapper;
        this.hubBtn = wrapper.querySelector("#pkgHubBtn");
        this.hubTitle = wrapper.querySelector("#pkgHubTitle");
        this.hintHand = wrapper.querySelector("#pkgHubHintHand");
        this.dropdown = wrapper.querySelector("#pkgHubDropdown");
        this.viewport = wrapper.querySelector("#pkgWheelViewport");
        this.track = wrapper.querySelector("#pkgWheelTrack");
        this.centerPill = wrapper.querySelector("#pkgWheelCenterPill");
        this.reviewBtn = wrapper.querySelector("#pkgWheelReviewBtn");
        this.closeBtn = wrapper.querySelector("#pkgWheelCloseBtn");

        if (this.dropdown) {
          this.dropdown.hidden = true;
        }

        this.bindEvents();
      }

      if (this.hubWrapper.parentElement !== document.body) {
        document.body.appendChild(this.hubWrapper);
      }
      this.updateMetrics();
      this.updateTitleText(this.selectedPackage.name);
      this.renderItems();
    }

    renderItems() {
      if (!this.track) return;
      this.track.innerHTML = "";
      const selectedId = String(this.selectedPackage?.id || "");
      const selectedName = String(this.selectedPackage?.name || "").trim().toUpperCase();

      this.items = this.packages.map((pkg, index) => {
        const meta = getPackageMetadata(pkg.name);
        const isCurrentActive = Boolean(
          (selectedId && pkg.id && String(pkg.id) === selectedId) ||
          (!selectedId && selectedName && pkg.name && String(pkg.name).trim().toUpperCase() === selectedName)
        );
        const item = document.createElement("div");
        item.className = "pkg-wheel-item" + (isCurrentActive ? " is-active-pkg" : "");
        item.dataset.pkgIndex = String(index);
        item.dataset.pkgId = String(pkg.id || "");
        item.setAttribute("role", "option");
        item.setAttribute("tabindex", "0");
        item.innerHTML = `
          <div class="pkg-item-label">
            ${isCurrentActive ? `<span class="pkg-active-pip">✓</span>` : ""}
            <span class="pkg-name-text">${pkg.name}</span>
          </div>
          <div class="pkg-center-sub">${meta.sub}</div>
          ${isCurrentActive ? `<div class="pkg-center-badge">✓ PACK ACTIF</div>` : ""}
        `;
        this.track.appendChild(item);
        return item;
      });
      this.update3D();
    }

    /**
     * Ultra-fast transform update without synchronous layout reflows
     * Uses clear non-overlapping vertical separation
     */
    update3D() {
      const total = this.packages.length;
      if (total === 0 || !this.items || this.items.length === 0) return;
      const centerY = this.centerY;
      const cur = this.currentIndex;

      for (let i = 0; i < total; i++) {
        const item = this.items[i];
        if (!item) continue;
        let delta = i - cur;
        if (total > 4) {
          if (delta > total / 2) delta -= total;
          if (delta < -total / 2) delta += total;
        }
        const absDelta = Math.abs(delta);
        if (absDelta > 3.6) {
          item.style.opacity = "0";
          item.style.pointerEvents = "none";
          item.setAttribute("aria-hidden", "true");
          continue;
        }
        item.style.pointerEvents = "auto";
        item.removeAttribute("aria-hidden");

        // Non-overlapping vertical spacing:
        // Center card is 114px high (half = 57px)
        // Pills are 44px high (half = 22px)
        // Clearance distance at delta=1 is 93px (57 + 14 + 22) -> zero overlap
        let y;
        if (absDelta <= 1) {
          y = delta * 93;
        } else {
          y = Math.sign(delta) * (93 + (absDelta - 1) * 48);
        }

        const angle = Math.max(-60, Math.min(60, delta * 15));
        const scale = Math.max(0.72, 1 - absDelta * 0.08);
        const opacity = Math.max(0.18, Math.pow(Math.max(0, 1 - absDelta * 0.23), 1.2));
        const z = -absDelta * 20;

        item.style.transform = `translate3d(-50%, calc(-50% + ${y}px), ${z}px) rotateX(${-angle}deg) scale(${scale})`;
        item.style.opacity = String(opacity);

        const isCenter = absDelta < 0.45;
        if (isCenter && !item._isCenterState) {
          item._isCenterState = true;
          item.classList.add("is-center");
        } else if (!isCenter && item._isCenterState) {
          item._isCenterState = false;
          item.classList.remove("is-center");
        }
      }
    }

    startPhysics(initialVelocity = 0, snapTarget = null) {
      if (this.animFrame) cancelAnimationFrame(this.animFrame);
      this.velocity = initialVelocity;
      this.lastFrameTime = performance.now();
      const total = this.packages.length;
      if (total === 0) return;
      const friction = 0.92, springK = 0.12, damping = 0.38;
      const loop = (now) => {
        const dt = Math.min(32, Math.max(1, now - this.lastFrameTime));
        this.lastFrameTime = now;
        const dtRatio = dt / 16.67;
        if (snapTarget === null) {
          this.currentIndex += this.velocity * dtRatio;
          this.velocity *= Math.pow(friction, dtRatio);
          this.currentIndex = ((this.currentIndex % total) + total) % total;
          this.update3D();
          if (Math.abs(this.velocity) < 0.003) {
            this.startPhysics(0, (Math.round(this.currentIndex) + total) % total);
            return;
          }
        } else {
          let diff = snapTarget - this.currentIndex;
          if (total > 4) {
            if (diff > total / 2) diff -= total;
            if (diff < -total / 2) diff += total;
          }
          const springAcc = diff * springK;
          this.velocity = (this.velocity + springAcc * dtRatio) * Math.pow(1 - damping, dtRatio);
          this.currentIndex += this.velocity * dtRatio;
          this.currentIndex = ((this.currentIndex % total) + total) % total;
          this.update3D();
          if (Math.abs(diff) < 0.005 && Math.abs(this.velocity) < 0.003) {
            this.currentIndex = snapTarget;
            this.update3D();
            this.animFrame = null;
            return;
          }
        }
        this.animFrame = requestAnimationFrame(loop);
      };
      this.animFrame = requestAnimationFrame(loop);
    }

    scrollToIndex(idx, smooth = true) {
      const total = this.packages.length;
      if (total === 0) return;
      const normalized = (idx % total + total) % total;
      this.targetIndex = normalized;
      if (!smooth) {
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        this.currentIndex = normalized;
        this.update3D();
      } else {
        this.startPhysics(0, normalized);
      }
    }

    step(delta) {
      const total = this.packages.length;
      if (total === 0) return;
      this.scrollToIndex(Math.round(this.currentIndex + delta), true);
    }

    toggle() {
      this.markUserInteracted();
      this.isOpen ? this.close() : this.open();
    }

    open() {
      this.isOpen = true;
      this.syncCurrentState();
      if (this.dropdown) {
        this.dropdown.hidden = false;
        this.dropdown.classList.add("active");
      }
      this.hubBtn?.setAttribute("aria-expanded", "true");
      if (this.selectedPackage) {
        const idx = this.packages.findIndex(p => p.id === this.selectedPackage.id || p.name === this.selectedPackage.name);
        if (idx >= 0) { this.currentIndex = idx; this.targetIndex = idx; }
      }
      this.renderItems();
      this.updateMetrics();
      this.update3D();
      requestAnimationFrame(() => {
        this.updateMetrics();
        this.update3D();
      });
    }

    close() {
      this.isOpen = false;
      if (this.dropdown) {
        this.dropdown.classList.remove("active");
        this.dropdown.hidden = true;
      }
      this.hubBtn?.setAttribute("aria-expanded", "false");
      if (this.animFrame) {
        cancelAnimationFrame(this.animFrame);
        this.animFrame = null;
      }
    }

    confirmCurrentPackage() {
      const total = this.packages.length;
      if (total === 0) return;
      const centerIdx = ((Math.round(this.currentIndex) % total) + total) % total;
      const pkg = this.packages[centerIdx];
      if (pkg) this.selectPackage(pkg);
    }

    selectPackage(pkg) {
      if (!pkg) return;
      this.markUserInteracted();
      this.selectedPackage = pkg;
      this.updateTitleText(pkg.name);
      this.renderItems();
      this.close();
      const idx = this.packages.indexOf(pkg);
      if (idx >= 0) { this.currentIndex = idx; this.targetIndex = idx; }
      if (typeof window.veloraActivateMediaPackage === "function" && pkg.id) window.veloraActivateMediaPackage(String(pkg.id));
      const nativeOpt = pkg.nativeOption || document.querySelector(`#vel-media-package-menu [data-package-id="${pkg.id}"]`);
      if (nativeOpt && typeof nativeOpt.click === "function") nativeOpt.click();
      const nativeCard = pkg.nativeCard || document.querySelector(`#packages-view [data-package-id="${pkg.id}"]`);
      if (nativeCard && typeof nativeCard.click === "function") nativeCard.click();
      const select = document.querySelector(".vel-header select, #movies-category-select, #series-category-select");
      if (select) { select.value = pkg.id; select.dispatchEvent(new Event("change", { bubbles: true })); }
      if (pkg.id) document.body.dataset.veloraActivePackageId = String(pkg.id);
      document.dispatchEvent(new CustomEvent("pkg-hub-selected", { bubbles: true, detail: { package: pkg } }));
    }

    bindEvents() {
      this.hubBtn.addEventListener("click", (e) => { e.stopPropagation(); this.toggle(); });
      this.hubBtn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.toggle(); } });
      this.closeBtn?.addEventListener("click", (e) => { e.stopPropagation(); this.close(); });
      this.reviewBtn?.addEventListener("click", (e) => { e.stopPropagation(); this.confirmCurrentPackage(); });
      this.track.addEventListener("click", (e) => {
        const item = e.target.closest(".pkg-wheel-item");
        if (!item) return;
        const index = Number(item.dataset.pkgIndex);
        if (Number.isFinite(index) && this.packages[index]) {
          this.markUserInteracted();
          const selected = this.packages[index];
          this.scrollToIndex(index, true);
          setTimeout(() => this.selectPackage(selected), 180);
        }
      });
      const onPointerDown = (e) => {
        this.isDragging = true;
        this.activePointerId = e.pointerId;
        this.viewport.setPointerCapture?.(e.pointerId);
        if (this.animFrame) { cancelAnimationFrame(this.animFrame); this.animFrame = null; }
        this.dragStartY = e.clientY;
        this.dragStartIndex = this.currentIndex;
        this.pointerHistory = [{ y: e.clientY, time: performance.now() }];
      };
      const onPointerMove = (e) => {
        if (!this.isDragging || (this.activePointerId !== null && e.pointerId !== this.activePointerId)) return;
        const deltaY = e.clientY - this.dragStartY;
        const total = this.packages.length;
        let nextIndex = this.dragStartIndex - deltaY / 82;
        this.currentIndex = ((nextIndex % total) + total) % total;
        this.update3D();
        this.pointerHistory.push({ y: e.clientY, time: performance.now() });
        if (this.pointerHistory.length > 5) this.pointerHistory.shift();
      };
      const onPointerUp = (e) => {
        if (!this.isDragging || (this.activePointerId !== null && e.pointerId !== this.activePointerId)) return;
        this.isDragging = false;
        this.activePointerId = null;
        try { this.viewport.releasePointerCapture?.(e.pointerId); } catch (_) {}
        const oldest = this.pointerHistory[0];
        const newest = this.pointerHistory[this.pointerHistory.length - 1];
        const dt = Math.max(1, newest.time - oldest.time);
        let velocity = -((newest.y - oldest.y) / dt) / 82;
        velocity = Math.max(-0.06, Math.min(0.06, velocity));
        if (Math.abs(velocity) > 0.003) this.startPhysics(velocity, null);
        else this.startPhysics(0, (Math.round(this.currentIndex) + this.packages.length) % this.packages.length);
      };
      this.viewport.addEventListener("pointerdown", onPointerDown);
      this.viewport.addEventListener("pointermove", onPointerMove);
      this.viewport.addEventListener("pointerup", onPointerUp);
      this.viewport.addEventListener("pointercancel", onPointerUp);
      this.viewport.addEventListener("wheel", (e) => { e.preventDefault(); this.markUserInteracted(); this.step(Math.sign(e.deltaY)); }, { passive: false });
      document.addEventListener("keydown", (e) => {
        if (!this.isOpen) return;
        if (e.key === "Escape") { this.close(); this.hubBtn?.focus(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); this.step(-1); }
        else if (e.key === "ArrowDown") { e.preventDefault(); this.step(1); }
        else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.confirmCurrentPackage(); }
      });
      document.addEventListener("click", (e) => { if (this.isOpen && this.hubWrapper && !this.hubWrapper.contains(e.target)) this.close(); });
      let resizeTimer = null;
      window.addEventListener("resize", () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { this.updateMetrics(); if (this.isOpen || this.isMediaTab()) this.update3D(); }, 100);
      });
    }
  }

  if (typeof window !== "undefined") {
    window._pkgHubBridge = new PkgHubBridge();
  }
})();

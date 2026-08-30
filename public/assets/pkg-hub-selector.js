/**
 * Scoped Package Hub Selector - Pure CSS Visibility, Cold Neon 3D Text & SVG Navigation
 */
(() => {
  "use strict";

  const COLOR_PALETTE = ["bg-blue", "bg-orange", "bg-yellow", "bg-pink", "bg-purple"];

  const DEFAULT_FALLBACK_PACKAGES = [
    { id: "", name: "TOUS LES GENRES", color: "bg-blue" },
    { id: "action", name: "ACTION & AVENTURE", color: "bg-orange" },
    { id: "comedy", name: "COMÉDIE", color: "bg-yellow" },
    { id: "drama", name: "DRAME", color: "bg-pink" },
    { id: "horror", name: "HORREUR", color: "bg-purple" },
    { id: "sci-fi", name: "SCIENCE-FICTION", color: "bg-blue" },
    { id: "doc", name: "DOCUMENTAIRES", color: "bg-purple" }
  ];

  function formatCardTextHtml(rawText) {
    const clean = String(rawText || "").trim().toUpperCase();
    if (!clean) return "";
    const words = clean.split(/\s+/).filter(Boolean);
    return words.map(w => `<span class="pkg-card-word">${w}</span>`).join(" ");
  }

  let _sharedMeasurer = null;
  function getSharedMeasurer() {
    if (!_sharedMeasurer && typeof document !== "undefined") {
      _sharedMeasurer = document.createElement("div");
      _sharedMeasurer.style.cssText =
        "position:fixed!important;visibility:hidden!important;left:-9999px!important;top:-9999px!important;" +
        "padding:0!important;margin:0!important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif!important;" +
        "font-weight:900!important;line-height:1.1!important;letter-spacing:0.01em!important;" +
        "text-transform:uppercase!important;box-sizing:border-box!important;text-align:center!important;pointer-events:none!important;";
      document.body.appendChild(_sharedMeasurer);
    }
    return _sharedMeasurer;
  }

  function fitCardText(card) {
    if (!card) return;
    const textEl = card.querySelector(".pkg-card-text") || card;
    const rawText = textEl.textContent ? textEl.textContent.trim() : "";
    if (!rawText) return;

    if (!textEl.querySelector(".pkg-card-word")) {
      textEl.innerHTML = formatCardTextHtml(rawText);
    }

    const isSmallMobile = window.innerWidth <= 380;
    const isMobile = window.innerWidth <= 640;
    const maxFont = isSmallMobile ? 22 : (isMobile ? 24 : 28);
    const minFont = 8.5;

    const padH = isSmallMobile ? 8 : (isMobile ? 10 : 16);
    const padV = isSmallMobile ? 8 : (isMobile ? 10 : 12);
    const targetW = Math.max(50, (card.offsetWidth || (isSmallMobile ? 86 : (isMobile ? 98 : 116))) - padH);
    const targetH = Math.max(50, (card.offsetHeight || (isSmallMobile ? 115 : (isMobile ? 125 : 142))) - padV);

    const measurer = getSharedMeasurer();
    if (!measurer) return;
    measurer.style.width = targetW + "px";
    measurer.style.maxWidth = targetW + "px";
    measurer.innerHTML = textEl.innerHTML;

    // Fast binary search (only 4 checks max per card, computed once)
    let low = minFont;
    let high = maxFont;
    let optimal = minFont;

    while (low <= high) {
      const mid = Math.round(((low + high) / 2) * 2) / 2;
      measurer.style.fontSize = mid + "px";

      const fitsBox = measurer.scrollHeight <= targetH && measurer.scrollWidth <= targetW + 0.5;
      let allWordsFit = fitsBox;
      if (fitsBox) {
        const wordSpans = measurer.querySelectorAll(".pkg-card-word");
        for (let i = 0; i < wordSpans.length; i++) {
          if (wordSpans[i].offsetWidth > targetW + 0.5) {
            allWordsFit = false;
            break;
          }
        }
      }

      if (allWordsFit) {
        optimal = mid;
        low = mid + 0.5;
      } else {
        high = mid - 0.5;
      }
    }

    textEl.style.fontSize = optimal + "px";
  }

  class PkgHubBridge {
    constructor() {
      this.hubWrapper = null;
      this.hubBtn = null;
      this.hubTitle = null;
      this.hintHand = null;
      this.dropdown = null;
      this.fanContainer = null;
      this.arrowLeft = null;
      this.arrowRight = null;

      this.packages = [];
      this.startIndex = 0;
      this.selectedPackage = null;
      this.isOpen = false;
      this.retryTimer = null;
      this.syncInterval = null;

      this.init();
    }

    init() {
      // Fail-proof observer: watch data-vel-active-tab ONLY on document.body
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

      // Initial check
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => this.handleTabChange());
      } else {
        this.handleTabChange();
      }
    }

    isMediaTab() {
      const tab = document.body.dataset.velActiveTab || "";
      return tab === "movies" || tab === "series";
    }

    handleTabChange() {
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.syncInterval = null;
      }

      if (!this.isMediaTab()) {
        // Restore native picker when leaving media tabs
        const nativePicker = document.getElementById("vel-media-package-picker");
        if (nativePicker) {
          nativePicker.style.removeProperty("display");
        }
        return;
      }

      // We are on Movies or Series: mount and synchronize
      this.syncAndMount();

      // Poll periodically while on media tab to synchronize dynamic package updates
      this.syncInterval = setInterval(() => {
        if (this.isMediaTab()) {
          this.syncCurrentState();
        }
      }, 400);
    }

    extractPackagesFromDOM() {
      const list = [];

      // 1. From #vel-media-package-menu options
      const menuOptions = document.querySelectorAll("#vel-media-package-menu .vel-media-package-picker__option[data-package-id]");
      if (menuOptions.length > 0) {
        menuOptions.forEach((opt, idx) => {
          const rawText = opt.querySelector("span:first-child")?.textContent || opt.textContent || "";
          const cleaned = rawText.replace(/^GENRE\s*:\s*/i, "").trim().toUpperCase() || "CATÉGORIE";
          list.push({
            id: opt.dataset.packageId || String(idx),
            name: cleaned,
            color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
            nativeOption: opt,
            isSelected: opt.classList.contains("is-selected") || opt.getAttribute("aria-selected") === "true"
          });
        });
        return list;
      }

      // 2. From #packages-view .vel-package-card
      const packageCards = document.querySelectorAll("#packages-view .vel-package-card[data-package-id]");
      if (packageCards.length > 0) {
        packageCards.forEach((card, idx) => {
          const rawText = card.querySelector(".vel-package-card__title")?.textContent || 
                          card.getAttribute("aria-label") || 
                          "";
          const cleaned = rawText.replace(/^GENRE\s*:\s*/i, "").trim().toUpperCase() || "CATÉGORIE";
          list.push({
            id: card.dataset.packageId || String(idx),
            name: cleaned,
            color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
            nativeCard: card,
            isSelected: false
          });
        });
        return list;
      }

      // 3. From native <select>
      const select = document.querySelector(".vel-header select, #movies-category-select, #series-category-select");
      if (select && select.options && select.options.length > 0) {
        [...select.options].forEach((opt, idx) => {
          const rawText = opt.textContent || opt.value || "";
          const cleaned = rawText.replace(/^GENRE\s*:\s*/i, "").trim().toUpperCase() || "CATÉGORIE";
          list.push({
            id: opt.value,
            name: cleaned,
            color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
            selectOption: opt,
            isSelected: opt.selected || opt.value === select.value
          });
        });
        return list;
      }

      return null;
    }

    getCurrentActiveName() {
      // Check native picker current name element
      const nameEl = document.querySelector(".vel-media-package-picker__name");
      if (nameEl && nameEl.textContent && nameEl.textContent.trim() !== "Choisir") {
        return nameEl.textContent.replace(/^GENRE\s*:\s*/i, "").trim().toUpperCase();
      }

      // Check active package option in dropdown
      const activeOption = document.querySelector("#vel-media-package-menu .is-selected span:first-child");
      if (activeOption && activeOption.textContent) {
        return activeOption.textContent.replace(/^GENRE\s*:\s*/i, "").trim().toUpperCase();
      }

      return null;
    }

    updateTitleText(name) {
      if (!this.hubTitle) return;
      const text = String(name || "").trim().toUpperCase();
      this.hubTitle.textContent = text;
      // Single word category styling (bump font size up to fill space)
      const isSingleWord = !text.includes(" ");
      this.hubTitle.classList.toggle("single-word-title", isSingleWord);
    }

    syncAndMount(attempt = 1) {
      // Hide the native visible "GENRE" button/wrapper via inline JS
      const nativePicker = document.getElementById("vel-media-package-picker");
      if (nativePicker) {
        nativePicker.style.setProperty("display", "none", "important");
      }

      const extracted = this.extractPackagesFromDOM();
      if (!extracted && attempt < 6) {
        this.retryTimer = setTimeout(() => this.syncAndMount(attempt + 1), 100);
        return;
      }

      this.packages = extracted || DEFAULT_FALLBACK_PACKAGES;

      const activeName = this.getCurrentActiveName();
      if (activeName) {
        const found = this.packages.find(p => p.name === activeName);
        this.selectedPackage = found || { id: "", name: activeName, color: "bg-blue" };
      } else {
        const selected = this.packages.find(p => p.isSelected);
        this.selectedPackage = selected || this.packages[0];
      }

      this.mountHub();
    }

    syncCurrentState() {
      const activeName = this.getCurrentActiveName();
      if (activeName && this.hubTitle && this.hubTitle.textContent !== activeName) {
        this.updateTitleText(activeName);
        const found = this.packages.find(p => p.name === activeName);
        if (found) {
          this.selectedPackage = found;
        }
      }

      // Keep native picker hidden on media tabs
      const nativePicker = document.getElementById("vel-media-package-picker");
      if (nativePicker && nativePicker.style.display !== "none") {
        nativePicker.style.setProperty("display", "none", "important");
      }

      // Update package list if new packages were loaded
      const extracted = this.extractPackagesFromDOM();
      if (extracted && extracted.length > 0 && extracted.length !== this.packages.length) {
        this.packages = extracted;
        this.renderCards();
      }
    }

    markUserInteracted() {
      window._pkgHubUserInteracted = true;
      if (this.hubWrapper) {
        this.hubWrapper.classList.add("user-interacted");
      }
    }

    mountHub() {
      if (!this.hubWrapper) {
        const wrapper = document.createElement("div");
        wrapper.className = "pkg-hub-wrapper";
        if (window._pkgHubUserInteracted) {
          wrapper.classList.add("user-interacted");
        }
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

          <div class="pkg-hub-dropdown" id="pkgHubDropdown" role="listbox" aria-label="Sélecteur de forfaits">
            <button type="button" class="pkg-hub-arrow left-arrow" id="pkgArrowLeft" aria-label="Forfait précédent">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <div class="pkg-hub-fan-container" id="pkgFanContainer"></div>
            <button type="button" class="pkg-hub-arrow right-arrow" id="pkgArrowRight" aria-label="Forfait suivant">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        `;

        this.hubWrapper = wrapper;
        this.hubBtn = wrapper.querySelector("#pkgHubBtn");
        this.hubTitle = wrapper.querySelector("#pkgHubTitle");
        this.hintHand = wrapper.querySelector("#pkgHubHintHand");
        this.dropdown = wrapper.querySelector("#pkgHubDropdown");
        this.fanContainer = wrapper.querySelector("#pkgFanContainer");
        this.arrowLeft = wrapper.querySelector("#pkgArrowLeft");
        this.arrowRight = wrapper.querySelector("#pkgArrowRight");

        this.bindEvents();
      }

      // Append directly to document.body (visibility is 100% governed by CSS rules on body[data-vel-active-tab])
      if (this.hubWrapper.parentElement !== document.body) {
        document.body.appendChild(this.hubWrapper);
      }

      this.updateTitleText(this.selectedPackage.name);
      this.renderCards();
    }

    renderCards() {
      this.fanContainer.innerHTML = "";
      this.cards = this.packages.map((pkg, index) => {
        const card = document.createElement("div");
        card.className = `pkg-card ${pkg.color} pos-hidden`;
        card.dataset.pkgIndex = String(index);
        card.dataset.pkgId = String(pkg.id || "");
        card.setAttribute("role", "option");
        card.setAttribute("tabindex", "0");

        const textSpan = document.createElement("span");
        textSpan.className = "pkg-card-text";
        textSpan.innerHTML = formatCardTextHtml(pkg.name);
        card.appendChild(textSpan);

        this.fanContainer.appendChild(card);
        return card;
      });

      this.updateFanPositions();
      this.fitAllCards();
    }

    fitAllCards() {
      if (!this.cards) return;
      this.cards.forEach((card) => fitCardText(card));
    }

    updateFanPositions() {
      const total = this.packages.length;
      if (total === 0 || !this.cards) return;
      const posClasses = ["pos-1", "pos-2", "pos-3", "pos-4"];

      this.cards.forEach((card, i) => {
        card.classList.remove("pos-1", "pos-2", "pos-3", "pos-4", "pos-hidden");
        const rel = (i - this.startIndex + total) % total;

        if (rel < 4) {
          card.classList.add(posClasses[rel]);
          card.removeAttribute("aria-hidden");
        } else {
          card.classList.add("pos-hidden");
          card.setAttribute("aria-hidden", "true");
        }
      });
    }

    shiftLeft() {
      const total = this.packages.length;
      if (total === 0) return;
      this.startIndex = (this.startIndex - 1 + total) % total;
      this.updateFanPositions();
    }

    shiftRight() {
      const total = this.packages.length;
      if (total === 0) return;
      this.startIndex = (this.startIndex + 1) % total;
      this.updateFanPositions();
    }

    toggle() {
      this.markUserInteracted();
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    }

    open() {
      this.isOpen = true;
      this.dropdown?.classList.add("active");
      this.hubBtn?.setAttribute("aria-expanded", "true");
    }

    close() {
      this.isOpen = false;
      this.dropdown?.classList.remove("active");
      this.hubBtn?.setAttribute("aria-expanded", "false");
    }

    selectPackage(pkg) {
      if (!pkg) return;
      this.markUserInteracted();
      this.selectedPackage = pkg;
      this.updateTitleText(pkg.name);
      this.close();

      // 1. Direct activation helper if exported
      if (typeof window.veloraActivateMediaPackage === "function" && pkg.id) {
        window.veloraActivateMediaPackage(String(pkg.id));
      }

      // 2. Click native option in #vel-media-package-menu
      const nativeOpt = pkg.nativeOption || 
                        document.querySelector(`#vel-media-package-menu [data-package-id="${pkg.id}"]`) ||
                        [...document.querySelectorAll("#vel-media-package-menu [data-package-id]")].find(el => {
                          const t = el.querySelector("span:first-child")?.textContent || el.textContent;
                          return t && t.trim().toUpperCase() === pkg.name;
                        });
      if (nativeOpt && typeof nativeOpt.click === "function") {
        nativeOpt.click();
      }

      // 3. Click native card in #packages-view
      const nativeCard = pkg.nativeCard || 
                         document.querySelector(`#packages-view [data-package-id="${pkg.id}"]`) ||
                         [...document.querySelectorAll("#packages-view .vel-package-card")].find(el => {
                           const t = el.querySelector(".vel-package-card__title")?.textContent || el.getAttribute("aria-label");
                           return t && t.trim().toUpperCase() === pkg.name;
                         });
      if (nativeCard && typeof nativeCard.click === "function") {
        nativeCard.click();
      }

      // 4. Update native select if present
      const select = document.querySelector(".vel-header select, #movies-category-select, #series-category-select");
      if (select) {
        select.value = pkg.id;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }

      // 5. Update data attribute
      if (pkg.id) {
        document.body.dataset.veloraActivePackageId = String(pkg.id);
      }

      // 6. Dispatch global custom events
      document.dispatchEvent(new CustomEvent("pkg-hub-selected", {
        bubbles: true,
        detail: { package: pkg }
      }));
      document.dispatchEvent(new CustomEvent("vel-media-package-selected", {
        bubbles: true,
        detail: { packageId: pkg.id, packageName: pkg.name }
      }));
    }

    bindEvents() {
      // Toggle on hub trigger
      this.hubBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggle();
      });

      this.hubBtn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.toggle();
        }
      });

      // Arrow buttons
      this.arrowLeft.addEventListener("click", (e) => {
        e.stopPropagation();
        this.markUserInteracted();
        this.shiftLeft();
      });

      this.arrowRight.addEventListener("click", (e) => {
        e.stopPropagation();
        this.markUserInteracted();
        this.shiftRight();
      });

      // Card clicks
      this.fanContainer.addEventListener("click", (e) => {
        const card = e.target.closest(".pkg-card");
        if (!card || card.classList.contains("pos-hidden")) return;
        const index = Number(card.dataset.pkgIndex);
        if (Number.isFinite(index) && this.packages[index]) {
          this.selectPackage(this.packages[index]);
        }
      });

      this.fanContainer.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          const card = e.target.closest(".pkg-card");
          if (!card || card.classList.contains("pos-hidden")) return;
          const index = Number(card.dataset.pkgIndex);
          if (Number.isFinite(index) && this.packages[index]) {
            e.preventDefault();
            this.selectPackage(this.packages[index]);
          }
        }
      });

      // Close on outside click
      document.addEventListener("click", (e) => {
        if (this.isOpen && this.hubWrapper && !this.hubWrapper.contains(e.target)) {
          this.close();
        }
      });

      // Close on Escape key
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.isOpen) {
          this.close();
          this.hubBtn?.focus();
        }
      });

      // Window resize & orientation change: re-fit text dynamically
      let resizeTimer = null;
      window.addEventListener("resize", () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (this.isOpen || this.isMediaTab()) {
            this.fitAllCards();
          }
        }, 100);
      });

      window.addEventListener("orientationchange", () => {
        setTimeout(() => this.fitAllCards(), 200);
      });
    }
  }

  // Instantiate bridge controller
  if (typeof window !== "undefined") {
    window._pkgHubBridge = new PkgHubBridge();
  }
})();

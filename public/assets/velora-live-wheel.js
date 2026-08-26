(() => {
  "use strict";

  // Brand Theme Fallbacks
  function getBrandThemeByName(name = "") {
    const n = String(name || "").toLowerCase();
    if (n.includes("netflix")) {
      return {
        primary: "#E50914",
        glow: "rgba(229, 9, 20, 0.55)",
        subtle: "rgba(229, 9, 20, 0.16)",
        border: "rgba(229, 9, 20, 0.45)",
        arenaBg: "radial-gradient(circle at 50% 35%, rgba(160, 10, 20, 0.48) 0%, rgba(14, 5, 8, 0.98) 75%)"
      };
    }
    if (n.includes("prime") || n.includes("amazon")) {
      return {
        primary: "#00A8E1",
        glow: "rgba(0, 168, 225, 0.55)",
        subtle: "rgba(0, 168, 225, 0.16)",
        border: "rgba(0, 168, 225, 0.45)",
        arenaBg: "radial-gradient(circle at 50% 35%, rgba(0, 110, 180, 0.45) 0%, rgba(4, 10, 22, 0.98) 75%)"
      };
    }
    if (n.includes("disney") || n.includes("marvel") || n.includes("star wars")) {
      return {
        primary: "#00D6FE",
        glow: "rgba(0, 214, 254, 0.55)",
        subtle: "rgba(0, 214, 254, 0.16)",
        border: "rgba(0, 214, 254, 0.45)",
        arenaBg: "radial-gradient(circle at 50% 35%, rgba(10, 60, 180, 0.45) 0%, rgba(4, 8, 24, 0.98) 75%)"
      };
    }
    if (n.includes("max") || n.includes("hbo") || n.includes("warner")) {
      return {
        primary: "#002BE7",
        glow: "rgba(0, 43, 231, 0.55)",
        subtle: "rgba(0, 43, 231, 0.16)",
        border: "rgba(0, 43, 231, 0.45)",
        arenaBg: "radial-gradient(circle at 50% 35%, rgba(0, 30, 130, 0.48) 0%, rgba(6, 8, 26, 0.98) 75%)"
      };
    }
    if (n.includes("canal") || n.includes("c+")) {
      return {
        primary: "#FFE600",
        glow: "rgba(255, 230, 0, 0.45)",
        subtle: "rgba(255, 230, 0, 0.14)",
        border: "rgba(255, 230, 0, 0.35)",
        arenaBg: "radial-gradient(circle at 50% 35%, rgba(120, 100, 10, 0.42) 0%, rgba(12, 10, 6, 0.98) 75%)"
      };
    }
    if (n.includes("apple") || n.includes("apple tv")) {
      return {
        primary: "#38bdf8",
        glow: "rgba(56, 189, 248, 0.5)",
        subtle: "rgba(56, 189, 248, 0.15)",
        border: "rgba(56, 189, 248, 0.4)",
        arenaBg: "radial-gradient(circle at 50% 35%, rgba(30, 70, 100, 0.45) 0%, rgba(8, 12, 18, 0.98) 75%)"
      };
    }
    if (n.includes("paramount")) {
      return {
        primary: "#0064FF",
        glow: "rgba(0, 100, 255, 0.55)",
        subtle: "rgba(0, 100, 255, 0.16)",
        border: "rgba(0, 100, 255, 0.45)",
        arenaBg: "radial-gradient(circle at 50% 35%, rgba(0, 60, 160, 0.45) 0%, rgba(4, 8, 22, 0.98) 75%)"
      };
    }
    if (n.includes("bein")) {
      return {
        primary: "#c026d3",
        glow: "rgba(192, 38, 211, 0.55)",
        subtle: "rgba(192, 38, 211, 0.16)",
        border: "rgba(192, 38, 211, 0.45)",
        arenaBg: "radial-gradient(circle at 50% 35%, rgba(100, 15, 120, 0.48) 0%, rgba(18, 6, 22, 0.98) 75%)"
      };
    }
    if (n.includes("dazn")) {
      return {
        primary: "#E2FF00",
        glow: "rgba(226, 255, 0, 0.5)",
        subtle: "rgba(226, 255, 0, 0.14)",
        border: "rgba(226, 255, 0, 0.35)",
        arenaBg: "radial-gradient(circle at 50% 35%, rgba(90, 100, 10, 0.4) 0%, rgba(10, 12, 6, 0.98) 75%)"
      };
    }
    if (n.includes("eurosport") || n.includes("rmc") || n.includes("tf1")) {
      return {
        primary: "#0284c7",
        glow: "rgba(2, 132, 199, 0.55)",
        subtle: "rgba(2, 132, 199, 0.15)",
        border: "rgba(2, 132, 199, 0.45)",
        arenaBg: "radial-gradient(circle at 50% 35%, rgba(10, 60, 120, 0.45) 0%, rgba(6, 10, 20, 0.98) 75%)"
      };
    }
    return {
      primary: "#c084fc",
      glow: "rgba(168, 85, 247, 0.55)",
      subtle: "rgba(168, 85, 247, 0.15)",
      border: "rgba(168, 85, 247, 0.35)",
      arenaBg: "radial-gradient(circle at 50% 35%, rgba(55, 25, 95, 0.55) 0%, rgba(10, 8, 22, 0.98) 75%)"
    };
  }

  // Color Extraction Canvas Cache
  const colorCache = new Map();
  function extractColorFromImage(imageUrl, callback) {
    if (!imageUrl) return;
    if (colorCache.has(imageUrl)) {
      callback(colorCache.get(imageUrl));
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        canvas.width = 40;
        canvas.height = 40;
        ctx.drawImage(img, 0, 0, 40, 40);
        const data = ctx.getImageData(0, 0, 40, 40).data;

        let visiblePixels = 0;
        let chromaticPixels = 0;
        let bestColor = null;
        let highestScore = -1;
        const bins = {};

        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 70) continue;
          visiblePixels++;

          const r = data[i], g = data[i + 1], b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const chroma = max - min;
          const brightness = (r + g + b) / 3;

          if (chroma < 32 || brightness < 28 || brightness > 235) continue;

          chromaticPixels++;
          const score = chroma * 2 + (brightness > 60 && brightness < 190 ? 40 : 0);
          const qKey = `${Math.round(r / 25) * 25},${Math.round(g / 25) * 25},${Math.round(b / 25) * 25}`;
          if (!bins[qKey]) {
            bins[qKey] = { rSum: 0, gSum: 0, bSum: 0, count: 0, score: 0 };
          }
          bins[qKey].rSum += r;
          bins[qKey].gSum += g;
          bins[qKey].bSum += b;
          bins[qKey].count++;
          bins[qKey].score += score;
        }

        if (chromaticPixels < 25 || (visiblePixels > 0 && (chromaticPixels / visiblePixels) < 0.04)) {
          const bwTheme = {
            primary: "#e2e8f0",
            glow: "rgba(255, 255, 255, 0.65)",
            subtle: "rgba(255, 255, 255, 0.16)",
            border: "rgba(255, 255, 255, 0.45)",
            arenaBg: "radial-gradient(circle at 50% 35%, rgba(65, 70, 85, 0.55) 0%, rgba(10, 10, 16, 0.98) 75%)"
          };
          colorCache.set(imageUrl, bwTheme);
          callback(bwTheme);
          return;
        }

        for (const key in bins) {
          const bin = bins[key];
          const totalScore = bin.score * Math.sqrt(bin.count);
          if (totalScore > highestScore) {
            highestScore = totalScore;
            bestColor = {
              r: Math.round(bin.rSum / bin.count),
              g: Math.round(bin.gSum / bin.count),
              b: Math.round(bin.bSum / bin.count)
            };
          }
        }

        if (bestColor) {
          const { r, g, b } = bestColor;
          const hex = `rgb(${r}, ${g}, ${b})`;
          const theme = {
            primary: hex,
            glow: `rgba(${r}, ${g}, ${b}, 0.55)`,
            subtle: `rgba(${r}, ${g}, ${b}, 0.16)`,
            border: `rgba(${r}, ${g}, ${b}, 0.45)`,
            arenaBg: `radial-gradient(circle at 50% 35%, rgba(${Math.round(r * 0.45)}, ${Math.round(g * 0.45)}, ${Math.round(b * 0.45)}, 0.45) 0%, rgba(10, 8, 22, 0.98) 75%)`
          };
          colorCache.set(imageUrl, theme);
          callback(theme);
        }
      } catch (_) {}
    };
  }

  // Active country resolution
  function getActiveCountryId() {
    if (typeof window.veloraGetActiveCountryId === "function") {
      const c = window.veloraGetActiveCountryId();
      if (c) return c;
    }
    const select = document.getElementById("country-select") || document.getElementById("home-country-select");
    if (select && select.value) return select.value;
    return "country_france";
  }

  // Parse package ID coordinates
  function parseCoordinates(pkg) {
    let sourceId = pkg.source_id || 1;
    let categoryId = pkg.category_id || pkg.id;
    const raw = String(pkg.id || "").trim();

    if (raw.includes(":")) {
      const parts = raw.split(":");
      if (parts.length >= 3) {
        sourceId = parseInt(parts[0], 10) || sourceId;
        categoryId = parts[2];
      } else if (parts.length === 2) {
        sourceId = parseInt(parts[0], 10) || sourceId;
        categoryId = parts[1];
      }
    }
    return { sourceId, categoryId };
  }

  // Fetch streams for a specific package ID (with VPS parent/child expansion support)
  async function fetchLiveStreamsForPkg(pkg) {
    const countryId = getActiveCountryId();
    const pkgId = String(pkg.id || "").trim();

    // 1. Preferred backend endpoint: loads curated channels and expands parent bouquets into all children!
    if (pkgId) {
      try {
        const url = `/api/velora-db/admin/package-live-channels?countryId=${encodeURIComponent(countryId)}&packageId=${encodeURIComponent(pkgId)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.channels) && data.channels.length > 0) {
            return data.channels;
          }
        }
      } catch (_) {}
    }

    // 2. Direct Xtream API category fetch fallback (for uncurated raw packages)
    const { sourceId, categoryId } = parseCoordinates(pkg);
    const endpoints = [
      `/api/proxy/xtream/${encodeURIComponent(sourceId)}/live_streams?category_id=${encodeURIComponent(categoryId)}`,
      `/api/proxy/xtream/all/live_streams?category_id=${encodeURIComponent(categoryId)}`
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) return data;
          if (data && Array.isArray(data.streams) && data.streams.length > 0) return data.streams;
          if (data && Array.isArray(data.items) && data.items.length > 0) return data.items;
        }
      } catch (_) {}
    }
    return [];
  }

  // Channel Name Filter & Cleaner Rules
  let cachedHiddenFilters = ["hevc", "h265", "h.265", "h 265", "x265", "###"];
  let cachedPrefixes = [];

  async function loadAdminChannelRules() {
    try {
      const [resF, resP] = await Promise.all([
        fetch("/api/velora-db/rest/v1/admin_hidden_filters?select=needle&order=needle.asc"),
        fetch("/api/velora-db/rest/v1/admin_channel_name_prefixes?select=prefix,sort_order&order=sort_order.asc")
      ]);
      if (resF.ok) {
        const rows = await resF.json();
        if (Array.isArray(rows)) {
          cachedHiddenFilters = [
            "hevc", "h265", "h.265", "h 265", "x265", "###",
            ...rows.map(r => String(r.needle || "").trim().toLowerCase()).filter(Boolean)
          ];
        }
      }
      if (resP.ok) {
        const pRows = await resP.json();
        if (Array.isArray(pRows)) {
          cachedPrefixes = pRows.map(r => String(r.prefix || "").trim()).filter(Boolean)
            .sort((a, b) => b.length - a.length);
        }
      }
    } catch (_) {}
  }

  function isDummyOrHiddenChannel(rawName) {
    const raw = String(rawName || "").trim();
    if (!raw) return true;

    const lower = raw.normalize("NFKC").toLowerCase();

    // 1. Any channel containing 3 or more hashes '#' is a category separator banner
    if ((raw.match(/#/g) || []).length >= 3) return true;

    // 2. Decorative separator banner patterns (e.g. --- ... --- or === ... === or *** ... ***)
    if (/^[-=*~_]{3,}.*[-=*~_]{3,}$/.test(raw)) return true;

    // 3. Admin hidden filters and suffixes/prefixes
    for (const filter of cachedHiddenFilters) {
      if (!filter) continue;
      if (filter.startsWith("suffix:")) {
        const suffix = filter.slice(7).trim();
        if (suffix && (lower.endsWith(suffix) || lower.includes(suffix))) return true;
      } else if (filter.startsWith("prefix:")) {
        const prefix = filter.slice(7).trim();
        if (prefix && (lower.startsWith(prefix) || lower.includes(prefix))) return true;
      } else {
        if (lower.includes(filter)) return true;
      }
    }

    return false;
  }

  function cleanChannelTitle(rawName) {
    let name = String(rawName || "").trim();
    for (let pass = 0; pass < 32; pass++) {
      const prefix = cachedPrefixes.find(p => p.length <= name.length && name.slice(0, p.length).toLowerCase() === p.toLowerCase());
      if (prefix) {
        name = name.slice(prefix.length).trim();
        continue;
      }
      const codeMatch = /^(\|[A-Za-z0-9]{2,4}\|\s*|\[[A-Za-z0-9]{2,4}\]\s*|[A-Za-z]{2,3}\s*:\s*|[A-Za-z]{2,3}\s*[-–]\s*)/i.exec(name);
      if (codeMatch && codeMatch[0]) {
        name = name.slice(codeMatch[0].length).trim();
        continue;
      }
      break;
    }
    return name || rawName;
  }

  class LiveWheelEngine {
    constructor() {
      this.wrapper = null;
      this.stage = null;
      this.pointer = null;
      this.searchBarWrap = null;
      this.searchInput = null;
      this.searchClearBtn = null;
      this.searchCountEl = null;

      this.packages = [];
      this.childPackagesMap = new Map();
      this.cachedApiPackages = [];
      
      // Main Wheel State
      this.currentIndex = 0;
      this.animatedIndex = 0;
      this.settledPackageIndex = -1;
      this.isDragging = false;
      this.isSpinning = false;
      this.animFrameId = null;
      this.activePointerId = null;
      this.startX = 0;
      this.startY = 0;
      this.downTarget = null;
      this.dragStartIndex = 0;
      this.dragStartTime = 0;
      this.hasDragMoved = false;

      // Channels State
      this.allChannels = [];
      this.filteredChannels = [];
      this.renderedCount = 0;
      this.pageSize = 500;
      this.searchQuery = "";
      this.currentPlayingStreamId = null;
      this.isLoadingChannels = false;

      this.currentTheme = null;
      this.init();
    }

    async init() {
      // Hook veloraDescribeFavoriteCard for custom live wheel rows
      const originalDescribe = window.veloraDescribeFavoriteCard;
      window.veloraDescribeFavoriteCard = (card) => {
        if (card && card.classList.contains("vel-media-item-row")) {
          const sId = card.dataset.streamId;
          if (sId) {
            const btn = card.querySelector(".media-item__main");
            const img = card.querySelector("img");
            return {
              sourceId: String(card.dataset.favoriteSourceId || "1"),
              itemId: String(sId),
              itemType: "channel",
              name: btn ? (btn.getAttribute("aria-label") || "") : "",
              thumbUrl: img ? (img.getAttribute("src") || "") : "",
              packageId: String(card.dataset.favoritePackageId || "")
            };
          }
        }
        return typeof originalDescribe === "function" ? originalDescribe(card) : null;
      };

      this.createDom();
      this.bindEvents();
      this.observeState();
      this.setupInfiniteScroll();
      await Promise.all([this.loadCatalogCache(), loadAdminChannelRules()]);
      this.checkVisibility();
    }

    createDom() {
      const existing = document.getElementById("vel-live-wheel-root");
      if (existing) existing.remove();

      const root = document.createElement("div");
      root.id = "vel-live-wheel-root";
      root.className = "vel-casino-wheel-wrapper";
      root.innerHTML = `
        <div class="vel-wheel-arena">
          <div class="vel-wheel-ambient-glow" aria-hidden="true"></div>
          <div class="vel-wheel-pointer" aria-hidden="true">
            <div class="vel-wheel-pointer__triangle"></div>
          </div>
          <div class="vel-coverflow-stage" tabindex="0" role="region" aria-label="Carrousel bouquets TV"></div>
        </div>
        <div class="vel-live-search-bar-wrap" id="vel-live-search-bar-wrap">
          <div class="vel-live-search-input-box">
            <span class="vel-live-search-icon" aria-hidden="true">🔍</span>
            <input type="text" id="vel-live-channel-search" class="vel-live-search-input" placeholder="Rechercher une chaîne..." autocomplete="off" spellcheck="false" />
            <button type="button" id="vel-live-channel-search-clear" class="vel-live-search-clear hidden" aria-label="Effacer la recherche">×</button>
          </div>
          <span class="vel-live-channel-count" id="vel-live-channel-count">0 chaîne</span>
        </div>
      `;

      this.wrapper = root;
      this.stage = root.querySelector(".vel-coverflow-stage");
      this.pointer = root.querySelector(".vel-wheel-pointer");
      this.searchBarWrap = root.querySelector("#vel-live-search-bar-wrap");
      this.searchInput = root.querySelector("#vel-live-channel-search");
      this.searchClearBtn = root.querySelector("#vel-live-channel-search-clear");
      this.searchCountEl = root.querySelector("#vel-live-channel-count");

      const packagesView = document.getElementById("packages-view");
      if (packagesView && packagesView.parentNode) {
        packagesView.parentNode.insertBefore(root, packagesView);
      }
    }

    bindEvents() {
      // Pointer Drag & Inertia for Big Wheel
      this.stage.addEventListener("pointerdown", (e) => this.onPointerDown(e));
      this.stage.addEventListener("pointermove", (e) => this.onPointerMove(e));
      this.stage.addEventListener("pointerup", (e) => this.onPointerUp(e));
      this.stage.addEventListener("pointercancel", (e) => this.onPointerCancel(e));

      // Mouse Wheel Scroll
      this.stage.addEventListener("wheel", (e) => {
        e.preventDefault();
        if (this.isSpinning || this.packages.length === 0) return;
        const delta = Math.sign(e.deltaY || e.deltaX);
        const total = this.packages.length;
        const target = ((this.currentIndex + delta) % total + total) % total;
        this.smoothAnimateToIndex(target, 280);
      }, { passive: false });

      // Search Bar Input & Clear
      if (this.searchInput) {
        this.searchInput.addEventListener("input", (e) => {
          this.searchQuery = e.target.value.trim().toLowerCase();
          if (this.searchClearBtn) {
            this.searchClearBtn.classList.toggle("hidden", this.searchQuery.length === 0);
          }
          this.filterAndRenderChannels();
        });
      }

      if (this.searchClearBtn) {
        this.searchClearBtn.addEventListener("click", () => {
          if (this.searchInput) {
            this.searchInput.value = "";
            this.searchInput.focus();
          }
          this.searchQuery = "";
          this.searchClearBtn.classList.add("hidden");
          this.filterAndRenderChannels();
        });
      }

      // Keyboard navigation
      window.addEventListener("keydown", (e) => {
        if (!this.isLiveActive() || this.packages.length === 0) return;
        if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) return;

        if (e.key === "ArrowLeft") {
          const total = this.packages.length;
          const target = ((this.currentIndex - 1) % total + total) % total;
          this.smoothAnimateToIndex(target, 280);
        } else if (e.key === "ArrowRight") {
          const total = this.packages.length;
          const target = ((this.currentIndex + 1) % total + total) % total;
          this.smoothAnimateToIndex(target, 280);
        }
      });

      // Navigation & admin rule update events
      document.addEventListener("velora-channel-suffixes-changed", async () => {
        await loadAdminChannelRules();
        this.allChannels = this.allChannels.filter(ch => !isDummyOrHiddenChannel(ch.name));
        this.filterAndRenderChannels();
      });
      document.addEventListener("velora-channel-prefixes-changed", async () => {
        await loadAdminChannelRules();
        this.allChannels.forEach(ch => { ch.name = cleanChannelTitle(ch.name); });
        this.filterAndRenderChannels();
      });

      document.addEventListener("velora-top-level-tab", () => this.checkVisibility());
      document.addEventListener("velora-show-home", () => this.checkVisibility());
      document.addEventListener("velora-home-country-rendered", () => this.checkVisibility());
      document.addEventListener("velora-country-changed", async () => {
        await this.loadCatalogCache();
        this.checkVisibility();
        this.refreshPackages();
      });
      window.addEventListener("popstate", () => this.checkVisibility());
    }

    setupInfiniteScroll() {
      window.addEventListener("scroll", () => {
        if (!this.isLiveActive() || this.isLoadingChannels) return;
        if (this.renderedCount >= this.filteredChannels.length) return;

        const scrollPosition = window.innerHeight + window.scrollY;
        const threshold = document.documentElement.scrollHeight - 550;

        if (scrollPosition >= threshold) {
          this.renderNextBatch();
        }
      }, { passive: true });
    }

    isLiveActive() {
      const body = document.body;
      if (body.classList.contains("vel-home-empty-active")) return false;
      if (body.dataset.velTopLevel === "home") return false;

      const homeEmptyPage = document.getElementById("vel-home-empty-page");
      if (homeEmptyPage && !homeEmptyPage.classList.contains("hidden") && homeEmptyPage.style.display !== "none") {
        return false;
      }

      const activeTab = String(body.dataset.velActiveTab || "").toLowerCase();
      const topLevel = String(body.dataset.velTopLevel || "").toLowerCase();

      return activeTab === "live" || topLevel === "live";
    }

    checkVisibility() {
      const isLive = this.isLiveActive();
      if (this.wrapper) {
        this.wrapper.style.display = isLive ? "block" : "none";
      }

      // Keep player visible when on Live TV
      const playerContainer = document.getElementById("player-container");
      if (playerContainer && isLive) {
        playerContainer.classList.remove("hidden");
        playerContainer.setAttribute("aria-hidden", "false");
      }

      if (isLive) {
        this.refreshPackages();
      }
    }

    observeState() {
      // Observe body dataset and classes
      const bodyObserver = new MutationObserver(() => {
        this.checkVisibility();
      });
      bodyObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["data-vel-active-tab", "data-vel-top-level", "class"]
      });

      // Observe packages view
      const packagesView = document.getElementById("packages-view");
      if (packagesView) {
        const pkgObserver = new MutationObserver(() => {
          if (this.isLiveActive()) {
            this.refreshPackages();
          }
        });
        pkgObserver.observe(packagesView, { childList: true, subtree: false });
      }

      // Observe home page container
      const homePage = document.getElementById("vel-home-empty-page");
      if (homePage) {
        const homeObserver = new MutationObserver(() => {
          this.checkVisibility();
        });
        homeObserver.observe(homePage, { attributes: true, attributeFilter: ["class", "style"] });
      }
    }

    async loadCatalogCache() {
      try {
        const res = await fetch("/api/velora-db/country-package-cache");
        if (res.ok) {
          const data = await res.json();
          this.cachedApiPackages = data.packages || [];
        }
      } catch (_) {}
    }

    refreshPackages() {
      if (!this.isLiveActive()) return;

      const packagesView = document.getElementById("packages-view");
      if (!packagesView) return;

      const rawCards = [...packagesView.querySelectorAll(":scope > .vel-package-card[data-package-id]")];
      if (rawCards.length === 0 && this.cachedApiPackages.length === 0) return;

      const list = [];
      const childMap = new Map();

      rawCards.forEach((card, i) => {
        const id = String(card.dataset.packageId || "");
        const titleEl = card.querySelector(".vel-package-card__title");
        const title = titleEl ? titleEl.textContent.trim() : card.getAttribute("aria-label") || `Bouquet ${i+1}`;
        const imgEl = card.querySelector(":scope > img, .vel-package-card__live-logo");
        const cover_url = imgEl ? (imgEl.getAttribute("src") || "") : (window.__veloraCustomPackageLogos?.[id] || "");
        
        const apiPkg = this.cachedApiPackages.find(p => String(p.id) === id);
        const is_parent = card.classList.contains("vel-package-card--parent") || Boolean(apiPkg?.is_parent) || (Array.isArray(apiPkg?.child_package_ids) && apiPkg.child_package_ids.length > 0);
        const childIds = apiPkg?.child_package_ids || [];

        const pkgObj = {
          id,
          name: title,
          display_name: title,
          cover_url,
          is_parent,
          child_package_ids: childIds,
          originalCard: card,
          source_id: apiPkg?.source_id,
          category_id: apiPkg?.category_id
        };
        list.push(pkgObj);

        // Build child packages list
        const children = [];
        if (childIds.length > 0) {
          childIds.forEach(cid => {
            const childApi = this.cachedApiPackages.find(p => String(p.id) === String(cid));
            if (childApi) {
              children.push({
                id: String(childApi.id),
                name: childApi.name,
                display_name: childApi.name,
                cover_url: childApi.cover_url || cover_url || "",
                source_id: childApi.source_id,
                category_id: childApi.category_id
              });
            }
          });
        }
        if (children.length > 0) {
          childMap.set(id, children);
        }
      });

      this.packages = list;
      this.childPackagesMap = childMap;

      if (this.packages.length > 0) {
        const targetIdx = (this.settledPackageIndex >= 0 && this.settledPackageIndex < this.packages.length)
          ? this.settledPackageIndex
          : 0;

        this.currentIndex = targetIdx;
        this.animatedIndex = targetIdx;
        this.settledPackageIndex = targetIdx;

        // Ensure content view is visible and packages view is hidden
        const contentView = document.getElementById("content-view");
        if (contentView) contentView.classList.remove("hidden");
        const packagesView = document.getElementById("packages-view");
        if (packagesView) packagesView.classList.add("hidden");

        const dynamicList = document.getElementById("dynamic-list");
        const isListEmpty = !dynamicList || dynamicList.children.length === 0;

        if (this.allChannels.length === 0 || isListEmpty) {
          this.onPackageSettled(this.packages[targetIdx]);
        }
        this.renderMainCards();
      }
    }

    triggerTick() {
      if (!this.pointer) return;
      this.pointer.classList.add("is-ticking");
      window.setTimeout(() => {
        if (this.pointer) this.pointer.classList.remove("is-ticking");
      }, 75);
    }

    applyTheme(theme) {
      if (!theme || !this.wrapper) return;
      this.currentTheme = theme;
      this.wrapper.style.setProperty("--theme-primary", theme.primary);
      this.wrapper.style.setProperty("--theme-glow", theme.glow);
      this.wrapper.style.setProperty("--theme-border", theme.border);
      this.wrapper.style.setProperty("--theme-arena-bg", theme.arenaBg);
    }

    getSettledPackage() {
      if (this.packages.length === 0) return null;
      const total = this.packages.length;
      const idx = ((this.settledPackageIndex % total) + total) % total;
      return this.packages[idx] || this.packages[0];
    }

    async onPackageSettled(pkg) {
      if (!pkg) return;

      // Extract color / apply theme
      const brandTheme = getBrandThemeByName(pkg.name);
      this.applyTheme(brandTheme);

      if (pkg.cover_url) {
        extractColorFromImage(pkg.cover_url, (extractedTheme) => {
          this.applyTheme(extractedTheme);
        });
      }

      await this.loadPackageChannels(pkg);
    }

    async loadPackageChannels(pkg) {
      this.isLoadingChannels = true;
      this.showChannelLoadingSkeleton();

      // Ensure content view is visible
      const contentView = document.getElementById("content-view");
      if (contentView) contentView.classList.remove("hidden");
      const packagesView = document.getElementById("packages-view");
      if (packagesView) packagesView.classList.add("hidden");

      try {
        let raw = await fetchLiveStreamsForPkg(pkg);

        // If it's a parent package and backend query returned empty, also fetch each child package in parallel
        const children = this.childPackagesMap.get(pkg.id) || [];
        if (pkg.is_parent && children.length > 0 && raw.length === 0) {
          const childPromises = children.map(child => fetchLiveStreamsForPkg(child));
          const childResults = await Promise.all(childPromises);
          raw = childResults.flat();
        }

        const seenIds = new Set();
        const filtered = [];

        raw.forEach(ch => {
          const rawTitle = String(ch.name || ch.title || "");
          if (isDummyOrHiddenChannel(rawTitle)) return;

          const sId = String(ch.raw_stream_id || ch.stream_id || ch.id || "");
          if (sId && !seenIds.has(sId)) {
            seenIds.add(sId);
            filtered.push({
              ...ch,
              stream_id: sId,
              raw_stream_id: sId,
              name: cleanChannelTitle(rawTitle),
              category_name: ch.category_name || pkg.name,
              package_id: ch.package_id || pkg.id,
              nodecast_source_id: ch.nodecast_source_id || ch.source_id || pkg.source_id || "1"
            });
          }
        });

        this.allChannels = filtered;
        this.filterAndRenderChannels({ autoPlayFirst: true });
      } catch (err) {
        console.error("Failed to load package channels", err);
      } finally {
        this.isLoadingChannels = false;
      }
    }

    showChannelLoadingSkeleton() {
      const dynamicList = document.getElementById("dynamic-list");
      if (!dynamicList) return;

      let skeletonHtml = `
        <div class="item-list item-list--media-loading item-list--media-loading-live col-span-full">
          <div class="vel-channel-loader">
            <div class="vel-channel-skeleton-list">
      `;
      for (let i = 0; i < 6; i++) {
        skeletonHtml += `
          <div class="vel-channel-skeleton-row">
            <div class="vel-channel-skeleton-thumb"></div>
            <div class="vel-channel-skeleton-info">
              <div class="vel-channel-skeleton-line vel-channel-skeleton-line--title"></div>
              <div class="vel-channel-skeleton-line vel-channel-skeleton-line--sub"></div>
            </div>
          </div>
        `;
      }
      skeletonHtml += `
            </div>
          </div>
        </div>
      `;
      dynamicList.innerHTML = skeletonHtml;
    }

    filterAndRenderChannels(options = {}) {
      const q = this.searchQuery;
      if (!q) {
        this.filteredChannels = this.allChannels;
      } else {
        this.filteredChannels = this.allChannels.filter(ch => {
          const name = String(ch.name || ch.title || "").toLowerCase();
          const cat = String(ch.category_name || "").toLowerCase();
          return name.includes(q) || cat.includes(q);
        });
      }

      if (this.searchCountEl) {
        const count = this.filteredChannels.length;
        this.searchCountEl.textContent = `${count} chaîne${count > 1 ? "s" : ""}`;
      }

      this.renderedCount = 0;
      const dynamicList = document.getElementById("dynamic-list");
      if (dynamicList) {
        dynamicList.classList.remove("item-list--vod-vertical", "item-list--vod-film-detail");
        dynamicList.classList.add("item-list--live");
        dynamicList.innerHTML = "";
      }

      this.renderNextBatch();

      // Auto-play the first channel of the selected package
      if (options.autoPlayFirst && this.filteredChannels.length > 0) {
        const first = this.filteredChannels[0];
        console.log("%c[Velora Live] 📺 Auto-playing first channel of package:", "color: #38bdf8; font-weight: bold;", first);
        this.playChannel(first);
      }
    }

    renderNextBatch() {
      const dynamicList = document.getElementById("dynamic-list");
      if (!dynamicList) return;

      const total = this.filteredChannels.length;
      if (total === 0) {
        dynamicList.innerHTML = `<div class="col-span-full text-center py-10 text-xs text-slate-400">Aucune chaîne trouvée dans ce bouquet.</div>`;
        return;
      }

      const start = this.renderedCount;
      const nextBatch = this.filteredChannels.slice(start, start + this.pageSize);
      if (nextBatch.length === 0) return;

      const fragment = document.createDocumentFragment();

      nextBatch.forEach((ch, idx) => {
        const globalIdx = start + idx;
        const streamId = String(ch.stream_id || ch.id || "");
        const name = String(ch.name || ch.title || "Chaîne");
        const logo = String(ch.stream_icon || ch.logo || "").trim();
        const isActive = this.currentPlayingStreamId === streamId;

        const row = document.createElement("div");
        row.className = `vel-media-item-row vel-channel-card-enter ${isActive ? "vel-media-item-row--active" : ""}`;
        row.dataset.streamId = streamId;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `media-item media-item__main ${isActive ? "selected" : ""}`;
        btn.setAttribute("aria-label", name);

        const thumbWrap = document.createElement("div");
        thumbWrap.className = "media-item__thumb vel-image-loaded-host";

        if (logo) {
          const img = document.createElement("img");
          img.className = "vel-image-loaded vel-image-fade is-ready";
          img.loading = globalIdx < 12 ? "eager" : "lazy";
          img.src = logo;
          img.alt = "";
          img.onerror = () => { img.remove(); thumbWrap.innerHTML = `<span class="text-sm">📺</span>`; };
          thumbWrap.appendChild(img);
        } else {
          thumbWrap.innerHTML = `<span class="text-sm">📺</span>`;
        }

        const infoWrap = document.createElement("div");
        infoWrap.className = "media-info";
        infoWrap.innerHTML = `
          <h4 title="${name}">${name}</h4>
          <span class="vel-channel-playing-badge ${isActive ? "" : "hidden"}">
            <span class="vel-live-eq-wave">
              <span class="vel-live-eq-bar"></span>
              <span class="vel-live-eq-bar"></span>
              <span class="vel-live-eq-bar"></span>
            </span>
            <span>EN DIRECT</span>
          </span>
        `;

        btn.appendChild(thumbWrap);
        btn.appendChild(infoWrap);

        btn.addEventListener("click", (e) => {
          e.preventDefault();
          console.log("%c[Velora Live] 🎯 Channel Clicked:", "background: #0284c7; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;", {
            name,
            streamId,
            categoryName: ch.category_name,
            packageId: ch.package_id,
            sourceId: ch.nodecast_source_id || ch.source_id,
            rawObject: ch
          });
          this.playChannel(ch);
        });

        row.appendChild(btn);

        // Attach Favorite Heart Button
        const heartDesc = {
          sourceId: String(ch.nodecast_source_id || ch.source_id || "1"),
          itemId: String(streamId),
          itemType: "channel",
          name: name,
          thumbUrl: logo,
          packageId: String(ch.package_id || ""),
          globalStreamId: String(ch.nodecast_global_stream_id || ch.global_stream_id || ""),
          containerExtension: String(ch.container_extension || "")
        };

        row.dataset.favoriteSourceId = heartDesc.sourceId;
        row.dataset.favoriteItemId = heartDesc.itemId;
        row.dataset.favoriteItemType = heartDesc.itemType;
        row.dataset.favoriteName = heartDesc.name;
        row.dataset.favoriteThumbUrl = heartDesc.thumbUrl;
        row.dataset.favoritePackageId = heartDesc.packageId;

        if (typeof window.veloraCreateFavoriteHeart === "function") {
          const heart = window.veloraCreateFavoriteHeart(heartDesc);
          if (heart) row.appendChild(heart);
        }

        fragment.appendChild(row);
      });

      dynamicList.appendChild(fragment);
      this.renderedCount += nextBatch.length;
    }

    async playChannel(ch) {
      if (!ch) {
        console.warn("[Velora Live] ⚠️ playChannel called with null/empty channel");
        return;
      }
      const streamId = String(ch.stream_id || ch.raw_stream_id || ch.id || "");
      if (!streamId) {
        console.warn("[Velora Live] ⚠️ Channel has no streamId:", ch);
        return;
      }

      this.currentPlayingStreamId = streamId;
      console.log("%c[Velora Live] 🚀 Launching Stream:", "background: #10b981; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;", {
        streamId,
        name: ch.name || ch.title,
        sourceId: ch.nodecast_source_id || ch.source_id || "1",
        packageId: ch.package_id || ch.category_id,
        veloraPlayLiveChannelAvailable: typeof window.veloraPlayLiveChannel === "function"
      });

      // Update active UI styling
      document.querySelectorAll(".vel-media-item-row").forEach(el => {
        const match = el.dataset.streamId === streamId;
        el.classList.toggle("vel-media-item-row--active", match);
        el.querySelector(".media-item__main")?.classList.toggle("selected", match);
        el.querySelector(".vel-channel-playing-badge")?.classList.toggle("hidden", !match);
      });

      // Keep player container visible
      const playerContainer = document.getElementById("player-container");
      if (playerContainer) {
        playerContainer.classList.remove("hidden");
        playerContainer.setAttribute("aria-hidden", "false");
      }

      const item = {
        ...ch,
        stream_id: /^\d+$/.test(streamId) ? Number(streamId) : streamId,
        raw_stream_id: /^\d+$/.test(streamId) ? Number(streamId) : streamId,
        name: ch.name || ch.title || "Chaîne",
        stream_icon: ch.stream_icon || ch.logo || ch.cover || "",
        cover: ch.stream_icon || ch.logo || ch.cover || "",
        nodecast_source_id: String(ch.nodecast_source_id || ch.source_id || "1"),
        nodecast_media: "live"
      };

      // Direct invocation of the native application player engine
      if (typeof window.veloraPlayLiveChannel === "function") {
        try {
          console.log("[Velora Live] 📡 Calling native engine window.veloraPlayLiveChannel...", item);
          await window.veloraPlayLiveChannel(item);
          console.log("[Velora Live] ✅ window.veloraPlayLiveChannel completed successfully.");
          
          const video = document.getElementById("video");
          if (video) {
            console.log("[Velora Live] 📺 Player state:", {
              src: video.src || video.currentSrc,
              paused: video.paused,
              readyState: video.readyState,
              networkState: video.networkState,
              error: video.error
            });
          }
        } catch (err) {
          console.error("[Velora Live] ❌ Playback error in window.veloraPlayLiveChannel:", err);
        }
      } else {
        console.error("[Velora Live] ❌ window.veloraPlayLiveChannel is NOT defined on window object! Check script loading order.");
      }
    }

    renderMainCards() {
      const total = this.packages.length;
      if (total === 0 || !this.stage) return;

      const current = this.animatedIndex;
      const radius = window.innerWidth < 640 ? 240 : 290;
      const angleStep = window.innerWidth < 640 ? 20 : 17.5;

      let html = "";
      for (let i = 0; i < total; i++) {
        let diff = (i - current) % total;
        if (diff > total / 2) diff -= total;
        if (diff < -total / 2) diff += total;

        const absDist = Math.abs(diff);
        if (absDist > 3.6) continue;

        const angleDeg = diff * angleStep;
        const angleRad = (angleDeg * Math.PI) / 180;
        const tx = Math.sin(angleRad) * radius;
        const tz = -(1 - Math.cos(angleRad)) * radius;
        const rotY = -angleDeg;

        const opacity = Math.max(0, 1 - absDist * 0.28);
        const zIndex = Math.round(100 - absDist * 10);
        const isCenter = absDist < 0.45;

        const pkg = this.packages[i];
        const logoHtml = pkg.cover_url
          ? `<img src="${pkg.cover_url}" alt="" loading="lazy" draggable="false" class="vel-coverflow-card__logo" onerror="this.style.display='none';this.nextElementSibling.style.display='block';" /><span style="display:none;" class="text-xl">📺</span>`
          : `<span class="text-xl">📺</span>`;

        html += `
          <div
            class="vel-coverflow-card ${isCenter ? 'is-center-card' : ''}"
            data-index="${i}"
            style="transform: translate3d(calc(-50% + ${tx}px), -50%, ${tz}px) rotateY(${rotY}deg); opacity: ${opacity}; z-index: ${zIndex}; pointer-events: auto;"
          >
            <div class="vel-coverflow-card__inner">
              <div class="vel-coverflow-card__logo-wrap">
                ${logoHtml}
              </div>
              <span class="vel-coverflow-card__title">${pkg.display_name}</span>
            </div>
          </div>
        `;
      }

      this.stage.innerHTML = html;
    }

    smoothAnimateToIndex(targetIdx, duration = 340) {
      if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
      this.isSpinning = true;

      const total = this.packages.length;
      if (total <= 1) {
        this.animatedIndex = 0;
        this.currentIndex = 0;
        this.settledPackageIndex = 0;
        this.renderMainCards();
        this.onPackageSettled(this.packages[0]);
        this.isSpinning = false;
        return;
      }

      const startVal = this.animatedIndex;
      let diff = (targetIdx - startVal) % total;
      if (diff > total / 2) diff -= total;
      if (diff < -total / 2) diff += total;

      const targetVal = startVal + diff;
      const startTime = performance.now();
      let lastRounded = Math.round(startVal);

      const loop = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = 1 - Math.pow(1 - progress, 3);

        this.animatedIndex = startVal + diff * eased;

        const currentRounded = Math.round(this.animatedIndex);
        if (currentRounded !== lastRounded) {
          lastRounded = currentRounded;
          this.triggerTick();
        }

        this.renderMainCards();

        if (progress < 1) {
          this.animFrameId = requestAnimationFrame(loop);
        } else {
          const finalIdx = ((Math.round(targetVal) % total) + total) % total;
          this.animatedIndex = finalIdx;
          this.currentIndex = finalIdx;
          this.settledPackageIndex = finalIdx;
          this.isSpinning = false;
          this.isDragging = false;
          this.renderMainCards();
          this.onPackageSettled(this.packages[finalIdx]);
        }
      };

      this.animFrameId = requestAnimationFrame(loop);
    }

    // Pointer Events for Main Wheel Dragging & Clicking
    onPointerDown(e) {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      if (this.animFrameId) cancelAnimationFrame(this.animFrameId);

      this.isDragging = true;
      this.hasDragMoved = false;
      this.activePointerId = e.pointerId;
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.downTarget = e.target.closest(".vel-coverflow-card") || document.elementFromPoint(e.clientX, e.clientY)?.closest(".vel-coverflow-card");
      this.dragStartIndex = this.animatedIndex;
      this.dragStartTime = performance.now();

      try {
        this.stage.setPointerCapture(e.pointerId);
      } catch (_) {}
    }

    onPointerMove(e) {
      if (!this.isDragging || e.pointerId !== this.activePointerId) return;

      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        this.hasDragMoved = true;
      }

      if (this.hasDragMoved) {
        const sensitivity = window.innerWidth < 640 ? 0.008 : 0.006;
        this.animatedIndex = this.dragStartIndex - dx * sensitivity;
        this.renderMainCards();
      }
    }

    onPointerUp(e) {
      if (!this.isDragging || e.pointerId !== this.activePointerId) return;
      this.isDragging = false;

      try {
        this.stage.releasePointerCapture(e.pointerId);
      } catch (_) {}

      if (this.hasDragMoved) {
        const dt = Math.max(16, performance.now() - this.dragStartTime);
        const deltaUnits = this.animatedIndex - this.dragStartIndex;
        const velocity = deltaUnits / dt;
        const momentum = velocity * 120;
        const target = Math.round(this.animatedIndex + momentum);
        this.smoothAnimateToIndex(target, 320);
      } else {
        // It's a click: find the card under cursor or downTarget
        const cardEl = this.downTarget || document.elementFromPoint(e.clientX, e.clientY)?.closest(".vel-coverflow-card");
        if (cardEl && cardEl.dataset.index !== undefined) {
          const idx = parseInt(cardEl.dataset.index, 10);
          this.smoothAnimateToIndex(idx, 320);
        } else {
          // If clicked on left/right arena sides
          const arenaRect = this.stage.getBoundingClientRect();
          if (e.clientX < arenaRect.left + arenaRect.width * 0.38) {
            const total = this.packages.length;
            const target = ((this.currentIndex - 1) % total + total) % total;
            this.smoothAnimateToIndex(target, 280);
          } else if (e.clientX > arenaRect.left + arenaRect.width * 0.62) {
            const total = this.packages.length;
            const target = ((this.currentIndex + 1) % total + total) % total;
            this.smoothAnimateToIndex(target, 280);
          }
        }
      }
    }

    onPointerCancel(e) {
      if (this.isDragging && e.pointerId === this.activePointerId) {
        this.isDragging = false;
        try {
          this.stage.releasePointerCapture(e.pointerId);
        } catch (_) {}
        const target = Math.round(this.animatedIndex);
        this.smoothAnimateToIndex(target, 200);
      }
    }
  }

  // Auto initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => new LiveWheelEngine());
  } else {
    new LiveWheelEngine();
  }
})();

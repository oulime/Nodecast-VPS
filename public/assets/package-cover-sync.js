/**
 * VELORA VIP — CROWD-SOURCED PACKAGE & PARENT PACKAGE COVER AUTO-SYNC
 * Automatically discovers, persists, and shares the first channel/subpackage image
 * across all users and browsers for every live, parent, and media package.
 */
(function () {
  "use strict";

  window.__veloraCustomPackageLogos = window.__veloraCustomPackageLogos || {};
  const backfillQueue = new Set();
  let flushTimer = null;
  let activeParentPackageId = "";

  function safeUrl(url) {
    if (!url || typeof url !== "string") return "";
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith("/uploads/")) return "";
    return trimmed;
  }

  /**
   * Fetch all server-persisted covers on startup
   */
  async function loadAllCovers() {
    try {
      const response = await fetch("/api/package-covers/all", { cache: "default" });
      if (!response.ok) return;
      const data = await response.json();
      if (data && data.covers) {
        Object.assign(window.__veloraCustomPackageLogos, data.covers);
        applyCoversToDOM();
      }
    } catch (_) {}
  }

  /**
   * Apply loaded covers to all visible package cards & slider
   */
  function applyCoversToDOM() {
    const covers = window.__veloraCustomPackageLogos;
    if (!covers || !Object.keys(covers).length) return;

    // 1. Update standard package cards in #packages-view
    document.querySelectorAll("#packages-view .vel-package-card[data-package-id]").forEach(card => {
      const pkgId = card.dataset.packageId;
      const coverUrl = covers[pkgId];
      if (coverUrl && !card.querySelector(":scope > img, .vel-package-card__live-logo")) {
        const img = document.createElement("img");
        img.className = "vel-package-card__live-logo";
        img.alt = "";
        img.setAttribute("role", "presentation");
        img.loading = "lazy";
        img.decoding = "async";
        img.src = coverUrl;
        img.onerror = () => img.remove();
        card.classList.add("vel-package-card--has-live-logo");
        card.prepend(img);
      }
    });

    // 2. Update brand slider cards
    document.querySelectorAll(".vel-brand-card[data-package-id]").forEach(card => {
      const pkgId = card.dataset.packageId;
      const coverUrl = covers[pkgId];
      if (coverUrl && !card.querySelector(".vel-brand-card__bg-poster")) {
        card.classList.add("vel-brand-card--has-poster");
        const logoWrap = card.querySelector(".vel-brand-card__logo-wrap");
        if (logoWrap) logoWrap.remove();

        let poster = card.querySelector(".vel-brand-card__bg-poster");
        if (!poster) {
          poster = document.createElement("img");
          poster.className = "vel-brand-card__bg-poster";
          poster.alt = "";
          poster.loading = "lazy";
          poster.decoding = "async";
          poster.src = coverUrl;
          poster.onerror = () => { card.classList.remove("vel-brand-card--has-poster"); poster.remove(); };
          card.prepend(poster);
        }
        let overlay = card.querySelector(".vel-brand-card__poster-overlay");
        if (!overlay) {
          overlay = document.createElement("div");
          overlay.className = "vel-brand-card__poster-overlay";
          overlay.setAttribute("aria-hidden", "true");
          poster.insertAdjacentElement("afterend", overlay);
        }
      }
    });
  }

  /**
   * Queue cover discovery to be saved on the server
   */
  function reportDiscoveredCover(packageId, coverUrl) {
    const cleanId = String(packageId || "").trim();
    const cleanUrl = safeUrl(coverUrl);
    if (!cleanId || !cleanUrl) return;

    // If we already know this cover, skip network call
    if (window.__veloraCustomPackageLogos[cleanId] === cleanUrl) return;

    window.__veloraCustomPackageLogos[cleanId] = cleanUrl;
    applyCoversToDOM();

    backfillQueue.add(JSON.stringify({ packageId: cleanId, coverUrl: cleanUrl }));

    if (!flushTimer) {
      flushTimer = window.setTimeout(flushBackfillQueue, 800);
    }
  }

  /**
   * Send discovered covers to server in background
   */
  async function flushBackfillQueue() {
    flushTimer = null;
    if (!backfillQueue.size) return;

    const items = [...backfillQueue].map(item => {
      try { return JSON.parse(item); } catch { return null; }
    }).filter(Boolean);

    backfillQueue.clear();
    if (!items.length) return;

    try {
      await fetch("/api/package-covers/auto-backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items })
      });
    } catch (_) {}
  }

  /**
   * Track parent packages and auto-adopt the first subpackage's image
   */
  function checkParentPackages() {
    const packagesView = document.getElementById("packages-view");
    if (!packagesView) return;

    const currentParentId = String(
      packagesView.dataset.parentPackageId ||
      document.querySelector(".vel-parent-package-children")?.dataset?.parentPackageId ||
      ""
    ).trim();

    if (currentParentId) {
      activeParentPackageId = currentParentId;
    }

    if (!activeParentPackageId) return;

    // Check if the parent package already has a cover
    if (!window.__veloraCustomPackageLogos[activeParentPackageId]) {
      // Look for the first child card with an image
      const childCards = packagesView.querySelectorAll(
        ".vel-parent-package-children .vel-package-card[data-package-id], .vel-parent-package-view .vel-package-card[data-package-id]"
      );

      for (const childCard of childCards) {
        const childId = String(childCard.dataset.packageId || "");
        const childImg = childCard.querySelector("img")?.src || window.__veloraCustomPackageLogos[childId];
        const safeChildImg = safeUrl(childImg);

        if (safeChildImg && !safeChildImg.includes("data:image") && !safeChildImg.includes("transparent.png")) {
          reportDiscoveredCover(activeParentPackageId, safeChildImg);
          break;
        }
      }
    }
  }

  /**
   * Inspect current items/channels when a user views a package or subpackage
   */
  function inspectCurrentPackageItems() {
    const packagesView = document.getElementById("packages-view");
    const contentView = document.getElementById("content-view");
    if (!contentView || contentView.classList.contains("hidden")) return;

    // Detect currently active package ID
    const activePackageCard = packagesView?.querySelector(".vel-package-card.is-active, .vel-package-card[aria-selected='true']");
    const activeSliderCard = document.querySelector(".vel-brand-card.is-active");
    const pickerOption = document.querySelector("#vel-media-package-menu .vel-media-package-picker__option.is-selected");

    const packageId = activeSliderCard?.dataset?.packageId ||
                      activePackageCard?.dataset?.packageId ||
                      pickerOption?.dataset?.packageId ||
                      document.body.dataset.veloraActivePackageId || "";

    if (!packageId) return;

    // Find the first media item image in #dynamic-list or #item-list
    const firstItemImg = document.querySelector(
      "#dynamic-list .media-item img, #item-list .media-item img, #content-view .media-item img, #dynamic-list img, #item-list img"
    );

    const imgSrc = safeUrl(firstItemImg?.src || firstItemImg?.dataset?.src || firstItemImg?.getAttribute("src"));
    if (imgSrc && !imgSrc.includes("data:image") && !imgSrc.includes("transparent.png")) {
      // 1. Report for the subpackage itself if missing
      if (!window.__veloraCustomPackageLogos[packageId]) {
        reportDiscoveredCover(packageId, imgSrc);
      }

      // 2. If this subpackage belongs to a parent package without a cover, assign to parent package too!
      if (activeParentPackageId && !window.__veloraCustomPackageLogos[activeParentPackageId]) {
        reportDiscoveredCover(activeParentPackageId, imgSrc);
      }
    }
  }

  // Intercept click on subpackage cards to link to parent package
  document.addEventListener("click", event => {
    const card = event.target.closest?.(".vel-package-card[data-package-id]");
    if (!card) return;

    const parentContainer = card.closest(".vel-parent-package-children, .vel-parent-package-view");
    const parentId = String(
      document.getElementById("packages-view")?.dataset?.parentPackageId ||
      parentContainer?.dataset?.parentPackageId ||
      ""
    ).trim();

    if (parentId) {
      activeParentPackageId = parentId;
      // If the clicked child card has an image and parent has none, immediately adopt
      const cardImg = safeUrl(card.querySelector("img")?.src || window.__veloraCustomPackageLogos[card.dataset.packageId]);
      if (cardImg && !window.__veloraCustomPackageLogos[parentId]) {
        reportDiscoveredCover(parentId, cardImg);
      }
    }
  }, true);

  // Global helper
  window.veloraReportPackageCover = reportDiscoveredCover;

  // Initialize
  document.addEventListener("DOMContentLoaded", () => {
    loadAllCovers();

    // Observe DOM mutations to catch stream logos & parent package expansions
    const target = document.getElementById("content-view") || document.body;
    const observer = new MutationObserver(() => {
      checkParentPackages();
      inspectCurrentPackageItems();
      applyCoversToDOM();
    });

    observer.observe(target, { childList: true, subtree: true });
    if (document.getElementById("packages-view")) {
      observer.observe(document.getElementById("packages-view"), { childList: true, subtree: true });
    }
  });

  // Start immediately if DOM already loaded
  if (document.readyState !== "loading") {
    loadAllCovers();
  }
})();

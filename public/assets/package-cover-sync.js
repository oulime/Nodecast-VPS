/**
 * VELORA VIP — CROWD-SOURCED PACKAGE & PARENT PACKAGE COVER AUTO-SYNC
 * Automatically discovers, persists, and shares the first channel/subpackage image
 * across all users and browsers for every live, normal, parent, and media package.
 */
(function () {
  "use strict";

  window.__veloraCustomPackageLogos = window.__veloraCustomPackageLogos || {};

  // Instant zero-delay hydration from localStorage on startup/reload
  try {
    const localCached = JSON.parse(localStorage.getItem("velora_package_covers") || "{}");
    if (localCached && typeof localCached === "object") {
      Object.assign(window.__veloraCustomPackageLogos, localCached);
    }
  } catch (_) {}

  const backfillQueue = new Set();
  let flushTimer = null;
  let currentActivePackageId = "";
  let activeParentPackageId = "";

  function safeUrl(url) {
    if (!url || typeof url !== "string") return "";
    let trimmed = url.trim();
    if (!trimmed) return "";
    try {
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        const u = new URL(trimmed);
        if (u.pathname.startsWith("/proxy") || u.pathname.startsWith("/api/proxy") || u.pathname.startsWith("/uploads/") || u.pathname.startsWith("/images/") || u.pathname.startsWith("/logos/")) {
          trimmed = u.pathname + u.search;
        }
      }
    } catch (_) {}
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/uploads/") || trimmed.startsWith("/proxy") || trimmed.startsWith("/api/proxy") || trimmed.startsWith("/images/") || trimmed.startsWith("/logos/")) {
      return trimmed;
    }
    return "";
  }

  let isLoadingCovers = false;
  let coversLoadedOnce = false;

  /**
   * Fetch all server-persisted covers on startup
   */
  async function loadAllCovers(force = false) {
    if (isLoadingCovers) return;
    if (coversLoadedOnce && !force) return;
    isLoadingCovers = true;
    try {
      const response = await fetch("/api/package-covers/all", { cache: "no-cache" });
      if (!response.ok) return;
      const data = await response.json();
      if (data && data.covers) {
        Object.assign(window.__veloraCustomPackageLogos, data.covers);
        try {
          localStorage.setItem("velora_package_covers", JSON.stringify(window.__veloraCustomPackageLogos));
        } catch (_) {}
        coversLoadedOnce = true;
        applyCoversToDOM();
        window.dispatchEvent(new CustomEvent("velora-package-covers-updated", { detail: { covers: window.__veloraCustomPackageLogos } }));
      }
    } catch (_) {
    } finally {
      isLoadingCovers = false;
    }
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
    try {
      localStorage.setItem("velora_package_covers", JSON.stringify(window.__veloraCustomPackageLogos));
    } catch (_) {}

    applyCoversToDOM();
    window.dispatchEvent(new CustomEvent("velora-package-covers-updated", { detail: { covers: window.__veloraCustomPackageLogos } }));

    backfillQueue.add(JSON.stringify({ packageId: cleanId, coverUrl: cleanUrl }));

    if (!flushTimer) {
      flushTimer = window.setTimeout(flushBackfillQueue, 600);
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
   * Scan all package cards currently rendered in the grid
   * If a card already has an image displayed locally, capture and report it!
   */
  function scanPackagesView() {
    const cards = document.querySelectorAll("#packages-view .vel-package-card[data-package-id]");
    cards.forEach(card => {
      const pkgId = String(card.dataset.packageId || "").trim();
      if (!pkgId) return;

      const img = card.querySelector(":scope > img, .vel-package-card__live-logo");
      const src = safeUrl(img?.src || img?.dataset?.src || img?.getAttribute("src"));
      if (src && !src.includes("data:image") && !src.includes("transparent.png")) {
        reportDiscoveredCover(pkgId, src);
      }
    });
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
    const contentView = document.getElementById("content-view");
    if (!contentView || contentView.classList.contains("hidden")) return;

    // Detect active package ID from all sources
    const packageId = currentActivePackageId ||
                      document.body.dataset.veloraActivePackageId ||
                      document.querySelector(".vel-brand-card.is-active")?.dataset?.packageId ||
                      document.querySelector(".vel-package-card.is-active, .vel-package-card[aria-selected='true']")?.dataset?.packageId ||
                      document.querySelector("#vel-media-package-menu .vel-media-package-picker__option.is-selected")?.dataset?.packageId ||
                      "";

    if (!packageId) return;

    // Find the first media item image in #content-view / #item-list / #dynamic-list
    const mediaImgs = document.querySelectorAll(
      "#content-view .media-item img, #item-list .media-item img, #dynamic-list .media-item img, #content-view .media-item__thumb img, #item-list img, #dynamic-list img"
    );

    for (const img of mediaImgs) {
      const imgSrc = safeUrl(img.src || img.dataset.src || img.getAttribute("src"));
      if (imgSrc && !imgSrc.includes("data:image") && !imgSrc.includes("transparent.png")) {
        // 1. Report for this package (normal or subpackage)!
        reportDiscoveredCover(packageId, imgSrc);

        // 2. If this package belongs to a parent package without a cover, assign to parent too!
        if (activeParentPackageId && !window.__veloraCustomPackageLogos[activeParentPackageId]) {
          reportDiscoveredCover(activeParentPackageId, imgSrc);
        }
        break;
      }
    }
  }

  // Intercept click on ANY package card (normal, parent, subpackage, brand slider)
  document.addEventListener("click", event => {
    const card = event.target.closest?.(".vel-package-card[data-package-id], .vel-brand-card[data-package-id]");
    if (!card) return;

    const pkgId = String(card.dataset.packageId || "").trim();
    if (!pkgId) return;

    currentActivePackageId = pkgId;
    document.body.dataset.veloraActivePackageId = pkgId;

    const parentContainer = card.closest(".vel-parent-package-children, .vel-parent-package-view");
    const parentId = String(
      document.getElementById("packages-view")?.dataset?.parentPackageId ||
      parentContainer?.dataset?.parentPackageId ||
      ""
    ).trim();

    if (parentId) {
      activeParentPackageId = parentId;
    } else if (!card.classList.contains("vel-package-card--parent-child")) {
      activeParentPackageId = "";
    }

    // If the card already has an image, report it immediately!
    const existingImg = card.querySelector(":scope > img, .vel-package-card__live-logo, img");
    const cardImg = safeUrl(existingImg?.src || existingImg?.dataset?.src || window.__veloraCustomPackageLogos[pkgId]);
    if (cardImg && !cardImg.includes("data:image") && !cardImg.includes("transparent.png")) {
      reportDiscoveredCover(pkgId, cardImg);
      if (activeParentPackageId && !window.__veloraCustomPackageLogos[activeParentPackageId]) {
        reportDiscoveredCover(activeParentPackageId, cardImg);
      }
    }
  }, true);

  // Global helpers
  window.veloraReportPackageCover = reportDiscoveredCover;
  window.veloraReloadPackageCovers = (force = true) => loadAllCovers(force);
  window.veloraApplyPackageCoversToDOM = applyCoversToDOM;

  // Initialize
  document.addEventListener("DOMContentLoaded", () => {
    loadAllCovers();

    const target = document.getElementById("content-view") || document.body;
    const observer = new MutationObserver(() => {
      scanPackagesView();
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

  window.addEventListener("velora-package-covers-updated", () => {
    applyCoversToDOM();
  });
})();

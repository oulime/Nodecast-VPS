/**
 * VELORA VIP — PACKAGE COVER SYNC
 * Loads and applies server-persisted package covers across all views and sessions.
 * Guarantees that only verified channel logos belonging directly to the package are synced.
 */
(function () {
  "use strict";

  window.__veloraCustomPackageLogos = window.__veloraCustomPackageLogos || {};
  const sentCovers = new Set();

  function safeUrl(url) {
    if (!url || typeof url !== "string") return "";
    let clean = url.trim();
    if (!clean) return "";

    // Unwrap nested /proxy?target= or /api/proxy?target=
    while (clean.includes("/proxy?target=") || clean.includes("/api/proxy?target=")) {
      try {
        const idx = clean.indexOf("target=");
        if (idx !== -1) {
          const rawTarget = clean.slice(idx + 7).split("&")[0];
          const decoded = decodeURIComponent(rawTarget);
          if (decoded && (decoded.startsWith("http://") || decoded.startsWith("https://") || decoded.startsWith("/"))) {
            clean = decoded;
            continue;
          }
        }
      } catch (_) {}
      break;
    }

    // Never accept movie posters (TMDB) as live package covers
    if (clean.includes("image.tmdb.org") || clean.includes("tmdb.org") || clean.includes("/w600_and_h900_bestv2/") || clean.includes("/w500/") || clean.includes("/w300/")) {
      return "";
    }

    // Strip origin if pointing to self proxy
    try {
      if (clean.startsWith("http://") || clean.startsWith("https://")) {
        const u = new URL(clean);
        if (u.pathname.startsWith("/proxy") || u.pathname.startsWith("/api/proxy") || u.pathname.startsWith("/uploads/") || u.pathname.startsWith("/images/") || u.pathname.startsWith("/logos/")) {
          clean = u.pathname + u.search;
        }
      }
    } catch (_) {}

    if (/^https?:\/\//i.test(clean) || clean.startsWith("/uploads/") || clean.startsWith("/proxy") || clean.startsWith("/api/proxy") || clean.startsWith("/images/") || clean.startsWith("/logos/")) {
      return clean;
    }
    return "";
  }

  // Instant zero-delay hydration from localStorage on startup/reload
  try {
    const localCached = JSON.parse(localStorage.getItem("velora_package_covers") || "{}");
    if (localCached && typeof localCached === "object") {
      for (const [id, rawUrl] of Object.entries(localCached)) {
        const clean = safeUrl(rawUrl);
        if (id && clean) {
          window.__veloraCustomPackageLogos[id] = clean;
          sentCovers.add(`${id}:${clean}`);
        }
      }
    }
  } catch (_) {}

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
        for (const [id, rawUrl] of Object.entries(data.covers)) {
          const clean = safeUrl(rawUrl);
          if (id && clean) {
            window.__veloraCustomPackageLogos[id] = clean;
            sentCovers.add(`${id}:${clean}`);
          }
        }
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
   * Verified package cover report function (called only by verified channel discovery)
   */
  function reportDiscoveredCover(packageId, coverUrl) {
    const cleanId = String(packageId || "").trim();
    const cleanUrl = safeUrl(coverUrl);
    if (!cleanId || !cleanUrl) return;

    window.__veloraCustomPackageLogos[cleanId] = cleanUrl;
    try {
      localStorage.setItem("velora_package_covers", JSON.stringify(window.__veloraCustomPackageLogos));
    } catch (_) {}

    applyCoversToDOM();
    window.dispatchEvent(new CustomEvent("velora-package-covers-updated", { detail: { covers: window.__veloraCustomPackageLogos } }));

    const cacheKey = `${cleanId}:${cleanUrl}`;
    if (sentCovers.has(cacheKey)) return;
    sentCovers.add(cacheKey);

    // Send immediately to server (only once per unique cover)
    try {
      fetch("/api/package-covers/auto-backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: cleanId, coverUrl: cleanUrl })
      }).catch(() => {
        sentCovers.delete(cacheKey);
      });
    } catch (_) {
      sentCovers.delete(cacheKey);
    }
  }

  // Global helpers
  window.veloraReportPackageCover = reportDiscoveredCover;
  window.veloraReloadPackageCovers = (force = true) => loadAllCovers(force);
  window.veloraApplyPackageCoversToDOM = applyCoversToDOM;

  // Initialize
  document.addEventListener("DOMContentLoaded", () => {
    loadAllCovers();

    const target = document.getElementById("content-view") || document.body;
    const observer = new MutationObserver(() => {
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

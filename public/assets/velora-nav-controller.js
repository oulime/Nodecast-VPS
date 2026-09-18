/**
 * Velora Universal Navigation Controller
 */
(function () {
  "use strict";

  window.veloraNavigateBack = function () {};

  function cleanupAllActiveMediaAndSessions() {
    try {
      var hasActiveMedia = false;

      // 1. Native app bundle teardown FIRST so Hls.js instances are destroyed properly before touching DOM src
      if (typeof window.veloraStopAllPlayback === "function") {
        try { window.veloraStopAllPlayback(); } catch (_) {}
      }
      if (typeof window.veloraStopVod === "function") {
        try { window.veloraStopVod(); } catch (_) {}
      }
      if (typeof window.veloraStopLive === "function") {
        try { window.veloraStopLive(); } catch (_) {}
      }
      if (typeof window.veloraStopAllStreams === "function") {
        try { window.veloraStopAllStreams(); } catch (_) {}
      }

      // 2. Forcefully abort all HTML5 <video> and <audio> elements in the document
      document.querySelectorAll("video, audio").forEach(function (v) {
        try {
          if (v) {
            if (!v.paused || v.src || v.currentSrc) {
              hasActiveMedia = true;
            }
            v.pause();
            if (v.hls && typeof v.hls.destroy === "function") {
              try { v.hls.stopLoad(); } catch (_) {}
              try { v.hls.destroy(); } catch (_) {}
              v.hls = null;
            }
            v.removeAttribute("src");
            try { v.load(); } catch (_) {}
          }
        } catch (_) {}
      });

      // 3. Hide all player containers
      [
        "player-container",
        "vod-player-container",
        "now-playing",
        "now-playing-vod"
      ].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
          el.classList.add("hidden");
          el.style.removeProperty("display");
        }
      });

      // 4. Adult player teardown
      const isAdultActive = document.body.classList.contains("vel-adult-active") || (document.body.dataset && document.body.dataset.velActiveTab === "adult");
      if (isAdultActive && typeof window.veloraCloseAdultView === "function") {
        try { window.veloraCloseAdultView(false); } catch (_) {}
      }

      // 5. Close active server-side transcode sessions
      if (typeof window.veloraCloseActiveTranscodeSession === "function") {
        try { window.veloraCloseActiveTranscodeSession(); } catch (_) {}
      }

      // 6. Fire instant stream stop beacon only if media was active
      if (hasActiveMedia || isAdultActive || (typeof window.__veloraActiveTranscodeSession !== "undefined" && window.__veloraActiveTranscodeSession)) {
        try {
          const stopUrl = "/api/proxy/stream/stop";
          if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
            navigator.sendBeacon(stopUrl);
          } else {
            fetch(stopUrl, { method: "POST", keepalive: true }).catch(function () {});
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  window.veloraCleanupAllMedia = cleanupAllActiveMediaAndSessions;

  // Cleanup active streams when leaving page, closing tab, or navigating history
  window.addEventListener("pagehide", cleanupAllActiveMediaAndSessions);
  window.addEventListener("beforeunload", cleanupAllActiveMediaAndSessions);
  window.addEventListener("popstate", cleanupAllActiveMediaAndSessions);
  window.addEventListener("hashchange", cleanupAllActiveMediaAndSessions);

  // Global click interceptor for navigation links & bottom tabs
  document.addEventListener("click", function (e) {
    if (!e.target) return;

    // Ignore settings/admin panels, country picker, profile menu, search triggers, or popups
    if (
      e.target.closest(
        "#settings-dialog, .settings-dialog, #settings-tab-football, .vel-foot-admin-panel, #vel-bottom-country-menu, #vel-bottom-profile-menu, #country-select, .country-select, .country-select-trigger, .velora-country-select-menu, [data-bottom-nav='country'], [data-bottom-nav='profile'], #vel-home-profile-trigger, #vel-floating-search, [data-bottom-nav='search']"
      )
    ) {
      return;
    }

    const navEl = e.target.closest(
      ".nav-item, .nav-link, .sidebar-link, .vel-bottom-nav-item, .vel-bottom-nav__button, [data-bottom-nav], [data-nav], [data-home-tab], .vel-nav-btn, .navbar, .header-nav, #btn-home, #btn-live, #btn-movies, #btn-series, #btn-favorites, #btn-adult, #btn-logo-home, #btn-header-home, #btn-back-home, .vod-back-btn, .player-back-btn, #btn-close-player, #btn-close-vod-player, [data-action='back'], [data-action='close-player']"
    );

    if (navEl) {
      const bottomNavAction = navEl.getAttribute("data-bottom-nav") || navEl.getAttribute("data-home-tab");
      const activeTab = document.body.dataset ? document.body.dataset.velActiveTab : "";
      const isHomeTarget =
        bottomNavAction === "home" ||
        navEl.id === "btn-home" ||
        navEl.id === "btn-logo-home" ||
        navEl.id === "btn-header-home" ||
        navEl.id === "btn-back-home";

      const isBackOrClose =
        navEl.id === "btn-close-player" ||
        navEl.id === "btn-close-vod-player" ||
        navEl.id === "btn-back-home" ||
        navEl.classList.contains("player-back-btn") ||
        navEl.classList.contains("vod-back-btn") ||
        navEl.getAttribute("data-action") === "back" ||
        navEl.getAttribute("data-action") === "close-player";

      const isFromFootballOrSearch = Boolean(
        (document.body.dataset && document.body.dataset.veloraReturnFavorites === "search") ||
        (document.body.dataset && document.body.dataset.veloraSearchMediaOpen) ||
        document.getElementById("vel-live-match-banner") ||
        document.getElementById("velora-match-banner") ||
        document.getElementById("vel-football-notice-modal")
      );

      // If currently in football match / search channel playback
      if (isFromFootballOrSearch) {
        delete document.body.dataset.veloraReturnHome;
        delete document.body.dataset.veloraReturnFavorites;
        delete window._veloraFavoriteReturnTab;
        delete document.body.dataset.veloraSearchMediaOpen;
        delete document.body.dataset.veloraReturnAdult;
        const banner = document.getElementById("vel-live-match-banner") || document.getElementById("velora-match-banner");
        if (banner) banner.remove();
        cleanupAllActiveMediaAndSessions();

        if (isHomeTarget || isBackOrClose) {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (_) {}
          if (typeof window.veloraShowHome === "function") {
            window.veloraShowHome();
          } else {
            document.dispatchEvent(new CustomEvent("velora-show-home"));
          }
          return;
        }
      }

      // Check if clicking the same active section tab (e.g. clicking Live while already on Live)
      if (bottomNavAction && bottomNavAction === activeTab && activeTab !== "home") {
        return;
      }
      if (bottomNavAction && bottomNavAction !== "home") {
        delete document.body.dataset.veloraReturnHome;
        delete document.body.dataset.veloraReturnFavorites;
        delete window._veloraFavoriteReturnTab;
        delete document.body.dataset.veloraSearchMediaOpen;
        delete document.body.dataset.veloraReturnAdult;
      }
      // If clicking home, major section tab switch, or back button, kill any playing media immediately
      cleanupAllActiveMediaAndSessions();
    }
  }, true);

  // MutationObserver to auto-stop adult video as soon as adult view is hidden or body tab changes
  try {
    const observer = new MutationObserver(function () {
      const activeTab = document.body.dataset ? document.body.dataset.velActiveTab : "";
      const adultActive = document.body.classList.contains("vel-adult-active");
      const adultView = document.getElementById("adult-view");
      const adultViewHidden = !adultView || adultView.classList.contains("hidden") || adultView.style.display === "none";

      if ((!adultActive || activeTab !== "adult" || adultViewHidden)) {
        const adultVideo = document.getElementById("vel-adult-video");
        if (adultVideo && !adultVideo.paused) {
          console.log("[Velora Nav] Adult view hidden/inactive while video playing: stopping adult stream immediately.");
          try {
            adultVideo.pause();
            if (adultVideo.hls && typeof adultVideo.hls.destroy === "function") {
              try { adultVideo.hls.stopLoad(); } catch (_) {}
              try { adultVideo.hls.destroy(); } catch (_) {}
              adultVideo.hls = null;
            }
            adultVideo.removeAttribute("src");
            try { adultVideo.load(); } catch (_) {}
          } catch (_) {}
        }
      }
    });

    observer.observe(document.body, { attributes: true, attributeFilter: ["class", "data-vel-active-tab", "data-vel-top-level"] });
  } catch (_) {}
})();

/**
 * Velora Universal Navigation Controller
 */
(function () {
  "use strict";

  window.veloraNavigateBack = function () {};

  function cleanupAllActiveMediaAndSessions() {
    try {
      var hasActiveMedia = false;

      // 1. Forcefully abort all HTML5 <video> and <audio> elements in the document
      document.querySelectorAll("video, audio").forEach(function (v) {
        try {
          if (v && (!v.paused || v.src || v.currentSrc)) {
            hasActiveMedia = true;
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

      // 2. Native app bundle teardown
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

      // 3. Adult player teardown
      const isAdultActive = document.body.classList.contains("vel-adult-active") || (document.body.dataset && document.body.dataset.velActiveTab === "adult");
      if (isAdultActive && typeof window.veloraCloseAdultView === "function") {
        try { window.veloraCloseAdultView(false); } catch (_) {}
      }

      // 4. Close active server-side transcode sessions
      if (typeof window.veloraCloseActiveTranscodeSession === "function") {
        try { window.veloraCloseActiveTranscodeSession(); } catch (_) {}
      }

      // 5. Fire instant stream stop beacon only if media was active
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
      ".nav-item, .nav-link, .sidebar-link, .vel-bottom-nav-item, .vel-bottom-nav__button, [data-bottom-nav], [data-nav], [data-home-tab], .vel-nav-btn, .navbar, .header-nav, #btn-home, #btn-live, #btn-movies, #btn-series, #btn-favorites, #btn-adult, .vod-back-btn, .player-back-btn, [data-action='back'], [data-action='close-player']"
    );

    if (navEl) {
      const bottomNavAction = navEl.getAttribute("data-bottom-nav") || navEl.getAttribute("data-home-tab");
      const activeTab = document.body.dataset ? document.body.dataset.velActiveTab : "";
      const isFromFootballOrSearch = Boolean(
        (document.body.dataset && document.body.dataset.veloraReturnFavorites === "search") ||
        (document.body.dataset && document.body.dataset.veloraSearchMediaOpen) ||
        document.getElementById("vel-live-match-banner") ||
        document.getElementById("velora-match-banner") ||
        document.getElementById("vel-football-notice-modal")
      );

      // If currently in football match / search channel playback, clicking any nav tab (including TV) must forcefully stop playback and cleanup
      if (isFromFootballOrSearch) {
        delete document.body.dataset.veloraReturnHome;
        delete document.body.dataset.veloraReturnFavorites;
        delete window._veloraFavoriteReturnTab;
        delete document.body.dataset.veloraSearchMediaOpen;
        delete document.body.dataset.veloraReturnAdult;
        const banner = document.getElementById("vel-live-match-banner") || document.getElementById("velora-match-banner");
        if (banner) banner.remove();
        cleanupAllActiveMediaAndSessions();
        return;
      }

      // Check if clicking the same active section tab (e.g. clicking Live while already on Live)
      if (bottomNavAction && bottomNavAction === activeTab && activeTab !== "home") {
        // Already on this section tab, do not kill playing media
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

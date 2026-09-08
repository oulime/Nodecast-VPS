/**
 * Velora Universal Navigation Controller
 */
(function () {
  "use strict";

  window.veloraNavigateBack = function () {};

  function cleanupAllActiveMediaAndSessions() {
    try {
      // 1. Close and stop adult player and all adult streams
      if (typeof window.veloraStopAllStreams === "function") {
        try { window.veloraStopAllStreams(); } catch (_) {}
      }
      if (typeof window.veloraCloseAdultView === "function") {
        try { window.veloraCloseAdultView(); } catch (_) {}
      }

      // 2. Close active transcode sessions on the server
      if (typeof window.veloraCloseActiveTranscodeSession === "function") {
        try { window.veloraCloseActiveTranscodeSession(); } catch (_) {}
      }

      // 3. Stop all HTML5 <video> and <audio> elements in the entire document
      document.querySelectorAll("video, audio").forEach(function (v) {
        try {
          if (v && !v.paused) {
            v.pause();
          }
          if (v && v.hls && typeof v.hls.destroy === "function") {
            try { v.hls.stopLoad(); } catch (_) {}
            try { v.hls.destroy(); } catch (_) {}
            v.hls = null;
          }
          if (v && v.id === "vel-adult-video") {
            v.removeAttribute("src");
            try { v.load(); } catch (_) {}
          }
        } catch (_) {}
      });
    } catch (_) {}
  }

  window.veloraCleanupAllMedia = cleanupAllActiveMediaAndSessions;

  // Cleanup active streams when leaving page or changing route
  window.addEventListener("pagehide", cleanupAllActiveMediaAndSessions);
  window.addEventListener("beforeunload", cleanupAllActiveMediaAndSessions);
  window.addEventListener("popstate", cleanupAllActiveMediaAndSessions);
  window.addEventListener("hashchange", cleanupAllActiveMediaAndSessions);

  // Global click interceptor for navigation links & bottom tabs
  document.addEventListener("click", function (e) {
    if (!e.target) return;
    const navEl = e.target.closest(
      "nav, .nav-item, .nav-link, .sidebar-link, .vel-bottom-nav-item, [data-nav], [data-tab], [data-settings-tab], .vel-nav-btn, .navbar, .header-nav, #btn-home, #btn-live, #btn-movies, #btn-series, #btn-favorites"
    );
    if (navEl) {
      // If clicking away from adult, immediately kill adult video stream
      const isAdultNav = navEl.id === "btn-adult" || (navEl.dataset && (navEl.dataset.tab === "adult" || navEl.dataset.nav === "adult"));
      if (!isAdultNav) {
        cleanupAllActiveMediaAndSessions();
      }
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


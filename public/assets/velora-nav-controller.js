/**
 * Velora Universal Navigation Controller
 */
(function () {
  "use strict";

  window.veloraNavigateBack = function () {};

  function cleanupAllActiveMediaAndSessions() {
    try {
      // 1. Native app bundle teardown
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

      // 2. Adult player teardown
      const isAdultActive = document.body.classList.contains("vel-adult-active") || (document.body.dataset && document.body.dataset.velActiveTab === "adult");
      if (isAdultActive && typeof window.veloraCloseAdultView === "function") {
        try { window.veloraCloseAdultView(false); } catch (_) {}
      }

      // 3. Close active server-side transcode sessions
      if (typeof window.veloraCloseActiveTranscodeSession === "function") {
        try { window.veloraCloseActiveTranscodeSession(); } catch (_) {}
      }

      // 4. Forcefully abort all HTML5 <video> and <audio> elements in the document
      // Removing src and calling .load() immediately causes the browser to send a TCP FIN/RST
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
          v.removeAttribute("src");
          try { v.load(); } catch (_) {}
        } catch (_) {}
      });

      // 5. Fire instant stream stop beacon to backend proxy
      try {
        const stopUrl = "/api/proxy/stream/stop";
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          navigator.sendBeacon(stopUrl);
        } else {
          fetch(stopUrl, { method: "POST", keepalive: true }).catch(function () {});
        }
      } catch (_) {}
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

    const navEl = e.target.closest(
      "nav, .nav-item, .nav-link, .sidebar-link, .vel-bottom-nav-item, [data-nav], [data-tab], [data-settings-tab], .vel-nav-btn, .navbar, .header-nav, #btn-home, #btn-live, #btn-movies, #btn-series, #btn-favorites, #btn-adult, .vod-back-btn, .player-back-btn, [data-action='back'], [data-action='close-player']"
    );

    if (navEl) {
      // If clicking home, major section tab, or back button, kill any playing media immediately
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


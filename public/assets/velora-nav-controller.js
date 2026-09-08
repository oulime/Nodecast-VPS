/**
 * Velora Universal Navigation Controller
 */
(function () {
  "use strict";

  window.veloraNavigateBack = function () {};

  function cleanupActiveSession() {
    try {
      if (typeof window.veloraCloseActiveTranscodeSession === "function") {
        window.veloraCloseActiveTranscodeSession();
      }
    } catch (_) {}
  }

  // Cleanup active transcode sessions when leaving page or changing route
  window.addEventListener("pagehide", cleanupActiveSession);
  window.addEventListener("beforeunload", cleanupActiveSession);
  window.addEventListener("popstate", cleanupActiveSession);
})();


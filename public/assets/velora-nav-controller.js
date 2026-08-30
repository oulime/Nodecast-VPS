/**
 * Velora Universal Navigation Controller
 * Simple, natural Back navigation that goes back to where you were (window.history.back).
 */
(function () {
  "use strict";

  var lastBackTime = 0;

  function stopAllMedia() {
    try {
      if (typeof window.veloraStopAllPlayback === "function") {
        try { window.veloraStopAllPlayback(); } catch (_) {}
      }
      document.querySelectorAll("video, audio").forEach(function (media) {
        try {
          media.pause();
          media.muted = true;
          if (media.hls && typeof media.hls.destroy === "function") {
            try { media.hls.destroy(); } catch (_) {}
            media.hls = null;
          }
          media.removeAttribute("src");
          media.load();
        } catch (_) {}
      });
      if (window.hls && typeof window.hls.destroy === "function") {
        try { window.hls.destroy(); } catch (_) {}
        window.hls = null;
      }
    } catch (_) {}
  }

  function handleBack(event) {
    if (event) {
      try {
        if (typeof event.preventDefault === "function") event.preventDefault();
        if (typeof event.stopPropagation === "function") event.stopPropagation();
      } catch (_) {}
    }

    var now = Date.now();
    if (now - lastBackTime < 200) return;
    lastBackTime = now;

    // 1. Close search modal if open
    var searchModal = document.getElementById("vel-global-search");
    if (searchModal && !searchModal.classList.contains("hidden")) {
      var searchClose = document.getElementById("vel-global-search-close");
      if (searchClose) searchClose.click();
      else searchModal.classList.add("hidden");
      return;
    }

    // 2. Close favorites page if open
    if (document.body.classList.contains("vel-favorites-open")) {
      if (typeof window.veloraCloseFavoritesPage === "function") {
        window.veloraCloseFavoritesPage(true);
      } else {
        document.dispatchEvent(new CustomEvent("velora-show-home"));
      }
      return;
    }

    // 3. Natural browser back
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    // Fallback if no history
    var contentView = document.getElementById("content-view");
    if (contentView && !contentView.classList.contains("hidden")) {
      if (typeof window.veloraAppGoBack === "function") window.veloraAppGoBack();
      else {
        contentView.classList.add("hidden");
        var pkg = document.getElementById("packages-view");
        if (pkg) pkg.classList.remove("hidden");
      }
      return;
    }
    document.dispatchEvent(new CustomEvent("velora-show-home"));
  }

  window.veloraNavigateBack = handleBack;

  // React to browser history popstate (when window.history.back() or browser back button is pressed)
  window.addEventListener("popstate", function () {
    var contentView = document.getElementById("content-view");
    var packagesView = document.getElementById("packages-view");
    var livePlayer = document.getElementById("player-container");
    var vodPlayer = document.getElementById("vod-player-container");

    // If inside content/channel player -> close player and restore packages view
    if (contentView && !contentView.classList.contains("hidden")) {
      stopAllMedia();
      if (typeof window.veloraAppGoBack === "function") {
        window.veloraAppGoBack();
      } else {
        contentView.classList.add("hidden");
        if (livePlayer) livePlayer.classList.add("hidden");
        if (vodPlayer) vodPlayer.classList.add("hidden");
        if (packagesView) {
          packagesView.classList.remove("hidden");
          packagesView.setAttribute("aria-hidden", "false");
        }
      }
      return;
    }

    // If inside parent package -> close parent package
    if (typeof window.__velCloseParentPackage === "function" && (document.body.classList.contains("vel-parent-package-open") || (packagesView && packagesView.dataset.parentPackageId))) {
      window.__velCloseParentPackage();
      return;
    }

    // If on packages view -> return to home
    if (typeof window.veloraShowHome === "function") {
      window.veloraShowHome();
    } else {
      document.dispatchEvent(new CustomEvent("velora-show-home"));
    }
  }, true);

  // Catch clicks on ANY back button in the UI
  document.addEventListener("click", function (event) {
    var backBtn = event.target && event.target.closest("#btn-header-back, .vel-header-back-btn, .vel-parent-package-bar__back, .vel-parent-package-view__back, #btn-back-home, .vel-vod-detail-back, [data-vel-nav-back]");
    if (backBtn) {
      handleBack(event);
    }
  }, true);

  document.addEventListener("pointerdown", function (event) {
    if (event.button !== 0) return;
    var backBtn = event.target && event.target.closest("#btn-header-back, .vel-header-back-btn, .vel-parent-package-bar__back, .vel-parent-package-view__back, #btn-back-home, .vel-vod-detail-back, [data-vel-nav-back]");
    if (backBtn) {
      handleBack(event);
    }
  }, true);

  // TV Remote Back Keys
  document.addEventListener("keydown", function (event) {
    var isBackKey = event.key === "Escape" ||
                    event.key === "Backspace" ||
                    event.key === "BrowserBack" ||
                    event.key === "GoBack" ||
                    event.keyCode === 8 ||
                    event.keyCode === 27 ||
                    event.keyCode === 461 ||
                    event.keyCode === 10009;

    if (!isBackKey) return;

    var target = event.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
      if (event.key === "Backspace" || event.keyCode === 8) return;
    }

    handleBack(event);
  }, true);
})();

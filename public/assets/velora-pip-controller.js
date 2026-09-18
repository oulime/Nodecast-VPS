/**
 * Velora VIP — Global Auto Picture-in-Picture (PiP) Controller
 * Ensures Auto-PiP is active on all players (Live TV, Movies, Series, Adult VOD)
 * even when not in fullscreen when the user switches apps or hits Home on mobile.
 */
(() => {
  "use strict";

  // 1. Prevent any legacy or dynamic code from disabling Picture-in-Picture
  try {
    if (typeof HTMLVideoElement !== "undefined" && HTMLVideoElement.prototype) {
      Object.defineProperty(HTMLVideoElement.prototype, "disablePictureInPicture", {
        get: function () {
          return false;
        },
        set: function (_val) {
          // Intentionally ignore attempts to disable PiP
        },
        configurable: true,
        enumerable: true
      });
    }
  } catch (e) {
    console.warn("[Velora PiP] Could not override disablePictureInPicture property:", e);
  }

  // 2. Prepare and enable PiP attributes on a video element
  function setupVideoForAutoPiP(video) {
    if (!video || !(video instanceof HTMLVideoElement)) return;

    try {
      video.removeAttribute("disablepictureinpicture");
      video.setAttribute("autopictureinpicture", "true");
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.autoPictureInPicture = true;
    } catch (_) {}
  }

  // Scan all existing video elements in document
  function setupAllVideos() {
    try {
      const videos = document.querySelectorAll("video");
      videos.forEach(setupVideoForAutoPiP);
    } catch (_) {}
  }

  // Find currently active playing video
  function getActivePlayingVideo() {
    try {
      const videos = Array.from(document.querySelectorAll("video"));
      // Find the first video that is playing (not paused, not ended, has frames)
      const playing = videos.find(v => {
        return !v.paused && !v.ended && v.readyState >= 2 && v.currentTime > 0;
      });
      if (playing) return playing;

      // Fallback: any video not paused
      return videos.find(v => !v.paused && !v.ended) || null;
    } catch (_) {
      return null;
    }
  }

  // 3. Trigger PiP on backgrounding / switching app / home button
  let lastPipAttempt = 0;
  function triggerAutoPiP() {
    const now = Date.now();
    if (now - lastPipAttempt < 500) return; // Debounce rapid visibility changes
    lastPipAttempt = now;

    const video = getActivePlayingVideo();
    if (!video) return;

    setupVideoForAutoPiP(video);

    // Standard HTML5 Picture-in-Picture API (Chrome Android, Desktop Chrome/Edge)
    if (typeof video.requestPictureInPicture === "function") {
      if (!document.pictureInPictureElement) {
        try {
          const promise = video.requestPictureInPicture();
          if (promise && typeof promise.catch === "function") {
            promise.catch(() => {
              // Browser may restrict if not permitted or handled by native autoPictureInPicture
            });
          }
        } catch (_) {}
      }
      return;
    }

    // WebKit / iOS Safari Picture-in-Picture API
    if (video.webkitSupportsPresentationMode && typeof video.webkitSetPresentationMode === "function") {
      if (video.webkitPresentationMode !== "picture-in-picture") {
        try {
          video.webkitSetPresentationMode("picture-in-picture");
        } catch (_) {}
      }
    }
  }

  // 4. Global Event Listeners for Visibility / Pagehide
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      triggerAutoPiP();
    }
  });

  window.addEventListener("pagehide", () => {
    triggerAutoPiP();
  });

  window.addEventListener("blur", () => {
    // On some mobile browsers, pressing Home triggers window blur before visibilitychange
    if (document.visibilityState === "hidden" || !document.hasFocus()) {
      triggerAutoPiP();
    }
  });

  // Track video play events in capture phase
  document.addEventListener("play", (e) => {
    if (e.target && e.target instanceof HTMLVideoElement) {
      setupVideoForAutoPiP(e.target);
    }
  }, true);

  document.addEventListener("playing", (e) => {
    if (e.target && e.target instanceof HTMLVideoElement) {
      setupVideoForAutoPiP(e.target);
    }
  }, true);

  document.addEventListener("loadedmetadata", (e) => {
    if (e.target && e.target instanceof HTMLVideoElement) {
      setupVideoForAutoPiP(e.target);
    }
  }, true);

  // 5. Watch DOM mutations for dynamic video elements
  try {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLVideoElement) {
            setupVideoForAutoPiP(node);
          } else if (node.querySelectorAll) {
            node.querySelectorAll("video").forEach(setupVideoForAutoPiP);
          }
        }
      }
    });

    if (document.documentElement) {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true
        });
      });
    }
  } catch (_) {}

  // 6. Initial setup
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupAllVideos);
  } else {
    setupAllVideos();
  }

  // Export helper globally
  window.veloraPiP = {
    setup: setupVideoForAutoPiP,
    triggerAutoPiP: triggerAutoPiP,
    getActiveVideo: getActivePlayingVideo
  };
})();

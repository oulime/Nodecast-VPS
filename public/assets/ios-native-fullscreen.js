(function () {
  "use strict";

  function isIPhoneOrIPad() {
    var userAgent = navigator.userAgent || "";
    return (
      /iPad|iPhone|iPod/i.test(userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  }

  function lockLandscapeAfterFullscreenStarts() {
    var orientation = window.screen && window.screen.orientation;
    if (!orientation || typeof orientation.lock !== "function") return;

    Promise.resolve(orientation.lock("landscape")).catch(function () {
      // Native iPhone video fullscreen still follows physical device rotation.
    });
  }

  function unlockOrientationAfterFullscreenEnds() {
    var orientation = window.screen && window.screen.orientation;
    if (!orientation || typeof orientation.unlock !== "function") return;

    try {
      orientation.unlock();
    } catch (_) {
      // Safari may not expose orientation unlock outside installed web apps.
    }
  }

  function enterNativeFullscreen(video) {
    if (!video || typeof video.webkitEnterFullscreen !== "function") return false;

    video.addEventListener(
      "webkitbeginfullscreen",
      lockLandscapeAfterFullscreenStarts,
      { once: true }
    );
    video.addEventListener(
      "webkitendfullscreen",
      unlockOrientationAfterFullscreenEnds,
      { once: true }
    );

    try {
      video.webkitEnterFullscreen();
      return true;
    } catch (_) {
      video.removeEventListener(
        "webkitbeginfullscreen",
        lockLandscapeAfterFullscreenStarts
      );
      video.removeEventListener(
        "webkitendfullscreen",
        unlockOrientationAfterFullscreenEnds
      );
      return false;
    }
  }

  if (!isIPhoneOrIPad()) return;

  document.addEventListener(
    "click",
    function (event) {
      var button =
        event.target instanceof Element
          ? event.target.closest("#live-ctl-fullscreen, #vod-ctl-fullscreen")
          : null;
      if (!button) return;

      var video =
        button.id === "live-ctl-fullscreen"
          ? document.getElementById("video")
          : document.getElementById("video-vod");

      if (!enterNativeFullscreen(video)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true
  );
})();

(function () {
  "use strict";

  var tvState = {
    hasPairedTv: false,
    isOnline: false,
    deviceId: null,
    deviceName: null,
    currentMedia: null,
    lastPhoneMedia: null,
    lastChecked: 0,
    checkInterval: null
  };

  function getAuthToken() {
    try {
      return localStorage.getItem("authToken") || "";
    } catch (_) {
      return "";
    }
  }

  function authHeaders() {
    var token = getAuthToken();
    var h = { "Content-Type": "application/json", Accept: "application/json" };
    if (token) h.Authorization = "Bearer " + token;
    return h;
  }

  function isAutoDiffuseOn() {
    try {
      var val = localStorage.getItem("velora_tv_auto_diffuse");
      if (val === null) return true; // Default to ON when TV is connected
      return val === "true" || val === "1";
    } catch (_) {
      return true;
    }
  }

  function shouldSuppressMobilePlayback() {
    return !!(tvState.hasPairedTv && tvState.isOnline && isAutoDiffuseOn());
  }

  function isMobilePlayerElement(el) {
    if (!el || !(el instanceof Element)) return false;
    var tag = el.tagName ? el.tagName.toUpperCase() : "";
    if (tag !== "VIDEO" && tag !== "AUDIO") return false;
    if (el.id === "video" || el.id === "video-vod") return true;
    return !!(el.closest && (el.closest("#player-container") || el.closest("#vod-player-container") || el.closest(".video-wrapper")));
  }

  function textFrom(selectors) {
    for (var i = 0; i < selectors.length; i += 1) {
      var node = document.querySelector(selectors[i]);
      var text = node && String(node.textContent || "").trim();
      if (text) return text;
    }
    return "";
  }

  function getPageMediaTitle(v) {
    return textFrom([
      "#watch-title",
      "#watch-content-title",
      "#player-channel-name",
      "#now-playing-vod",
      "#now-playing",
      ".vel-player-title",
      ".vel-media-title",
      ".channel-name",
      ".program-title"
    ]) || (v && v.getAttribute("aria-label")) || (v && v.getAttribute("data-title")) || document.title || "Vidéo";
  }

  function getPageMediaPoster(v) {
    var candidates = [
      v && v.getAttribute("poster"),
      v && v.getAttribute("data-poster"),
      document.getElementById("watch-poster") && document.getElementById("watch-poster").getAttribute("src"),
      document.querySelector(".movie-poster img") && document.querySelector(".movie-poster img").getAttribute("src"),
      document.querySelector(".series-poster img") && document.querySelector(".series-poster img").getAttribute("src"),
      document.querySelector(".vel-vod-detail img") && document.querySelector(".vel-vod-detail img").getAttribute("src")
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var url = candidates[i];
      if (url && typeof url === "string" && url.trim() && !/^data:/i.test(url)) {
        if (url.indexOf("/") === 0) return window.location.origin + url;
        return url;
      }
    }
    return "";
  }

  function extractActiveMobileMedia(overrideVideo) {
    var vodContainer = document.getElementById("vod-player-container");
    var liveContainer = document.getElementById("player-container");
    var isVodVisible = vodContainer && !vodContainer.classList.contains("hidden");
    var isLiveVisible = liveContainer && !liveContainer.classList.contains("hidden");

    var v = overrideVideo;
    if (!v) {
      var allVideos = Array.prototype.slice.call(document.querySelectorAll("video"));
      v = allVideos.find(function (el) {
        return el && !el.paused && !el.ended && (el.currentTime > 0 || el.readyState > 0);
      });
      if (!v && isVodVisible) v = document.getElementById("video-vod");
      if (!v && isLiveVisible) v = document.getElementById("video");
      if (!v && allVideos.length) v = allVideos[0];
    }

    var app = window.app || {};
    var appUrl = (app.pages && app.pages.watch && app.pages.watch.currentUrl) || (app.player && app.player.currentUrl);

    var rawUrl = (
      (v && v.__veloraCastUrl) ||
      (v && v.hls && v.hls.url) ||
      (window.hls && window.hls.url) ||
      window.__veloraCurrentStreamUrl ||
      appUrl ||
      (v && v.currentSrc && !/^(blob:|data:|about:|mediastream:)/i.test(v.currentSrc) ? v.currentSrc : "") ||
      (v && v.src && !/^(blob:|data:|about:|mediastream:)/i.test(v.src) ? v.src : "") ||
      (tvState.lastPhoneMedia && tvState.lastPhoneMedia.url)
    );

    if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim() || /^(blob:|data:|about:|mediastream:)/i.test(rawUrl)) {
      return tvState.lastPhoneMedia || null;
    }

    var fullUrl = rawUrl.trim();
    if (fullUrl.indexOf("/") === 0) fullUrl = window.location.origin + fullUrl;

    var title = getPageMediaTitle(v) || (tvState.lastPhoneMedia && tvState.lastPhoneMedia.title) || "Vidéo";
    var poster = getPageMediaPoster(v) || (tvState.lastPhoneMedia && tvState.lastPhoneMedia.poster) || "";
    var isLive = isLiveVisible || (v && v.id === "video") || /\.m3u8/i.test(fullUrl) && !/\.(mp4|mkv|mov|avi)/i.test(fullUrl);
    var position = (v && Number.isFinite(v.currentTime) && v.currentTime > 0) ? v.currentTime : 0;
    var duration = (v && Number.isFinite(v.duration) && v.duration > 0) ? v.duration : 0;

    var media = {
      url: fullUrl,
      title: title,
      name: title,
      poster: poster,
      isLive: isLive,
      type: isLive ? "live" : "vod",
      position: isLive ? 0 : position,
      duration: isLive ? 0 : duration,
      streamId: (v && v.dataset && (v.dataset.streamId || v.dataset.id)) || (tvState.lastPhoneMedia && tvState.lastPhoneMedia.streamId) || null,
      seriesId: (v && v.dataset && v.dataset.seriesId) || (tvState.lastPhoneMedia && tvState.lastPhoneMedia.seriesId) || null,
      episodeStreamId: (v && v.dataset && v.dataset.episodeStreamId) || (tvState.lastPhoneMedia && tvState.lastPhoneMedia.episodeStreamId) || null
    };

    tvState.lastPhoneMedia = media;
    return media;
  }

  function haltMobilePlayers() {
    try {
      if (typeof window.veloraCloseActiveTranscodeSession === "function") {
        window.veloraCloseActiveTranscodeSession();
      }
    } catch (_) {}

    var liveContainer = document.getElementById("player-container");
    if (liveContainer) liveContainer.classList.add("hidden");
    var vodContainer = document.getElementById("vod-player-container");
    if (vodContainer) vodContainer.classList.add("hidden");

    var vElements = [document.getElementById("video-vod"), document.getElementById("video")];
    document.querySelectorAll("video, audio").forEach(function (v) {
      if (vElements.indexOf(v) === -1) vElements.push(v);
    });

    vElements.forEach(function (v) {
      if (!v) return;
      try {
        v.pause();
        v.muted = true;
        if (shouldSuppressMobilePlayback()) {
          v.removeAttribute("src");
          v.load();
        }
      } catch (_) {}
    });
  }

  function installPlaybackProtections() {
    if (window.__veloraTvPlaybackProtectionsInstalled) return;
    window.__veloraTvPlaybackProtectionsInstalled = true;

    // 1. Intercept HTMLMediaElement.prototype.play
    var origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (shouldSuppressMobilePlayback() && isMobilePlayerElement(this)) {
        try {
          var activeMedia = extractActiveMobileMedia(this);
          this.pause();
          this.muted = true;
          this.removeAttribute("src");
          this.load();
          if (activeMedia && activeMedia.url) {
            sendToTv(activeMedia);
          }
        } catch (_) {}
        return Promise.resolve();
      }
      return origPlay.apply(this, arguments);
    };

    // 2. Intercept HTMLMediaElement.prototype.src
    try {
      var srcDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
      if (srcDesc && srcDesc.set && srcDesc.get) {
        Object.defineProperty(HTMLMediaElement.prototype, "src", {
          get: function () {
            return srcDesc.get.call(this);
          },
          set: function (val) {
            if (val && typeof val === "string" && !/^(blob:|data:|about:|mediastream:)/i.test(val)) {
              window.__veloraCurrentStreamUrl = val;
              tvState.lastPhoneMedia = {
                url: val,
                title: getPageMediaTitle(this),
                poster: getPageMediaPoster(this),
                type: (this && this.id === "video") ? "live" : "vod",
                isLive: (this && this.id === "video"),
                position: (this && Number.isFinite(this.currentTime)) ? this.currentTime : 0
              };
            }
            if (shouldSuppressMobilePlayback() && isMobilePlayerElement(this) && val) {
              try {
                this.pause();
                this.muted = true;
                var mediaToDiffuse = {
                  url: val,
                  title: getPageMediaTitle(this),
                  poster: getPageMediaPoster(this),
                  type: (this && this.id === "video") ? "live" : "vod",
                  isLive: (this && this.id === "video"),
                  position: (this && Number.isFinite(this.currentTime)) ? this.currentTime : 0
                };
                sendToTv(mediaToDiffuse);
              } catch (_) {}
              return;
            }
            return srcDesc.set.call(this, val);
          },
          configurable: true,
          enumerable: true
        });
      }
    } catch (_) {}

    // 3. Intercept Element.prototype.setAttribute for 'src'
    try {
      var origSetAttr = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (name, value) {
        if (name && String(name).toLowerCase() === "src" && value && typeof value === "string" && !/^(blob:|data:|about:|mediastream:)/i.test(value)) {
          window.__veloraCurrentStreamUrl = value;
        }
        if (name && String(name).toLowerCase() === "src" && shouldSuppressMobilePlayback() && isMobilePlayerElement(this) && value) {
          try {
            this.pause();
            this.muted = true;
            var mediaToDiffuse = {
              url: value,
              title: getPageMediaTitle(this),
              poster: getPageMediaPoster(this),
              type: (this && this.id === "video") ? "live" : "vod",
              isLive: (this && this.id === "video"),
              position: (this && Number.isFinite(this.currentTime)) ? this.currentTime : 0
            };
            sendToTv(mediaToDiffuse);
          } catch (_) {}
          return;
        }
        return origSetAttr.apply(this, arguments);
      };
    } catch (_) {}

    // 4. Capture media playback events on window to immediately silence background mobile decoding
    var captureMediaEvents = ["play", "playing", "loadstart", "loadeddata", "canplay"];
    captureMediaEvents.forEach(function (evt) {
      window.addEventListener(evt, function (e) {
        if (e.target && isMobilePlayerElement(e.target)) {
          var targetEl = e.target;
          var curSrc = targetEl.currentSrc || targetEl.src || targetEl.__veloraCastUrl;
          if (curSrc && !/^(blob:|data:|about:|mediastream:)/i.test(curSrc)) {
            window.__veloraCurrentStreamUrl = curSrc;
            tvState.lastPhoneMedia = {
              url: curSrc,
              title: getPageMediaTitle(targetEl),
              poster: getPageMediaPoster(targetEl),
              type: (targetEl.id === "video") ? "live" : "vod",
              isLive: (targetEl.id === "video"),
              position: targetEl.currentTime || 0
            };
          }
        }
        if (shouldSuppressMobilePlayback() && isMobilePlayerElement(e.target)) {
          try {
            var m = extractActiveMobileMedia(e.target);
            e.target.pause();
            e.target.muted = true;
            e.target.removeAttribute("src");
            e.target.load();
            if (m && m.url && (!tvState.currentMedia || tvState.currentMedia.url !== m.url)) {
              sendToTv(m);
            }
          } catch (_) {}
        }
      }, true);
    });
  }

  async function setAutoDiffuse(enabled) {
    try {
      localStorage.setItem("velora_tv_auto_diffuse", enabled ? "true" : "false");
    } catch (_) {}

    // Instantly visually toggle all segmented buttons in DOM
    document.querySelectorAll(".vel-tv-segment-btn[data-mode='phone'], #vel-profile-mode-phone").forEach(function (el) {
      el.classList.toggle("is-active", !enabled);
    });
    document.querySelectorAll(".vel-tv-segment-btn[data-mode='tv'], #vel-profile-mode-tv").forEach(function (el) {
      el.classList.toggle("is-active", enabled);
    });

    if (enabled) {
      // Switched to TV: Extract what is currently running on the phone and send to TV
      var activeMedia = extractActiveMobileMedia();
      if (activeMedia && activeMedia.url && tvState.hasPairedTv && tvState.isOnline) {
        haltMobilePlayers();
        showTvToast("Diffusion vers la Smart TV…");
        await sendToTv(activeMedia);
      } else {
        haltMobilePlayers();
        showTvToast("Diffusion vers la Smart TV activée");
      }
    } else {
      // Switched to Phone: Keep TV streaming uninterrupted in the background, route future mobile playback locally
      showTvToast("Lecture locale sur téléphone activée");
    }

    syncActiveTvBar();
    renderTvSettingsSection();
  }

  // Export stop TV diffusion function so Cast can stop paired TV playback
  window.veloraStopTvAssociationDiffusion = async function () {
    if (tvState.currentMedia && tvState.currentMedia.state !== "stopped") {
      try {
        await fetch("/api/tv/command", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ action: "stop" })
        });
      } catch (_) {}
      tvState.currentMedia = null;
      saveCachedTvStatus();
      syncActiveTvBar();
      renderTvSettingsSection();
    }
  };

  // Inject scoped styles for TV settings, floating island bar, and controls
  function injectStyles() {
    if (document.getElementById("velora-tv-bridge-styles")) return;
    var style = document.createElement("style");
    style.id = "velora-tv-bridge-styles";
    style.textContent = `
      /* TV Section inside Profile Modal */
      .vel-profile-tv-card {
        margin-top: 18px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(167, 139, 250, 0.2);
        border-radius: 16px;
        padding: 16px 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        text-align: left;
      }
      .vel-profile-tv-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .vel-profile-tv-title {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 1px;
        color: #a78bfa;
        text-transform: uppercase;
      }
      .vel-profile-tv-status-badge {
        font-size: 11px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.1);
        color: #94a3b8;
      }
      .vel-profile-tv-status-badge.is-online {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
        border: 1px solid rgba(34, 197, 94, 0.3);
      }
      .vel-profile-tv-desc {
        font-size: 13px;
        color: #94a3b8;
        line-height: 1.45;
        margin: 0;
      }
      .vel-profile-tv-now-playing {
        display: inline-block;
        margin-top: 4px;
        color: #c084fc;
        font-weight: 600;
      }
      .vel-profile-tv-switch-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 14px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .vel-profile-tv-switch-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .vel-profile-tv-switch-title {
        font-size: 13px;
        font-weight: 700;
        color: #ffffff;
      }
      .vel-profile-tv-switch-desc {
        font-size: 11px;
        color: #94a3b8;
      }
      .vel-profile-tv-pair-row {
        display: flex;
        gap: 10px;
        align-items: center;
      }
      .vel-profile-tv-input {
        width: 140px;
        letter-spacing: 4px;
        font-size: 20px;
        font-weight: 700;
        text-align: center;
        padding: 8px 10px;
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(167, 139, 250, 0.3);
        color: #fff;
        outline: none;
      }
      .vel-profile-tv-input:focus {
        border-color: #8b5cf6;
        box-shadow: 0 0 10px rgba(139, 92, 246, 0.4);
      }
      .vel-profile-tv-btn {
        padding: 10px 16px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        border: none;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .vel-profile-tv-btn--primary {
        background: #8b5cf6;
        color: #fff;
      }
      .vel-profile-tv-btn--primary:hover {
        background: #7c3aed;
      }
      .vel-profile-tv-btn--danger {
        background: rgba(239, 68, 68, 0.15);
        color: #fca5a5;
        border: 1px solid rgba(239, 68, 68, 0.3);
      }
      .vel-profile-tv-btn--danger:hover {
        background: rgba(239, 68, 68, 0.25);
      }
      .vel-profile-tv-msg {
        font-size: 12px;
        margin: 0;
      }
      .vel-profile-tv-msg.is-error { color: #f87171; }
      .vel-profile-tv-msg.is-success { color: #4ade80; }

      /* Floating Luxury Capsule Bar */
      .vel-tv-active-bar-wrap {
        position: fixed;
        top: max(8px, env(safe-area-inset-top));
        left: 0;
        right: 0;
        display: flex;
        justify-content: center;
        z-index: 999999;
        pointer-events: none;
        animation: velTvSlideDown 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes velTvSlideDown {
        from { transform: translateY(-120%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      .vel-tv-active-bar {
        pointer-events: auto;
        width: calc(100% - 24px);
        max-width: 520px;
        min-height: 48px;
        background: linear-gradient(135deg, rgba(25, 16, 48, 0.94), rgba(12, 8, 28, 0.97));
        border: 1px solid rgba(167, 139, 250, 0.35);
        border-radius: 999px;
        padding: 5px 12px 5px 6px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.65), 0 0 24px rgba(139, 92, 246, 0.22);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        color: #fff;
        font-family: inherit;
        box-sizing: border-box;
      }

      /* Push down page body and containers smoothly */
      body.vel-tv-active-bar-open {
        padding-top: var(--vel-tv-bar-height, 62px) !important;
        box-sizing: border-box !important;
      }
      body.vel-tv-active-bar-open .main--velora {
        height: calc(100dvh - var(--vel-tv-bar-height, 62px)) !important;
        height: calc(100vh - var(--vel-tv-bar-height, 62px)) !important;
      }
      body.vel-tv-active-bar-open #vel-floating-search,
      body.vel-tv-active-bar-open .vel-floating-search {
        top: calc(12px + var(--vel-tv-bar-height, 62px)) !important;
      }
      body.vel-search-open .vel-tv-active-bar-wrap {
        opacity: 0 !important;
        pointer-events: none !important;
        transform: translateY(-120%) !important;
        transition: opacity 0.2s ease, transform 0.2s ease;
      }

      .vel-tv-capsule-left {
        display: flex;
        align-items: center;
        gap: 9px;
        min-width: 0;
        flex: 1;
      }

      .vel-tv-capsule-icon-wrap {
        width: 36px;
        height: 36px;
        flex-shrink: 0;
        border-radius: 50%;
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.35), rgba(76, 29, 149, 0.5));
        border: 1px solid rgba(167, 139, 250, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        color: #c4b5fd;
      }

      .vel-tv-capsule-icon-wrap.is-streaming {
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.4), rgba(16, 185, 129, 0.3));
        border-color: rgba(52, 211, 153, 0.5);
        color: #6ee7b7;
      }

      .vel-tv-live-beacon {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: #10b981;
        border: 2px solid #0f0b21;
        box-shadow: 0 0 6px #10b981;
        animation: velTvBeaconPulse 2s infinite ease-in-out;
      }
      @keyframes velTvBeaconPulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.25); opacity: 0.6; }
      }

      .vel-tv-capsule-meta {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
        overflow: hidden;
      }

      .vel-tv-capsule-title {
        font-size: 13.5px;
        font-weight: 800;
        color: #ffffff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        letter-spacing: -0.01em;
      }

      .vel-tv-capsule-sub {
        font-size: 11px;
        font-weight: 600;
        color: #a78bfa;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .vel-tv-capsule-sub.is-idle {
        color: #94a3b8;
      }

      .vel-tv-capsule-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }

      /* Segmented Device Selector: High-contrast distinct [ Phone | TV ] */
      .vel-tv-segmented-switch {
        display: flex;
        align-items: center;
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(167, 139, 250, 0.3);
        border-radius: 999px;
        padding: 2px;
        gap: 2px;
      }

      .vel-tv-segment-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 28px;
        border-radius: 999px;
        border: none;
        background: transparent;
        color: rgba(255, 255, 255, 0.45);
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        padding: 0;
        user-select: none;
        -webkit-user-select: none;
      }

      .vel-tv-segment-btn svg {
        display: block;
        transition: transform 0.15s ease, stroke 0.2s ease;
      }

      .vel-tv-segment-btn:hover {
        color: rgba(255, 255, 255, 0.9);
      }

      .vel-tv-segment-btn.is-active {
        background: linear-gradient(135deg, #8b5cf6, #7c3aed) !important;
        color: #ffffff !important;
        box-shadow: 0 2px 10px rgba(139, 92, 246, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.3) !important;
        transform: scale(1.05);
      }
      .vel-tv-segment-btn[data-mode="phone"].is-active,
      .vel-tv-segment-btn#vel-profile-mode-phone.is-active {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.18)) !important;
        color: #ffffff !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3) !important;
      }
      .vel-tv-segment-btn.is-active svg {
        stroke-width: 2.3;
      }

      /* Stop button */
      .vel-tv-stop-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: rgba(239, 68, 68, 0.18);
        border: 1px solid rgba(239, 68, 68, 0.45);
        color: #fca5a5;
        cursor: pointer;
        transition: all 0.2s ease;
        padding: 0;
      }
      .vel-tv-stop-btn:hover {
        background: rgba(239, 68, 68, 0.4);
        border-color: #ef4444;
        color: #ffffff;
        box-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
        transform: scale(1.06);
      }
      .vel-tv-stop-btn:active {
        transform: scale(0.92);
      }
      .vel-tv-stop-btn.is-stopping {
        opacity: 0.4;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function getCurrentUserId() {
    try {
      var token = getAuthToken();
      if (!token) return "guest";
      var parts = token.split(".");
      if (parts.length === 3) {
        var payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
        if (payload && payload.id != null) {
          var s = String(payload.id).trim();
          return s.endsWith(".0") ? s.slice(0, -2) : s;
        }
      }
    } catch (_) {}
    return "default";
  }

  function isGoogleCastOrAirPlayActive() {
    try {
      if (window.VeloraCast && typeof window.VeloraCast.__origIsConnected === "function") {
        return window.VeloraCast.__origIsConnected();
      }
      if (window.VeloraCast && typeof window.VeloraCast.getState === "function") {
        var st = window.VeloraCast.getState();
        return Boolean(st && st.connected && (st.castState === "CONNECTED" || st.airPlayConnected));
      }
    } catch (_) {}
    return false;
  }

  function loadCachedTvStatus() {
    try {
      var uid = getCurrentUserId();
      var raw = localStorage.getItem("velora_tv_status_cache_" + uid);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          tvState.hasPairedTv = Boolean(parsed.hasPairedTv);
          tvState.isOnline = Boolean(parsed.isOnline);
          tvState.deviceId = parsed.deviceId || null;
          tvState.deviceName = parsed.deviceName || "Smart TV";
          tvState.currentMedia = parsed.currentMedia || null;
        }
      } else {
        tvState.hasPairedTv = false;
        tvState.isOnline = false;
        tvState.deviceId = null;
        tvState.deviceName = null;
        tvState.currentMedia = null;
      }
    } catch (_) {}
  }

  function saveCachedTvStatus() {
    try {
      var uid = getCurrentUserId();
      localStorage.setItem("velora_tv_status_cache_" + uid, JSON.stringify({
        hasPairedTv: tvState.hasPairedTv,
        isOnline: tvState.isOnline,
        deviceId: tvState.deviceId,
        deviceName: tvState.deviceName,
        currentMedia: tvState.currentMedia
      }));
    } catch (_) {}
  }

  function showTvToast(msg) {
    try {
      var existing = document.getElementById("vel-tv-toast");
      if (existing) existing.remove();

      var toast = document.createElement("div");
      toast.id = "vel-tv-toast";
      toast.style.cssText = "position:fixed;top:24px;left:50%;transform:translateX(-50%);background:rgba(21,13,42,0.96);border:1px solid rgba(167,139,250,0.5);color:#fff;padding:12px 22px;border-radius:14px;font-size:14px;font-weight:500;box-shadow:0 10px 35px rgba(0,0,0,0.6);z-index:9999999;transition:all 0.3s cubic-bezier(0.16,1,0.3,1);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;gap:12px;pointer-events:none;max-width:90vw;text-align:center;";
      toast.innerHTML = "<svg viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='#a78bfa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6M2 20h.01'/></svg> <span>" + msg + "</span>";
      document.body.appendChild(toast);

      setTimeout(function () {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(-12px)";
        setTimeout(function () { toast.remove(); }, 350);
      }, 3000);
    } catch (_) {}
  }

  function updateTvTabDot() {
    var dot = document.getElementById("vel-tab-tv-dot");
    if (!dot) return;
    if (tvState.hasPairedTv) {
      dot.classList.remove("hidden");
      dot.style.background = tvState.isOnline ? "#4ade80" : "#94a3b8";
      dot.style.boxShadow = tvState.isOnline ? "0 0 8px #4ade80" : "none";
    } else {
      dot.classList.add("hidden");
    }
  }

  function updateTvBadgeOnly() {
    var badge = document.querySelector(".vel-profile-tv-status-badge");
    if (badge) {
      badge.className = "vel-profile-tv-status-badge " + (tvState.isOnline ? "is-online" : "");
      badge.textContent = tvState.isOnline ? "● En ligne" : "○ Hors ligne";
    }
    updateTvTabDot();
  }

  function removeActiveTvBar() {
    var wrap = document.getElementById("vel-tv-active-bar-wrap");
    if (wrap) {
      var src = (wrap.getAttribute && wrap.getAttribute("data-source")) || (wrap.dataset && wrap.dataset.source);
      if (src === "cast" && isGoogleCastOrAirPlayActive()) {
        return;
      }
      wrap.remove();
    }
    if (document.body && document.body.classList) {
      document.body.classList.remove("vel-tv-active-bar-open");
    }
    if (document.documentElement && document.documentElement.style) {
      document.documentElement.style.removeProperty("--vel-tv-bar-height");
    }
  }

  // Synchronize the upper active diffusion bar
  function syncActiveTvBar() {
    if (isGoogleCastOrAirPlayActive()) {
      return; // Cast is currently active and manages the top bar
    }
    if (tvState.hasPairedTv && tvState.isOnline) {
      showActiveTvBar();
    } else {
      removeActiveTvBar();
    }
  }

  // Upper bar showing TV status, diffusion switch, and active stream
  function showActiveTvBar() {
    if (isGoogleCastOrAirPlayActive()) {
      return;
    }
    var isPlaying = tvState.isOnline && tvState.currentMedia && tvState.currentMedia.state !== "stopped";
    var activeTitle = isPlaying ? (tvState.currentMedia.title || tvState.currentMedia.name || "Lecture en cours") : null;
    var tvName = tvState.deviceName || "Smart TV";
    var isOn = isAutoDiffuseOn();

    var titleText = activeTitle || tvName;
    var subText = isPlaying ? tvName : (isOn ? "Prête pour diffusion" : "Mode téléphone actif");

    var existingWrap = document.getElementById("vel-tv-active-bar-wrap");
    if (existingWrap) {
      if (existingWrap.setAttribute) existingWrap.setAttribute("data-source", "tv-bridge");
      var iconWrap = existingWrap.querySelector(".vel-tv-capsule-icon-wrap");
      if (iconWrap) iconWrap.classList.toggle("is-streaming", isPlaying);

      var titleSpan = existingWrap.querySelector(".vel-tv-capsule-title");
      if (titleSpan) titleSpan.textContent = titleText;

      var subSpan = existingWrap.querySelector(".vel-tv-capsule-sub");
      if (subSpan) {
        subSpan.textContent = subText;
        subSpan.classList.toggle("is-idle", !isPlaying && !isOn);
      }

      var phoneBtn = existingWrap.querySelector(".vel-tv-segment-btn[data-mode='phone']");
      var tvBtn = existingWrap.querySelector(".vel-tv-segment-btn[data-mode='tv']");
      if (phoneBtn) phoneBtn.classList.toggle("is-active", !isOn);
      if (tvBtn) tvBtn.classList.toggle("is-active", isOn);

      var stopBtn = existingWrap.querySelector("#vel-tv-stop-playback, #vel-cast-stop-playback");
      if (isPlaying && !stopBtn) {
        var actions = existingWrap.querySelector(".vel-tv-capsule-actions");
        if (actions) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.id = "vel-tv-stop-playback";
          btn.className = "vel-tv-stop-btn";
          btn.title = "Arrêter la diffusion sur la TV";
          btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2.5"/></svg>';
          actions.prepend(btn);
          attachStopBtnHandler(btn);
        }
      } else if (isPlaying && stopBtn) {
        stopBtn.id = "vel-tv-stop-playback";
        stopBtn.title = "Arrêter la diffusion sur la TV";
        attachStopBtnHandler(stopBtn);
      } else if (!isPlaying && stopBtn) {
        stopBtn.remove();
      }

      document.body.classList.add("vel-tv-active-bar-open");
      var barEl = existingWrap.querySelector(".vel-tv-active-bar");
      var h = (barEl ? barEl.offsetHeight : 48) + 14;
      document.documentElement.style.setProperty("--vel-tv-bar-height", h + "px");
      return;
    }

    var wrap = document.createElement("div");
    wrap.id = "vel-tv-active-bar-wrap";
    wrap.setAttribute("data-source", "tv-bridge");
    wrap.className = "vel-tv-active-bar-wrap";
    wrap.innerHTML = `
      <div class="vel-tv-active-bar">
        <div class="vel-tv-capsule-left">
          <div class="vel-tv-capsule-icon-wrap ${isPlaying ? "is-streaming" : ""}">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6M2 20h.01"/>
            </svg>
            ${isPlaying ? '<span class="vel-tv-live-beacon"></span>' : ''}
          </div>
          <div class="vel-tv-capsule-meta">
            <span class="vel-tv-capsule-title">${titleText}</span>
            <span class="vel-tv-capsule-sub ${(!isPlaying && !isOn) ? "is-idle" : ""}">${subText}</span>
          </div>
        </div>
        <div class="vel-tv-capsule-actions">
          ${isPlaying ? `
            <button type="button" id="vel-tv-stop-playback" class="vel-tv-stop-btn" title="Arrêter la diffusion sur la TV">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                <rect x="5" y="5" width="14" height="14" rx="2.5"/>
              </svg>
            </button>
          ` : ""}
          <div class="vel-tv-segmented-switch" role="group" aria-label="Destination de lecture">
            <button type="button" class="vel-tv-segment-btn ${!isOn ? "is-active" : ""}" data-mode="phone" title="Regarder sur le téléphone">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="3" ry="3"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
            </button>
            <button type="button" class="vel-tv-segment-btn ${isOn ? "is-active" : ""}" data-mode="tv" title="Diffuser sur la Smart TV">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    document.body.classList.add("vel-tv-active-bar-open");

    (window.requestAnimationFrame || window.setTimeout)(function () {
      var barEl = wrap.querySelector(".vel-tv-active-bar");
      var h = (barEl ? barEl.offsetHeight : 48) + 14;
      if (document.documentElement && document.documentElement.style) {
        document.documentElement.style.setProperty("--vel-tv-bar-height", h + "px");
      }
    }, 16);

    var phoneBtn = wrap.querySelector(".vel-tv-segment-btn[data-mode='phone']");
    if (phoneBtn) {
      phoneBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        setAutoDiffuse(false);
      });
    }

    var tvBtn = wrap.querySelector(".vel-tv-segment-btn[data-mode='tv']");
    if (tvBtn) {
      tvBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        setAutoDiffuse(true);
      });
    }

    var stopBtn = document.getElementById("vel-tv-stop-playback");
    if (stopBtn) attachStopBtnHandler(stopBtn);
  }

  function attachStopBtnHandler(stopBtn) {
    stopBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      e.stopPropagation();
      stopBtn.disabled = true;
      stopBtn.classList.add("is-stopping");
      try {
        await fetch("/api/tv/command", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ action: "stop" })
        });
        tvState.currentMedia = null;
        saveCachedTvStatus();
        syncActiveTvBar();
        renderTvSettingsSection();
        showTvToast("Diffusion TV arrêtée");
      } catch (_) {
        syncActiveTvBar();
      }
    });
  }

  // Check TV status and active playback from backend
  async function checkTvStatus() {
    if (!getAuthToken()) return;
    try {
      var res = await fetch("/api/tv/status", {
        headers: authHeaders(),
        cache: "no-store"
      });
      if (res.status === 401) return;
      var data = await res.json();
      if (data.ok) {
        var prevPaired = tvState.hasPairedTv;
        var prevOnline = tvState.isOnline;
        var prevName = tvState.deviceName;
        var prevMediaTitle = tvState.currentMedia ? (tvState.currentMedia.title || tvState.currentMedia.name) : null;

        tvState.hasPairedTv = Boolean(data.hasPairedTv);
        tvState.isOnline = Boolean(data.isOnline);
        tvState.deviceId = data.deviceId || null;
        tvState.deviceName = data.deviceName || "Smart TV";

        if (data.isOnline && data.currentMedia && data.currentMedia.state !== "stopped") {
          tvState.currentMedia = data.currentMedia;
          try {
            var curPos = Number(data.currentMedia.position) || 0;
            var curDur = Number(data.currentMedia.duration) || 0;
            var cmId = String(data.currentMedia.id || data.currentMedia.streamId || data.currentMedia.mediaId || "");
            var cmTitle = (data.currentMedia.title || data.currentMedia.name || "").trim().toLowerCase();

            if (curPos > 3 && (cmId || cmTitle)) {
              var uid = getCurrentUserId();
              var histKey = "velora_resume_v13_" + uid;
              var histRaw = localStorage.getItem(histKey);
              var list = histRaw ? JSON.parse(histRaw) : [];
              if (Array.isArray(list)) {
                var foundIdx = list.findIndex(function (it) {
                  return (cmId && (String(it.id) === cmId || String(it.streamId) === cmId || String(it.episodeStreamId) === cmId)) ||
                         (cmTitle && it.name && it.name.trim().toLowerCase() === cmTitle);
                });
                if (foundIdx >= 0) {
                  list[foundIdx].currentTime = curPos;
                  if (curDur > 0) list[foundIdx].duration = curDur;
                  if (curDur > 0) list[foundIdx].progressPercent = Math.min(100, Math.max(0, (curPos / curDur) * 100));
                  list[foundIdx].updatedAt = Date.now();
                } else {
                  var newEntry = {
                    id: cmId || ("tv_" + Date.now()),
                    streamId: data.currentMedia.streamId || cmId || null,
                    seriesId: data.currentMedia.seriesId || null,
                    episodeStreamId: data.currentMedia.episodeStreamId || null,
                    name: data.currentMedia.title || data.currentMedia.name || "Vidéo",
                    title: data.currentMedia.title || data.currentMedia.name || "Vidéo",
                    poster: data.currentMedia.poster || "",
                    backdropUrl: data.currentMedia.poster || "",
                    thumbUrl: data.currentMedia.poster || "",
                    currentTime: curPos,
                    duration: curDur,
                    progressPercent: curDur > 0 ? Math.min(100, Math.max(0, (curPos / curDur) * 100)) : 0,
                    type: data.currentMedia.type || "vod",
                    url: data.currentMedia.url || "",
                    updatedAt: Date.now()
                  };
                  list.unshift(newEntry);
                }

                localStorage.setItem(histKey, JSON.stringify(list.slice(0, 60)));
                document.dispatchEvent(new CustomEvent("velora-watch-history-updated", { detail: { items: list } }));
                if (typeof window.veloraRenderResumeSection === "function") {
                  var rootEl = document.getElementById("vel-home-sections");
                  if (rootEl) {
                    var exEl = rootEl.querySelector(".vel-home-section--resume");
                    var freshBlock = window.veloraRenderResumeSection();
                    if (freshBlock) {
                      if (exEl) exEl.replaceWith(freshBlock);
                      else rootEl.prepend(freshBlock);
                    }
                  }
                }
              }
            }
          } catch (_) {}
        } else {
          tvState.currentMedia = null;
        }

        tvState.lastChecked = Date.now();
        saveCachedTvStatus();

        var newMediaTitle = tvState.currentMedia ? (tvState.currentMedia.title || tvState.currentMedia.name) : null;

        if (prevPaired !== tvState.hasPairedTv || prevName !== tvState.deviceName || prevMediaTitle !== newMediaTitle) {
          renderTvSettingsSection();
        } else if (prevOnline !== tvState.isOnline) {
          updateTvBadgeOnly();
        }

        syncActiveTvBar();
      }
    } catch (_) {}
  }

  // Handle URL pairing (e.g. ?tvPair=8492 from QR Code)
  async function handleUrlPairing() {
    try {
      var params = new URLSearchParams(window.location.search);
      var code = params.get("tvPair");
      if (!code || code.length !== 4 || !getAuthToken()) return;

      var res = await fetch("/api/tv/pair", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ pin: code })
      });
      var data = await res.json();
      if (data.ok) {
        window.alert("🎉 Votre Smart TV (" + (data.deviceName || "Salon") + ") a été connectée avec succès !");
        checkTvStatus();
      }
      params.delete("tvPair");
      var newQuery = params.toString() ? "?" + params.toString() : "";
      window.history.replaceState({}, "", window.location.pathname + newQuery);
    } catch (_) {}
  }

  // Render TV Section into Profile Modal (Tab: Smart TV)
  function renderTvSettingsSection(force) {
    var modal = document.getElementById("vel-profile-account-modal");
    if (!modal) return;
    var mountPoint = document.getElementById("vel-tv-panel-mount");
    var target = mountPoint || modal.querySelector(".vel-profile-account__card");
    if (!target) return;

    var existing = document.getElementById("vel-profile-tv-card");
    if (existing) {
      if (!force) {
        var pinInput = document.getElementById("vel-tv-pin-input");
        if (pinInput && document.activeElement === pinInput && pinInput.value.length < 4) {
          return;
        }
      }
      existing.remove();
    }

    updateTvTabDot();

    var section = document.createElement("div");
    section.id = "vel-profile-tv-card";
    section.className = "vel-profile-tv-card";

    if (tvState.hasPairedTv) {
      var isDiffusionActive = tvState.isOnline && tvState.currentMedia && tvState.currentMedia.state !== "stopped";
      var currentTitle = isDiffusionActive ? (tvState.currentMedia.title || tvState.currentMedia.name || "Média en cours") : "";
      var isOn = isAutoDiffuseOn();

      section.innerHTML = `
        <div class="vel-tv-connected-card">
          <div class="vel-tv-connected-header">
            <div class="vel-tv-connected-icon">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <div class="vel-tv-connected-meta">
              <div class="vel-tv-connected-title-row">
                <h3 class="vel-tv-connected-title">Smart TV Connectée</h3>
                <span class="vel-profile-tv-status-badge ${tvState.isOnline ? "is-online" : ""}">
                  ${tvState.isOnline ? "● En ligne" : "○ Hors ligne"}
                </span>
              </div>
              <p class="vel-tv-connected-device">Appareil : <strong>${tvState.deviceName || "Smart TV"}</strong></p>
            </div>
          </div>

          <div class="vel-tv-connected-status-desc">
            ${tvState.isOnline 
              ? (isDiffusionActive 
                  ? `Diffusion active : <strong class="vel-profile-tv-now-playing">${currentTitle}</strong>` 
                  : "Prête pour la diffusion depuis votre téléphone.") 
              : "Ouvrez <strong>veloravip.net/tv</strong> sur votre TV pour diffuser."}
          </div>

          ${tvState.isOnline ? `
            <div class="vel-profile-tv-switch-row">
              <div class="vel-profile-tv-switch-info">
                <span class="vel-profile-tv-switch-title">Destination de lecture</span>
                <span class="vel-profile-tv-switch-desc">${isOn ? "Diffusion automatique vers la TV" : "Lecture locale sur le téléphone"}</span>
              </div>
              <div class="vel-tv-segmented-switch" role="group">
                <button type="button" class="vel-tv-segment-btn ${!isOn ? "is-active" : ""}" id="vel-profile-mode-phone" title="Téléphone">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="3" ry="3"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                </button>
                <button type="button" class="vel-tv-segment-btn ${isOn ? "is-active" : ""}" id="vel-profile-mode-tv" title="Smart TV">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                </button>
              </div>
            </div>
          ` : ""}

          <div class="vel-tv-connected-actions">
            <button type="button" id="vel-tv-unlink-btn" class="vel-profile-tv-btn vel-profile-tv-btn--danger">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                <line x1="12" y1="2" x2="12" y2="12"></line>
              </svg>
              <span>Déconnecter la TV</span>
            </button>
          </div>
          <p id="vel-tv-pair-status" class="vel-profile-tv-msg"></p>
        </div>
      `;
      target.appendChild(section);

      var phoneBtn = document.getElementById("vel-profile-mode-phone");
      if (phoneBtn) {
        phoneBtn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          setAutoDiffuse(false);
        });
      }

      var tvBtn = document.getElementById("vel-profile-mode-tv");
      if (tvBtn) {
        tvBtn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          setAutoDiffuse(true);
        });
      }

      var unlinkBtn = document.getElementById("vel-tv-unlink-btn");
      if (unlinkBtn) {
        unlinkBtn.addEventListener("click", async function () {
          if (!window.confirm("Voulez-vous vraiment déconnecter votre TV ?")) return;
          unlinkBtn.disabled = true;
          try {
            var res = await fetch("/api/tv/unlink", {
              method: "POST",
              headers: authHeaders()
            });
            var data = await res.json();
            if (data.ok) {
              tvState.hasPairedTv = false;
              tvState.isOnline = false;
              tvState.currentMedia = null;
              saveCachedTvStatus();
              removeActiveTvBar();
              updateTvTabDot();
              renderTvSettingsSection(true);
              showTvToast("TV déconnectée");
            } else {
              window.alert("Erreur lors de la déconnexion");
            }
          } catch (e) {
            window.alert("Erreur lors de la déconnexion");
          } finally {
            unlinkBtn.disabled = false;
          }
        });
      }
    } else {
      section.innerHTML = `
        <div class="vel-tv-tab-box">
          <div class="vel-tv-tab-hero">
            <div class="vel-tv-tab-icon-wrap">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
                <polyline points="17 2 12 7 7 2"></polyline>
              </svg>
            </div>
            <h3 class="vel-tv-tab-title">Diffuser sur Smart TV</h3>
          </div>

          <div class="vel-tv-instructions">
            <div class="vel-tv-step">
              <span class="vel-tv-step-num">1</span>
              <div class="vel-tv-step-text">
                Sur votre TV, ouvrez le navigateur web et accédez à :
                <div><span class="vel-tv-url-pill">veloravip.net/tv</span></div>
              </div>
            </div>
            <div class="vel-tv-step">
              <span class="vel-tv-step-num">2</span>
              <div class="vel-tv-step-text">
                Entrez le code à 4 chiffres affiché sur votre TV :
              </div>
            </div>
          </div>

          <div class="vel-tv-pin-entry">
            <input type="text" id="vel-tv-pin-input" class="vel-tv-pin-input" placeholder="••••" maxlength="4" inputmode="numeric" autocomplete="off" />
          </div>
          <p id="vel-tv-pair-status" class="vel-profile-tv-msg"></p>
        </div>
      `;
      target.appendChild(section);

      var pinInput = document.getElementById("vel-tv-pin-input");
      var statusMsg = document.getElementById("vel-tv-pair-status");
      var isSubmitting = false;

      async function submitPin() {
        if (isSubmitting || !pinInput) return;
        var pin = pinInput.value.replace(/\D/g, "").slice(0, 4);
        if (pin.length !== 4) return;

        isSubmitting = true;
        pinInput.disabled = true;
        if (statusMsg) {
          statusMsg.className = "vel-profile-tv-msg";
          statusMsg.textContent = "Connexion en cours…";
        }

        try {
          var res = await fetch("/api/tv/pair", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ pin: pin })
          });
          var data = await res.json();
          if (data.ok) {
            tvState.hasPairedTv = true;
            tvState.deviceName = data.deviceName || "Smart TV";
            tvState.isOnline = true;
            saveCachedTvStatus();
            updateTvTabDot();
            syncActiveTvBar();
            showTvToast("🎉 Smart TV connectée avec succès !");
            renderTvSettingsSection(true);
          } else {
            if (statusMsg) {
              statusMsg.className = "vel-profile-tv-msg is-error";
              statusMsg.textContent = data.error || "Code invalide ou expiré.";
            }
            pinInput.disabled = false;
            pinInput.value = "";
            pinInput.focus();
          }
        } catch (e) {
          if (statusMsg) {
            statusMsg.className = "vel-profile-tv-msg is-error";
            statusMsg.textContent = "Erreur de connexion au serveur.";
          }
          pinInput.disabled = false;
          pinInput.value = "";
          pinInput.focus();
        } finally {
          isSubmitting = false;
        }
      }

      if (pinInput) {
        pinInput.addEventListener("input", function () {
          pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 4);
          if (pinInput.value.length === 4) {
            submitPin();
          }
        });
        pinInput.addEventListener("keydown", function (e) {
          if (e.key === "Enter" && pinInput.value.trim().length === 4) {
            submitPin();
          }
        });
      }
    }
  }

  window.veloraRenderTvTab = function () {
    renderTvSettingsSection(false);
    updateTvTabDot();
  };

  var lastSentTvMediaUrl = "";
  var lastSentTvMediaTime = 0;
  var isSendingTvMedia = false;

  // Send media to play on TV
  async function sendToTv(media) {
    if (!media || !media.url) return;

    var rawUrl = String(media.url || "").trim();
    var now = Date.now();
    if (lastSentTvMediaUrl === rawUrl && (now - lastSentTvMediaTime < 2500)) {
      return;
    }
    if (isSendingTvMedia && lastSentTvMediaUrl === rawUrl) {
      return;
    }

    lastSentTvMediaUrl = rawUrl;
    lastSentTvMediaTime = now;
    isSendingTvMedia = true;

    try {
      // 1. Close mobile transcode session if running
      try {
        if (typeof window.veloraCloseActiveTranscodeSession === "function") {
          window.veloraCloseActiveTranscodeSession();
        }
      } catch (_) {}

      // 2. Immediately halt mobile players on phone
      haltMobilePlayers();

      // Lightweight single delayed safety check
      setTimeout(function () {
        if (shouldSuppressMobilePlayback()) {
          haltMobilePlayers();
        }
      }, 150);

      // 3. Resolve best stream URL for the TV
      var targetUrl = media.url || media.castUrl || media.direct_source || media.sourceUrl;

      if (targetUrl) {
        if (targetUrl.indexOf("/") === 0) {
          targetUrl = window.location.origin + targetUrl;
        } else if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(targetUrl)) {
          targetUrl = targetUrl.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, window.location.origin);
        }

        var token = getAuthToken();
        if (token && (targetUrl.indexOf("/api/") !== -1 || targetUrl.indexOf("/proxy") !== -1)) {
          if (targetUrl.indexOf("token=") === -1) {
            targetUrl += (targetUrl.indexOf("?") === -1 ? "?" : "&") + "token=" + encodeURIComponent(token);
          }
        }
      }

      // 4. Resolve resume position from pending seek or local watch history
      var targetPosition = Number(media.position ?? media.currentTime) || 0;
      if (targetPosition <= 0 && window.__veloraPendingResumeSeek && window.__veloraPendingResumeSeek.targetSeconds > 3) {
        targetPosition = window.__veloraPendingResumeSeek.targetSeconds;
      }
      if (targetPosition <= 0) {
        try {
          var uid = getCurrentUserId();
          var histKey = "velora_resume_v13_" + uid;
          var histRaw = localStorage.getItem(histKey);
          if (!histRaw) {
            for (var ki = 0; ki < localStorage.length; ki++) {
              var lk = localStorage.key(ki);
              if (lk && lk.startsWith("velora_resume_v13_")) {
                histRaw = localStorage.getItem(lk);
                if (histRaw) break;
              }
            }
          }
          if (histRaw) {
            var list = JSON.parse(histRaw);
            if (Array.isArray(list)) {
              var mId = String(media.id || media.streamId || media.stream_id || "");
              var mTitle = (media.title || media.name || "").trim().toLowerCase();
              var found = list.find(function (it) {
                return (mId && (String(it.id) === mId || String(it.streamId) === mId || String(it.episodeStreamId) === mId)) ||
                       (mTitle && it.name && it.name.trim().toLowerCase() === mTitle);
              });
              if (found && Number(found.currentTime) > 5) {
                targetPosition = Math.max(0, Number(found.currentTime) - 3);
              }
              if (found && Number(found.duration) > 0 && !media.duration) {
                media.duration = Number(found.duration);
              }
            }
          }
        } catch (_) {}
      }

      var targetDuration = Number(media.duration || media.duration_secs || media.totalDuration || media.total_duration) || 0;
      if (targetDuration <= 0 && window.__veloraLastPlayingMedia && Number(window.__veloraLastPlayingMedia.duration) > 0) {
        targetDuration = Number(window.__veloraLastPlayingMedia.duration);
      }

      var payload = {
        ...media,
        duration: targetDuration,
        duration_secs: targetDuration,
        totalDuration: targetDuration,
        position: targetPosition,
        currentTime: targetPosition,
        url: targetUrl
      };

      var res = await fetch("/api/tv/play", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });
      var data = await res.json();
      if (data.ok) {
        tvState.currentMedia = {
          ...media,
          title: media.title || media.name || "Vidéo",
          state: "playing"
        };
        saveCachedTvStatus();
        renderTvSettingsSection();
        showActiveTvBar();
        showTvToast("Lecture lancée sur " + (tvState.deviceName || "Smart TV"));
      } else {
        tvState.isOnline = false;
        saveCachedTvStatus();
        updateTvBadgeOnly();
        syncActiveTvBar();

        var liveContainer = document.getElementById("player-container");
        if (liveContainer) liveContainer.classList.remove("hidden");
        var vodContainer = document.getElementById("vod-player-container");
        if (vodContainer) vodContainer.classList.remove("hidden");

        showTvToast("La TV semble en veille — Lecture lancée sur votre téléphone");

        var v = media.video || document.getElementById("video") || document.getElementById("video-vod");
        if (v) {
          var restoreUrl = media.url || media.castUrl || media.direct_source || media.sourceUrl;
          if (restoreUrl && (!v.src || v.src === "")) {
            v.src = restoreUrl;
          }
          v.play().catch(function () {});
        }
      }
    } catch (e) {
      console.error("[TV Bridge] sendToTv error:", e);
      tvState.isOnline = false;
      saveCachedTvStatus();
      updateTvBadgeOnly();
      syncActiveTvBar();
      showTvToast("Connexion TV interrompue — Lecture sur votre téléphone");
      var v = media.video || document.getElementById("video") || document.getElementById("video-vod");
      if (v) {
        var restoreUrl = media.url || media.castUrl || media.direct_source || media.sourceUrl;
        if (restoreUrl && (!v.src || v.src === "")) {
          v.src = restoreUrl;
        }
        v.play().catch(function () {});
      }
    } finally {
      isSendingTvMedia = false;
    }
  }

  // Direct seamless routing based on auto-diffuse switch!
  function interceptPlayback(mediaData) {
    if (isGoogleCastOrAirPlayActive()) {
      return false;
    }
    if (tvState.hasPairedTv && tvState.isOnline) {
      if (isAutoDiffuseOn()) {
        haltMobilePlayers();
        sendToTv(mediaData);
        return true;
      }
      return false;
    }
    return false;
  }

  // Ensure TV settings are rendered into Profile Modal when needed
  function observeProfileModal() {
    function tryInstantRender() {
      var modal = document.getElementById("vel-profile-account-modal");
      if (modal && !modal.hidden) {
        var mount = document.getElementById("vel-tv-panel-mount") || modal.querySelector(".vel-profile-account__card");
        if (mount && !document.getElementById("vel-profile-tv-card")) {
          renderTvSettingsSection(false);
        }
        updateTvTabDot();
      }
    }

    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest("#vel-profile-account-open, #vel-tab-btn-tv, [data-bottom-nav='profile']");
      if (btn) {
        tryInstantRender();
        setTimeout(function () {
          tryInstantRender();
          checkTvStatus();
        }, 20);
      }
    }, true);

    tryInstantRender();
  }

  // Expose direct diffusion to paired TV
  window.veloraSendToPairedTv = function (media) {
    if (tvState.hasPairedTv && tvState.isOnline) {
      sendToTv(media);
      return true;
    }
    return false;
  };

  // Hook into unified Velora events
  function initPlaybackListeners() {
    function attachHooks() {
      if (!window.VeloraCast) {
        window.VeloraCast = {};
      }
      if (!window.VeloraCast.__tvBridgeHooked) {
        window.VeloraCast.__tvBridgeHooked = true;
        var origSetMedia = window.VeloraCast.setMedia;
        window.VeloraCast.setMedia = function (media) {
          if (origSetMedia) {
            try { origSetMedia.call(window.VeloraCast, media); } catch (_) {}
          }
          if (media && media.url) {
            interceptPlayback(media);
          }
        };

        var origIsConnected = window.VeloraCast.isConnected;
        window.VeloraCast.__origIsConnected = function () {
          return origIsConnected ? origIsConnected.call(window.VeloraCast) : false;
        };
        window.VeloraCast.isConnected = function () {
          if (shouldSuppressMobilePlayback()) {
            return true;
          }
          return origIsConnected ? origIsConnected.call(window.VeloraCast) : false;
        };
      }
    }

    attachHooks();
    setTimeout(attachHooks, 500);
    setTimeout(attachHooks, 2000);
  }

  function initGlobalSwitchListeners() {
    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest(".vel-tv-segment-btn, #vel-profile-mode-phone, #vel-profile-mode-tv");
      if (!btn) return;
      var mode = btn.getAttribute("data-mode") || (btn.id === "vel-profile-mode-tv" ? "tv" : (btn.id === "vel-profile-mode-phone" ? "phone" : null));
      if (!mode) return;
      e.preventDefault();
      e.stopPropagation();
      setAutoDiffuse(mode === "tv");
    }, true);
  }

  // Initialize
  function init() {
    loadCachedTvStatus();
    installPlaybackProtections();
    injectStyles();
    initGlobalSwitchListeners();
    observeProfileModal();
    initPlaybackListeners();
    updateTvTabDot();
    syncActiveTvBar();
    handleUrlPairing();
    checkTvStatus();

    // Check TV online status and sync active broadcasting bar every 8s
    tvState.checkInterval = setInterval(function () {
      checkTvStatus();
      initPlaybackListeners();
    }, 8000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

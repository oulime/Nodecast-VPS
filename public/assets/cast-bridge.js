(function () {
  "use strict";

  var RECEIVER_APP_ID = "CC1AD845";
  var SESSION_KEY = "velora_cast_session_active_v1";
  var CAST_SDK_SRC = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";

  var state = {
    sdkReady: false,
    sdkLoading: false,
    castState: "NO_DEVICES_AVAILABLE",
    sessionState: "NO_SESSION",
    remotePlayer: null,
    remoteController: null,
    currentMedia: null,
    lastLoadedKey: "",
    pendingCastClick: false,
    loadTimer: null,
    activeVideo: null
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function usableUrl(url) {
    return !!url && !/^(blob:|data:|about:|mediastream:)/i.test(String(url));
  }

  function absoluteUrl(url) {
    if (!usableUrl(url)) return "";
    try {
      return new URL(url, window.location.href).href;
    } catch (_) {
      return "";
    }
  }

  function isM3u8(url) {
    return /\.m3u8(?:[?#]|$)/i.test(String(url || "")) || /\/api\/transcode\/[^/]+\/stream\.m3u8/i.test(String(url || ""));
  }

  function contentTypeFor(url) {
    if (isM3u8(url)) return "application/x-mpegURL";
    if (/\.mpd(?:[?#]|$)/i.test(url)) return "application/dash+xml";
    if (/\.ts(?:[?#]|$)/i.test(url)) return "video/mp2t";
    if (/\.webm(?:[?#]|$)/i.test(url)) return "video/webm";
    return "video/mp4";
  }

  function activeVideo() {
    var videos = Array.prototype.slice.call(document.querySelectorAll("video"));
    return videos.find(function (video) {
      return video && !video.paused && !video.ended && video.readyState > 0;
    }) || state.activeVideo || videos.find(function (video) {
      return video && (video.__veloraCastUrl || video.currentSrc || video.src);
    }) || null;
  }

  function textFrom(selectors) {
    for (var i = 0; i < selectors.length; i += 1) {
      var node = document.querySelector(selectors[i]);
      var text = node && String(node.textContent || "").trim();
      if (text) return text;
    }
    return "";
  }

  function pageTitle(video) {
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
    ]) || (video && video.getAttribute("aria-label")) || document.title || "VeloraVIP";
  }

  function pagePoster(video) {
    var candidates = [
      video && video.getAttribute("poster"),
      byId("watch-poster") && byId("watch-poster").getAttribute("src"),
      document.querySelector(".movie-poster img") && document.querySelector(".movie-poster img").getAttribute("src"),
      document.querySelector(".series-poster img") && document.querySelector(".series-poster img").getAttribute("src"),
      document.querySelector(".vel-vod-detail img") && document.querySelector(".vel-vod-detail img").getAttribute("src")
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var url = absoluteUrl(candidates[i]);
      if (url) return url;
    }
    return "";
  }

  function logicalPosition(media, video) {
    if (media && Number.isFinite(Number(media.position))) return Math.max(0, Number(media.position));
    var offset = media && Number.isFinite(Number(media.offset)) ? Math.max(0, Number(media.offset)) : 0;
    var current = video && Number.isFinite(video.currentTime) ? Math.max(0, video.currentTime) : 0;
    return offset + current;
  }

  function mediaKey(media) {
    return [
      media && media.url,
      media && media.type,
      media && media.isLive ? "live" : "vod",
      media && media.title
    ].join("|");
  }

  function normalizeMedia(input) {
    var video = input && input.video || activeVideo();
    var app = window.app || {};
    var appUrl = app.pages && app.pages.watch && app.pages.watch.currentUrl || app.player && app.player.currentUrl;
    var url = absoluteUrl(input && input.url || appUrl || video && video.__veloraCastUrl || video && (video.currentSrc || video.src));
    if (!url) return null;

    var type = input && input.type || (input && input.isLive ? "live" : isM3u8(url) ? "video" : "video");
    var isLive = Boolean(input && input.isLive) || type === "live";
    return {
      type: type,
      url: url,
      title: input && input.title || pageTitle(video),
      poster: absoluteUrl(input && input.poster) || pagePoster(video),
      contentType: input && input.contentType || contentTypeFor(url),
      isLive: isLive,
      position: isLive ? 0 : logicalPosition(input, video),
      video: video || null
    };
  }

  function setStatus(text) {
    var button = byId("velora-cast-button");
    if (!button) return;
    button.title = text || "Cast video to TV";
    button.setAttribute("aria-label", text || "Cast video to TV");
  }

  function rememberSessionActive(active) {
    try {
      if (active) localStorage.setItem(SESSION_KEY, "1");
      else localStorage.removeItem(SESSION_KEY);
    } catch (_) {}
  }

  function hadSessionActive() {
    try {
      return localStorage.getItem(SESSION_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function session() {
    if (!state.sdkReady || !window.cast || !window.cast.framework) return null;
    return window.cast.framework.CastContext.getInstance().getCurrentSession();
  }

  function canUseGoogleCast() {
    return state.sdkReady && !!window.cast && !!window.cast.framework && !!window.chrome && !!window.chrome.cast;
  }

  function syncButton() {
    var button = byId("velora-cast-button");
    if (!button) return;
    var hasMedia = !!state.currentMedia || !!normalizeMedia({});
    button.disabled = !hasMedia;
    button.classList.toggle("velora-cast-button--connected", !!session());
    if (!hasMedia) setStatus("Start a video first, then cast it");
    else if (!state.sdkReady) setStatus("Cast loading");
    else if (session()) setStatus("Casting to TV");
    else if (state.castState === "NO_DEVICES_AVAILABLE") setStatus("No Cast TV detected yet");
    else setStatus("Cast video to TV");
  }

  function buildMediaRequest(media) {
    var mediaInfo = new window.chrome.cast.media.MediaInfo(media.url, media.contentType);
    mediaInfo.streamType = media.isLive
      ? window.chrome.cast.media.StreamType.LIVE
      : window.chrome.cast.media.StreamType.BUFFERED;
    mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
    mediaInfo.metadata.title = media.title || "VeloraVIP";
    if (media.poster) mediaInfo.metadata.images = [{ url: media.poster }];

    var request = new window.chrome.cast.media.LoadRequest(mediaInfo);
    request.autoplay = true;
    if (!media.isLive) request.currentTime = Math.max(0, Number(media.position) || 0);
    return request;
  }

  async function loadMediaOnCast(media, options) {
    if (!canUseGoogleCast()) return false;
    var castSession = session();
    if (!castSession) return false;
    var key = mediaKey(media);
    if (!options || !options.force) {
      if (state.lastLoadedKey === key) return true;
    }
    try {
      await castSession.loadMedia(buildMediaRequest(media));
      state.lastLoadedKey = key;
      rememberSessionActive(true);
      return true;
    } catch (error) {
      console.warn("[VeloraCast] loadMedia failed", error);
      return false;
    }
  }

  function scheduleCastReload(force) {
    window.clearTimeout(state.loadTimer);
    state.loadTimer = window.setTimeout(function () {
      if (state.currentMedia && session()) loadMediaOnCast(state.currentMedia, { force: !!force });
    }, 120);
  }

  function setMedia(input) {
    var media = normalizeMedia(input || {});
    if (!media) return null;
    state.currentMedia = media;
    if (media.video) {
      media.video.__veloraCastUrl = media.url;
      state.activeVideo = media.video;
    }
    syncButton();
    if (session()) scheduleCastReload(true);
    return media;
  }

  function rememberMedia(video, url, meta) {
    return setMedia(Object.assign({}, meta || {}, { video: video || activeVideo(), url: url }));
  }

  async function requestGoogleCast() {
    if (!state.currentMedia) setMedia({});
    if (!state.currentMedia) {
      window.alert("Start a video first, then cast it.");
      return;
    }

    if (!state.sdkReady) {
      state.pendingCastClick = true;
      setStatus("Cast loading");
      loadGoogleCastSdk();
      return;
    }

    if (!canUseGoogleCast()) {
      return requestAirPlayOrExplain();
    }

    try {
      var context = window.cast.framework.CastContext.getInstance();
      var castSession = context.getCurrentSession() || await context.requestSession();
      if (!castSession) return;
      await loadMediaOnCast(state.currentMedia, { force: true });
    } catch (error) {
      console.warn("[VeloraCast] requestSession failed", error);
      requestAirPlayOrExplain();
    }
  }

  function requestAirPlayOrExplain() {
    var media = state.currentMedia || normalizeMedia({});
    if (media && media.video && typeof media.video.webkitShowPlaybackTargetPicker === "function") {
      media.video.webkitShowPlaybackTargetPicker();
      return;
    }
    window.alert("No Cast TV detected. Use Chrome/Android with Chromecast, Google TV, or Android TV on the same Wi-Fi.");
  }

  function onCastApiAvailable(available) {
    state.sdkReady = Boolean(available && window.cast && window.cast.framework && window.chrome && window.chrome.cast);
    state.sdkLoading = false;
    if (!state.sdkReady) {
      syncButton();
      return;
    }

    var context = window.cast.framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId: RECEIVER_APP_ID,
      autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      resumeSavedSession: true
    });

    context.addEventListener(window.cast.framework.CastContextEventType.CAST_STATE_CHANGED, function (event) {
      state.castState = event.castState;
      syncButton();
      if (state.pendingCastClick && state.castState !== "NO_DEVICES_AVAILABLE") {
        state.pendingCastClick = false;
        requestGoogleCast();
      }
    });

    context.addEventListener(window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED, function (event) {
      state.sessionState = event.sessionState;
      if (
        event.sessionState === window.cast.framework.SessionState.SESSION_STARTED ||
        event.sessionState === window.cast.framework.SessionState.SESSION_RESUMED
      ) {
        rememberSessionActive(true);
        setupRemotePlayer();
        if (state.currentMedia) scheduleCastReload(true);
      }
      if (
        event.sessionState === window.cast.framework.SessionState.SESSION_ENDED ||
        event.sessionState === window.cast.framework.SessionState.SESSION_START_FAILED
      ) {
        state.lastLoadedKey = "";
        rememberSessionActive(false);
      }
      syncButton();
    });

    setupRemotePlayer();
    syncButton();
    if (state.pendingCastClick) {
      state.pendingCastClick = false;
      requestGoogleCast();
    } else if (hadSessionActive() && session() && state.currentMedia) {
      scheduleCastReload(true);
    }
  }

  function setupRemotePlayer() {
    if (!state.sdkReady || !window.cast || !window.cast.framework || state.remoteController) return;
    state.remotePlayer = new window.cast.framework.RemotePlayer();
    state.remoteController = new window.cast.framework.RemotePlayerController(state.remotePlayer);
    state.remoteController.addEventListener(
      window.cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
      syncButton
    );
    state.remoteController.addEventListener(
      window.cast.framework.RemotePlayerEventType.MEDIA_INFO_CHANGED,
      syncButton
    );
  }

  function loadGoogleCastSdk() {
    window.__onGCastApiAvailable = onCastApiAvailable;
    if (state.sdkReady || state.sdkLoading || byId("velora-google-cast-sdk")) return;
    state.sdkLoading = true;
    var script = document.createElement("script");
    script.id = "velora-google-cast-sdk";
    script.async = true;
    script.src = CAST_SDK_SRC;
    script.onerror = function () {
      state.sdkLoading = false;
      syncButton();
    };
    document.head.appendChild(script);
  }

  function patchVideoSources() {
    if (HTMLMediaElement.prototype.__veloraCastPatched) return;
    HTMLMediaElement.prototype.__veloraCastPatched = true;

    try {
      var descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
      if (descriptor && descriptor.get && descriptor.set) {
        Object.defineProperty(HTMLMediaElement.prototype, "src", {
          configurable: true,
          enumerable: descriptor.enumerable,
          get: function () {
            return descriptor.get.call(this);
          },
          set: function (value) {
            rememberMedia(this, value);
            return descriptor.set.call(this, value);
          }
        });
      }
    } catch (_) {}

    var originalSetAttribute = HTMLMediaElement.prototype.setAttribute;
    if (typeof originalSetAttribute === "function") {
      HTMLMediaElement.prototype.setAttribute = function (name, value) {
        if (String(name || "").toLowerCase() === "src") rememberMedia(this, value);
        return originalSetAttribute.apply(this, arguments);
      };
    }
  }

  function bindVideos() {
    Array.prototype.forEach.call(document.querySelectorAll("video"), function (video) {
      if (video.__veloraCastBound) return;
      video.__veloraCastBound = true;
      ["play", "loadedmetadata", "canplay"].forEach(function (eventName) {
        video.addEventListener(eventName, function () {
          state.activeVideo = video;
          rememberMedia(video, video.__veloraCastUrl || video.currentSrc || video.src);
        }, true);
      });
    });
  }

  function installButton() {
    if (byId("velora-cast-button")) return;
    var style = document.createElement("style");
    style.textContent = [
      ".velora-cast-button{position:fixed;right:16px;bottom:calc(78px + env(safe-area-inset-bottom,0px));z-index:2147483000;width:50px;height:50px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.22);border-radius:14px;background:rgba(12,14,24,.86);color:#fff;box-shadow:0 12px 30px rgba(0,0,0,.42);backdrop-filter:blur(14px);cursor:pointer}",
      ".velora-cast-button:hover,.velora-cast-button:focus-visible{background:rgba(83,105,255,.95);outline:none}",
      ".velora-cast-button[disabled]{opacity:.42;cursor:not-allowed}",
      ".velora-cast-button--connected{background:rgba(34,197,94,.9)}",
      ".velora-cast-button svg{width:26px;height:26px;fill:currentColor}",
      "@media(max-width:768px){.velora-cast-button{right:12px;bottom:calc(86px + env(safe-area-inset-bottom,0px));width:52px;height:52px}}"
    ].join("");
    document.head.appendChild(style);

    var button = document.createElement("button");
    button.id = "velora-cast-button";
    button.className = "velora-cast-button";
    button.type = "button";
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18v3h3a3 3 0 0 0-3-3Zm0-4v2a5 5 0 0 1 5 5h2a7 7 0 0 0-7-7Zm0-4v2a9 9 0 0 1 9 9h2A11 11 0 0 0 3 10Zm0-7v5h2V5h14v12h-3v2h5V3H3Z"/></svg>';
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      requestGoogleCast();
    });
    document.body.appendChild(button);
    syncButton();
  }

  function boot() {
    window.VeloraCast = {
      setMedia: setMedia,
      rememberMedia: rememberMedia,
      cast: requestGoogleCast,
      getCurrentMedia: function () {
        return state.currentMedia || normalizeMedia({});
      },
      isConnected: function () {
        return !!session();
      }
    };

    patchVideoSources();
    installButton();
    bindVideos();
    loadGoogleCastSdk();
    new MutationObserver(function () {
      bindVideos();
      syncButton();
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();

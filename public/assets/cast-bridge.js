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
    currentMedia: null,
    lastLoadedKey: "",
    pendingCastClick: false,
    requestPending: false,
    pendingInitialMedia: null,
    pendingInitialToken: 0,
    sdkInitialized: false,
    loadTimer: null,
    blockedTimer: null,
    phase: "DISCONNECTED",
    activeVideo: null,
    airPlayAvailable: false,
    airPlayConnected: false
  };

  function isIosOrSafari() {
    var ua = navigator.userAgent || "";
    var isAppleMobile = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|Edg|OPR|Android/i.test(ua);
    return isAppleMobile || isSafari;
  }

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

  function isInternalTranscode(url) {
    return /\/api\/transcode\/[^/]+\/stream\.m3u8/i.test(String(url || ""));
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
    }) || document.getElementById("video-vod") || document.getElementById("video") || null;
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
      media && media.castUrl || media && media.url,
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
    var media = {
      type: type,
      url: url,
      title: input && input.title || pageTitle(video),
      poster: absoluteUrl(input && input.poster) || pagePoster(video),
      contentType: input && input.contentType || contentTypeFor(url),
      isLive: isLive,
      position: isLive ? 0 : logicalPosition(input, video),
      offset: input && Number.isFinite(Number(input.offset)) ? Math.max(0, Number(input.offset)) : 0,
      duration: input && Number.isFinite(Number(input.duration))
        ? Math.max(0, Number(input.duration))
        : (!isLive && video && Number.isFinite(Number(video.duration)) ? Math.max(0, Number(video.duration)) : 0),
      sourceUrl: absoluteUrl(input && input.sourceUrl),
      baseUrl: absoluteUrl(input && input.baseUrl),
      authHeaders: input && input.authHeaders || null,
      videoMode: input && input.videoMode,
      videoCodec: input && input.videoCodec,
      audioCodec: input && input.audioCodec,
      audioChannels: input && input.audioChannels,
      video: video || null
    };
    media.playbackMode = input && input.playbackMode || (isInternalTranscode(url) ? "transcode" : "final");
    media.castUrl = absoluteUrl(input && input.castUrl) || url;
    media.castContentType = input && input.castContentType || contentTypeFor(media.castUrl || media.url);
    return media;
  }

  function setStatus(text) {
    var button = byId("velora-cast-button");
    if (!button) return;
    button.title = text || "Cast video to TV";
    button.setAttribute("aria-label", text || "Cast video to TV");
  }

  function setPhase(phase) {
    state.phase = phase || state.phase;
    syncButton();
  }

  function clearBlockedTimer() {
    if (state.blockedTimer) {
      window.clearTimeout(state.blockedTimer);
      state.blockedTimer = null;
    }
  }

  function showBlockedMessage() {
    if (!state.pendingCastClick || state.sdkReady || isIosOrSafari()) return;
    state.sdkLoading = false;
    var oldScript = byId("velora-google-cast-sdk");
    if (oldScript) oldScript.remove();
    window.alert(
      "Cast is blocked by your browser.\n\n" +
      "Allow local network access and allow Google Cast / third-party scripts for this site, then click Cast again."
    );
  }

  function armBlockedTimer() {
    if (isIosOrSafari()) return;
    clearBlockedTimer();
    state.blockedTimer = window.setTimeout(showBlockedMessage, 5500);
  }

  function rememberSessionActive(active) {
    try {
      if (active) localStorage.setItem(SESSION_KEY, "1");
      else localStorage.removeItem(SESSION_KEY);
    } catch (_) { }
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
    return !!(
      state.sdkReady &&
      window.chrome &&
      window.chrome.cast &&
      window.cast &&
      window.cast.framework &&
      window.cast.framework.CastContext
    );
  }

  function isTvReachableCastUrl(url) {
    if (!url || /^(blob:|data:|about:|mediastream:)/i.test(String(url))) return false;
    try {
      var parsed = new URL(url, window.location.href);
      if (parsed.protocol !== "https:") return false;
      return !/^(localhost|127(?:\.\d+){3}|\[::1\])$/i.test(parsed.hostname);
    } catch (_) {
      return false;
    }
  }

  function syncButton() {
    var button = byId("velora-cast-button");
    if (!button) return;
    var video = activeVideo();
    var hasMedia = !!state.currentMedia || !!normalizeMedia({}) || (video && !!(video.currentSrc || video.src));
    var isIos = isIosOrSafari();
    var isConnected = !!session() || !!state.airPlayConnected;

    button.disabled = !hasMedia || state.requestPending;
    button.classList.toggle("velora-cast-button--connected", isConnected);

    if (!hasMedia) setStatus(isIos ? "Lancez une vidéo pour diffuser (AirPlay)" : "Start a video first, then cast it");
    else if (state.requestPending) setStatus("Opening Cast picker");
    else if (isConnected) setStatus(isIos ? "AirPlay actif sur TV" : "Casting to TV");
    else if (isIos) setStatus("Diffuser sur la TV (AirPlay)");
    else if (!state.sdkReady) setStatus("Cast loading. If nothing opens, allow local network access for this site.");
    else if (session() && state.phase === "LOADING_MEDIA") setStatus("Sending video to TV");
    else if (session()) setStatus("Casting to TV");
    else if (state.castState === "NO_DEVICES_AVAILABLE") setStatus("Cast ready. Click to search for TVs.");
    else setStatus("Cast video to TV");
  }

  function buildMediaRequest(media) {
    var castUrl = media.castUrl || media.url;
    var mediaInfo = new window.chrome.cast.media.MediaInfo(castUrl, media.castContentType || contentTypeFor(castUrl));
    mediaInfo.streamType = media.isLive
      ? window.chrome.cast.media.StreamType.LIVE
      : window.chrome.cast.media.StreamType.BUFFERED;
    mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
    mediaInfo.metadata.title = media.title || "VeloraVIP";
    if (media.poster) mediaInfo.metadata.images = [{ url: media.poster }];

    var request = new window.chrome.cast.media.LoadRequest(mediaInfo);
    request.autoplay = true;
    if (!media.isLive && media.duration) mediaInfo.duration = media.duration;
    if (!media.isLive) request.currentTime = Math.max(0, (Number(media.position) || 0) - (Number(media.offset) || 0));
    return request;
  }

  async function loadMediaOnCast(media, options) {
    if (!canUseGoogleCast()) return false;
    var castSession = session();
    if (!castSession) return false;
    if (!isTvReachableCastUrl(media.castUrl || media.url)) {
      window.alert("This video URL cannot be reached by the TV. Cast needs a public HTTPS playback URL, not localhost, blob, or browser-only media.");
      return false;
    }
    var key = mediaKey(media);
    if (!options || !options.force) {
      if (state.lastLoadedKey === key) return true;
    }
    try {
      setPhase("LOADING_MEDIA");
      await castSession.loadMedia(buildMediaRequest(media));
      state.lastLoadedKey = key;
      state.currentMedia = media;
      rememberSessionActive(true);
      setPhase("PLAYING");
      return true;
    } catch (error) {
      console.warn("[VeloraCast] loadMedia failed", error);
      setPhase("CONNECTED");
      return false;
    }
  }

  function scheduleCastReload(force) {
    window.clearTimeout(state.loadTimer);
    state.loadTimer = window.setTimeout(function () {
      if (state.currentMedia && session()) loadMediaOnCast(state.currentMedia, { force: !!force });
    }, 120);
  }

  function setMedia(input, options) {
    var media = normalizeMedia(input || {});
    if (!media) return null;
    media.explicit = !(options && options.implicit);
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
    var mediaUrl = absoluteUrl(url);
    if (
      state.currentMedia &&
      state.currentMedia.explicit &&
      state.currentMedia.video === (video || state.activeVideo) &&
      mediaUrl &&
      mediaUrl === state.currentMedia.url
    ) {
      return state.currentMedia;
    }
    return setMedia(Object.assign({}, meta || {}, { video: video || activeVideo(), url: url }), { implicit: true });
  }

  function clearLocalCastSessionState() {
    window.clearTimeout(state.loadTimer);
    state.loadTimer = null;
    state.requestPending = false;
    state.pendingInitialMedia = null;
    state.pendingInitialToken += 1;
    state.lastLoadedKey = "";
    state.castState = "NO_DEVICES_AVAILABLE";
    state.sessionState = "NO_SESSION";
    rememberSessionActive(false);
    setPhase("DISCONNECTED");
  }

  async function requestUniversalCast() {
    var video = activeVideo();

    // 1. iPhone / iPad / Safari: Trigger native WebKit AirPlay Target Picker
    if (isIosOrSafari() || (video && typeof video.webkitShowPlaybackTargetPicker === "function")) {
      if (!video) {
        window.alert("Lancez d'abord une vidéo, puis touchez le bouton pour diffuser sur votre TV.");
        return;
      }
      if (typeof video.webkitShowPlaybackTargetPicker === "function") {
        try {
          video.webkitShowPlaybackTargetPicker();
          return;
        } catch (err) {
          console.warn("[VeloraCast] webkitShowPlaybackTargetPicker failed", err);
        }
      }
      window.alert(
        "Pour diffuser sur votre TV avec AirPlay :\n\n" +
        "1. Ouvrez le Centre de contrôle iOS (glissez depuis le coin supérieur droit)\n" +
        "2. Touchez l'icône AirPlay dans le widget de lecture."
      );
      return;
    }

    // 2. Android / PC / Chrome: Use Google Cast SDK
    return requestGoogleCast();
  }

  async function requestGoogleCast() {
    if (state.requestPending) return;
    if (!state.sdkReady) {
      state.pendingCastClick = true;
      setPhase("CONNECTING");
      setStatus("Cast loading");
      armBlockedTimer();
      loadGoogleCastSdk();
      return;
    }

    if (!canUseGoogleCast()) {
      window.alert("Google Cast is not available in this browser. Please use Chrome on Android or PC.");
      return;
    }

    var selectedMedia = normalizeMedia(state.currentMedia || {});
    if (!selectedMedia) {
      window.alert("Start a video first, then cast it.");
      return;
    }

    try {
      var context = window.cast.framework.CastContext.getInstance();
      var castSession = context.getCurrentSession();
      if (!castSession) {
        state.requestPending = true;
        state.pendingInitialMedia = selectedMedia;
        var token = ++state.pendingInitialToken;
        syncButton();
        setPhase("CONNECTING");
        try {
          await context.requestSession();
        } catch (error) {
          clearLocalCastSessionState();
          syncButton();
          console.warn("[VeloraCast] requestSession failed", error);
          return;
        }
        castSession = context.getCurrentSession();
        state.requestPending = false;
        syncButton();
        if (!castSession || token !== state.pendingInitialToken) {
          clearLocalCastSessionState();
          syncButton();
          return;
        }
        var mediaToLoad = state.pendingInitialMedia;
        state.pendingInitialMedia = null;
        if (!(await loadMediaOnCast(mediaToLoad, { force: true }))) {
          window.alert("Cast session started, but the video could not be loaded on the TV.");
        }
        return;
      }

      if (!(await loadMediaOnCast(selectedMedia, { force: true }))) {
        window.alert("Cast session started, but the video could not be loaded on the TV.");
      }
    } catch (error) {
      console.warn("[VeloraCast] loadMedia failed", error);
      window.alert("Cast session started, but the video could not be loaded on the TV.");
    } finally {
      state.requestPending = false;
      syncButton();
    }
  }

  function onCastApiAvailable(available) {
    clearBlockedTimer();
    state.sdkReady = Boolean(available && window.cast && window.cast.framework && window.chrome && window.chrome.cast);
    state.sdkLoading = false;
    if (!state.sdkReady) {
      syncButton();
      return;
    }

    var context = window.cast.framework.CastContext.getInstance();
    if (!state.sdkInitialized) {
      state.sdkInitialized = true;
      context.setOptions({
        receiverApplicationId: RECEIVER_APP_ID,
        autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        resumeSavedSession: true
      });

      context.addEventListener(window.cast.framework.CastContextEventType.CAST_STATE_CHANGED, function (event) {
        state.castState = event.castState;
        syncButton();
      });

      context.addEventListener(window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED, function (event) {
        state.sessionState = event.sessionState;
        if (
          event.sessionState === window.cast.framework.SessionState.SESSION_STARTED ||
          event.sessionState === window.cast.framework.SessionState.SESSION_RESUMED
        ) {
          rememberSessionActive(true);
          setPhase("CONNECTED");
        }
        if (
          event.sessionState === window.cast.framework.SessionState.SESSION_ENDED ||
          event.sessionState === window.cast.framework.SessionState.SESSION_START_FAILED
        ) {
          clearLocalCastSessionState();
        }
        syncButton();
      });
    }

    syncButton();
    if (state.pendingCastClick) state.pendingCastClick = false;
  }

  function loadGoogleCastSdk() {
    if (isIosOrSafari()) return; // Skip Google Cast SDK on iOS Safari
    window.__onGCastApiAvailable = onCastApiAvailable;
    if (state.sdkReady || state.sdkLoading) return;
    var oldScript = byId("velora-google-cast-sdk");
    if (oldScript) oldScript.remove();
    state.sdkLoading = true;
    var script = document.createElement("script");
    script.id = "velora-google-cast-sdk";
    script.async = true;
    script.src = CAST_SDK_SRC;
    script.onerror = function () {
      state.sdkLoading = false;
      clearBlockedTimer();
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
    } catch (_) { }

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

      // AirPlay listener on iOS / WebKit
      if (typeof video.addEventListener === "function") {
        video.addEventListener("webkitplaybacktargetavailabilitychanged", function (event) {
          state.airPlayAvailable = event.availability === "available";
          syncButton();
        });
        video.addEventListener("webkitcurrentplaybacktargetiswirelesschanged", function (event) {
          state.airPlayConnected = !!(video.webkitCurrentPlaybackTargetIsWireless);
          syncButton();
        });
      }

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
    var button = document.createElement("button");
    button.id = "velora-cast-button";
    button.className = "velora-cast-button";
    button.type = "button";
    button.title = isIosOrSafari() ? "Diffuser sur TV (AirPlay)" : "Cast video to TV";
    button.setAttribute("aria-label", button.title);
    button.innerHTML =
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>' +
      '</svg>';
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      requestUniversalCast();
    });
    document.body.appendChild(button);
    syncButton();
  }

  function boot() {
    window.VeloraCast = {
      setMedia: setMedia,
      rememberMedia: rememberMedia,
      cast: requestUniversalCast,
      getCurrentMedia: function () {
        return state.currentMedia || normalizeMedia({});
      },
      isConnected: function () {
        return !!session() || !!state.airPlayConnected;
      },
      getState: function () {
        return {
          phase: state.phase,
          castState: state.castState,
          sessionState: state.sessionState,
          connected: !!session() || !!state.airPlayConnected,
          airPlay: isIosOrSafari(),
          media: state.currentMedia
        };
      }
    };

    patchVideoSources();
    installButton();
    bindVideos();
    if (!isIosOrSafari()) {
      loadGoogleCastSdk();
    }
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

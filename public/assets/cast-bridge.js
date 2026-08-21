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
    if (!state.pendingCastClick || state.sdkReady) return;
    state.sdkLoading = false;
    var oldScript = byId("velora-google-cast-sdk");
    if (oldScript) oldScript.remove();
    window.alert(
      "Cast is blocked by your browser.\n\n" +
      "Allow local network access and allow Google Cast / third-party scripts for this site, then click Cast again."
    );
  }

  function armBlockedTimer() {
    clearBlockedTimer();
    state.blockedTimer = window.setTimeout(showBlockedMessage, 5500);
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
    return !!(
      state.sdkReady &&
      window.chrome &&
      window.chrome.cast &&
      window.cast &&
      window.cast.framework &&
      window.cast.framework.CastContext
    );
  }

  function castUnavailableMessage() {
    if (state.sdkLoading) return "Cast is still loading. If your browser asks for local network access, allow it and click Cast again.";
    if (!state.sdkReady) return "Google Cast is not ready. Your browser may have blocked the Cast SDK or local network access for this site.";
    if (!window.chrome || !window.chrome.cast) return "Google Cast is not supported or not enabled in this browser.";
    if (!window.cast || !window.cast.framework || !window.cast.framework.CastContext) return "Google Cast framework is not available in this browser.";
    return "Google Cast is not available right now. Allow local network access for this site, then click Cast again.";
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
    var hasMedia = !!state.currentMedia || !!normalizeMedia({});
    button.disabled = !hasMedia || state.requestPending;
    button.classList.toggle("velora-cast-button--connected", !!session());
    if (!hasMedia) setStatus("Start a video first, then cast it");
    else if (state.requestPending) setStatus("Opening Cast picker");
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
      window.alert(castUnavailableMessage());
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
          window.alert(castErrorMessage(error));
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

  function castErrorMessage(error) {
    var message = error && (error.description || error.message || error.code || error);
    var text = String(message || "Unknown Cast error");
    if (/cancel/i.test(text)) return "TV selection was cancelled.";
    if (/SESSION_ERROR/i.test(text)) return "Could not create a Cast session in this browser.";
    if (/timeout/i.test(text)) return "Cast timed out. Check that browser local network access is allowed for this site.";
    if (/receiver|session/i.test(text)) return text;
    return text + ". If the browser asks for local network access, allow it and click Cast again.";
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
      if (state.pendingCastClick) showBlockedMessage();
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
    var existing = byId("velora-cast-button");
    if (existing) existing.remove();
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
      },
      getState: function () {
        return {
          phase: state.phase,
          castState: state.castState,
          sessionState: state.sessionState,
          connected: !!session(),
          media: state.currentMedia
        };
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

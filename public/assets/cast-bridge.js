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
    requestPending: false,
    pendingInitialMedia: null,
    pendingInitialToken: 0,
    sdkInitialized: false,
    loadTimer: null,
    blockedTimer: null,
    phase: "DISCONNECTED",
    activeVideo: null,
    remoteUiTimer: null
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
      duration: input && Number.isFinite(Number(input.duration)) ? Math.max(0, Number(input.duration)) : 0,
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
    return state.sdkReady && !!window.cast && !!window.cast.framework && !!window.chrome && !!window.chrome.cast;
  }

  function castUnavailableMessage() {
    if (state.sdkLoading) return "Cast is still loading. If your browser asks for local network access, allow it and click Cast again.";
    if (!state.sdkReady) return "Google Cast is not ready. Your browser may have blocked the Cast SDK or local network access for this site.";
    if (!window.chrome || !window.chrome.cast) return "Google Cast is not supported or not enabled in this browser.";
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
      updateRemoteUi();
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
    state.remotePlayer = null;
    state.remoteController = null;
    rememberSessionActive(false);
    setPhase("DISCONNECTED");
    updateRemoteUi();
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

    var selectedMedia = state.currentMedia || normalizeMedia({});
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
          setupRemotePlayer();
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

    setupRemotePlayer();
    syncButton();
    if (state.pendingCastClick) state.pendingCastClick = false;
  }

  function setupRemotePlayer() {
    if (!state.sdkReady || !window.cast || !window.cast.framework || state.remoteController) return;
    state.remotePlayer = new window.cast.framework.RemotePlayer();
    state.remoteController = new window.cast.framework.RemotePlayerController(state.remotePlayer);
    addRemoteEvent("IS_CONNECTED_CHANGED", function () {
      syncButton();
      updateRemoteUi();
    });
    addRemoteEvent("MEDIA_INFO_CHANGED", updateRemoteUi);
    addRemoteEvent("IS_PAUSED_CHANGED", updateRemoteUi);
    addRemoteEvent("CURRENT_TIME_CHANGED", updateRemoteUi);
    addRemoteEvent("DURATION_CHANGED", updateRemoteUi);
    addRemoteEvent("CAN_SEEK_CHANGED", updateRemoteUi);
  }

  function addRemoteEvent(name, handler) {
    try {
      var type = window.cast.framework.RemotePlayerEventType[name];
      if (type) state.remoteController.addEventListener(type, handler);
    } catch (_) {}
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
    if (byId("velora-cast-button")) return;
    var style = document.createElement("style");
    style.textContent = [
      ".velora-cast-button{position:fixed;right:16px;bottom:calc(78px + env(safe-area-inset-bottom,0px));z-index:2147483000;width:50px;height:50px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.22);border-radius:14px;background:rgba(12,14,24,.86);color:#fff;box-shadow:0 12px 30px rgba(0,0,0,.42);backdrop-filter:blur(14px);cursor:pointer}",
      ".velora-cast-button:hover,.velora-cast-button:focus-visible{background:rgba(83,105,255,.95);outline:none}",
      ".velora-cast-button[disabled]{opacity:.42;cursor:not-allowed}",
      ".velora-cast-button--connected{background:rgba(34,197,94,.9)}",
      ".velora-cast-button svg{width:26px;height:26px;fill:currentColor}",
      ".velora-cast-remote{position:fixed;left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:2147482999;display:none;align-items:center;gap:8px;padding:10px;border:1px solid rgba(255,255,255,.18);border-radius:12px;background:rgba(12,14,24,.9);color:#fff;box-shadow:0 12px 30px rgba(0,0,0,.38);backdrop-filter:blur(14px)}",
      ".velora-cast-remote--visible{display:flex}",
      ".velora-cast-remote button{width:38px;height:34px;border:1px solid rgba(255,255,255,.18);border-radius:9px;background:rgba(255,255,255,.08);color:#fff;font-weight:800;cursor:pointer}",
      ".velora-cast-remote button:disabled{opacity:.35;cursor:not-allowed}",
      ".velora-cast-remote input{flex:1;min-width:80px}",
      ".velora-cast-remote time{font-size:12px;min-width:96px;text-align:center;color:rgba(255,255,255,.82)}",
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
    installRemoteUi();
    syncButton();
  }

  function installRemoteUi() {
    if (byId("velora-cast-remote")) return;
    var remote = document.createElement("div");
    remote.id = "velora-cast-remote";
    remote.className = "velora-cast-remote";
    remote.innerHTML =
      '<button type="button" data-cast-remote="back">-30</button>' +
      '<button type="button" data-cast-remote="play">Play</button>' +
      '<button type="button" data-cast-remote="fwd">+30</button>' +
      '<input type="range" min="0" max="1000" value="0" step="1" data-cast-remote="seek" />' +
      '<time data-cast-remote="time">00:00 / 00:00</time>';
    remote.addEventListener("click", function (event) {
      var action = event.target && event.target.getAttribute("data-cast-remote");
      if (!action || action === "seek") return;
      event.preventDefault();
      if (action === "play") return remotePlayPause();
      if (action === "back") return remoteSeekBy(-30);
      if (action === "fwd") return remoteSeekBy(30);
    });
    remote.querySelector('[data-cast-remote="seek"]').addEventListener("change", function (event) {
      var duration = castDuration();
      if (!duration) return;
      var value = Number(event.target.value) || 0;
      remoteSeekTo(duration * value / 1000);
    });
    document.body.appendChild(remote);
  }

  function castDuration() {
    var media = state.currentMedia || {};
    var remoteDuration = state.remotePlayer && Number(state.remotePlayer.duration);
    return media.duration || (Number.isFinite(remoteDuration) ? Math.max(0, remoteDuration + (media.offset || 0)) : 0);
  }

  function castPosition() {
    var remoteTime = state.remotePlayer && Number(state.remotePlayer.currentTime);
    return Math.max(0, (state.currentMedia && state.currentMedia.offset || 0) + (Number.isFinite(remoteTime) ? remoteTime : 0));
  }

  function isLiveMedia(media) {
    return !!(media && (media.isLive || media.type === "live"));
  }

  function canServerSeek(media) {
    return !!(
      media &&
      !isLiveMedia(media) &&
      media.playbackMode === "transcode" &&
      media.sourceUrl &&
      Number(media.duration) > 0
    );
  }

  function canNativeCastSeek(media) {
    var remoteDuration = state.remotePlayer && Number(state.remotePlayer.duration);
    return !!(
      media &&
      !isLiveMedia(media) &&
      state.remotePlayer &&
      state.remotePlayer.canSeek &&
      (Number(media.duration) > 0 || Number.isFinite(remoteDuration) && remoteDuration > 0)
    );
  }

  function canSeekMedia(media) {
    return canServerSeek(media) || canNativeCastSeek(media);
  }

  function fmt(seconds) {
    seconds = Math.max(0, Math.floor(Number(seconds) || 0));
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(s).padStart(2, "0");
  }

  function updateRemoteUi() {
    var remote = byId("velora-cast-remote");
    if (!remote) return;
    var media = state.currentMedia;
    var visible = !!session() && !!media && !media.isLive;
    remote.classList.toggle("velora-cast-remote--visible", visible);
    if (!visible || !state.remotePlayer) {
      if (state.remoteUiTimer) {
        window.clearInterval(state.remoteUiTimer);
        state.remoteUiTimer = null;
      }
      return;
    }
    var duration = castDuration();
    var position = castPosition();
    var canSeek = canSeekMedia(media);
    var seek = remote.querySelector('[data-cast-remote="seek"]');
    var play = remote.querySelector('[data-cast-remote="play"]');
    var back = remote.querySelector('[data-cast-remote="back"]');
    var fwd = remote.querySelector('[data-cast-remote="fwd"]');
    var time = remote.querySelector('[data-cast-remote="time"]');
    if (seek) {
      seek.disabled = !canSeek;
      seek.value = duration ? String(Math.max(0, Math.min(1000, Math.round(position / duration * 1000)))) : "0";
    }
    if (play) play.textContent = state.remotePlayer.isPaused ? "Play" : "Pause";
    if (back) back.disabled = !canSeek;
    if (fwd) fwd.disabled = !canSeek;
    if (time) time.textContent = fmt(position) + " / " + fmt(duration);
    if (visible && !state.remoteUiTimer) {
      state.remoteUiTimer = window.setInterval(updateRemoteUi, 1000);
    }
  }

  function remotePlayPause() {
    if (!state.remoteController) return;
    try {
      state.remoteController.playOrPause();
    } catch (_) {}
  }

  function remoteSeekBy(delta) {
    remoteSeekTo(castPosition() + delta);
  }

  async function remoteSeekTo(targetSeconds) {
    var media = state.currentMedia;
    if (!media || isLiveMedia(media) || !state.remoteController || !state.remotePlayer) return;
    var duration = castDuration();
    var target = Math.max(0, duration ? Math.min(duration, targetSeconds) : targetSeconds);
    if (canServerSeek(media) && media.baseUrl) {
      await restartCastTranscodeAt(target);
      return;
    }
    if (!canNativeCastSeek(media)) return;
    state.remotePlayer.currentTime = Math.max(0, target - (media.offset || 0));
    try {
      state.remoteController.seek();
    } catch (_) {}
    updateRemoteUi();
  }

  async function restartCastTranscodeAt(targetSeconds) {
    var media = state.currentMedia;
    if (!media || !media.sourceUrl || !media.baseUrl) return;
    try {
      var response = await fetch(new URL("/api/transcode/session", media.baseUrl).href, {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, media.authHeaders || {}),
        body: JSON.stringify({
          url: media.sourceUrl,
          mode: "vod",
          startAt: targetSeconds,
          seekOffset: targetSeconds,
          videoMode: media.videoMode,
          videoCodec: media.videoCodec,
          audioCodec: media.audioCodec,
          audioChannels: media.audioChannels
        })
      });
      if (!response.ok) throw new Error(await response.text());
      var payload = await response.json();
      if (!payload || !payload.playlistUrl) throw new Error("No Cast transcode playlist returned");
      var nextMedia = Object.assign({}, media, {
        url: new URL(payload.playlistUrl, media.baseUrl).href,
        castUrl: new URL(payload.playlistUrl, media.baseUrl).href,
        position: targetSeconds,
        offset: targetSeconds,
        duration: Number(payload.durationSeconds) || media.duration || 0,
        playbackMode: "transcode"
      });
      state.currentMedia = nextMedia;
      await loadMediaOnCast(nextMedia, { force: true });
    } catch (error) {
      console.warn("[VeloraCast] Cast transcode seek failed", error);
      window.alert("Could not seek this Cast movie yet. Please try again.");
    }
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

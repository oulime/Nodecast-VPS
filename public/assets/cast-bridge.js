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
    destinationMode: "tv", // 'tv' (diffuse to TV) | 'phone' (play locally on phone, keep cast running)
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

  function getAuthToken() {
    try {
      return localStorage.getItem("authToken") || "";
    } catch (_) {
      return "";
    }
  }

  function getSavedDestinationMode() {
    try {
      var saved = localStorage.getItem("velora_cast_destination");
      return saved === "phone" ? "phone" : "tv";
    } catch (_) {
      return "tv";
    }
  }

  state.destinationMode = getSavedDestinationMode();

  function isCastAutoDiffuseOn() {
    return state.destinationMode === "tv";
  }

  function setCastDestination(mode) {
    state.destinationMode = mode === "phone" ? "phone" : "tv";
    try {
      localStorage.setItem("velora_cast_destination", state.destinationMode);
    } catch (_) {}

    var wrap = document.getElementById("vel-cast-active-bar-wrap");
    if (wrap) {
      var phoneBtn = wrap.querySelector(".vel-cast-segment-btn[data-mode='phone']");
      var tvBtn = wrap.querySelector(".vel-cast-segment-btn[data-mode='tv']");
      var subSpan = wrap.querySelector(".vel-cast-capsule-sub");
      var deviceName = getCastDeviceName();

      if (phoneBtn) phoneBtn.classList.toggle("is-active", state.destinationMode === "phone");
      if (tvBtn) tvBtn.classList.toggle("is-active", state.destinationMode === "tv");

      if (subSpan) {
        subSpan.textContent = state.destinationMode === "tv"
          ? deviceName
          : deviceName + " · Mode téléphone";
        subSpan.classList.toggle("is-idle", state.destinationMode === "phone");
      }
    }

    if (state.destinationMode === "tv") {
      haltMobilePlayersForCast();
      var media = state.currentMedia || normalizeMedia({});
      if (media && session()) {
        loadMediaOnCast(media, { force: true });
      }
      showCastToast("Diffusion automatique vers la TV activée");
    } else {
      showCastToast("Prochaines vidéos sur le téléphone (la TV continue)");
    }
  }

  function haltMobilePlayersForCast() {
    try {
      if (typeof window.veloraCloseActiveTranscodeSession === "function") {
        window.veloraCloseActiveTranscodeSession();
      }
    } catch (_) {}

    var closeVodBtn = document.getElementById("btn-close-vod-player");
    if (closeVodBtn) {
      try { closeVodBtn.click(); } catch (_) {}
    }
    var closeLiveBtn = document.getElementById("btn-close-player");
    if (closeLiveBtn) {
      try { closeLiveBtn.click(); } catch (_) {}
    }

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
      } catch (_) {}
    });
  }

  function resolveFullPublicUrl(url) {
    if (!url) return "";
    var target = String(url).trim();
    if (!target || /^(blob:|data:|about:|mediastream:)/i.test(target)) return "";
    try {
      if (target.indexOf("/") === 0) {
        target = window.location.origin + target;
      } else if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(target)) {
        target = target.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, window.location.origin);
      }
      var token = getAuthToken();
      if (token && (target.indexOf("/api/") !== -1 || target.indexOf("/proxy") !== -1)) {
        if (target.indexOf("token=") === -1) {
          target += (target.indexOf("?") === -1 ? "?" : "&") + "token=" + encodeURIComponent(token);
        }
      }
      return target;
    } catch (_) {
      return target;
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
      var url = resolveFullPublicUrl(candidates[i]);
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
    var video = (input && input.video) || activeVideo();
    var app = window.app || {};
    var appUrl = (app.pages && app.pages.watch && app.pages.watch.currentUrl) || (app.player && app.player.currentUrl);
    
    var rawUrl = (
      (input && (input.url || input.castUrl || input.direct_source || input.sourceUrl)) ||
      (video && video.__veloraCastUrl) ||
      (video && video.hls && video.hls.url) ||
      (window.hls && window.hls.url) ||
      window.__veloraCurrentStreamUrl ||
      appUrl ||
      (video && video.currentSrc && !/^(blob:|data:|about:|mediastream:)/i.test(video.currentSrc) ? video.currentSrc : "") ||
      (video && video.src && !/^(blob:|data:|about:|mediastream:)/i.test(video.src) ? video.src : "")
    );

    var url = resolveFullPublicUrl(rawUrl);
    if (!url) return null;

    var type = (input && input.type) || ((input && input.isLive) ? "live" : isM3u8(url) ? "video" : "video");
    var isLive = Boolean(input && input.isLive) || type === "live" || Boolean(input && input.stream_type === "live");
    var title = (input && (input.title || input.name)) || pageTitle(video);
    var poster = resolveFullPublicUrl((input && input.poster) || pagePoster(video));

    var media = {
      type: type,
      url: url,
      castUrl: url,
      title: title,
      name: title,
      poster: poster,
      contentType: (input && input.contentType) || contentTypeFor(url),
      castContentType: (input && input.castContentType) || contentTypeFor(url),
      isLive: isLive,
      position: isLive ? 0 : logicalPosition(input, video),
      offset: input && Number.isFinite(Number(input.offset)) ? Math.max(0, Number(input.offset)) : 0,
      duration: input && Number.isFinite(Number(input.duration))
        ? Math.max(0, Number(input.duration))
        : (!isLive && video && Number.isFinite(Number(video.duration)) ? Math.max(0, Number(video.duration)) : 0),
      sourceUrl: resolveFullPublicUrl(input && input.sourceUrl),
      baseUrl: resolveFullPublicUrl(input && input.baseUrl),
      authHeaders: input && input.authHeaders || null,
      videoMode: input && input.videoMode,
      videoCodec: input && input.videoCodec,
      audioCodec: input && input.audioCodec,
      audioChannels: input && input.audioChannels,
      video: video || null
    };
    media.playbackMode = (input && input.playbackMode) || (isInternalTranscode(url) ? "transcode" : "final");
    return media;
  }

  function setStatus(text) {
    var button = byId("velora-cast-button");
    if (!button) return;
    button.title = text || "Diffuser la vidéo sur votre TV";
    button.setAttribute("aria-label", text || "Diffuser la vidéo sur votre TV");
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

  function rememberSessionActive(active) {
    try {
      if (active) localStorage.setItem(SESSION_KEY, "1");
      else localStorage.removeItem(SESSION_KEY);
    } catch (_) { }
  }

  function session() {
    if (!state.sdkReady || !window.cast || !window.cast.framework || !window.cast.framework.CastContext) return null;
    try {
      return window.cast.framework.CastContext.getInstance().getCurrentSession();
    } catch (_) {
      return null;
    }
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

  function syncButton() {
    var button = byId("velora-cast-button");
    if (!button) return;
    var isIos = isIosOrSafari();
    var isConnected = !!session() || !!state.airPlayConnected;

    button.disabled = false;
    button.classList.toggle("velora-cast-button--connected", isConnected);

    if (isConnected) setStatus(isIos ? "AirPlay actif sur TV" : "Diffusion active sur TV");
    else if (isIos) setStatus("Diffuser sur la TV (AirPlay)");
    else if (session() && state.phase === "LOADING_MEDIA") setStatus("Envoi vers la TV…");
    else if (session()) setStatus("Diffusion active sur TV");
    else setStatus("Diffuser sur la TV (Cast / AirPlay)");
  }

  function getCastDeviceName() {
    if (state.airPlayConnected) return "AirPlay (Apple TV)";
    var castSession = session();
    if (castSession && castSession.getCastDevice()) {
      return castSession.getCastDevice().friendlyName || "Google Cast";
    }
    return "Smart TV (Cast)";
  }

  function showCastToast(msg) {
    try {
      var existing = document.getElementById("vel-cast-toast");
      if (existing) existing.remove();

      var toast = document.createElement("div");
      toast.id = "vel-cast-toast";
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

  function removeCastActiveBar() {
    var wrap = document.getElementById("vel-cast-active-bar-wrap");
    if (wrap) {
      wrap.remove();
    }
    if (document.body && document.body.classList) {
      document.body.classList.remove("vel-cast-active-bar-open");
    }
    if (document.documentElement && document.documentElement.style) {
      document.documentElement.style.removeProperty("--vel-cast-bar-height");
    }
  }

  function attachCastStopBtnHandler(btn) {
    if (!btn || btn._hasCastHandler) return;
    btn._hasCastHandler = true;
    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      stopCast(true);
      showCastToast("Diffusion Cast arrêtée");
    };
  }

  // Dedicated Cast luxury top floating capsule bar
  function showCastActiveBar() {
    var isConnected = (typeof session === "function" && !!session()) || state.airPlayConnected;
    if (!isConnected) {
      removeCastActiveBar();
      return;
    }

    // Stop paired TV association diffusion so both cannot run at the same time
    if (typeof window.veloraStopTvAssociationDiffusion === "function") {
      try { window.veloraStopTvAssociationDiffusion(); } catch (_) {}
    }

    var media = state.currentMedia || normalizeMedia({});
    var activeTitle = media ? (media.title || media.name || "Vidéo") : "Diffusion TV";
    var deviceName = getCastDeviceName();
    var isTvMode = isCastAutoDiffuseOn();

    var existingWrap = document.getElementById("vel-cast-active-bar-wrap");
    if (existingWrap) {
      var iconWrap = existingWrap.querySelector(".vel-cast-capsule-icon-wrap");
      if (iconWrap) {
        iconWrap.classList.add("is-streaming");
        iconWrap.innerHTML = `
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
          </svg>
          <span class="vel-cast-live-beacon"></span>
        `;
      }

      var titleSpan = existingWrap.querySelector(".vel-cast-capsule-title");
      if (titleSpan) titleSpan.textContent = activeTitle;

      var subSpan = existingWrap.querySelector(".vel-cast-capsule-sub");
      if (subSpan) {
        subSpan.textContent = isTvMode ? deviceName : deviceName + " · Mode téléphone";
        subSpan.classList.toggle("is-idle", !isTvMode);
      }

      var phoneBtn = existingWrap.querySelector(".vel-cast-segment-btn[data-mode='phone']");
      var tvBtn = existingWrap.querySelector(".vel-cast-segment-btn[data-mode='tv']");
      if (phoneBtn) phoneBtn.classList.toggle("is-active", !isTvMode);
      if (tvBtn) tvBtn.classList.toggle("is-active", isTvMode);

      var stopBtn = existingWrap.querySelector("#vel-cast-stop-playback");
      if (stopBtn) attachCastStopBtnHandler(stopBtn);

      document.body.classList.add("vel-cast-active-bar-open");
      var barEl = existingWrap.querySelector(".vel-cast-active-bar");
      var h = (barEl ? barEl.offsetHeight : 48) + 14;
      document.documentElement.style.setProperty("--vel-cast-bar-height", h + "px");
      return;
    }

    var wrap = document.createElement("div");
    wrap.id = "vel-cast-active-bar-wrap";
    wrap.className = "vel-cast-active-bar-wrap";
    wrap.innerHTML = `
      <div class="vel-cast-active-bar">
        <div class="vel-cast-capsule-left">
          <div class="vel-cast-capsule-icon-wrap is-streaming">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
            </svg>
            <span class="vel-cast-live-beacon"></span>
          </div>
          <div class="vel-cast-capsule-meta">
            <span class="vel-cast-capsule-title">${activeTitle}</span>
            <span class="vel-cast-capsule-sub ${!isTvMode ? "is-idle" : ""}">${isTvMode ? deviceName : deviceName + " · Mode téléphone"}</span>
          </div>
        </div>
        <div class="vel-cast-capsule-actions">
          <button type="button" id="vel-cast-stop-playback" class="vel-cast-stop-btn" title="Arrêter la diffusion Cast">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
              <rect x="5" y="5" width="14" height="14" rx="2.5"/>
            </svg>
          </button>
          <div class="vel-cast-segmented-switch" role="group" aria-label="Destination de lecture">
            <button type="button" class="vel-cast-segment-btn ${!isTvMode ? "is-active" : ""}" data-mode="phone" title="Regarder les prochaines vidéos sur le téléphone">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="3" ry="3"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
            </button>
            <button type="button" class="vel-cast-segment-btn ${isTvMode ? "is-active" : ""}" data-mode="tv" title="Diffuser sur la TV (Cast)">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    document.body.classList.add("vel-cast-active-bar-open");

    requestAnimationFrame(function () {
      var barEl = wrap.querySelector(".vel-cast-active-bar");
      var h = (barEl ? barEl.offsetHeight : 48) + 14;
      document.documentElement.style.setProperty("--vel-cast-bar-height", h + "px");
    });

    var phoneBtn = wrap.querySelector(".vel-cast-segment-btn[data-mode='phone']");
    if (phoneBtn) {
      phoneBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        setCastDestination("phone");
      });
    }

    var tvBtn = wrap.querySelector(".vel-cast-segment-btn[data-mode='tv']");
    if (tvBtn) {
      tvBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        setCastDestination("tv");
      });
    }

    var stopBtn = wrap.querySelector("#vel-cast-stop-playback");
    if (stopBtn) attachCastStopBtnHandler(stopBtn);
  }

  function stopCast(resumeLocal) {
    var castSession = session();
    var media = state.currentMedia || normalizeMedia({});
    var currentTime = 0;
    if (castSession) {
      try {
        var remoteMedia = castSession.getMediaSession();
        if (remoteMedia && Number.isFinite(remoteMedia.currentTime)) {
          currentTime = remoteMedia.currentTime;
        }
      } catch (_) {}
      try {
        castSession.endSession(true);
      } catch (_) {}
    }
    if (state.airPlayConnected && state.activeVideo) {
      state.airPlayConnected = false;
    }
    clearLocalCastSessionState();
    syncButton();
    removeCastActiveBar();

    if (resumeLocal && media) {
      var video = media.video || activeVideo();
      if (video) {
        if (currentTime > 0 && !media.isLive) {
          try { video.currentTime = currentTime; } catch (_) {}
        }
        try { video.play().catch(function () {}); } catch (_) {}
      }
    }

    try {
      document.dispatchEvent(new CustomEvent("velora-cast-disconnected"));
    } catch (_) {}
  }

  function buildMediaRequest(media) {
    var castUrl = resolveFullPublicUrl(media.castUrl || media.url);
    var mediaInfo = new window.chrome.cast.media.MediaInfo(castUrl, media.castContentType || contentTypeFor(castUrl));
    mediaInfo.streamType = media.isLive
      ? window.chrome.cast.media.StreamType.LIVE
      : window.chrome.cast.media.StreamType.BUFFERED;
    mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
    mediaInfo.metadata.title = media.title || "VeloraVIP";
    if (media.poster) mediaInfo.metadata.images = [{ url: resolveFullPublicUrl(media.poster) }];

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
    
    var castUrl = resolveFullPublicUrl(media.castUrl || media.url);
    if (!castUrl) {
      window.alert("L'URL du flux n'est pas accessible par la TV.");
      return false;
    }
    var key = mediaKey(media);
    if (!options || !options.force) {
      if (state.lastLoadedKey === key) return true;
    }
    try {
      setPhase("LOADING_MEDIA");
      // Stop paired Smart TV diffusion before loading on Cast
      if (typeof window.veloraStopTvAssociationDiffusion === "function") {
        try { window.veloraStopTvAssociationDiffusion(); } catch (_) {}
      }
      await castSession.loadMedia(buildMediaRequest(media));
      state.lastLoadedKey = key;
      state.currentMedia = media;
      rememberSessionActive(true);
      setPhase("PLAYING");
      showCastActiveBar();
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
      if (state.currentMedia && session() && isCastAutoDiffuseOn()) {
        loadMediaOnCast(state.currentMedia, { force: !!force });
      }
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

    if (session() || state.airPlayConnected) {
      showCastActiveBar();
      // Only reload on Cast automatically if destination switch is on 'TV'
      if (session() && isCastAutoDiffuseOn()) {
        haltMobilePlayersForCast();
        scheduleCastReload(true);
      }
    }
    return media;
  }

  function rememberMedia(video, url, meta) {
    var fullUrl = resolveFullPublicUrl(url);
    if (!fullUrl) return state.currentMedia;
    if (video) {
      video.__veloraCastUrl = fullUrl;
      state.activeVideo = video;
    }
    window.__veloraCurrentStreamUrl = fullUrl;
    if (
      state.currentMedia &&
      state.currentMedia.explicit &&
      state.currentMedia.video === (video || state.activeVideo) &&
      fullUrl &&
      fullUrl === state.currentMedia.url
    ) {
      return state.currentMedia;
    }
    return setMedia(Object.assign({}, meta || {}, { video: video || activeVideo(), url: fullUrl }), { implicit: true });
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
    var media = state.currentMedia || normalizeMedia({});

    // 1. If active Cast session is running -> stop it
    if (session()) {
      stopCast(true);
      showCastToast("Diffusion Cast arrêtée");
      return;
    }

    // 2. iPhone / iPad / Safari: Native WebKit AirPlay Target Picker
    if (isIosOrSafari() || (video && typeof video.webkitShowPlaybackTargetPicker === "function")) {
      if (video && typeof video.webkitShowPlaybackTargetPicker === "function") {
        try {
          video.webkitShowPlaybackTargetPicker();
          return;
        } catch (err) {
          console.warn("[VeloraCast] webkitShowPlaybackTargetPicker failed", err);
        }
      }
      if (!video && !media) {
        showCastToast("Lancez d'abord une vidéo pour la diffuser.");
        return;
      }
      window.alert(
        "Pour diffuser sur votre TV avec AirPlay :\n\n" +
        "1. Ouvrez le Centre de contrôle iOS (glissez depuis le coin supérieur droit)\n" +
        "2. Touchez l'icône AirPlay dans le widget de lecture."
      );
      return;
    }

    // 3. Google Cast Sender Framework if available
    if (canUseGoogleCast()) {
      return requestGoogleCast();
    }

    // 4. Try initializing CastContext if cast object already injected
    if (window.cast && window.cast.framework && initCastContext()) {
      return requestGoogleCast();
    }

    // 5. If Paired Smart TV is connected via /api/tv, diffuse to it!
    if (typeof window.veloraSendToPairedTv === "function" && media) {
      var sent = window.veloraSendToPairedTv(media);
      if (sent) return;
    }

    // 6. If no video is active
    if (!video && !media) {
      showCastToast("Lancez d'abord une vidéo pour la diffuser.");
      return;
    }

    // 7. If Google Cast SDK is loading
    if (state.sdkLoading) {
      state.pendingCastClick = true;
      showCastToast("Initialisation de Google Cast en cours…");
      return;
    }

    // 8. Otherwise inform the user of options
    window.alert(
      "Diffusion TV (Cast & AirPlay) :\n\n" +
      "• Utilisez Google Chrome sur PC/Android pour caster directement sur Chromecast ou TV Android.\n" +
      "• Utilisez Safari sur iPhone/iPad/Mac pour diffuser via AirPlay.\n" +
      "• Vous pouvez également associer votre Smart TV depuis le menu Profil avec un code à 4 chiffres."
    );
  }

  async function requestGoogleCast() {
    if (state.requestPending) return;
    if (!canUseGoogleCast()) {
      initCastContext();
      if (!canUseGoogleCast()) {
        showCastToast("Google Cast n'est pas disponible dans ce navigateur.");
        return;
      }
    }

    var selectedMedia = state.currentMedia || normalizeMedia({});
    if (!selectedMedia) {
      showCastToast("Lancez d'abord une vidéo pour la diffuser.");
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
          console.warn("[VeloraCast] requestSession cancelled or failed", error);
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
        haltMobilePlayersForCast();
        if (!(await loadMediaOnCast(mediaToLoad, { force: true }))) {
          window.alert("Session Cast connectée, mais la vidéo n'a pas pu être chargée sur la TV.");
        }
        return;
      }

      haltMobilePlayersForCast();
      if (!(await loadMediaOnCast(selectedMedia, { force: true }))) {
        window.alert("Session Cast connectée, mais la vidéo n'a pas pu être chargée sur la TV.");
      }
    } catch (error) {
      console.warn("[VeloraCast] loadMedia error", error);
      window.alert("La vidéo n'a pas pu être diffusée sur la TV.");
    } finally {
      state.requestPending = false;
      syncButton();
    }
  }

  function initCastContext() {
    if (state.sdkInitialized) return true;
    if (!window.cast || !window.cast.framework || !window.cast.framework.CastContext) return false;

    try {
      var context = window.cast.framework.CastContext.getInstance();
      context.setOptions({
        receiverApplicationId: RECEIVER_APP_ID,
        autoJoinPolicy: window.chrome && window.chrome.cast && window.chrome.cast.AutoJoinPolicy
          ? window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
          : "origin_scoped",
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
          showCastActiveBar();
        }
        if (
          event.sessionState === window.cast.framework.SessionState.SESSION_ENDED ||
          event.sessionState === window.cast.framework.SessionState.SESSION_START_FAILED
        ) {
          clearLocalCastSessionState();
          removeCastActiveBar();
        }
        syncButton();
      });

      state.sdkReady = true;
      state.sdkInitialized = true;
      state.sdkLoading = false;
      syncButton();
      return true;
    } catch (e) {
      console.warn("[VeloraCast] initCastContext error:", e);
      return false;
    }
  }

  function onCastApiAvailable(available) {
    clearBlockedTimer();
    state.sdkLoading = false;
    if (available && window.cast && window.cast.framework) {
      state.sdkReady = true;
      initCastContext();
    }
    syncButton();
    if (state.pendingCastClick) {
      state.pendingCastClick = false;
      requestGoogleCast();
    }
  }

  function loadGoogleCastSdk() {
    if (isIosOrSafari()) return;
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

  function patchHlsAndVideoSources() {
    // 1. Hook into window.Hls prototype
    function hookHls() {
      if (window.Hls && window.Hls.prototype && !window.Hls.prototype.__veloraCastHooked) {
        window.Hls.prototype.__veloraCastHooked = true;
        var origLoad = window.Hls.prototype.loadSource;
        window.Hls.prototype.loadSource = function (url) {
          window.__veloraCurrentStreamUrl = url;
          if (this.media) {
            this.media.__veloraCastUrl = url;
            rememberMedia(this.media, url);
          }
          if (session() && isCastAutoDiffuseOn()) {
            haltMobilePlayersForCast();
          }
          return origLoad.apply(this, arguments);
        };
        var origAttach = window.Hls.prototype.attachMedia;
        window.Hls.prototype.attachMedia = function (media) {
          if (media) {
            var u = this.url || window.__veloraCurrentStreamUrl;
            if (u) {
              media.__veloraCastUrl = u;
              rememberMedia(media, u);
            }
          }
          return origAttach.apply(this, arguments);
        };
      }
    }

    hookHls();
    window.addEventListener("DOMContentLoaded", hookHls);

    // 2. HTMLMediaElement.src descriptor
    if (!HTMLMediaElement.prototype.__veloraCastPatched) {
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
              if (value && !/^(blob:|data:|about:|mediastream:)/i.test(String(value))) {
                rememberMedia(this, value);
              }
              return descriptor.set.call(this, value);
            }
          });
        }
      } catch (_) { }

      var originalSetAttribute = HTMLMediaElement.prototype.setAttribute;
      if (typeof originalSetAttribute === "function") {
        HTMLMediaElement.prototype.setAttribute = function (name, value) {
          if (String(name || "").toLowerCase() === "src" && value && !/^(blob:|data:|about:|mediastream:)/i.test(String(value))) {
            rememberMedia(this, value);
          }
          return originalSetAttribute.apply(this, arguments);
        };
      }
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
          if (state.airPlayConnected) {
            showCastActiveBar();
          } else {
            removeCastActiveBar();
          }
          syncButton();
        });
      }

      ["play", "playing", "loadstart", "loadedmetadata", "canplay"].forEach(function (eventName) {
        video.addEventListener(eventName, function () {
          state.activeVideo = video;
          var u = video.__veloraCastUrl || (video.hls && video.hls.url) || window.__veloraCurrentStreamUrl;
          if (u) {
            rememberMedia(video, u);
          } else if (video.currentSrc && !/^(blob:|data:|about:|mediastream:)/i.test(video.currentSrc)) {
            rememberMedia(video, video.currentSrc);
          }
          if (session() && isCastAutoDiffuseOn()) {
            haltMobilePlayersForCast();
          }
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
    button.title = isIosOrSafari() ? "Diffuser sur TV (AirPlay)" : "Diffuser sur la TV (Cast / AirPlay)";
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

  function injectActiveBarStyles() {
    if (document.getElementById("velora-cast-styles")) return;
    var style = document.createElement("style");
    style.id = "velora-cast-styles";
    style.textContent = `
      .vel-cast-active-bar-wrap {
        position: fixed;
        top: max(8px, env(safe-area-inset-top));
        left: 0;
        right: 0;
        display: flex;
        justify-content: center;
        z-index: 999999;
        pointer-events: none;
        animation: velCastSlideDown 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes velCastSlideDown {
        from { transform: translateY(-120%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .vel-cast-active-bar {
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
      body.vel-cast-active-bar-open {
        padding-top: var(--vel-cast-bar-height, 62px) !important;
        box-sizing: border-box !important;
      }
      body.vel-cast-active-bar-open .main--velora {
        height: calc(100dvh - var(--vel-cast-bar-height, 62px)) !important;
        height: calc(100vh - var(--vel-cast-bar-height, 62px)) !important;
      }
      body.vel-cast-active-bar-open #vel-floating-search,
      body.vel-cast-active-bar-open .vel-floating-search {
        top: calc(12px + var(--vel-cast-bar-height, 62px)) !important;
      }
      .vel-cast-capsule-left {
        display: flex;
        align-items: center;
        gap: 9px;
        min-width: 0;
        flex: 1;
      }
      .vel-cast-capsule-icon-wrap {
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
      .vel-cast-capsule-icon-wrap.is-streaming {
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.4), rgba(16, 185, 129, 0.3));
        border-color: rgba(52, 211, 153, 0.5);
        color: #6ee7b7;
      }
      .vel-cast-live-beacon {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: #10b981;
        border: 2px solid #0f0b21;
        box-shadow: 0 0 6px #10b981;
        animation: velCastBeaconPulse 2s infinite ease-in-out;
      }
      @keyframes velCastBeaconPulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.25); opacity: 0.6; }
      }
      .vel-cast-capsule-meta {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
        overflow: hidden;
      }
      .vel-cast-capsule-title {
        font-size: 13.5px;
        font-weight: 800;
        color: #ffffff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        letter-spacing: -0.01em;
      }
      .vel-cast-capsule-sub {
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
      .vel-cast-capsule-sub.is-idle {
        color: #94a3b8;
      }
      .vel-cast-capsule-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }
      .vel-cast-segmented-switch {
        display: flex;
        align-items: center;
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 999px;
        padding: 2px;
        gap: 2px;
      }
      .vel-cast-segment-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 28px;
        border-radius: 999px;
        border: none;
        background: transparent;
        color: rgba(255, 255, 255, 0.4);
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        padding: 0;
      }
      .vel-cast-segment-btn svg {
        display: block;
        transition: transform 0.15s ease, stroke 0.2s ease;
      }
      .vel-cast-segment-btn:hover {
        color: rgba(255, 255, 255, 0.85);
      }
      .vel-cast-segment-btn.is-active {
        background: rgba(255, 255, 255, 0.18);
        color: #ffffff;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2);
      }
      .vel-cast-segment-btn.is-active svg {
        stroke-width: 2.2;
      }
      .vel-cast-stop-btn {
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
      .vel-cast-stop-btn:hover {
        background: rgba(239, 68, 68, 0.4);
        border-color: #ef4444;
        color: #ffffff;
        box-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
        transform: scale(1.06);
      }
      .vel-cast-stop-btn:active {
        transform: scale(0.92);
      }
      .vel-cast-stop-btn.is-stopping {
        opacity: 0.4;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function boot() {
    window.VeloraCast = {
      setMedia: setMedia,
      rememberMedia: rememberMedia,
      cast: requestUniversalCast,
      stop: stopCast,
      setDestination: setCastDestination,
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
          destinationMode: state.destinationMode,
          connected: !!session() || !!state.airPlayConnected,
          airPlay: isIosOrSafari(),
          media: state.currentMedia
        };
      }
    };

    injectActiveBarStyles();
    patchHlsAndVideoSources();
    installButton();
    bindVideos();

    if (window.cast && window.cast.framework && window.cast.framework.CastContext) {
      initCastContext();
    } else if (!isIosOrSafari()) {
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

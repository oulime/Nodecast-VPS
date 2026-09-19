(function () {
  "use strict";

  var state = {
    deviceId: null,
    deviceName: "Smart TV",
    isLinked: false,
    user: null,
    token: null,
    eventSource: null,
    currentMedia: null,
    hls: null,
    osdTimer: null,
    nextCountdownTimer: null,
    nextSecondsRemaining: 5,
    nextCancelled: false
  };

  var dom = {
    standby: document.getElementById("tv-standby"),
    playerWrap: document.getElementById("tv-player-wrap"),
    video: document.getElementById("tv-video"),
    buffering: document.getElementById("tv-buffering"),
    osd: document.getElementById("tv-osd"),
    timeCurrent: document.getElementById("tv-time-current"),
    timeTotal: document.getElementById("tv-time-total"),
    progressBar: document.getElementById("tv-progress-bar"),
    progressBuffered: document.getElementById("tv-progress-buffered"),
    progressTrack: document.getElementById("tv-progress-track"),
    progressRow: document.getElementById("tv-progress-row"),
    btnAspect: document.getElementById("tv-btn-aspect"),
    centerControls: document.getElementById("tv-center-controls"),
    btnRw: document.getElementById("tv-btn-rw"),
    btnPlayPause: document.getElementById("tv-btn-playpause"),
    playPauseIcon: document.getElementById("tv-playpause-icon"),
    btnFf: document.getElementById("tv-btn-ff"),
    pinDisplay: document.getElementById("tv-pin-display"),
    statusBar: document.getElementById("tv-status-bar"),
    statusText: document.getElementById("tv-status-text"),
    linkedBox: document.getElementById("tv-linked-box"),
    linkedUser: document.getElementById("tv-linked-username"),
    nextCard: document.getElementById("tv-next-card"),
    nextTitle: document.getElementById("tv-next-title"),
    nextSeconds: document.getElementById("tv-next-seconds"),
    nextCancel: document.getElementById("tv-next-cancel"),
    nextPlay: document.getElementById("tv-next-play")
  };

  // Format seconds to mm:ss or hh:mm:ss
  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = Math.floor(seconds % 60);
    if (h > 0) {
      return (
        h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s
      );
    }
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  // Cookie helper functions for long-term Smart TV persistence
  function getCookie(name) {
    var match = document.cookie.match(new RegExp("(^|;\\s*)(" + name + ")=([^;]*)"));
    return match ? decodeURIComponent(match[3]) : null;
  }

  function setCookie(name, value, days) {
    var expires = "";
    if (days) {
      var d = new Date();
      d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = "; expires=" + d.toUTCString();
    }
    document.cookie = name + "=" + encodeURIComponent(value) + expires + "; path=/; SameSite=Lax";
  }

  /* =========================================================================
     WATCH HISTORY & "REPRENDRE LA LECTURE" (SYNC WITH APP & DB)
     ========================================================================= */
  var MIN_WATCH_SECONDS = 2;
  var FINISHED_WATCH_PERCENT = 90;

  var sessionTracker = {
    mediaId: null,
    continuousSeconds: 0,
    lastTick: null,
    qualified: false,
    lastDbSync: 0
  };

  var cachedUserHistory = [];
  var resumeMinWatchMinutes = 3;

  function getEffectiveDuration() {
    var v = dom.video;
    if (v && Number.isFinite(v.duration) && v.duration > 0 && v.duration !== Infinity) {
      return v.duration;
    }
    var m = state.currentMedia;
    if (m) {
      var d = Number(m.duration || m.duration_secs || m.totalDuration || m.total_duration);
      if (Number.isFinite(d) && d > 0) return d;
    }
    return 0;
  }

  function getResumeMinWatchSeconds() {
    var m = resumeMinWatchMinutes;
    try {
      var cached = localStorage.getItem("velora_resume_min_watch_minutes");
      if (cached != null && !isNaN(parseFloat(cached))) {
        m = parseFloat(cached);
      }
    } catch (_) {}
    return Math.max(0, m * 60);
  }

  async function syncResumeMinWatchSetting() {
    try {
      var res = await fetch("/api/velora-db/rest/v1/admin_settings?key=eq.resume_min_watch_minutes", { cache: "no-store" });
      if (res.ok) {
        var rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0 && rows[0].value != null) {
          var val = parseFloat(rows[0].value);
          if (!isNaN(val) && val >= 0) {
            resumeMinWatchMinutes = val;
            try { localStorage.setItem("velora_resume_min_watch_minutes", String(val)); } catch (_) {}
          }
        }
      }
    } catch (_) {}
  }

  function getAuthToken() {
    try {
      return localStorage.getItem("authToken") || state.token || "";
    } catch (_) {
      return "";
    }
  }

  function getActiveUserId() {
    if (state.user && state.user.id) return String(state.user.id);
    if (state.user && state.user.username) return String(state.user.username);
    return "guest";
  }

  function getLocalHistory() {
    try {
      var uid = getActiveUserId();
      var raw = localStorage.getItem("velora_resume_v13_" + uid);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    return cachedUserHistory || [];
  }

  function saveLocalHistory(items) {
    if (!Array.isArray(items)) return;
    cachedUserHistory = items;
    try {
      var uid = getActiveUserId();
      localStorage.setItem("velora_resume_v13_" + uid, JSON.stringify(items.slice(0, 60)));
    } catch (_) {}
  }

  async function loadUserHistoryFromDb() {
    var token = getAuthToken();
    if (!token) return;
    try {
      var res = await fetch("/api/history?limit=60", {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store"
      });
      if (res.ok) {
        var rows = await res.json();
        if (Array.isArray(rows)) {
          var items = rows.map(function (r) {
            var d = r.data || {};
            var dur = r.duration || d.duration || 0;
            var prog = r.progress || d.currentTime || 0;
            var pct = dur > 0 ? Math.round((prog / dur) * 100) : (d.progressPercent || 0);
            return Object.assign({}, d, {
              id: r.item_id ? (r.item_type === "series" ? "series:" + (r.parent_id || r.item_id) + ":ep:" + r.item_id : "movie:" + r.item_id) : d.id,
              type: r.item_type === "series" ? "series" : "movie",
              currentTime: prog,
              duration: dur,
              progressPercent: Math.min(100, Math.max(0, pct)),
              isFinished: pct >= FINISHED_WATCH_PERCENT,
              updatedAt: r.updated_at ? Number(r.updated_at) : (d.updatedAt || Date.now())
            });
          });
          saveLocalHistory(items);
        }
      }
    } catch (_) {}
  }

  function normalizeTitle(s) {
    return String(s || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();
  }

  function isMediaAlreadyInResume(media) {
    if (!media) return false;
    var history = getLocalHistory();
    if (!history || !history.length) return false;

    var mId = String(media.id || media.streamId || media.episodeStreamId || "");
    var mSeriesId = String(media.seriesId || "");
    var mEpId = String(media.episodeStreamId || media.streamId || "");
    var mNameNorm = normalizeTitle(media.name || media.title || media.seriesName || "");
    var mSeason = Number(media.seasonNumber) || null;
    var mEpisode = Number(media.episodeNumber) || null;

    return history.some(function (it) {
      if (!it) return false;
      var itId = String(it.id || "");
      var itStreamId = String(it.streamId || "");
      var itEpId = String(it.episodeStreamId || "");
      var itSeriesId = String(it.seriesId || "");
      var itNameNorm = normalizeTitle(it.name || it.seriesName || it.title || "");

      if (mId && (itId === mId || itStreamId === mId || itEpId === mId)) return true;
      if (media.type === "series" || mSeriesId) {
        if (mSeriesId && (itSeriesId === mSeriesId || itStreamId === mSeriesId)) {
          if (mEpId && (itEpId === mEpId || itStreamId === mEpId)) return true;
          if (mSeason != null && mEpisode != null && it.seasonNumber === mSeason && it.episodeNumber === mEpisode) return true;
        }
      }
      if (mNameNorm && itNameNorm === mNameNorm) {
        if (media.type === "series") {
          if (mSeason != null && mEpisode != null && it.seasonNumber === mSeason && it.episodeNumber === mEpisode) return true;
        } else {
          return true;
        }
      }
      return false;
    });
  }

  function updateSessionTrackerMedia(media) {
    if (!media) {
      sessionTracker.mediaId = null;
      sessionTracker.continuousSeconds = 0;
      sessionTracker.lastTick = null;
      sessionTracker.qualified = false;
      return;
    }

    var mId = String(media.id || media.streamId || media.episodeStreamId || media.url || "");
    var alreadyInResume = isMediaAlreadyInResume(media);

    sessionTracker.mediaId = mId;
    sessionTracker.continuousSeconds = 0;
    sessionTracker.lastTick = Date.now();
    sessionTracker.qualified = alreadyInResume;
    sessionTracker.lastDbSync = 0;
  }

  function recordWatchProgress(isEnd) {
    var v = dom.video;
    var media = state.currentMedia;
    if (!media || media.isLive) return; // Strictly skip Live TV channels
    var mediaType = media.type || (media.seasonNumber ? "series" : "movie");
    if (mediaType !== "movie" && mediaType !== "series") return;

    var cur = (v && Number.isFinite(v.currentTime)) ? v.currentTime : (media.currentTime || 0);
    var dur = getEffectiveDuration();
    if (dur <= 0 && Number(media.duration) > 0) dur = Number(media.duration);

    if (cur < MIN_WATCH_SECONDS && !isEnd) return;

    var duration = Math.round(dur);
    var currentPos = isEnd ? duration : Math.max(0, Math.round(cur));
    var percent = isEnd ? 100 : (duration > 0 ? Math.round((currentPos / duration) * 100) : 5);
    var isFinished = isEnd || (duration > 0 && percent >= FINISHED_WATCH_PERCENT);

    var minSec = getResumeMinWatchSeconds();
    var isQualified = isFinished || sessionTracker.qualified || (sessionTracker.continuousSeconds >= minSec);

    // Enforce minimum watch duration for first-time viewing
    if (!isQualified) {
      return;
    }

    sessionTracker.qualified = true;

    var isSeries = mediaType === "series" || !!media.seriesId || !!media.episodeStreamId || !!media.seasonNumber;
    var sId = media.seriesId || media.streamId || "";
    var epId = media.episodeStreamId || media.streamId || "";
    var mediaId = isSeries ? ("series:" + (sId || "series") + ":ep:" + (epId || "ep")) : ("movie:" + (media.streamId || sId || "vod"));

    var entry = {
      id: String(mediaId),
      type: isSeries ? "series" : "movie",
      streamId: media.streamId || epId || null,
      seriesId: sId || null,
      episodeStreamId: isSeries ? (epId || null) : null,
      seasonNumber: media.seasonNumber != null ? Number(media.seasonNumber) : (isSeries ? 1 : null),
      episodeNumber: media.episodeNumber != null ? Number(media.episodeNumber) : (isSeries ? 1 : null),
      name: media.name || media.title || "Vidéo",
      seriesName: media.seriesName || media.name || media.title || null,
      episodeTitle: media.episodeTitle || null,
      thumbUrl: media.thumbUrl || media.poster || "",
      backdropUrl: media.backdropUrl || media.poster || media.thumbUrl || "",
      horizontal_thumb: media.horizontal_thumb || "",
      title_logo: media.title_logo || "",
      has_integrated_title: Boolean(media.has_integrated_title),
      packageId: media.packageId || "",
      sourceId: media.sourceId || "",
      containerExtension: media.containerExtension || "mp4",
      currentTime: isFinished ? duration : currentPos,
      duration: duration,
      progressPercent: isFinished ? 100 : Math.min(100, Math.max(1, percent)),
      isFinished: isFinished,
      updatedAt: Date.now()
    };

    // Update local history
    var list = getLocalHistory().filter(function (it) {
      return String(it.id) !== String(entry.id);
    });
    list.unshift(entry);
    saveLocalHistory(list);

    // Sync to DB
    var token = getAuthToken();
    if (token) {
      try {
        var itemId = entry.type === "series" ? (entry.episodeStreamId || entry.streamId) : entry.streamId;
        var parentId = entry.type === "series" ? (entry.seriesId || entry.streamId) : null;
        fetch("/api/history", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token
          },
          body: JSON.stringify({
            id: String(itemId),
            type: entry.type === "series" ? "series" : "movie",
            parentId: parentId ? String(parentId) : null,
            progress: entry.currentTime || 0,
            duration: entry.duration || 0,
            sourceId: entry.sourceId || null,
            data: entry
          }),
          keepalive: isEnd
        }).catch(function () {});
      } catch (_) {}
    }
  }

  var lastHistoryTick = Date.now();
  var lastHistorySyncTime = 0;

  function onHistoryTimeUpdate() {
    var v = dom.video;
    if (!v || v.paused || v.seeking || v.ended) {
      lastHistoryTick = Date.now();
      return;
    }

    var now = Date.now();
    var delta = (now - lastHistoryTick) / 1000;
    lastHistoryTick = now;

    if (delta > 0 && delta < 5) {
      sessionTracker.continuousSeconds += delta;
    }

    var minSec = getResumeMinWatchSeconds();
    if (!sessionTracker.qualified && sessionTracker.continuousSeconds >= minSec) {
      sessionTracker.qualified = true;
      recordWatchProgress(false);
      lastHistorySyncTime = now;
    } else if (sessionTracker.qualified) {
      if (now - lastHistorySyncTime >= 12000) {
        lastHistorySyncTime = now;
        recordWatchProgress(false);
      }
    }
  }

  // Fetch or renew TV session with multi-layer permanent identity
  async function initSession() {
    try {
      var urlParams = new URLSearchParams(window.location.search);
      var keyParam = urlParams.get("key") || urlParams.get("token");
      var storedToken = keyParam || getCookie("velora_tv_token") || localStorage.getItem("velora_tv_token");
      var storedId = localStorage.getItem("velora_tv_device_id");

      var queryParts = [];
      if (storedToken) queryParts.push("tvToken=" + encodeURIComponent(storedToken));
      if (storedId) queryParts.push("deviceId=" + encodeURIComponent(storedId));
      var queryString = queryParts.length ? "?" + queryParts.join("&") : "";

      var res = await fetch("/api/tv/session" + queryString, { cache: "no-store" });
      var data = await res.json();

      if (!data.ok) throw new Error(data.error || "Erreur de session");

      state.deviceId = data.deviceId;
      state.currentPin = data.pin;
      state.tvToken = data.tvToken;

      // Persist across all browser storage layers (survives TV power-off / reboots)
      if (data.deviceId) localStorage.setItem("velora_tv_device_id", data.deviceId);
      if (data.tvToken) {
        localStorage.setItem("velora_tv_token", data.tvToken);
        setCookie("velora_tv_token", data.tvToken, 3650); // 10 years
      }

      if (data.isLinked) {
        state.isLinked = true;
        state.user = data.user;
        if (data.token) localStorage.setItem("authToken", data.token);
        renderLinkedState(data.user, data.pin);
        syncResumeMinWatchSetting();
        loadUserHistoryFromDb();
      } else {
        state.isLinked = false;
        renderPin(data.pin);
      }

      connectEvents();
    } catch (err) {
      console.error("[TV] Session init error:", err);
      if (dom.statusText) dom.statusText.textContent = "Erreur de connexion au serveur. Reconnexion…";
      setTimeout(initSession, 3000);
    }
  }

  function renderPin(pin) {
    if (!dom.pinDisplay) return;
    dom.pinDisplay.innerHTML = "";
    var digits = String(pin || "----").split("");
    digits.forEach(function (d) {
      var span = document.createElement("span");
      span.className = "tv-pin__digit is-active";
      span.textContent = d;
      dom.pinDisplay.appendChild(span);
    });
    if (dom.statusText) dom.statusText.textContent = "En attente de connexion depuis votre mobile…";
    if (dom.linkedBox) dom.linkedBox.classList.add("hidden");
  }

  function renderLinkedState(user, pin) {
    if (dom.linkedBox) dom.linkedBox.classList.remove("hidden");
    if (dom.linkedUser) dom.linkedUser.textContent = "Compte : " + (user.displayName || user.username);
    if (dom.statusText) {
      dom.statusText.innerHTML = "🟢 Prêt à diffuser. " + (pin ? "<span style='margin-left:14px;opacity:0.85;font-size:15px;color:#c4b5fd;'>Lier un autre mobile : Code <strong>" + pin + "</strong></span>" : "");
    }
  }

  // Connect SSE real-time stream with auto-reconnection
  function connectEvents() {
    if (state.eventSource) {
      try { state.eventSource.close(); } catch (_) {}
      state.eventSource = null;
    }

    if (!state.deviceId) return;

    var sseUrl = "/api/tv/events?deviceId=" + encodeURIComponent(state.deviceId);
    state.eventSource = new EventSource(sseUrl);

    state.eventSource.onopen = function () {
      console.log("[TV] SSE stream connected");
    };

    state.eventSource.onmessage = function (event) {
      try {
        var data = JSON.parse(event.data);
        handleServerEvent(data);
      } catch (_) {}
    };

    state.eventSource.onerror = function () {
      console.warn("[TV] SSE connection lost. Reconnecting in 2s…");
      if (state.eventSource) {
        try { state.eventSource.close(); } catch (_) {}
        state.eventSource = null;
      }
      if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
      state.reconnectTimer = setTimeout(connectEvents, 2000);
    };
  }

  // Smart TV wake-from-sleep listeners: reconnect stream instantly when TV screen turns on
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      if (!state.eventSource || state.eventSource.readyState === 2 /* CLOSED */) {
        console.log("[TV] Screen woke up. Reconnecting SSE stream…");
        connectEvents();
      }
    }
  });
  window.addEventListener("pageshow", function () {
    if (!state.eventSource || state.eventSource.readyState === 2) {
      connectEvents();
    }
  });

  function handleServerEvent(event) {
    if (!event || !event.type) return;

    switch (event.type) {
      case "PAIRED":
        state.isLinked = true;
        state.user = { username: event.username, displayName: event.displayName };
        if (event.token) localStorage.setItem("authToken", event.token);
        if (event.tvToken) {
          state.tvToken = event.tvToken;
          localStorage.setItem("velora_tv_token", event.tvToken);
          setCookie("velora_tv_token", event.tvToken, 3650);
        }
        renderLinkedState(state.user, state.currentPin);
        syncResumeMinWatchSetting();
        loadUserHistoryFromDb();
        break;

      case "UNLINK":
        state.isLinked = false;
        state.user = null;
        localStorage.removeItem("authToken");
        stopPlayback();
        initSession();
        break;

      case "PLAY":
        if (event.token) {
          localStorage.setItem("authToken", event.token);
        }
        if (event.media) {
          var newUrl = String(event.media.url || "").trim();
          var curUrl = state.currentMedia ? String(state.currentMedia.url || "").trim() : "";
          if (newUrl && curUrl === newUrl && state.lastPlayTime && (Date.now() - state.lastPlayTime < 2500)) {
            console.log("[TV] Duplicate PLAY event ignored within 2.5s window");
            break;
          }
          state.lastPlayTime = Date.now();
          playMedia(event.media);
        }
        break;

      case "COMMAND":
        handleCommand(event.action, event.value);
        break;
    }
  }

  function handleCommand(action, value) {
    var v = dom.video;
    if (!v) return;

    switch (action) {
      case "play":
        v.play().catch(function () {});
        wakeOsd();
        break;
      case "pause":
        v.pause();
        wakeOsd();
        break;
      case "seek":
        if (Number.isFinite(value)) {
          v.currentTime = Math.max(0, Math.min(v.duration || 0, value));
          wakeOsd();
        }
        break;
      case "stop":
        stopPlayback();
        break;
      case "next":
        if (state.currentMedia && state.currentMedia.nextEpisode) {
          playMedia(state.currentMedia.nextEpisode);
        }
        break;
    }
  }

  function updateMuteButton() {}

  function unmuteAudio() {
    var v = dom.video;
    if (!v) return;
    v.muted = false;
    v.volume = 1;
  }

  function attemptPlayMedia() {
    var v = dom.video;
    if (!v) return;

    function onPlaySuccess() {
      if (dom.buffering) dom.buffering.classList.add("hidden");
      updatePlayPauseIcon();
      wakeOsd();
      reportTvState("playing");
    }

    // Try unmuted play first
    v.muted = false;
    v.volume = 1;
    var p = v.play();
    if (p !== undefined) {
      p.then(onPlaySuccess).catch(function (err) {
        console.warn("[TV] Unmuted autoplay blocked by browser policy, fallback to muted:", err);
        // Muted playback is allowed by 100% of TV/mobile/desktop browsers without gestures!
        v.muted = true;
        var p2 = v.play();
        if (p2 !== undefined) {
          p2.then(function () {
            onPlaySuccess();
          }).catch(function (err2) {
            console.warn("[TV] Muted play error:", err2);
          });
        }
      });
    }
  }

  // Universal passive TV audio unlock on first user remote button or click
  function unlockTvAudio() {
    if (dom.video && dom.video.muted) {
      dom.video.muted = false;
      dom.video.volume = 1;
    }
    try {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        var actx = new AudioContextClass();
        if (actx.state === "suspended") actx.resume();
      }
    } catch (_) {}
  }
  window.addEventListener("keydown", unlockTvAudio, { capture: true, passive: true });
  window.addEventListener("click", unlockTvAudio, { capture: true, passive: true });
  window.addEventListener("pointerdown", unlockTvAudio, { capture: true, passive: true });

  function triggerTvFullscreen(forceEnterOnly) {
    try {
      var wrap = dom.playerWrap || document.documentElement;
      var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);

      if (!isFs) {
        // Request fullscreen on our custom player wrap so our custom UI and controls remain visible
        if (wrap && wrap.requestFullscreen) {
          var p = wrap.requestFullscreen();
          if (p && p.catch) p.catch(function () {});
        } else if (wrap && wrap.webkitRequestFullscreen) {
          wrap.webkitRequestFullscreen();
        } else if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(function () {});
        } else if (document.documentElement.webkitRequestFullscreen) {
          document.documentElement.webkitRequestFullscreen();
        }
      } else if (!forceEnterOnly) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(function () {});
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn("[TV] Fullscreen error:", err);
    }
  }

  /* =========================================================================
     TV STREAM SLOT & CONCURRENCY HEARTBEAT (1 TV + 1 Machine)
     ========================================================================= */
  var tvStreamSession = null;

  function sendTvHeartbeat(action) {
    var token = localStorage.getItem("authToken");
    var deviceId = state.deviceId || localStorage.getItem("velora_tv_device_id");
    var tvToken = state.tvToken || localStorage.getItem("velora_tv_token");
    if (!deviceId) return;

    var currentMedia = state.currentMedia || {};
    var streamId = currentMedia.id || currentMedia.url || (dom.video ? dom.video.currentSrc : "tv-stream");
    var streamTitle = currentMedia.title || "";

    fetch("/api/proxy/stream/heartbeat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": token ? ("Bearer " + token) : "",
        "X-Device-Id": deviceId,
        "X-TV-Token": tvToken || ""
      },
      body: JSON.stringify({
        action: action,
        deviceType: "tv",
        deviceId: deviceId,
        streamId: streamId,
        streamTitle: streamTitle,
        sessionKey: tvStreamSession ? tvStreamSession.sessionKey : ""
      }),
      keepalive: action === "stop"
    }).then(function (res) {
      if (res.status === 409) {
        return res.json().then(function (data) {
          if (data && (data.inUse || data.superseded)) {
            console.warn("[TV] Stream rejected: another TV session is already active");
            stopPlayback();
            if (dom.statusText) dom.statusText.textContent = data.message || "Lecture impossible : Une autre TV diffuse déjà sur ce compte.";
          }
        });
      }
    }).catch(function (err) {
      console.warn("[TV] Heartbeat network warning:", err);
    });
  }

  function startTvStreamTracking() {
    if (tvStreamSession && tvStreamSession.timer) {
      clearInterval(tvStreamSession.timer);
    }

    var sessionKey = "tv_sk_" + Math.random().toString(36).slice(2, 11) + "_" + Date.now().toString(36);
    tvStreamSession = {
      sessionKey: sessionKey,
      timer: null
    };

    sendTvHeartbeat("register");

    tvStreamSession.timer = setInterval(function () {
      var v = dom.video;
      if (!v || v.paused || v.ended || !v.currentSrc) {
        stopTvStreamTracking(false);
        return;
      }
      sendTvHeartbeat("heartbeat");
    }, 15000);
  }

  function stopTvStreamTracking(sendStop) {
    if (sendStop === undefined) sendStop = true;
    if (!tvStreamSession) return;

    if (tvStreamSession.timer) {
      clearInterval(tvStreamSession.timer);
      tvStreamSession.timer = null;
    }

    if (sendStop) {
      sendTvHeartbeat("stop");
    }
    tvStreamSession = null;
  }

  // Play a stream on TV
  function playMedia(media) {
    state.currentMedia = media;
    state.nextCancelled = false;
    cancelNextCountdown();

    updateSessionTrackerMedia(media);

    if (dom.standby) dom.standby.classList.add("hidden");
    if (dom.playerWrap) dom.playerWrap.classList.remove("hidden");
    if (dom.buffering) {
      dom.buffering.innerHTML = '<div class="tv-spinner"></div><span class="tv-buffering__text">Chargement du flux…</span>';
      dom.buffering.classList.remove("hidden");
    }

    // Attempt fullscreen on our player container
    triggerTvFullscreen(true);
    initAspectRatio();
    updatePlayPauseIcon();
    // Clean up previous HLS instance
    if (state.hls) {
      state.hls.destroy();
      state.hls = null;
    }

    var v = dom.video;
    v.removeAttribute("src");
    v.load();
    v.muted = false;
    v.volume = 1;

    var streamUrl = String(media.url || "").trim();

    // CRITICAL FIX: Rewrite localhost or 127.0.0.1 to the TV's own window origin!
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(streamUrl)) {
      streamUrl = streamUrl.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, window.location.origin);
    } else if (streamUrl.indexOf("/") === 0) {
      streamUrl = window.location.origin + streamUrl;
    }

    // Append token if needed for authenticated proxies
    var token = localStorage.getItem("authToken");
    if (token && streamUrl.indexOf("/api/") !== -1 && streamUrl.indexOf("token=") === -1) {
      streamUrl += (streamUrl.indexOf("?") === -1 ? "?" : "&") + "token=" + encodeURIComponent(token);
    }

    var isHls = /\.m3u8(?:[?#]|$)/i.test(streamUrl) || /\/stream\.m3u8/i.test(streamUrl);
    var resumePos = Number(media.position ?? media.currentTime) || 0;
    var initialDur = getEffectiveDuration();

    if (dom.timeCurrent) dom.timeCurrent.textContent = formatTime(resumePos);
    if (dom.timeTotal) dom.timeTotal.textContent = (initialDur > 0) ? formatTime(initialDur) : "--:--";
    if (dom.progressBar && initialDur > 0) {
      dom.progressBar.style.width = ((resumePos / initialDur) * 100) + "%";
    }

    if (isHls && window.Hls && window.Hls.isSupported()) {
      var hls = new window.Hls({
        enableWorker: false, // Prevents thread starvation and cuts on Smart TV webOS / Tizen
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 60 * 1000 * 1000,
        maxBufferHole: 0.5,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        fragLoadingTimeOut: 25000,
        manifestLoadingTimeOut: 25000,
        levelLoadingTimeOut: 25000
      });
      state.hls = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(v);

      hls.on(window.Hls.Events.AUDIO_TRACKS_UPDATED, function (e, data) {
        if (data && data.audioTracks && data.audioTracks.length > 0) {
          if (hls.audioTrack < 0) {
            hls.audioTrack = 0;
          }
        }
      });

      hls.on(window.Hls.Events.LEVEL_LOADED, function (e, data) {
        if (data && data.details && data.details.totalduration && data.details.totalduration > 0) {
          if (!state.currentMedia.duration || state.currentMedia.duration <= 0) {
            state.currentMedia.duration = data.details.totalduration;
          }
          var d = getEffectiveDuration();
          if (dom.timeTotal && d > 0) dom.timeTotal.textContent = formatTime(d);
        }
      });

      hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
        var d = getEffectiveDuration();
        if (dom.timeTotal && d > 0) dom.timeTotal.textContent = formatTime(d);
        if (resumePos > 0) {
          try { v.currentTime = resumePos; } catch (_) {}
        }
        attemptPlayMedia();
      });
      hls.on(window.Hls.Events.FRAG_LOADED, function () {
        if (v && v.paused && state.currentMedia) {
          attemptPlayMedia();
        }
      });
      hls.on(window.Hls.Events.ERROR, function (e, data) {
        if (data && data.fatal) {
          console.warn("[TV] Fatal Hls error, recovering:", data.type);
          if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            try {
              hls.recoverMediaError();
            } catch (_) {
              if (dom.buffering) {
                dom.buffering.innerHTML = '<div style="color:#ef4444;font-size:22px;font-weight:700;">⚠️ Erreur de chargement du flux</div><div style="color:#94a3b8;font-size:16px;margin-top:8px;">Impossible de lire cette vidéo sur la TV</div>';
              }
            }
          }
        } else if (data && data.details === window.Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
          if (v && !v.paused && v.readyState >= 2) {
            v.currentTime += 0.1;
          }
        }
      });
    } else {
      v.autoplay = true;
      v.playsInline = true;
      v.src = streamUrl;
      v.load();

      if (resumePos > 0) {
        var didApplyResume = false;
        var applyResumeAndStart = function () {
          if (didApplyResume) return;
          didApplyResume = true;
          try {
            v.currentTime = resumePos;
          } catch (_) {}

          var onSeekDone = function () {
            attemptPlayMedia();
          };
          v.addEventListener("seeked", onSeekDone, { once: true });
          v.addEventListener("canplay", onSeekDone, { once: true });

          // Fallback timeout in case seeked fired synchronously or was delayed
          setTimeout(function () {
            if (v && v.paused && state.currentMedia) {
              attemptPlayMedia();
            }
          }, 350);
        };

        v.addEventListener("loadedmetadata", applyResumeAndStart, { once: true });
        v.addEventListener("canplay", function () {
          if (!didApplyResume) applyResumeAndStart();
        }, { once: true });
      } else {
        var onDirectReady = function () {
          attemptPlayMedia();
        };
        v.addEventListener("loadedmetadata", onDirectReady, { once: true });
        v.addEventListener("canplay", onDirectReady, { once: true });
        attemptPlayMedia();
      }
    }

    wakeOsd();
  }

  var lastReportedTime = 0;
  function reportTvState(playbackState) {
    if (!state.deviceId) return;
    var v = dom.video;
    var cur = (v && Number.isFinite(v.currentTime)) ? v.currentTime : 0;
    var dur = getEffectiveDuration();
    var m = state.currentMedia || {};
    var mId = m.id || m.streamId || m.stream_id || null;
    var mTitle = m.title || m.name || null;
    var mType = m.type || (m.seasonNumber ? "series" : "vod");

    fetch("/api/tv/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: state.deviceId,
        state: playbackState || (v && v.paused ? "paused" : "playing"),
        position: cur,
        duration: dur,
        mediaId: mId,
        mediaTitle: mTitle,
        mediaType: mType
      }),
      keepalive: playbackState === "stopped"
    }).catch(function () {});
  }

  function flashButton(btn) {
    if (!btn) return;
    btn.classList.add("is-active-flash");
    setTimeout(function () {
      btn.classList.remove("is-active-flash");
    }, 320);
  }

  function seekBy(seconds) {
    var v = dom.video;
    if (!v) return;
    var dur = getEffectiveDuration();
    var cur = (Number.isFinite(v.currentTime) ? v.currentTime : 0) + seconds;
    var newTime = dur > 0 ? Math.max(0, Math.min(dur, cur)) : Math.max(0, cur);

    try {
      v.currentTime = newTime;
    } catch (_) {}

    if (dom.progressBar && dur > 0) {
      dom.progressBar.style.width = ((newTime / dur) * 100) + "%";
    }
    if (dom.timeCurrent) {
      dom.timeCurrent.textContent = formatTime(newTime);
    }
    if (seconds < 0 && dom.btnRw) {
      flashButton(dom.btnRw);
    } else if (seconds > 0 && dom.btnFf) {
      flashButton(dom.btnFf);
    }
    wakeOsd();
    reportTvState(v.paused ? "paused" : "playing");
    recordWatchProgress(false);
  }

  function stopPlayback() {
    recordWatchProgress(false);
    stopTvStreamTracking(true);
    reportTvState("stopped");
    var v = dom.video;
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    if (state.hls) {
      state.hls.destroy();
      state.hls = null;
    }
    cancelNextCountdown();
    state.currentMedia = null;

    if (dom.playerWrap) {
      dom.playerWrap.classList.add("hidden");
      dom.playerWrap.classList.remove("is-idle");
    }
    document.body.classList.remove("is-idle");
    if (dom.standby) dom.standby.classList.remove("hidden");
  }

  // Wake and auto-hide OSD & cursor
  function wakeOsd() {
    if (!dom.osd) return;
    dom.osd.classList.remove("tv-osd--hidden");
    if (dom.playerWrap) dom.playerWrap.classList.remove("is-idle");
    document.body.classList.remove("is-idle");
    if (state.osdTimer) clearTimeout(state.osdTimer);
    state.osdTimer = setTimeout(function () {
      if (dom.video && !dom.video.paused) {
        dom.osd.classList.add("tv-osd--hidden");
        if (dom.playerWrap) dom.playerWrap.classList.add("is-idle");
        document.body.classList.add("is-idle");
      }
    }, 3500);
  }

  function updatePlayPauseIcon() {
    var v = dom.video;
    if (!v) return;
    if (dom.playPauseIcon) {
      if (v.paused) {
        dom.playPauseIcon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.5 5.5c0-.9 1-1.5 1.8-1l9.2 5.8c.8.5.8 1.5 0 2l-9.2 5.8c-.8.5-1.8 0-1.8-1V5.5z"/></svg>';
      } else {
        dom.playPauseIcon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>';
      }
    }
    if (dom.btnPlayPause) {
      dom.btnPlayPause.classList.toggle("is-paused", v.paused);
      dom.btnPlayPause.title = v.paused ? "Lecture" : "Pause";
    }
  }

  var ASPECT_MODES = [
    { mode: "contain", label: "Format : Original" },
    { mode: "fill", label: "Format : Remplir" },
    { mode: "cover", label: "Format : 16:9" }
  ];
  var currentAspectIndex = 0;

  function applyAspectRatio(mode) {
    var v = dom.video;
    if (!v) return;
    v.classList.remove("tv-fit-contain", "tv-fit-fill", "tv-fit-cover");
    v.classList.add("tv-fit-" + mode);
    var found = ASPECT_MODES.find(function (a) { return a.mode === mode; });
    var aspectText = document.getElementById("tv-btn-aspect-text");
    if (aspectText && found) {
      aspectText.textContent = found.label;
    } else if (dom.btnAspect && found) {
      dom.btnAspect.textContent = found.label;
    }
    localStorage.setItem("velora_tv_aspect", mode);
  }

  function initAspectRatio() {
    var saved = localStorage.getItem("velora_tv_aspect") || "contain";
    var idx = ASPECT_MODES.findIndex(function (a) { return a.mode === saved; });
    currentAspectIndex = idx >= 0 ? idx : 0;
    applyAspectRatio(ASPECT_MODES[currentAspectIndex].mode);
  }

  function handleProgressSeek(e) {
    e.stopPropagation();
    e.preventDefault();
    var v = dom.video;
    if (!v) return;
    var dur = getEffectiveDuration();
    if (dur <= 0) return;
    var track = dom.progressTrack || dom.progressRow;
    if (!track) return;
    var rect = track.getBoundingClientRect();
    var clientX = e.clientX;
    if (clientX === undefined && e.touches && e.touches[0]) {
      clientX = e.touches[0].clientX;
    }
    if (clientX === undefined) return;
    var ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    var targetTime = ratio * dur;
    try {
      v.currentTime = targetTime;
    } catch (_) {}
    if (dom.progressBar) dom.progressBar.style.width = (ratio * 100) + "%";
    if (dom.timeCurrent) dom.timeCurrent.textContent = formatTime(targetTime);
    wakeOsd();
    reportTvState(v.paused ? "paused" : "playing");
    recordWatchProgress(false);
  }

  // Autoplay countdown for series next episode
  function showNextEpisodeCountdown(next) {
    if (state.nextCountdownTimer || state.nextCancelled || !next) return;
    state.nextSecondsRemaining = 5;

    if (dom.nextTitle) dom.nextTitle.textContent = next.title || ("Épisode " + (next.episodeNumber || "suivant"));
    if (dom.nextSeconds) dom.nextSeconds.textContent = "5";
    if (dom.nextCard) dom.nextCard.classList.remove("hidden");

    state.nextCountdownTimer = setInterval(function () {
      state.nextSecondsRemaining -= 1;
      if (dom.nextSeconds) dom.nextSeconds.textContent = String(state.nextSecondsRemaining);

      if (state.nextSecondsRemaining <= 0) {
        cancelNextCountdown();
        playMedia(next);
      }
    }, 1000);
  }

  function cancelNextCountdown() {
    if (state.nextCountdownTimer) {
      clearInterval(state.nextCountdownTimer);
      state.nextCountdownTimer = null;
    }
    if (dom.nextCard) dom.nextCard.classList.add("hidden");
  }

  // Remote Control Key Handler (Physical TV Remote / Keyboard)
  function handleRemoteKey(e) {
    primeAudioContext();
    unmuteAudio();
    wakeOsd();

    var key = e.key;
    var code = e.keyCode;

    // Play / Pause (Space, Enter, MediaPlayPause, keycodes 179, 13, 32, 415, 19, 10252)
    if (
      key === " " ||
      key === "Enter" ||
      key === "MediaPlayPause" ||
      key === "MediaPlay" ||
      key === "MediaPause" ||
      key === "Play" ||
      key === "Pause" ||
      code === 179 ||
      code === 13 ||
      code === 32 ||
      code === 415 ||
      code === 19 ||
      code === 10252
    ) {
      e.preventDefault();
      e.stopPropagation();
      // If on standby screen, pressing Enter/OK activates audio context for the session
      if (dom.playerWrap && dom.playerWrap.classList.contains("hidden")) {
        primeAudioContext();
        if (dom.statusText) {
          dom.statusText.innerHTML = "🟢 TV prête • Son direct déverrouillé !";
        }
        return;
      }

      // If next episode card is visible, Enter means "Play Next Episode"
      if (state.nextCountdownTimer && state.currentMedia && state.currentMedia.nextEpisode && (key === "Enter" || code === 13)) {
        var next = state.currentMedia.nextEpisode;
        cancelNextCountdown();
        playMedia(next);
        return;
      }
      var v = dom.video;
      if (v) {
        if (v.paused) {
          v.play().catch(function () {});
          reportTvState("playing");
        } else {
          v.pause();
          reportTvState("paused");
        }
        flashButton(dom.btnPlayPause);
        updatePlayPauseIcon();
      }
      return;
    }

    // Seek Backward (Left arrow, Rewind, keycodes 37, 412, 10232, 227)
    if (
      key === "ArrowLeft" ||
      key === "Left" ||
      key === "MediaRewind" ||
      key === "Rewind" ||
      code === 37 ||
      code === 412 ||
      code === 10232 ||
      code === 227
    ) {
      e.preventDefault();
      e.stopPropagation();
      seekBy(-10);
      return;
    }

    // Seek Forward (Right arrow, FastForward, keycodes 39, 417, 10233, 228)
    if (
      key === "ArrowRight" ||
      key === "Right" ||
      key === "MediaFastForward" ||
      key === "FastForward" ||
      code === 39 ||
      code === 417 ||
      code === 10233 ||
      code === 228
    ) {
      e.preventDefault();
      e.stopPropagation();
      seekBy(10);
      return;
    }

    // Fullscreen toggle ('f' or 'F')
    if (key === "f" || key === "F") {
      e.preventDefault();
      e.stopPropagation();
      triggerTvFullscreen(false);
      return;
    }

    // Aspect ratio toggle ('a' or 'A')
    if (key === "a" || key === "A") {
      e.preventDefault();
      e.stopPropagation();
      currentAspectIndex = (currentAspectIndex + 1) % ASPECT_MODES.length;
      applyAspectRatio(ASPECT_MODES[currentAspectIndex].mode);
      return;
    }

    // Back / Return (Escape, Back, Tizen 10009, WebOS 461, Android 8, Samsung 10071)
    if (key === "Escape" || key === "Back" || code === 27 || code === 10009 || code === 461 || code === 8 || code === 10071) {
      e.preventDefault();
      e.stopPropagation();
      var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
      if (isFs) {
        if (document.exitFullscreen) document.exitFullscreen().catch(function () {});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        return;
      }
      if (state.nextCountdownTimer) {
        state.nextCancelled = true;
        cancelNextCountdown();
        return;
      }
      if (!dom.playerWrap.classList.contains("hidden")) {
        stopPlayback();
      }
    }
  }

  // Bind video player events
  function bindVideoEvents() {
    var v = dom.video;
    if (!v) return;

    v.addEventListener("waiting", function () {
      if (dom.buffering) dom.buffering.classList.remove("hidden");
    });

    v.addEventListener("playing", function () {
      if (dom.buffering) dom.buffering.classList.add("hidden");
      updatePlayPauseIcon();
      wakeOsd();
      reportTvState("playing");
    });

    v.addEventListener("pause", function () {
      updatePlayPauseIcon();
      wakeOsd();
      stopTvStreamTracking(true);
      reportTvState("paused");
      recordWatchProgress(false);
    });

    v.addEventListener("seeked", function () {
      recordWatchProgress(false);
    });

    v.addEventListener("play", function () {
      updatePlayPauseIcon();
      wakeOsd();
      startTvStreamTracking();
      reportTvState("playing");
    });

    v.addEventListener("durationchange", function () {
      var dur = getEffectiveDuration();
      if (dur > 0 && dom.timeTotal) {
        dom.timeTotal.textContent = formatTime(dur);
      }
    });

    v.addEventListener("loadedmetadata", function () {
      var dur = getEffectiveDuration();
      if (dur > 0 && dom.timeTotal) {
        dom.timeTotal.textContent = formatTime(dur);
      }
    });

    v.addEventListener("canplay", function () {
      if (dom.buffering) dom.buffering.classList.add("hidden");
      if (v.paused && state.currentMedia) {
        attemptPlayMedia();
      }
    });

    v.addEventListener("loadeddata", function () {
      if (dom.buffering) dom.buffering.classList.add("hidden");
      if (v.paused && state.currentMedia) {
        attemptPlayMedia();
      }
    });

    v.addEventListener("error", function () {
      var err = v.error;
      console.error("[TV] Video element error:", err);
      if (dom.buffering) {
        var msg = "Erreur de lecture du flux";
        if (err && err.code === 2) msg = "Erreur réseau : flux inaccessible";
        if (err && err.code === 3) msg = "Format vidéo non supporté par la TV";
        if (err && err.code === 4) msg = "Source non supportée ou expirée";
        dom.buffering.innerHTML = '<div style="color:#ef4444;font-size:22px;font-weight:700;">⚠️ ' + msg + '</div><div style="color:#94a3b8;font-size:16px;margin-top:8px;">Vérifiez la connexion ou changez de contenu</div>';
      }
    });

    v.addEventListener("timeupdate", function () {
      var cur = (v && Number.isFinite(v.currentTime)) ? v.currentTime : 0;
      var dur = getEffectiveDuration();

      if (dom.timeCurrent) dom.timeCurrent.textContent = formatTime(cur);
      if (dom.timeTotal) dom.timeTotal.textContent = (dur > 0) ? formatTime(dur) : "--:--";

      if (dom.progressBar && dur > 0) {
        var pct = (cur / dur) * 100;
        dom.progressBar.style.width = Math.min(100, Math.max(0, pct)) + "%";
      }

      // Check buffered progress
      if (dom.progressBuffered && v.buffered.length > 0 && dur > 0) {
        var end = v.buffered.end(v.buffered.length - 1);
        dom.progressBuffered.style.width = Math.min(100, Math.max(0, (end / dur) * 100)) + "%";
      }

      onHistoryTimeUpdate();

      var now = Date.now();
      if (!v.paused && now - lastReportedTime >= 5000) {
        lastReportedTime = now;
        reportTvState("playing");
      }

      // Check if series next episode countdown should trigger (in last 15s)
      if (state.currentMedia && state.currentMedia.nextEpisode && dur > 30) {
        if (dur - cur <= 15 && !state.nextCountdownTimer && !state.nextCancelled) {
          showNextEpisodeCountdown(state.currentMedia.nextEpisode);
        }
      }
    });

    v.addEventListener("ended", function () {
      recordWatchProgress(true);
      if (state.currentMedia && state.currentMedia.nextEpisode) {
        playMedia(state.currentMedia.nextEpisode);
      } else {
        stopPlayback();
      }
    });
  }

  // Next episode buttons
  if (dom.nextCancel) {
    dom.nextCancel.addEventListener("click", function () {
      state.nextCancelled = true;
      cancelNextCountdown();
    });
  }

  if (dom.nextPlay) {
    dom.nextPlay.addEventListener("click", function () {
      if (state.currentMedia && state.currentMedia.nextEpisode) {
        var next = state.currentMedia.nextEpisode;
        cancelNextCountdown();
        playMedia(next);
      }
    });
  }

  // Aspect ratio toggle button
  if (dom.btnAspect) {
    dom.btnAspect.addEventListener("click", function (e) {
      e.stopPropagation();
      currentAspectIndex = (currentAspectIndex + 1) % ASPECT_MODES.length;
      applyAspectRatio(ASPECT_MODES[currentAspectIndex].mode);
      wakeOsd();
    });
  }

  // Center Rewind 10s button
  if (dom.btnRw) {
    dom.btnRw.addEventListener("click", function (e) {
      e.stopPropagation();
      seekBy(-10);
    });
  }

  // Center Play / Pause button
  if (dom.btnPlayPause) {
    dom.btnPlayPause.addEventListener("click", function (e) {
      e.stopPropagation();
      var v = dom.video;
      if (v) {
        if (v.paused) {
          v.play().catch(function () {});
          reportTvState("playing");
        } else {
          v.pause();
          reportTvState("paused");
        }
        flashButton(dom.btnPlayPause);
        updatePlayPauseIcon();
        wakeOsd();
      }
    });
  }

  // Center Forward 10s button
  if (dom.btnFf) {
    dom.btnFf.addEventListener("click", function (e) {
      e.stopPropagation();
      seekBy(10);
    });
  }

  // Progress track click seeking
  if (dom.progressTrack) {
    dom.progressTrack.addEventListener("click", handleProgressSeek);
  }
  if (dom.progressRow) {
    dom.progressRow.addEventListener("click", handleProgressSeek);
  }

  // Player click handling:
  // - Single click: Wakes OSD and enters fullscreen if not yet in FS (NEVER exits fullscreen!)
  // - Double click (2 fast clicks): Toggles Play / Pause cleanly without affecting fullscreen!
  // - Ignores clicks on buttons, center controls, progress bar, or aspect ratio button
  var clickDebounceTimer = null;
  if (dom.playerWrap) {
    dom.playerWrap.addEventListener("click", function (e) {
      if (e.target && e.target.closest && (
        e.target.closest("button") ||
        e.target.closest("#tv-center-controls") ||
        e.target.closest(".tv-center-btn") ||
        e.target.closest("#tv-progress-track") ||
        e.target.closest("#tv-progress-row") ||
        e.target.closest(".tv-aspect-btn")
      )) {
        return;
      }
      unmuteAudio();

      if (clickDebounceTimer) {
        // Double click detected -> Play / Pause
        clearTimeout(clickDebounceTimer);
        clickDebounceTimer = null;
        var v = dom.video;
        if (v) {
          if (v.paused) v.play().catch(function () {});
          else v.pause();
          updatePlayPauseIcon();
        }
        wakeOsd();
      } else {
        // First click: wait 280ms to check if a second click follows
        clickDebounceTimer = setTimeout(function () {
          clickDebounceTimer = null;
          wakeOsd();
          triggerTvFullscreen(true);
        }, 280);
      }
    });
  }

  // Check fullscreen state and update button label
  function checkFullscreenState() {
    var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    if (dom.playerWrap) {
      dom.playerWrap.classList.toggle("is-fullscreen", isFs);
    }
    var fsText = document.getElementById("tv-fs-text");
    if (fsText) {
      fsText.textContent = isFs ? "Quitter plein écran" : "Plein écran";
    }
  }
  document.addEventListener("fullscreenchange", checkFullscreenState);
  document.addEventListener("webkitfullscreenchange", checkFullscreenState);

  // First interaction fullscreen unlock & unmute on outer document
  document.addEventListener("click", function (e) {
    if (e.target && e.target.closest && e.target.closest("#tv-player-wrap")) return;
    unmuteAudio();
    var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    if (!isFs && dom.playerWrap && !dom.playerWrap.classList.contains("hidden")) {
      triggerTvFullscreen(true);
    }
  });

  // Pre-prime AudioContext on first TV interaction
  function primeAudioContext() {
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        var ctx = new AudioCtx();
        if (ctx.state === "suspended") {
          ctx.resume().catch(function () {});
        }
        var buf = ctx.createBuffer(1, 1, 22050);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      }
    } catch (_) {}
  }
  ["click", "keydown", "touchstart", "pointerdown"].forEach(function (evt) {
    window.addEventListener(evt, primeAudioContext, { once: true, capture: true });
  });

  // Init listeners
  window.addEventListener("keydown", handleRemoteKey, true);
  window.addEventListener("mousemove", wakeOsd);
  window.addEventListener("pointermove", wakeOsd);
  window.addEventListener("pagehide", function () {
    recordWatchProgress(false);
    stopTvStreamTracking(true);
  });
  window.addEventListener("beforeunload", function () {
    recordWatchProgress(false);
    stopTvStreamTracking(true);
  });
  bindVideoEvents();
  initAspectRatio();
  initSession();
})();

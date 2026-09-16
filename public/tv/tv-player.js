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
    title: document.getElementById("tv-media-title"),
    subtitle: document.getElementById("tv-media-subtitle"),
    liveBadge: document.getElementById("tv-live-badge"),
    timeCurrent: document.getElementById("tv-time-current"),
    timeTotal: document.getElementById("tv-time-total"),
    progressBar: document.getElementById("tv-progress-bar"),
    progressBuffered: document.getElementById("tv-progress-buffered"),
    progressTrack: document.getElementById("tv-progress-track"),
    pinDisplay: document.getElementById("tv-pin-display"),
    statusBar: document.getElementById("tv-status-bar"),
    statusText: document.getElementById("tv-status-text"),
    linkedBox: document.getElementById("tv-linked-box"),
    linkedUser: document.getElementById("tv-linked-username"),
    qrcode: document.getElementById("tv-qrcode"),
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
        (h < 10 ? "0" : "") + h + ":" +
        (m < 10 ? "0" : "") + m + ":" +
        (s < 10 ? "0" : "") + s
      );
    }
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  // Pure JS lightweight QR Code generator (fallback/simple matrix representation)
  function renderQrCode(url) {
    if (!dom.qrcode) return;
    // Use an SVG QR image via standard quick visual representation or API
    var encoded = encodeURIComponent(url);
    dom.qrcode.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=4&data=' + encoded + '" alt="QR Code" style="width:100%;height:100%;border-radius:12px;" />';
  }

  // Fetch or renew TV session
  async function initSession() {
    try {
      var storedId = localStorage.getItem("velora_tv_device_id");
      var query = storedId ? "?deviceId=" + encodeURIComponent(storedId) : "";
      var res = await fetch("/api/tv/session" + query, { cache: "no-store" });
      var data = await res.json();

      if (!data.ok) throw new Error(data.error || "Erreur de session");

      state.deviceId = data.deviceId;
      state.currentPin = data.pin;
      localStorage.setItem("velora_tv_device_id", data.deviceId);

      if (data.isLinked) {
        state.isLinked = true;
        state.user = data.user;
        if (data.token) localStorage.setItem("authToken", data.token);
        renderLinkedState(data.user, data.pin);
      } else {
        state.isLinked = false;
        renderPin(data.pin);
        var pairUrl = window.location.origin + "/login?tvPair=" + data.pin;
        renderQrCode(pairUrl);
      }

      connectEvents();
    } catch (err) {
      console.error("[TV] Session init error:", err);
      if (dom.statusText) dom.statusText.textContent = "Erreur de connexion au serveur. Reconnexion…";
      setTimeout(initSession, 4000);
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
      console.warn("[TV] SSE connection lost. Reconnecting in 3s…");
      if (state.eventSource) {
        try { state.eventSource.close(); } catch (_) {}
        state.eventSource = null;
      }
      if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
      state.reconnectTimer = setTimeout(connectEvents, 3000);
    };
  }

  function handleServerEvent(event) {
    if (!event || !event.type) return;

    switch (event.type) {
      case "PAIRED":
        state.isLinked = true;
        state.user = { username: event.username, displayName: event.displayName };
        if (event.token) localStorage.setItem("authToken", event.token);
        renderLinkedState(state.user, state.currentPin);
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

  function unmuteAudio() {
    var v = dom.video;
    if (!v) return;
    v.muted = false;
    v.volume = 1;
    var banner = document.getElementById("tv-unmute-banner");
    if (banner) banner.classList.add("hidden");
    var btn = document.getElementById("tv-btn-mute");
    if (btn) btn.textContent = "🔊 Son";
  }

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

  // Play a stream on TV
  function playMedia(media) {
    state.currentMedia = media;
    state.nextCancelled = false;
    cancelNextCountdown();

    if (dom.standby) dom.standby.classList.add("hidden");
    if (dom.playerWrap) dom.playerWrap.classList.remove("hidden");
    if (dom.buffering) {
      dom.buffering.innerHTML = '<div class="tv-spinner"></div><span class="tv-buffering__text">Chargement du flux…</span>';
      dom.buffering.classList.remove("hidden");
    }

    // Attempt fullscreen on our player container
    triggerTvFullscreen(true);

    // Update OSD metadata
    if (dom.title) dom.title.textContent = media.title || "Lecture en cours";
    if (dom.subtitle) {
      var sub = "";
      if (media.seasonNumber && media.episodeNumber) {
        sub = "Saison " + media.seasonNumber + " • Épisode " + media.episodeNumber;
      }
      if (media.episodeTitle) {
        sub += (sub ? " : " : "") + media.episodeTitle;
      }
      dom.subtitle.textContent = sub;
      dom.subtitle.classList.toggle("hidden", !sub);
    }

    if (dom.liveBadge) {
      dom.liveBadge.classList.toggle("hidden", !media.isLive);
    }

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

    var unmuteBanner = document.getElementById("tv-unmute-banner");
    if (unmuteBanner) unmuteBanner.classList.add("hidden");
    var btnMute = document.getElementById("tv-btn-mute");
    if (btnMute) btnMute.textContent = "🔊 Son";

    var streamUrl = String(media.url || "").trim();

    // CRITICAL FIX: Rewrite localhost or 127.0.0.1 to the TV's own window origin!
    // The TV browser cannot reach 'localhost' because on the TV, localhost is the TV itself.
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

      hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
        if (media.position && Number.isFinite(media.position)) {
          v.currentTime = media.position;
        }
        var p = v.play();
        if (p !== undefined) {
          p.then(function () {
            if (v.muted) {
              if (unmuteBanner) unmuteBanner.classList.remove("hidden");
              if (btnMute) btnMute.textContent = "🔇 Activer son";
            }
          }).catch(function (err) {
            console.warn("[TV] Autoplay blocked, trying muted:", err);
            v.muted = true;
            if (unmuteBanner) unmuteBanner.classList.remove("hidden");
            if (btnMute) btnMute.textContent = "🔇 Activer son";
            v.play().catch(function () {});
          });
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
      v.src = streamUrl;
      v.load();
      if (media.position && Number.isFinite(media.position)) {
        v.currentTime = media.position;
      }
      var p = v.play();
      if (p !== undefined) {
        p.then(function () {
          if (v.muted) {
            if (unmuteBanner) unmuteBanner.classList.remove("hidden");
            if (btnMute) btnMute.textContent = "🔇 Activer son";
          }
        }).catch(function (err) {
          console.warn("[TV] Direct play error, trying muted:", err);
          v.muted = true;
          if (unmuteBanner) unmuteBanner.classList.remove("hidden");
          if (btnMute) btnMute.textContent = "🔇 Activer son";
          v.play().catch(function () {});
        });
      }
    }

    wakeOsd();
  }

  function stopPlayback() {
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

    if (dom.playerWrap) dom.playerWrap.classList.add("hidden");
    if (dom.standby) dom.standby.classList.remove("hidden");
  }

  // Wake and auto-hide OSD
  function wakeOsd() {
    if (!dom.osd) return;
    dom.osd.classList.remove("tv-osd--hidden");
    if (state.osdTimer) clearTimeout(state.osdTimer);
    state.osdTimer = setTimeout(function () {
      if (dom.video && !dom.video.paused) {
        dom.osd.classList.add("tv-osd--hidden");
      }
    }, 3500);
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
    unmuteAudio();
    wakeOsd();

    var key = e.key;
    var code = e.keyCode;

    // Play / Pause (Space, Enter, MediaPlayPause, keycode 179)
    if (key === " " || key === "Enter" || key === "MediaPlayPause" || code === 179 || code === 13) {
      e.preventDefault();
      // If next episode card is visible, Enter means "Play Next Episode"
      if (state.nextCountdownTimer && state.currentMedia && state.currentMedia.nextEpisode) {
        var next = state.currentMedia.nextEpisode;
        cancelNextCountdown();
        playMedia(next);
        return;
      }
      if (dom.video.paused) dom.video.play().catch(function () {});
      else dom.video.pause();
      return;
    }

    // Seek Backward (Left arrow, keycode 37)
    if (key === "ArrowLeft" || code === 37) {
      e.preventDefault();
      dom.video.currentTime = Math.max(0, dom.video.currentTime - 10);
      return;
    }

    // Seek Forward (Right arrow, keycode 39)
    if (key === "ArrowRight" || code === 39) {
      e.preventDefault();
      dom.video.currentTime = Math.min(dom.video.duration || 0, dom.video.currentTime + 10);
      return;
    }

    // Fullscreen toggle ('f' or 'F')
    if (key === "f" || key === "F") {
      e.preventDefault();
      triggerTvFullscreen(false);
      return;
    }

    // Back / Return (Escape, Back, Tizen 10009, WebOS 461)
    if (key === "Escape" || key === "Back" || code === 27 || code === 10009 || code === 461) {
      e.preventDefault();
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
      wakeOsd();
    });

    v.addEventListener("canplay", function () {
      if (dom.buffering) dom.buffering.classList.add("hidden");
    });

    v.addEventListener("loadeddata", function () {
      if (dom.buffering) dom.buffering.classList.add("hidden");
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
      if (!Number.isFinite(v.duration)) return;
      var cur = v.currentTime || 0;
      var dur = v.duration || 0;

      if (dom.timeCurrent) dom.timeCurrent.textContent = formatTime(cur);
      if (dom.timeTotal) dom.timeTotal.textContent = formatTime(dur);

      if (dom.progressBar && dur > 0) {
        var pct = (cur / dur) * 100;
        dom.progressBar.style.width = pct + "%";
      }

      // Check buffered progress
      if (dom.progressBuffered && v.buffered.length > 0 && dur > 0) {
        var end = v.buffered.end(v.buffered.length - 1);
        dom.progressBuffered.style.width = (end / dur) * 100 + "%";
      }

      // Check if series next episode countdown should trigger (in last 15s)
      if (state.currentMedia && state.currentMedia.nextEpisode && dur > 30) {
        if (dur - cur <= 15 && !state.nextCountdownTimer && !state.nextCancelled) {
          showNextEpisodeCountdown(state.currentMedia.nextEpisode);
        }
      }
    });

    v.addEventListener("ended", function () {
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

  // Fullscreen button
  var btnFs = document.getElementById("tv-btn-fullscreen");
  if (btnFs) {
    btnFs.addEventListener("click", function (e) {
      e.stopPropagation();
      triggerTvFullscreen(false);
    });
  }

  // Standby Fullscreen button
  var btnStandbyFs = document.getElementById("tv-standby-fs-btn");
  if (btnStandbyFs) {
    btnStandbyFs.addEventListener("click", function (e) {
      e.stopPropagation();
      triggerTvFullscreen(false);
    });
  }

  // Fullscreen hint banner
  var fsHintBanner = document.getElementById("tv-fs-hint-banner");
  if (fsHintBanner) {
    fsHintBanner.addEventListener("click", function (e) {
      e.stopPropagation();
      triggerTvFullscreen(true);
      fsHintBanner.classList.add("is-hidden");
    });
  }

  // Mute / Unmute toggle button
  var btnMute = document.getElementById("tv-btn-mute");
  if (btnMute) {
    btnMute.addEventListener("click", function (e) {
      e.stopPropagation();
      var v = dom.video;
      if (!v) return;
      if (v.muted) {
        unmuteAudio();
      } else {
        v.muted = true;
        btnMute.textContent = "🔇 Activer son";
        var banner = document.getElementById("tv-unmute-banner");
        if (banner) banner.classList.remove("hidden");
      }
    });
  }

  // TV Unmute Banner click
  var unmuteBannerEl = document.getElementById("tv-unmute-banner");
  if (unmuteBannerEl) {
    unmuteBannerEl.addEventListener("click", function (e) {
      e.stopPropagation();
      unmuteAudio();
      triggerTvFullscreen(true);
    });
  }

  // Player click handling:
  // - Single click: Wakes OSD and enters fullscreen if not yet in FS (NEVER exits fullscreen!)
  // - Double click (2 fast clicks): Toggles Play / Pause cleanly without affecting fullscreen!
  var clickDebounceTimer = null;
  if (dom.playerWrap) {
    dom.playerWrap.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest("button")) return;
      unmuteAudio();

      if (clickDebounceTimer) {
        // Double click detected -> Play / Pause
        clearTimeout(clickDebounceTimer);
        clickDebounceTimer = null;
        var v = dom.video;
        if (v) {
          if (v.paused) v.play().catch(function () {});
          else v.pause();
        }
        wakeOsd();
      } else {
        // First click: wait 280ms to check if a second click follows
        clickDebounceTimer = setTimeout(function () {
          clickDebounceTimer = null;
          wakeOsd();
          // Enter fullscreen only if not in fullscreen (will never exit fullscreen)
          triggerTvFullscreen(true);
        }, 280);
      }
    });
  }

  // Dismiss hint banner when entering fullscreen
  function checkFullscreenState() {
    var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    if (fsHintBanner) {
      if (isFs) fsHintBanner.classList.add("is-hidden");
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

  // Init listeners
  window.addEventListener("keydown", handleRemoteKey);
  window.addEventListener("mousemove", wakeOsd);
  bindVideoEvents();
  initSession();
})();

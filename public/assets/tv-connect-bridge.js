(function () {
  "use strict";

  var tvState = {
    hasPairedTv: false,
    isOnline: false,
    deviceId: null,
    deviceName: null,
    currentMedia: null,
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

  function setAutoDiffuse(enabled) {
    try {
      localStorage.setItem("velora_tv_auto_diffuse", enabled ? "true" : "false");
    } catch (_) {}
    syncActiveTvBar();
    renderTvSettingsSection();
    showTvToast(enabled ? "📺 Mode TV activé (diffusion directe)" : "📱 Mode Téléphone activé (lecture locale)");
  }

  // Inject scoped styles for TV settings and top active bar
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

      /* Upper TV Active Diffusion Bar */
      .vel-tv-active-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 48px;
        box-sizing: border-box;
        background: linear-gradient(135deg, rgba(20, 11, 44, 0.98), rgba(10, 6, 26, 0.98));
        border-bottom: 1px solid rgba(167, 139, 250, 0.45);
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.6), 0 0 20px rgba(139, 92, 246, 0.25);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        padding: max(6px, env(safe-area-inset-top)) 14px 6px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        z-index: 999999;
        font-family: inherit;
        color: #fff;
        animation: velTvSlideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes velTvSlideDown {
        from { transform: translateY(-100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      /* Push down page body and containers so nothing is covered by the top bar */
      body.vel-tv-active-bar-open {
        padding-top: var(--vel-tv-bar-height, 48px) !important;
        box-sizing: border-box !important;
      }
      body.vel-tv-active-bar-open .main--velora {
        height: calc(100dvh - var(--vel-tv-bar-height, 48px)) !important;
        height: calc(100vh - var(--vel-tv-bar-height, 48px)) !important;
      }
      body.vel-tv-active-bar-open #vel-floating-search,
      body.vel-tv-active-bar-open .vel-floating-search {
        top: calc(12px + var(--vel-tv-bar-height, 48px)) !important;
      }

      .vel-tv-active-bar__left {
        display: flex;
        align-items: center;
        gap: 10px;
        overflow: hidden;
        min-width: 0;
        flex: 1;
      }
      .vel-tv-active-bar__pulse-dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: #4ade80;
        box-shadow: 0 0 8px #4ade80;
        flex-shrink: 0;
        animation: velTvPulse 1.8s infinite ease-in-out;
      }
      .vel-tv-active-bar__pulse-dot.is-off {
        background: #94a3b8;
        box-shadow: none;
        animation: none;
      }
      @keyframes velTvPulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.3); opacity: 0.6; }
      }
      .vel-tv-active-bar__info {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
        overflow: hidden;
      }
      .vel-tv-active-bar__heading {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 10.5px;
        color: #cbd5e1;
        white-space: nowrap;
      }
      .vel-tv-active-bar__target {
        font-weight: 700;
        color: #c084fc;
      }
      .vel-tv-active-bar__status {
        color: #4ade80;
        font-weight: 600;
        font-size: 10px;
      }
      .vel-tv-active-bar__status.is-off {
        color: #94a3b8;
      }
      .vel-tv-active-bar__title {
        font-size: 12.5px;
        font-weight: 700;
        color: #ffffff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        letter-spacing: 0.1px;
      }
      .vel-tv-active-bar__actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .vel-tv-active-bar__btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(185, 28, 28, 0.4));
        border: 1px solid rgba(248, 113, 113, 0.5);
        color: #fecaca;
        padding: 4px 10px;
        border-radius: 9px;
        font-size: 11.5px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
      }
      .vel-tv-active-bar__btn:hover {
        background: rgba(239, 68, 68, 0.5);
        border-color: #f87171;
        color: #ffffff;
        box-shadow: 0 0 10px rgba(239, 68, 68, 0.4);
      }
      .vel-tv-active-bar__btn:active {
        transform: scale(0.96);
      }
      .vel-tv-active-bar__btn.is-stopping {
        opacity: 0.6;
        pointer-events: none;
      }

      /* Diffusion Switch Pill Button */
      .vel-tv-switch-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(167, 139, 250, 0.35);
        border-radius: 20px;
        padding: 3px 8px;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
        transition: all 0.2s ease;
      }
      .vel-tv-switch-pill:hover {
        border-color: rgba(167, 139, 250, 0.7);
        background: rgba(0, 0, 0, 0.6);
      }
      .vel-tv-switch-pill-label {
        font-size: 11px;
        font-weight: 700;
        color: #e2e8f0;
      }
      .vel-tv-switch-track {
        width: 32px;
        height: 17px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.2);
        position: relative;
        transition: background 0.2s ease;
        display: inline-block;
      }
      .vel-tv-switch-track.is-on {
        background: #8b5cf6;
        box-shadow: 0 0 8px rgba(139, 92, 246, 0.6);
      }
      .vel-tv-switch-thumb {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 13px;
        height: 13px;
        border-radius: 50%;
        background: #ffffff;
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        box-shadow: 0 1px 3px rgba(0,0,0,0.4);
      }
      .vel-tv-switch-track.is-on .vel-tv-switch-thumb {
        transform: translateX(15px);
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

  function loadCachedTvStatus() {
    try {
      var uid = getCurrentUserId();
      var raw = localStorage.getItem("velora_tv_status_cache_" + uid);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          tvState.hasPairedTv = Boolean(parsed.hasPairedTv);
          tvState.isOnline = false;
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
      toast.innerHTML = "<span style='font-size:18px;'>📺</span> <span>" + msg + "</span>";
      document.body.appendChild(toast);

      setTimeout(function () {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(-12px)";
        setTimeout(function () { toast.remove(); }, 350);
      }, 3000);
    } catch (_) {}
  }

  function updateTvBadgeOnly() {
    var badge = document.querySelector(".vel-profile-tv-status-badge");
    if (badge) {
      badge.className = "vel-profile-tv-status-badge " + (tvState.isOnline ? "is-online" : "");
      badge.textContent = tvState.isOnline ? "● En ligne" : "○ Hors ligne";
    }
  }

  function removeActiveTvBar() {
    var bar = document.getElementById("vel-tv-active-bar");
    if (bar) bar.remove();
    document.body.classList.remove("vel-tv-active-bar-open");
    document.documentElement.style.removeProperty("--vel-tv-bar-height");
  }

  // Synchronize the upper active diffusion bar
  function syncActiveTvBar() {
    if (tvState.hasPairedTv && tvState.isOnline) {
      showActiveTvBar();
    } else {
      removeActiveTvBar();
    }
  }

  // Upper bar showing TV status, diffusion switch, and active stream
  function showActiveTvBar() {
    var isPlaying = tvState.isOnline && tvState.currentMedia && tvState.currentMedia.state !== "stopped";
    var activeTitle = isPlaying ? (tvState.currentMedia.title || tvState.currentMedia.name || "Lecture en cours") : null;
    var tvName = tvState.deviceName || "Smart TV";
    var isOn = isAutoDiffuseOn();

    var statusText = isPlaying 
      ? "● Diffusion en cours" 
      : (isOn ? "● Diffuse sur TV" : "○ Mode Mobile");

    var subTitleText = activeTitle || (isOn ? "Les vidéos seront lues sur votre TV" : "Les vidéos seront lues sur ce téléphone");

    var existing = document.getElementById("vel-tv-active-bar");
    if (existing) {
      var headingStatus = existing.querySelector(".vel-tv-active-bar__status");
      if (headingStatus) {
        headingStatus.textContent = statusText;
        headingStatus.classList.toggle("is-off", !isOn && !isPlaying);
      }
      var dot = existing.querySelector(".vel-tv-active-bar__pulse-dot");
      if (dot) dot.classList.toggle("is-off", !isOn && !isPlaying);
      var titleSpan = existing.querySelector(".vel-tv-active-bar__title");
      if (titleSpan) titleSpan.textContent = subTitleText;
      var targetSpan = existing.querySelector(".vel-tv-active-bar__target");
      if (targetSpan) targetSpan.textContent = tvName;

      var switchTrack = existing.querySelector(".vel-tv-switch-track");
      if (switchTrack) switchTrack.classList.toggle("is-on", isOn);
      var switchLabel = existing.querySelector(".vel-tv-switch-pill-label");
      if (switchLabel) switchLabel.textContent = isOn ? "Mode TV" : "Mode Tél";

      var stopBtn = existing.querySelector("#vel-tv-stop-playback");
      if (isPlaying && !stopBtn) {
        var actions = existing.querySelector(".vel-tv-active-bar__actions");
        if (actions) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.id = "vel-tv-stop-playback";
          btn.className = "vel-tv-active-bar__btn";
          btn.title = "Arrêter la diffusion sur la TV";
          btn.innerHTML = '<span class="vel-tv-active-bar__btn-icon">⏹</span><span class="vel-tv-active-bar__btn-label">Arrêter</span>';
          actions.prepend(btn);
          attachStopBtnHandler(btn);
        }
      } else if (!isPlaying && stopBtn) {
        stopBtn.remove();
      }

      document.body.classList.add("vel-tv-active-bar-open");
      var h = existing.offsetHeight || 48;
      document.documentElement.style.setProperty("--vel-tv-bar-height", h + "px");
      return;
    }

    var bar = document.createElement("div");
    bar.id = "vel-tv-active-bar";
    bar.className = "vel-tv-active-bar";
    bar.innerHTML = `
      <div class="vel-tv-active-bar__left">
        <div class="vel-tv-active-bar__pulse-dot ${(isOn || isPlaying) ? "" : "is-off"}" aria-hidden="true"></div>
        <div class="vel-tv-active-bar__info">
          <div class="vel-tv-active-bar__heading">
            <span class="vel-tv-active-bar__icon">📺</span>
            <span class="vel-tv-active-bar__target">${tvName}</span>
            <span class="vel-tv-active-bar__status ${(isOn || isPlaying) ? "" : "is-off"}">${statusText}</span>
          </div>
          <span class="vel-tv-active-bar__title">${subTitleText}</span>
        </div>
      </div>
      <div class="vel-tv-active-bar__actions">
        ${isPlaying ? `
          <button type="button" id="vel-tv-stop-playback" class="vel-tv-active-bar__btn" title="Arrêter la diffusion sur la TV">
            <span class="vel-tv-active-bar__btn-icon">⏹</span>
            <span class="vel-tv-active-bar__btn-label">Arrêter</span>
          </button>
        ` : ""}
        <div class="vel-tv-switch-pill" id="vel-tv-switch-pill" role="button" tabindex="0" title="Activer ou désactiver la diffusion automatique sur TV">
          <span class="vel-tv-switch-pill-label">${isOn ? "Mode TV" : "Mode Tél"}</span>
          <span class="vel-tv-switch-track ${isOn ? "is-on" : ""}">
            <span class="vel-tv-switch-thumb"></span>
          </span>
        </div>
      </div>
    `;
    document.body.appendChild(bar);
    document.body.classList.add("vel-tv-active-bar-open");

    requestAnimationFrame(function () {
      var h = bar.offsetHeight || 48;
      document.documentElement.style.setProperty("--vel-tv-bar-height", h + "px");
    });

    var switchBtn = document.getElementById("vel-tv-switch-pill");
    if (switchBtn) {
      switchBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        setAutoDiffuse(!isAutoDiffuseOn());
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
        tvState.currentMedia = (data.isOnline && data.currentMedia && data.currentMedia.state !== "stopped") ? data.currentMedia : null;
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

  // Render TV Section into Profile Modal
  function renderTvSettingsSection() {
    var modal = document.getElementById("vel-profile-account-modal");
    if (!modal) return;
    var card = modal.querySelector(".vel-profile-account__card");
    if (!card) return;

    var existing = document.getElementById("vel-profile-tv-card");
    if (existing) {
      var pinInput = document.getElementById("vel-tv-pin-input");
      if (pinInput && (document.activeElement === pinInput || pinInput.value.length > 0)) {
        return;
      }
      existing.remove();
    }

    var section = document.createElement("div");
    section.id = "vel-profile-tv-card";
    section.className = "vel-profile-tv-card";

    if (tvState.hasPairedTv) {
      var isDiffusionActive = tvState.isOnline && tvState.currentMedia && tvState.currentMedia.state !== "stopped";
      var currentTitle = isDiffusionActive ? (tvState.currentMedia.title || tvState.currentMedia.name || "Média en cours") : "";
      var isOn = isAutoDiffuseOn();

      section.innerHTML = `
        <div class="vel-profile-tv-header">
          <span class="vel-profile-tv-title">📺 Smart TV Connectée</span>
          <span class="vel-profile-tv-status-badge ${tvState.isOnline ? "is-online" : ""}">
            ${tvState.isOnline ? "● En ligne" : "○ Hors ligne"}
          </span>
        </div>
        <p class="vel-profile-tv-desc">
          Appareil : <strong>${tvState.deviceName}</strong><br />
          ${tvState.isOnline 
            ? (isDiffusionActive 
                ? `Diffusion active : <strong class="vel-profile-tv-now-playing">${currentTitle}</strong>` 
                : "Prête pour la diffusion depuis votre mobile.") 
            : "Ouvrez <em>nodecast.veloravip.net/tv</em> sur votre TV pour diffuser."}
        </p>
        ${tvState.isOnline ? `
          <div class="vel-profile-tv-switch-row">
            <div class="vel-profile-tv-switch-info">
              <span class="vel-profile-tv-switch-title">Diffusion automatique</span>
              <span class="vel-profile-tv-switch-desc">Lire directement les vidéos sur la TV</span>
            </div>
            <div class="vel-tv-switch-pill" id="vel-profile-tv-toggle-btn" role="button" tabindex="0">
              <span class="vel-tv-switch-pill-label">${isOn ? "Mode TV" : "Mode Tél"}</span>
              <span class="vel-tv-switch-track ${isOn ? "is-on" : ""}">
                <span class="vel-tv-switch-thumb"></span>
              </span>
            </div>
          </div>
        ` : ""}
        <div style="display:flex; justify-content:flex-end;">
          <button type="button" id="vel-tv-unlink-btn" class="vel-profile-tv-btn vel-profile-tv-btn--danger">
            Dissocier cette TV
          </button>
        </div>
        <p id="vel-tv-pair-status" class="vel-profile-tv-msg"></p>
      `;
      card.appendChild(section);

      var toggleBtn = document.getElementById("vel-profile-tv-toggle-btn");
      if (toggleBtn) {
        toggleBtn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          setAutoDiffuse(!isAutoDiffuseOn());
        });
      }

      var unlinkBtn = document.getElementById("vel-tv-unlink-btn");
      if (unlinkBtn) {
        unlinkBtn.addEventListener("click", async function () {
          if (!window.confirm("Voulez-vous vraiment dissocier votre TV ?")) return;
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
              removeActiveTvBar();
              renderTvSettingsSection();
            }
          } catch (e) {
            window.alert("Erreur lors de la dissociation");
          } finally {
            unlinkBtn.disabled = false;
          }
        });
      }
    } else {
      section.innerHTML = `
        <div class="vel-profile-tv-header">
          <span class="vel-profile-tv-title">📺 Connexion Smart TV</span>
        </div>
        <p class="vel-profile-tv-desc">
          Ouvrez <strong>nodecast.veloravip.net/tv</strong> sur votre TV et entrez le code à 4 chiffres affiché :
        </p>
        <div class="vel-profile-tv-pair-row">
          <input type="text" id="vel-tv-pin-input" class="vel-profile-tv-input" placeholder="0000" maxlength="4" inputmode="numeric" />
          <button type="button" id="vel-tv-submit-pin" class="vel-profile-tv-btn vel-profile-tv-btn--primary">
            Connecter
          </button>
        </div>
        <p id="vel-tv-pair-status" class="vel-profile-tv-msg"></p>
      `;
      card.appendChild(section);

      var pinInput = document.getElementById("vel-tv-pin-input");
      var submitBtn = document.getElementById("vel-tv-submit-pin");
      var statusMsg = document.getElementById("vel-tv-pair-status");

      async function submitPin() {
        var pin = pinInput.value.trim();
        if (pin.length !== 4) {
          statusMsg.className = "vel-profile-tv-msg is-error";
          statusMsg.textContent = "Entrez un code à 4 chiffres.";
          return;
        }
        submitBtn.disabled = true;
        statusMsg.className = "vel-profile-tv-msg";
        statusMsg.textContent = "Connexion en cours…";

        try {
          var res = await fetch("/api/tv/pair", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ pin: pin })
          });
          var data = await res.json();
          if (data.ok) {
            statusMsg.className = "vel-profile-tv-msg is-success";
            statusMsg.textContent = "TV connectée avec succès !";
            setTimeout(checkTvStatus, 600);
          } else {
            statusMsg.className = "vel-profile-tv-msg is-error";
            statusMsg.textContent = data.error || "Code invalide ou expiré.";
          }
        } catch (e) {
          statusMsg.className = "vel-profile-tv-msg is-error";
          statusMsg.textContent = "Erreur de connexion au serveur.";
        } finally {
          submitBtn.disabled = false;
        }
      }

      if (submitBtn) submitBtn.addEventListener("click", submitPin);
      if (pinInput) {
        pinInput.addEventListener("keydown", function (e) {
          if (e.key === "Enter") submitPin();
        });
        pinInput.addEventListener("input", function () {
          if (pinInput.value.trim().length === 4) submitPin();
        });
      }
    }
  }

  // Send media to play on TV
  async function sendToTv(media) {
    try {
      // 1. Close mobile transcode session if running
      try {
        if (typeof window.veloraCloseActiveTranscodeSession === "function") {
          window.veloraCloseActiveTranscodeSession();
        }
      } catch (_) {}

      // 2. Trigger native mobile player close buttons
      var closeVodBtn = document.getElementById("btn-close-vod-player");
      if (closeVodBtn) {
        try { closeVodBtn.click(); } catch (_) {}
      }
      var closeLiveBtn = document.getElementById("btn-close-player");
      if (closeLiveBtn) {
        try { closeLiveBtn.click(); } catch (_) {}
      }

      // 3. Completely pause and unload all mobile video players
      document.querySelectorAll("video").forEach(function (videoEl) {
        try {
          videoEl.pause();
          videoEl.removeAttribute("src");
          videoEl.load();
        } catch (_) {}
      });

      // Hide mobile player containers so phone stops displaying the player
      var liveContainer = document.getElementById("player-container");
      if (liveContainer) liveContainer.classList.add("hidden");
      var vodContainer = document.getElementById("vod-player-container");
      if (vodContainer) vodContainer.classList.add("hidden");

      // 4. Cool-down pause (400ms)
      await new Promise(function (resolve) { setTimeout(resolve, 400); });

      // 5. Resolve best stream URL for the TV
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

      var payload = {
        ...media,
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
        if (v && v.paused) {
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
      if (v && v.paused) {
        v.play().catch(function () {});
      }
    }
  }

  // Hook into playback requests: direct seamless routing based on auto-diffuse switch!
  function interceptPlayback(mediaData) {
    if (tvState.hasPairedTv && tvState.isOnline) {
      if (isAutoDiffuseOn()) {
        // Stop any local video element immediately
        document.querySelectorAll("video").forEach(function (v) {
          try { v.pause(); } catch (_) {}
        });
        sendToTv(mediaData);
        return true; // Sent directly to TV!
      }
      // If auto-diffuse is OFF, play locally on mobile without interruption
      return false;
    }
    return false;
  }

  // Observe Profile Modal opening to render TV settings IMMEDIATELY
  function observeProfileModal() {
    function tryInstantRender() {
      var modal = document.getElementById("vel-profile-account-modal");
      if (modal && !modal.hidden) {
        var card = modal.querySelector(".vel-profile-account__card");
        if (card && !document.getElementById("vel-profile-tv-card")) {
          renderTvSettingsSection();
        }
      }
    }

    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest("#vel-profile-account-open, [data-bottom-nav='profile']");
      if (btn) {
        setTimeout(function () {
          tryInstantRender();
          checkTvStatus();
        }, 0);
        setTimeout(tryInstantRender, 50);
      }
    }, true);

    var bodyObserver = new MutationObserver(function () {
      tryInstantRender();
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });

    tryInstantRender();
  }

  // Hook into unified Velora events
  function initPlaybackListeners() {
    var origSetMedia = window.VeloraCast && window.VeloraCast.setMedia;
    if (window.VeloraCast) {
      window.VeloraCast.setMedia = function (media) {
        if (origSetMedia) origSetMedia.call(window.VeloraCast, media);
        if (media && media.url) {
          interceptPlayback(media);
        }
      };
    }
  }

  // Initialize
  function init() {
    loadCachedTvStatus();
    injectStyles();
    observeProfileModal();
    initPlaybackListeners();
    handleUrlPairing();
    checkTvStatus();

    // Check TV online status and sync active broadcasting bar every 8s
    tvState.checkInterval = setInterval(checkTvStatus, 8000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

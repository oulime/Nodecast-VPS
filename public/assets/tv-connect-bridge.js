(function () {
  "use strict";

  var tvState = {
    hasPairedTv: false,
    isOnline: false,
    deviceId: null,
    deviceName: null,
    currentMedia: null,
    lastChecked: 0,
    checkInterval: null,
    promptPending: null
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

  // Inject scoped styles for TV settings and choice modal
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
        gap: 12px;
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
        line-height: 1.4;
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

      /* Destination Choice Modal */
      .vel-tv-choice-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 999999;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.25s ease;
      }
      @media (min-width: 600px) {
        .vel-tv-choice-overlay {
          align-items: center;
        }
      }
      .vel-tv-choice-overlay.is-open {
        opacity: 1;
        pointer-events: auto;
      }
      .vel-tv-choice-sheet {
        background: #150d2a;
        border: 1px solid rgba(167, 139, 250, 0.3);
        border-radius: 24px 24px 0 0;
        padding: 24px;
        max-width: 440px;
        width: 100%;
        box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.6);
        transform: translateY(40px);
        transition: transform 0.25s ease;
        text-align: center;
      }
      @media (min-width: 600px) {
        .vel-tv-choice-sheet {
          border-radius: 24px;
          transform: scale(0.95);
        }
      }
      .vel-tv-choice-overlay.is-open .vel-tv-choice-sheet {
        transform: translateY(0) scale(1);
      }
      .vel-tv-choice-title {
        font-size: 18px;
        font-weight: 800;
        color: #fff;
        margin-bottom: 6px;
      }
      .vel-tv-choice-media {
        font-size: 14px;
        color: #a78bfa;
        margin-bottom: 20px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .vel-tv-choice-options {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .vel-tv-choice-btn {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 18px;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.05);
        color: #fff;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        text-align: left;
        transition: all 0.2s ease;
      }
      .vel-tv-choice-btn:hover {
        background: rgba(139, 92, 246, 0.2);
        border-color: #8b5cf6;
      }
      .vel-tv-choice-btn--tv {
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(76, 29, 149, 0.3));
        border-color: rgba(167, 139, 250, 0.4);
      }
      .vel-tv-choice-icon {
        font-size: 24px;
        width: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .vel-tv-choice-sub {
        font-size: 12px;
        color: #94a3b8;
        font-weight: 400;
        margin-top: 2px;
      }
      .vel-tv-choice-close {
        margin-top: 14px;
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 13px;
        cursor: pointer;
      }

      /* Top TV Active Bar */
      .vel-tv-active-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: rgba(18, 11, 38, 0.95);
        border-bottom: 1px solid rgba(139, 92, 246, 0.3);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        padding: 8px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        z-index: 99990;
        font-size: 13px;
        color: #fff;
        animation: velTvSlideDown 0.3s ease;
      }
      @keyframes velTvSlideDown {
        from { transform: translateY(-100%); }
        to { transform: translateY(0); }
      }
      .vel-tv-active-bar__left {
        display: flex;
        align-items: center;
        gap: 8px;
        overflow: hidden;
      }
      .vel-tv-active-bar__title {
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 200px;
      }
      .vel-tv-active-bar__btn {
        background: rgba(255, 255, 255, 0.1);
        border: none;
        color: #e2e8f0;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  function loadCachedTvStatus() {
    try {
      var raw = localStorage.getItem("velora_tv_status_cache");
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          tvState.hasPairedTv = Boolean(parsed.hasPairedTv);
          tvState.isOnline = Boolean(parsed.isOnline);
          tvState.deviceId = parsed.deviceId || null;
          tvState.deviceName = parsed.deviceName || "Smart TV";
        }
      }
    } catch (_) {}
  }

  function saveCachedTvStatus() {
    try {
      localStorage.setItem("velora_tv_status_cache", JSON.stringify({
        hasPairedTv: tvState.hasPairedTv,
        isOnline: tvState.isOnline,
        deviceId: tvState.deviceId,
        deviceName: tvState.deviceName
      }));
    } catch (_) {}
  }

  function updateTvBadgeOnly() {
    var badge = document.querySelector(".vel-profile-tv-status-badge");
    if (badge) {
      badge.className = "vel-profile-tv-status-badge " + (tvState.isOnline ? "is-online" : "");
      badge.textContent = tvState.isOnline ? "● En ligne" : "○ Hors ligne";
    }
  }

  // Check TV status from backend
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
        var prevName = tvState.deviceName;
        tvState.hasPairedTv = Boolean(data.hasPairedTv);
        tvState.isOnline = Boolean(data.isOnline);
        tvState.deviceId = data.deviceId || null;
        tvState.deviceName = data.deviceName || "Smart TV";
        tvState.lastChecked = Date.now();
        saveCachedTvStatus();

        // If structure changed (e.g. unlinked or newly paired), re-render full card; otherwise just update badge
        if (prevPaired !== tvState.hasPairedTv || prevName !== tvState.deviceName) {
          renderTvSettingsSection();
        } else {
          updateTvBadgeOnly();
        }
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
      // Remove query param cleanly
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
      section.innerHTML = `
        <div class="vel-profile-tv-header">
          <span class="vel-profile-tv-title">📺 Smart TV Connectée</span>
          <span class="vel-profile-tv-status-badge ${tvState.isOnline ? "is-online" : ""}">
            ${tvState.isOnline ? "● En ligne" : "○ Hors ligne"}
          </span>
        </div>
        <p class="vel-profile-tv-desc">
          Appareil : <strong>${tvState.deviceName}</strong><br />
          ${tvState.isOnline ? "Prête pour la diffusion depuis votre mobile." : "Ouvrez <em>nodecast.veloravip.net/tv</em> sur votre TV pour diffuser."}
        </p>
        <div style="display:flex; justify-content:flex-end;">
          <button type="button" id="vel-tv-unlink-btn" class="vel-profile-tv-btn vel-profile-tv-btn--danger">
            Dissocier cette TV
          </button>
        </div>
        <p id="vel-tv-pair-status" class="vel-profile-tv-msg"></p>
      `;
      card.appendChild(section);

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
        // Auto submit when 4th digit entered
        pinInput.addEventListener("input", function () {
          if (pinInput.value.trim().length === 4) submitPin();
        });
      }
    }
  }

  // Create or get Choice Modal DOM
  function ensureChoiceModal() {
    var existing = document.getElementById("vel-tv-choice-overlay");
    if (existing) return existing;

    var overlay = document.createElement("div");
    overlay.id = "vel-tv-choice-overlay";
    overlay.className = "vel-tv-choice-overlay";
    overlay.innerHTML = `
      <div class="vel-tv-choice-sheet">
        <h3 class="vel-tv-choice-title">Où souhaitez-vous regarder ?</h3>
        <p id="vel-tv-choice-media" class="vel-tv-choice-media">Titre du média</p>
        <div class="vel-tv-choice-options">
          <button type="button" id="vel-choice-btn-tv" class="vel-tv-choice-btn vel-tv-choice-btn--tv">
            <span class="vel-tv-choice-icon">📺</span>
            <div>
              <div>Diffuser sur Smart TV</div>
              <div class="vel-tv-choice-sub" id="vel-choice-tv-sub">Salon TV • En ligne</div>
            </div>
          </button>
          <button type="button" id="vel-choice-btn-phone" class="vel-tv-choice-btn">
            <span class="vel-tv-choice-icon">📱</span>
            <div>
              <div>Regarder sur ce téléphone</div>
              <div class="vel-tv-choice-sub">Lecture locale privée</div>
            </div>
          </button>
        </div>
        <button type="button" id="vel-choice-btn-close" class="vel-tv-choice-close">Annuler</button>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeChoiceModal();
    });
    document.getElementById("vel-choice-btn-close").addEventListener("click", closeChoiceModal);

    return overlay;
  }

  function closeChoiceModal() {
    var overlay = document.getElementById("vel-tv-choice-overlay");
    if (overlay) overlay.classList.remove("is-open");
    tvState.promptPending = null;
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

      // 4. Cool-down pause (400ms) to ensure previous TCP connection to IPTV provider is fully released
      // This prevents the IPTV provider from returning HTTP 458 (Max simultaneous connections reached).
      await new Promise(function (resolve) { setTimeout(resolve, 400); });

      // 5. Resolve best stream URL for the TV (prefer direct stream over transcode)
      var targetUrl = media.sourceUrl || media.direct_source || media.castUrl || media.url;
      if (targetUrl && /\/api\/transcode\/[^/]+\/stream\.m3u8/i.test(targetUrl) && media.sourceUrl) {
        targetUrl = media.sourceUrl;
      }

      // Ensure URL is absolute and never has localhost
      if (targetUrl) {
        if (targetUrl.indexOf("/") === 0) {
          targetUrl = window.location.origin + targetUrl;
        } else if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(targetUrl)) {
          targetUrl = targetUrl.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, window.location.origin);
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
        showActiveTvBar(media.title);
      } else {
        window.alert(data.error || "Impossible de lancer la lecture sur la TV");
      }
    } catch (e) {
      console.error("[TV Bridge] sendToTv error:", e);
    }
  }

  // Mini top bar showing active TV stream
  function showActiveTvBar(title) {
    var existing = document.getElementById("vel-tv-active-bar");
    if (existing) existing.remove();

    var bar = document.createElement("div");
    bar.id = "vel-tv-active-bar";
    bar.className = "vel-tv-active-bar";
    bar.innerHTML = `
      <div class="vel-tv-active-bar__left">
        <span>📺</span>
        <span class="vel-tv-active-bar__title">${title || "Lecture sur TV"}</span>
      </div>
      <button type="button" id="vel-tv-stop-playback" class="vel-tv-active-bar__btn">
        Arrêter TV ⏹
      </button>
    `;
    document.body.appendChild(bar);

    document.getElementById("vel-tv-stop-playback").addEventListener("click", async function () {
      try {
        await fetch("/api/tv/command", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ action: "stop" })
        });
        bar.remove();
      } catch (_) {}
    });
  }

  // Hook into playback requests
  function interceptPlayback(mediaData) {
    // If TV is paired and confirmed online, prompt the user!
    if (tvState.hasPairedTv && tvState.isOnline) {
      // Pause mobile playback while user chooses destination
      document.querySelectorAll("video").forEach(function (v) {
        try { v.pause(); } catch (_) {}
      });

      var overlay = ensureChoiceModal();
      var titleEl = document.getElementById("vel-tv-choice-media");
      var subEl = document.getElementById("vel-choice-tv-sub");
      if (titleEl) titleEl.textContent = mediaData.title || mediaData.name || "Vidéo";
      if (subEl) subEl.textContent = (tvState.deviceName || "Smart TV") + " • Prête";

      var tvBtn = document.getElementById("vel-choice-btn-tv");
      var phoneBtn = document.getElementById("vel-choice-btn-phone");

      tvBtn.onclick = function () {
        closeChoiceModal();
        sendToTv(mediaData);
      };

      phoneBtn.onclick = function () {
        closeChoiceModal();
        // Allow mobile video to play normally
        var v = mediaData.video || document.getElementById("video") || document.getElementById("video-vod");
        if (v && v.paused) v.play().catch(function () {});
      };

      overlay.classList.add("is-open");
      return true; // Prompt shown
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

    // 1. Direct click capture on profile buttons: triggers instant 0ms render
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

    // 2. Persistent observer watching for modal creation or unhiding
    var bodyObserver = new MutationObserver(function () {
      tryInstantRender();
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });

    // 3. Immediate check in case modal already exists in DOM
    tryInstantRender();
  }

  // Hook into unified Velora events
  function initPlaybackListeners() {
    // Listen for VeloraCast setMedia calls
    var origSetMedia = window.VeloraCast && window.VeloraCast.setMedia;
    if (window.VeloraCast) {
      window.VeloraCast.setMedia = function (media) {
        if (origSetMedia) origSetMedia.call(window.VeloraCast, media);
        if (media && media.url) {
          // If TV is online, we intercept and show choice
          interceptPlayback(media);
        }
      };
    }

    // Listen for custom velora-playback-started event
    window.addEventListener("velora-playback-started", function (e) {
      var detail = e.detail;
      if (detail && tvState.hasPairedTv && tvState.isOnline) {
        // Checked when user starts playback
      }
    });
  }

  // Initialize
  function init() {
    loadCachedTvStatus();
    injectStyles();
    observeProfileModal();
    initPlaybackListeners();
    handleUrlPairing();
    checkTvStatus();

    // Check TV online status every 30s
    tvState.checkInterval = setInterval(checkTvStatus, 30000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

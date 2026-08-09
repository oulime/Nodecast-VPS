(function () {
  "use strict";

  const WATCH_TARGETS = [
    ".media-item",
    ".vel-home-section__card",
    ".vel-vod-movie-card",
    ".vel-vod-detail__watch",
    ".vel-vod-detail__episode",
    "[data-stream-id]",
    "[data-channel-id]"
  ].join(",");
  const CHECK_INTERVAL_MS = 30 * 1000;
  const state = {
    access: "checking",
    checking: null,
    expiryTimer: null,
    user: null,
    replaying: false
  };

  function authToken() {
    try { return localStorage.getItem("authToken") || ""; } catch (_) { return ""; }
  }

  function isAdmin(user) {
    return user && user.role === "admin";
  }

  function accessState(user) {
    if (!user || isAdmin(user)) return "active";
    if (user.subscriptionBlocked || user.subscriptionStatus === "blocked") return "blocked";
    const end = user.subscriptionEnd ? new Date(user.subscriptionEnd) : null;
    if (user.subscriptionStatus === "expired") return "expired";
    if (end && Number.isFinite(end.getTime()) && end.getTime() <= Date.now()) return "expired";
    return "active";
  }

  function stopPlayback() {
    let wasPlaying = false;
    document.querySelectorAll("video, audio").forEach(function (media) {
      wasPlaying = wasPlaying || !media.paused || Boolean(media.currentSrc);
      try { media.pause(); } catch (_) {}
      try {
        media.removeAttribute("src");
        media.querySelectorAll("source").forEach(function (source) { source.removeAttribute("src"); });
        media.load();
      } catch (_) {}
    });
    ["player-container", "vod-player-container", "now-playing", "now-playing-vod"].forEach(function (id) {
      const element = document.getElementById(id);
      if (element) element.classList.add("hidden");
    });
    try { window.dispatchEvent(new CustomEvent("velora-home-media-stop")); } catch (_) {}
    return wasPlaying;
  }

  function contactNumber() {
    const configured = document.querySelector('meta[name="velora-whatsapp-number"]')?.content || "";
    return configured.trim();
  }

  function whatsappUrl() {
    const message = encodeURIComponent("Bonjour, je souhaite renouveler mon abonnement VeloraVIP.");
    const number = contactNumber().replace(/\D/g, "");
    return number ? `https://wa.me/${number}?text=${message}` : `https://wa.me/?text=${message}`;
  }

  function ensureModal() {
    let modal = document.getElementById("vel-subscription-expired");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "vel-subscription-expired";
    modal.className = "vel-subscription-expired";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "vel-subscription-expired-title");
    modal.innerHTML = `
      <div class="vel-subscription-expired__card">
        <div class="vel-subscription-expired__icon" aria-hidden="true">!</div>
        <p class="vel-subscription-expired__eyebrow">ACCES SUSPENDU</p>
        <h2 id="vel-subscription-expired-title">Abonnement expiré</h2>
        <p class="vel-subscription-expired__copy">Votre période d'abonnement est terminée. Contactez le service client via WhatsApp pour renouveler votre accès.</p>
        <p class="vel-subscription-expired__contact"><span>WhatsApp</span><strong>${contactNumber() || "Service client"}</strong></p>
        <div class="vel-subscription-expired__actions">
          <a class="vel-subscription-expired__whatsapp" href="${whatsappUrl()}" target="_blank" rel="noopener noreferrer">Contacter sur WhatsApp</a>
          <button type="button" class="vel-subscription-expired__retry">J'ai renouvelé — Réessayer</button>
          <button type="button" class="vel-subscription-expired__close">Fermer</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector(".vel-subscription-expired__close").addEventListener("click", hideModal);
    modal.querySelector(".vel-subscription-expired__retry").addEventListener("click", async function () {
      const button = this;
      button.disabled = true;
      button.textContent = "Vérification...";
      await refreshAccess(true);
      button.disabled = false;
      button.textContent = "J'ai renouvelé — Réessayer";
      if (state.access === "active") hideModal();
    });
    return modal;
  }

  function showModal() {
    const modal = ensureModal();
    modal.hidden = false;
    document.body.classList.add("vel-subscription-locked");
    window.setTimeout(function () {
      modal.querySelector(".vel-subscription-expired__whatsapp")?.focus();
    }, 0);
  }

  function hideModal() {
    const modal = document.getElementById("vel-subscription-expired");
    if (modal) modal.hidden = true;
    document.body.classList.remove("vel-subscription-locked");
  }

  function scheduleExpiry(user) {
    if (state.expiryTimer) window.clearTimeout(state.expiryTimer);
    state.expiryTimer = null;
    if (!user || isAdmin(user) || !user.subscriptionEnd) return;
    const remaining = new Date(user.subscriptionEnd).getTime() - Date.now();
    if (!Number.isFinite(remaining)) return;
    if (remaining <= 0) {
      lockAccess("expired", true);
      return;
    }
    const maximumDelay = 2147483647;
    state.expiryTimer = window.setTimeout(function () {
      if (remaining + 100 > maximumDelay) {
        void refreshAccess(true);
        return;
      }
      lockAccess("expired", true);
      void refreshAccess(true);
    }, Math.min(remaining + 100, maximumDelay));
  }

  function lockAccess(reason, notifyIfPlaying) {
    state.access = reason === "blocked" ? "blocked" : "expired";
    const interrupted = stopPlayback();
    if (notifyIfPlaying && interrupted) showModal();
  }

  function applyUser(user, notifyIfPlaying) {
    state.user = user;
    const next = accessState(user);
    if (next === "active") {
      state.access = "active";
      scheduleExpiry(user);
      hideModal();
      return;
    }
    scheduleExpiry(null);
    lockAccess(next, notifyIfPlaying);
  }

  async function refreshAccess(notifyIfPlaying) {
    if (state.checking) return state.checking;
    const token = authToken();
    if (!token) {
      state.access = "signed-out";
      return null;
    }
    state.checking = fetch("/api/auth/me", {
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` }
    }).then(async function (response) {
      if (!response.ok) return null;
      const user = await response.json();
      applyUser(user, notifyIfPlaying);
      return user;
    }).catch(function () {
      return null;
    }).finally(function () {
      state.checking = null;
    });
    return state.checking;
  }

  function retryTarget(target) {
    if (!target || typeof target.click !== "function") return;
    state.replaying = true;
    try { target.click(); } finally { state.replaying = false; }
  }

  function guardWatchAttempt(event) {
    if (state.replaying) return;
    const target = event.target instanceof Element ? event.target.closest(WATCH_TARGETS) : null;
    if (!target || state.access === "active") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void refreshAccess(false).then(function () {
      if (state.access === "active") retryTarget(target);
      else showModal();
    });
  }

  document.addEventListener("click", guardWatchAttempt, true);
  document.addEventListener("play", function (event) {
    if (state.access === "active") return;
    try { event.target.pause(); } catch (_) {}
    stopPlayback();
    showModal();
  }, true);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) void refreshAccess(true);
  });
  window.addEventListener("focus", function () { void refreshAccess(true); });
  window.addEventListener("pageshow", function () { void refreshAccess(true); });
  window.setInterval(function () { void refreshAccess(true); }, CHECK_INTERVAL_MS);
  void refreshAccess(false);
})();

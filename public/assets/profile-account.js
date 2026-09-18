(function () {
  "use strict";

  const state = { user: null, timer: null, previousNav: null };
  const $ = (id) => document.getElementById(id);

  function token() {
    try { return localStorage.getItem("authToken") || ""; } catch (_) { return ""; }
  }

  function headers(json) {
    const result = { Accept: "application/json" };
    const authToken = token();
    if (authToken) result.Authorization = `Bearer ${authToken}`;
    if (json) result["Content-Type"] = "application/json";
    return result;
  }

  async function api(path, options) {
    const request = options || {};
    const response = await fetch(`/api/auth${path}`, {
      cache: "no-store",
      ...request,
      headers: { ...headers(request.body !== undefined), ...(request.headers || {}) }
    });
    const body = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  function formatDate(value) {
    const date = value ? new Date(value) : null;
    if (!date || !Number.isFinite(date.getTime())) return "Sans expiration";
    return date.toLocaleString("fr-FR", {
      weekday: "short", day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  }

  function remainingLabel(value) {
    const end = value ? new Date(value) : null;
    if (!end || !Number.isFinite(end.getTime())) return "Accès sans limite";
    let seconds = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 1000));
    if (!seconds) return "Abonnement expiré";
    const days = Math.floor(seconds / 86400);
    seconds -= days * 86400;
    const hours = Math.floor(seconds / 3600);
    seconds -= hours * 3600;
    const minutes = Math.floor(seconds / 60);
    seconds -= minutes * 60;
    const parts = [];
    if (days) parts.push(`${days} j`);
    if (hours || days) parts.push(`${hours} h`);
    parts.push(`${minutes} min`);
    if (!days) parts.push(`${seconds} s`);
    return `Expire dans ${parts.join(" ")}`;
  }

  function statusDetails(user) {
    if (user.role === "admin") return { key: "admin", label: "Administrateur" };
    if (user.subscriptionBlocked || user.subscriptionStatus === "blocked") return { key: "blocked", label: "Compte bloqué" };
    const end = user.subscriptionEnd ? new Date(user.subscriptionEnd) : null;
    if (user.subscriptionStatus === "expired" || (end && end.getTime() <= Date.now())) return { key: "expired", label: "Expiré" };
    return { key: "active", label: "Actif" };
  }

  function updateCountdown() {
    if (!state.user) return;
    const remaining = $("vel-profile-remaining");
    const badge = $("vel-profile-status");
    const status = statusDetails(state.user);
    if (remaining) remaining.textContent = state.user.role === "admin" ? "Accès administrateur — sans expiration" : remainingLabel(state.user.subscriptionEnd);
    if (badge) {
      badge.textContent = status.label;
      badge.dataset.status = status.key;
    }
  }

  function renderUser(user) {
    state.user = user;
    $("vel-profile-display-name").textContent = user.displayName || user.username || "Mon compte";
    $("vel-profile-username").textContent = user.username || "-";
    $("vel-profile-expiration").textContent = user.role === "admin" ? "Sans expiration" : formatDate(user.subscriptionEnd);
    updateCountdown();
    if (state.timer) window.clearInterval(state.timer);
    state.timer = window.setInterval(updateCountdown, 1000);
  }

  function setStatus(text, bad) {
    const element = $("vel-profile-password-status");
    if (!element) return;
    element.textContent = text || "";
    element.classList.toggle("is-error", Boolean(bad));
  }

  function showPasswordForm(show) {
    const form = $("vel-profile-password-form");
    form.hidden = !show;
    $("vel-profile-password-open").hidden = show;
    setStatus("");
    if (show) $("vel-profile-current-password").focus();
    else form.reset();
  }

  function ensureModal() {
    let modal = $("vel-profile-account-modal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "vel-profile-account-modal";
    modal.className = "vel-profile-account";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "vel-profile-account-title");
    modal.innerHTML = `
      <section class="vel-profile-account__card">
        <button type="button" class="vel-profile-account__close" aria-label="Fermer le profil" data-tv-focusable="true">×</button>
        <div class="vel-profile-account__avatar" aria-hidden="true">V</div>
        <p class="vel-profile-account__eyebrow">MON COMPTE</p>
        <h2 id="vel-profile-account-title"><span id="vel-profile-display-name">Profil</span></h2>
        <span id="vel-profile-status" class="vel-profile-account__badge" data-status="active">Actif</span>
        <div class="vel-profile-account__details">
          <div><span>Nom d'utilisateur</span><strong id="vel-profile-username">—</strong></div>
          <div><span>Date d'expiration</span><strong id="vel-profile-expiration">—</strong><small id="vel-profile-remaining">Vérification…</small></div>
        </div>
        <button id="vel-profile-password-open" type="button" class="vel-profile-account__primary" data-tv-focusable="true">Modifier mon mot de passe</button>
        <form id="vel-profile-password-form" class="vel-profile-account__password" hidden>
          <label>Mot de passe actuel<input id="vel-profile-current-password" type="password" required autocomplete="current-password" /></label>
          <label>Nouveau mot de passe<input id="vel-profile-new-password" type="password" required minlength="6" autocomplete="new-password" /></label>
          <label>Confirmer le nouveau mot de passe<input id="vel-profile-confirm-password" type="password" required minlength="6" autocomplete="new-password" /></label>
          <p id="vel-profile-password-status" class="vel-profile-account__status" aria-live="polite"></p>
          <div class="vel-profile-account__password-actions">
            <button type="button" class="vel-profile-account__secondary" data-profile-password-cancel>Annuler</button>
            <button type="submit" class="vel-profile-account__primary">Enregistrer</button>
          </div>
        </form>
      </section>`;
    document.body.appendChild(modal);
    modal.querySelector(".vel-profile-account__close").addEventListener("click", closeModal);
    modal.addEventListener("click", function (event) { if (event.target === modal) closeModal(); });
    $("vel-profile-password-open").addEventListener("click", function () { showPasswordForm(true); });
    modal.querySelector("[data-profile-password-cancel]").addEventListener("click", function () { showPasswordForm(false); });
    $("vel-profile-password-form").addEventListener("submit", changePassword);
    return modal;
  }

  async function changePassword(event) {
    event.preventDefault();
    const currentPassword = $("vel-profile-current-password").value;
    const newPassword = $("vel-profile-new-password").value;
    const confirmation = $("vel-profile-confirm-password").value;
    if (newPassword !== confirmation) return setStatus("Les nouveaux mots de passe ne correspondent pas.", true);
    if (newPassword.length < 6) return setStatus("Le nouveau mot de passe doit contenir au moins 6 caractères.", true);
    const submit = event.currentTarget.querySelector("button[type='submit']");
    submit.disabled = true;
    setStatus("Enregistrement…");
    try {
      await api("/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
      event.currentTarget.reset();
      setStatus("Mot de passe modifié avec succès.");
      window.setTimeout(function () { showPasswordForm(false); }, 900);
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      submit.disabled = false;
    }
  }

  function selectProfileNav() {
    const trigger = document.querySelector("[data-bottom-nav='profile']");
    if (!trigger) return;
    state.previousNav = document.querySelector("#vel-bottom-nav .is-active:not([data-bottom-nav='profile'])");
    document.querySelectorAll("#vel-bottom-nav [data-bottom-nav]").forEach(function (button) {
      button.classList.toggle("is-active", button === trigger);
      if (button === trigger) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  function restoreProfileNav() {
    const trigger = document.querySelector("[data-bottom-nav='profile']");
    if (trigger) {
      trigger.classList.remove("is-active");
      trigger.removeAttribute("aria-current");
    }
    let previous = state.previousNav;
    if (!previous || !previous.isConnected) {
      const activeTab = document.body.dataset.velActiveTab;
      const name = document.body.classList.contains("vel-home-empty-active")
        ? "home"
        : (document.body.classList.contains("vel-home-choice-picked") && activeTab ? activeTab : "home");
      previous = document.querySelector(`[data-bottom-nav='${name}']`);
    }
    if (previous) {
      previous.classList.add("is-active");
      previous.setAttribute("aria-current", "page");
    }
    state.previousNav = null;
  }

  async function openModal() {
    const modal = ensureModal();
    if (!modal.hidden) return;
    document.getElementById("vel-bottom-country-menu")?.setAttribute("hidden", "");
    document.getElementById("vel-bottom-profile-menu")?.setAttribute("hidden", "");
    selectProfileNav();
    modal.hidden = false;
    document.body.classList.add("vel-profile-account-open");
    $("vel-profile-display-name").textContent = "Chargement…";
    $("vel-profile-username").textContent = "—";
    $("vel-profile-expiration").textContent = "—";
    $("vel-profile-remaining").textContent = "Vérification…";
    showPasswordForm(false);
    try {
      renderUser(await api("/me"));
    } catch (error) {
      $("vel-profile-display-name").textContent = "Profil indisponible";
      $("vel-profile-remaining").textContent = error.message;
    }
    modal.querySelector(".vel-profile-account__close").focus();
  }

  function closeModal() {
    const modal = $("vel-profile-account-modal");
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("vel-profile-account-open");
    if (state.timer) window.clearInterval(state.timer);
    state.timer = null;
    showPasswordForm(false);
    restoreProfileNav();
  }

  function init() {
    const trigger = $("vel-profile-account-open");
    if (trigger) trigger.addEventListener("click", function () { void openModal(); });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !$("vel-profile-account-modal")?.hidden) closeModal();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();

(function () {
  "use strict";

  const STORAGE_KEY = "velora_subscription_welcome";
  const esc = (value) => String(value ?? "").replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));

  function readActivation() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function durationLabel(data) {
    const minutes = Number(data.subscriptionPlanMinutes);
    if (minutes === 1) return "1 minute";
    if (minutes > 1) return `${minutes} minutes`;
    const months = Number(data.subscriptionPlanMonths);
    if (months === 1) return "1 mois";
    if (months === 12) return "1 an";
    if (months === 24) return "2 ans";
    return months > 1 ? `${months} mois` : "votre période d’abonnement";
  }

  function expirationLabel(value) {
    const date = value ? new Date(value) : null;
    if (!date || !Number.isFinite(date.getTime())) return "";
    return date.toLocaleString("fr-FR", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  }

  function showWelcome(data) {
    const name = data.displayName || data.username || "Bienvenue";
    const overlay = document.createElement("div");
    overlay.className = "vel-subscription-welcome";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "vel-subscription-welcome-title");
    overlay.innerHTML = `
      <section class="vel-subscription-welcome__card">
        <div class="vel-subscription-welcome__icon" aria-hidden="true">✓</div>
        <p class="vel-subscription-welcome__eyebrow">COMPTE ACTIVÉ</p>
        <h2 id="vel-subscription-welcome-title">Bienvenue ${esc(name)}</h2>
        <p class="vel-subscription-welcome__copy">Votre abonnement vient de démarrer. Votre compte est actif pour <strong>${esc(durationLabel(data))}</strong>.</p>
        <div class="vel-subscription-welcome__expiration"><span>Expiration</span><strong>${esc(expirationLabel(data.subscriptionEnd))}</strong></div>
        <button type="button" class="vel-subscription-welcome__start">Commencer à regarder</button>
      </section>`;
    document.body.appendChild(overlay);
    const close = function () { overlay.remove(); };
    overlay.querySelector(".vel-subscription-welcome__start").addEventListener("click", close);
    overlay.addEventListener("click", function (event) { if (event.target === overlay) close(); });
    overlay.querySelector(".vel-subscription-welcome__start").focus();
  }

  function init() {
    const activation = readActivation();
    if (activation) showWelcome(activation);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();

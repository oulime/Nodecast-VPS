(function () {
  "use strict";

  const PLANS = [
    { value: "minutes:1", minutes: 1, label: "1 minute" },
    { value: "minutes:10", minutes: 10, label: "10 minutes" },
    { value: "months:1", months: 1, label: "1 mois" },
    { value: "months:3", months: 3, label: "3 mois" },
    { value: "months:6", months: 6, label: "6 mois" },
    { value: "months:12", months: 12, label: "1 an" },
    { value: "months:24", months: 24, label: "2 ans" }
  ];
  const state = { users: [], storage: null, editingId: null, renewingId: null, ready: false };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function adminHeaders(json = true) {
    const headers = { Accept: "application/json" };
    if (json) headers["Content-Type"] = "application/json";
    try {
      const token = localStorage.getItem("authToken") || "";
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {}
    try {
      const adminToken = sessionStorage.getItem("velora_catalog_admin_token") || "";
      if (adminToken) headers["X-Velora-Catalog-Admin"] = adminToken;
    } catch {}
    return headers;
  }

  async function api(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      cache: "no-store",
      ...options,
      headers: { ...adminHeaders(options.body !== undefined), ...(options.headers || {}) }
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  }

  function extractUserList(payload) {
    const queue = [payload];
    const seen = new Set();
    const listKeys = ["users", "paidUsers", "paid_users", "clients", "subscriptions", "data", "items", "results", "records", "rows", "payload", "content", "value"];
    const isUser = (value) => value && typeof value === "object" && !Array.isArray(value)
      && ("username" in value || "subscriptionStatus" in value || "subscriptionEnd" in value);
    while (queue.length) {
      const value = queue.shift();
      if (Array.isArray(value)) return value.filter((user) => user && typeof user === "object");
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      const records = Object.values(value).filter(isUser);
      if (records.length && records.length === Object.values(value).filter((item) => item && typeof item === "object").length) return records;
      for (const key of listKeys) {
        const nested = value[key];
        if (Array.isArray(nested)) return nested.filter((user) => user && typeof user === "object");
        if (nested && typeof nested === "object") queue.push(nested);
      }
    }
    const keys = payload && typeof payload === "object" ? Object.keys(payload).slice(0, 8).join(", ") : typeof payload;
    throw new Error(`Format de liste utilisateurs invalide (${keys || "vide"})`);
  }

  function status(text, bad = false) {
    const el = $("paid-users-status");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("error", bad);
  }

  function dialogStatus(text, bad = false) {
    const el = $("paid-dialog-status");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("error", bad);
  }

  function renewStatus(text, bad = false) {
    const el = $("paid-renew-status");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("error", bad);
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function selectedPlan(selectId) {
    const plan = PLANS.find((item) => item.value === $(selectId).value) || PLANS[2];
    return plan.minutes
      ? { subscriptionPlanMinutes: plan.minutes }
      : { subscriptionPlanMonths: plan.months };
  }

  function planLabel(user) {
    const plan = user.subscriptionPlanMinutes
      ? PLANS.find((item) => item.minutes === Number(user.subscriptionPlanMinutes))
      : PLANS.find((item) => item.months === Number(user.subscriptionPlanMonths));
    return plan?.label || "-";
  }

  function badge(user) {
    const s = user.subscriptionStatus || "active";
    const labels = { active: "Actif", pending: "En attente", expired: "Expire", blocked: "Bloque", admin: "Admin" };
    return `<span class="paid-users__badge paid-users__badge--${esc(s)}">${esc(labels[s] || s)}</span>`;
  }

  function closeOpenMenus() {
    document.querySelectorAll(".paid-users__menu[open]").forEach((menu) => { menu.open = false; });
  }

  function showDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "open");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function renderStats() {
    const active = state.users.filter((u) => u.subscriptionStatus === "active").length;
    const pending = state.users.filter((u) => u.subscriptionStatus === "pending").length;
    const expired = state.users.filter((u) => u.subscriptionStatus === "expired").length;
    const blocked = state.users.filter((u) => u.subscriptionStatus === "blocked").length;
    const stats = $("paid-users-stats");
    if (!stats) return;
    stats.innerHTML = [
      ["Clients", state.users.length],
      ["Actifs", active],
      ["En attente", pending],
      ["Expires", expired],
      ["Bloques", blocked]
    ].map(([label, value]) => `<div class="paid-users__stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("");
  }

  function userRows() {
    if (!state.users.length) return '<div class="paid-users__empty">Aucun client payant pour le moment.</div>';
    return `<div class="paid-users__table-wrap"><table class="paid-users__table"><thead><tr><th>Client</th><th>Username</th><th>Statut</th><th>Debut</th><th>Fin</th><th>Periode</th><th></th></tr></thead><tbody>${state.users.map((u) => `
      <tr>
        <td data-label="Client"><strong>${esc(u.displayName || "-")}</strong><small>Cree le ${esc(formatDate(u.createdAt))}</small></td>
        <td data-label="Username"><code>${esc(u.username)}</code></td>
        <td data-label="Statut">${badge(u)}</td>
        <td data-label="Debut">${esc(formatDate(u.subscriptionStart))}</td>
        <td data-label="Fin">${esc(formatDate(u.subscriptionEnd))}</td>
        <td data-label="Periode">${esc(planLabel(u))}</td>
        <td data-label="Actions" class="paid-users__actions">
          <details class="paid-users__menu">
            <summary aria-label="Actions client" title="Actions">...</summary>
            <div>
              <button type="button" data-paid-edit="${esc(u.id)}">Modifier</button>
              <button type="button" data-paid-renew="${esc(u.id)}">Renouveler</button>
              <button type="button" data-paid-toggle="${esc(u.id)}">${u.subscriptionBlocked ? "Debloquer" : "Bloquer"}</button>
              <button type="button" data-paid-delete="${esc(u.id)}" class="paid-users__delete">Supprimer</button>
            </div>
          </details>
        </td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  function renderUsers() {
    renderStats();
    const list = $("paid-users-list");
    if (list) list.innerHTML = userRows();
  }

  function renderStorage() {
    const el = $("paid-users-storage");
    if (!el) return;
    el.innerHTML = '<span>Stockage: <strong>SQLite VPS</strong></span><small>Base data/content.db, table users.</small>';
  }

  async function loadStorage() {
    state.storage = { mode: "sqlite", database: "data/content.db", table: "users" };
    renderStorage();
  }

  async function loadUsers() {
    status("Chargement des clients...");
    try {
      if (!state.storage) await loadStorage();
      state.users = extractUserList(await api("/velora/catalog/admin/paid-users"));
      renderUsers();
      status(`${state.users.length} client(s) payant(s).`);
    } catch (err) {
      status(`Chargement impossible : ${err.message}`, true);
    }
  }

  function resetUserDialog() {
    state.editingId = null;
    $("paid-user-id").value = "";
    $("paid-display-name").value = "";
    $("paid-username").value = "";
    $("paid-password").value = "";
    $("paid-plan").value = "months:1";
    $("paid-plan-row").hidden = false;
    $("paid-dialog-title").textContent = "Creer un client";
    $("paid-dialog-copy").textContent = "L'abonnement commence au moment ou vous cliquez sur Creer.";
    $("paid-submit").textContent = "Creer";
    dialogStatus("");
  }

  function openCreateDialog() {
    resetUserDialog();
    showDialog($("paid-user-dialog"));
    $("paid-display-name").focus();
  }

  function openEditDialog(id) {
    const user = state.users.find((u) => String(u.id) === String(id));
    if (!user) return;
    resetUserDialog();
    state.editingId = user.id;
    $("paid-user-id").value = user.id;
    $("paid-display-name").value = user.displayName || "";
    $("paid-username").value = user.username || "";
    $("paid-plan-row").hidden = true;
    $("paid-dialog-title").textContent = "Modifier le client";
    $("paid-dialog-copy").textContent = "Changez le nom, username ou password. Pour ajouter du temps, utilisez Renouveler.";
    $("paid-submit").textContent = "Enregistrer";
    showDialog($("paid-user-dialog"));
    $("paid-display-name").focus();
  }

  async function saveUser(event) {
    event.preventDefault();
    const submit = $("paid-submit");
    const payload = {
      displayName: $("paid-display-name").value.trim(),
      username: $("paid-username").value.trim()
    };
    const password = $("paid-password").value;
    if (password) payload.password = password;
    if (!state.editingId) Object.assign(payload, selectedPlan("paid-plan"));
    if (!state.editingId && !password) return dialogStatus("Password obligatoire pour creer un client.", true);
    submit.disabled = true;
    dialogStatus(state.editingId ? "Enregistrement..." : "Creation...");
    try {
      if (state.editingId) await api(`/velora/catalog/admin/paid-users/${encodeURIComponent(state.editingId)}`, { method: "PUT", body: JSON.stringify(payload) });
      else await api("/velora/catalog/admin/paid-users", { method: "POST", body: JSON.stringify(payload) });
      closeDialog($("paid-user-dialog"));
      await loadUsers();
      status(state.editingId ? "Client modifie." : "Client cree.");
      resetUserDialog();
    } catch (err) {
      dialogStatus(err.message, true);
    } finally {
      submit.disabled = false;
    }
  }

  async function toggleUser(id) {
    const user = state.users.find((u) => String(u.id) === String(id));
    if (!user) return;
    const nextBlocked = !user.subscriptionBlocked;
    if (nextBlocked && !confirm(`Bloquer ${user.displayName || user.username} ? Il ne pourra plus regarder.`)) return;
    status(nextBlocked ? "Blocage..." : "Deblocage...");
    try {
      await api(`/velora/catalog/admin/paid-users/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ subscriptionBlocked: nextBlocked }) });
      await loadUsers();
      status(nextBlocked ? "Client bloque." : "Client debloque.");
    } catch (err) {
      status(err.message, true);
    }
  }

  function openRenewDialog(id) {
    const user = state.users.find((u) => String(u.id) === String(id));
    if (!user) return;
    state.renewingId = user.id;
    $("paid-renew-plan").value = "months:1";
    $("paid-renew-client").textContent = user.displayName || user.username;
    $("paid-renew-current").textContent = `Fin actuelle: ${formatDate(user.subscriptionEnd)}. La periode choisie sera ajoutee au temps restant si le client est encore actif.`;
    renewStatus("");
    showDialog($("paid-renew-dialog"));
    $("paid-renew-plan").focus();
  }

  async function renewUser(event) {
    event.preventDefault();
    if (!state.renewingId) return;
    const submit = $("paid-renew-submit");
    const plan = selectedPlan("paid-renew-plan");
    submit.disabled = true;
    renewStatus("Renouvellement...");
    try {
      await api(`/velora/catalog/admin/paid-users/${encodeURIComponent(state.renewingId)}/renew`, { method: "POST", body: JSON.stringify(plan) });
      const label = planLabel(plan);
      closeDialog($("paid-renew-dialog"));
      state.renewingId = null;
      await loadUsers();
      status(`Client renouvele pour ${label}.`);
    } catch (err) {
      renewStatus(err.message, true);
    } finally {
      submit.disabled = false;
    }
  }

  async function deleteUser(id) {
    const user = state.users.find((u) => String(u.id) === String(id));
    if (!user) return;
    if (!confirm(`Supprimer definitivement ${user.displayName || user.username} ?`)) return;
    status("Suppression...");
    try {
      await api(`/velora/catalog/admin/paid-users/${encodeURIComponent(id)}`, { method: "DELETE" });
      await loadUsers();
      status("Client supprime.");
    } catch (err) {
      status(err.message, true);
    }
  }

  function activatePaidTab() {
    document.querySelectorAll("#settings-tabs [role='tab']").forEach((tab) => {
      const active = tab.dataset.settingsTab === "paid-users";
      tab.classList.toggle("settings-tabs__tab--active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll(".settings-tab-panel").forEach((panel) => {
      const active = panel.dataset.settingsTab === "paid-users";
      panel.classList.toggle("hidden", !active);
      panel.hidden = !active;
    });
    loadUsers();
  }

  function closeDialogsOnBackdrop(panel) {
    panel.querySelectorAll("dialog.paid-users-dialog").forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closeDialog(dialog);
      });
    });
  }

  function ensurePanel() {
    if (state.ready) return;
    const tabs = $("settings-tabs");
    const panels = document.querySelector(".settings-tab-panels");
    if (!tabs || !panels) return;

    if (!$("settings-tab-btn-paid-users")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.role = "tab";
      btn.id = "settings-tab-btn-paid-users";
      btn.className = "settings-tabs__tab";
      btn.dataset.settingsTab = "paid-users";
      btn.setAttribute("aria-selected", "false");
      btn.setAttribute("aria-controls", "settings-tab-paid-users");
      btn.tabIndex = -1;
      btn.textContent = "Abonnements";
      tabs.insertBefore(btn, $("settings-tab-btn-ip") || null);
      btn.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); activatePaidTab(); }, true);
    }

    if (!$("settings-tab-paid-users")) {
      const panel = document.createElement("section");
      panel.id = "settings-tab-paid-users";
      panel.className = "settings-tab-panel panel countries-admin-form paid-users hidden";
      panel.role = "tabpanel";
      panel.dataset.settingsTab = "paid-users";
      panel.setAttribute("aria-labelledby", "settings-tab-btn-paid-users");
      panel.hidden = true;
      panel.innerHTML = `
        <div class="paid-users__head">
          <div><span class="paid-users__eyebrow">ACCES PAYANT</span><h2>Abonnements clients</h2><p>Clients actifs: acces sans coupure apres connexion sur /login. Visiteurs non connectes: essai gratuit normal.</p></div>
          <div class="paid-users__top-actions"><button type="button" id="paid-new" class="primary">Nouveau client</button><button type="button" id="paid-refresh" class="secondary">Actualiser</button></div>
        </div>
        <p id="paid-users-status" class="status" aria-live="polite">Pret.</p>
        <div id="paid-users-storage" class="paid-users__storage"></div>
        <div id="paid-users-stats" class="paid-users__stats"></div>
        <div id="paid-users-list" class="paid-users__list"></div>

        <dialog id="paid-user-dialog" class="paid-users-dialog">
          <form id="paid-user-form" method="dialog" class="paid-users-dialog__panel">
            <input id="paid-user-id" type="hidden" />
            <div class="paid-users-dialog__head">
              <div><h3 id="paid-dialog-title">Creer un client</h3><p id="paid-dialog-copy">L'abonnement commence au moment ou vous cliquez sur Creer.</p></div>
              <button type="button" class="paid-users-dialog__close" data-paid-close aria-label="Fermer">x</button>
            </div>
            <div class="paid-users-dialog__grid">
              <div><label for="paid-display-name">Nom client</label><input id="paid-display-name" type="text" placeholder="Ex. Samad telephone" autocomplete="off" /></div>
              <div><label for="paid-username">Username</label><input id="paid-username" type="text" required autocomplete="off" /></div>
              <div><label for="paid-password">Password</label><input id="paid-password" type="text" minlength="6" placeholder="Minimum 6 caracteres" autocomplete="new-password" /></div>
              <div id="paid-plan-row"><label for="paid-plan">Periode</label><select id="paid-plan">${PLANS.map((p) => `<option value="${p.value}">${p.label}</option>`).join("")}</select></div>
            </div>
            <p id="paid-dialog-status" class="paid-users-dialog__status" aria-live="polite"></p>
            <div class="paid-users-dialog__actions"><button type="button" class="secondary" data-paid-close>Annuler</button><button id="paid-submit" type="submit" class="primary">Creer</button></div>
          </form>
        </dialog>

        <dialog id="paid-renew-dialog" class="paid-users-dialog paid-users-renew">
          <form id="paid-renew-form" method="dialog" class="paid-users-dialog__panel paid-users-dialog__panel--small">
            <div class="paid-users-dialog__head">
              <div><h3>Renouveler</h3><p id="paid-renew-client"></p></div>
              <button type="button" class="paid-users-dialog__close" data-paid-renew-close aria-label="Fermer">x</button>
            </div>
            <p id="paid-renew-current" class="paid-users-renew__copy"></p>
            <div class="paid-users-dialog__grid paid-users-dialog__grid--one">
              <div><label for="paid-renew-plan">Ajouter</label><select id="paid-renew-plan">${PLANS.map((p) => `<option value="${p.value}">${p.label}</option>`).join("")}</select></div>
            </div>
            <p id="paid-renew-status" class="paid-users-dialog__status" aria-live="polite"></p>
            <div class="paid-users-dialog__actions"><button type="button" class="secondary" data-paid-renew-close>Annuler</button><button id="paid-renew-submit" type="submit" class="primary">Renouveler</button></div>
          </form>
        </dialog>`;
      panels.appendChild(panel);
      panel.querySelector("#paid-user-form").addEventListener("submit", saveUser);
      panel.querySelector("#paid-renew-form").addEventListener("submit", renewUser);
      panel.querySelector("#paid-new").addEventListener("click", openCreateDialog);
      panel.querySelector("#paid-refresh").addEventListener("click", () => { state.storage = null; loadUsers(); });
      panel.querySelectorAll("[data-paid-close]").forEach((btn) => btn.addEventListener("click", () => closeDialog($("paid-user-dialog"))));
      panel.querySelectorAll("[data-paid-renew-close]").forEach((btn) => btn.addEventListener("click", () => { state.renewingId = null; closeDialog($("paid-renew-dialog")); }));
      closeDialogsOnBackdrop(panel);
      panel.addEventListener("click", (event) => {
        const edit = event.target.closest("[data-paid-edit]");
        const renew = event.target.closest("[data-paid-renew]");
        const toggle = event.target.closest("[data-paid-toggle]");
        const del = event.target.closest("[data-paid-delete]");
        if (edit) { closeOpenMenus(); return openEditDialog(edit.dataset.paidEdit); }
        if (renew) { closeOpenMenus(); return openRenewDialog(renew.dataset.paidRenew); }
        if (toggle) { closeOpenMenus(); return toggleUser(toggle.dataset.paidToggle); }
        if (del) { closeOpenMenus(); return deleteUser(del.dataset.paidDelete); }
      });
      resetUserDialog();
    }
    state.ready = true;
  }

  document.addEventListener("DOMContentLoaded", ensurePanel);
  document.addEventListener("click", (event) => {
    if (event.target.closest("#btn-admin-settings, #cc-open-settings, [data-settings-open]")) setTimeout(ensurePanel, 0);
  }, true);
  ensurePanel();
})();

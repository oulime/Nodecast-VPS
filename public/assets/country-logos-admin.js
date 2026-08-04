(() => {
  "use strict";
  const byId = new Map();
  const key = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const token = () => localStorage.getItem("authToken") || "";
  const escapeHtml = value => String(value || "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);

  function publish(logos) {
    window.__veloraCountryLogosByName = Object.create(null);
    (logos || []).forEach(logo => {
      byId.set(String(logo.countryId), logo);
      window.__veloraCountryLogosByName[key(logo.countryName)] = logo.path;
    });
    window.dispatchEvent(new CustomEvent("velora-country-logos-changed"));
  }

  async function load() {
    const response = await fetch("/api/country-logos", { cache: "no-store" });
    if (response.ok) publish((await response.json()).logos || []);
  }

  function fileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to read the image."));
      reader.readAsDataURL(file);
    });
  }

  async function upload(countryId, countryName, file) {
    if (!file || !file.type.startsWith("image/")) throw new Error("Choose an image file.");
    if (file.size > 2 * 1024 * 1024) throw new Error("The logo must be 2 MB or smaller.");
    const response = await fetch("/api/country-logos", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ countryId, countryName, dataBase64: await fileAsDataUrl(file) })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    byId.set(String(countryId), body.logo);
    window.__veloraCountryLogosByName[key(countryName)] = body.logo.path;
    window.dispatchEvent(new CustomEvent("velora-country-logos-changed"));
    return body.logo;
  }

  function enhanceForm() {
    const form = document.getElementById("mp-country-form");
    if (!form || document.getElementById("mp-country-logo")) return;
    const input = document.createElement("input");
    input.id = "mp-country-logo";
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.title = "Logo du nouveau pays";
    form.insertBefore(input, form.querySelector("button"));
  }

  function enhanceCards() {
    document.querySelectorAll("#mp-country-list [data-country]").forEach(card => {
      const id = String(card.dataset.country || "");
      const name = card.querySelector(".manual-pays__country-head strong")?.textContent?.trim() || "";
      const head = card.querySelector(".manual-pays__country-head");
      const actions = card.querySelector(".manual-pays__country-actions");
      if (!head || !actions) return;
      let preview = card.querySelector(".manual-pays__country-logo");
      if (!preview) {
        preview = document.createElement("img");
        preview.className = "manual-pays__country-logo";
        preview.alt = "";
        head.insertBefore(preview, head.firstChild);
      }
      const logo = byId.get(id);
      preview.src = logo?.path || window.__veloraCountryLogosByName?.[key(name)] || "";
      preview.hidden = !preview.src;
      if (card.querySelector("[data-country-logo-pick]")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.countryLogoPick = id;
      button.className = "manual-pays__logo-button";
      button.title = `Changer le logo de ${name}`;
      button.setAttribute("aria-label", button.title);
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 5h3l1.2-2h7.6L17 5h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm8 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-2.2a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6Z"/></svg>';
      actions.insertBefore(button, actions.firstChild);
    });
  }

  document.addEventListener("click", event => {
    const button = event.target.closest?.("[data-country-logo-pick]");
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    const card = button.closest("[data-country]");
    const picker = document.createElement("input");
    picker.type = "file"; picker.accept = "image/png,image/jpeg,image/webp,image/gif";
    picker.onchange = async () => {
      try {
        button.disabled = true;
        const name = card.querySelector(".manual-pays__country-head strong")?.textContent?.trim() || "Country";
        await upload(card.dataset.country, name, picker.files?.[0]);
        enhanceCards();
      } catch (error) { alert(error.message); }
      finally { button.disabled = false; }
    };
    picker.click();
  }, true);

  let pendingNewLogo = null;
  document.addEventListener("submit", event => {
    if (event.target.id !== "mp-country-form") return;
    const file = document.getElementById("mp-country-logo")?.files?.[0];
    const name = document.getElementById("mp-country-name")?.value?.trim();
    pendingNewLogo = file && name ? { file, name } : null;
    if (!pendingNewLogo) return;
    const started = Date.now();
    const timer = setInterval(async () => {
      let card = [...document.querySelectorAll("#mp-country-list [data-country]")].find(node => node.querySelector("strong")?.textContent?.trim().toLowerCase() === pendingNewLogo?.name.toLowerCase());
      let countryId = card?.dataset.country || "";
      if (!countryId && pendingNewLogo) {
        try {
          const response = await fetch(`/api/velora-db/rest/v1/admin_countries?select=id,name&name=eq.${encodeURIComponent(pendingNewLogo.name)}`, { headers: { apikey: "local-vps", Authorization: "Bearer local-vps" }, cache: "no-store" });
          const rows = response.ok ? await response.json() : [];
          countryId = String(rows?.[0]?.id || "");
        } catch (_) {}
      }
      if (!countryId && Date.now() - started < 12000) return;
      clearInterval(timer);
      if (!countryId || !pendingNewLogo) return;
      const item = pendingNewLogo; pendingNewLogo = null;
      try { await upload(countryId, item.name, item.file); enhanceCards(); } catch (error) { alert(`Country created, but logo upload failed: ${error.message}`); }
    }, 400);
  }, true);

  const observer = new MutationObserver(() => { enhanceForm(); enhanceCards(); });
  function start() { enhanceForm(); enhanceCards(); observer.observe(document.documentElement, { childList: true, subtree: true }); load().then(enhanceCards).catch(() => {}); }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start, { once: true }) : start();
})();

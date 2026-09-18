(() => {
  "use strict";
  const byId = new Map();
  const key = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const escapeHtml = value => String(value || "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);

  const flagCodes = {
    afghanistan: "af",
    afrique_du_sud: "za",
    albanie: "al",
    algerie: "dz",
    allemagne: "de",
    angleterre: "gb",
    arabie_saoudite: "sa",
    argentine: "ar",
    armenie: "am",
    australie: "au",
    autriche: "at",
    azerbaidjan: "az",
    bahrein: "bh",
    bangladesh: "bd",
    belgique: "be",
    bielorussie: "by",
    bolivie: "bo",
    bosnie: "ba",
    bosnie_herzegovine: "ba",
    bresil: "br",
    bulgarie: "bg",
    cameroun: "cm",
    canada: "ca",
    chili: "cl",
    chine: "cn",
    chypre: "cy",
    colombie: "co",
    congo: "cg",
    congo_gabon: "cg",
    coree_du_sud: "kr",
    costa_rica: "cr",
    croatie: "hr",
    cuba: "cu",
    danemark: "dk",
    ecosse: "gb-sct",
    egypte: "eg",
    emirats_arabes_unis: "ae",
    equateur: "ec",
    espagne: "es",
    estonie: "ee",
    etats_unis: "us",
    finlande: "fi",
    france: "fr",
    gabon: "ga",
    georgie: "ge",
    ghana: "gh",
    grece: "gr",
    guatemala: "gt",
    honduras: "hn",
    hong_kong: "hk",
    hongrie: "hu",
    inde: "in",
    indonesie: "id",
    irak: "iq",
    iran: "ir",
    irlande: "ie",
    islande: "is",
    israel: "il",
    italie: "it",
    japon: "jp",
    jordanie: "jo",
    kazakhstan: "kz",
    kosovo: "xk",
    koweit: "kw",
    kurdistan: "iq",
    laos: "la",
    lettonie: "lv",
    liban: "lb",
    libye: "ly",
    lituanie: "lt",
    luxembourg: "lu",
    macedoine: "mk",
    macedoine_du_nord: "mk",
    malaisie: "my",
    mali: "ml",
    malte: "mt",
    maroc: "ma",
    maurice: "mu",
    mauritanie: "mr",
    mexique: "mx",
    monaco: "mc",
    montenegro: "me",
    namibie: "na",
    nepal: "np",
    nicaragua: "ni",
    nigeria: "ng",
    norvege: "no",
    nouvelle_zelande: "nz",
    oman: "om",
    ouzbekistan: "uz",
    pakistan: "pk",
    palestine: "ps",
    panama: "pa",
    paraguay: "py",
    pays_bas: "nl",
    pays_de_galles: "gb-wls",
    perou: "pe",
    philippines: "ph",
    pologne: "pl",
    portugal: "pt",
    qatar: "qa",
    republique_dominicaine: "do",
    republique_tcheque: "cz",
    roumanie: "ro",
    royaume_uni: "gb",
    russie: "ru",
    salvador: "sv",
    senegal: "sn",
    serbie: "rs",
    slovaquie: "sk",
    slovenie: "si",
    somalie: "so",
    soudan: "sd",
    sri_lanka: "lk",
    suede: "se",
    suisse: "ch",
    suriname: "sr",
    syrie: "sy",
    taiwan: "tw",
    thailande: "th",
    tunisie: "tn",
    turquie: "tr",
    ukraine: "ua",
    uruguay: "uy",
    venezuela: "ve",
    vietnam: "vn",
    yemen: "ye",
    usa: "us"
  };

  function resolvedLogo(countryId, countryName) {
    const k = key(countryName);
    const custom = byId.get(String(countryId || ""))?.path || window.__veloraCountryLogosByName?.[k] || "";
    if (custom) return custom;
    if (k === "arabe") return "/logos/arabe.svg";
    if (typeof window.__veloraCountryFlagUrl === "function") {
      const u = window.__veloraCountryFlagUrl(countryName);
      if (u) return u;
    }
    const code = flagCodes[k];
    return code ? `https://flagcdn.com/w40/${code}.png` : "";
  }

  window.__veloraCountryFlagUrl = function (countryName) {
    const k = key(countryName);
    const custom = byId.get(String(countryName || ""))?.path || window.__veloraCountryLogosByName?.[k] || "";
    if (custom) return custom;
    if (k === "arabe") return "/logos/arabe.svg";
    const code = flagCodes[k];
    return code ? `https://flagcdn.com/w40/${code}.png` : "";
  };

  function setImageSource(image, source) {
    if (!image) return;
    if (source) {
      image.src = source;
      image.hidden = false;
    } else {
      image.removeAttribute("src");
      image.hidden = true;
    }
  }

  function refreshAppLogos() {
    const select = document.getElementById("country-select");
    const selectedName = select?.selectedOptions?.[0]?.textContent?.trim() || document.getElementById("home-country-value")?.textContent?.trim() || "";
    const selectedLogo = resolvedLogo("", selectedName);
    ["home-country-flag", "vel-brand-country-flag", "vel-bottom-country-flag"].forEach(id => {
      const image = document.getElementById(id);
      if (!image || !selectedLogo) return;
      image.src = selectedLogo;
      image.hidden = false;
    });
    document.querySelectorAll(".vel-home-country-picker__option, #vel-bottom-country-options [role='option']").forEach(option => {
      let name = option.querySelector(":scope > .vel-app-country-option__name");
      if (!name) {
        name = option.querySelector(":scope > span:not(.vel-bottom-country-menu__check)");
        if (name) name.classList.add("vel-app-country-option__name");
      }
      if (!name) {
        const text = [...option.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(" ").trim();
        if (!text) return;
        [...option.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).forEach(node => node.remove());
        name = document.createElement("span");
        name.className = "vel-app-country-option__name";
        name.textContent = text;
        option.prepend(name);
      }
      let image = option.querySelector(":scope > .vel-app-country-option__logo");
      if (!image) {
        image = document.createElement("img");
        image.className = "vel-app-country-option__logo";
        image.alt = "";
        image.decoding = "async";
        option.insertBefore(image, name);
      }
      const countryId = option.dataset.countryId || option.dataset.value || "";
      setImageSource(image, resolvedLogo(countryId, name.textContent));
    });
  }

  function publish(logos) {
    window.__veloraCountryLogosByName = Object.create(null);
    (logos || []).forEach(logo => {
      byId.set(String(logo.countryId), logo);
      window.__veloraCountryLogosByName[key(logo.countryName)] = logo.path;
    });
    refreshAppLogos();
    window.dispatchEvent(new CustomEvent("velora-country-logos-changed"));
  }

  window.refreshAppCountryLogos = refreshAppLogos;

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
      headers: { "Content-Type": "application/json", apikey: "local-vps", Authorization: "Bearer local-vps" },
      body: JSON.stringify({ countryId, countryName, dataBase64: await fileAsDataUrl(file) })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    byId.set(String(countryId), body.logo);
    window.__veloraCountryLogosByName[key(countryName)] = body.logo.path;
    refreshAppLogos();
    window.dispatchEvent(new CustomEvent("velora-country-logos-changed"));
    return body.logo;
  }

  async function remove(countryId, countryName) {
    const response = await fetch(`/api/country-logos/${encodeURIComponent(countryId)}`, {
      method: "DELETE",
      headers: { apikey: "local-vps", Authorization: "Bearer local-vps" }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    byId.delete(String(countryId));
    delete window.__veloraCountryLogosByName[key(countryName)];
    refreshAppLogos();
    window.dispatchEvent(new CustomEvent("velora-country-logos-changed"));
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

  function actionList(actions) {
    let list = actions.querySelector(".manual-pays__country-action-list");
    if (list) return list;
    const menu = document.createElement("details");
    menu.className = "manual-pays__country-action-menu";
    const summary = document.createElement("summary");
    summary.textContent = "Options";
    summary.addEventListener("click", event => event.stopPropagation());
    list = document.createElement("div");
    list.className = "manual-pays__country-action-list";
    [...actions.children].forEach(child => list.appendChild(child));
    menu.append(summary, list);
    actions.appendChild(menu);
    return list;
  }

  function labelActions(card, list) {
    const hidden = card.classList.contains("is-hidden-country");
    const state = hidden ? "hidden" : "visible";
    // This runs from a document-wide MutationObserver. Rewriting identical
    // button text creates another child-list mutation, so make the decoration
    // idempotent before touching the DOM.
    if (list.dataset.actionLabelsState === state) return;
    list.dataset.actionLabelsState = state;
    list.querySelectorAll("button").forEach(button => {
      button.classList.add("manual-pays__country-action");
      if (button.matches("[data-toggle-country]")) button.textContent = hidden ? "Afficher le pays" : "Masquer le pays";
      if (button.matches("[data-delete-country]")) button.textContent = "Supprimer le pays";
      if (button.matches("[data-country-logo-pick]")) button.textContent = "Ajouter / modifier l’image";
      if (button.matches("[data-country-logo-delete]")) button.textContent = "Supprimer l’image";
    });
  }

  function enhanceCards() {
    document.querySelectorAll("#mp-country-list [data-country]").forEach(card => {
      const id = String(card.dataset.country || "");
      const name = card.querySelector(".manual-pays__country-head strong")?.textContent?.trim() || "";
      const head = card.querySelector(".manual-pays__country-head");
      const actions = card.querySelector(".manual-pays__country-actions");
      if (!head || !actions) return;
      const list = actionList(actions);
      let preview = card.querySelector(".manual-pays__country-logo");
      if (!preview) {
        preview = document.createElement("img");
        preview.className = "manual-pays__country-logo";
        preview.alt = "";
        head.insertBefore(preview, head.firstChild);
      }
      const logo = byId.get(id);
      setImageSource(preview, resolvedLogo(id, name));
      if (card.querySelector("[data-country-logo-pick]")) {
        const existingDelete = card.querySelector("[data-country-logo-delete]");
        if (existingDelete) existingDelete.hidden = !logo;
        labelActions(card, list);
        return;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.countryLogoPick = id;
      button.className = "manual-pays__logo-button";
      button.title = `Changer le logo de ${name}`;
      button.setAttribute("aria-label", button.title);
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 5h3l1.2-2h7.6L17 5h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm8 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-2.2a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6Z"/></svg>';
      list.appendChild(button);
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.dataset.countryLogoDelete = id;
      deleteButton.className = "manual-pays__logo-button";
      deleteButton.title = `Supprimer le logo de ${name}`;
      deleteButton.setAttribute("aria-label", deleteButton.title);
      deleteButton.textContent = "×";
      deleteButton.hidden = !logo;
      list.appendChild(deleteButton);
      labelActions(card, list);
    });
  }

  document.addEventListener("click", event => {
    const deleteButton = event.target.closest?.("[data-country-logo-delete]");
    if (deleteButton) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      const card = deleteButton.closest("[data-country]");
      const name = card?.querySelector(".manual-pays__country-head strong")?.textContent?.trim() || "ce pays";
      if (!window.confirm(`Supprimer le logo de ${name} ?`)) return;
      deleteButton.disabled = true;
      remove(deleteButton.dataset.countryLogoDelete, name).then(() => {
        const preview = card?.querySelector(".manual-pays__country-logo");
        setImageSource(preview, resolvedLogo(card?.dataset.country, name));
        deleteButton.hidden = true;
        const status = document.getElementById("countries-admin-status");
        if (status) status.textContent = `Logo de ${name} supprimé.`;
      }).catch(error => { alert(error.message); deleteButton.disabled = false; });
      return;
    }
    const button = event.target.closest?.("[data-country-logo-pick]");
    if (!button) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    const card = button.closest("[data-country]");
    const picker = document.createElement("input");
    picker.type = "file"; picker.accept = "image/png,image/jpeg,image/webp,image/gif";
    picker.style.display = "none";
    document.body.appendChild(picker);
    picker.onchange = async () => {
      try {
        button.disabled = true;
        const name = card.querySelector(".manual-pays__country-head strong")?.textContent?.trim() || "Country";
        const saved = await upload(card.dataset.country, name, picker.files?.[0]);
        enhanceCards();
        const status = document.getElementById("countries-admin-status");
        if (status) status.textContent = `Logo de ${name} enregistré sur le VPS.`;
        const preview = card.querySelector(".manual-pays__country-logo");
        if (preview) { preview.src = `${saved.path}?v=${Date.now()}`; preview.hidden = false; }
      } catch (error) { alert(error.message); }
      finally { button.disabled = false; picker.remove(); }
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

  const observer = new MutationObserver(() => { enhanceForm(); enhanceCards(); refreshAppLogos(); });
  function start() { enhanceForm(); enhanceCards(); observer.observe(document.documentElement, { childList: true, subtree: true }); load().then(enhanceCards).catch(() => {}); }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start, { once: true }) : start();
})();

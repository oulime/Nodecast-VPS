/**
 * VeloraVIP - Contrôleur d'administration pour le Mappage des Chaînes Football par Pays
 * Permet d'associer les diffuseurs officiels des matchs aux chaînes IPTV de votre bouquet pour chaque pays visible.
 */

(function () {
  "use strict";

  var SURL = "/api/velora-db";
  var KEY = "local-vps";
  var STORAGE_KEY = "velora_football_channel_mappings";
  var SETTING_DB_KEY = "football_channel_mappings";

  // Table des codes ISO pour génération dynamique des drapeaux emoji
  var FLAG_CODES = {
    afghanistan: "af",
    afrique: "za",
    afrique_du_sud: "za",
    albanie: "al",
    algerie: "dz",
    allemagne: "de",
    angleterre: "gb",
    arabie_saoudite: "sa",
    argentine: "ar",
    armenie: "am",
    asia: "cn",
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
    usa: "us",
    mena: "ar",
    arabe: "ar",
    uk: "gb"
  };

  function isoToEmoji(code) {
    if (!code || typeof code !== "string") return "";
    code = code.trim().toLowerCase();
    if (code === "gb-sct") return "🏴󠁧󠁢󠁳󠁣󠁴󠁿";
    if (code === "gb-wls") return "🏴󠁧󠁢󠁷󠁬󠁳󠁿";
    if (code.length !== 2) return "";
    var codePoints = [...code.toUpperCase()].map(function (c) {
      return 0x1F1E6 + c.charCodeAt(0) - 65;
    });
    try {
      return String.fromCodePoint.apply(String, codePoints);
    } catch (_) {
      return "";
    }
  }

  // Aucune règle codée en dur : l'administrateur a le contrôle total
  var DEFAULT_RECOMMENDED_BY_COUNTRY = {};

  var state = {
    // Structure multi-pays: { "_default": [ { id, channel, competition, packages, aliases } ], ... }
    store: {},
    visibleCountriesList: [],
    allLivePackages: [],
    selectedCountry: "france",
    isEditing: false,
    editingRuleId: "",
    selectedFormPackages: []
  };

  function esc(v) {
    return String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  function setStatus(msg, isError) {
    var el = getEl("football-admin-status");
    if (el) {
      el.textContent = msg;
      el.className = "vel-foot-status" + (isError ? " vel-foot-status--error" : (msg ? " vel-foot-status--success" : ""));
    }
  }

  function visibilityKey(value) {
    return String(value || "")
      .trim()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function countrySlug(raw) {
    if (!raw) return "_default";
    var s = String(raw).trim();
    if (s === "_default" || s === "default" || s === "global" || s === "all") return "_default";
    return String(s)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/^country_/, "")
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/^_+|_+$/g, "") || "_default";
  }

  function getCountryMeta(countryNameOrId) {
    var raw = String(countryNameOrId || "").trim();
    var cid = countrySlug(raw);

    if (cid === "_default") {
      return { id: "_default", name: "Tous les pays (Par défaut)", flag: "🌐", code: "" };
    }

    var normK = visibilityKey(raw);
    var iso = FLAG_CODES[normK] || FLAG_CODES[cid] || "";
    var flag = "🏳️";

    if (iso) {
      flag = isoToEmoji(iso) || "🏳️";
    } else if (/^(arabe|mena|oriental)$/i.test(normK) || /^(arabe|mena)$/i.test(cid)) {
      flag = "🌍";
    }

    var foundInVis = (state.visibleCountriesList || []).find(function (vc) {
      return vc.id === cid || visibilityKey(vc.name) === normK;
    });

    var displayName = foundInVis ? foundInVis.name : (raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, " "));

    return {
      id: cid,
      name: displayName,
      flag: flag,
      code: iso || cid.slice(0, 2),
      dbId: foundInVis ? foundInVis.dbId : null
    };
  }

  function normalizeChannelText(str) {
    if (!str) return "";
    return String(str)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\b(fhd|uhd|4k|hd|sd|hevc|h265|h264|50fps|60fps|1080p|720p|vip|raw|premium|multi-canal|multisports|bar)\b/gi, " ")
      .replace(/[|+_\-\[\]():.#/]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeCompKey(comp) {
    if (!comp) return "";
    return String(comp)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function isCompetitionMatch(compA, compB) {
    if (!compA || !compB) return false;
    var rawA = String(compA).trim();
    var rawB = String(compB).trim();
    if (rawA === "_all" || rawB === "_all" || rawA.toLowerCase() === "all" || rawB.toLowerCase() === "all") return true;

    var keyA = normalizeCompKey(rawA);
    var keyB = normalizeCompKey(rawB);
    if (!keyA || !keyB) return false;

    if (keyA === keyB) return true;

    if (keyA.length >= 4 && keyB.length >= 4 && (keyA.includes(keyB) || keyB.includes(keyA))) {
      return true;
    }

    var cleanA = keyA
      .replace(/^(uefa|fifa|conmebol|caf|the|english|spanish|french|italian|german)/, "")
      .replace(/(easports|ubereats|mcdonalds|mcdonald|santander|bkt|tim|enilive|emirates|carabao|betclic|orange|telekom)$/, "");
    var cleanB = keyB
      .replace(/^(uefa|fifa|conmebol|caf|the|english|spanish|french|italian|german)/, "")
      .replace(/(easports|ubereats|mcdonalds|mcdonald|santander|bkt|tim|enilive|emirates|carabao|betclic|orange|telekom)$/, "");

    if (cleanA && cleanB) {
      if (cleanA === cleanB) return true;
      if (cleanA.length >= 4 && cleanB.length >= 4 && (cleanA.includes(cleanB) || cleanB.includes(cleanA))) return true;
    }

    var aliases = [
      ["laliga", "liga", "primeradivision", "espana"],
      ["ligue1", "l1", "ligue1mcdonalds", "ligue1ubereats"],
      ["ligue2", "l2", "ligue2bkt"],
      ["premierleague", "pl", "epl", "premiership", "england"],
      ["seriea", "calcio", "serieaenilive", "serieatim", "italia"],
      ["bundesliga", "1bundesliga", "germany"],
      ["championsleague", "ucl", "c1", "liguedeschampions", "uefachampionsleague"],
      ["europaleague", "uel", "c3", "ligueeuropa", "uefaeuropaleague"],
      ["conferenceleague", "uecl", "c4", "uefaconferenceleague", "uefaeuropaconferenceleague"],
      ["copadelrey", "coupeduroi"],
      ["facup", "thefacup", "emiratesfacup"],
      ["carabaocup", "eflcup", "leaguecup"],
      ["coupedefrance", "frenchcup"],
      ["worldcup", "coupedumonde", "fifaworldcup", "mondial"],
      ["can", "afcon", "coupedafriquedesnations", "africacupofnations"]
    ];

    for (var i = 0; i < aliases.length; i++) {
      var group = aliases[i];
      var hasA = group.some(function (alias) { return keyA === alias || cleanA === alias || (alias.length >= 4 && keyA.includes(alias)); });
      var hasB = group.some(function (alias) { return keyB === alias || cleanB === alias || (alias.length >= 4 && keyB.includes(alias)); });
      if (hasA && hasB) return true;
    }

    return false;
  }

  /**
   * Normalise une règle unitaire.
   */
  function normalizeRule(rawItem, idx) {
    if (!rawItem) return null;
    var count = (idx || 0) + 1;
    if (typeof rawItem === "string") {
      return {
        id: "r_" + count + "_" + Math.random().toString(36).slice(2, 7),
        channel: rawItem.trim(),
        competition: "_all",
        packages: [],
        aliases: [rawItem.trim()]
      };
    }
    var channel = String(rawItem.channel || rawItem.key || rawItem.name || "").trim();
    if (!channel) return null;

    var comp = String(rawItem.competition || "_all").trim();
    if (!comp || comp === "all" || comp === "global" || comp.toLowerCase() === "toutes les compétitions (par défaut)") comp = "_all";

    var pkgs = Array.isArray(rawItem.packages)
      ? rawItem.packages.map(String).map(function (s) { return s.trim(); }).filter(Boolean)
      : (rawItem.packages ? [String(rawItem.packages).trim()] : []);

    var aliases = Array.isArray(rawItem.aliases)
      ? rawItem.aliases.map(String).map(function (s) { return s.trim(); }).filter(Boolean)
      : (rawItem.aliases ? [String(rawItem.aliases).trim()] : []);

    return {
      id: String(rawItem.id || ("r_" + count + "_" + Math.random().toString(36).slice(2, 7))),
      channel: channel,
      competition: comp,
      packages: pkgs,
      aliases: aliases
    };
  }

  /**
   * Normalise le tableau ou dictionnaire de règles d'un pays.
   */
  function normalizeCountryRules(rawRules) {
    if (!rawRules) return [];
    if (Array.isArray(rawRules)) {
      return rawRules.map(normalizeRule).filter(Boolean);
    }
    if (typeof rawRules === "object") {
      var list = [];
      var idx = 0;
      for (var k in rawRules) {
        var val = rawRules[k];
        if (Array.isArray(val)) {
          list.push({
            id: "r_" + (++idx) + "_" + Math.random().toString(36).slice(2, 7),
            channel: String(k).trim(),
            competition: "_all",
            packages: [],
            aliases: val.map(String).map(function (s) { return s.trim(); }).filter(Boolean)
          });
        } else if (val && typeof val === "object") {
          var norm = normalizeRule(Object.assign({ channel: k }, val), ++idx);
          if (norm) list.push(norm);
        }
      }
      return list;
    }
    return [];
  }

  /**
   * Normalise l'objet complet multi-pays.
   */
  function normalizeStore(raw) {
    var normalized = {};
    if (!raw || typeof raw !== "object") {
      return normalized;
    }

    if (Array.isArray(raw)) {
      normalized._default = normalizeCountryRules(raw);
      return normalized;
    }

    for (var c in raw) {
      var slug = countrySlug(c);
      normalized[slug] = normalizeCountryRules(raw[c]);
    }

    return normalized;
  }

  function getCountryMappings(countryId) {
    var cid = countrySlug(countryId);
    if (!state.store[cid]) {
      state.store[cid] = [];
    }
    return state.store[cid];
  }

  /**
   * Récupère la liste exacte des pays visibles créés par l'admin dans l'onglet Pays.
   */
  async function fetchVisibleCountries(force) {
    if (!force && state.visibleCountriesList && state.visibleCountriesList.length > 0) {
      return state.visibleCountriesList;
    }

    try {
      var t = localStorage.getItem("authToken");
      var headers = { "apikey": KEY, "Authorization": "Bearer " + KEY };
      if (t) headers.Authorization = "Bearer " + t;

      var [adminRes, canonRes] = await Promise.all([
        fetch(SURL + "/rest/v1/admin_countries?select=id,name&order=name.asc", { headers: headers }),
        fetch(SURL + "/rest/v1/canonical_countries?select=match_key,display_name&order=display_name.asc", { headers: headers })
      ]);

      var adminList = adminRes.ok ? await adminRes.json() : [];
      var canonList = canonRes.ok ? await canonRes.json() : [];

      var visibleSet = new Set(
        canonList
          .filter(function (x) { return String(x.match_key || "").startsWith("__visible__:"); })
          .map(function (x) { return visibilityKey(x.display_name); })
      );

      var NON_COUNTRIES = new Set(["adult", "adulte"]);
      var filtered = adminList.filter(function (c) {
        if (!c || !c.name) return false;
        var vk = visibilityKey(c.name);
        return !NON_COUNTRIES.has(vk) && visibleSet.has(vk);
      });

      var list = (filtered.length > 0) ? filtered : adminList.filter(function (c) {
        return c && c.name && !NON_COUNTRIES.has(visibilityKey(c.name));
      });

      state.visibleCountriesList = list.map(function (c) {
        var id = countrySlug(c.name);
        var meta = getCountryMeta(c.name);
        return {
          id: id,
          name: c.name,
          flag: meta.flag,
          code: meta.code,
          dbId: c.id
        };
      });

      return state.visibleCountriesList;
    } catch (e) {
      console.warn("[Velora Football Admin] Erreur chargement pays visibles:", e.message);
      return state.visibleCountriesList || [];
    }
  }

  /**
   * Récupère les packages Live disponibles.
   */
  async function fetchLivePackages() {
    if (state.allLivePackages && state.allLivePackages.length > 0) {
      return state.allLivePackages;
    }
    try {
      var t = localStorage.getItem("authToken");
      var headers = { "apikey": KEY, "Authorization": "Bearer " + KEY };
      if (t) headers.Authorization = "Bearer " + t;

      var res = await fetch(SURL + "/rest/v1/admin_packages?kind=eq.live&order=name.asc", { headers: headers });
      if (res.ok) {
        var rows = await res.json();
        if (Array.isArray(rows)) {
          state.allLivePackages = rows;
          renderPackagesDatalist();
          return rows;
        }
      }
    } catch (_) {}
    return state.allLivePackages || [];
  }

  function injectStyles() {
    if (document.getElementById("velora-football-admin-styles")) return;
    var style = document.createElement("style");
    style.id = "velora-football-admin-styles";
    style.textContent = `
      .vel-foot-admin-panel {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        color: #f1f5f9;
      }
      .vel-foot-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 1rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .vel-foot-header-info h2 {
        margin: 0;
        font-size: 1.35rem;
        font-weight: 800;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: #fff;
      }
      .vel-foot-header-info p {
        margin: 0.25rem 0 0;
        font-size: 0.85rem;
        color: #94a3b8;
      }
      .vel-foot-header-actions {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        flex-wrap: wrap;
      }
      .vel-foot-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.5rem 0.95rem;
        border-radius: 8px;
        font-size: 0.84rem;
        font-weight: 700;
        cursor: pointer;
        border: 1px solid transparent;
        transition: all 0.2s ease;
      }
      .vel-foot-btn-primary {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: #fff;
        box-shadow: 0 2px 10px rgba(16, 185, 129, 0.35);
      }
      .vel-foot-btn-primary:hover {
        background: linear-gradient(135deg, #059669 0%, #047857 100%);
        box-shadow: 0 4px 14px rgba(16, 185, 129, 0.45);
      }
      .vel-foot-btn-secondary {
        background: rgba(255, 255, 255, 0.07);
        border-color: rgba(255, 255, 255, 0.16);
        color: #e2e8f0;
      }
      .vel-foot-btn-secondary:hover {
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
      }
      .vel-foot-btn-sm {
        padding: 0.35rem 0.65rem;
        font-size: 0.76rem;
        border-radius: 6px;
      }
      .vel-foot-country-bar {
        display: flex;
        align-items: center;
        gap: 0.85rem;
        padding: 0.85rem 1.15rem;
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        overflow-x: auto;
        white-space: nowrap;
        scrollbar-width: thin;
      }
      .vel-foot-country-bar-label {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.82rem;
        font-weight: 800;
        color: #38bdf8;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        flex-shrink: 0;
      }
      .vel-foot-country-pills {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: nowrap;
      }
      .vel-foot-country-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        padding: 0.45rem 0.85rem;
        border-radius: 9999px;
        font-size: 0.84rem;
        font-weight: 700;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #cbd5e1;
        cursor: pointer;
        transition: all 0.18s ease;
        flex-shrink: 0;
      }
      .vel-foot-country-pill:hover {
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
        border-color: rgba(255, 255, 255, 0.3);
      }
      .vel-foot-country-pill.is-active {
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
        border-color: #60a5fa;
        color: #fff;
        box-shadow: 0 2px 10px rgba(37, 99, 235, 0.4);
      }
      .vel-foot-country-badge {
        font-size: 0.72rem;
        padding: 0.1rem 0.4rem;
        border-radius: 9999px;
        background: rgba(0, 0, 0, 0.35);
        font-weight: 800;
      }
      .vel-foot-status {
        padding: 0.6rem 0.9rem;
        border-radius: 8px;
        font-size: 0.85rem;
        font-weight: 600;
        display: none;
      }
      .vel-foot-status--success {
        display: block;
        background: rgba(16, 185, 129, 0.15);
        border: 1px solid rgba(16, 185, 129, 0.35);
        color: #6ee7b7;
      }
      .vel-foot-status--error {
        display: block;
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.35);
        color: #fca5a5;
      }
      .vel-foot-cards-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.25rem;
      }
      @media (max-width: 900px) {
        .vel-foot-cards-grid { grid-template-columns: 1fr; }
      }
      .vel-foot-card {
        background: rgba(15, 23, 42, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 1.15rem;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
      }
      .vel-foot-card h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 800;
        color: #f8fafc;
        display: flex;
        align-items: center;
        gap: 0.4rem;
      }
      .vel-foot-card p.desc {
        margin: 0;
        font-size: 0.8rem;
        color: #94a3b8;
      }
      .vel-foot-form-group {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .vel-foot-form-group label {
        font-size: 0.78rem;
        font-weight: 700;
        color: #cbd5e1;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .vel-foot-input, .vel-foot-textarea, .vel-foot-select {
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 8px;
        padding: 0.6rem 0.8rem;
        color: #fff;
        font-size: 0.88rem;
        font-family: inherit;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .vel-foot-input:focus, .vel-foot-textarea:focus, .vel-foot-select:focus {
        border-color: #10b981;
        box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.25);
      }
      .vel-foot-form-actions {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        margin-top: 0.25rem;
        flex-wrap: wrap;
      }
      .vel-foot-pkg-picker-wrap {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .vel-foot-selected-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        min-height: 24px;
      }
      .vel-foot-pkg-tag {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.25rem 0.6rem;
        border-radius: 6px;
        background: rgba(168, 85, 247, 0.2);
        border: 1px solid rgba(168, 85, 247, 0.45);
        color: #e9d5ff;
        font-size: 0.78rem;
        font-weight: 700;
      }
      .vel-foot-pkg-tag-del {
        background: transparent;
        border: none;
        color: #fca5a5;
        cursor: pointer;
        padding: 0 0.15rem;
        font-weight: 900;
        font-size: 0.85rem;
        line-height: 1;
      }
      .vel-foot-pkg-tag-del:hover {
        color: #ef4444;
      }
      .vel-foot-badge-comp {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.2rem 0.55rem;
        border-radius: 6px;
        background: rgba(234, 179, 8, 0.15);
        border: 1px solid rgba(234, 179, 8, 0.4);
        color: #fde047;
        font-size: 0.76rem;
        font-weight: 700;
      }
      .vel-foot-badge-comp--all {
        background: rgba(148, 163, 184, 0.12);
        border-color: rgba(148, 163, 184, 0.25);
        color: #cbd5e1;
      }
      .vel-foot-badge-pkg {
        display: inline-block;
        padding: 0.2rem 0.55rem;
        margin: 0.15rem 0.2rem;
        border-radius: 6px;
        background: rgba(168, 85, 247, 0.15);
        border: 1px solid rgba(168, 85, 247, 0.4);
        color: #e9d5ff;
        font-size: 0.76rem;
        font-weight: 700;
      }
      .vel-foot-alias-badge {
        display: inline-block;
        padding: 0.2rem 0.55rem;
        margin: 0.15rem 0.2rem;
        border-radius: 6px;
        background: rgba(56, 189, 248, 0.12);
        border: 1px solid rgba(56, 189, 248, 0.3);
        color: #7dd3fc;
        font-size: 0.76rem;
        font-weight: 700;
      }
      .vel-foot-alias-badge--highlight {
        background: rgba(16, 185, 129, 0.2);
        border-color: rgba(16, 185, 129, 0.5);
        color: #6ee7b7;
        font-size: 0.82rem;
      }
      .vel-foot-test-box {
        background: rgba(0, 0, 0, 0.35);
        border: 1px dashed rgba(255, 255, 255, 0.18);
        border-radius: 10px;
        padding: 0.9rem;
        min-height: 90px;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }
      .vel-foot-test-hint {
        font-size: 0.8rem;
        color: #64748b;
        font-style: italic;
        text-align: center;
      }
      .vel-foot-test-header {
        font-size: 0.85rem;
        color: #f1f5f9;
        margin-bottom: 0.4rem;
      }
      .vel-foot-test-subtext {
        font-size: 0.78rem;
        color: #94a3b8;
      }
      .vel-foot-table-wrap {
        background: rgba(15, 23, 42, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 1.15rem;
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
      }
      .vel-foot-table-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.75rem;
      }
      .vel-foot-search-input {
        width: 260px;
        max-width: 100%;
      }
      .vel-foot-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
      }
      .vel-foot-table th {
        text-align: left;
        padding: 0.65rem 0.85rem;
        background: rgba(0, 0, 0, 0.35);
        color: #94a3b8;
        font-size: 0.74rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      .vel-foot-table td {
        padding: 0.75rem 0.85rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        vertical-align: middle;
      }
      .vel-foot-table tr:hover td {
        background: rgba(255, 255, 255, 0.03);
      }
      .vel-foot-cell-key {
        color: #38bdf8;
        font-weight: 800;
        font-size: 0.92rem;
      }
      .vel-foot-cell-actions {
        text-align: right;
        white-space: nowrap;
      }
      .vel-foot-btn-action {
        padding: 0.4rem 0.75rem;
        border-radius: 6px;
        font-size: 0.78rem;
        font-weight: 700;
        cursor: pointer;
        border: 1px solid transparent;
        margin-left: 0.35rem;
        transition: all 0.15s ease;
      }
      .vel-foot-btn-edit {
        background: rgba(59, 130, 246, 0.2);
        color: #93c5fd;
        border-color: rgba(59, 130, 246, 0.45);
      }
      .vel-foot-btn-edit:hover {
        background: #2563eb;
        color: #fff;
      }
      .vel-foot-btn-delete {
        background: rgba(239, 68, 68, 0.2);
        color: #fca5a5;
        border-color: rgba(239, 68, 68, 0.45);
      }
      .vel-foot-btn-delete:hover {
        background: #dc2626;
        color: #fff;
      }
      .vel-foot-empty {
        text-align: center;
        padding: 2.2rem !important;
        color: #64748b;
        font-style: italic;
      }
      .vel-foot-empty-action {
        margin-top: 0.75rem;
        display: flex;
        justify-content: center;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .vel-foot-json-dialog {
        background: #0f172a;
        color: #f1f5f9;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        padding: 1.5rem;
        width: 700px;
        max-width: 92vw;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
      }
      .vel-foot-json-dialog::backdrop {
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(4px);
      }
      .vel-foot-json-tabs {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 0.85rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 0.5rem;
      }
      .vel-foot-json-tab-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 0.82rem;
        font-weight: 700;
        padding: 0.35rem 0.75rem;
        border-radius: 6px;
        cursor: pointer;
      }
      .vel-foot-json-tab-btn.is-active {
        background: rgba(59, 130, 246, 0.2);
        color: #60a5fa;
      }
    `;
    document.head.appendChild(style);
  }

  function getLocalStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return normalizeStore(parsed);
      }
    } catch (_) {}
    return null;
  }

  function saveLocalStore(storeObj) {
    try {
      var norm = normalizeStore(storeObj);
      state.store = norm;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(norm));
      window.__veloraFootballMappingsCache = norm;
      document.dispatchEvent(new CustomEvent("velora-football-mappings-changed", { detail: { mappings: norm } }));
    } catch (_) {}
  }

  async function syncFromDatabase() {
    try {
      var t = localStorage.getItem("authToken");
      var headers = { "apikey": KEY };
      if (t) headers.Authorization = "Bearer " + t;
      var res = await fetch(SURL + "/rest/v1/admin_settings?key=eq." + encodeURIComponent(SETTING_DB_KEY), {
        headers: headers
      });
      if (res.ok) {
        var rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0 && rows[0].value) {
          var val = rows[0].value;
          var parsed = typeof val === "string" ? JSON.parse(val) : val;
          if (parsed && typeof parsed === "object") {
            var norm = normalizeStore(parsed);
            saveLocalStore(norm);
            return norm;
          }
        }
      }
    } catch (e) {
      console.warn("[Velora Football Admin] Sync DB failed, using local cache:", e.message);
    }
    var local = getLocalStore();
    if (local) {
      state.store = local;
      return local;
    }
    var initNorm = normalizeStore(null);
    state.store = initNorm;
    return initNorm;
  }

  async function persistToDatabase(storeObj) {
    var norm = normalizeStore(storeObj);
    saveLocalStore(norm);
    try {
      var t = localStorage.getItem("authToken");
      var headers = { "Content-Type": "application/json", "apikey": KEY };
      if (t) headers.Authorization = "Bearer " + t;

      await fetch(SURL + "/rest/v1/admin_settings", {
        method: "POST",
        headers: Object.assign({}, headers, { "Prefer": "resolution=merge-duplicates" }),
        body: JSON.stringify({
          key: SETTING_DB_KEY,
          value: JSON.stringify(norm)
        })
      });
    } catch (err) {
      console.warn("[Velora Football Admin] DB persist warning:", err.message);
    }
  }

  function detectCurrentAppCountry() {
    try {
      if (typeof window.veloraGetActiveCountryId === "function") {
        var acid = window.veloraGetActiveCountryId();
        if (acid) return countrySlug(acid);
      }
      var savedId = localStorage.getItem("lumina_selected_country_id") || sessionStorage.getItem("lumina_selected_country_id");
      if (savedId) return countrySlug(savedId);
      var savedName = localStorage.getItem("velora_selected_country_name_v1") || sessionStorage.getItem("velora_selected_country_name_v1");
      if (savedName) return countrySlug(savedName);
    } catch (_) {}
    return "france";
  }

  function renderPackagesDatalist() {
    var dl = getEl("foot-packages-datalist");
    if (!dl) return;

    var packages = state.allLivePackages || [];
    var names = new Set();
    packages.forEach(function (pkg) {
      if (pkg && pkg.name && pkg.name.trim()) {
        names.add(pkg.name.trim());
      }
    });

    // Also include packages from current state.store
    Object.keys(state.store).forEach(function (c) {
      var rules = state.store[c] || [];
      rules.forEach(function (r) {
        (r.packages || []).forEach(function (p) {
          if (p && p.trim()) names.add(p.trim());
        });
      });
    });

    var sorted = Array.from(names).sort(function (a, b) { return a.localeCompare(b, "fr"); });
    dl.innerHTML = sorted.map(function (name) {
      return '<option value="' + esc(name) + '">' + esc(name) + '</option>';
    }).join("");
  }

  function addPackageTag(pkgName) {
    var input = getEl("foot-map-pkg-input");
    var val = (pkgName || (input ? input.value : "")).trim();
    if (!val) return;

    if (!state.selectedFormPackages.includes(val)) {
      state.selectedFormPackages.push(val);
      renderSelectedPackagesTags();
    }
    if (input) input.value = "";
    if (input) input.focus();
  }

  function removePackageTag(pkgName) {
    state.selectedFormPackages = state.selectedFormPackages.filter(function (p) {
      return p !== pkgName;
    });
    renderSelectedPackagesTags();
  }

  function renderSelectedPackagesTags() {
    var container = getEl("foot-map-selected-packages");
    if (!container) return;

    if (state.selectedFormPackages.length === 0) {
      container.innerHTML = '<span style="font-size:0.78rem; color:#64748b; font-style:italic;">Aucun package sélectionné.</span>';
      return;
    }

    container.innerHTML = state.selectedFormPackages.map(function (pkg) {
      return '<span class="vel-foot-pkg-tag">' +
        '<span>📦 ' + esc(pkg) + '</span>' +
        '<button type="button" class="vel-foot-pkg-tag-del" data-pkg="' + esc(pkg) + '" onclick="window.veloraFootballAdmin.removePackageTag(this.getAttribute(\'data-pkg\'))" title="Retirer ce package">×</button>' +
      '</span>';
    }).join(" ");
  }

  function renderCountrySelector() {
    var pillsContainer = getEl("foot-country-pills");
    var formSelect = getEl("foot-form-country-select");
    var testCountrySelect = getEl("foot-test-country-select");

    var countriesMap = new Map();

    // 1. Toujours ajouter _default (Tous les pays) en premier
    countriesMap.set("_default", {
      id: "_default",
      name: "Tous les pays (Par défaut)",
      flag: "🌐",
      code: ""
    });

    // 2. Ajouter les pays visibles dynamiquement depuis l'onglet Pays
    (state.visibleCountriesList || []).forEach(function (vc) {
      countriesMap.set(vc.id, {
        id: vc.id,
        name: vc.name,
        flag: vc.flag,
        code: vc.code
      });
    });

    // 3. Inclure tout autre pays ayant des règles déjà configurées dans state.store
    Object.keys(state.store).forEach(function (k) {
      if (!countriesMap.has(k)) {
        var meta = getCountryMeta(k);
        countriesMap.set(k, meta);
      }
    });

    var sortedList = Array.from(countriesMap.values()).sort(function (a, b) {
      if (a.id === "_default") return -1;
      if (b.id === "_default") return 1;
      if (a.id === "france") return -1;
      if (b.id === "france") return 1;
      return a.name.localeCompare(b.name, "fr");
    });

    if (!countriesMap.has(state.selectedCountry)) {
      state.selectedCountry = countriesMap.has("france") ? "france" : (sortedList[1] ? sortedList[1].id : "_default");
    }

    var activeMeta = getCountryMeta(state.selectedCountry);

    // 1. Rendu des pilules
    if (pillsContainer) {
      pillsContainer.innerHTML = sortedList.map(function (c) {
        var rulesList = state.store[c.id] || [];
        var count = rulesList.length;
        var isActive = state.selectedCountry === c.id;

        return '<button type="button" class="vel-foot-country-pill ' + (isActive ? "is-active" : "") + '" data-country-id="' + esc(c.id) + '">' +
          '<span>' + c.flag + '</span> ' +
          '<span>' + esc(c.name) + '</span> ' +
          '<span class="vel-foot-country-badge">' + count + '</span>' +
        '</button>';
      }).join("");
    }

    // 2. Menu déroulant formulaire
    if (formSelect) {
      formSelect.innerHTML = sortedList.map(function (c) {
        return '<option value="' + esc(c.id) + '" ' + (c.id === state.selectedCountry ? "selected" : "") + '>' + c.flag + " " + esc(c.name) + '</option>';
      }).join("");
    }

    // 3. Sélecteur testeur
    if (testCountrySelect) {
      testCountrySelect.innerHTML = sortedList.map(function (c) {
        return '<option value="' + esc(c.id) + '" ' + (c.id === state.selectedCountry ? "selected" : "") + '>' + c.flag + " " + esc(c.name) + '</option>';
      }).join("");
    }

    // 4. Bouton submit
    var btnSubmit = getEl("foot-map-submit-btn");
    if (btnSubmit) {
      btnSubmit.textContent = state.isEditing
        ? "💾 Mettre à jour (" + activeMeta.name + ")"
        : "➕ Ajouter la règle (" + activeMeta.name + ")";
    }

    renderPackagesDatalist();
  }

  function renderMappingsTable() {
    var tbody = getEl("foot-mappings-tbody");
    var countEl = getEl("foot-mappings-count");
    if (!tbody) return;

    var currentRules = getCountryMappings(state.selectedCountry);
    var filterQuery = (getEl("foot-mappings-search") ? getEl("foot-mappings-search").value : "").trim().toLowerCase();
    var rules = currentRules.slice().sort(function (a, b) {
      if (a.channel !== b.channel) return a.channel.localeCompare(b.channel, "fr");
      return (a.competition || "").localeCompare(b.competition || "", "fr");
    });

    if (filterQuery) {
      rules = rules.filter(function (r) {
        var pkgs = (r.packages || []).join(" ");
        var aliases = (r.aliases || []).join(" ");
        var comp = r.competition === "_all" ? "toutes" : (r.competition || "");
        var full = (r.channel + " " + comp + " " + pkgs + " " + aliases).toLowerCase();
        return full.includes(filterQuery);
      });
    }

    var activeMeta = getCountryMeta(state.selectedCountry);

    if (countEl) {
      var total = currentRules.length;
      countEl.textContent = total + (total > 1 ? " règles configurées pour " : " règle configurée pour ") + activeMeta.name;
    }

    if (rules.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="vel-foot-empty">' +
        '<div>Aucune règle pour <strong>' + esc(activeMeta.name) + '</strong>. ' + (state.selectedCountry !== "_default" ? '(Les règles générales par défaut seront appliquées en repli si définies).' : '') + '</div>' +
        '<div class="vel-foot-empty-action"><button type="button" class="vel-foot-btn vel-foot-btn-secondary vel-foot-btn-sm" onclick="window.veloraFootballAdmin.copyFromCountry(\'_default\')">📋 Copier depuis Par Défaut</button></div>' +
      '</td></tr>';
      return;
    }

    tbody.innerHTML = rules.map(function (r) {
      var isAllComp = !r.competition || r.competition === "_all";
      var compBadgeHtml = isAllComp
        ? '<span class="vel-foot-badge-comp vel-foot-badge-comp--all">🌐 Toutes</span>'
        : '<span class="vel-foot-badge-comp">🏆 ' + esc(r.competition) + '</span>';

      var pkgsHtml = (r.packages && r.packages.length > 0)
        ? r.packages.map(function (pkg) { return '<span class="vel-foot-badge-pkg">📦 ' + esc(pkg) + '</span>'; }).join(" ")
        : '<span style="color:#64748b; font-style:italic; font-size:0.76rem;">—</span>';

      var aliasesHtml = (r.aliases && r.aliases.length > 0)
        ? r.aliases.map(function (al) { return '<span class="vel-foot-alias-badge">' + esc(al) + '</span>'; }).join(" ")
        : '<span style="color:#64748b; font-style:italic; font-size:0.76rem;">—</span>';

      var rIdEsc = esc(r.id);
      return '<tr data-rule-id="' + rIdEsc + '">' +
        '<td class="vel-foot-cell-key"><strong>' + esc(r.channel) + '</strong></td>' +
        '<td>' + compBadgeHtml + '</td>' +
        '<td>' + pkgsHtml + '</td>' +
        '<td>' + aliasesHtml + '</td>' +
        '<td class="vel-foot-cell-actions">' +
          '<button type="button" class="vel-foot-btn-action vel-foot-btn-edit" data-action="edit-rule" data-id="' + rIdEsc + '" onclick="window.veloraFootballAdmin.editRule(this.getAttribute(\'data-id\'))" title="Modifier cette règle">✏️ Modifier</button>' +
          '<button type="button" class="vel-foot-btn-action vel-foot-btn-delete" data-action="delete-rule" data-id="' + rIdEsc + '" onclick="window.veloraFootballAdmin.deleteRule(this.getAttribute(\'data-id\'))" title="Supprimer cette règle">🗑️ Supprimer</button>' +
        '</td>' +
      '</tr>';
    }).join("");
  }

  function selectCountry(countryId) {
    var cid = countrySlug(countryId);
    state.selectedCountry = cid;
    resetForm();
    renderCountrySelector();
    renderMappingsTable();
    var testInput = getEl("foot-test-input");
    if (testInput && testInput.value) {
      runLiveTest();
    }
  }

  function showFootballTab() {
    try {
      document.querySelectorAll('#settings-tabs [role="tab"], .settings-tabs [role="tab"], .settings-tabs__tab').forEach(function (tab) {
        var active = (tab.dataset && tab.dataset.settingsTab === "football") || tab.id === "settings-tab-btn-football";
        tab.classList.toggle("settings-tabs__tab--active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
        tab.tabIndex = active ? 0 : -1;
      });

      document.querySelectorAll(".settings-tab-panel").forEach(function (p) {
        var active = (p.dataset && p.dataset.settingsTab === "football") || p.id === "settings-tab-football";
        p.classList.toggle("hidden", !active);
        p.hidden = !active;
        if (active) {
          p.removeAttribute("hidden");
          p.classList.remove("hidden");
        }
      });

      var panel = document.getElementById("settings-tab-football");
      if (panel) {
        panel.classList.remove("hidden");
        panel.hidden = false;
        panel.removeAttribute("hidden");
      }

      loadAndRenderMappings();
    } catch (err) {
      console.error("[Velora Football Admin] Error showing football tab:", err);
    }
  }
  window.veloraShowFootballTab = showFootballTab;

  async function loadAndRenderMappings() {
    await Promise.all([
      syncFromDatabase(),
      fetchVisibleCountries(false),
      fetchLivePackages()
    ]);
    if (!state.selectedCountry) {
      state.selectedCountry = detectCurrentAppCountry();
    }
    renderCountrySelector();
    renderMappingsTable();
    renderSelectedPackagesTags();
  }

  function resetForm() {
    state.isEditing = false;
    state.editingRuleId = "";
    state.selectedFormPackages = [];

    var inputKey = getEl("foot-map-key");
    var inputComp = getEl("foot-map-competition");
    var inputAliases = getEl("foot-map-aliases");
    var inputPkg = getEl("foot-map-pkg-input");
    var btnSubmit = getEl("foot-map-submit-btn");
    var activeMeta = getCountryMeta(state.selectedCountry);

    if (inputKey) { inputKey.value = ""; inputKey.disabled = false; }
    if (inputComp) inputComp.value = "";
    if (inputAliases) inputAliases.value = "";
    if (inputPkg) inputPkg.value = "";
    if (btnSubmit) btnSubmit.textContent = "➕ Ajouter la règle (" + activeMeta.name + ")";
    renderSelectedPackagesTags();
    setStatus("");
  }

  function editRule(ruleId) {
    if (!ruleId) return;
    var currentRules = getCountryMappings(state.selectedCountry);
    var rule = currentRules.find(function (r) { return r.id === ruleId; });
    if (!rule) {
      rule = currentRules.find(function (r) { return r.channel.toLowerCase() === String(ruleId).toLowerCase(); });
    }
    if (!rule) return;

    state.isEditing = true;
    state.editingRuleId = rule.id;
    state.selectedFormPackages = Array.isArray(rule.packages) ? rule.packages.slice() : [];

    var inputKey = getEl("foot-map-key");
    var inputComp = getEl("foot-map-competition");
    var inputAliases = getEl("foot-map-aliases");
    var btnSubmit = getEl("foot-map-submit-btn");

    if (inputKey) inputKey.value = rule.channel;
    if (inputComp) inputComp.value = (!rule.competition || rule.competition === "_all") ? "" : rule.competition;
    if (inputAliases) inputAliases.value = Array.isArray(rule.aliases) ? rule.aliases.join(", ") : String(rule.aliases || "");
    renderSelectedPackagesTags();

    if (btnSubmit) {
      btnSubmit.textContent = "💾 Mettre à jour (" + getCountryMeta(state.selectedCountry).name + ")";
    }

    var formEl = getEl("foot-map-form");
    if (formEl) formEl.scrollIntoView({ behavior: "smooth", block: "center" });
    if (inputKey) inputKey.focus();
    setStatus("✏️ Modification de la règle « " + rule.channel + " »...");
  }

  async function deleteRule(ruleId) {
    if (!ruleId) return;
    var currentRules = getCountryMappings(state.selectedCountry);
    var targetIdx = currentRules.findIndex(function (r) { return r.id === ruleId; });
    if (targetIdx < 0) {
      targetIdx = currentRules.findIndex(function (r) { return r.channel.toLowerCase() === String(ruleId).toLowerCase(); });
    }
    if (targetIdx < 0) return;

    var deleted = currentRules.splice(targetIdx, 1)[0];
    state.store[state.selectedCountry] = currentRules;

    await persistToDatabase(state.store);
    renderCountrySelector();
    renderMappingsTable();
    if (state.isEditing && state.editingRuleId === ruleId) resetForm();

    var activeMeta = getCountryMeta(state.selectedCountry);
    setStatus("🗑️ Règle pour « " + deleted.channel + " » supprimée de " + activeMeta.name + ".");
  }

  async function handleFormSubmit(e) {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();

    var inputKey = getEl("foot-map-key");
    var inputComp = getEl("foot-map-competition");
    var inputAliases = getEl("foot-map-aliases");
    if (!inputKey) return;

    var channel = inputKey.value.trim();
    var rawComp = inputComp ? inputComp.value.trim() : "";
    var competition = (!rawComp || rawComp === "_all" || rawComp.toLowerCase() === "toutes les compétitions (par défaut)") ? "_all" : rawComp;

    var aliasesStr = inputAliases ? inputAliases.value.trim() : "";
    var aliasesList = aliasesStr ? aliasesStr.split(/[,\n]+/).map(function (s) { return s.trim(); }).filter(Boolean) : [];
    var packagesList = state.selectedFormPackages.slice();

    if (!channel) {
      setStatus("Veuillez entrer le nom de la chaîne du match (ex: Canal+ ou beIN Sports 1).", true);
      inputKey.focus();
      return;
    }

    if (packagesList.length === 0 && aliasesList.length === 0) {
      setStatus("Veuillez spécifier au moins un package prioritaire OU des mots-clés de recherche.", true);
      if (inputAliases) inputAliases.focus();
      return;
    }

    var currentRules = getCountryMappings(state.selectedCountry);

    if (state.isEditing && state.editingRuleId) {
      var editIdx = currentRules.findIndex(function (r) { return r.id === state.editingRuleId; });
      if (editIdx >= 0) {
        currentRules[editIdx] = {
          id: state.editingRuleId,
          channel: channel,
          competition: competition,
          packages: packagesList,
          aliases: aliasesList
        };
      } else {
        currentRules.push({
          id: state.editingRuleId,
          channel: channel,
          competition: competition,
          packages: packagesList,
          aliases: aliasesList
        });
      }
    } else {
      var normComp = competition.toLowerCase();
      var normChan = channel.toLowerCase();
      var existingIdx = currentRules.findIndex(function (r) {
        return r.channel.toLowerCase() === normChan && (r.competition || "_all").toLowerCase() === normComp;
      });

      if (existingIdx >= 0) {
        currentRules[existingIdx].packages = packagesList;
        currentRules[existingIdx].aliases = aliasesList;
      } else {
        currentRules.push({
          id: "r_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
          channel: channel,
          competition: competition,
          packages: packagesList,
          aliases: aliasesList
        });
      }
    }

    state.store[state.selectedCountry] = currentRules;
    await persistToDatabase(state.store);
    renderCountrySelector();
    renderMappingsTable();
    resetForm();

    var activeMeta = getCountryMeta(state.selectedCountry);
    var compLabel = competition === "_all" ? "Toutes compétitions" : competition;
    setStatus("✨ Règle enregistrée pour « " + channel + " » [" + compLabel + "] dans " + activeMeta.name + " (" + packagesList.length + " package(s), " + aliasesList.length + " alias).");
  }

  async function clearCountryRules() {
    var activeMeta = getCountryMeta(state.selectedCountry);
    if (!confirm("Voulez-vous vraiment supprimer TOUTES les règles pour " + activeMeta.name + " ?")) {
      return;
    }
    state.store[state.selectedCountry] = [];
    await persistToDatabase(state.store);
    renderCountrySelector();
    renderMappingsTable();
    resetForm();
    setStatus("🗑️ Toutes les règles ont été supprimées pour " + activeMeta.name + ".");
  }

  async function copyFromCountry(sourceCountryId) {
    var sourceId = sourceCountryId;
    if (!sourceId) {
      var sourceList = Object.keys(state.store).filter(function (c) {
        return c !== state.selectedCountry && (state.store[c] || []).length > 0;
      });
      if (sourceList.length === 0) {
        alert("Aucun autre pays n'a de règles configurées pour le moment.");
        return;
      }
      var promptMsg = "Entrez l'identifiant du pays source à copier vers " + getCountryMeta(state.selectedCountry).name + " :\n\nDisponibles : " + sourceList.join(", ");
      var chosen = prompt(promptMsg, sourceList[0]);
      if (!chosen) return;
      sourceId = countrySlug(chosen);
    }

    var sourceRules = state.store[sourceId] || [];
    if (sourceRules.length === 0) {
      alert("Aucune règle trouvée dans le pays source " + sourceId);
      return;
    }

    var currentRules = getCountryMappings(state.selectedCountry);
    var existingKeys = new Set(currentRules.map(function (r) { return (r.channel + "__" + (r.competition || "_all")).toLowerCase(); }));

    sourceRules.forEach(function (sr) {
      var k = (sr.channel + "__" + (sr.competition || "_all")).toLowerCase();
      if (!existingKeys.has(k)) {
        currentRules.push(Object.assign({}, sr, { id: "r_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6) }));
        existingKeys.add(k);
      }
    });

    state.store[state.selectedCountry] = currentRules;
    await persistToDatabase(state.store);
    renderCountrySelector();
    renderMappingsTable();
    setStatus("📋 Règles copiées depuis " + getCountryMeta(sourceId).name + " vers " + getCountryMeta(state.selectedCountry).name + ".");
  }

  function runLiveTest(channelQuery, compQuery, countryQuery) {
    var resBox = getEl("foot-test-results");
    if (!resBox) return;

    var q = (channelQuery || (getEl("foot-test-input") ? getEl("foot-test-input").value : "")).trim();
    var compQ = (compQuery !== undefined ? compQuery : (getEl("foot-test-comp") ? getEl("foot-test-comp").value : "")).trim();
    var testCid = countrySlug(countryQuery || (getEl("foot-test-country-select") ? getEl("foot-test-country-select").value : state.selectedCountry));

    if (!q) {
      resBox.innerHTML = '<span class="vel-foot-test-hint">Entrez le nom d\'un diffuseur pour tester le résultat.</span>';
      return;
    }

    var countryRules = state.store[testCid] || [];
    var defaultRules = state.store._default || [];

    var normQ = normalizeChannelText(q);

    function matchInRules(rules) {
      if (!Array.isArray(rules)) return null;
      var exactCompMatch = null;
      var allCompMatch = null;

      for (var i = 0; i < rules.length; i++) {
        var r = rules[i];
        var rChan = normalizeChannelText(r.channel || "");
        var rComp = r.competition || "_all";

        var chanMatches = rChan === normQ || (normQ && (normQ.includes(rChan) || rChan.includes(normQ)));
        if (chanMatches) {
          if (compQ && rComp !== "_all" && isCompetitionMatch(rComp, compQ)) {
            return { rule: r, type: "comp_exact" };
          }
          if (rComp === "_all" && !allCompMatch) {
            allCompMatch = { rule: r, type: "comp_all" };
          }
        }
      }
      return exactCompMatch || allCompMatch;
    }

    var matchRes = matchInRules(countryRules);
    var matchedFromCountry = testCid;

    if (!matchRes && testCid !== "_default") {
      matchRes = matchInRules(defaultRules);
      matchedFromCountry = "_default";
    }

    var targetMeta = getCountryMeta(testCid);

    if (matchRes && matchRes.rule) {
      var r = matchRes.rule;
      var pkgs = r.packages || [];
      var aliases = r.aliases || [];

      var compLabel = (!r.competition || r.competition === "_all") ? "Toutes compétitions" : r.competition;
      var sourceLabel = matchedFromCountry === testCid
        ? 'Règle spécifique ' + targetMeta.flag + ' ' + targetMeta.name
        : 'Règle de repli 🌐 Par défaut';

      var pkgsHtml = pkgs.map(function (p) {
        return '<span class="vel-foot-badge-pkg">📦 ' + esc(p) + '</span>';
      }).join(" ");

      var aliasesHtml = aliases.map(function (a) {
        return '<span class="vel-foot-alias-badge vel-foot-alias-badge--highlight">' + esc(a) + '</span>';
      }).join(" ");

      var actionText = "";
      if (pkgs.length > 0 && aliases.length > 0) {
        actionText = "➡️ <strong>Priorité Packages :</strong> Au clic sur le match, le tiroir affichera toutes les chaînes des packages <code>" + esc(pkgs.join(", ")) + "</code>, et démarrera directement la chaîne <code>" + esc(aliases[0]) + "</code>.";
      } else if (pkgs.length > 0) {
        actionText = "➡️ <strong>Mode Packages :</strong> Au clic sur le match, le tiroir TV affichera directement l'intégralité des chaînes des packages <code>" + esc(pkgs.join(", ")) + "</code>.";
      } else {
        actionText = "➡️ <strong>Mode Recherche :</strong> Le système recherchera les chaînes cibles : <code>" + esc(aliases.join(", ")) + "</code>.";
      }

      resBox.innerHTML = '<div class="vel-foot-test-match-found">' +
        '<div class="vel-foot-test-header">✅ Règle appliquée pour <strong>« ' + esc(r.channel) + ' »</strong> [' + esc(compLabel) + '] <small style="color:#94a3b8;">(' + sourceLabel + ')</small> :</div>' +
        (pkgs.length > 0 ? '<div style="margin: 0.3rem 0;"><strong>Packages :</strong> ' + pkgsHtml + '</div>' : '') +
        (aliases.length > 0 ? '<div style="margin: 0.3rem 0;"><strong>Mots-clés :</strong> ' + aliasesHtml + '</div>' : '') +
        '<div class="vel-foot-test-subtext" style="margin-top: 0.4rem;">' + actionText + '</div>' +
      '</div>';
    } else {
      resBox.innerHTML = '<div class="vel-foot-test-no-match">' +
        '<div class="vel-foot-test-header">ℹ️ Aucune règle configurée pour <strong>« ' + esc(q) + ' »</strong> ' + (compQ ? 'en [' + esc(compQ) + '] ' : '') + 'dans ' + targetMeta.name + '.</div>' +
        '<div class="vel-foot-test-subtext">➡️ Recherche standard par nom direct : <code>' + esc(q) + '</code>.</div>' +
        '<button type="button" class="vel-foot-btn-action" style="margin-top:0.4rem;" onclick="window.veloraFootballAdmin &amp;&amp; window.veloraFootballAdmin.quickCreateMapping(\'' + esc(q).replace(/'/g, "\\'") + '\', \'' + esc(compQ).replace(/'/g, "\\'") + '\')">➕ Créer une règle pour « ' + esc(q) + ' » dans ' + targetMeta.name + '</button>' +
      '</div>';
    }
  }

  function quickCreateMapping(channelName, competition) {
    if (!channelName) return;
    resetForm();
    var inputKey = getEl("foot-map-key");
    var inputComp = getEl("foot-map-competition");
    var inputAliases = getEl("foot-map-aliases");
    if (inputKey) inputKey.value = channelName;
    if (inputComp && competition) inputComp.value = competition;
    if (inputAliases) inputAliases.value = channelName + " 1, " + channelName + " 2";
    var formEl = getEl("foot-map-form");
    if (formEl) formEl.scrollIntoView({ behavior: "smooth", block: "center" });
    if (inputAliases) inputAliases.focus();
  }

  var jsonDialogMode = "country";

  function openJsonEditor(mode) {
    var dialog = getEl("foot-json-dialog");
    var textarea = getEl("foot-json-textarea");
    if (!dialog || !textarea) return;

    jsonDialogMode = mode || "country";

    var tabCountryBtn = getEl("foot-json-tab-country");
    var tabAllBtn = getEl("foot-json-tab-all");
    if (tabCountryBtn && tabAllBtn) {
      tabCountryBtn.classList.toggle("is-active", jsonDialogMode === "country");
      tabAllBtn.classList.toggle("is-active", jsonDialogMode === "all");
      var activeMeta = getCountryMeta(state.selectedCountry);
      tabCountryBtn.textContent = activeMeta.flag + " " + activeMeta.name;
    }

    if (jsonDialogMode === "country") {
      textarea.value = JSON.stringify(getCountryMappings(state.selectedCountry), null, 2);
    } else {
      textarea.value = JSON.stringify(state.store, null, 2);
    }

    dialog.showModal();
  }

  async function saveJsonEditor() {
    var dialog = getEl("foot-json-dialog");
    var textarea = getEl("foot-json-textarea");
    if (!textarea) return;
    try {
      var parsed = JSON.parse(textarea.value);
      if (!parsed || typeof parsed !== "object") {
        throw new Error('Format JSON invalide');
      }

      if (jsonDialogMode === "country") {
        state.store[state.selectedCountry] = normalizeCountryRules(parsed);
      } else {
        state.store = normalizeStore(parsed);
      }

      await persistToDatabase(state.store);
      renderCountrySelector();
      renderMappingsTable();
      if (dialog) dialog.close();
      setStatus("✨ Configuration JSON enregistrée avec succès.");
    } catch (err) {
      alert("Erreur JSON: " + err.message);
    }
  }

  // API globale
  window.veloraFootballAdmin = {
    showFootballTab: showFootballTab,
    selectCountry: selectCountry,
    copyFromCountry: copyFromCountry,
    editRule: editRule,
    deleteRule: deleteRule,
    editMapping: editRule,
    deleteMapping: deleteRule,
    resetForm: resetForm,
    handleSubmit: handleFormSubmit,
    addPackageTag: addPackageTag,
    removePackageTag: removePackageTag,
    clearCountryRules: clearCountryRules,
    quickCreateMapping: quickCreateMapping,
    openJsonEditor: openJsonEditor,
    saveJsonEditor: saveJsonEditor,
    runLiveTest: runLiveTest,
    getStore: function () { return state.store; },
    getMappings: function (countryId) {
      if (!countryId) return state.store;
      var cid = countrySlug(countryId);
      return state.store[cid] || state.store._default || [];
    }
  };

  // Écoute de l'événement de modification de la visibilité des pays dans l'onglet Pays
  window.addEventListener("velora-country-visibility-changed", async function () {
    await fetchVisibleCountries(true);
    renderCountrySelector();
    renderMappingsTable();
  });

  // Écouteurs globaux
  document.addEventListener("click", function (e) {
    if (!e || !e.target) return;

    // Intercepter UNIQUEMENT le bouton d'onglet dans l'en-tête (et JAMAIS à l'intérieur du panneau football)
    var isTabBtn = e.target.closest('#settings-tab-btn-football, #settings-tabs [role="tab"][data-settings-tab="football"], #settings-tabs button[data-settings-tab="football"]');
    if (isTabBtn && !e.target.closest('#settings-tab-football')) {
      showFootballTab();
      return;
    }

    // Pilules de pays
    var countryPill = e.target.closest(".vel-foot-country-pill");
    if (countryPill && countryPill.dataset.countryId) {
      e.preventDefault();
      selectCountry(countryPill.dataset.countryId);
      return;
    }

    // Actions d'en-tête
    if (e.target.closest("#foot-btn-copy-rules")) {
      e.preventDefault();
      copyFromCountry();
      return;
    }
    if (e.target.closest("#foot-btn-load-defaults")) {
      e.preventDefault();
      loadRecommendedDefaults();
      return;
    }
    if (e.target.closest("#foot-btn-open-json")) {
      e.preventDefault();
      openJsonEditor("country");
      return;
    }
    if (e.target.closest("#foot-json-tab-country")) {
      e.preventDefault();
      openJsonEditor("country");
      return;
    }
    if (e.target.closest("#foot-json-tab-all")) {
      e.preventDefault();
      openJsonEditor("all");
      return;
    }
    if (e.target.closest("#foot-json-close") || e.target.closest("#foot-json-cancel")) {
      e.preventDefault();
      var d = getEl("foot-json-dialog");
      if (d) d.close();
      return;
    }
    if (e.target.closest("#foot-json-save")) {
      e.preventDefault();
      saveJsonEditor();
      return;
    }
    if (e.target.closest("#foot-map-reset-btn")) {
      e.preventDefault();
      resetForm();
      return;
    }
    if (e.target.closest("#foot-map-submit-btn")) {
      e.preventDefault();
      handleFormSubmit(e);
      return;
    }

    // Modifier une règle
    var editBtn = e.target.closest('[data-action="edit-rule"], [data-action="edit-mapping"], .vel-foot-btn-edit');
    if (editBtn) {
      e.preventDefault();
      var editId = editBtn.getAttribute("data-id") || editBtn.getAttribute("data-key") || editBtn.dataset.id || editBtn.dataset.key;
      editRule(editId);
      return;
    }

    // Supprimer une règle
    var delBtn = e.target.closest('[data-action="delete-rule"], [data-action="delete-mapping"], .vel-foot-btn-delete');
    if (delBtn) {
      e.preventDefault();
      var delId = delBtn.getAttribute("data-id") || delBtn.getAttribute("data-key") || delBtn.dataset.id || delBtn.dataset.key;
      deleteRule(delId);
      return;
    }
  });

  document.addEventListener("input", function (e) {
    if (e.target && e.target.id === "foot-mappings-search") {
      renderMappingsTable();
    }
    if (e.target && (e.target.id === "foot-test-input" || e.target.id === "foot-test-comp")) {
      clearTimeout(window.__veloraFootTestTimer);
      window.__veloraFootTestTimer = setTimeout(function () { runLiveTest(); }, 200);
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.target && e.target.id === "foot-map-pkg-input" && e.key === "Enter") {
      e.preventDefault();
      addPackageTag();
    }
  });

  document.addEventListener("change", function (e) {
    if (e.target && e.target.id === "foot-form-country-select") {
      selectCountry(e.target.value);
      return;
    }
    if (e.target && e.target.id === "foot-test-country-select") {
      runLiveTest();
    }
  });

  document.addEventListener("submit", function (e) {
    if (e.target && e.target.id === "foot-map-form") {
      handleFormSubmit(e);
    }
  });

  injectStyles();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      loadAndRenderMappings();
    }, { once: true });
  } else {
    loadAndRenderMappings();
  }
})();
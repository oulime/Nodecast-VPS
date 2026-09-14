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

  // Règles recommandées par défaut par pays / région
  var DEFAULT_RECOMMENDED_BY_COUNTRY = {
    "_default": {
      "Canal+": ["Canal+ Sport", "Canal+ Foot", "Canal+ Sport 360", "Canal+ Live"],
      "Canal Plus": ["Canal+ Sport", "Canal+ Foot", "Canal+ Sport 360", "Canal+ Live"],
      "beIN Sports": ["beIN Sports 1", "beIN Sports 2", "beIN Sports 3", "beIN Sports Max"],
      "DAZN": ["DAZN 1", "DAZN 2"],
      "Sky Sports": ["Sky Sports Main Event", "Sky Sports Premier League", "Sky Sports Football"],
      "TNT Sports": ["TNT Sports 1", "TNT Sports 2", "TNT Sports 3", "TNT Sports 4"],
      "Movistar": ["Movistar LaLiga", "Movistar Liga de Campeones"],
      "TF1": ["TF1", "TF1 HD"],
      "M6": ["M6", "M6 HD"]
    },
    "france": {
      "Canal+": ["Canal+ Sport", "Canal+ Foot", "Canal+ Sport 360", "Canal+ Live"],
      "Canal Plus": ["Canal+ Sport", "Canal+ Foot", "Canal+ Sport 360", "Canal+ Live"],
      "Canal+ Sport": ["Canal+ Sport", "Canal+ Foot", "Canal+ Sport 360"],
      "Canal+ Foot": ["Canal+ Foot", "Canal+ Sport", "Canal+ Live"],
      "Canal+ Live": ["Canal+ Live", "Canal+ Foot", "Canal+ Sport 360"],
      "beIN Sports": ["beIN Sports 1", "beIN Sports 2", "beIN Sports 3", "beIN Sports Max"],
      "beIN Sports 1": ["beIN Sports 1", "beIN Sports 1 HD", "beIN Sports 1 FHD"],
      "beIN Sports 2": ["beIN Sports 2", "beIN Sports 2 HD", "beIN Sports 2 FHD"],
      "beIN Sports 3": ["beIN Sports 3", "beIN Sports 3 HD", "beIN Sports 3 FHD"],
      "DAZN": ["DAZN 1", "DAZN 2", "DAZN 1 France", "DAZN 1 FR"],
      "DAZN 1": ["DAZN 1", "DAZN 1 France", "DAZN 1 FR"],
      "DAZN 2": ["DAZN 2", "DAZN 2 France", "DAZN 2 FR"],
      "RMC Sport": ["RMC Sport 1", "RMC Sport 2", "RMC Sport Live"],
      "RMC Sport 1": ["RMC Sport 1", "RMC Sport 1 HD", "RMC Sport 1 FHD"],
      "RMC Sport 2": ["RMC Sport 2", "RMC Sport 2 HD"],
      "Amazon Prime": ["Prime Video", "Pass Ligue 1", "Amazon Prime"],
      "Prime Video": ["Prime Video", "Pass Ligue 1", "Amazon Prime"],
      "Eurosport": ["Eurosport 1", "Eurosport 2", "Eurosport 1 FR", "Eurosport 2 FR"],
      "TF1": ["TF1", "TF1 HD", "TF1 4K"],
      "M6": ["M6", "M6 HD", "M6 4K"],
      "France 2": ["France 2", "France 2 HD", "France 2 4K"],
      "France 3": ["France 3", "France 3 HD"],
      "La Chaîne L'Équipe": ["La Chaîne L'Équipe", "L'Équipe", "L'Equipe 21"]
    },
    "arabe": {
      "beIN Sports": ["beIN Sports 1 HD", "beIN Sports 2 HD", "beIN Sports 3 HD", "beIN Sports 4 HD", "beIN Sports AFC", "beIN Sports Premium 1"],
      "beIN Sports 1": ["beIN Sports 1 HD", "beIN Sports 1", "beIN Sports AFC 1", "beIN Sports Premium 1"],
      "beIN Sports 2": ["beIN Sports 2 HD", "beIN Sports 2", "beIN Sports AFC 2"],
      "beIN Sports 3": ["beIN Sports 3 HD", "beIN Sports 3", "beIN Sports AFC 3"],
      "beIN Sports 4": ["beIN Sports 4 HD", "beIN Sports 4"],
      "SSC": ["SSC 1 HD", "SSC 2 HD", "SSC 3 HD", "SSC 4 HD", "SSC 5 HD", "SSC Extra 1"],
      "Abu Dhabi": ["Abu Dhabi Sports 1", "Abu Dhabi Sports 2", "AD Sports 1 HD", "AD Sports Premium 1"],
      "Alkass": ["Alkass 1 HD", "Alkass 2 HD", "Alkass 3 HD", "Alkass 4 HD", "Alkass Extra 1"],
      "Dubai Sports": ["Dubai Sports 1", "Dubai Sports 2", "Dubai Sports 3"],
      "Arryadia": ["Arryadia", "Arryadia HD", "Arryadia TNT"],
      "On Time Sports": ["On Time Sports 1", "On Time Sports 2", "ON Sport"],
      "Canal+": ["Canal+ Sport", "Canal+ Foot"]
    },
    "mena": {
      "beIN Sports": ["beIN Sports 1 HD", "beIN Sports 2 HD", "beIN Sports 3 HD", "beIN Sports 4 HD", "beIN Sports AFC", "beIN Sports Premium 1"],
      "beIN Sports 1": ["beIN Sports 1 HD", "beIN Sports 1", "beIN Sports AFC 1", "beIN Sports Premium 1"],
      "beIN Sports 2": ["beIN Sports 2 HD", "beIN Sports 2", "beIN Sports AFC 2"],
      "beIN Sports 3": ["beIN Sports 3 HD", "beIN Sports 3", "beIN Sports AFC 3"],
      "beIN Sports 4": ["beIN Sports 4 HD", "beIN Sports 4"],
      "SSC": ["SSC 1 HD", "SSC 2 HD", "SSC 3 HD", "SSC 4 HD", "SSC 5 HD", "SSC Extra 1"],
      "Abu Dhabi": ["Abu Dhabi Sports 1", "Abu Dhabi Sports 2", "AD Sports 1 HD", "AD Sports Premium 1"],
      "Alkass": ["Alkass 1 HD", "Alkass 2 HD", "Alkass 3 HD", "Alkass 4 HD", "Alkass Extra 1"],
      "Dubai Sports": ["Dubai Sports 1", "Dubai Sports 2", "Dubai Sports 3"],
      "Arryadia": ["Arryadia", "Arryadia HD", "Arryadia TNT"],
      "On Time Sports": ["On Time Sports 1", "On Time Sports 2", "ON Sport"],
      "Canal+": ["Canal+ Sport", "Canal+ Foot"]
    },
    "maroc": {
      "Arryadia": ["Arryadia", "Arryadia HD", "Arryadia TNT", "SNRT Arryadia"],
      "beIN Sports": ["beIN Sports 1 HD", "beIN Sports 2 HD", "beIN Sports 3 HD", "beIN Sports 4 HD", "beIN Sports Premium 1"],
      "SSC": ["SSC 1 HD", "SSC 2 HD", "SSC 3 HD", "SSC 4 HD", "SSC 5 HD"],
      "Canal+": ["Canal+ Sport", "Canal+ Foot"]
    },
    "algerie": {
      "ENTV": ["Programme National", "TV6 Algerie", "ENTV HD", "Canal Algerie"],
      "beIN Sports": ["beIN Sports 1 HD", "beIN Sports 2 HD", "beIN Sports 3 HD", "beIN Sports 4 HD"],
      "SSC": ["SSC 1 HD", "SSC 2 HD", "SSC 3 HD"]
    },
    "tunisie": {
      "El Watania": ["El Watania 1", "El Watania 2", "Tele Tunisie 1", "Tele Tunisie 2"],
      "beIN Sports": ["beIN Sports 1 HD", "beIN Sports 2 HD", "beIN Sports 3 HD"],
      "SSC": ["SSC 1 HD", "SSC 2 HD"]
    },
    "egypte": {
      "On Time Sports": ["On Time Sports 1", "On Time Sports 2", "ON Sport HD"],
      "beIN Sports": ["beIN Sports 1 HD", "beIN Sports 2 HD", "beIN Sports 3 HD"],
      "SSC": ["SSC 1 HD", "SSC 2 HD"]
    },
    "angleterre": {
      "Sky Sports": ["Sky Sports Main Event", "Sky Sports Premier League", "Sky Sports Football", "Sky Sports Arena", "Sky Sports Action"],
      "Sky Sports Main Event": ["Sky Sports Main Event", "Sky Sports Premier League"],
      "Sky Sports Premier League": ["Sky Sports Premier League", "Sky Sports Main Event"],
      "TNT Sports": ["TNT Sports 1", "TNT Sports 2", "TNT Sports 3", "TNT Sports 4", "TNT Sports Ultimate"],
      "TNT Sports 1": ["TNT Sports 1", "TNT Sports Ultimate"],
      "TNT Sports 2": ["TNT Sports 2"],
      "BBC": ["BBC One", "BBC Two", "BBC iPlayer", "BBC Red Button"],
      "ITV": ["ITV 1", "ITV 4", "ITVX"],
      "Premier Sports": ["Premier Sports 1", "Premier Sports 2"],
      "Amazon Prime": ["Prime Video UK", "Prime Video"],
      "DAZN": ["DAZN 1 UK", "DAZN"]
    },
    "uk": {
      "Sky Sports": ["Sky Sports Main Event", "Sky Sports Premier League", "Sky Sports Football", "Sky Sports Arena", "Sky Sports Action"],
      "Sky Sports Main Event": ["Sky Sports Main Event", "Sky Sports Premier League"],
      "Sky Sports Premier League": ["Sky Sports Premier League", "Sky Sports Main Event"],
      "TNT Sports": ["TNT Sports 1", "TNT Sports 2", "TNT Sports 3", "TNT Sports 4", "TNT Sports Ultimate"],
      "TNT Sports 1": ["TNT Sports 1", "TNT Sports Ultimate"],
      "TNT Sports 2": ["TNT Sports 2"],
      "BBC": ["BBC One", "BBC Two", "BBC iPlayer", "BBC Red Button"],
      "ITV": ["ITV 1", "ITV 4", "ITVX"],
      "Premier Sports": ["Premier Sports 1", "Premier Sports 2"],
      "Amazon Prime": ["Prime Video UK", "Prime Video"],
      "DAZN": ["DAZN 1 UK", "DAZN"]
    },
    "espagne": {
      "Movistar": ["Movistar LaLiga", "Movistar LaLiga 1", "Movistar Liga de Campeones", "Movistar Plus+"],
      "Movistar LaLiga": ["Movistar LaLiga", "Movistar LaLiga 1", "Movistar Plus+"],
      "Movistar Liga de Campeones": ["Movistar Liga de Campeones", "Movistar Liga de Campeones 1"],
      "DAZN": ["DAZN LaLiga", "DAZN LaLiga 2", "DAZN 1 ES", "DAZN 2 ES", "DAZN 1"],
      "DAZN LaLiga": ["DAZN LaLiga", "DAZN LaLiga 2"],
      "Gol Play": ["Gol Play", "GOL", "GOL TV"],
      "RTVE": ["La 1", "Teledeporte", "RTVE Play"]
    },
    "spain": {
      "Movistar": ["Movistar LaLiga", "Movistar LaLiga 1", "Movistar Liga de Campeones", "Movistar Plus+"],
      "Movistar LaLiga": ["Movistar LaLiga", "Movistar LaLiga 1", "Movistar Plus+"],
      "Movistar Liga de Campeones": ["Movistar Liga de Campeones", "Movistar Liga de Campeones 1"],
      "DAZN": ["DAZN LaLiga", "DAZN LaLiga 2", "DAZN 1 ES", "DAZN 2 ES", "DAZN 1"],
      "DAZN LaLiga": ["DAZN LaLiga", "DAZN LaLiga 2"],
      "Gol Play": ["Gol Play", "GOL", "GOL TV"],
      "RTVE": ["La 1", "Teledeporte", "RTVE Play"]
    },
    "italie": {
      "Sky Sport": ["Sky Sport Uno", "Sky Sport Calcio", "Sky Sport Serie A", "Sky Sport Football", "Sky Sport 251", "Sky Sport 252"],
      "Sky Sport Calcio": ["Sky Sport Calcio", "Sky Sport Uno"],
      "Sky Sport Uno": ["Sky Sport Uno", "Sky Sport Calcio"],
      "DAZN": ["DAZN 1", "DAZN 2", "DAZN 1 IT", "DAZN IT", "Zona DAZN"],
      "Rai": ["Rai 1", "Rai 2", "Rai Sport", "Rai Sport+ HD"],
      "Mediaset": ["Canale 5", "Italia 1", "Mediaset Infinity", "20 Mediaset"]
    },
    "italy": {
      "Sky Sport": ["Sky Sport Uno", "Sky Sport Calcio", "Sky Sport Serie A", "Sky Sport Football", "Sky Sport 251", "Sky Sport 252"],
      "Sky Sport Calcio": ["Sky Sport Calcio", "Sky Sport Uno"],
      "Sky Sport Uno": ["Sky Sport Uno", "Sky Sport Calcio"],
      "DAZN": ["DAZN 1", "DAZN 2", "DAZN 1 IT", "DAZN IT", "Zona DAZN"],
      "Rai": ["Rai 1", "Rai 2", "Rai Sport", "Rai Sport+ HD"],
      "Mediaset": ["Canale 5", "Italia 1", "Mediaset Infinity", "20 Mediaset"]
    },
    "allemagne": {
      "Sky Sport": ["Sky Sport Bundesliga 1", "Sky Sport Bundesliga 2", "Sky Sport Premier League", "Sky Sport Top Event", "Sky Sport Mix"],
      "Sky Sport Bundesliga": ["Sky Sport Bundesliga 1", "Sky Sport Bundesliga 2"],
      "DAZN": ["DAZN 1 DE", "DAZN 2 DE", "DAZN 1", "DAZN 2"],
      "RTL": ["RTL", "RTL Nitro", "RTL+"],
      "ZDF": ["ZDF", "ZDF HD", "ZDFinfo"],
      "ARD": ["Das Erste", "ARD HD", "Sportschau"]
    },
    "germany": {
      "Sky Sport": ["Sky Sport Bundesliga 1", "Sky Sport Bundesliga 2", "Sky Sport Premier League", "Sky Sport Top Event", "Sky Sport Mix"],
      "Sky Sport Bundesliga": ["Sky Sport Bundesliga 1", "Sky Sport Bundesliga 2"],
      "DAZN": ["DAZN 1 DE", "DAZN 2 DE", "DAZN 1", "DAZN 2"],
      "RTL": ["RTL", "RTL Nitro", "RTL+"],
      "ZDF": ["ZDF", "ZDF HD", "ZDFinfo"],
      "ARD": ["Das Erste", "ARD HD", "Sportschau"]
    },
    "portugal": {
      "Sport TV": ["Sport TV 1", "Sport TV 2", "Sport TV 3", "Sport TV 4", "Sport TV 5", "Sport TV 6", "Sport TV +"],
      "Sport TV 1": ["Sport TV 1", "Sport TV +"],
      "DAZN": ["DAZN 1 PT", "DAZN 2 PT", "DAZN 3 PT", "Eleven Sports 1", "Eleven Sports 2"],
      "RTP": ["RTP 1", "RTP 2", "RTP Internacional"],
      "SIC": ["SIC", "SIC Notícias"],
      "TVI": ["TVI", "TVI Ficção"]
    },
    "etats_unis": {
      "NBC": ["NBC", "USA Network", "Peacock", "Telemundo", "Universo"],
      "CBS": ["CBS", "Paramount+", "CBS Sports Network", "Golazo Network"],
      "ESPN": ["ESPN", "ESPN2", "ESPN+", "ESPN Deportes", "ABC"],
      "Fox Sports": ["FOX", "FS1", "FS2", "Fox Deportes"],
      "beIN Sports": ["beIN Sports USA", "beIN Sports en Español", "beIN Sports Connect"]
    },
    "usa": {
      "NBC": ["NBC", "USA Network", "Peacock", "Telemundo", "Universo"],
      "CBS": ["CBS", "Paramount+", "CBS Sports Network", "Golazo Network"],
      "ESPN": ["ESPN", "ESPN2", "ESPN+", "ESPN Deportes", "ABC"],
      "Fox Sports": ["FOX", "FS1", "FS2", "Fox Deportes"],
      "beIN Sports": ["beIN Sports USA", "beIN Sports en Español", "beIN Sports Connect"]
    },
    "belgique": {
      "DAZN": ["DAZN 1 BE", "DAZN 2 BE", "DAZN 3 BE", "Eleven Sports 1", "Eleven Sports 2"],
      "Play Sports": ["Play Sports 1", "Play Sports 2", "Play Sports 3"],
      "RTBF": ["Tipik", "La Une", "RTBF Auvio"],
      "VTM": ["VTM 2", "VTM 3", "VTM 4"]
    },
    "suisse": {
      "blue Sport": ["blue Sport 1", "blue Sport 2", "blue Sport 3", "blue Zoom"],
      "RTS": ["RTS 1", "RTS 2", "RTS Deux"],
      "SRF": ["SRF zwei", "SRF info", "SRF 1"],
      "RSI": ["RSI La 2", "RSI La 1"]
    },
    "pays_bas": {
      "Ziggo Sport": ["Ziggo Sport Select", "Ziggo Sport Voetbal", "Ziggo Sport Racing", "Ziggo Sport Docu"],
      "ESPN": ["ESPN 1", "ESPN 2", "ESPN 3", "ESPN 4"],
      "Viaplay": ["Viaplay", "Viaplay Xtra"],
      "NOS": ["NPO 1", "NPO 2", "NPO 3"]
    },
    "turquie": {
      "beIN Sports": ["beIN Sports 1 TR", "beIN Sports 2 TR", "beIN Sports 3 TR", "beIN Sports Haber"],
      "S Sport": ["S Sport", "S Sport 2", "S Sport Plus"],
      "TRT": ["TRT Spor", "TRT Spor Yildiz", "TRT 1"],
      "TV8": ["TV8", "TV8.5", "EXXEN"]
    }
  };

  var state = {
    // Structure multi-pays: { "_default": { ... }, "france": { ... }, ... }
    store: {},
    visibleCountriesList: [],
    selectedCountry: "france",
    isEditing: false,
    editingKey: ""
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
      code: iso || cid.slice(0, 2)
    };
  }

  function findMappingKey(mappings, rawKey) {
    if (!mappings || !rawKey) return null;
    if (mappings[rawKey] !== undefined) return rawKey;
    var normTarget = String(rawKey).trim().toLowerCase();
    for (var k in mappings) {
      if (k.trim().toLowerCase() === normTarget) return k;
    }
    var unescaped = String(rawKey)
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim().toLowerCase();
    for (var k2 in mappings) {
      if (k2.trim().toLowerCase() === unescaped) return k2;
    }
    return null;
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

      // Si la table canonical n'a pas encore de flag __visible__, on filtre les non-pays
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
      console.warn("[Velora Football Admin] Erreur lors du chargement des pays visibles:", e.message);
      return state.visibleCountriesList || [];
    }
  }

  /**
   * Normalise l'objet de stockage multi-pays.
   */
  function normalizeStore(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        "_default": Object.assign({}, DEFAULT_RECOMMENDED_BY_COUNTRY._default),
        "france": Object.assign({}, DEFAULT_RECOMMENDED_BY_COUNTRY.france)
      };
    }

    // Est-ce déjà un store multi-pays ?
    var hasCountryKeys = raw._default || raw.france || raw.arabe || raw.mena || raw.uk || raw.angleterre || raw.espagne || raw.spain || raw.italie || raw.italy || raw.allemagne || raw.germany || raw.usa || raw.etats_unis || raw.maroc || raw.algerie;
    if (hasCountryKeys) {
      return Object.assign({}, raw);
    }

    // Ancien format plat : on place les règles existantes dans _default et france
    return {
      "_default": Object.assign({}, raw),
      "france": Object.assign({}, raw)
    };
  }

  function getCountryMappings(countryId) {
    var cid = countrySlug(countryId);
    if (!state.store[cid]) {
      state.store[cid] = {};
    }
    return state.store[cid];
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
      .vel-foot-test-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
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
        width: 25%;
        color: #38bdf8;
        font-weight: 800;
        font-size: 0.92rem;
      }
      .vel-foot-cell-aliases {
        width: 55%;
      }
      .vel-foot-cell-actions {
        width: 20%;
        text-align: right;
        white-space: nowrap;
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

    // S'assurer que le pays sélectionné est valide
    if (!countriesMap.has(state.selectedCountry)) {
      state.selectedCountry = countriesMap.has("france") ? "france" : (sortedList[1] ? sortedList[1].id : "_default");
    }

    var activeMeta = getCountryMeta(state.selectedCountry);

    // 1. Rendu des pilules de la barre horizontale
    if (pillsContainer) {
      pillsContainer.innerHTML = sortedList.map(function (c) {
        var rulesMap = state.store[c.id] || {};
        var count = Object.keys(rulesMap).length;
        var isActive = state.selectedCountry === c.id;

        return '<button type="button" class="vel-foot-country-pill ' + (isActive ? "is-active" : "") + '" data-country-id="' + esc(c.id) + '">' +
          '<span>' + c.flag + '</span> ' +
          '<span>' + esc(c.name) + '</span> ' +
          '<span class="vel-foot-country-badge">' + count + '</span>' +
        '</button>';
      }).join("");
    }

    // 2. Rendu du menu déroulant dans la carte du formulaire
    if (formSelect) {
      formSelect.innerHTML = sortedList.map(function (c) {
        return '<option value="' + esc(c.id) + '" ' + (c.id === state.selectedCountry ? "selected" : "") + '>' + c.flag + " " + esc(c.name) + '</option>';
      }).join("");
    }

    // 3. Rendu du sélecteur du testeur
    if (testCountrySelect) {
      testCountrySelect.innerHTML = sortedList.map(function (c) {
        return '<option value="' + esc(c.id) + '" ' + (c.id === state.selectedCountry ? "selected" : "") + '>' + c.flag + " " + esc(c.name) + '</option>';
      }).join("");
    }

    // 4. Mise à jour du libellé du bouton d'ajout
    var btnSubmit = getEl("foot-map-submit-btn");
    if (btnSubmit) {
      btnSubmit.textContent = state.isEditing
        ? "💾 Mettre à jour (" + activeMeta.name + ")"
        : "➕ Ajouter la règle (" + activeMeta.name + ")";
    }
  }

  function renderMappingsTable() {
    var tbody = getEl("foot-mappings-tbody");
    var countEl = getEl("foot-mappings-count");
    if (!tbody) return;

    var currentMappings = getCountryMappings(state.selectedCountry);
    var filterQuery = (getEl("foot-mappings-search") ? getEl("foot-mappings-search").value : "").trim().toLowerCase();
    var keys = Object.keys(currentMappings).sort(function (a, b) { return a.localeCompare(b, "fr"); });

    if (filterQuery) {
      keys = keys.filter(function (k) {
        var aliases = currentMappings[k] || [];
        var joined = (k + " " + (Array.isArray(aliases) ? aliases.join(" ") : String(aliases))).toLowerCase();
        return joined.includes(filterQuery);
      });
    }

    var activeMeta = getCountryMeta(state.selectedCountry);

    if (countEl) {
      var total = Object.keys(currentMappings).length;
      countEl.textContent = total + (total > 1 ? " règles configurées pour " : " règle configurée pour ") + activeMeta.name;
    }

    if (keys.length === 0) {
      var hasRec = DEFAULT_RECOMMENDED_BY_COUNTRY[state.selectedCountry] || DEFAULT_RECOMMENDED_BY_COUNTRY._default;
      tbody.innerHTML = '<tr><td colspan="3" class="vel-foot-empty">' +
        '<div>Aucune règle spécifique pour <strong>' + esc(activeMeta.name) + '</strong>. ' + (state.selectedCountry !== "_default" ? '(Les règles générales par défaut seront appliquées en repli).' : '') + '</div>' +
        (hasRec ? '<div class="vel-foot-empty-action"><button type="button" class="vel-foot-btn vel-foot-btn-primary vel-foot-btn-sm" onclick="window.veloraFootballAdmin.loadRecommendedDefaults()">✨ Charger règles recommandées (' + esc(activeMeta.name) + ')</button><button type="button" class="vel-foot-btn vel-foot-btn-secondary vel-foot-btn-sm" onclick="window.veloraFootballAdmin.copyFromCountry(\'_default\')">📋 Copier depuis Par Défaut</button></div>' : '') +
      '</td></tr>';
      return;
    }

    tbody.innerHTML = keys.map(function (k) {
      var aliases = currentMappings[k];
      var list = Array.isArray(aliases) ? aliases : [String(aliases)];
      var badgesHtml = list.map(function (al) {
        return '<span class="vel-foot-alias-badge">' + esc(al) + "</span>";
      }).join(" ");

      var kEsc = esc(k);
      return '<tr data-map-key="' + kEsc + '">' +
        '<td class="vel-foot-cell-key"><strong>' + kEsc + '</strong></td>' +
        '<td class="vel-foot-cell-aliases">' + badgesHtml + '</td>' +
        '<td class="vel-foot-cell-actions">' +
          '<button type="button" class="vel-foot-btn-action vel-foot-btn-edit" data-action="edit-mapping" data-key="' + kEsc + '" onclick="window.veloraFootballAdmin.editMapping(this.getAttribute(\'data-key\'))" title="Modifier cette règle">✏️ Modifier</button>' +
          '<button type="button" class="vel-foot-btn-action vel-foot-btn-delete" data-action="delete-mapping" data-key="' + kEsc + '" onclick="window.veloraFootballAdmin.deleteMapping(this.getAttribute(\'data-key\'))" title="Supprimer cette règle">🗑️ Supprimer</button>' +
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
      runLiveTest(testInput.value);
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
      fetchVisibleCountries(false)
    ]);
    if (!state.selectedCountry) {
      state.selectedCountry = detectCurrentAppCountry();
    }
    renderCountrySelector();
    renderMappingsTable();
  }

  function resetForm() {
    state.isEditing = false;
    state.editingKey = "";
    var inputKey = getEl("foot-map-key");
    var inputAliases = getEl("foot-map-aliases");
    var btnSubmit = getEl("foot-map-submit-btn");
    var activeMeta = getCountryMeta(state.selectedCountry);
    if (inputKey) { inputKey.value = ""; inputKey.disabled = false; }
    if (inputAliases) inputAliases.value = "";
    if (btnSubmit) btnSubmit.textContent = "➕ Ajouter la règle (" + activeMeta.name + ")";
    setStatus("");
  }

  function editMapping(rawKey) {
    if (!rawKey) return;
    var currentMappings = getCountryMappings(state.selectedCountry);
    var realKey = findMappingKey(currentMappings, rawKey) || rawKey;
    var aliases = currentMappings[realKey];
    if (!aliases) return;

    state.isEditing = true;
    state.editingKey = realKey;

    var inputKey = getEl("foot-map-key");
    var inputAliases = getEl("foot-map-aliases");
    var btnSubmit = getEl("foot-map-submit-btn");
    var list = Array.isArray(aliases) ? aliases : [String(aliases)];

    if (inputKey) {
      inputKey.value = realKey;
    }
    if (inputAliases) {
      inputAliases.value = list.join(", ");
    }
    if (btnSubmit) {
      btnSubmit.textContent = "💾 Mettre à jour (" + getCountryMeta(state.selectedCountry).name + ")";
    }

    var formEl = getEl("foot-map-form");
    if (formEl) formEl.scrollIntoView({ behavior: "smooth", block: "center" });
    if (inputAliases) inputAliases.focus();
    setStatus("✏️ Modification de la règle « " + realKey + " » pour " + getCountryMeta(state.selectedCountry).name + "...");
  }

  async function deleteMapping(rawKey) {
    if (!rawKey) return;
    var currentMappings = getCountryMappings(state.selectedCountry);
    var realKey = findMappingKey(currentMappings, rawKey) || rawKey;

    var activeMeta = getCountryMeta(state.selectedCountry);
    delete currentMappings[realKey];
    state.store[state.selectedCountry] = currentMappings;

    await persistToDatabase(state.store);
    renderCountrySelector();
    renderMappingsTable();
    if (state.isEditing && state.editingKey === realKey) resetForm();
    setStatus("🗑️ Règle pour « " + realKey + " » supprimée de " + activeMeta.name + ".");
  }

  async function handleFormSubmit(e) {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();

    var inputKey = getEl("foot-map-key");
    var inputAliases = getEl("foot-map-aliases");
    if (!inputKey || !inputAliases) return;

    var key = inputKey.value.trim();
    var aliasesStr = inputAliases.value.trim();

    if (!key) {
      setStatus("Veuillez entrer le nom de la chaîne du match (ex: Canal+ ou beIN Sports 1).", true);
      inputKey.focus();
      return;
    }

    if (!aliasesStr) {
      setStatus("Veuillez entrer au moins un mot-clé ou alias de recherche (ex: Canal+ Sport, Canal+ Foot).", true);
      inputAliases.focus();
      return;
    }

    var aliasesList = aliasesStr.split(/[,\n]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (aliasesList.length === 0) {
      setStatus("Aucun alias valide spécifié.", true);
      return;
    }

    var currentMappings = getCountryMappings(state.selectedCountry);

    // Si on était en train de modifier et que la clé a changé, supprimer l'ancienne clé
    if (state.isEditing && state.editingKey) {
      var oldRealKey = findMappingKey(currentMappings, state.editingKey);
      if (oldRealKey && oldRealKey !== key) {
        delete currentMappings[oldRealKey];
      }
    }

    currentMappings[key] = aliasesList;
    state.store[state.selectedCountry] = currentMappings;

    await persistToDatabase(state.store);
    renderCountrySelector();
    renderMappingsTable();
    resetForm();

    var activeMeta = getCountryMeta(state.selectedCountry);
    setStatus("✨ Règle enregistrée avec succès pour « " + key + " » dans " + activeMeta.name + " (" + aliasesList.length + " alias).");
  }

  async function loadRecommendedDefaults() {
    var activeMeta = getCountryMeta(state.selectedCountry);
    var recommended = DEFAULT_RECOMMENDED_BY_COUNTRY[state.selectedCountry] || DEFAULT_RECOMMENDED_BY_COUNTRY._default;

    var currentMappings = getCountryMappings(state.selectedCountry);
    var merged = Object.assign({}, recommended, currentMappings);
    state.store[state.selectedCountry] = merged;
    await persistToDatabase(state.store);
    renderCountrySelector();
    renderMappingsTable();
    setStatus("✨ Règles recommandées chargées avec succès pour " + activeMeta.name + " (" + Object.keys(merged).length + " règles actives).");
  }

  async function copyFromCountry(sourceCountryId) {
    var sourceId = sourceCountryId;
    if (!sourceId) {
      var sourceList = Object.keys(state.store).filter(function (c) {
        return c !== state.selectedCountry && Object.keys(state.store[c] || {}).length > 0;
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

    var sourceRules = state.store[sourceId] || DEFAULT_RECOMMENDED_BY_COUNTRY[sourceId] || {};
    if (Object.keys(sourceRules).length === 0) {
      alert("Aucune règle trouvée dans le pays source " + sourceId);
      return;
    }

    var currentMappings = getCountryMappings(state.selectedCountry);
    var merged = Object.assign({}, sourceRules, currentMappings);
    state.store[state.selectedCountry] = merged;
    await persistToDatabase(state.store);
    renderCountrySelector();
    renderMappingsTable();
    setStatus("📋 " + Object.keys(sourceRules).length + " règle(s) copiée(s) depuis " + getCountryMeta(sourceId).name + " vers " + getCountryMeta(state.selectedCountry).name + ".");
  }

  function runLiveTest(query, overrideCountry) {
    var resBox = getEl("foot-test-results");
    if (!resBox) return;
    var q = (query || "").trim();
    var testCid = countrySlug(overrideCountry || (getEl("foot-test-country-select") ? getEl("foot-test-country-select").value : state.selectedCountry));

    if (!q) {
      resBox.innerHTML = '<span class="vel-foot-test-hint">Entrez le nom d\'un diffuseur (ex: Canal+, beIN 1, Sky Sports...) pour voir les mots-clés qui seront recherchés.</span>';
      return;
    }

    var countryRules = state.store[testCid] || {};
    var defaultRules = state.store._default || {};

    var normQ = q.toLowerCase();
    var matchedKey = null;
    var matchedAliases = null;
    var matchedFromCountry = null;

    // 1. Recherche dans le pays sélectionné
    for (var k in countryRules) {
      if (k.toLowerCase() === normQ || k.trim().toLowerCase() === q.toLowerCase()) {
        matchedKey = k;
        matchedAliases = countryRules[k];
        matchedFromCountry = testCid;
        break;
      }
    }

    if (!matchedAliases) {
      for (var k2 in countryRules) {
        if (normQ.includes(k2.toLowerCase()) || k2.toLowerCase().includes(normQ)) {
          matchedKey = k2;
          matchedAliases = countryRules[k2];
          matchedFromCountry = testCid;
          break;
        }
      }
    }

    // 2. Repli sur _default si non trouvé dans le pays
    if (!matchedAliases && testCid !== "_default") {
      for (var dk in defaultRules) {
        if (dk.toLowerCase() === normQ || dk.trim().toLowerCase() === q.toLowerCase()) {
          matchedKey = dk;
          matchedAliases = defaultRules[dk];
          matchedFromCountry = "_default";
          break;
        }
      }
      if (!matchedAliases) {
        for (var dk2 in defaultRules) {
          if (normQ.includes(dk2.toLowerCase()) || dk2.toLowerCase().includes(normQ)) {
            matchedKey = dk2;
            matchedAliases = defaultRules[dk2];
            matchedFromCountry = "_default";
            break;
          }
        }
      }
    }

    var targetMeta = getCountryMeta(testCid);

    if (matchedAliases && matchedAliases.length > 0) {
      var badges = matchedAliases.map(function (a) {
        return '<span class="vel-foot-alias-badge vel-foot-alias-badge--highlight">' + esc(a) + "</span>";
      }).join(" ");

      var sourceLabel = matchedFromCountry === testCid
        ? 'Règle spécifique du pays (' + targetMeta.flag + ' ' + targetMeta.name + ')'
        : 'Règle générale de repli (🌐 Par défaut)';

      resBox.innerHTML = '<div class="vel-foot-test-match-found">' +
        '<div class="vel-foot-test-header">✅ Correspondance trouvée pour <strong>« ' + esc(matchedKey) + ' »</strong> [' + sourceLabel + '] :</div>' +
        '<div class="vel-foot-test-tags">' + badges + '</div>' +
        '<div class="vel-foot-test-subtext">➡️ Lors du clic sur le match dans le bouquet <strong>' + targetMeta.name + '</strong>, la recherche ciblera ces ' + matchedAliases.length + ' chaînes au lieu de « ' + esc(q) + ' ».</div>' +
      '</div>';
    } else {
      resBox.innerHTML = '<div class="vel-foot-test-no-match">' +
        '<div class="vel-foot-test-header">ℹ️ Aucun mappage spécifique pour <strong>« ' + esc(q) + ' »</strong> dans ' + targetMeta.name + '.</div>' +
        '<div class="vel-foot-test-subtext">➡️ Le système recherchera directement le terme original : <code>' + esc(q) + '</code>.</div>' +
        '<button type="button" class="vel-foot-btn-action" style="margin-top:0.4rem;" onclick="window.veloraFootballAdmin &amp;&amp; window.veloraFootballAdmin.quickCreateMapping(\'' + esc(q).replace(/'/g, "\\'") + '\')">➕ Créer une règle pour « ' + esc(q) + ' » dans ' + targetMeta.name + '</button>' +
      '</div>';
    }
  }

  function quickCreateMapping(channelName) {
    if (!channelName) return;
    resetForm();
    var inputKey = getEl("foot-map-key");
    var inputAliases = getEl("foot-map-aliases");
    if (inputKey) inputKey.value = channelName;
    if (inputAliases) inputAliases.value = channelName + " 1, " + channelName + " 2";
    var formEl = getEl("foot-map-form");
    if (formEl) formEl.scrollIntoView({ behavior: "smooth", block: "center" });
    if (inputAliases) inputAliases.focus();
  }

  var jsonDialogMode = "country"; // "country" ou "all"

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
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error('Le format doit être un objet JSON valide { "Chaîne": ["Alias1", "Alias2"] }');
      }

      if (jsonDialogMode === "country") {
        state.store[state.selectedCountry] = parsed;
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
    editMapping: editMapping,
    deleteMapping: deleteMapping,
    resetForm: resetForm,
    handleSubmit: handleFormSubmit,
    loadRecommendedDefaults: loadRecommendedDefaults,
    quickCreateMapping: quickCreateMapping,
    openJsonEditor: openJsonEditor,
    saveJsonEditor: saveJsonEditor,
    runLiveTest: runLiveTest,
    getStore: function () { return state.store; },
    getMappings: function (countryId) {
      if (!countryId) return state.store;
      var cid = countrySlug(countryId);
      return state.store[cid] || state.store._default || {};
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

    // Intercepter UNIQUEMENT le clic sur le bouton d'onglet dans l'en-tête (et JAMAIS à l'intérieur du panneau football)
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
    var editBtn = e.target.closest('[data-action="edit-mapping"], .vel-foot-btn-edit');
    if (editBtn) {
      e.preventDefault();
      var editKey = editBtn.getAttribute("data-key") || editBtn.dataset.key;
      editMapping(editKey);
      return;
    }

    // Supprimer une règle
    var delBtn = e.target.closest('[data-action="delete-mapping"], .vel-foot-btn-delete');
    if (delBtn) {
      e.preventDefault();
      var delKey = delBtn.getAttribute("data-key") || delBtn.dataset.key;
      deleteMapping(delKey);
      return;
    }
  });

  document.addEventListener("input", function (e) {
    if (e.target && e.target.id === "foot-mappings-search") {
      renderMappingsTable();
    }
    if (e.target && e.target.id === "foot-test-input") {
      var val = e.target.value;
      clearTimeout(window.__veloraFootTestTimer);
      window.__veloraFootTestTimer = setTimeout(function () { runLiveTest(val); }, 200);
    }
  });

  document.addEventListener("change", function (e) {
    if (e.target && e.target.id === "foot-form-country-select") {
      selectCountry(e.target.value);
      return;
    }
    if (e.target && e.target.id === "foot-test-country-select") {
      var testInput = getEl("foot-test-input");
      if (testInput && testInput.value) {
        runLiveTest(testInput.value, e.target.value);
      }
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
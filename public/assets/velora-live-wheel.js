(() => {
  "use strict";

  // Dynamic Theme Builder based on exact logo colors
  function buildThemeFromRgb(r, g, b) {
    r = Math.round(Math.max(0, Math.min(255, r)));
    g = Math.round(Math.max(0, Math.min(255, g)));
    b = Math.round(Math.max(0, Math.min(255, b)));

    const isBlack = (r + g + b) / 3 < 38;
    const primary = isBlack ? `rgb(22, 22, 28)` : `rgb(${r}, ${g}, ${b})`;
    const glow = isBlack ? `rgba(0, 0, 0, 0.92)` : `rgba(${r}, ${g}, ${b}, 0.65)`;
    const border = isBlack ? `rgba(35, 35, 45, 0.8)` : `rgba(${r}, ${g}, ${b}, 0.45)`;
    const subtle = isBlack ? `rgba(0, 0, 0, 0.4)` : `rgba(${r}, ${g}, ${b}, 0.16)`;
    const arenaBg = isBlack
      ? `radial-gradient(circle at 50% 35%, rgba(0, 0, 0, 0.95) 0%, rgba(4, 4, 7, 0.98) 75%)`
      : `radial-gradient(circle at 50% 35%, rgba(${Math.round(r * 0.4)}, ${Math.round(g * 0.4)}, ${Math.round(b * 0.4)}, 0.45) 0%, rgba(6, 6, 10, 0.98) 75%)`;
    const centerBg = isBlack
      ? `linear-gradient(145deg, rgba(14, 14, 18, 0.98), rgba(6, 6, 9, 0.98))`
      : `linear-gradient(145deg, rgba(${Math.round(r * 0.3)}, ${Math.round(g * 0.3)}, ${Math.round(b * 0.3)}, 0.96), rgba(8, 8, 12, 0.98))`;
    const cardBg = `linear-gradient(145deg, rgba(20, 20, 26, 0.94), rgba(8, 8, 12, 0.96))`;

    return {
      r,
      g,
      b,
      primary,
      glow,
      subtle,
      border,
      arenaBg,
      centerBg,
      cardBg
    };
  }

  // Brand Theme Fallbacks
  function getBrandThemeByName(name = "") {
    const n = String(name || "").toLowerCase();
    if (n.includes("shahid")) return buildThemeFromRgb(0, 207, 126);
    if (n.includes("netflix")) return buildThemeFromRgb(229, 9, 20);
    if (n.includes("prime") || n.includes("amazon")) return buildThemeFromRgb(0, 168, 225);
    if (n.includes("disney") || n.includes("marvel") || n.includes("star wars")) return buildThemeFromRgb(0, 214, 254);
    if (n.includes("max") || n.includes("hbo") || n.includes("warner")) return buildThemeFromRgb(0, 43, 231);
    if (n.includes("canal") || n.includes("c+")) return buildThemeFromRgb(255, 230, 0);
    if (n.includes("apple")) return buildThemeFromRgb(56, 189, 248);
    if (n.includes("paramount")) return buildThemeFromRgb(0, 100, 255);
    if (n.includes("bein")) return buildThemeFromRgb(192, 38, 211);
    if (n.includes("dazn")) return buildThemeFromRgb(226, 255, 0);
    if (n.includes("starzplay") || n.includes("starz")) return buildThemeFromRgb(249, 115, 22);
    if (n.includes("osn")) return buildThemeFromRgb(239, 68, 68);
    if (n.includes("stc")) return buildThemeFromRgb(79, 70, 229);
    if (n.includes("rotana")) return buildThemeFromRgb(34, 197, 94);
    if (n.includes("documentaire") || n.includes("discovery") || n.includes("nature")) return buildThemeFromRgb(255, 204, 0);
    if (n.includes("caribbean") || n.includes("caraibe") || n.includes("antilles") || n.includes("tropical")) return buildThemeFromRgb(0, 180, 216);
    if (n.includes("musique") || n.includes("music")) return buildThemeFromRgb(236, 72, 153);
    if (n.includes("cinema") || n.includes("film") || n.includes("movie")) return buildThemeFromRgb(239, 68, 68);
    if (n.includes("info") || n.includes("news")) return buildThemeFromRgb(14, 165, 233);
    if (n.includes("sport")) return buildThemeFromRgb(16, 185, 129);
    if (n.includes("eurosport") || n.includes("rmc") || n.includes("tf1")) return buildThemeFromRgb(2, 132, 199);

    // Clean neutral slate/cyan default
    return buildThemeFromRgb(56, 189, 248);
  }

  // Mixed-content safe HTTPS Image Proxy Helper for Mobile & Desktop
  function toProxiedImageUrl(url) {
    if (!url) return "";
    let clean = String(url).trim().replace(/^url\(["']?/, "").replace(/["']?\)$/, "");
    if (!clean) return "";

    // Unwrap nested /proxy?target=
    while (clean.includes("/proxy?target=") || clean.includes("/api/proxy?target=")) {
      try {
        const idx = clean.indexOf("target=");
        if (idx !== -1) {
          const rawTarget = clean.slice(idx + 7).split("&")[0];
          const decoded = decodeURIComponent(rawTarget);
          if (decoded && (decoded.startsWith("http://") || decoded.startsWith("https://") || decoded.startsWith("/"))) {
            clean = decoded;
            continue;
          }
        }
      } catch (_) {}
      break;
    }

    if (clean.startsWith("/proxy") || clean.startsWith("/api/proxy") || clean.startsWith("data:")) return clean;
    if (/^https?:\/\//i.test(clean)) {
      try {
        const u = new URL(clean, window.location.origin);
        if (u.origin === window.location.origin) return clean;
      } catch (e) {}
      return "/proxy?target=" + encodeURIComponent(clean) + "&from=" + encodeURIComponent(clean);
    }
    return clean;
  }

  // Color Extraction Canvas Cache & Darkness Detector
  const colorCache = new Map();
  const logoToneCache = new Map();

  function isCountryFlagUrl(url) {
    if (!url || typeof url !== "string") return false;
    const lower = String(url).toLowerCase();
    return lower.includes("flagcdn.com") || lower.includes("/flags/") || lower.includes("country_") || lower.includes("/logos/arabe.svg") || lower.includes("flag");
  }

  function detectImageToneFromCanvas(data) {
    let visiblePixels = 0;
    let totalLuminance = 0;
    let darkPixels = 0;
    let lightPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 25) continue; // Skip purely transparent background
      visiblePixels++;

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Perceived standard luminance (0-255)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLuminance += lum;

      if (lum < 135) darkPixels++;
      else if (lum > 170) lightPixels++;
    }

    if (visiblePixels < 4) return { tone: "neutral", isDark: false, isLight: false };

    const avgLum = totalLuminance / visiblePixels;
    const darkRatio = darkPixels / visiblePixels;
    // Sensitive detection: if average luminance < 140 or more than 35% pixels are dark
    const isDark = avgLum < 140 || darkRatio > 0.35;
    const isLight = avgLum > 175 || (lightPixels / visiblePixels) > 0.65;

    return {
      tone: isDark ? "dark" : (isLight ? "light" : "color"),
      isDark,
      isLight,
      avgLum
    };
  }

  // Global helper to analyze and apply dark logo contrast mode
  window.veloraDetectLogoDarkness = function(imgElement, container) {
    if (!imgElement) return;
    const src = imgElement.currentSrc || imgElement.src || "";
    if (!src) return;

    // NEVER put white background on country flags
    if (isCountryFlagUrl(src) || isCountryFlagUrl(decodeURIComponent(src))) {
      return;
    }

    const target = container || imgElement.closest(".vel-coverflow-card") || imgElement.closest(".media-item__thumb") || imgElement.parentElement;
    if (!target) return;

    const applyDark = () => {
      target.classList.add("vel-dark-logo-mode");
      const card = target.closest(".vel-coverflow-card");
      if (card) card.classList.add("vel-dark-logo-mode");
      const thumb = target.closest(".media-item__thumb");
      if (thumb) thumb.classList.add("vel-dark-logo-mode");
    };

    if (logoToneCache.has(src)) {
      if (logoToneCache.get(src) === "dark") {
        applyDark();
      }
      return;
    }

    const runAnalysis = (imageTarget) => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const size = 32;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(imageTarget, 0, 0, size, size);
        const imgData = ctx.getImageData(0, 0, size, size).data;
        const result = detectImageToneFromCanvas(imgData);

        logoToneCache.set(src, result.tone);
        if (result.isDark) {
          applyDark();
        }
      } catch (_) {
        // If tainted canvas due to cross-origin, retry through image proxy
        if (!src.startsWith("/proxy") && !src.startsWith("/api/proxy")) {
          const proxied = new Image();
          proxied.crossOrigin = "anonymous";
          proxied.onload = () => {
            try {
              const canvas = document.createElement("canvas");
              const ctx = canvas.getContext("2d", { willReadFrequently: true });
              canvas.width = 32;
              canvas.height = 32;
              ctx.drawImage(proxied, 0, 0, 32, 32);
              const imgData = ctx.getImageData(0, 0, 32, 32).data;
              const result = detectImageToneFromCanvas(imgData);
              logoToneCache.set(src, result.tone);
              if (result.isDark) applyDark();
            } catch (e) {
              logoToneCache.set(src, "unknown");
            }
          };
          proxied.src = toProxiedImageUrl(src);
        } else {
          logoToneCache.set(src, "unknown");
        }
      }
    };

    if (imgElement.complete && imgElement.naturalWidth > 0) {
      runAnalysis(imgElement);
    } else {
      imgElement.addEventListener("load", () => runAnalysis(imgElement), { once: true });
    }
  };

  function extractColorFromImage(imageUrl, callback) {
    if (!imageUrl) return;
    if (colorCache.has(imageUrl)) {
      callback(colorCache.get(imageUrl));
      return;
    }

    const proxiedUrl = toProxiedImageUrl(imageUrl);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = proxiedUrl;

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        canvas.width = 40;
        canvas.height = 40;
        ctx.drawImage(img, 0, 0, 40, 40);
        const data = ctx.getImageData(0, 0, 40, 40).data;

        const toneResult = detectImageToneFromCanvas(data);
        logoToneCache.set(imageUrl, toneResult.tone);
        if (proxiedUrl !== imageUrl) logoToneCache.set(proxiedUrl, toneResult.tone);

        let visiblePixels = 0;
        let chromaticPixels = 0;
        let bestColor = null;
        let highestScore = -1;
        const bins = {};

        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 70) continue;
          visiblePixels++;

          const r = data[i], g = data[i + 1], b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const chroma = max - min;
          const brightness = (r + g + b) / 3;

          if (chroma < 30 || brightness < 28 || brightness > 235) continue;

          chromaticPixels++;
          const score = chroma * 2 + (brightness > 60 && brightness < 190 ? 40 : 0);
          const qKey = `${Math.round(r / 25) * 25},${Math.round(g / 25) * 25},${Math.round(b / 25) * 25}`;
          if (!bins[qKey]) {
            bins[qKey] = { rSum: 0, gSum: 0, bSum: 0, count: 0, score: 0 };
          }
          bins[qKey].rSum += r;
          bins[qKey].gSum += g;
          bins[qKey].bSum += b;
          bins[qKey].count++;
          bins[qKey].score += score;
        }

        for (const key in bins) {
          const bin = bins[key];
          const totalScore = bin.score * Math.sqrt(bin.count);
          if (totalScore > highestScore) {
            highestScore = totalScore;
            bestColor = {
              r: Math.round(bin.rSum / bin.count),
              g: Math.round(bin.gSum / bin.count),
              b: Math.round(bin.bSum / bin.count)
            };
          }
        }

        let theme;
        if (bestColor && chromaticPixels >= 10) {
          // Color in logo -> chromatic theme & effect
          theme = buildThemeFromRgb(bestColor.r, bestColor.g, bestColor.b);
        } else if (toneResult.isDark) {
          // Black logo -> exact pure Black theme & effect around the wheel
          theme = buildThemeFromRgb(10, 10, 15);
        } else if (toneResult.isLight) {
          // White logo -> White glow theme
          theme = buildThemeFromRgb(240, 240, 250);
        } else {
          theme = buildThemeFromRgb(56, 189, 248);
        }

        theme.isDarkLogo = toneResult.isDark;
        colorCache.set(imageUrl, theme);
        callback(theme);
      } catch (_) {}
    };
  }

  const COUNTRY_FLAG_MAP = {
    afghanistan: 'af', afrique_du_sud: 'za', albanie: 'al', algerie: 'dz', allemagne: 'de',
    angleterre: 'gb', arabie_saoudite: 'sa', argentine: 'ar', armenie: 'am', australie: 'au',
    autriche: 'at', azerbaidjan: 'az', bahrein: 'bh', bangladesh: 'bd', belgique: 'be',
    bielorussie: 'by', bolivie: 'bo', bosnie: 'ba', bosnie_herzegovine: 'ba', bresil: 'br',
    bulgarie: 'bg', cameroun: 'cm', canada: 'ca', chili: 'cl', chine: 'cn', chypre: 'cy',
    colombie: 'co', congo: 'cg', coree: 'kr', coree_du_sud: 'kr', costa_rica: 'cr',
    cote_d_ivoire: 'ci', croatie: 'hr', cuba: 'cu', danemark: 'dk', egypte: 'eg',
    emirats_arabes_unis: 'ae', uae: 'ae', equateur: 'ec', espagne: 'es', estonie: 'ee',
    etats_unis: 'us', usa: 'us', finlande: 'fi', france: 'fr', georgie: 'ge', ghana: 'gh',
    grece: 'gr', guatemala: 'gt', haiti: 'ht', honduras: 'hn', hongrie: 'hu', inde: 'in',
    indonesie: 'id', irak: 'iq', iran: 'ir', irlande: 'ie', islande: 'is', israel: 'il',
    italie: 'it', jamaique: 'jm', japon: 'jp', jordanie: 'jo', kazakhstan: 'kz', kenya: 'ke',
    koweit: 'kw', lettonie: 'lv', liban: 'lb', libye: 'ly', lituanie: 'lt', luxembourg: 'lu',
    macedoine: 'mk', madagascar: 'mg', malaisie: 'my', mali: 'ml', malte: 'mt', maroc: 'ma',
    maurice: 'mu', mauritanie: 'mr', mexique: 'mx', moldavie: 'md', monaco: 'mc',
    montenegro: 'me', mozambique: 'mz', namibie: 'na', nepal: 'np', nicaragua: 'ni',
    nigeria: 'ng', norvege: 'no', nouvelle_zelande: 'nz', oman: 'om', pakistan: 'pk',
    palestine: 'ps', panama: 'pa', paraguay: 'py', pays_bas: 'nl', perou: 'pe',
    philippines: 'ph', pologne: 'pl', porto_rico: 'pr', portugal: 'pt', qatar: 'qa',
    republique_dominicaine: 'do', republique_tcheque: 'cz', roumanie: 'ro', royaume_uni: 'gb',
    uk: 'gb', russie: 'ru', salvador: 'sv', senegal: 'sn', serbie: 'rs', slovaquie: 'sk',
    slovenie: 'si', somalie: 'so', soudan: 'sd', sri_lanka: 'lk', suede: 'se', suisse: 'ch',
    suriname: 'sr', syrie: 'sy', taiwan: 'tw', thailande: 'th', tunisie: 'tn', turquie: 'tr',
    ukraine: 'ua', uruguay: 'uy', venezuela: 've', vietnam: 'vn', yemen: 'ye'
  };

  function isOfficialLogosOnlyActive() {
    try { return localStorage.getItem("velora_official_logos_only") === "1"; } catch (_) { return false; }
  }

  function isOfficialLogoUrl(url) {
    if (!url || typeof url !== "string") return false;
    let trimmed = url.trim();
    if (!trimmed) return false;
    while (trimmed.includes("/proxy?target=") || trimmed.includes("/api/proxy?target=")) {
      try {
        const idx = trimmed.indexOf("target=");
        if (idx !== -1) {
          const raw = trimmed.slice(idx + 7).split("&")[0];
          const decoded = decodeURIComponent(raw);
          if (decoded && (decoded.startsWith("http://") || decoded.startsWith("https://") || decoded.startsWith("/"))) {
            trimmed = decoded;
            continue;
          }
        }
      } catch (_) {}
      break;
    }
    if (trimmed.startsWith("data:image/") || trimmed.startsWith("/uploads/") || trimmed.startsWith("/logos/")) return true;
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.toLowerCase();
      return (
        host.includes("iptv-org.github.io") ||
        host.includes("raw.githubusercontent.com") ||
        host.includes("github.io") ||
        host.includes("wikimedia.org") ||
        host.includes("wikipedia.org") ||
        host.includes("wikidata.org") ||
        host.includes("imgur.com") ||
        host.includes("flagcdn.com") ||
        host.includes("themoviedb.org") ||
        host.includes("tmdb.org") ||
        host.includes("thetvdb.com") ||
        host.includes("freebox.cdn.scw.iliad.fr") ||
        host.includes("cloudfront.net")
      );
    } catch {
      return false;
    }
  }

  function getCountryFlagUrl(countryId, countryName = '') {
    const raw = String(countryName || countryId || '').replace(/^country_/, '');
    const k = raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (k === 'arabe') return '/logos/arabe.svg';
    const code = COUNTRY_FLAG_MAP[k];
    if (code) return `https://flagcdn.com/w160/${code}.png`;
    return '';
  }

  function isCountryFlagUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return url.includes('flagcdn.com') || url.includes('/flags/') || url.includes('country_') || url.includes('/logos/arabe.svg');
  }

  const COMMON_BRAND_LOGOS = [
    // Big Streaming & TV Brands
    { match: /canal\s*\+|c\+/i, logo: 'https://i.imgur.com/5HcyMnW.png' },
    { match: /bein\s*sport/i, logo: 'https://i.imgur.com/8Qh1mR4.png' },
    { match: /dazn/i, logo: 'https://i.imgur.com/2Z2EmZF.png' },
    { match: /rmc\s*sport/i, logo: 'https://i.imgur.com/dK3mK3k.png' },
    { match: /eurosport/i, logo: 'https://i.imgur.com/k6wMh1r.png' },
    { match: /prime\s*video|amazon\s*ligue|prime\s*ligue/i, logo: 'https://i.imgur.com/5zN2fP8.png' },
    { match: /shahid/i, logo: 'https://i.imgur.com/h5fEZy9.png' },
    { match: /rotana/i, logo: 'https://i.imgur.com/0iH1VzY.png' },
    { match: /osn/i, logo: 'https://i.imgur.com/y8W6O5q.png' },
    { match: /netflix/i, logo: 'https://i.imgur.com/rG7bV4Z.png' },
    { match: /disney/i, logo: 'https://i.imgur.com/K3yZ0V8.png' },
    { match: /hbo|max\b/i, logo: 'https://i.imgur.com/yG1r0nN.png' },
    { match: /apple\s*tv/i, logo: 'https://i.imgur.com/6U4t9oM.png' },
    { match: /paramount/i, logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Paramount_Plus.svg/800px-Paramount_Plus.svg.png' },
    { match: /sky\s*sport|sky\s*cinema|sky\s*show/i, logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Sky_Sports_logo_2020.svg/800px-Sky_Sports_logo_2020.svg.png' },
    { match: /ligue\s*1|ligue1/i, logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Ligue_1_McDonald%27s_logo.svg/800px-Ligue_1_McDonald%27s_logo.svg.png' },
    { match: /roland\s*garros/i, logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Roland-Garros_logo.svg/800px-Roland-Garros_logo.svg.png' },
    { match: /l\'?equipe/i, logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/L%27%C3%89quipe_2015_logo.svg/800px-L%27%C3%89quipe_2015_logo.svg.png' },

    // Universal IPTV Categories & Thematics
    { match: /documentaire|documentaires|docu|discovery|science|nature|animaux|geographie|history|histoire|planete/i, logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/National_Geographic_logo.svg/800px-National_Geographic_logo.svg.png' },
    { match: /caribbean|caraibe|caraibes|antilles|tropical|dom\s*tom|guadeloupe|martinique|guyane|reunion|haiti/i, logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Trace_Tropical_logo.svg/800px-Trace_Tropical_logo.svg.png' },
    { match: /musique|music|hits|clips|radio|mtv|chanson/i, logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/MTV_Music_Logo.svg/800px-MTV_Music_Logo.svg.png' },
    { match: /jeunesse|kids|enfant|enfants|cartoon|cartoons|animation|anime|manga|gulli|nickelodeon|junior|baby/i, logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/2022_Disney_Channel_logo.svg/800px-2022_Disney_Channel_logo.svg.png' },
    { match: /cinema|cinemas|cine|film|films|movie|movies|action|box\s*office|blockbuster/i, logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Canal%2B_Cinema_2023.svg/800px-Canal%2B_Cinema_2023.svg.png' },
    { match: /information|infos|info|news|actualite|actualites|24\/7|bfm|cnews|lci/i, logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Euronews_2016_logo.svg/800px-Euronews_2016_logo.svg.png' },
    { match: /sport|sports|football|foot|soccer|champions|arena|combat|mma|ufc/i, logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/BeIN_Sports_logo.svg/800px-BeIN_Sports_logo.svg.png' },
    { match: /general|generaliste|generalistes|nationaux|tnt|direct|principales|national/i, logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/TF1_logo_2013.svg/800px-TF1_logo_2013.svg.png' },
    { match: /divertissement|entertainment|spectacle|show|humour|comedy/i, logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/M6_logo_2020.svg/800px-M6_logo_2020.svg.png' },
    { match: /serie|series|feuilleton|drama/i, logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Netflix_2015_logo.svg/800px-Netflix_2015_logo.svg.png' },
    { match: /region|regionales|locales|terroir|france3|regions/i, logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/France_3_logo_2018.svg/800px-France_3_logo_2018.svg.png' },
    { match: /afrique|africa|africaines|africain/i, logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Canal%2B_Pop_logo.svg/800px-Canal%2B_Pop_logo.svg.png' },
    { match: /arabe|arabic|maghreb|oriental|arab/i, logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/MBC_1_logo_2012.svg/800px-MBC_1_logo_2012.svg.png' }
  ];

  function getBrandLogoForName(name = '') {
    const n = String(name || '');
    const cleaned = typeof cleanChannelTitle === 'function' ? cleanChannelTitle(n) : n;
    for (const b of COMMON_BRAND_LOGOS) {
      if (b.match.test(n) || (cleaned && b.match.test(cleaned))) return b.logo;
    }
    return '';
  }

  // Active country resolution
  function getActiveCountryId() {
    if (typeof window.veloraGetActiveCountryId === "function") {
      const c = window.veloraGetActiveCountryId();
      if (c) return c;
    }
    const select = document.getElementById("country-select") || document.getElementById("home-country-select");
    if (select && select.value) return select.value;
    return "country_france";
  }

  // Parse package ID coordinates
  function parseCoordinates(pkg) {
    let sourceId = pkg.source_id || 1;
    let categoryId = pkg.category_id || pkg.id;
    const raw = String(pkg.id || "").trim();

    if (raw.includes(":")) {
      const parts = raw.split(":");
      if (parts.length >= 3) {
        sourceId = parseInt(parts[0], 10) || sourceId;
        categoryId = parts[2];
      } else if (parts.length === 2) {
        sourceId = parseInt(parts[0], 10) || sourceId;
        categoryId = parts[1];
      }
    }
    return { sourceId, categoryId };
  }

  // Fetch streams for a specific package ID (with VPS parent/child expansion support)
  async function fetchLiveStreamsForPkg(pkg) {
    const countryId = getActiveCountryId();
    const pkgId = String(pkg.id || "").trim();

    // 1. Preferred backend endpoint: loads curated channels and expands parent bouquets into all children!
    if (pkgId) {
      try {
        const url = `/api/velora-db/admin/package-live-channels?countryId=${encodeURIComponent(countryId)}&packageId=${encodeURIComponent(pkgId)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.channels) && data.channels.length > 0) {
            return data.channels;
          }
        }
      } catch (_) {}
    }

    // 2. Direct Xtream API category fetch fallback (for uncurated raw packages)
    const { sourceId, categoryId } = parseCoordinates(pkg);
    const endpoints = [
      `/api/proxy/xtream/${encodeURIComponent(sourceId)}/live_streams?category_id=${encodeURIComponent(categoryId)}`,
      `/api/proxy/xtream/all/live_streams?category_id=${encodeURIComponent(categoryId)}`
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) return data;
          if (data && Array.isArray(data.streams) && data.streams.length > 0) return data.streams;
          if (data && Array.isArray(data.items) && data.items.length > 0) return data.items;
        }
      } catch (_) {}
    }
    return [];
  }

  // Channel Name Filter & Cleaner Rules
  let cachedHiddenFilters = ["hevc", "h265", "h.265", "h 265", "x265", "###"];
  let cachedPrefixes = [];

  async function loadAdminChannelRules() {
    try {
      const [resF, resP] = await Promise.all([
        fetch("/api/velora-db/rest/v1/admin_hidden_filters?select=needle&order=needle.asc"),
        fetch("/api/velora-db/rest/v1/admin_channel_name_prefixes?select=prefix,sort_order&order=sort_order.asc")
      ]);
      if (resF.ok) {
        const rows = await resF.json();
        if (Array.isArray(rows)) {
          cachedHiddenFilters = [
            "hevc", "h265", "h.265", "h 265", "x265", "###",
            ...rows.map(r => String(r.needle || "").trim().toLowerCase()).filter(Boolean)
          ];
        }
      }
      if (resP.ok) {
        const pRows = await resP.json();
        if (Array.isArray(pRows)) {
          cachedPrefixes = pRows.map(r => String(r.prefix || "").trim()).filter(Boolean)
            .sort((a, b) => b.length - a.length);
        }
      }
    } catch (_) {}
  }

  function isDummyOrHiddenChannel(rawName) {
    const raw = String(rawName || "").trim();
    if (!raw) return true;

    const lower = raw.normalize("NFKC").toLowerCase();

    // 1. Any channel containing 3 or more hashes '#' is a category separator banner
    if ((raw.match(/#/g) || []).length >= 3) return true;

    // 2. Decorative separator banner patterns (e.g. --- ... --- or === ... === or *** ... ***)
    if (/^[-=*~_]{3,}.*[-=*~_]{3,}$/.test(raw)) return true;

    // 3. Admin hidden filters and suffixes/prefixes
    for (const filter of cachedHiddenFilters) {
      if (!filter) continue;
      if (filter.startsWith("suffix:")) {
        const suffix = filter.slice(7).trim();
        if (suffix && (lower.endsWith(suffix) || lower.includes(suffix))) return true;
      } else if (filter.startsWith("prefix:")) {
        const prefix = filter.slice(7).trim();
        if (prefix && (lower.startsWith(prefix) || lower.includes(prefix))) return true;
      } else {
        if (lower.includes(filter)) return true;
      }
    }

    return false;
  }

  function cleanChannelTitle(rawName) {
    let name = String(rawName || "").trim();
    for (let pass = 0; pass < 32; pass++) {
      const prefix = cachedPrefixes.find(p => p.length <= name.length && name.slice(0, p.length).toLowerCase() === p.toLowerCase());
      if (prefix) {
        name = name.slice(prefix.length).trim();
        continue;
      }
      const codeMatch = /^(\|[A-Za-z0-9]{2,4}\|\s*|\[[A-Za-z0-9]{2,4}\]\s*|[A-Za-z]{2,3}\s*:\s*|[A-Za-z]{2,3}\s*[-–]\s*)/i.exec(name);
      if (codeMatch && codeMatch[0]) {
        name = name.slice(codeMatch[0].length).trim();
        continue;
      }
      break;
    }
    return name || rawName;
  }

  class LiveWheelEngine {
    constructor() {
      this.wrapper = null;
      this.stage = null;
      this.pointer = null;

      this.packages = [];
      this.childPackagesMap = new Map();
      this.cachedApiPackages = [];
      
      // Main Wheel State
      this.currentIndex = 0;
      this.animatedIndex = 0;
      this.settledPackageIndex = -1;
      this.isDragging = false;
      this.isSpinning = false;
      this.animFrameId = null;
      this.activePointerId = null;
      this.startX = 0;
      this.startY = 0;
      this.downTarget = null;
      this.dragStartIndex = 0;
      this.dragStartTime = 0;
      this.hasDragMoved = false;

      // Channels State
      this.allChannels = [];
      this.filteredChannels = [];
      this.renderedCount = 0;
      this.pageSize = 15;
      this.currentPlayingStreamId = null;
      this.currentLoadedPkgId = "";
      this.isLoadingChannels = false;
      this.hasLoadedInitialLiveChannel = false;

      this.currentTheme = null;
      this.activeRgb = { r: 56, g: 189, b: 248 };
      this.lastThemedIndex = -1;
      this.colorAnimFrameId = null;
      this.init();
    }

    async init() {
      // Hook veloraDescribeFavoriteCard for custom live wheel rows
      const originalDescribe = window.veloraDescribeFavoriteCard;
      window.veloraDescribeFavoriteCard = (card) => {
        if (card && card.classList.contains("vel-media-item-row")) {
          const sId = card.dataset.streamId;
          if (sId) {
            const btn = card.querySelector(".media-item__main");
            const img = card.querySelector("img");
            return {
              sourceId: String(card.dataset.favoriteSourceId || "1"),
              itemId: String(sId),
              itemType: "channel",
              name: btn ? (btn.getAttribute("aria-label") || "") : "",
              thumbUrl: img ? (img.getAttribute("src") || "") : "",
              packageId: String(card.dataset.favoritePackageId || "")
            };
          }
        }
        return typeof originalDescribe === "function" ? originalDescribe(card) : null;
      };

      this.createDom();
      this.bindEvents();
      this.observeState();
      this.setupInfiniteScroll();
      await Promise.all([this.loadCatalogCache(), loadAdminChannelRules()]);
      this.checkVisibility();
    }

    createDom() {
      const existing = document.getElementById("vel-live-wheel-root");
      if (existing) existing.remove();

      const root = document.createElement("div");
      root.id = "vel-live-wheel-root";
      root.className = "vel-casino-wheel-wrapper";
      root.innerHTML = `
        <div class="vel-wheel-arena">
          <div class="vel-wheel-ambient-glow" aria-hidden="true"></div>
          <div class="vel-wheel-pointer" aria-hidden="true">
            <div class="vel-wheel-pointer__pivot"></div>
            <div class="vel-wheel-pointer__needle">
              <svg class="vel-wheel-pointer__svg" viewBox="0 0 16 22" fill="none">
                <path d="M8 21.5L1.5 8.5C0.5 6.2 2 3.5 4.5 3.5H11.5C14 3.5 15.5 6.2 14.5 8.5L8 21.5Z" fill="url(#needleGrad)" stroke="var(--theme-primary, #c084fc)" stroke-width="1.2"/>
                <circle cx="8" cy="7" r="2.2" fill="var(--theme-primary, #c084fc)"/>
                <defs>
                  <linearGradient id="needleGrad" x1="8" y1="3.5" x2="8" y2="21.5" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#ffffff"/>
                    <stop offset="0.6" stop-color="var(--theme-primary, #c084fc)"/>
                    <stop offset="1" stop-color="var(--theme-primary, #c084fc)"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>
          <div class="vel-coverflow-stage" tabindex="0" role="region" aria-label="Carrousel bouquets TV"></div>
          <div class="vel-wheel-selected-badge" id="vel-wheel-selected-badge">
            <span class="vel-wheel-selected-badge__spark">✦</span>
            <span class="vel-wheel-selected-badge__title" id="vel-wheel-selected-title"></span>
          </div>
        </div>
      `;

      this.wrapper = root;
      this.stage = root.querySelector(".vel-coverflow-stage");
      this.pointer = root.querySelector(".vel-wheel-pointer");
      this.searchBarWrap = null;
      this.searchInput = null;
      this.searchClearBtn = null;
      this.searchCountEl = null;

      const stickyTop = document.querySelector(".vel-sticky-top");
      if (stickyTop) {
        stickyTop.appendChild(root);
      } else {
        const packagesView = document.getElementById("packages-view");
        if (packagesView && packagesView.parentNode) {
          packagesView.parentNode.insertBefore(root, packagesView);
        }
      }
    }

    bindEvents() {
      // Pointer Drag & Inertia for Big Wheel
      this.stage.addEventListener("pointerdown", (e) => this.onPointerDown(e));
      this.stage.addEventListener("pointermove", (e) => this.onPointerMove(e));
      this.stage.addEventListener("pointerup", (e) => this.onPointerUp(e));
      this.stage.addEventListener("pointercancel", (e) => this.onPointerCancel(e));

      // Click card to select
      this.stage.addEventListener("click", (e) => {
        const card = e.target.closest(".vel-coverflow-card[data-index]");
        if (!card) return;
        const idx = parseInt(card.dataset.index, 10);
        if (!isNaN(idx) && idx !== this.currentIndex && !this.isDragging) {
          this.smoothAnimateToIndex(idx, 320);
        }
      });

      // Mouse Wheel Scroll
      this.stage.addEventListener("wheel", (e) => {
        e.preventDefault();
        if (this.isSpinning || this.packages.length === 0) return;
        const delta = Math.sign(e.deltaY || e.deltaX);
        const total = this.packages.length;
        const target = ((this.currentIndex + delta) % total + total) % total;
        this.smoothAnimateToIndex(target, 280);
      }, { passive: false });

      // Keyboard navigation
      window.addEventListener("keydown", (e) => {
        if (!this.isLiveActive() || this.packages.length === 0) return;
        if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) return;

        if (e.key === "ArrowLeft") {
          const total = this.packages.length;
          const target = ((this.currentIndex - 1) % total + total) % total;
          this.smoothAnimateToIndex(target, 280);
        } else if (e.key === "ArrowRight") {
          const total = this.packages.length;
          const target = ((this.currentIndex + 1) % total + total) % total;
          this.smoothAnimateToIndex(target, 280);
        }
      });

      // Navigation & admin rule update events
      document.addEventListener("velora-channel-suffixes-changed", async () => {
        await loadAdminChannelRules();
        this.allChannels = this.allChannels.filter(ch => !isDummyOrHiddenChannel(ch.name));
        this.filterAndRenderChannels();
      });
      document.addEventListener("velora-channel-prefixes-changed", async () => {
        await loadAdminChannelRules();
        this.allChannels.forEach(ch => { ch.name = cleanChannelTitle(ch.name); });
        this.filterAndRenderChannels();
      });

      document.addEventListener("velora-top-level-tab", () => this.checkVisibility());
      document.addEventListener("velora-show-home", () => this.checkVisibility());
      document.addEventListener("velora-home-country-rendered", () => {
        this.hasLoadedInitialLiveChannel = false;
        this.settledPackageIndex = -1;
        this.checkVisibility();
      });
      document.addEventListener("velora-country-changed", async () => {
        this.hasLoadedInitialLiveChannel = false;
        this.settledPackageIndex = -1;
        this.currentIndex = 0;
        this.animatedIndex = 0;
        await this.loadCatalogCache();
        this.checkVisibility();
        this.refreshPackages();
      });
      window.addEventListener("popstate", () => this.checkVisibility());
      window.addEventListener("velora-package-covers-updated", () => {
        this.refreshPackageCovers();
      });
      window.addEventListener("velora-official-logos-toggled", () => {
        this.refreshPackageCovers();
        this.refreshPackages();
        this.renderMainCards();
        this.updateCenterDetails();
      });
    }

    resolvePackageCover(pkg) {
      if (!pkg) return "";
      const officialOnly = isOfficialLogosOnlyActive();
      const countryId = getActiveCountryId();
      const select = document.getElementById("country-select") || document.getElementById("home-country-select");
      const countryName = (select?.options?.[select?.selectedIndex]?.text || "").replace(/^[^a-zA-ZÀ-ÿ]+/, "").trim();

      const cleanName = cleanChannelTitle(pkg.name || pkg.display_name || "");
      let savedLogo = window.__veloraCustomPackageLogos?.[pkg.id]
        || window.__veloraCustomPackageLogos?.[pkg.category_id]
        || window.__veloraCustomPackageLogos?.[pkg.name]
        || window.__veloraCustomPackageLogos?.[pkg.display_name]
        || window.__veloraCustomPackageLogos?.[cleanName]
        || (function () {
          try {
            const l = JSON.parse(localStorage.getItem("velora_package_covers") || "{}");
            return l[pkg.id] || l[pkg.category_id] || l[pkg.name] || l[pkg.display_name] || l[cleanName] || "";
          } catch (_) { return ""; }
        })();

      // Never use country flags from savedLogo
      if (savedLogo && isCountryFlagUrl(savedLogo)) {
        savedLogo = "";
      }

      let candidate = (savedLogo && !isCountryFlagUrl(savedLogo)) ? savedLogo : "";
      if (!candidate && pkg.cover_url && !isCountryFlagUrl(pkg.cover_url)) {
        candidate = pkg.cover_url;
      }

      // Reject TMDB movie posters
      if (candidate.includes("image.tmdb.org") || candidate.includes("tmdb.org") || candidate.includes("/w600_and_h900_bestv2/") || candidate.includes("/w500/") || candidate.includes("/w300/")) {
        candidate = "";
      }

      // If officialOnly is ON, reject non-official provider URLs
      if (officialOnly && candidate && !isOfficialLogoUrl(candidate)) {
        candidate = "";
      }

      // If no candidate OR candidate is just a country flag fallback, prioritize brand match
      if (!candidate || isCountryFlagUrl(candidate)) {
        const brandMatch = getBrandLogoForName(pkg.name || pkg.display_name) || getBrandLogoForName(cleanName);
        if (brandMatch) {
          candidate = brandMatch;
        }
      }

      // Fallback: If still no image, use the country logo / flag!
      if (!candidate) {
        candidate = getCountryFlagUrl(countryId, countryName);
      }

      return candidate ? toProxiedImageUrl(candidate) : "";
    }

    refreshPackageCovers() {
      let updated = false;
      for (const pkg of this.packages) {
        const cover = this.resolvePackageCover(pkg);
        if (cover !== pkg.cover_url) {
          pkg.cover_url = cover;
          updated = true;
          if (!pkg._cachedTheme && pkg.cover_url) {
            extractColorFromImage(pkg.cover_url, (t) => { pkg._cachedTheme = t; });
          }
        }
      }
      if (updated || this.packages.length > 0) {
        this.renderMainCards();
        this.updateCenterDetails();
      }
    }

    autoScrollUp() {
      if (!this.isLiveActive()) return;
      const dynamicList = document.getElementById("dynamic-list");
      if (dynamicList) {
        try {
          dynamicList.scrollTo({ top: 0, behavior: "smooth" });
        } catch (_) {
          dynamicList.scrollTop = 0;
        }
      }
    }

    setupInfiniteScroll() {
      // Manual pagination with "Afficher plus" button is used for Live channels as requested
    }

    isLiveActive() {
      const body = document.body;
      if (body.classList.contains("vel-home-empty-active")) return false;
      if (body.dataset.velTopLevel === "home") return false;
      if (body.dataset.veloraReturnFavorites || body.classList.contains("vel-favorites-open") || body.classList.contains("vel-favorites-player-active")) {
        return false;
      }
      if (body.dataset.velActiveTab === "favorites") return false;

      const homeEmptyPage = document.getElementById("vel-home-empty-page");
      if (homeEmptyPage && !homeEmptyPage.classList.contains("hidden") && homeEmptyPage.style.display !== "none") {
        return false;
      }

      const activeTab = String(body.dataset.velActiveTab || "").toLowerCase();
      const topLevel = String(body.dataset.velTopLevel || "").toLowerCase();

      return (activeTab === "live" || topLevel === "live") && !body.dataset.veloraReturnFavorites;
    }

    checkVisibility() {
      const isLive = this.isLiveActive();
      if (!isLive) {
        this.hasLoadedInitialLiveChannel = false;
      }
      const showWheel = isLive && this.packages.length >= 1;
      if (this.wrapper) {
        this.wrapper.style.display = showWheel ? "block" : "none";
      }

      // Keep player visible when on Live TV or playing favorite live channel
      const isFavoritesChannel = !!document.body.dataset.veloraReturnFavorites && document.body.dataset.veloraReturnFavorites === "channel";
      const playerContainer = document.getElementById("player-container");
      if (playerContainer && (isLive || isFavoritesChannel)) {
        playerContainer.classList.remove("hidden");
        playerContainer.setAttribute("aria-hidden", "false");
      }

      if (isLive) {
        this.refreshPackages();
      }
    }

    observeState() {
      // Observe body dataset and classes
      const bodyObserver = new MutationObserver(() => {
        this.checkVisibility();
      });
      bodyObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["data-vel-active-tab", "data-vel-top-level", "data-velora-return-favorites", "class"]
      });

      // Observe packages view
      const packagesView = document.getElementById("packages-view");
      if (packagesView) {
        const pkgObserver = new MutationObserver(() => {
          if (this.isLiveActive()) {
            this.refreshPackages();
          }
        });
        pkgObserver.observe(packagesView, { childList: true, subtree: false });
      }

      // Observe home page container
      const homePage = document.getElementById("vel-home-empty-page");
      if (homePage) {
        const homeObserver = new MutationObserver(() => {
          this.checkVisibility();
        });
        homeObserver.observe(homePage, { attributes: true, attributeFilter: ["class", "style"] });
      }
    }

    async loadCatalogCache() {
      try {
        const res = await fetch("/api/velora-db/country-package-cache");
        if (res.ok) {
          const data = await res.json();
          this.cachedApiPackages = data.packages || [];
        }
      } catch (_) {}
    }

    refreshPackages() {
      if (!this.isLiveActive()) return;

      const packagesView = document.getElementById("packages-view");
      if (!packagesView) return;

      const rawCards = [...packagesView.querySelectorAll(":scope > .vel-package-card[data-package-id]")];
      if (rawCards.length === 0 && this.cachedApiPackages.length === 0) return;

      const rawCardIds = rawCards.map(c => String(c.dataset.packageId || "")).join(",");
      const currentPkgIds = this.packages.map(p => String(p.id || "")).join(",");
      const packagesListChanged = rawCardIds !== currentPkgIds || this.packages.length === 0;

      if (packagesListChanged) {
        const list = [];
        const childMap = new Map();

        rawCards.forEach((card, i) => {
          const id = String(card.dataset.packageId || "");
          const titleEl = card.querySelector(".vel-package-card__title");
          const title = titleEl ? titleEl.textContent.trim() : card.getAttribute("aria-label") || `Bouquet ${i+1}`;
          const apiPkg = this.cachedApiPackages.find(p => String(p.id) === id);
          const catId = apiPkg?.category_id || card.dataset.categoryId || "";
          const savedLogo = window.__veloraCustomPackageLogos?.[id]
            || window.__veloraCustomPackageLogos?.[catId]
            || window.__veloraCustomPackageLogos?.[apiPkg?.name]
            || window.__veloraCustomPackageLogos?.[title]
            || (function () {
              try {
                const l = JSON.parse(localStorage.getItem("velora_package_covers") || "{}");
                return l[id] || l[catId] || l[apiPkg?.name] || l[title] || "";
              } catch (_) { return ""; }
            })();
          const imgEl = card.querySelector(":scope > img, .vel-package-card__live-logo");
          const rawCover = imgEl ? (imgEl.getAttribute("src") || "") : (apiPkg?.cover_url || savedLogo || "");
          const is_parent = card.classList.contains("vel-package-card--parent") || Boolean(apiPkg?.is_parent) || (Array.isArray(apiPkg?.child_package_ids) && apiPkg.child_package_ids.length > 0);
          const childIds = apiPkg?.child_package_ids || [];

          const tempPkg = {
            id,
            name: title,
            display_name: title,
            category_id: catId,
            cover_url: rawCover
          };
          const cover_url = this.resolvePackageCover(tempPkg);

          const pkgObj = {
            id,
            name: title,
            display_name: title,
            cover_url,
            is_parent,
            child_package_ids: childIds,
            originalCard: card,
            source_id: apiPkg?.source_id,
            category_id: apiPkg?.category_id || catId
          };
          list.push(pkgObj);

          // Build child packages list
          const children = [];
          if (childIds.length > 0) {
            childIds.forEach(cid => {
              const childApi = this.cachedApiPackages.find(p => String(p.id) === String(cid));
              if (childApi) {
                const childTemp = {
                  id: String(childApi.id),
                  name: childApi.name,
                  display_name: childApi.name,
                  category_id: childApi.category_id,
                  cover_url: childApi.cover_url || cover_url || ""
                };
                children.push({
                  id: String(childApi.id),
                  name: childApi.name,
                  display_name: childApi.name,
                  cover_url: this.resolvePackageCover(childTemp) || cover_url,
                  source_id: childApi.source_id,
                  category_id: childApi.category_id
                });
              }
            });
          }
          if (children.length > 0) {
            childMap.set(id, children);
          }
        });

        this.packages = list;
        this.childPackagesMap = childMap;

        // Pre-extract colors in background for instant fluid transitions
        this.packages.forEach(pkg => {
          if (pkg.cover_url && !pkg._cachedTheme) {
            extractColorFromImage(pkg.cover_url, (extractedTheme) => {
              pkg._cachedTheme = extractedTheme;
            });
          }
        });
      }

      const isLive = this.isLiveActive();
      const showWheel = isLive && this.packages.length >= 1;
      if (this.wrapper) {
        this.wrapper.style.display = showWheel ? "block" : "none";
      }

      if (this.packages.length > 0) {
        const targetIdx = (this.settledPackageIndex >= 0 && this.settledPackageIndex < this.packages.length)
          ? this.settledPackageIndex
          : 0;

        this.currentIndex = targetIdx;
        this.animatedIndex = targetIdx;
        this.settledPackageIndex = targetIdx;

        // Ensure content view is visible and packages view is hidden
        const contentView = document.getElementById("content-view");
        if (contentView) contentView.classList.remove("hidden");
        const packagesView = document.getElementById("packages-view");
        if (packagesView) packagesView.classList.add("hidden");

        const dynamicList = document.getElementById("dynamic-list");
        const isListEmpty = !dynamicList || dynamicList.children.length === 0;

        const isFirstOpen = !this.hasLoadedInitialLiveChannel;
        const currentPkg = this.packages[targetIdx];
        const needsLoad = isFirstOpen || this.allChannels.length === 0 || isListEmpty || (currentPkg && this.currentLoadedPkgId !== currentPkg.id);
        if (needsLoad) {
          this.hasLoadedInitialLiveChannel = true;
          this.currentLoadedPkgId = currentPkg ? currentPkg.id : "";
          this.onPackageSettled(currentPkg, { isInitialLoad: isFirstOpen, skipScroll: true });
        }
        if (packagesListChanged && this.packages.length >= 1) {
          this.renderMainCards();
        }
      } else {
        if (this.wrapper) {
          this.wrapper.style.display = "none";
        }
      }
    }

    triggerTick(direction = 1) {
      if (!this.pointer) return;
      const angle = direction >= 0 ? 18 : -18;
      this.pointer.style.transform = `translateX(-50%) rotate(${angle}deg) scale(1.15)`;
      if (this.tickTimeout) clearTimeout(this.tickTimeout);
      this.tickTimeout = setTimeout(() => {
        if (this.pointer) {
          this.pointer.style.transform = "translateX(-50%) rotate(0deg) scale(1)";
        }
      }, 90);
    }

    getPackageTheme(pkg) {
      if (!pkg) return buildThemeFromRgb(56, 189, 248);
      if (pkg._cachedTheme && typeof pkg._cachedTheme.r === "number") return pkg._cachedTheme;
      if (pkg.cover_url && colorCache.has(pkg.cover_url)) {
        const cached = colorCache.get(pkg.cover_url);
        if (cached && typeof cached.r === "number") {
          pkg._cachedTheme = cached;
          return pkg._cachedTheme;
        }
      }
      return getBrandThemeByName(pkg.name);
    }

    transitionToTheme(targetTheme, duration = 380) {
      if (!targetTheme || typeof targetTheme.r !== "number" || isNaN(targetTheme.r)) return;
      if (this.colorAnimFrameId) cancelAnimationFrame(this.colorAnimFrameId);

      if (!this.activeRgb) {
        this.activeRgb = { r: targetTheme.r, g: targetTheme.g, b: targetTheme.b };
        this.applyTheme(targetTheme);
        return;
      }

      const startR = this.activeRgb.r;
      const startG = this.activeRgb.g;
      const startB = this.activeRgb.b;

      const endR = targetTheme.r;
      const endG = targetTheme.g;
      const endB = targetTheme.b;

      if (Math.abs(startR - endR) < 2 && Math.abs(startG - endG) < 2 && Math.abs(startB - endB) < 2) {
        this.activeRgb = { r: endR, g: endG, b: endB };
        this.applyTheme(targetTheme);
        return;
      }

      const startTime = performance.now();

      const colorLoop = (now) => {
        const elapsed = now - startTime;
        const p = Math.min(1, elapsed / duration);
        // HTML5 smooth easeOutCubic curve
        const eased = 1 - Math.pow(1 - p, 3);

        const curR = startR + (endR - startR) * eased;
        const curG = startG + (endG - startG) * eased;
        const curB = startB + (endB - startB) * eased;

        this.activeRgb = { r: curR, g: curG, b: curB };
        this.applyTheme(buildThemeFromRgb(curR, curG, curB));

        if (p < 1) {
          this.colorAnimFrameId = requestAnimationFrame(colorLoop);
        } else {
          this.activeRgb = { r: endR, g: endG, b: endB };
          this.applyTheme(targetTheme);
        }
      };

      this.colorAnimFrameId = requestAnimationFrame(colorLoop);
    }

    applyTheme(theme) {
      if (!theme) return;
      this.currentTheme = theme;
      if (this.wrapper) {
        this.wrapper.style.setProperty("--theme-primary", theme.primary);
        this.wrapper.style.setProperty("--theme-glow", theme.glow);
        this.wrapper.style.setProperty("--theme-border", theme.border);
        this.wrapper.style.setProperty("--theme-arena-bg", theme.arenaBg);
        this.wrapper.style.setProperty("--theme-center-bg", theme.centerBg || theme.arenaBg);
        this.wrapper.style.setProperty("--theme-card-bg", theme.cardBg || "linear-gradient(145deg, rgba(20, 20, 26, 0.94), rgba(8, 8, 12, 0.96))");
      }

      const contentView = document.getElementById("content-view");
      if (contentView) {
        contentView.style.removeProperty("--theme-primary");
        contentView.style.removeProperty("--theme-border");
        contentView.style.removeProperty("--vel-primary");
        contentView.style.removeProperty("--vel-accent-glow");
        contentView.style.setProperty("--theme-glow", theme.glow);
      }

      if (document.body) {
        document.body.style.removeProperty("--theme-primary");
        document.body.style.removeProperty("--theme-border");
        document.body.style.removeProperty("--vel-primary");
        document.body.style.removeProperty("--vel-accent-glow");
        document.body.style.setProperty("--theme-glow", theme.glow);
      }
    }

    getSettledPackage() {
      if (this.packages.length === 0) return null;
      const total = this.packages.length;
      const idx = ((this.settledPackageIndex % total) + total) % total;
      return this.packages[idx] || this.packages[0];
    }

    async onPackageSettled(pkg, options = {}) {
      if (!pkg || !this.isLiveActive()) return;

      // Only auto-scroll when explicitly triggered by intentional user wheel interaction/swipe
      if ((options.isUserWheelInteraction === true || options.resetScroll === true) && !options.skipScroll) {
        this.autoScrollUp();
      }

      const badgeEl = document.getElementById("vel-wheel-selected-badge");
      const titleEl = document.getElementById("vel-wheel-selected-title");
      if (titleEl) {
        titleEl.textContent = pkg.display_name || pkg.name || "";
      }

      if (badgeEl) {
        badgeEl.classList.remove("is-shimmering", "is-animating");
        void badgeEl.offsetWidth; // trigger reflow
        badgeEl.classList.add("is-shimmering", "is-animating");
      }

      if (this.pointer) {
        this.pointer.classList.remove("is-settled-flare");
        void this.pointer.offsetWidth;
        this.pointer.classList.add("is-settled-flare");
      }

      // Extract color / apply theme with fluid HTML5 transition
      const brandTheme = this.getPackageTheme(pkg);
      this.transitionToTheme(brandTheme, 380);

      if (pkg.cover_url && !pkg._cachedTheme) {
        extractColorFromImage(pkg.cover_url, (extractedTheme) => {
          pkg._cachedTheme = extractedTheme;
          if (this.getSettledPackage()?.id === pkg.id) {
            this.transitionToTheme(extractedTheme, 360);
          }
        });
      }

      await this.loadPackageChannels(pkg, options);
    }

    async ensurePackageLogoFromChannels(pkg, channels) {
      if (!pkg) return;

      let currentCover = this.resolvePackageCover(pkg);
      if (!currentCover) {
        const countryId = getActiveCountryId();
        const select = document.getElementById("country-select") || document.getElementById("home-country-select");
        const countryName = (select?.options?.[select?.selectedIndex]?.text || "").replace(/^[^a-zA-ZÀ-ÿ]+/, "").trim();
        const rawLogo = getBrandLogoForName(pkg.name || pkg.display_name) || getCountryFlagUrl(countryId, countryName);

        if (rawLogo) {
          const proxiedLogo = toProxiedImageUrl(rawLogo);
          pkg.cover_url = proxiedLogo;

          extractColorFromImage(proxiedLogo, (extractedTheme) => {
            pkg._cachedTheme = extractedTheme;
            if (this.getSettledPackage()?.id === pkg.id) {
              this.transitionToTheme(extractedTheme, 360);
            }
          });

          if (this.packages.length >= 1) {
            this.renderMainCards();
          }
        }
      }
    }

    async loadPackageChannels(pkg, options = {}) {
      if (!this.isLiveActive() || !pkg) return;

      const dynamicList = document.getElementById("dynamic-list");
      if (dynamicList) {
        dynamicList.classList.add("vel-list-fading");
      }

      this.currentLoadReqId = (this.currentLoadReqId || 0) + 1;
      const reqId = this.currentLoadReqId;

      // Ensure content view is visible
      const contentView = document.getElementById("content-view");
      if (contentView) contentView.classList.remove("hidden");
      const packagesView = document.getElementById("packages-view");
      if (packagesView) packagesView.classList.add("hidden");

      // Fast path: Instant cached channels for buttery fluidity
      if (Array.isArray(pkg._cachedChannels) && pkg._cachedChannels.length > 0) {
        this.allChannels = pkg._cachedChannels;
        this.ensurePackageLogoFromChannels(pkg, pkg._cachedChannels);
        this.filterAndRenderChannels(options);
        return;
      }

      this.isLoadingChannels = true;

      // Only show skeleton if fetch takes longer than 130ms (prevents flicker)
      const skeletonTimer = setTimeout(() => {
        if (this.isLoadingChannels && reqId === this.currentLoadReqId) {
          this.showChannelLoadingSkeleton();
        }
      }, 130);

      try {
        let raw = await fetchLiveStreamsForPkg(pkg);

        // If it's a parent package and backend query returned empty, also fetch each child package in parallel
        const children = this.childPackagesMap.get(pkg.id) || [];
        if (pkg.is_parent && children.length > 0 && raw.length === 0) {
          const childPromises = children.map(child => fetchLiveStreamsForPkg(child));
          const childResults = await Promise.all(childPromises);
          raw = childResults.flat();
        }

        const seenIds = new Set();
        const filtered = [];

        raw.forEach(ch => {
          const rawTitle = String(ch.name || ch.title || "");
          if (isDummyOrHiddenChannel(rawTitle)) return;

          const sId = String(ch.raw_stream_id || ch.stream_id || ch.id || "");
          if (sId && !seenIds.has(sId)) {
            seenIds.add(sId);
            filtered.push({
              ...ch,
              stream_id: sId,
              raw_stream_id: sId,
              name: cleanChannelTitle(rawTitle),
              category_name: ch.category_name || pkg.name,
              package_id: ch.package_id || pkg.id,
              nodecast_source_id: ch.nodecast_source_id || ch.source_id || pkg.source_id || "1"
            });
          }
        });

        if (reqId !== this.currentLoadReqId) return;

        pkg._cachedChannels = filtered;
        this.allChannels = filtered;
        // 1. Render and display channels + start playback immediately for zero user perceived delay
        this.filterAndRenderChannels(options);

        // 2. Process package logo detection and background sync without blocking UI rendering
        setTimeout(() => {
          this.ensurePackageLogoFromChannels(pkg, filtered);
        }, 0);
      } catch (err) {
        console.error("Failed to load package channels", err);
      } finally {
        clearTimeout(skeletonTimer);
        this.isLoadingChannels = false;
      }
    }

    showChannelLoadingSkeleton() {
      const dynamicList = document.getElementById("dynamic-list");
      if (!dynamicList) return;

      let skeletonHtml = `
        <div class="item-list item-list--media-loading item-list--media-loading-live col-span-full">
          <div class="vel-channel-loader">
            <div class="vel-channel-skeleton-list">
      `;
      for (let i = 0; i < 6; i++) {
        skeletonHtml += `
          <div class="vel-channel-skeleton-row">
            <div class="vel-channel-skeleton-thumb"></div>
            <div class="vel-channel-skeleton-info">
              <div class="vel-channel-skeleton-line vel-channel-skeleton-line--title"></div>
              <div class="vel-channel-skeleton-line vel-channel-skeleton-line--sub"></div>
            </div>
          </div>
        `;
      }
      skeletonHtml += `
            </div>
          </div>
        </div>
      `;
      dynamicList.innerHTML = skeletonHtml;
    }

    filterAndRenderChannels(options = {}) {
      this.filteredChannels = this.allChannels;
      this.renderedCount = 0;
      const dynamicList = document.getElementById("dynamic-list");
      if (dynamicList) {
        dynamicList.classList.remove("item-list--vod-vertical", "item-list--vod-film-detail");
        dynamicList.classList.add("item-list--live");
        dynamicList.innerHTML = "";
      }

      this.renderNextBatch();

      if (dynamicList) {
        requestAnimationFrame(() => {
          dynamicList.classList.remove("vel-list-fading");
        });
      }

      if (options && options.isInitialLoad && this.filteredChannels.length > 0) {
        const first = this.filteredChannels[0];
        console.log("%c[Velora Live] 📺 Initial open - Preselecting & playing first channel:", "color: #38bdf8; font-weight: bold;", first);
        this.playChannel(first);
      }
    }

    renderNextBatch() {
      const dynamicList = document.getElementById("dynamic-list");
      if (!dynamicList) return;

      const total = this.filteredChannels.length;
      if (total === 0) {
        dynamicList.innerHTML = `<div class="col-span-full text-center py-10 text-xs text-slate-400">Aucune chaîne trouvée dans ce bouquet.</div>`;
        return;
      }

      // Remove existing "Afficher plus" button if already rendered
      const existingLoadMore = document.getElementById("vel-live-load-more-wrap");
      if (existingLoadMore) existingLoadMore.remove();

      const start = this.renderedCount;
      const nextBatch = this.filteredChannels.slice(start, start + this.pageSize);
      if (nextBatch.length === 0) return;

      const fragment = document.createDocumentFragment();

      nextBatch.forEach((ch, idx) => {
        const globalIdx = start + idx;
        const streamId = String(ch.stream_id || ch.id || "");
        const name = String(ch.name || ch.title || ch.stream_name || "Chaîne").trim() || "Chaîne";
        const pkgCoverRaw = this.activePackage ? this.resolvePackageCover(this.activePackage) : "";
        const pkgCover = (!isCountryFlagUrl(pkgCoverRaw)) ? pkgCoverRaw : "";
        let rawLogo = String(ch.stream_icon || ch.logo || ch.cover || "").trim();
        if (isCountryFlagUrl(rawLogo)) rawLogo = "";
        if (!rawLogo && pkgCover) rawLogo = pkgCover;
        const logo = rawLogo ? toProxiedImageUrl(rawLogo) : "";
        const isActive = this.currentPlayingStreamId === streamId;

        const row = document.createElement("div");
        row.className = `vel-media-item-row vel-channel-card-enter ${isActive ? "vel-media-item-row--active" : ""}`;
        row.dataset.streamId = streamId;
        if (globalIdx < 20) {
          row.style.animationDelay = `${Math.min(idx * 20, 260)}ms`;
        }

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `media-item media-item__main ${isActive ? "selected" : ""}`;
        btn.setAttribute("aria-label", name);

        const thumbWrap = document.createElement("div");
        thumbWrap.className = "media-item__thumb vel-image-loaded-host";

        const isAdultCh = !!(document.body.dataset.velActiveTab === "adult" || document.body.dataset.veloraReturnAdult === "true" || document.body.classList.contains("vel-adult-active") || (ch && (ch.isAdult || ch.is_adult || String(ch.category_name || "").toLowerCase().includes("adult") || String(ch.package_id || "").toLowerCase().includes("adult"))));

        if (logo && !isAdultCh) {
          const img = document.createElement("img");
          img.className = "vel-image-loaded vel-image-fade is-ready";
          img.loading = globalIdx < 16 ? "eager" : "lazy";
          img.decoding = "async";
          img.crossOrigin = "anonymous";
          img.src = logo;
          img.alt = "";

          // Auto-detect dark logo on transparent background (skip country flags)
          const isFlag = isCountryFlagUrl(logo) || isCountryFlagUrl(decodeURIComponent(logo || ""));
          if (!isFlag) {
            if (logoToneCache.get(logo) === "dark") {
              thumbWrap.classList.add("vel-dark-logo-mode");
            } else if (window.veloraDetectLogoDarkness) {
              window.veloraDetectLogoDarkness(img, thumbWrap);
            }
          }

          img.onerror = () => {
            if (!img.dataset.retried && rawLogo && !rawLogo.startsWith("/api/proxy") && !rawLogo.startsWith("/proxy")) {
              img.dataset.retried = "true";
              img.src = `/api/proxy/image?url=${encodeURIComponent(rawLogo)}`;
            } else if (pkgCover && !img.dataset.pkgCoverTried && pkgCover !== logo) {
              img.dataset.pkgCoverTried = "true";
              img.src = toProxiedImageUrl(pkgCover);
            } else {
              img.remove();
              thumbWrap.classList.remove("vel-dark-logo-mode");
              thumbWrap.classList.add("media-item__thumb--empty");
              thumbWrap.setAttribute("aria-hidden", "true");
              thumbWrap.textContent = "📺";
            }
          };
          thumbWrap.appendChild(img);
        } else {
          thumbWrap.classList.add("media-item__thumb--empty");
          thumbWrap.setAttribute("aria-hidden", "true");
          thumbWrap.textContent = "📺";
        }

        const infoWrap = document.createElement("div");
        infoWrap.className = "media-info";
        infoWrap.innerHTML = `
          <h4 title="${name}">${name}</h4>
          <span class="vel-channel-playing-badge ${isActive ? "" : "hidden"}">
            <span class="vel-live-eq-wave">
              <span class="vel-live-eq-bar"></span>
              <span class="vel-live-eq-bar"></span>
              <span class="vel-live-eq-bar"></span>
            </span>
            <span>EN DIRECT</span>
          </span>
        `;

        btn.appendChild(thumbWrap);
        btn.appendChild(infoWrap);

        btn.addEventListener("click", (e) => {
          e.preventDefault();
          console.log("%c[Velora Live] 🎯 Channel Clicked:", "background: #0284c7; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;", {
            name,
            streamId,
            categoryName: ch.category_name,
            packageId: ch.package_id,
            sourceId: ch.nodecast_source_id || ch.source_id,
            rawObject: ch
          });
          this.playChannel(ch);
        });

        row.appendChild(btn);

        // Attach Favorite Heart Button
        const heartDesc = {
          sourceId: String(ch.nodecast_source_id || ch.source_id || "1"),
          itemId: String(streamId),
          itemType: "channel",
          name: name,
          thumbUrl: logo,
          packageId: String(ch.package_id || ""),
          globalStreamId: String(ch.nodecast_global_stream_id || ch.global_stream_id || ""),
          containerExtension: String(ch.container_extension || "")
        };

        row.dataset.favoriteSourceId = heartDesc.sourceId;
        row.dataset.favoriteItemId = heartDesc.itemId;
        row.dataset.favoriteItemType = heartDesc.itemType;
        row.dataset.favoriteName = heartDesc.name;
        row.dataset.favoriteThumbUrl = heartDesc.thumbUrl;
        row.dataset.favoritePackageId = heartDesc.packageId;

        if (typeof window.veloraCreateFavoriteHeart === "function") {
          const heart = window.veloraCreateFavoriteHeart(heartDesc);
          if (heart) row.appendChild(heart);
        }

        fragment.appendChild(row);
      });

      dynamicList.appendChild(fragment);
      this.renderedCount += nextBatch.length;

      // If more channels exist, show "Afficher plus" button
      if (this.renderedCount < this.filteredChannels.length) {
        const loadMoreWrap = document.createElement("div");
        loadMoreWrap.id = "vel-live-load-more-wrap";
        loadMoreWrap.className = "vel-load-more-container col-span-full";

        const loadMoreBtn = document.createElement("button");
        loadMoreBtn.type = "button";
        loadMoreBtn.id = "vel-live-load-more-btn";
        loadMoreBtn.className = "vel-load-more-btn";
        loadMoreBtn.setAttribute("aria-label", "Afficher plus de chaînes");
        loadMoreBtn.innerHTML = `
          <span class="vel-load-more-btn__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </span>
          <span class="vel-load-more-btn__text">Afficher plus</span>
          <span class="vel-load-more-btn__count">${this.renderedCount} / ${this.filteredChannels.length}</span>
        `;

        loadMoreBtn.addEventListener("click", (e) => {
          e.preventDefault();
          this.renderNextBatch();
        });

        loadMoreWrap.appendChild(loadMoreBtn);
        dynamicList.appendChild(loadMoreWrap);
      }
    }

    async playChannel(ch) {
      if (!ch) {
        console.warn("[Velora Live] ⚠️ playChannel called with null/empty channel");
        return;
      }
      const streamId = String(ch.stream_id || ch.raw_stream_id || ch.id || "");
      if (!streamId) {
        console.warn("[Velora Live] ⚠️ Channel has no streamId:", ch);
        return;
      }

      this.currentPlayingStreamId = streamId;
      console.log("%c[Velora Live] 🚀 Launching Stream:", "background: #10b981; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;", {
        streamId,
        name: ch.name || ch.title,
        sourceId: ch.nodecast_source_id || ch.source_id || "1",
        packageId: ch.package_id || ch.category_id,
        veloraPlayLiveChannelAvailable: typeof window.veloraPlayLiveChannel === "function"
      });

      // Update active UI styling
      document.querySelectorAll(".vel-media-item-row").forEach(el => {
        const match = el.dataset.streamId === streamId;
        el.classList.toggle("vel-media-item-row--active", match);
        el.querySelector(".media-item__main")?.classList.toggle("selected", match);
        el.querySelector(".vel-channel-playing-badge")?.classList.toggle("hidden", !match);
      });

      // Keep player container visible
      const playerContainer = document.getElementById("player-container");
      if (playerContainer) {
        playerContainer.classList.remove("hidden");
        playerContainer.setAttribute("aria-hidden", "false");
      }

      const pkgCoverRaw = this.activePackage ? this.resolvePackageCover(this.activePackage) : "";
      const pkgCover = (!isCountryFlagUrl(pkgCoverRaw)) ? pkgCoverRaw : "";
      let safeIcon = String(ch.stream_icon || ch.logo || ch.cover || "").trim();
      if (isCountryFlagUrl(safeIcon)) safeIcon = "";
      if (!safeIcon && pkgCover) safeIcon = pkgCover;

      const item = {
        ...ch,
        stream_id: /^\d+$/.test(streamId) ? Number(streamId) : streamId,
        raw_stream_id: /^\d+$/.test(streamId) ? Number(streamId) : streamId,
        name: ch.name || ch.title || "Chaîne",
        stream_icon: safeIcon,
        cover: safeIcon,
        nodecast_source_id: String(ch.nodecast_source_id || ch.source_id || "1"),
        nodecast_media: "live"
      };

      // Direct invocation of the native application player engine
      if (typeof window.veloraPlayLiveChannel === "function") {
        try {
          console.log("[Velora Live] 📡 Calling native engine window.veloraPlayLiveChannel...", item);
          await window.veloraPlayLiveChannel(item);
          console.log("[Velora Live] ✅ window.veloraPlayLiveChannel completed successfully.");
          
          const video = document.getElementById("video");
          if (video) {
            console.log("[Velora Live] 📺 Player state:", {
              src: video.src || video.currentSrc,
              paused: video.paused,
              readyState: video.readyState,
              networkState: video.networkState,
              error: video.error
            });
          }
        } catch (err) {
          console.error("[Velora Live] ❌ Playback error in window.veloraPlayLiveChannel:", err);
        }
      } else {
        console.error("[Velora Live] ❌ window.veloraPlayLiveChannel is NOT defined on window object! Check script loading order.");
      }
    }

    renderMainCards() {
      const total = this.packages.length;
      if (total === 0 || !this.stage) return;

      const current = this.animatedIndex;
      const isMobile = window.innerWidth < 640;
      const radius = isMobile ? 250 : 310;
      const angleStep = isMobile ? 22 : 18.5;

      let html = "";
      for (let i = 0; i < total; i++) {
        let diff = (i - current) % total;
        if (diff > total / 2) diff -= total;
        if (diff < -total / 2) diff += total;

        const absDist = Math.abs(diff);
        if (absDist > 3.6) continue;

        const angleDeg = diff * angleStep;
        const angleRad = (angleDeg * Math.PI) / 180;
        const tx = Math.sin(angleRad) * radius;
        const tz = -(1 - Math.cos(angleRad)) * radius;
        const rotY = -angleDeg;

        // Enhanced 3D scale and depth: Center selected card pops forward with 1.28x size
        const scaleFactor = Math.max(0.72, 1.28 - absDist * 0.26);
        const forwardZ = Math.max(0, (1 - absDist / 1.5) * 48);
        const finalTz = tz + forwardZ;

        const opacity = Math.max(0, 1 - absDist * 0.28);
        const zIndex = Math.round(100 - absDist * 10);
        const isCenter = absDist < 0.45;

        const pkg = this.packages[i];
        const cover = this.resolvePackageCover(pkg) || toProxiedImageUrl(pkg.cover_url);
        const isFlag = isCountryFlagUrl(cover) || isCountryFlagUrl(pkg.cover_url) || isCountryFlagUrl(decodeURIComponent(cover || ""));
        const isDark = !isFlag && ((cover && logoToneCache.get(cover) === 'dark') || pkg._isDarkLogo || (pkg._cachedTheme && pkg._cachedTheme.isDarkLogo));
        const darkWrapClass = isDark ? 'vel-dark-logo-mode' : '';
        const logoHtml = cover
          ? `<img src="${cover}" alt="" loading="eager" decoding="async" draggable="false" class="vel-coverflow-card__logo" onload="window.veloraDetectLogoDarkness &amp;&amp; window.veloraDetectLogoDarkness(this, this.parentElement)" onerror="this.style.display='none';this.nextElementSibling.style.display='block';" /><span style="display:none;" class="text-xl">📺</span>`
          : `<span class="text-xl">📺</span>`;

        html += `
          <div
            class="vel-coverflow-card ${isCenter ? 'is-center-card' : ''} ${darkWrapClass}"
            data-index="${i}"
            style="transform: translate3d(calc(-50% + ${tx.toFixed(2)}px), -50%, ${finalTz.toFixed(2)}px) rotateY(${rotY.toFixed(2)}deg) scale(${scaleFactor.toFixed(3)}); opacity: ${opacity.toFixed(3)}; z-index: ${zIndex}; pointer-events: auto;"
          >
            <div class="vel-coverflow-card__inner">
              <div class="vel-coverflow-card__logo-wrap ${darkWrapClass}">
                ${logoHtml}
              </div>
            </div>
          </div>
        `;
      }

      this.stage.innerHTML = html;

      // Real-time fluid color transition to the nearest center package
      const nearestIdx = ((Math.round(current) % total) + total) % total;
      if (nearestIdx !== this.lastThemedIndex && this.packages[nearestIdx]) {
        this.lastThemedIndex = nearestIdx;
        const nearestPkg = this.packages[nearestIdx];
        this.transitionToTheme(this.getPackageTheme(nearestPkg), 360);
      }
    }

    smoothAnimateToIndex(targetIdx, duration = 340) {
      if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
      this.isSpinning = true;

      const total = this.packages.length;
      if (total <= 1) {
        this.animatedIndex = 0;
        this.currentIndex = 0;
        this.settledPackageIndex = 0;
        this.renderMainCards();
        this.onPackageSettled(this.packages[0], { isUserWheelInteraction: false, skipScroll: true });
        this.isSpinning = false;
        return;
      }

      const startVal = this.animatedIndex;
      let diff = (targetIdx - startVal) % total;
      if (diff > total / 2) diff -= total;
      if (diff < -total / 2) diff += total;

      const targetVal = startVal + diff;
      const startTime = performance.now();
      let lastRounded = Math.round(startVal);

      const loop = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = 1 - Math.pow(1 - progress, 3);

        this.animatedIndex = startVal + diff * eased;

        const currentRounded = Math.round(this.animatedIndex);
        if (currentRounded !== lastRounded) {
          const dir = currentRounded - lastRounded;
          lastRounded = currentRounded;
          this.triggerTick(dir >= 0 ? 1 : -1);
        }

        this.renderMainCards();

        if (progress < 1) {
          this.animFrameId = requestAnimationFrame(loop);
        } else {
          const finalIdx = ((Math.round(targetVal) % total) + total) % total;
          this.animatedIndex = finalIdx;
          this.currentIndex = finalIdx;
          this.settledPackageIndex = finalIdx;
          this.isSpinning = false;
          this.isDragging = false;
          this.renderMainCards();
          this.onPackageSettled(this.packages[finalIdx], { isUserWheelInteraction: true, resetScroll: true });
        }
      };

      this.animFrameId = requestAnimationFrame(loop);
    }

    // Pointer Events for Main Wheel Dragging & Clicking
    onPointerDown(e) {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      if (this.animFrameId) cancelAnimationFrame(this.animFrameId);

      this.isDragging = true;
      this.hasDragMoved = false;
      this.activePointerId = e.pointerId;
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.downTarget = e.target.closest(".vel-coverflow-card") || document.elementFromPoint(e.clientX, e.clientY)?.closest(".vel-coverflow-card");
      this.dragStartIndex = this.animatedIndex;
      this.dragStartTime = performance.now();

      try {
        this.stage.setPointerCapture(e.pointerId);
      } catch (_) {}
    }

    onPointerMove(e) {
      if (!this.isDragging || e.pointerId !== this.activePointerId) return;

      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        this.hasDragMoved = true;
      }

      if (this.hasDragMoved) {
        const sensitivity = window.innerWidth < 640 ? 0.008 : 0.006;
        const prevRounded = Math.round(this.animatedIndex);
        this.animatedIndex = this.dragStartIndex - dx * sensitivity;
        const curRounded = Math.round(this.animatedIndex);
        if (curRounded !== prevRounded) {
          this.triggerTick(curRounded > prevRounded ? 1 : -1);
        }
        this.renderMainCards();
      }
    }

    onPointerUp(e) {
      if (!this.isDragging || e.pointerId !== this.activePointerId) return;
      this.isDragging = false;

      try {
        this.stage.releasePointerCapture(e.pointerId);
      } catch (_) {}

      if (this.hasDragMoved) {
        const dt = Math.max(16, performance.now() - this.dragStartTime);
        const deltaUnits = this.animatedIndex - this.dragStartIndex;
        const velocity = deltaUnits / dt;
        const momentum = velocity * 120;
        const target = Math.round(this.animatedIndex + momentum);
        this.smoothAnimateToIndex(target, 320);
      } else {
        // It's a click: find the card under cursor or downTarget
        const cardEl = this.downTarget || document.elementFromPoint(e.clientX, e.clientY)?.closest(".vel-coverflow-card");
        if (cardEl && cardEl.dataset.index !== undefined) {
          const idx = parseInt(cardEl.dataset.index, 10);
          this.smoothAnimateToIndex(idx, 320);
        } else {
          // If clicked on left/right arena sides
          const arenaRect = this.stage.getBoundingClientRect();
          if (e.clientX < arenaRect.left + arenaRect.width * 0.38) {
            const total = this.packages.length;
            const target = ((this.currentIndex - 1) % total + total) % total;
            this.smoothAnimateToIndex(target, 280);
          } else if (e.clientX > arenaRect.left + arenaRect.width * 0.62) {
            const total = this.packages.length;
            const target = ((this.currentIndex + 1) % total + total) % total;
            this.smoothAnimateToIndex(target, 280);
          }
        }
      }
    }

    onPointerCancel(e) {
      if (this.isDragging && e.pointerId === this.activePointerId) {
        this.isDragging = false;
        try {
          this.stage.releasePointerCapture(e.pointerId);
        } catch (_) {}
        const target = Math.round(this.animatedIndex);
        this.smoothAnimateToIndex(target, 200);
      }
    }
  }

  // Auto initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => new LiveWheelEngine());
  } else {
    new LiveWheelEngine();
  }
})();

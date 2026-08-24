/**
 * VELORA VIP — UNIVERSAL BRAND & GENRE SLIDER MODULE
 * Multi-tier Visual Resolver: Custom Images > Logos > Country Flags > Themes > Dynamic Monograms
 */
(function () {
  "use strict";

  // Clean vector SVG logos for iconic streaming brands & sports networks
  const SVGS = {
    netflix: '<svg class="vel-brand-card__logo-svg" viewBox="0 0 24 24" fill="#E50914"><path d="M5.5 2h3.2v20H5.5z"/><path d="M15.3 2h3.2v20h-3.2z"/><path d="M5.5 2h3.3l6.5 20h-3.3z" fill="#B81D24"/><path d="M15.3 2l-6.5 20h3.2L18.5 2z"/></svg>',
    disney: '<svg class="vel-brand-card__logo-svg" viewBox="0 0 72 28" fill="#FFFFFF"><path d="M14.5 4.5c4.5-1.5 9.5-.5 12.5 3.5 2.5 3.5 2 8-1.5 11.5-4 4-10 4.5-14.5 1.5-2.5-1.5-4-4-4.5-7 0-4.5 3.5-8.5 8-9.5zm-.5 3c-2.5.5-4.5 3-4.5 5.5 0 2.5 1.5 4.5 4 5 3 .5 6-.5 7.5-3 1.5-2.5 1-5.5-1-7-1.5-1-4-1-6-.5z"/><path d="M30 7h4v15h-4z"/><path d="M37 13.5c0-4 3-6.5 7-6.5s7 2.5 7 6.5-3 6.5-7 6.5-7-2.5-7-6.5zm10 0c0-2-1.5-3.5-3-3.5s-3 1.5-3 3.5 1.5 3.5 3 3.5 3-1.5 3-3.5z"/><path d="M54 7h4v2h-4zm0 4h4v11h-4z"/><path d="M63 9h3v3h3v3h-3v7h-3v-7h-2v-3h2V9z"/><path d="M67 5h2v4h4v2h-4v4h-2v-4h-4V9h4V5z" fill="#00D2FF"/></svg>',
    apple: '<svg class="vel-brand-card__logo-svg" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.92-2.85-.9.04-1.99.6-2.63 1.35-.57.65-1.06 1.72-.93 2.74 1.01.08 2.03-.49 2.64-1.24z"/></svg>',
    prime: '<svg class="vel-brand-card__logo-svg" viewBox="0 0 48 24" fill="#00A8E1"><path d="M8 6h5c3.5 0 5.5 1.8 5.5 4.5s-2 4.5-5.5 4.5H11v4H8V6zm3 6.5h2c1.8 0 2.8-.8 2.8-2s-1-2-2.8-2H11v4z"/><path d="M20 9h3v1.5c.8-1.2 2-1.7 3.5-1.7v3.2c-2.2 0-3.5 1-3.5 3.5V19h-3V9z"/><path d="M28 6h3v2h-3zm0 3h3v10h-3z"/><path d="M33 9h3v1.5c1-1.2 2.2-1.7 3.8-1.7 2 0 3.2.8 3.8 2.2 1-1.4 2.2-2.2 4-2.2 2.8 0 4.4 1.8 4.4 4.8V19h-3v-5c0-1.8-.8-2.5-2-2.5s-2.2.8-2.2 2.5V19h-3v-5c0-1.8-.8-2.5-2-2.5s-2.2.8-2.2 2.5V19h-3V9z"/><path d="M6 21c9 4.5 24 4.5 34-1.5" stroke="#FF9900" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M38 18l3.5 1.5-1.5 3.5" fill="#FF9900"/></svg>',
    hbo: '<svg class="vel-brand-card__logo-svg" viewBox="0 0 54 24" fill="#FFFFFF"><path d="M4 6h4v4h4V6h4v12h-4v-4H8v4H4V6zm18 0h7c3 0 5 1.8 5 4s-1 3-2.5 3.5c2 .5 3.5 1.8 3.5 4s-2 4.5-6 4.5h-7V6zm4 4h2.5c1 0 1.8-.6 1.8-1.5s-.8-1.5-1.8-1.5H26v3zm0 5h3c1 0 2-.6 2-1.8s-1-1.7-2-1.7H26v3.5zm15-9c4.5 0 8 3.5 8 8s-3.5 8-8 8-8-3.5-8-8 3.5-8 8-8zm0 4c-2.2 0-4 1.8-4 4s1.8 4 4 4 4-1.8 4-4-1.8-4-4-4z"/></svg>',
    canal: '<svg class="vel-brand-card__logo-svg" viewBox="0 0 56 20" fill="#FFFFFF"><path d="M12 4.5C7.5 4.5 4 8 4 12.5S7.5 20.5 12 20.5c3.2 0 6-1.8 7.2-4.5h-4.2c-.8 1-2 1.5-3 1.5-2.5 0-4.5-2-4.5-5s2-5 4.5-5c1 0 2.2.5 3 1.5h4.2C18 6.3 15.2 4.5 12 4.5zm10 0h3.5l5.5 16h-3.8l-1.2-4h-4.8l-1.2 4h-3.5l5.5-16zm2.8 9h3.2l-1.6-5.5-1.6 5.5zm8.2-9h3.5l5 10.5V4.5H40v16h-3.5l-5-10.5v10.5H33v-16zm15 6h2.5v-2.5h2.5v2.5h2.5v2.5h-2.5v2.5h-2.5v-2.5H48v-2.5z"/></svg>',
    paramount: '<svg class="vel-brand-card__logo-svg" viewBox="0 0 54 24" fill="#0064FF"><path d="M27 2L18 20h18L27 2zm0 6l4.5 9h-9L27 8z"/><circle cx="15" cy="8" r="1.5" fill="#FFFFFF"/><circle cx="21" cy="4" r="1.5" fill="#FFFFFF"/><circle cx="27" cy="2.5" r="1.5" fill="#FFFFFF"/><circle cx="33" cy="4" r="1.5" fill="#FFFFFF"/><circle cx="39" cy="8" r="1.5" fill="#FFFFFF"/><path d="M43 9h2v3h3v2h-3v3h-2v-3h-3v-2h3V9z" fill="#0064FF"/></svg>',
    marvel: '<svg class="vel-brand-card__logo-svg" viewBox="0 0 60 22" fill="#FFFFFF"><rect width="60" height="22" fill="#ED1D24" rx="3"/><path d="M5 4h3l3 8 3-8h3v14h-3V9.5l-3 7.5h-1l-3-7.5V18H5V4zm17 0h4.5l3 14h-2.8l-.6-3.5h-3.8L21.7 18H19L22 4zm2.6 8h2.6l-1.3-6.5-1.3 6.5zm9.4-8h4.5c2.5 0 4 1.5 4 3.8 0 1.5-.8 2.8-2 3.4l2.5 6.8h-3l-2.2-6H37v6h-3V4zm3 6h1.5c1 0 1.5-.5 1.5-1.2 0-.8-.5-1.2-1.5-1.2H37v2.4zm10-6l2.5 10 2.5-10H55l-3.8 14h-2.4L45 4h2z"/></svg>',
    starwars: '<svg class="vel-brand-card__logo-svg" viewBox="0 0 54 24" fill="#FFE81F"><path d="M4 8h5c1.5 0 2.5-.5 2.5-1.5S10.5 5 9 5H4v3zm0 2h5.5c2.5 0 4.5 1.5 4.5 3.5s-2 3.5-4.5 3.5H4v-7zm16-5h4l3 12h-3l-.6-3h-3.8l-.6 3H20l3-12zm2.5 6.5h2.5L23.7 7l-1.2 4.5zm11.5-6.5h10v2.5h-3.5v9.5H37V7.5h-3V5zm10 0h3.5l1.8 6.5 1.8-6.5h3.5l-3 12h-3.2l-1.5-5.5-1.5 5.5h-3.2l-3-12z"/></svg>',
    warner: '<svg class="vel-brand-card__logo-svg" viewBox="0 0 24 24" fill="#0046AD"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 2c4.4 0 8 3.6 8 8 0 3.8-2.6 7-6.2 7.8V4.2C13.2 4.1 12.6 4 12 4zm-1.8.2v15.6C6.6 19 4 15.8 4 12c0-4.4 3.6-8 8-8-.6 0-1.2.1-1.8.2z"/><path d="M7 8l2 8h1.5l1.5-5.5 1.5 5.5H15l2-8h-1.8l-1.2 5.5-1.4-5.5h-1.2L10 13.5 8.8 8H7z" fill="#FFC72C"/></svg>',
    crunchyroll: '<svg class="vel-brand-card__logo-svg" viewBox="0 0 24 24" fill="#F47521"><circle cx="12" cy="12" r="10"/><path d="M12 5c-3.9 0-7 3.1-7 7s3.1 7 7 7c1.8 0 3.5-.7 4.8-1.9-1.3-.7-2.3-2-2.6-3.6-.3-1.6.2-3.2 1.4-4.3 1.2-1.1 2.8-1.5 4.4-1.1C18.8 6.3 15.6 5 12 5z" fill="#FFFFFF"/><circle cx="15.5" cy="12" r="2.5" fill="#F47521"/></svg>',
    bein: '<svg class="vel-brand-card__logo-svg" viewBox="0 0 60 22" fill="#FFFFFF"><rect width="60" height="22" fill="#5C2D91" rx="4"/><text x="30" y="15.5" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="13" text-anchor="middle" fill="#FFFFFF" letter-spacing="0.5">beIN</text></svg>',
    dazn: '<svg class="vel-brand-card__logo-svg" viewBox="0 0 48 22" fill="#F8F85A"><rect width="48" height="22" fill="#000000" rx="3"/><text x="24" y="15.5" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="13" text-anchor="middle" fill="#F8F85A" letter-spacing="1">DAZN</text></svg>',
    rmc: '<svg class="vel-brand-card__logo-svg" viewBox="0 0 54 22" fill="#FFFFFF"><rect width="54" height="22" fill="#0C2340" rx="3"/><path d="M4 18h46L46 4H8L4 18z" fill="#CC0000"/><text x="27" y="15" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="11" text-anchor="middle" fill="#FFFFFF">RMC</text></svg>',
    eurosport: '<svg class="vel-brand-card__logo-svg" viewBox="0 0 56 22" fill="#001B94"><rect width="56" height="22" fill="#001B94" rx="3"/><text x="28" y="15" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="9" text-anchor="middle" fill="#FFFFFF" letter-spacing="0.8">EUROSPORT</text></svg>',
    sky: '<svg class="vel-brand-card__logo-svg" viewBox="0 0 50 22" fill="#FFFFFF"><rect width="50" height="22" fill="#001940" rx="3"/><path d="M0 0h25v22H0z" fill="#E60000"/><text x="25" y="15" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="11" text-anchor="middle" fill="#FFFFFF">sky</text></svg>',
    uhd4k: '<svg class="vel-brand-card__logo-svg" viewBox="0 0 46 22" fill="#D4AF37"><rect width="46" height="22" fill="#141414" stroke="#D4AF37" stroke-width="1.2" rx="3"/><text x="23" y="15" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="11" text-anchor="middle" fill="#D4AF37" letter-spacing="1">4K UHD</text></svg>'
  };

  // Country Flags Map
  const COUNTRY_FLAGS = {
    fr: "fr", france: "fr",
    us: "us", usa: "us", united_states: "us", america: "us",
    uk: "gb", gb: "gb", royaume_uni: "gb", england: "gb",
    es: "es", espagne: "es", spain: "es",
    it: "it", italie: "it", italy: "it",
    de: "de", allemagne: "de", germany: "de",
    pt: "pt", portugal: "pt",
    ma: "ma", maroc: "ma", morocco: "ma",
    dz: "dz", algerie: "dz", algeria: "dz",
    tn: "tn", tunisie: "tn", tunisia: "tn",
    tr: "tr", turquie: "tr", turkey: "tr",
    ca: "ca", canada: "ca",
    be: "be", belgique: "be", belgium: "be",
    ch: "ch", suisse: "ch", switzerland: "ch",
    br: "br", bresil: "br", brazil: "br",
    nl: "nl", pays_bas: "nl", netherlands: "nl",
    ru: "ru", russie: "ru", russia: "ru",
    sa: "sa", arabie: "sa", arabic: "sa", ar: "sa",
    eg: "eg", egypte: "eg", egypt: "eg",
    pl: "pl", pologne: "pl", poland: "pl",
    ro: "ro", roumanie: "ro", romania: "ro"
  };

  function detectCountryFlag(text) {
    const raw = String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ");
    const words = raw.split(" ").filter(Boolean);
    for (const w of words) {
      if (COUNTRY_FLAGS[w]) return `https://flagcdn.com/w80/${COUNTRY_FLAGS[w]}.png`;
    }
    return null;
  }

  // Comprehensive theme registry (Sports, Holidays, Faith, Wildlife, Gastronomy, etc.)
  const THEME_DEFINITIONS = [
    // Streaming Giants
    { id: "netflix", match: /\bnetflix\b/i, name: "Netflix", svg: SVGS.netflix, color: "#e50914" },
    { id: "disney", match: /\bdisney\b|\bdisney\+/i, name: "Disney+", svg: SVGS.disney, color: "#00d2ff" },
    { id: "apple", match: /\bapple\s*tv\b|\bapple\+/i, name: "Apple TV+", svg: SVGS.apple, color: "#ffffff" },
    { id: "prime", match: /\bprime\s*video\b|\bamazon\s*prime\b|\bprime\b/i, name: "Prime Video", svg: SVGS.prime, color: "#00a8e1" },
    { id: "hbo", match: /\bhbo\b|\bmax\b|\bhbo\s*max\b/i, name: "HBO Max", svg: SVGS.hbo, color: "#a855f7" },
    { id: "canal", match: /\bcanal\+\b|\bcanal\s*plus\b|\bcanal\b/i, name: "CANAL+", svg: SVGS.canal, color: "#ffffff" },
    { id: "paramount", match: /\bparamount\b|\bparamount\+/i, name: "Paramount+", svg: SVGS.paramount, color: "#0064ff" },
    { id: "marvel", match: /\bmarvel\b/i, name: "Marvel", svg: SVGS.marvel, color: "#ed1d24" },
    { id: "starwars", match: /\bstar\s*wars\b/i, name: "Star Wars", svg: SVGS.starwars, color: "#ffe81f" },
    { id: "warner", match: /\bwarner\b|\bwb\b/i, name: "Warner Bros", svg: SVGS.warner, color: "#ffc72c" },
    { id: "crunchyroll", match: /\bcrunchyroll\b|\banime\b|\banimes\b|\bmanga\b/i, name: "Anime & Manga", svg: SVGS.crunchyroll, color: "#f47521" },

    // Sports Networks & Specific Sports
    { id: "bein", match: /\bbein\b|\bbein\s*sports\b/i, name: "beIN Sports", svg: SVGS.bein, color: "#9333ea" },
    { id: "dazn", match: /\bdazn\b/i, name: "DAZN", svg: SVGS.dazn, color: "#f8f85a" },
    { id: "rmc", match: /\brmc\b|\brmc\s*sport\b/i, name: "RMC Sport", svg: SVGS.rmc, color: "#cc0000" },
    { id: "eurosport", match: /\beurosport\b/i, name: "Eurosport", svg: SVGS.eurosport, color: "#3b82f6" },
    { id: "sky", match: /\bsky\s*sports\b|\bsky\b/i, name: "Sky Sports", svg: SVGS.sky, color: "#e60000" },

    { id: "football", match: /\b(foot|football|soccer|ligue\s*1|la\s*liga|serie\s*a|bundesliga|premier\s*league|champions\s*league|uefa|fifa|world\s*cup|coupe\s*du\s*monde|euro)\b/i, name: "Football", emoji: "⚽", color: "#10b981" },
    { id: "boxing", match: /\b(boxe|boxing|mma|ufc|combat|fight|bellator|glory|ksw|catch|wwe)\b/i, name: "Combat & Boxe", emoji: "🥊", color: "#ef4444" },
    { id: "basketball", match: /\b(basket|basketball|nba|euroleague|fib)\b/i, name: "Basketball", emoji: "🏀", color: "#f97316" },
    { id: "tennis", match: /\b(tennis|wimbledon|roland\s*garros|us\s*open|atp|wta)\b/i, name: "Tennis", emoji: "🎾", color: "#84cc16" },
    { id: "motorsport", match: /\b(f1|formula\s*1|motogp|moto|rallye|wrc|nascar|karting)\b/i, name: "Sports Mécaniques", emoji: "🏎️", color: "#dc2626" },
    { id: "rugby", match: /\b(rugby|top\s*14|six\s*nations|6\s*nations|nfl|super\s*bowl)\b/i, name: "Rugby & NFL", emoji: "🏉", color: "#eab308" },
    { id: "cycling", match: /\b(cyclisme|velo|tour\s*de\s*france|giro|vuelta)\b/i, name: "Cyclisme", emoji: "🚴", color: "#06b6d4" },
    { id: "golf", match: /\b(golf|masters|pga)\b/i, name: "Golf", emoji: "⛳", color: "#22c55e" },
    { id: "wintersport", match: /\b(ski|snowboard|patinage|glisse|winter|hiver)\b/i, name: "Sports d'Hiver", emoji: "⛷️", color: "#38bdf8" },

    // Holidays & Seasons
    { id: "christmas", match: /\b(no[eë]l|christmas|xmas|f[eê]tes|holiday|holidays)\b/i, name: "Noël & Fêtes", emoji: "🎄", color: "#16a34a" },
    { id: "halloween", match: /\b(halloween|peur|ghost)\b/i, name: "Halloween", emoji: "🎃", color: "#f97316" },
    { id: "summer", match: /\b([eé]t[eé]|summer|vacances|plage)\b/i, name: "Été & Vacances", emoji: "☀️", color: "#f59e0b" },

    // Religion & Biblical & Faith
    { id: "faith", match: /\b(bibl|bible|christ|chr[eé]tien|religion|islam|coran|coranique|catholique|gospel|foi|saint|religieu[sx])\b/i, name: "Religion & Spiritualité", emoji: "🕊️", color: "#d97706" },

    // Topics & Lifestyles
    { id: "cooking", match: /\b(cuisine|cook|culinaire|chef|recette|gastronomie|food)\b/i, name: "Cuisine & Recettes", emoji: "🍳", color: "#f59e0b" },
    { id: "wildlife", match: /\b(animaux|animal|faune|nature|planet|terre|safari|ocean|mer)\b/i, name: "Animaux & Nature", emoji: "🦁", color: "#10b981" },
    { id: "kids", match: /\b(kids|jeunesse|enfants|bebe|baby|disney\s*junior|cartoon|nickelodeon|gulli|dessins?\s*anim[eé]s?)\b/i, name: "Jeunesse & Enfants", emoji: "🎈", color: "#ec4899" },
    { id: "news", match: /\b(news|info|actualit[eé]|journal|bfm|cnews|lci|france\s*24|cnn|bbc)\b/i, name: "Actualités & Info", emoji: "📰", color: "#2563eb" },
    { id: "music", match: /\b(music|musique|concert|live\s*music|clip|radio|mtv|trace)\b/i, name: "Musique & Concerts", emoji: "🎵", color: "#ec4899" },
    { id: "gaming", match: /\b(game|gaming|esport|twitch|jeux\s*vid[eé]o)\b/i, name: "Gaming & Esport", emoji: "🎮", color: "#8b5cf6" },
    { id: "space", match: /\b(science|espace|space|nasa|astronomie|univers|cosmos)\b/i, name: "Sciences & Espace", emoji: "🚀", color: "#6366f1" },
    { id: "history", match: /\b(histoire|history|guerre|war|ww2|archeo|civilisation)\b/i, name: "Histoire & Guerres", emoji: "🏛️", color: "#b45309" },

    // Cinema & Series Genres
    { id: "4k", match: /\b(4k|uhd|ultra\s*hd|hdr)\b/i, name: "4K Ultra HD", svg: SVGS.uhd4k, color: "#d4af37" },
    { id: "action", match: /\b(action|aventure)\b/i, name: "Action & Aventure", emoji: "⚡", color: "#f97316" },
    { id: "comedie", match: /\b(com[eé]die|humour|rire)\b/i, name: "Comédie", emoji: "🎭", color: "#eab308" },
    { id: "thriller", match: /\b(thriller|policier|crime|myst[eè]re)\b/i, name: "Thriller & Policier", emoji: "🔍", color: "#06b6d4" },
    { id: "horreur", match: /\b(horreur|[eé]pouvante|horror)\b/i, name: "Horreur", emoji: "🩸", color: "#dc2626" },
    { id: "scifi", match: /\b(sci-?fi|science-?fiction|fantastique|fantasy)\b/i, name: "Sci-Fi & Fantastique", emoji: "🪐", color: "#9333ea" },
    { id: "documentaire", match: /\b(documentaires?|docs?|soci[eé]t[eé])\b/i, name: "Documentaires", emoji: "🌿", color: "#22c55e" },
    { id: "drame", match: /\b(drame|romance|amour)\b/i, name: "Drame & Romance", emoji: "🌹", color: "#f43f5e" },
    { id: "top", match: /\b(top|tendance|nouveaut[eé]s?|populaire)\b/i, name: "Top & Tendances", emoji: "🔥", color: "#ef4444" }
  ];

  /**
   * Deterministic dynamic theme generation from string hash
   */
  function hashTheme(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return {
      bg: `linear-gradient(135deg, hsla(${h}, 70%, 50%, 0.22) 0%, rgba(18, 18, 26, 0.9) 100%)`,
      border: `hsla(${h}, 70%, 55%, 0.45)`,
      glowColor: `hsl(${h}, 75%, 55%)`,
      glowGrad: `radial-gradient(circle at center, hsla(${h}, 75%, 55%, 0.35) 0%, transparent 70%)`
    };
  }

  function formatInitials(text) {
    const cleaned = String(text || "").replace(/^[A-Z]{2,3}\s*[\-–|:]\s*/i, "").trim();
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return cleaned.slice(0, 3).toUpperCase() || "VIP";
  }

  /**
   * Multi-tier resolver for ANY package
   */
  function resolvePackageVisual(pkg) {
    const rawName = String(pkg.name || pkg.title || "").trim();

    // 1. Direct custom image / logo if provided by IPTV or Admin
    const directImg = pkg.image || pkg.icon || pkg.logo || pkg.stream_icon || pkg.artwork || window.__veloraCustomPackageLogos?.[pkg.id];
    if (directImg) {
      return {
        type: "image",
        src: directImg,
        theme: hashTheme(rawName)
      };
    }

    // 2. Semantic Theme Match
    for (const def of THEME_DEFINITIONS) {
      if (def.match.test(rawName)) {
        return {
          type: def.svg ? "svg" : "emoji",
          svg: def.svg || null,
          emoji: def.emoji || null,
          theme: {
            bg: `linear-gradient(135deg, ${def.color}33 0%, rgba(16, 16, 24, 0.9) 100%)`,
            border: `${def.color}66`,
            glowColor: def.color,
            glowGrad: `radial-gradient(circle at center, ${def.color}55 0%, transparent 70%)`
          }
        };
      }
    }

    // 3. Country Flag Auto-Detection
    const flagUrl = detectCountryFlag(rawName) || (typeof window.__veloraCountryFlagUrl === "function" ? window.__veloraCountryFlagUrl(rawName) : null);
    if (flagUrl) {
      return {
        type: "flag",
        src: flagUrl,
        theme: hashTheme(rawName)
      };
    }

    // 4. Universal Dynamic Monogram Generator (Works for ANYTHING)
    return {
      type: "monogram",
      monogram: formatInitials(rawName),
      theme: hashTheme(rawName)
    };
  }

  function formatPackageTitle(value) {
    let str = String(value || "").trim();
    str = str.replace(/^[A-Z]{2,3}\s*[\-–|:]\s*/i, "");
    str = str.replace(/\s*[\(\[]?(VOD|FILMS?|S[EÉ]RIES?|4K)[\)\]]?$/i, "").trim();
    return str || value;
  }

  /**
   * Mount or update modern Brand Slider in target container
   */
  function mountBrandSlider(targetEl, packages, activePackageId, onSelectCallback) {
    if (!targetEl || !Array.isArray(packages) || !packages.length) return null;

    const currentActiveId = String(activePackageId || packages[0]?.id || "");
    const packageSignature = packages.map(p => String(p.id || "")).join(",");

    let wrap = targetEl.querySelector(".vel-brand-slider-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "vel-brand-slider-wrap";
      targetEl.prepend(wrap);
    }

    // IF THE PACKAGES LIST IS THE SAME: Just update active state without touching DOM!
    if (wrap.dataset.pkgSignature === packageSignature) {
      const rail = wrap.querySelector(".vel-brand-slider-rail");
      if (rail) {
        rail.querySelectorAll(".vel-brand-card").forEach(c => {
          const isSelected = c.dataset.packageId === currentActiveId;
          c.classList.toggle("is-active", isSelected);
          c.setAttribute("aria-selected", isSelected ? "true" : "false");
        });
      }
      return wrap;
    }

    wrap.dataset.pkgSignature = packageSignature;

    wrap.innerHTML = `
      <div class="vel-brand-slider-header">
        <div class="vel-brand-slider-title">Univers & Catégories</div>
      </div>
      <div class="vel-brand-slider-container">
        <button type="button" class="vel-brand-slider-arrow vel-brand-slider-arrow--prev" aria-label="Faire défiler à gauche" title="Précédent">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div class="vel-brand-slider-rail" role="tablist"></div>
        <button type="button" class="vel-brand-slider-arrow vel-brand-slider-arrow--next" aria-label="Faire défiler à droite" title="Suivant">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>
    `;

    const rail = wrap.querySelector(".vel-brand-slider-rail");
    const prevBtn = wrap.querySelector(".vel-brand-slider-arrow--prev");
    const nextBtn = wrap.querySelector(".vel-brand-slider-arrow--next");

    packages.forEach((pkg, index) => {
      const rawTitle = pkg.name || pkg.title || `Package ${index + 1}`;
      const visual = resolvePackageVisual(pkg);
      const cleanTitle = formatPackageTitle(rawTitle);
      const isSelected = String(pkg.id) === currentActiveId;

      const card = document.createElement("button");
      card.type = "button";
      card.className = "vel-brand-card" + (isSelected ? " is-active" : "");
      card.dataset.packageId = String(pkg.id);
      card.setAttribute("role", "tab");
      card.setAttribute("aria-selected", isSelected ? "true" : "false");
      card.setAttribute("aria-label", rawTitle);
      card.title = rawTitle;

      card.style.setProperty("--brand-bg", visual.theme.bg);
      card.style.setProperty("--brand-border", visual.theme.border);
      card.style.setProperty("--brand-glow-color", visual.theme.glowColor);
      card.style.setProperty("--brand-glow-grad", visual.theme.glowGrad);

      let visualHtml = "";
      if (visual.type === "image") {
        visualHtml = `<div class="vel-brand-card__logo-wrap"><img class="vel-brand-card__logo-img" src="${visual.src}" alt="" loading="lazy" decoding="async" onerror="this.remove()" /></div>`;
      } else if (visual.type === "flag") {
        visualHtml = `<div class="vel-brand-card__logo-wrap"><img class="vel-brand-card__flag-badge" src="${visual.src}" alt="" loading="lazy" decoding="async" onerror="this.remove()" /></div>`;
      } else if (visual.type === "svg") {
        visualHtml = `<div class="vel-brand-card__logo-wrap">${visual.svg}</div>`;
      } else if (visual.type === "emoji") {
        visualHtml = `<div class="vel-brand-card__logo-wrap"><span class="vel-brand-card__logo-emoji">${visual.emoji}</span></div>`;
      } else {
        visualHtml = `<div class="vel-brand-card__logo-wrap"><span class="vel-brand-card__monogram">${visual.monogram}</span></div>`;
      }

      card.innerHTML = `
        ${visualHtml}
        <span class="vel-brand-card__name">${cleanTitle}</span>
        <div class="vel-brand-card__indicator" aria-hidden="true"></div>
      `;

      card.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        rail.querySelectorAll(".vel-brand-card").forEach(c => {
          c.classList.remove("is-active");
          c.setAttribute("aria-selected", "false");
        });
        card.classList.add("is-active");
        card.setAttribute("aria-selected", "true");

        card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });

        if (typeof onSelectCallback === "function") {
          onSelectCallback(pkg.id, pkg);
        }
      });

      rail.appendChild(card);
    });

    // Arrow navigation
    function updateArrowStates() {
      if (!prevBtn || !nextBtn || !rail) return;
      const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
      prevBtn.classList.toggle("is-disabled", rail.scrollLeft <= 6);
      nextBtn.classList.toggle("is-disabled", rail.scrollLeft >= maxScroll - 6);
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        rail.scrollBy({ left: -340, behavior: "smooth" });
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        rail.scrollBy({ left: 340, behavior: "smooth" });
      });
    }

    // Mouse drag scrolling on PC
    let isDown = false;
    let startX = 0;
    let scrollStart = 0;

    rail.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      isDown = true;
      startX = e.pageX - rail.offsetLeft;
      scrollStart = rail.scrollLeft;
      rail.classList.add("is-dragging");
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      const x = e.pageX - rail.offsetLeft;
      const walk = (x - startX) * 1.4;
      rail.scrollLeft = scrollStart - walk;
      updateArrowStates();
    });

    window.addEventListener("mouseup", () => {
      if (!isDown) return;
      isDown = false;
      rail.classList.remove("is-dragging");
    });

    rail.addEventListener("scroll", updateArrowStates, { passive: true });
    window.requestAnimationFrame(updateArrowStates);

    const activeCard = rail.querySelector(".vel-brand-card.is-active");
    if (activeCard) {
      window.setTimeout(() => {
        activeCard.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }, 100);
    }

    return wrap;
  }

  // Global export
  window.veloraMountBrandSlider = mountBrandSlider;
  window.veloraResolvePackageVisual = resolvePackageVisual;
})();

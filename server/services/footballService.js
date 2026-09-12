/**
 * Service Football - Scraping automatisé des VRAIS GRANDS MATCHS (Big Stages & Big Clubs)
 * Système de Rang basé sur la Hype et l'Audience Réelle Actuelle :
 * - Tier S (200 pts) : Real Madrid, Barça, Arsenal, Man City, Liverpool, PSG, Bayern
 * - Tier A (130 pts) : Chelsea, Man United, Tottenham, Atlético, Leverkusen
 * - Tier B (80 pts) : Inter, Juventus, Milan, Napoli, Dortmund, OM, Monaco, Aston Villa, Newcastle
 * - Tier C (40 pts) : Lyon, Lille, Atalanta, Roma, Lazio, Bilbao, Sociedad, Benfica, etc.
 * Logos HD officiels garantis + TheSportsDB et cache 1 heure.
 */

const cheerio = require('cheerio');

// Cache mémoire 1 heure par pays
const countryCaches = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 heure

// Configurations régionales et diffuseurs officiels par pays
const COUNTRY_CONFIGS = {
    france: {
        id: 'france',
        name: 'France',
        flag: '🇫🇷',
        channelsLabel: 'Chaînes TV françaises',
        broadcasters: {
            'champions league': ['Canal+', 'Canal+ Foot', 'beIN Sports 1'],
            'europa league': ['Canal+', 'Canal+ Foot', 'RMC Sport 1'],
            'conference league': ['Canal+ Live', 'RMC Sport Live'],
            'premier league': ['Canal+', 'Canal+ Foot', 'Canal+ Premier League'],
            'liga': ['beIN Sports 1', 'beIN Sports 2'],
            'ligue 1': ['DAZN 1', 'beIN Sports 1'],
            'serie a': ['DAZN', 'beIN Sports'],
            'bundesliga': ['beIN Sports 1', 'beIN Sports 2'],
            'world cup': ['TF1', 'beIN Sports 1'],
            'euro': ['TF1', 'M6', 'beIN Sports 1'],
            'nations league': ['TF1', 'L\'Équipe']
        }
    },
    uk: {
        id: 'uk',
        name: 'Royaume-Uni',
        flag: '🇬🇧',
        channelsLabel: 'Chaînes TV (UK)',
        broadcasters: {
            'champions league': ['TNT Sports 1', 'TNT Sports Ultimate', 'discovery+'],
            'europa league': ['TNT Sports 2', 'discovery+'],
            'conference league': ['TNT Sports', 'discovery+'],
            'premier league': ['Sky Sports Main Event', 'Sky Sports Premier League', 'TNT Sports 1'],
            'liga': ['Premier Sports 1', 'LaLigaTV', 'ITV4'],
            'ligue 1': ['TNT Sports 1', 'discovery+'],
            'serie a': ['TNT Sports 1', 'OneFootball'],
            'bundesliga': ['Sky Sports Football', 'Sky Sports Mix'],
            'world cup': ['BBC One', 'ITV1', 'STV'],
            'euro': ['BBC One', 'ITV1'],
            'nations league': ['ITV1', 'Viaplay']
        }
    },
    spain: {
        id: 'spain',
        name: 'Espagne',
        flag: '🇪🇸',
        channelsLabel: 'Chaînes TV (Espagne)',
        broadcasters: {
            'champions league': ['Movistar Liga de Campeones', 'Movistar Plus+'],
            'europa league': ['Movistar Liga de Campeones 2', 'Cuatro'],
            'conference league': ['Movistar Liga de Campeones'],
            'premier league': ['DAZN 1', 'DAZN Premier League'],
            'liga': ['DAZN LaLiga', 'M+ LaLiga TV', 'Gol Play'],
            'ligue 1': ['Eurosport 1', 'DAZN'],
            'serie a': ['DAZN 1', 'Movistar+'],
            'bundesliga': ['DAZN 2', 'Movistar+'],
            'world cup': ['RTVE La 1', 'Gol Mundial', 'Movistar Plus+'],
            'euro': ['RTVE La 1', 'La 2', 'Teledeporte'],
            'nations league': ['RTVE La 1']
        }
    },
    usa: {
        id: 'usa',
        name: 'États-Unis',
        flag: '🇺🇸',
        channelsLabel: 'Chaînes TV (USA)',
        broadcasters: {
            'champions league': ['Paramount+', 'CBS Sports Network', 'TUDN', 'Univision'],
            'europa league': ['Paramount+', 'ViX'],
            'conference league': ['Paramount+', 'ViX'],
            'premier league': ['NBC', 'Peacock', 'USA Network', 'Telemundo'],
            'liga': ['ESPN+', 'ESPN Deportes', 'ABC'],
            'ligue 1': ['beIN Sports USA', 'beIN Sports en Español', 'Fubo'],
            'serie a': ['Paramount+', 'CBS Sports Golazo Network'],
            'bundesliga': ['ESPN+', 'ESPN App'],
            'world cup': ['FOX', 'FS1', 'Telemundo', 'Peacock'],
            'euro': ['FOX', 'FS1', 'Fubo Sports'],
            'nations league': ['FOX Sports', 'ViX']
        }
    },
    italy: {
        id: 'italy',
        name: 'Italie',
        flag: '🇮🇹',
        channelsLabel: 'Chaînes TV (Italie)',
        broadcasters: {
            'champions league': ['Sky Sport Uno', 'Now TV', 'Amazon Prime Video IT', 'Canale 5'],
            'europa league': ['Sky Sport Calcio', 'DAZN Italia', 'TV8'],
            'conference league': ['Sky Sport', 'DAZN Italia'],
            'premier league': ['Sky Sport Uno', 'Sky Sport Football', 'Now TV'],
            'liga': ['DAZN Italia'],
            'ligue 1': ['Sky Sport', 'Now TV'],
            'serie a': ['DAZN Italia', 'Sky Sport Calcio', 'Sky Sport Uno'],
            'bundesliga': ['Sky Sport Uno', 'Sky Sport Calcio'],
            'world cup': ['Rai 1', 'Rai Sport', 'RaiPlay'],
            'euro': ['Rai 1', 'Sky Sport Uno'],
            'nations league': ['Rai 1', 'RaiPlay']
        }
    },
    germany: {
        id: 'germany',
        name: 'Allemagne',
        flag: '🇩🇪',
        channelsLabel: 'Chaînes TV (Allemagne)',
        broadcasters: {
            'champions league': ['DAZN Deutschland', 'Amazon Prime Video DE'],
            'europa league': ['RTL', 'RTL+', 'Sky Sport'],
            'conference league': ['RTL+', 'Nitro'],
            'premier league': ['Sky Sport Premier League', 'Sky Sport Top Event', 'WOW'],
            'liga': ['DAZN Deutschland', 'DAZN 1'],
            'ligue 1': ['DAZN Deutschland'],
            'serie a': ['DAZN Deutschland', 'DAZN 2'],
            'bundesliga': ['Sky Sport Bundesliga 1', 'DAZN 1', 'Sat.1'],
            'world cup': ['ARD Das Erste', 'ZDF', 'MagentaTV'],
            'euro': ['ARD', 'ZDF', 'RTL', 'MagentaTV'],
            'nations league': ['ZDF', 'ARD', 'RTL']
        }
    },
    mena: {
        id: 'mena',
        name: 'Monde Arabe',
        flag: '🌍',
        channelsLabel: 'القنوات الناقلة العربية (beIN Sports, SSC, Abu Dhabi Sports)',
        broadcasters: {
            'champions league': ['beIN Sports 1 HD (عربي)', 'beIN Sports 2 HD', 'beIN 4K', 'TOD'],
            'ligue des champions': ['beIN Sports 1 HD (عربي)', 'beIN Sports 2 HD', 'beIN 4K', 'TOD'],
            'europa league': ['beIN Sports 2 HD (عربي)', 'beIN Sports 3 HD (عربي)', 'TOD'],
            'ligue europa': ['beIN Sports 2 HD (عربي)', 'beIN Sports 3 HD (عربي)', 'TOD'],
            'conference': ['beIN Sports 4 HD (عربي)', 'TOD'],
            'premier league': ['beIN Sports 1 HD Premium', 'beIN Sports 2 HD (عربي)', 'beIN 4K'],
            'liga': ['beIN Sports 1 HD (عربي)', 'beIN Sports 3 HD (عربي)', 'TOD'],
            'ligue 1': ['beIN Sports 4 HD (عربي)', 'beIN Sports 1 HD (عربي)'],
            'serie a': ['Abu Dhabi Sports Premium 1 (أبوظبي)', 'STARZPLAY', 'AD Sports 2 HD'],
            'bundesliga': ['beIN Sports 5 HD (عربي)', 'beIN Sports HD', 'TOD'],
            'world cup': ['beIN Sports MAX 1/2 HD', 'Alkass Extra 1 HD (الكاس)', 'beIN 4K'],
            'coupe du monde': ['beIN Sports MAX 1/2 HD', 'Alkass Extra 1 HD (الكاس)', 'beIN 4K'],
            'euro': ['beIN Sports MAX 1/2/3 HD', 'TOD (عربي)'],
            'nations league': ['beIN Sports 1 HD (عربي)', 'TOD'],
            'saudi': ['SSC 1 HD (السعودية)', 'SSC EXTRA 1 HD', 'Shahid VIP'],
            'afc': ['beIN Sports AFC HD', 'SSC 1 HD', 'Alkass Nine HD'],
            'copa america': ['beIN Sports MAX 1 HD', 'TOD']
        }
    },
    portugal: {
        id: 'portugal',
        name: 'Portugal',
        flag: '🇵🇹',
        channelsLabel: 'Chaînes TV (Portugal)',
        broadcasters: {
            'champions league': ['Sport TV 1', 'DAZN Eleven Sports 1', 'TVI'],
            'europa league': ['Sport TV 2', 'SIC'],
            'conference league': ['Sport TV 3', 'DAZN Portugal'],
            'premier league': ['DAZN Eleven Sports 1', 'DAZN 2'],
            'liga': ['DAZN Eleven Sports 2', 'DAZN 3'],
            'ligue 1': ['Sport TV 4'],
            'serie a': ['Sport TV 2', 'Sport TV 3'],
            'bundesliga': ['DAZN Eleven Sports 3'],
            'world cup': ['RTP 1', 'SIC', 'TVI', 'Sport TV 1'],
            'euro': ['RTP 1', 'SIC', 'TVI', 'Sport TV'],
            'nations league': ['RTP 1', 'Sport TV 1']
        }
    }
};

/**
 * Normalise un identifiant ou nom de pays vers notre dictionnaire supporté
 */
function normalizeCountryCode(countryInput) {
    if (!countryInput) return 'france';
    const s = String(countryInput).toLowerCase().replace(/^country_/, '').replace(/[_\-\s]+/g, ' ').trim();

    // 1. Pays Arabes / Monde Arabe (MENA) : supporte tous les pays et termes
    if (/(arabe|arabic|arab|mena|oriental|maghreb|maroc|morocco|algerie|algeria|tunisie|tunisia|egypt|egypte|saudi|saoudite|qatar|emirats|uae|kuwait|koweit|bahrain|oman|iraq|irak|jordan|jordanie|lebanon|liban|libya|libye|sudan|soudan|yemen|syria|syrie|palestine|\b(ar|dz|ma|tn|eg|sa|ae|qa|kw|om|bh|iq|jo|lb|ly|sd|ye|sy)\b)/i.test(s)) {
        return 'mena';
    }

    // 2. Royaume-Uni / UK
    if (/(uk|gb|gbr|england|angleterre|united kingdom|great britain|royaume uni|royaume-uni|\b(uk|gb)\b)/i.test(s)) {
        return 'uk';
    }

    // 3. Espagne
    if (/(spain|espagne|espana|spanish|\b(es|esp)\b)/i.test(s)) {
        return 'spain';
    }

    // 4. États-Unis / USA
    if (/(usa|us|united states|etats unis|etats-unis|america|amerique|\b(us|usa)\b)/i.test(s)) {
        return 'usa';
    }

    // 5. Italie
    if (/(italy|italie|italia|italian|\b(it|ita)\b)/i.test(s)) {
        return 'italy';
    }

    // 6. Allemagne
    if (/(germany|allemagne|deutschland|german|\b(de|deu|ger)\b)/i.test(s)) {
        return 'germany';
    }

    // 7. Portugal
    if (/(portugal|portugais|portuguese|\b(pt|prt)\b)/i.test(s)) {
        return 'portugal';
    }

    // 8. France
    if (/(france|francais|french|\b(fr|fra)\b)/i.test(s)) {
        return 'france';
    }

    return 'france'; // Par défaut France
}

/**
 * Récupère la configuration d'un pays
 */
function getCountryConfig(countryKey) {
    const key = normalizeCountryCode(countryKey);
    return COUNTRY_CONFIGS[key] || COUNTRY_CONFIGS.france;
}

// Cache mémoire des logos des équipes
const teamLogoCache = new Map();

// Bouclier football SVG générique par défaut
const DEFAULT_FOOTBALL_SHIELD_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%233b82f6"><path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm0 2.18l6 2.25v4.66c0 4.14-2.73 8-6 9.08-3.27-1.08-6-4.94-6-9.08V6.43l6-2.25zM12 6a4 4 0 100 8 4 4 0 000-8z"/></svg>`;

// BASE DE LOGOS OFFICIELS HD POUR LES CLUBS MAJEURS (Instantané & garanti à 100%)
const MAJOR_TEAM_LOGOS = {
    // Angleterre
    'arsenal': 'https://media.api-sports.io/football/teams/42.png',
    'manchester city': 'https://media.api-sports.io/football/teams/50.png',
    'man city': 'https://media.api-sports.io/football/teams/50.png',
    'manchester united': 'https://media.api-sports.io/football/teams/33.png',
    'man united': 'https://media.api-sports.io/football/teams/33.png',
    'liverpool': 'https://media.api-sports.io/football/teams/40.png',
    'chelsea': 'https://media.api-sports.io/football/teams/49.png',
    'tottenham': 'https://media.api-sports.io/football/teams/47.png',
    'spurs': 'https://media.api-sports.io/football/teams/47.png',
    'newcastle': 'https://media.api-sports.io/football/teams/34.png',
    'aston villa': 'https://media.api-sports.io/football/teams/66.png',
    'everton': 'https://media.api-sports.io/football/teams/45.png',
    'sunderland': 'https://media.api-sports.io/football/teams/71.png',
    'west ham': 'https://media.api-sports.io/football/teams/48.png',
    'brighton': 'https://media.api-sports.io/football/teams/51.png',
    'fulham': 'https://media.api-sports.io/football/teams/36.png',
    'wolves': 'https://media.api-sports.io/football/teams/39.png',
    'wolverhampton': 'https://media.api-sports.io/football/teams/39.png',
    'brentford': 'https://media.api-sports.io/football/teams/55.png',
    'crystal palace': 'https://media.api-sports.io/football/teams/52.png',
    'nottingham': 'https://media.api-sports.io/football/teams/65.png',

    // Espagne
    'real madrid': 'https://media.api-sports.io/football/teams/541.png',
    'barcelone': 'https://media.api-sports.io/football/teams/529.png',
    'barcelona': 'https://media.api-sports.io/football/teams/529.png',
    'barça': 'https://media.api-sports.io/football/teams/529.png',
    'atletico': 'https://media.api-sports.io/football/teams/530.png',
    'atlético': 'https://media.api-sports.io/football/teams/530.png',
    'atletico madrid': 'https://media.api-sports.io/football/teams/530.png',
    'bilbao': 'https://media.api-sports.io/football/teams/531.png',
    'athletic bilbao': 'https://media.api-sports.io/football/teams/531.png',
    'seville': 'https://media.api-sports.io/football/teams/536.png',
    'sevilla': 'https://media.api-sports.io/football/teams/536.png',
    'betis': 'https://media.api-sports.io/football/teams/543.png',
    'real betis': 'https://media.api-sports.io/football/teams/543.png',
    'sociedad': 'https://media.api-sports.io/football/teams/548.png',
    'real sociedad': 'https://media.api-sports.io/football/teams/548.png',
    'villarreal': 'https://media.api-sports.io/football/teams/533.png',
    'valence': 'https://media.api-sports.io/football/teams/532.png',
    'valencia': 'https://media.api-sports.io/football/teams/532.png',
    'rayo v.': 'https://media.api-sports.io/football/teams/728.png',
    'rayo vallecano': 'https://media.api-sports.io/football/teams/728.png',
    'elche': 'https://media.api-sports.io/football/teams/797.png',
    'osasuna': 'https://media.api-sports.io/football/teams/727.png',
    'celta vigo': 'https://media.api-sports.io/football/teams/538.png',
    'mallorca': 'https://media.api-sports.io/football/teams/798.png',
    'getafe': 'https://media.api-sports.io/football/teams/546.png',

    // France
    'paris': 'https://media.api-sports.io/football/teams/85.png',
    'psg': 'https://media.api-sports.io/football/teams/85.png',
    'paris sg': 'https://media.api-sports.io/football/teams/85.png',
    'paris saint-germain': 'https://media.api-sports.io/football/teams/85.png',
    'marseille': 'https://media.api-sports.io/football/teams/81.png',
    'om': 'https://media.api-sports.io/football/teams/81.png',
    'lyon': 'https://media.api-sports.io/football/teams/80.png',
    'ol': 'https://media.api-sports.io/football/teams/80.png',
    'lyon ol': 'https://media.api-sports.io/football/teams/80.png',
    'monaco': 'https://media.api-sports.io/football/teams/91.png',
    'as monaco': 'https://media.api-sports.io/football/teams/91.png',
    'lille': 'https://media.api-sports.io/football/teams/79.png',
    'losc': 'https://media.api-sports.io/football/teams/79.png',
    'lens': 'https://media.api-sports.io/football/teams/116.png',
    'rennes': 'https://media.api-sports.io/football/teams/94.png',
    'nice': 'https://media.api-sports.io/football/teams/84.png',
    'strasbourg': 'https://media.api-sports.io/football/teams/95.png',
    'nantes': 'https://media.api-sports.io/football/teams/83.png',
    'toulouse': 'https://media.api-sports.io/football/teams/96.png',
    'reims': 'https://media.api-sports.io/football/teams/93.png',
    'brest': 'https://media.api-sports.io/football/teams/1063.png',
    'montpellier': 'https://media.api-sports.io/football/teams/82.png',
    'auxerre': 'https://media.api-sports.io/football/teams/108.png',
    'saint-etienne': 'https://media.api-sports.io/football/teams/1063.png',
    'asse': 'https://media.api-sports.io/football/teams/1063.png',

    // Italie
    'juventus': 'https://media.api-sports.io/football/teams/496.png',
    'juve': 'https://media.api-sports.io/football/teams/496.png',
    'inter': 'https://media.api-sports.io/football/teams/505.png',
    'inter milan': 'https://media.api-sports.io/football/teams/505.png',
    'milan': 'https://media.api-sports.io/football/teams/489.png',
    'ac milan': 'https://media.api-sports.io/football/teams/489.png',
    'naples': 'https://media.api-sports.io/football/teams/492.png',
    'napoli': 'https://media.api-sports.io/football/teams/492.png',
    'roma': 'https://media.api-sports.io/football/teams/497.png',
    'as roma': 'https://media.api-sports.io/football/teams/497.png',
    'lazio': 'https://media.api-sports.io/football/teams/487.png',
    'atalanta': 'https://media.api-sports.io/football/teams/499.png',
    'fiorentina': 'https://media.api-sports.io/football/teams/502.png',
    'bologna': 'https://media.api-sports.io/football/teams/500.png',
    'torino': 'https://media.api-sports.io/football/teams/503.png',
    'sassuolo': 'https://media.api-sports.io/football/teams/488.png',
    'cagliari': 'https://media.api-sports.io/football/teams/490.png',
    'genoa': 'https://media.api-sports.io/football/teams/495.png',
    'verona': 'https://media.api-sports.io/football/teams/504.png',

    // Allemagne
    'bayern': 'https://media.api-sports.io/football/teams/157.png',
    'bayern munich': 'https://media.api-sports.io/football/teams/157.png',
    'dortmund': 'https://media.api-sports.io/football/teams/165.png',
    'borussia dortmund': 'https://media.api-sports.io/football/teams/165.png',
    'leverkusen': 'https://media.api-sports.io/football/teams/168.png',
    'bayer leverkusen': 'https://media.api-sports.io/football/teams/168.png',
    'leipzig': 'https://media.api-sports.io/football/teams/173.png',
    'rb leipzig': 'https://media.api-sports.io/football/teams/173.png',
    'francfort': 'https://media.api-sports.io/football/teams/169.png',
    'eintracht': 'https://media.api-sports.io/football/teams/169.png',
    'stuttgart': 'https://media.api-sports.io/football/teams/172.png',
    'cologne': 'https://media.api-sports.io/football/teams/192.png',
    'koln': 'https://media.api-sports.io/football/teams/192.png',
    'werder': 'https://media.api-sports.io/football/teams/162.png',
    'bremen': 'https://media.api-sports.io/football/teams/162.png',
    'wolfsburg': 'https://media.api-sports.io/football/teams/161.png',
    'monchengladbach': 'https://media.api-sports.io/football/teams/163.png',

    // Autres grands d'Europe
    'benfica': 'https://media.api-sports.io/football/teams/211.png',
    'porto': 'https://media.api-sports.io/football/teams/212.png',
    'sporting': 'https://media.api-sports.io/football/teams/228.png',
    'ajax': 'https://media.api-sports.io/football/teams/194.png',
    'psv': 'https://media.api-sports.io/football/teams/197.png',
    'feyenoord': 'https://media.api-sports.io/football/teams/209.png',
    'celtic': 'https://media.api-sports.io/football/teams/247.png',
    'rangers': 'https://media.api-sports.io/football/teams/257.png'
};

// SYSTÈME DE TIERS & POIDS DES CLUBS BASÉ SUR L'AUDIENCE ET LA HYPE ACTUELLE
const CONTEMPORARY_CLUB_TIERS = [
    // TIER S (200 pts) : Les méga-stars du foot mondial (audience maximale en France et Europe)
    { weight: 200, keywords: ['real madrid', 'barcelon', 'barca', 'arsenal', 'manchester city', 'man city', 'liverpool', 'paris', 'psg', 'bayern'] },

    // TIER A (130 pts) : Poids lourds Premier League & gros calibres européens
    { weight: 130, keywords: ['chelsea', 'manchester united', 'man united', 'tottenham', 'spurs', 'atletico', 'atlético', 'leverkusen'] },

    // TIER B (80 pts) : Grands clubs historiques & Cadors nationaux
    { weight: 80, keywords: ['inter', 'juventus', 'juve', 'milan', 'ac milan', 'napoli', 'naples', 'dortmund', 'marseille', 'om', 'monaco', 'aston villa', 'newcastle'] },

    // TIER C (40 pts) : Clubs européens réguliers & haut de tableau
    { weight: 40, keywords: ['lyon', 'ol', 'lille', 'losc', 'atalanta', 'roma', 'lazio', 'bilbao', 'athletic', 'sociedad', 'seville', 'sevilla', 'leipzig', 'benfica', 'sporting', 'porto', 'ajax', 'rennes', 'lens', 'nice'] }
];

// BONUS PAR COMPÉTITION (Pondéré selon l'intérêt des téléspectateurs français)
const LEAGUE_BONUSES = [
    { key: 'champions league', bonus: 150 },
    { key: 'ligue des champions', bonus: 150 },
    { key: 'world cup', bonus: 200 },
    { key: 'coupe du monde', bonus: 200 },
    { key: 'euro', bonus: 180 },
    { key: 'premier league', bonus: 60 },
    { key: 'liga', bonus: 40 },
    { key: 'ligue 1', bonus: 35 },
    { key: 'serie a', bonus: 20 },
    { key: 'bundesliga', bonus: 20 },
    { key: 'europa league', bonus: 40 },
    { key: 'nations league', bonus: 35 },
    { key: 'conference', bonus: 15 }
];

/**
 * Calcule le rang/poids actuel d'un club
 */
function getClubWeight(teamName) {
    if (!teamName) return 15;
    const lower = String(teamName).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const tier of CONTEMPORARY_CLUB_TIERS) {
        if (tier.keywords.some(k => lower.includes(k))) {
            return tier.weight;
        }
    }
    return 15; // Club standard
}

/**
 * Calcule le bonus de la compétition
 */
function getLeagueBonus(compName) {
    if (!compName) return 10;
    const lower = String(compName).toLowerCase();
    for (const item of LEAGUE_BONUSES) {
        if (lower.includes(item.key)) {
            return item.bonus;
        }
    }
    return 10;
}

/**
 * Calcule le score d'importance (Hype Score)
 * Le club phare pèse très lourd, et si les deux sont du top tier, le match passe immédiatement au sommet.
 */
function calculateMatchHypeScore(homeTeam, awayTeam, competition) {
    const w1 = getClubWeight(homeTeam);
    const w2 = getClubWeight(awayTeam);
    const maxW = Math.max(w1, w2);
    const minW = Math.min(w1, w2);
    const leagueBonus = getLeagueBonus(competition);

    return (maxW * 100) + (minW * 25) + (w1 * w2 * 0.5) + leagueBonus;
}

/**
 * Vérifie si une équipe est un grand club reconnu
 */
function isBigClub(teamName) {
    return getClubWeight(teamName) >= 40;
}

// COMPÉTITIONS MAJEURES D'ÉLITE
const TOP_TIER_COMPETITIONS = [
    { key: 'champions league', name: 'UEFA Champions League', allMatches: true },
    { key: 'ligue des champions', name: 'UEFA Champions League', allMatches: true },
    { key: 'europa league', name: 'UEFA Europa League', allMatches: false },
    { key: 'ligue europa', name: 'UEFA Europa League', allMatches: false },
    { key: 'conference league', name: 'UEFA Conference League', allMatches: false },
    { key: 'conference', name: 'UEFA Conference League', allMatches: false },
    { key: 'ligue 1', name: 'Ligue 1 McDonald\'s', allMatches: false },
    { key: 'premier league', name: 'Premier League', allMatches: false },
    { key: 'liga', name: 'LaLiga EA Sports', allMatches: false },
    { key: 'serie a', name: 'Serie A', allMatches: false },
    { key: 'bundesliga', name: 'Bundesliga', allMatches: false },
    { key: 'world cup', name: 'Coupe du Monde FIFA', allMatches: true },
    { key: 'coupe du monde', name: 'Coupe du Monde FIFA', allMatches: true },
    { key: 'euro', name: 'UEFA Euro', allMatches: true },
    { key: 'nations league', name: 'Ligue des Nations UEFA', allMatches: true },
    { key: 'ligue des nations', name: 'Ligue des Nations UEFA', allMatches: true },
    { key: 'copa america', name: 'Copa América', allMatches: true }
];

// DIVISIONS & LIGUES STRICTEMENT REJETÉES
const EXCLUDED_KEYWORDS = [
    'championship', 'ligue 2', 'ligue 3', 'national', 'serie b', 'segunda',
    '2. bundesliga', 'd2', 'd3', 'u19', 'u21', 'u20', 'u23', 'd1 fem', 'féminine', 'fem.',
    'japon', 'turquie', 'suisse', 'belgique', 'ecosse', 'danemark', 'grece',
    'autriche', 'croatie', 'roumanie', 'arabie', 'mls'
];

/**
 * Valide et identifie si la compétition est une grande scène
 */
function identifyTopStageCompetition(rawComp) {
    if (!rawComp) return null;
    const lower = String(rawComp).toLowerCase();

    for (const ex of EXCLUDED_KEYWORDS) {
        if (lower.includes(ex)) return null;
    }

    for (const comp of TOP_TIER_COMPETITIONS) {
        if (lower.includes(comp.key)) {
            return comp;
        }
    }

    return null;
}

/**
 * Nettoie le nom du club
 */
function cleanTeamName(raw) {
    if (!raw) return '';
    return String(raw)
        .replace(/\s*Fém\..*$/i, '')
        .replace(/\s*Féminin.*$/i, '')
        .replace(/\s*U\d+.*$/i, '')
        .replace(/\s*OL$/i, '')
        .replace(/\s*B\.$/i, '')
        .replace(/·/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Étape B : Récupère le logo d'une équipe (Table HD ou TheSportsDB avec User-Agent)
 */
async function fetchTeamLogo(teamName) {
    const clean = cleanTeamName(teamName);
    if (!clean) return DEFAULT_FOOTBALL_SHIELD_SVG;

    const cacheKey = clean.toLowerCase();

    // 1. Vérifier le cache mémoire
    if (teamLogoCache.has(cacheKey)) {
        return teamLogoCache.get(cacheKey);
    }

    // 2. Recherche directe dans la table des logos HD officiels
    if (MAJOR_TEAM_LOGOS[cacheKey]) {
        const logo = MAJOR_TEAM_LOGOS[cacheKey];
        teamLogoCache.set(cacheKey, logo);
        return logo;
    }

    for (const [key, logoUrl] of Object.entries(MAJOR_TEAM_LOGOS)) {
        if (cacheKey.includes(key) || key.includes(cacheKey)) {
            teamLogoCache.set(cacheKey, logoUrl);
            return logoUrl;
        }
    }

    // 3. Appel API TheSportsDB avec User-Agent navigateur (évite le blocage Cloudflare)
    try {
        const query = encodeURIComponent(clean);
        const url = `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${query}`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*'
            },
            signal: AbortSignal.timeout(3500)
        });

        if (res.ok) {
            const data = await res.json();
            const badge = data?.teams?.[0]?.strBadge || data?.teams?.[0]?.strTeamBadge || data?.teams?.[0]?.strLogo;
            if (badge) {
                teamLogoCache.set(cacheKey, badge);
                return badge;
            }
        }
    } catch (_) {}

    teamLogoCache.set(cacheKey, DEFAULT_FOOTBALL_SHIELD_SVG);
    return DEFAULT_FOOTBALL_SHIELD_SVG;
}

/**
 * Nettoie le nom d'une chaîne de télévision
 */
function cleanChannelName(rawAlt) {
    if (!rawAlt) return '';
    return String(rawAlt)
        .replace(/^match\s+/i, '')
        .replace(/\s+foot.*$/i, '')
        .replace(/\s+programme.*$/i, '')
        .replace(/\s+soir.*$/i, '')
        .replace(/\s+direct.*$/i, '')
        .trim();
}

let globalRawScrapedMatches = null;
let globalRawScrapedExpiresAt = 0;
const RAW_SCRAPE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Étape A : Scrape les matchs du jour et chaînes de diffusion
 */
async function scrapeTodayMatches() {
    const now = Date.now();
    if (globalRawScrapedMatches && globalRawScrapedExpiresAt > now) {
        return globalRawScrapedMatches;
    }

    try {
        const url = 'https://www.footao.tv/';
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
            },
            signal: AbortSignal.timeout(8000)
        });

        if (!response.ok) {
            throw new Error(`Échec du scraping des programmes TV (HTTP ${response.status})`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const todaySection = $('section').first();
        const rawMatches = [];

        todaySection.find('div[itemscope]').each((i, el) => {
            const time = $(el).find('time').text().trim() || '20:00';
            const matchTitle = $(el).find('[itemprop="name"]').text().trim();
            const rawComp = $(el).find('.ap a, .ap').text().trim();

            // 1. Filtrage grande compétition
            const compConfig = identifyTopStageCompetition(rawComp);
            if (!compConfig) return;

            let homeTeam = '';
            let awayTeam = '';

            if (matchTitle.includes('·')) {
                const parts = matchTitle.split('·').map(s => s.trim());
                homeTeam = parts[0];
                awayTeam = parts[1];
            } else if (matchTitle.includes(' - ')) {
                const parts = matchTitle.split(' - ').map(s => s.trim());
                homeTeam = parts[0];
                awayTeam = parts[1];
            } else if (matchTitle.includes(' vs ')) {
                const parts = matchTitle.split(' vs ').map(s => s.trim());
                homeTeam = parts[0];
                awayTeam = parts[1];
            }

            if (!homeTeam || !awayTeam) return;

            // 2. Filtrage "GRANDS CLUBS / TOP AFFICHE"
            const hasBigClub = isBigClub(homeTeam) || isBigClub(awayTeam);
            if (!compConfig.allMatches && !hasBigClub) {
                return;
            }

            const tvChannels = [];
            $(el).find('img.im').each((_, img) => {
                const alt = $(img).attr('alt') || '';
                const cleaned = cleanChannelName(alt);
                if (cleaned && !tvChannels.includes(cleaned)) {
                    tvChannels.push(cleaned);
                }
            });

            if (tvChannels.length === 0) {
                tvChannels.push('Chaîne à confirmer');
            }

            // 3. Calcul du score de prestige adapté aux audiences actuelles
            const hypeScore = calculateMatchHypeScore(homeTeam, awayTeam, compConfig.name);

            rawMatches.push({
                id: `match_${i + 1}`,
                competition: compConfig.name,
                time,
                homeTeamName: homeTeam,
                awayTeamName: awayTeam,
                tvChannels,
                hypeScore
            });
        });

        if (rawMatches.length > 0) {
            globalRawScrapedMatches = rawMatches;
            globalRawScrapedExpiresAt = now + RAW_SCRAPE_TTL_MS;
        }

        return rawMatches;
    } catch (scrapeErr) {
        console.warn('[Football Service] Avertissement scraping:', scrapeErr.message);
        if (globalRawScrapedMatches && globalRawScrapedMatches.length > 0) {
            return globalRawScrapedMatches;
        }
        throw scrapeErr;
    }
}

/**
 * Détermine les chaînes de diffusion adaptées au pays sélectionné
 */
function getBroadcastersForCountry(compName, scrapedChannels, countryConfig) {
    if (countryConfig.id === 'france') {
        if (Array.isArray(scrapedChannels) && scrapedChannels.length > 0 && !scrapedChannels.includes('Chaîne à confirmer')) {
            return scrapedChannels;
        }
        return ['Canal+', 'beIN Sports', 'DAZN'];
    }

    // Recherche dans les diffuseurs officiels configurés pour ce pays
    const compLower = String(compName || '').toLowerCase();
    for (const [key, channels] of Object.entries(countryConfig.broadcasters || {})) {
        if (compLower.includes(key)) {
            return channels;
        }
    }

    // Fallbacks stricts par région (JAMAIS de chaînes françaises pour l'Arabe/MENA/UK/USA/etc.)
    if (countryConfig.id === 'mena') {
        return ['beIN Sports 1 HD (عربي)', 'TOD'];
    }
    if (countryConfig.id === 'uk') {
        return ['Sky Sports Premier League', 'TNT Sports 1'];
    }
    if (countryConfig.id === 'spain') {
        return ['Movistar Plus+', 'DAZN LaLiga'];
    }
    if (countryConfig.id === 'usa') {
        return ['Paramount+', 'NBC Sports', 'ESPN+'];
    }
    if (countryConfig.id === 'italy') {
        return ['Sky Sport Uno', 'DAZN Italia'];
    }
    if (countryConfig.id === 'germany') {
        return ['Sky Sport Bundesliga', 'DAZN Deutschland'];
    }
    if (countryConfig.id === 'portugal') {
        return ['Sport TV 1', 'DAZN Eleven Sports'];
    }

    return ['Chaîne à confirmer'];
}

/**
 * Point d'entrée principal : Récupère les chocs majeurs, trie par prestige décroissant et met en cache par pays
 */
async function getTodayMatches(countryInput = 'france', forceRefresh = false) {
    const countryConfig = getCountryConfig(countryInput);
    const countryKey = countryConfig.id;
    const now = Date.now();

    const cachedEntry = countryCaches.get(countryKey);

    // Vérification du cache 1 heure pour ce pays
    if (!forceRefresh && cachedEntry && cachedEntry.expiresAt > now) {
        return {
            cached: true,
            country: countryConfig,
            matches: cachedEntry.data
        };
    }

    try {
        // Étape A & C : Scraping des matchs du jour filtrés sur les grands clubs
        const filtered = await scrapeTodayMatches();

        // Étape D : Tri intelligent (LES PLUS GRANDS CHOCS ET DUELS DE GÉANTS EN PREMIER)
        filtered.sort((a, b) => {
            if (b.hypeScore !== a.hypeScore) {
                return b.hypeScore - a.hypeScore; // Plus grand score en premier
            }
            return a.time.localeCompare(b.time); // En cas d'égalité, tri par heure
        });

        // Étape B : Récupération des logos HD et diffuseurs TV adaptés au pays
        const matches = await Promise.all(filtered.map(async (m) => {
            const [homeLogo, awayLogo] = await Promise.all([
                fetchTeamLogo(m.homeTeamName),
                fetchTeamLogo(m.awayTeamName)
            ]);

            const tvChannels = getBroadcastersForCountry(m.competition, m.tvChannels, countryConfig);

            return {
                id: m.id,
                competition: m.competition,
                time: m.time,
                homeTeam: {
                    name: m.homeTeamName,
                    logoUrl: homeLogo
                },
                awayTeam: {
                    name: m.awayTeamName,
                    logoUrl: awayLogo
                },
                tvChannels
            };
        }));

        // Mise en cache 1 heure pour ce pays
        countryCaches.set(countryKey, {
            data: matches,
            expiresAt: now + CACHE_TTL_MS
        });

        return {
            cached: false,
            country: countryConfig,
            matches
        };
    } catch (err) {
        console.error(`[Football Service] Erreur (${countryKey}):`, err.message);

        // Si le cache précédent existe pour ce pays, on le renvoie en secours
        if (cachedEntry) {
            return {
                cached: true,
                country: countryConfig,
                matches: cachedEntry.data
            };
        }

        throw err;
    }
}

/**
 * Nettoie le cache mémoire d'un pays ou de tous les pays
 */
function clearCache(countryInput = null) {
    if (countryInput) {
        const countryConfig = getCountryConfig(countryInput);
        countryCaches.delete(countryConfig.id);
    } else {
        countryCaches.clear();
    }
}

module.exports = {
    getTodayMatches,
    clearCache,
    fetchTeamLogo,
    isBigClub,
    calculateMatchHypeScore,
    getClubWeight,
    identifyTopStageCompetition,
    getCountryConfig,
    normalizeCountryCode,
    COUNTRY_CONFIGS,
    DEFAULT_FOOTBALL_SHIELD_SVG
};

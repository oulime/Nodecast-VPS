/**
 * Service Football - Scraping et diffusion de TOUS LES MATCHS DU JOUR
 * - Scrape l'intégralité du programme TV de football du jour (sans filtrage restrictif)
 * - Normalisation des compétitions (Ligue 1, Premier League, LaLiga, Serie A, Bundesliga, Coupes, etc.)
 * - Normalisation des équipes et logos HD garantis + fallback TheSportsDB
 * - Adaptation automatique des diffuseurs officiels selon le pays sélectionné
 * - Cache mémoire 1 heure avec rafraîchissement manuel possible
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
            'championship': ['beIN Sports 2', 'beIN Sports MAX 4'],
            'liga': ['beIN Sports 1', 'beIN Sports 2', 'DAZN'],
            'ligue 1': ['DAZN 1', 'beIN Sports 1', 'Ligue 1+'],
            'ligue 2': ['beIN Sports 1', 'beIN Sports 2'],
            'serie a': ['DAZN', 'beIN Sports'],
            'serie b': ['DAZN'],
            'bundesliga': ['beIN Sports 1', 'beIN Sports 2'],
            '2. bundesliga': ['beIN Sports MAX 5'],
            'portugal': ['beIN Sports 2', 'beIN Sports MAX 7'],
            'pays-bas': ['DAZN'],
            'belgique': ['DAZN'],
            'turquie': ['beIN Sports MAX 6'],
            'coupe de france': ['France 3', 'beIN Sports 1', 'YouTube'],
            'fa cup': ['beIN Sports 1', 'beIN Sports 2'],
            'copa del rey': ['L\'Équipe'],
            'coppa italia': ['L\'Équipe'],
            'dfb-pokal': ['L\'Équipe'],
            'world cup': ['TF1', 'beIN Sports 1'],
            'euro': ['TF1', 'M6', 'beIN Sports 1'],
            'nations league': ['TF1', 'L\'Équipe'],
            'saudi': ['Canal+ Sport 360', 'Canal+ Foot']
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
            'championship': ['Sky Sports Football', 'Sky Sports+'],
            'liga': ['Premier Sports 1', 'LaLigaTV', 'ITV4'],
            'ligue 1': ['TNT Sports 1', 'discovery+'],
            'serie a': ['TNT Sports 1', 'OneFootball'],
            'bundesliga': ['Sky Sports Football', 'Sky Sports Mix'],
            'portugal': ['TrillerTV+'],
            'pays-bas': ['TrillerTV+'],
            'belgique': ['TrillerTV+'],
            'turquie': ['TrillerTV+'],
            'super league': ['BBC Two', 'Sky Sports Football', 'YouTube'],
            'd1 fem': ['BBC Two', 'Sky Sports Football', 'YouTube'],
            'world cup': ['BBC One', 'ITV1', 'STV'],
            'euro': ['BBC One', 'ITV1'],
            'nations league': ['ITV1', 'Viaplay'],
            'fa cup': ['BBC One', 'ITV1'],
            'carabao': ['Sky Sports Football']
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
            'championship': ['DAZN 2'],
            'liga': ['DAZN LaLiga', 'M+ LaLiga TV', 'Gol Play'],
            'ligue 1': ['Eurosport 1', 'DAZN'],
            'serie a': ['DAZN 1', 'Movistar+'],
            'bundesliga': ['DAZN 2', 'Movistar+'],
            'portugal': ['RTP Internacional'],
            'world cup': ['RTVE La 1', 'Gol Mundial', 'Movistar Plus+'],
            'euro': ['RTVE La 1', 'La 2', 'Teledeporte'],
            'nations league': ['RTVE La 1'],
            'copa del rey': ['RTVE La 1', 'Movistar Plus+']
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
            'championship': ['ESPN+'],
            'liga': ['ESPN+', 'ESPN Deportes', 'ABC'],
            'ligue 1': ['beIN Sports USA', 'beIN Sports en Español', 'Fubo'],
            'serie a': ['Paramount+', 'CBS Sports Golazo Network'],
            'bundesliga': ['ESPN+', 'ESPN App'],
            'portugal': ['GOLTV'],
            'pays-bas': ['ESPN+'],
            'belgique': ['ESPN+'],
            'super league': ['CBS Sports Network', 'Paramount+'],
            'd1 fem': ['CBS Sports Network', 'NWSL+'],
            'world cup': ['FOX', 'FS1', 'Telemundo', 'Peacock'],
            'euro': ['FOX', 'FS1', 'Fubo Sports'],
            'nations league': ['FOX Sports', 'ViX'],
            'mls': ['Apple TV MLS Season Pass', 'FOX'],
            'fa cup': ['ESPN+'],
            'copa del rey': ['ESPN+']
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
            'serie b': ['DAZN Italia', 'Sky Sport Calcio'],
            'bundesliga': ['Sky Sport Uno', 'Sky Sport Calcio'],
            'world cup': ['Rai 1', 'Rai Sport', 'RaiPlay'],
            'euro': ['Rai 1', 'Sky Sport Uno'],
            'nations league': ['Rai 1', 'RaiPlay'],
            'coppa italia': ['Canale 5', 'Italia 1']
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
            '2. bundesliga': ['Sky Sport Bundesliga 2'],
            'dfb-pokal': ['Sky Sport', 'ARD', 'ZDF'],
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
            'championship': ['beIN Sports 3 HD (عربي)'],
            'liga': ['beIN Sports 1 HD (عربي)', 'beIN Sports 3 HD (عربي)', 'TOD'],
            'ligue 1': ['beIN Sports 4 HD (عربي)', 'beIN Sports 1 HD (عربي)'],
            'ligue 2': ['beIN Sports 4 HD (عربي)'],
            'serie a': ['Abu Dhabi Sports Premium 1 (أبوظبي)', 'STARZPLAY', 'AD Sports 2 HD'],
            'bundesliga': ['beIN Sports 5 HD (عربي)', 'beIN Sports HD', 'TOD'],
            '2. bundesliga': ['beIN Sports 5 HD (عربي)'],
            'portugal': ['SSC 1 HD (السعودية)', 'beIN Sports HD'],
            'turquie': ['beIN Sports HD (عربي)'],
            'pays-bas': ['Abu Dhabi Sports HD'],
            'belgique': ['Abu Dhabi Sports HD'],
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
            'championship': ['Sport TV 3'],
            'liga': ['DAZN Eleven Sports 2', 'DAZN 3'],
            'portugal': ['Sport TV 1', 'Sport TV 2', 'BTV'],
            'ligue 1': ['Sport TV 4'],
            'serie a': ['Sport TV 2', 'Sport TV 3'],
            'bundesliga': ['DAZN Eleven Sports 3'],
            'pays-bas': ['Sport TV 5'],
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

    if (/[\u0600-\u06FF]/.test(s) || /(arabe|arabic|arab|mena|oriental|maghreb|maroc|morocco|algerie|algeria|tunisie|tunisia|egypt|egypte|saudi|saoudite|qatar|emirats|uae|kuwait|koweit|bahrain|oman|iraq|irak|jordan|jordanie|lebanon|liban|libya|libye|sudan|soudan|yemen|syria|syrie|palestine|\b(ar|dz|ma|tn|eg|sa|ae|qa|kw|om|bh|iq|jo|lb|ly|sd|ye|sy)\b)/i.test(s)) {
        return 'mena';
    }
    if (/(uk|gb|gbr|england|angleterre|united kingdom|great britain|royaume uni|royaume-uni|\b(uk|gb)\b)/i.test(s)) return 'uk';
    if (/(spain|espagne|espana|españa|spanish|\b(es|esp)\b)/i.test(s)) return 'spain';
    if (/(usa|us|united states|etats unis|etats-unis|états-unis|america|amerique|amérique|\b(us|usa)\b)/i.test(s)) return 'usa';
    if (/(italy|italie|italia|italian|\b(it|ita)\b)/i.test(s)) return 'italy';
    if (/(germany|allemagne|deutschland|german|\b(de|deu|ger)\b)/i.test(s)) return 'germany';
    if (/(portugal|portugais|portuguese|\b(pt|prt)\b)/i.test(s)) return 'portugal';
    return 'france';
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
    'man u': 'https://media.api-sports.io/football/teams/33.png',
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
    'sheffield united': 'https://media.api-sports.io/football/teams/62.png',
    'coventry': 'https://media.api-sports.io/football/teams/1359.png',
    'leicester': 'https://media.api-sports.io/football/teams/46.png',
    'leeds': 'https://media.api-sports.io/football/teams/63.png',
    'southampton': 'https://media.api-sports.io/football/teams/41.png',
    'ipswich': 'https://media.api-sports.io/football/teams/57.png',
    'birmingham': 'https://media.api-sports.io/football/teams/58.png',
    'charlton': 'https://media.api-sports.io/football/teams/59.png',

    // Espagne
    'real madrid': 'https://media.api-sports.io/football/teams/541.png',
    'barcelone': 'https://media.api-sports.io/football/teams/529.png',
    'barcelona': 'https://media.api-sports.io/football/teams/529.png',
    'barca': 'https://media.api-sports.io/football/teams/529.png',
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
    'celta': 'https://media.api-sports.io/football/teams/538.png',
    'mallorca': 'https://media.api-sports.io/football/teams/798.png',
    'getafe': 'https://media.api-sports.io/football/teams/546.png',
    'levante': 'https://media.api-sports.io/football/teams/539.png',
    'malaga': 'https://media.api-sports.io/football/teams/534.png',
    'la corogne': 'https://media.api-sports.io/football/teams/542.png',
    'deportivo': 'https://media.api-sports.io/football/teams/542.png',
    'espanyol': 'https://media.api-sports.io/football/teams/540.png',
    'girona': 'https://media.api-sports.io/football/teams/547.png',

    // France
    'paris': 'https://media.api-sports.io/football/teams/85.png',
    'psg': 'https://media.api-sports.io/football/teams/85.png',
    'paris sg': 'https://media.api-sports.io/football/teams/85.png',
    'paris saint-germain': 'https://media.api-sports.io/football/teams/85.png',
    'marseille': 'https://media.api-sports.io/football/teams/81.png',
    'om': 'https://media.api-sports.io/football/teams/81.png',
    'lyon': 'https://media.api-sports.io/football/teams/80.png',
    'ol': 'https://media.api-sports.io/football/teams/80.png',
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
    'le mans': 'https://media.api-sports.io/football/teams/112.png',
    'troyes': 'https://media.api-sports.io/football/teams/110.png',
    'metz': 'https://media.api-sports.io/football/teams/111.png',
    'angers': 'https://media.api-sports.io/football/teams/77.png',
    'havre': 'https://media.api-sports.io/football/teams/115.png',

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
    'bologne': 'https://media.api-sports.io/football/teams/500.png',
    'torino': 'https://media.api-sports.io/football/teams/503.png',
    'sassuolo': 'https://media.api-sports.io/football/teams/488.png',
    'cagliari': 'https://media.api-sports.io/football/teams/490.png',
    'genoa': 'https://media.api-sports.io/football/teams/495.png',
    'verona': 'https://media.api-sports.io/football/teams/504.png',
    'lecce': 'https://media.api-sports.io/football/teams/867.png',
    'monza': 'https://media.api-sports.io/football/teams/1579.png',
    'parma': 'https://media.api-sports.io/football/teams/523.png',
    'como': 'https://media.api-sports.io/football/teams/895.png',

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
    'wolfsbourg': 'https://media.api-sports.io/football/teams/161.png',
    'monchengladbach': 'https://media.api-sports.io/football/teams/163.png',
    'hambourg': 'https://media.api-sports.io/football/teams/176.png',
    'heidenheim': 'https://media.api-sports.io/football/teams/180.png',
    'holstein': 'https://media.api-sports.io/football/teams/191.png',
    'elversberg': 'https://media.api-sports.io/football/teams/185.png',
    'st. pauli': 'https://media.api-sports.io/football/teams/186.png',

    // Portugal
    'benfica': 'https://media.api-sports.io/football/teams/211.png',
    'porto': 'https://media.api-sports.io/football/teams/212.png',
    'sporting': 'https://media.api-sports.io/football/teams/228.png',
    'sporting cp': 'https://media.api-sports.io/football/teams/228.png',
    'braga': 'https://media.api-sports.io/football/teams/217.png',
    'famalicao': 'https://media.api-sports.io/football/teams/223.png',
    'gil vicente': 'https://media.api-sports.io/football/teams/225.png',
    'vitoria guimaraes': 'https://media.api-sports.io/football/teams/224.png',

    // Pays-Bas
    'ajax': 'https://media.api-sports.io/football/teams/194.png',
    'psv': 'https://media.api-sports.io/football/teams/197.png',
    'feyenoord': 'https://media.api-sports.io/football/teams/209.png',
    'zwolle': 'https://media.api-sports.io/football/teams/204.png',
    'sparta rotterdam': 'https://media.api-sports.io/football/teams/208.png',
    'az alkmaar': 'https://media.api-sports.io/football/teams/201.png',

    // Belgique
    'club bruges': 'https://media.api-sports.io/football/teams/569.png',
    'anderlecht': 'https://media.api-sports.io/football/teams/582.png',
    'anvers': 'https://media.api-sports.io/football/teams/740.png',
    'antwerp': 'https://media.api-sports.io/football/teams/740.png',
    'genk': 'https://media.api-sports.io/football/teams/739.png',
    'gent': 'https://media.api-sports.io/football/teams/742.png',
    'la gantoise': 'https://media.api-sports.io/football/teams/742.png',
    'union sg': 'https://media.api-sports.io/football/teams/741.png',

    // Turquie
    'galatasaray': 'https://media.api-sports.io/football/teams/645.png',
    'fenerbahce': 'https://media.api-sports.io/football/teams/611.png',
    'besiktas': 'https://media.api-sports.io/football/teams/553.png',
    'trabzonspor': 'https://media.api-sports.io/football/teams/607.png',
    'kocaeli': 'https://media.api-sports.io/football/teams/608.png',

    // Écosse
    'celtic': 'https://media.api-sports.io/football/teams/247.png',
    'rangers': 'https://media.api-sports.io/football/teams/257.png',

    // Arabie Saoudite
    'al hilal': 'https://media.api-sports.io/football/teams/2524.png',
    'al nassr': 'https://media.api-sports.io/football/teams/2522.png',
    'al ittihad': 'https://media.api-sports.io/football/teams/2523.png',
    'al ahli': 'https://media.api-sports.io/football/teams/2521.png',

    // International / Sélections
    'france': 'https://media.api-sports.io/football/teams/2.png',
    'espagne': 'https://media.api-sports.io/football/teams/9.png',
    'angleterre': 'https://media.api-sports.io/football/teams/10.png',
    'allemagne': 'https://media.api-sports.io/football/teams/25.png',
    'italie': 'https://media.api-sports.io/football/teams/768.png',
    'portugal': 'https://media.api-sports.io/football/teams/27.png',
    'bresil': 'https://media.api-sports.io/football/teams/6.png',
    'argentine': 'https://media.api-sports.io/football/teams/26.png',
    'maroc': 'https://media.api-sports.io/football/teams/31.png',
    'algerie': 'https://media.api-sports.io/football/teams/32.png',
    'tunisie': 'https://media.api-sports.io/football/teams/28.png',
    'egypte': 'https://media.api-sports.io/football/teams/30.png'
};

/**
 * Nettoie le nom d'un club et étend les abréviations courantes
 */
function cleanTeamName(raw) {
    if (!raw) return '';
    let name = String(raw)
        .replace(/·/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const replacements = [
        { regex: /^Manchester U\.?$/i, replace: 'Manchester United' },
        { regex: /^Manchester C\.?$/i, replace: 'Manchester City' },
        { regex: /^Man United$/i, replace: 'Manchester United' },
        { regex: /^Man City$/i, replace: 'Manchester City' },
        { regex: /^Sheffield U\.?$/i, replace: 'Sheffield United' },
        { regex: /^Crystal P\.?$/i, replace: 'Crystal Palace' },
        { regex: /^R\.?\s*Sociedad$/i, replace: 'Real Sociedad' },
        { regex: /^R\.?\s*Madrid$/i, replace: 'Real Madrid' },
        { regex: /^R\.?\s*Betis$/i, replace: 'Real Betis' },
        { regex: /^Sporting C\.?\s*P\.?$/i, replace: 'Sporting CP' },
        { regex: /^Gil V\.?$/i, replace: 'Gil Vicente' },
        { regex: /^Rotterdam S\.?$/i, replace: 'Sparta Rotterdam' },
        { regex: /^Paris PSG$/i, replace: 'Paris SG' },
        { regex: /^Lyon OL$/i, replace: 'Lyon' },
        { regex: /^Levante UD$/i, replace: 'Levante' },
        { regex: /^Celta$/i, replace: 'Celta Vigo' }
    ];

    for (const item of replacements) {
        if (item.regex.test(name)) {
            return item.replace;
        }
    }

    return name;
}

/**
 * Nettoie et normalise le nom d'une compétition
 */
function formatCompetitionName(rawComp) {
    if (!rawComp) return 'Football';
    let str = String(rawComp).trim();
    
    // Dé-duplication des chaînes doublées (ex: "LigaLiga", "Premier LeaguePremier League")
    const halfLen = Math.floor(str.length / 2);
    if (halfLen > 2 && str.slice(0, halfLen) === str.slice(halfLen)) {
        str = str.slice(0, halfLen).trim();
    }

    const lower = str.toLowerCase();
    if (lower.includes('champions league') || lower.includes('ligue des champions')) return 'UEFA Champions League';
    if (lower.includes('europa league') || lower.includes('ligue europa')) return 'UEFA Europa League';
    if (lower.includes('conference league') || lower.includes('conference')) return 'UEFA Conference League';
    if (lower.includes('premier league')) return 'Premier League';
    if (lower.includes('championship')) return 'Championship';
    if (lower.includes('2. bundesliga') || lower.includes('d2 allemagne')) return '2. Bundesliga';
    if (lower.includes('bundesliga')) return 'Bundesliga';
    if (lower.includes('d1 portugal') || lower.includes('liga portugal')) return 'Liga Portugal';
    if (lower.includes('d1 pays-bas') || lower.includes('eredivisie')) return 'Eredivisie';
    if (lower.includes('d1 belgique') || lower.includes('pro league')) return 'Jupiler Pro League';
    if (lower.includes('d1 turquie') || lower.includes('super lig') || lower.includes('süper lig')) return 'Süper Lig';
    if (lower.includes('d1 fem. angleterre') || lower.includes('wsl')) return 'Super League Féminine (ANG)';
    if (lower.includes('d1 fem. allemagne')) return 'Frauen-Bundesliga (ALL)';
    if (lower.includes('d1 fem') || lower.includes('féminine') || lower.includes('fem.')) return 'D1 Féminine';
    if (lower.includes('ligue 1')) return 'Ligue 1';
    if (lower.includes('ligue 2')) return 'Ligue 2';
    if (lower.includes('serie a')) return 'Serie A';
    if (lower.includes('serie b')) return 'Serie B';
    if (lower.includes('liga') || lower.includes('laliga')) return 'LaLiga';
    if (lower.includes('coupe de france')) return 'Coupe de France';
    if (lower.includes('fa cup')) return 'FA Cup';
    if (lower.includes('copa del rey')) return 'Copa del Rey';
    if (lower.includes('coppa italia')) return 'Coppa Italia';
    if (lower.includes('dfb-pokal') || lower.includes('dfb pokal')) return 'DFB-Pokal';
    if (lower.includes('world cup') || lower.includes('coupe du monde')) return 'Coupe du Monde FIFA';
    if (lower.includes('euro') && !lower.includes('europa')) return 'UEFA Euro';
    if (lower.includes('nations league') || lower.includes('ligue des nations')) return 'Ligue des Nations';
    if (lower.includes('saudi') || lower.includes('arabie saoudite')) return 'Saudi Pro League';
    if (lower.includes('mls')) return 'MLS';

    return str;
}

/**
 * Étape B : Récupère le logo d'une équipe (Table HD ou TheSportsDB avec User-Agent)
 */
async function fetchTeamLogo(teamName) {
    if (!teamName) return DEFAULT_FOOTBALL_SHIELD_SVG;
    const clean = String(teamName).toLowerCase().replace(/\s+/g, ' ').trim();
    if (!clean) return DEFAULT_FOOTBALL_SHIELD_SVG;

    // 1. Vérifier le cache mémoire
    if (teamLogoCache.has(clean)) {
        return teamLogoCache.get(clean);
    }

    // 2. Recherche directe dans la table des logos HD officiels
    if (MAJOR_TEAM_LOGOS[clean]) {
        const logo = MAJOR_TEAM_LOGOS[clean];
        teamLogoCache.set(clean, logo);
        return logo;
    }

    for (const [key, logoUrl] of Object.entries(MAJOR_TEAM_LOGOS)) {
        if (clean === key || clean.includes(key) || key.includes(clean)) {
            teamLogoCache.set(clean, logoUrl);
            return logoUrl;
        }
    }

    // 3. Appel API TheSportsDB avec User-Agent navigateur
    try {
        const query = encodeURIComponent(clean.replace(/\s*fém.*$/i, '').replace(/\s*u\d+.*$/i, '').trim());
        const url = `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${query}`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*'
            },
            signal: AbortSignal.timeout(3000)
        });

        if (res.ok) {
            const data = await res.json();
            const badge = data?.teams?.[0]?.strBadge || data?.teams?.[0]?.strTeamBadge || data?.teams?.[0]?.strLogo;
            if (badge) {
                teamLogoCache.set(clean, badge);
                return badge;
            }
        }
    } catch (_) {}

    teamLogoCache.set(clean, DEFAULT_FOOTBALL_SHIELD_SVG);
    return DEFAULT_FOOTBALL_SHIELD_SVG;
}

/**
 * Nettoie le nom d'une chaîne de télévision
 */
function cleanChannelName(rawAlt) {
    if (!rawAlt) return '';
    return String(rawAlt)
        .replace(/^match\s+/i, '')
        .replace(/\s+(?:foot\s+)?programme\s+(?:tv|soir|direct|rediffusion).*$/i, '')
        .replace(/\s+programme.*$/i, '')
        .replace(/\s+soir.*$/i, '')
        .replace(/\s+direct.*$/i, '')
        .trim();
}

// SYSTÈME DE TIERS & POIDS DES CLUBS
const CONTEMPORARY_CLUB_TIERS = [
    { weight: 200, keywords: ['real madrid', 'barcelon', 'barca', 'arsenal', 'manchester city', 'man city', 'liverpool', 'paris', 'psg', 'bayern'] },
    { weight: 130, keywords: ['chelsea', 'manchester united', 'man united', 'man u', 'tottenham', 'spurs', 'atletico', 'atlético', 'leverkusen'] },
    { weight: 80, keywords: ['inter', 'juventus', 'juve', 'milan', 'ac milan', 'napoli', 'naples', 'dortmund', 'marseille', 'om', 'monaco', 'aston villa', 'newcastle'] },
    { weight: 40, keywords: ['lyon', 'ol', 'lille', 'losc', 'atalanta', 'roma', 'lazio', 'bilbao', 'athletic', 'sociedad', 'seville', 'sevilla', 'leipzig', 'benfica', 'sporting', 'porto', 'ajax', 'psv', 'feyenoord', 'galatasaray', 'fenerbahce', 'rennes', 'lens', 'nice'] }
];

function getClubWeight(teamName) {
    if (!teamName) return 15;
    const lower = String(teamName).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const tier of CONTEMPORARY_CLUB_TIERS) {
        if (tier.keywords.some(k => lower.includes(k))) {
            return tier.weight;
        }
    }
    return 15;
}

function calculateMatchHypeScore(homeTeam, awayTeam, competition) {
    const w1 = getClubWeight(homeTeam);
    const w2 = getClubWeight(awayTeam);
    const maxW = Math.max(w1, w2);
    const minW = Math.min(w1, w2);
    let leagueBonus = 10;
    const lowerComp = String(competition || '').toLowerCase();
    if (lowerComp.includes('champions league')) leagueBonus = 150;
    else if (lowerComp.includes('premier league')) leagueBonus = 60;
    else if (lowerComp.includes('liga')) leagueBonus = 40;
    else if (lowerComp.includes('ligue 1')) leagueBonus = 35;
    else if (lowerComp.includes('serie a')) leagueBonus = 30;
    else if (lowerComp.includes('bundesliga')) leagueBonus = 30;
    else if (lowerComp.includes('europa league')) leagueBonus = 40;

    return (maxW * 100) + (minW * 25) + (w1 * w2 * 0.5) + leagueBonus;
}

function isBigClub(teamName) {
    return getClubWeight(teamName) >= 40;
}

// DIVISIONS & LIGUES REJETÉES POUR LE SLIDER D'ACCUEIL (Seuls les chocs majeurs y figurent)
const EXCLUDED_HOME_KEYWORDS = [
    'championship', 'ligue 2', 'ligue 3', 'national', 'serie b', 'segunda',
    '2. bundesliga', 'd2', 'd3', 'u19', 'u21', 'u20', 'u23', 'd1 fem', 'féminine', 'fem.',
    'japon', 'turquie', 'suisse', 'belgique', 'ecosse', 'danemark', 'grece',
    'autriche', 'croatie', 'roumanie', 'arabie', 'mls'
];

/**
 * Valide si la compétition est éligible pour le slider d'accueil (Top Scènes)
 */
function identifyTopStageCompetition(rawComp) {
    if (!rawComp) return null;
    const lower = String(rawComp).toLowerCase();

    for (const ex of EXCLUDED_HOME_KEYWORDS) {
        if (lower.includes(ex)) return null;
    }

    if (lower.includes('2. bundesliga') || lower.includes('d2 allemagne')) return null;
    if (lower.includes('bundesliga')) return { key: 'bundesliga', name: 'Bundesliga', allMatches: false };
    if (lower.includes('champions league') || lower.includes('ligue des champions')) return { key: 'champions league', name: 'UEFA Champions League', allMatches: true };
    if (lower.includes('europa league') || lower.includes('ligue europa')) return { key: 'europa league', name: 'UEFA Europa League', allMatches: false };
    if (lower.includes('conference')) return { key: 'conference', name: 'UEFA Conference League', allMatches: false };
    if (lower.includes('premier league')) return { key: 'premier league', name: 'Premier League', allMatches: false };
    if (lower.includes('liga') || lower.includes('laliga')) return { key: 'liga', name: 'LaLiga', allMatches: false };
    if (lower.includes('serie a')) return { key: 'serie a', name: 'Serie A', allMatches: false };
    if (lower.includes('ligue 1')) return { key: 'ligue 1', name: 'Ligue 1', allMatches: false };
    if (lower.includes('world cup') || lower.includes('coupe du monde')) return { key: 'world cup', name: 'Coupe du Monde FIFA', allMatches: true };
    if (lower.includes('euro') && !lower.includes('europa')) return { key: 'euro', name: 'UEFA Euro', allMatches: true };
    if (lower.includes('nations league') || lower.includes('ligue des nations')) return { key: 'nations league', name: 'Ligue des Nations UEFA', allMatches: true };
    if (lower.includes('copa america')) return { key: 'copa america', name: 'Copa América', allMatches: true };

    return null;
}

let globalRawScrapedMatches = null;
let globalRawScrapedExpiresAt = 0;
const RAW_SCRAPE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Scrape tous les matchs du jour sur footao.tv
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
        let lastComp = 'Football';

        todaySection.find('div[itemscope]').each((i, el) => {
            const time = $(el).find('time').text().trim() || '20:00';
            const matchTitle = $(el).find('[itemprop="name"]').text().trim();
            let rawComp = $(el).find('.ap a, .ap').text().trim();

            if (rawComp === '»' || !rawComp) {
                rawComp = lastComp;
            } else {
                lastComp = rawComp;
            }

            const compName = formatCompetitionName(rawComp);

            let homeRaw = '';
            let awayRaw = '';

            if (matchTitle.includes('·')) {
                const parts = matchTitle.split('·').map(s => s.trim());
                homeRaw = parts[0];
                awayRaw = parts[1];
            } else if (matchTitle.includes(' - ')) {
                const parts = matchTitle.split(' - ').map(s => s.trim());
                homeRaw = parts[0];
                awayRaw = parts[1];
            } else if (matchTitle.includes(' vs ')) {
                const parts = matchTitle.split(' vs ').map(s => s.trim());
                homeRaw = parts[0];
                awayRaw = parts[1];
            }

            if (!homeRaw || !awayRaw) return;

            const homeTeam = cleanTeamName(homeRaw);
            const awayTeam = cleanTeamName(awayRaw);

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

            const hypeScore = calculateMatchHypeScore(homeTeam, awayTeam, compName);

            rawMatches.push({
                id: `match_${i + 1}`,
                competition: compName,
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

    const compLower = String(compName || '').toLowerCase();
    for (const [key, channels] of Object.entries(countryConfig.broadcasters || {})) {
        if (compLower.includes(key)) {
            return channels;
        }
    }

    if (countryConfig.id === 'mena') return ['beIN Sports 1 HD (عربي)', 'TOD'];
    if (countryConfig.id === 'uk') return ['Sky Sports Premier League', 'TNT Sports 1'];
    if (countryConfig.id === 'spain') return ['Movistar Plus+', 'DAZN LaLiga'];
    if (countryConfig.id === 'usa') return ['Paramount+', 'NBC Sports', 'ESPN+'];
    if (countryConfig.id === 'italy') return ['Sky Sport Uno', 'DAZN Italia'];
    if (countryConfig.id === 'germany') return ['Sky Sport Bundesliga', 'DAZN Deutschland'];
    if (countryConfig.id === 'portugal') return ['Sport TV 1', 'DAZN Eleven Sports'];

    return ['Chaîne à confirmer'];
}

// ==========================================
// MOTEUR DE SCORES TEMPS RÉEL (LIVE SCORES)
// ==========================================

const ESPN_LEAGUES = [
    'eng.1', 'eng.2', 'eng.league_cup', 'eng.fa',
    'esp.1', 'esp.2', 'esp.copa_del_rey',
    'fra.1', 'fra.2', 'fra.coupe_de_france',
    'ita.1', 'ita.2', 'ita.coppa_italia',
    'ger.1', 'ger.2', 'ger.dfb_pokal',
    'ned.1', 'por.1', 'tur.1', 'bel.1', 'sau.1',
    'uefa.champions', 'uefa.europa', 'uefa.europa.conf',
    'fifa.world', 'uefa.euro', 'uefa.nations', 'conmebol.copa_america'
];

let globalLiveScoresCache = null;
let globalLiveScoresExpiresAt = 0;
const LIVE_SCORES_TTL_MS = 45 * 1000; // 45 secondes pour un direct réactif

const TEAM_MATCHING_ALIASES = {
    'valence': 'valencia',
    'valence cf': 'valencia',
    'pise': 'pisa',
    'willem': 'willem ii',
    'seville': 'sevilla',
    'bologne': 'bologna',
    'rome': 'roma',
    'lazie': 'lazio',
    'milan ac': 'ac milan',
    'ac milan': 'milan',
    'inter milan': 'inter',
    'inter': 'internazionale',
    'barcelone': 'barcelona',
    'barca': 'barcelona',
    'atletico': 'atletico madrid',
    'atletico de madrid': 'atletico madrid',
    'bayern': 'bayern munich',
    'dortmund': 'borussia dortmund',
    'leverkusen': 'bayer leverkusen',
    'leipzig': 'rb leipzig',
    'sporting': 'sporting cp',
    'benfica': 'sl benfica',
    'porto': 'fc porto',
    'paris sg': 'psg',
    'paris saint germain': 'psg',
    'marseille': 'om',
    'lyon': 'ol',
    'saint etienne': 'asse'
};

function normalizeTeamForScoreMatching(str) {
    if (!str) return '';
    let s = String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/\b(fc|cf|sc|ac|as|rc|us|afc|ssc|cd|ca|ud|ogc|vfb|vfl|bvb|tsv|fsv|sv|rb|de|du|le|la|les|the|united|utd|city|town|hotspur|amsterdam)\b/g, ' ')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ').trim();

    for (const [k, v] of Object.entries(TEAM_MATCHING_ALIASES)) {
        if (s === k || s.includes(k)) {
            s = s.replace(k, v);
        }
    }
    return s.trim();
}

function calculateTeamMatchScore(s1, s2) {
    const n1 = normalizeTeamForScoreMatching(s1);
    const n2 = normalizeTeamForScoreMatching(s2);
    if (!n1 || !n2) return 0;
    if (n1 === n2) return 100;
    if (n1.includes(n2) || n2.includes(n1)) return 85;
    const t1 = n1.split(' ').filter(x => x.length >= 3);
    const t2 = n2.split(' ').filter(x => x.length >= 3);
    for (const a of t1) {
        for (const b of t2) {
            if (a === b || a.startsWith(b) || b.startsWith(a)) return 75;
        }
    }
    return 0;
}

/**
 * Récupère les scores et statuts en direct depuis le scoreboard multi-ligues
 */
async function fetchLiveScores() {
    const now = Date.now();
    if (globalLiveScoresCache && globalLiveScoresExpiresAt > now) {
        return globalLiveScoresCache;
    }

    const events = [];
    await Promise.all(ESPN_LEAGUES.map(async (league) => {
        try {
            const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard`;
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Accept': 'application/json'
                },
                signal: AbortSignal.timeout(4500)
            });
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data.events)) {
                data.events.forEach(ev => {
                    const comp = ev.competitions?.[0];
                    if (!comp) return;
                    const home = comp.competitors?.find(c => c.homeAway === 'home');
                    const away = comp.competitors?.find(c => c.homeAway === 'away');
                    events.push({
                        id: ev.id,
                        league,
                        leagueName: data.leagues?.[0]?.name || '',
                        name: ev.name || '',
                        date: ev.date || '',
                        state: ev.status?.type?.state || 'pre', // 'pre', 'in', 'post'
                        detail: ev.status?.type?.shortDetail || ev.status?.type?.detail || '',
                        clock: ev.status?.displayClock || '',
                        homeTeam: home?.team?.displayName || home?.team?.name || '',
                        homeScore: home?.score != null ? Number(home.score) : 0,
                        awayTeam: away?.team?.displayName || away?.team?.name || '',
                        awayScore: away?.score != null ? Number(away.score) : 0
                    });
                });
            }
        } catch (_) {}
    }));

    globalLiveScoresCache = events;
    globalLiveScoresExpiresAt = now + LIVE_SCORES_TTL_MS;
    return events;
}

/**
 * Enrichit un match avec son score en direct et son statut
 */
function enrichMatchWithLiveScore(match, liveEvents = []) {
    let bestEvent = null;
    let bestScore = 0;
    let isInverted = false;

    if (Array.isArray(liveEvents) && liveEvents.length > 0) {
        liveEvents.forEach(ev => {
            const hScoreDirect = calculateTeamMatchScore(match.homeTeam?.name || match.homeTeamName, ev.homeTeam);
            const aScoreDirect = calculateTeamMatchScore(match.awayTeam?.name || match.awayTeamName, ev.awayTeam);
            const totalDirect = hScoreDirect + aScoreDirect;

            const hScoreInv = calculateTeamMatchScore(match.homeTeam?.name || match.homeTeamName, ev.awayTeam);
            const aScoreInv = calculateTeamMatchScore(match.awayTeam?.name || match.awayTeamName, ev.homeTeam);
            const totalInv = hScoreInv + aScoreInv;

            if (totalDirect > bestScore && hScoreDirect > 0 && aScoreDirect > 0) {
                bestScore = totalDirect;
                bestEvent = ev;
                isInverted = false;
            } else if (totalInv > bestScore && hScoreInv > 0 && aScoreInv > 0) {
                bestScore = totalInv;
                bestEvent = ev;
                isInverted = true;
            }
        });
    }

    // Calcul temporel basé sur l'heure de coup d'envoi locale
    let diffMinutes = 9999;
    if (match.time) {
        const cleaned = String(match.time).trim().replace(/[hH.]/, ':');
        const parts = cleaned.match(/(\d{1,2})\s*:\s*(\d{2})/);
        if (parts) {
            const hours = parseInt(parts[1], 10);
            const minutes = parseInt(parts[2], 10);
            const now = new Date();
            const matchDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
            diffMinutes = Math.round((now.getTime() - matchDate.getTime()) / 60000);
        }
    }

    if (bestEvent) {
        const hScore = Number(isInverted ? bestEvent.awayScore : bestEvent.homeScore) || 0;
        const aScore = Number(isInverted ? bestEvent.homeScore : bestEvent.awayScore) || 0;

        if (bestEvent.state === 'in') {
            return {
                score: {
                    home: hScore,
                    away: aScore,
                    formatted: `${hScore} - ${aScore}`
                },
                status: 'live',
                minute: bestEvent.clock || bestEvent.detail || (diffMinutes > 0 ? `${diffMinutes}'` : 'En direct'),
                isLive: true
            };
        } else if (bestEvent.state === 'post') {
            return {
                score: {
                    home: hScore,
                    away: aScore,
                    formatted: `${hScore} - ${aScore}`
                },
                status: 'finished',
                minute: 'Terminé',
                isLive: false
            };
        } else {
            // État 'pre' sur ESPN, vérifier si l'heure du match est déjà atteinte
            if (diffMinutes > 0 && diffMinutes <= 115) {
                return {
                    score: {
                        home: hScore,
                        away: aScore,
                        formatted: `${hScore} - ${aScore}`
                    },
                    status: 'live',
                    minute: `${Math.min(90, Math.max(1, diffMinutes))}'`,
                    isLive: true
                };
            } else if (diffMinutes > 115) {
                return {
                    score: {
                        home: hScore,
                        away: aScore,
                        formatted: `${hScore} - ${aScore}`
                    },
                    status: 'finished',
                    minute: 'Terminé',
                    isLive: false
                };
            } else {
                return {
                    score: null,
                    status: diffMinutes >= -30 ? 'starting_soon' : 'scheduled',
                    minute: match.time,
                    isLive: false
                };
            }
        }
    }

    // Fallback temporel si le match n'est pas dans le flux ESPN
    if (diffMinutes > 0 && diffMinutes <= 115) {
        return {
            score: {
                home: 0,
                away: 0,
                formatted: '0 - 0'
            },
            status: 'live',
            minute: `${Math.min(90, Math.max(1, diffMinutes))}'`,
            isLive: true
        };
    } else if (diffMinutes > 115) {
        return {
            score: {
                home: 0,
                away: 0,
                formatted: '0 - 0'
            },
            status: 'finished',
            minute: 'Terminé',
            isLive: false
        };
    } else {
        return {
            score: null,
            status: diffMinutes >= -30 ? 'starting_soon' : 'scheduled',
            minute: match.time,
            isLive: false
        };
    }
}

/**
 * Point d'entrée principal :
 * - allMatches = false (défaut) : Filtre uniquement les GRANDS MATCHS pour le slider d'accueil (triés par hype)
 * - allMatches = true : Renvoie TOUS les matchs du jour pour la page /foot
 */
async function getTodayMatches(countryInput = 'france', forceRefresh = false, allMatches = false) {
    const countryConfig = getCountryConfig(countryInput);
    const countryKey = countryConfig.id;
    const cacheScopeKey = `${countryKey}_${allMatches ? 'all' : 'big'}`;
    const now = Date.now();

    const cachedEntry = countryCaches.get(cacheScopeKey);
    let baseMatches = null;

    if (!forceRefresh && cachedEntry && cachedEntry.expiresAt > now) {
        baseMatches = cachedEntry.data;
    } else {
        try {
            const rawList = await scrapeTodayMatches();

            // Mode Slider Accueil : Filtrage strict sur les grands chocs & top tiers
            let targetMatches = rawList;
            if (!allMatches) {
                targetMatches = rawList.filter(m => {
                    const compConfig = identifyTopStageCompetition(m.competition);
                    if (!compConfig) return false;
                    if (compConfig.allMatches) return true;
                    return isBigClub(m.homeTeamName) || isBigClub(m.awayTeamName);
                });

                // Tri par Hype Score décroissant pour l'accueil
                targetMatches.sort((a, b) => {
                    if (b.hypeScore !== a.hypeScore) {
                        return b.hypeScore - a.hypeScore;
                    }
                    return a.time.localeCompare(b.time);
                });
            }

            // Récupération des logos HD et diffuseurs TV adaptés au pays
            baseMatches = await Promise.all(targetMatches.map(async (m) => {
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
                    tvChannels,
                    hypeScore: m.hypeScore
                };
            }));

            countryCaches.set(cacheScopeKey, {
                data: baseMatches,
                expiresAt: now + CACHE_TTL_MS
            });
        } catch (err) {
            console.error(`[Football Service] Erreur (${countryKey}):`, err.message);

            if (cachedEntry) {
                baseMatches = cachedEntry.data;
            } else {
                throw err;
            }
        }
    }

    // Récupération des scores en direct & enrichissement instantané
    let liveEvents = [];
    try {
        liveEvents = await fetchLiveScores();
    } catch (_) {}

    const enrichedMatches = baseMatches.map(m => {
        const liveInfo = enrichMatchWithLiveScore(m, liveEvents);
        return {
            ...m,
            score: liveInfo.score,
            status: liveInfo.status,
            minute: liveInfo.minute,
            isLive: liveInfo.isLive
        };
    });

    return {
        cached: !!cachedEntry && !forceRefresh,
        country: countryConfig,
        matches: enrichedMatches
    };
}

/**
 * Nettoie le cache mémoire d'un pays ou de tous les pays
 */
function clearCache(countryInput = null) {
    if (countryInput) {
        const countryConfig = getCountryConfig(countryInput);
        countryCaches.delete(`${countryConfig.id}_all`);
        countryCaches.delete(`${countryConfig.id}_big`);
    } else {
        countryCaches.clear();
    }
    globalLiveScoresCache = null;
    globalLiveScoresExpiresAt = 0;
}

module.exports = {
    getTodayMatches,
    clearCache,
    fetchLiveScores,
    enrichMatchWithLiveScore,
    fetchTeamLogo,
    isBigClub,
    calculateMatchHypeScore,
    getClubWeight,
    formatCompetitionName,
    cleanTeamName,
    identifyTopStageCompetition,
    getCountryConfig,
    normalizeCountryCode,
    COUNTRY_CONFIGS,
    DEFAULT_FOOTBALL_SHIELD_SVG
};



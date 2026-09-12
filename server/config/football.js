/**
 * Configuration des compétitions majeures et diffuseurs TV français
 */

const MAJOR_COMPETITIONS = [
    {
        id: 'cl',
        name: 'UEFA Champions League',
        shortName: 'LDC',
        aliases: [
            'champions league',
            'uefa champions league',
            'ligue des champions',
            'ucl'
        ],
        theSportsDbLeagueIds: ['4480', '4481'],
        apiFootballLeagueIds: [2],
        logo: 'https://media.api-sports.io/football/leagues/2.png',
        defaultBroadcasters: ['Canal+', 'Canal+ Foot', 'beIN Sports 1'],
        order: 1
    },
    {
        id: 'el',
        name: 'UEFA Europa League',
        shortName: 'Ligue Europa',
        aliases: [
            'europa league',
            'uefa europa league',
            'ligue europa',
            'uel'
        ],
        theSportsDbLeagueIds: ['4481', '4482'],
        apiFootballLeagueIds: [3],
        logo: 'https://media.api-sports.io/football/leagues/3.png',
        defaultBroadcasters: ['Canal+', 'Canal+ Foot', 'Canal+ Live'],
        order: 2
    },
    {
        id: 'ecl',
        name: 'UEFA Conference League',
        shortName: 'Conférence',
        aliases: [
            'conference league',
            'uefa conference league',
            'uefa europa conference league',
            'uecl'
        ],
        theSportsDbLeagueIds: ['5071'],
        apiFootballLeagueIds: [848],
        logo: 'https://media.api-sports.io/football/leagues/848.png',
        defaultBroadcasters: ['Canal+ Foot', 'Canal+ Live'],
        order: 3
    },
    {
        id: 'l1',
        name: 'Ligue 1 McDonald\'s',
        shortName: 'Ligue 1',
        aliases: [
            'ligue 1',
            'french ligue 1',
            'ligue 1 uber eats',
            'ligue 1 mcdonald\'s',
            'ligue 1 mcdonalds'
        ],
        theSportsDbLeagueIds: ['4334'],
        apiFootballLeagueIds: [61],
        logo: 'https://media.api-sports.io/football/leagues/61.png',
        defaultBroadcasters: ['DAZN', 'beIN Sports 1'],
        order: 4
    },
    {
        id: 'pl',
        name: 'Premier League',
        shortName: 'Premier League',
        aliases: [
            'premier league',
            'english premier league',
            'epl',
            'fa premier league'
        ],
        theSportsDbLeagueIds: ['4328'],
        apiFootballLeagueIds: [39],
        logo: 'https://media.api-sports.io/football/leagues/39.png',
        defaultBroadcasters: ['Canal+', 'Canal+ Foot', 'Canal+ Premier'],
        order: 5
    },
    {
        id: 'liga',
        name: 'LaLiga EA Sports',
        shortName: 'La Liga',
        aliases: [
            'la liga',
            'laliga',
            'spanish la liga',
            'primera division',
            'laliga ea sports',
            'la liga santander'
        ],
        theSportsDbLeagueIds: ['4335'],
        apiFootballLeagueIds: [140],
        logo: 'https://media.api-sports.io/football/leagues/140.png',
        defaultBroadcasters: ['beIN Sports 1', 'beIN Sports 2'],
        order: 6
    },
    {
        id: 'seriea',
        name: 'Serie A Enilive',
        shortName: 'Serie A',
        aliases: [
            'serie a',
            'italian serie a',
            'serie a tim',
            'serie a enilive'
        ],
        theSportsDbLeagueIds: ['4332'],
        apiFootballLeagueIds: [135],
        logo: 'https://media.api-sports.io/football/leagues/135.png',
        defaultBroadcasters: ['beIN Sports 1', 'beIN Sports 2'],
        order: 7
    },
    {
        id: 'bundesliga',
        name: 'Bundesliga',
        shortName: 'Bundesliga',
        aliases: [
            'bundesliga',
            'german bundesliga',
            '1. bundesliga'
        ],
        theSportsDbLeagueIds: ['4331'],
        apiFootballLeagueIds: [78],
        logo: 'https://media.api-sports.io/football/leagues/78.png',
        defaultBroadcasters: ['beIN Sports 1', 'beIN Sports 2'],
        order: 8
    },
    {
        id: 'intl',
        name: 'Matchs Internationaux',
        shortName: 'Internationaux',
        aliases: [
            'world cup',
            'fifa world cup',
            'coupe du monde',
            'uefa nations league',
            'nations league',
            'ligue des nations',
            'euro',
            'uefa euro',
            'european championship',
            'copa america',
            'africa cup of nations',
            'can',
            'international friendlies',
            'world cup qualification',
            'euro qualification'
        ],
        theSportsDbLeagueIds: ['4429', '4430', '4867', '4432', '4431'],
        apiFootballLeagueIds: [1, 4, 5, 6, 9, 10, 15, 32, 33, 34],
        logo: 'https://media.api-sports.io/football/leagues/4.png',
        defaultBroadcasters: ['TF1', 'M6', 'La Chaîne L\'Équipe', 'beIN Sports 1'],
        order: 9
    }
];

// Map of Broadcaster brand styles and logos for frontend UI
const BROADCASTER_METADATA = {
    'canal+': { name: 'Canal+', color: '#111111', badgeBg: '#1f242e', textColor: '#ffffff', border: '#3b82f6' },
    'canal+ foot': { name: 'Canal+ Foot', color: '#0f172a', badgeBg: '#1e293b', textColor: '#38bdf8', border: '#0284c7' },
    'canal+ live': { name: 'Canal+ Live', color: '#18181b', badgeBg: '#27272a', textColor: '#f43f5e', border: '#e11d48' },
    'canal+ premier': { name: 'Canal+ Premier', color: '#18181b', badgeBg: '#27272a', textColor: '#a855f7', border: '#9333ea' },
    'bein sports 1': { name: 'beIN Sports 1', color: '#4a0e4e', badgeBg: '#3b0764', textColor: '#d8b4fe', border: '#a855f7' },
    'bein sports 2': { name: 'beIN Sports 2', color: '#4a0e4e', badgeBg: '#3b0764', textColor: '#c084fc', border: '#9333ea' },
    'bein sports': { name: 'beIN Sports', color: '#4a0e4e', badgeBg: '#3b0764', textColor: '#d8b4fe', border: '#a855f7' },
    'dazn': { name: 'DAZN', color: '#000000', badgeBg: '#18181b', textColor: '#facc15', border: '#eab308' },
    'tf1': { name: 'TF1', color: '#002b66', badgeBg: '#0f172a', textColor: '#60a5fa', border: '#2563eb' },
    'm6': { name: 'M6', color: '#991b1b', badgeBg: '#450a0a', textColor: '#f87171', border: '#dc2626' },
    'la chaîne l\'équipe': { name: 'L\'Équipe', color: '#991b1b', badgeBg: '#450a0a', textColor: '#fca5a5', border: '#ef4444' },
    'france 2': { name: 'France 2', color: '#991b1b', badgeBg: '#450a0a', textColor: '#fca5a5', border: '#ef4444' },
    'france 3': { name: 'France 3', color: '#1e3a8a', badgeBg: '#172554', textColor: '#93c5fd', border: '#3b82f6' },
    'prime video': { name: 'Prime Video', color: '#00a8e1', badgeBg: '#082f49', textColor: '#38bdf8', border: '#0284c7' },
    'rmc sport': { name: 'RMC Sport', color: '#991b1b', badgeBg: '#450a0a', textColor: '#f87171', border: '#ef4444' }
};

/**
 * Normalise un texte (suppression des accents, minuscules, espaces superflus)
 */
function normalizeString(str) {
    if (!str) return '';
    return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Détecte si une compétition correspond à l'une de nos compétitions majeures
 * @param {string|number} nameOrId Nom de la compétition ou ID
 * @returns {object|null} La configuration de la compétition ou null
 */
function identifyMajorCompetition(nameOrId) {
    if (!nameOrId) return null;

    const strValue = String(nameOrId).trim();
    const normalized = normalizeString(strValue);

    // 1. Recherche par ID direct
    for (const comp of MAJOR_COMPETITIONS) {
        if (comp.id === strValue.toLowerCase()) return comp;
        if (comp.theSportsDbLeagueIds && comp.theSportsDbLeagueIds.includes(strValue)) return comp;
        if (comp.apiFootballLeagueIds && comp.apiFootballLeagueIds.includes(Number(strValue))) return comp;
    }

    // 2. Recherche par alias / nom
    for (const comp of MAJOR_COMPETITIONS) {
        const compNorm = normalizeString(comp.name);
        if (normalized.includes(compNorm) || compNorm.includes(normalized)) {
            return comp;
        }
        for (const alias of comp.aliases) {
            const aliasNorm = normalizeString(alias);
            if (normalized.includes(aliasNorm) || aliasNorm.includes(normalized)) {
                return comp;
            }
        }
    }

    return null;
}

/**
 * Récupère les diffuseurs français recommandés pour un match
 */
function getFrenchBroadcasters(competitionConfig, homeTeam = '', awayTeam = '', rawBroadcasters = []) {
    if (Array.isArray(rawBroadcasters) && rawBroadcasters.length > 0) {
        const filtered = rawBroadcasters.filter(b => b && typeof b === 'string' && b.trim().length > 0);
        if (filtered.length > 0) return filtered;
    }

    if (!competitionConfig) return ['Chaîne à confirmer'];

    // Cas particulier France / Ligue 1 / Chocs
    const homeNorm = normalizeString(homeTeam);
    const awayNorm = normalizeString(awayTeam);

    if (competitionConfig.id === 'l1') {
        const topTeams = ['paris saint germain', 'psg', 'marseille', 'om', 'olympique lyonnais', 'lyon', 'monaco', 'lille', 'lens', 'rennes'];
        const isBigMatch = topTeams.some(t => homeNorm.includes(t)) && topTeams.some(t => awayNorm.includes(t));
        if (isBigMatch) {
            return ['DAZN', 'beIN Sports 1'];
        }
        return ['DAZN'];
    }

    if (competitionConfig.id === 'cl') {
        return ['Canal+', 'Canal+ Foot'];
    }

    if (competitionConfig.id === 'intl') {
        if (homeNorm.includes('france') || awayNorm.includes('france')) {
            return ['TF1'];
        }
        return ['La Chaîne L\'Équipe', 'beIN Sports 1'];
    }

    return competitionConfig.defaultBroadcasters || ['Chaîne à confirmer'];
}

module.exports = {
    MAJOR_COMPETITIONS,
    BROADCASTER_METADATA,
    normalizeString,
    identifyMajorCompetition,
    getFrenchBroadcasters
};

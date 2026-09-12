// NOUVEAU SYSTÈME DE POIDS 2026 BASÉ SUR L'AUDIENCE ET LA HYPE RÉELLE ACTUELLE
const CONTEMPORARY_CLUB_TIERS = [
    // TIER S : Les mastodontes mondiaux ultra-suivis & hypés (Score: 200)
    // Real Madrid, Barça, Arsenal, Man City, Liverpool, PSG, Bayern
    { weight: 200, keywords: ['real madrid', 'barcelon', 'barca', 'arsenal', 'manchester city', 'man city', 'liverpool', 'paris', 'psg', 'bayern'] },

    // TIER A : Cadors Premier League & gros calibres européens (Score: 130)
    // Chelsea, Man United, Tottenham, Atletico Madrid, Leverkusen
    { weight: 130, keywords: ['chelsea', 'manchester united', 'man united', 'tottenham', 'spurs', 'atletico', 'atlético', 'leverkusen'] },

    // TIER B : Grands clubs historiques & Chocs populaires France/Italie/Allemagne (Score: 80)
    // Inter, Juventus, Milan, Napoli, Dortmund, OM, Monaco, Aston Villa, Newcastle
    { weight: 80, keywords: ['inter', 'juventus', 'juve', 'milan', 'ac milan', 'napoli', 'naples', 'dortmund', 'marseille', 'om', 'monaco', 'aston villa', 'newcastle'] },

    // TIER C : Équipes européennes & haut de tableau (Score: 40)
    // Lyon, Lille, Atalanta, Roma, Lazio, Bilbao, Sociedad, Leipzig, Benfica, Sporting
    { weight: 40, keywords: ['lyon', 'ol', 'lille', 'losc', 'atalanta', 'roma', 'lazio', 'bilbao', 'athletic', 'sociedad', 'seville', 'sevilla', 'leipzig', 'benfica', 'sporting', 'porto', 'ajax', 'rennes', 'lens', 'nice'] }
];

const LEAGUE_BONUSES = [
    { key: 'champions league', bonus: 150 },
    { key: 'ligue des champions', bonus: 150 },
    { key: 'world cup', bonus: 200 },
    { key: 'euro', bonus: 180 },
    { key: 'premier league', bonus: 60 },
    { key: 'liga', bonus: 40 },
    { key: 'ligue 1', bonus: 35 },
    { key: 'serie a', bonus: 20 },
    { key: 'bundesliga', bonus: 20 },
    { key: 'europa league', bonus: 40 }
];

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

function calculateMatchHypeScore(homeTeam, awayTeam, competition) {
    const w1 = getClubWeight(homeTeam);
    const w2 = getClubWeight(awayTeam);
    const maxW = Math.max(w1, w2);
    const minW = Math.min(w1, w2);
    const leagueBonus = getLeagueBonus(competition);

    // Le club star (maxW) pèse très lourd, et si les DEUX sont des géants (w1 * w2), le match explose au sommet
    return (maxW * 100) + (minW * 25) + (w1 * w2 * 0.5) + leagueBonus;
}

const todayMatches = [
    { home: 'Real Madrid', away: 'Rayo V.', comp: 'LaLiga EA Sports', time: '21:00' },
    { home: 'Sunderland', away: 'Arsenal', comp: 'Premier League', time: '21:00' },
    { home: 'Tottenham', away: 'Everton', comp: 'Premier League', time: '18:30' },
    { home: 'Strasbourg', away: 'Monaco', comp: 'Ligue 1 McDonald\'s', time: '17:15' },
    { home: 'Sassuolo', away: 'Juventus', comp: 'Serie A', time: '18:00' },
    { home: 'Atalanta', away: 'Cagliari', comp: 'Serie A', time: '20:45' },
    { home: 'Bilbao', away: 'Elche', comp: 'LaLiga EA Sports', time: '18:30' }
];

todayMatches.forEach(m => {
    m.score = calculateMatchHypeScore(m.home, m.away, m.comp);
});

todayMatches.sort((a, b) => b.score - a.score);

console.log('--- NOUVEAU CLASSEMENT PAR HYPE ACTUELLE ---');
todayMatches.forEach((m, idx) => {
    console.log(`${idx + 1}. [Score: ${m.score.toFixed(0)}] ${m.comp} : ${m.home} (${getClubWeight(m.home)} pts) vs ${m.away} (${getClubWeight(m.away)} pts)`);
});

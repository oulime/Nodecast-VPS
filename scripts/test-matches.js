/**
 * Script de test pour l'API /api/matches/today
 * Vérifie :
 * 1. Mode Accueil (allMatches = false) : Curated Big Matches (Chocs majeurs uniquement)
 * 2. Mode /foot (allMatches = true) : Tous les matchs du jour au complet
 * 3. Support multi-pays & diffuseurs officiels
 */

const assert = require('assert');
const footballService = require('../server/services/footballService');

async function runTests() {
    console.log('🧪 Démarrage des tests Accueil (Grands Matchs) vs Page /foot (Tous les Matchs)...');

    // 1. Test ACCUEIL (Slider : Grands Matchs uniquement)
    footballService.clearCache();
    const resultHome = await footballService.getTodayMatches('france', true, false);

    assert(Array.isArray(resultHome.matches), 'resultHome.matches doit être un tableau');
    assert(resultHome.matches.length > 0, 'La liste des grands matchs ne doit pas être vide');
    assert(resultHome.matches.length < 20, 'Le slider d\'accueil doit rester compact et filtré aux grands matchs');
    console.log(`\n  ✓ [ACCUEIL SLIDER 🇫🇷] ${resultHome.matches.length} grands chocs sélectionnés pour la page d'accueil :`);

    resultHome.matches.forEach((m, idx) => {
        console.log(`    #${idx + 1} [${m.time}] [${m.competition}] : ${m.homeTeam.name} vs ${m.awayTeam.name} (${m.tvChannels.join(', ')})`);
    });

    // 2. Test PAGE /FOOT (Tous les matchs de la journée)
    const resultFootPage = await footballService.getTodayMatches('france', false, true);

    assert(Array.isArray(resultFootPage.matches), 'resultFootPage.matches doit être un tableau');
    assert(resultFootPage.matches.length >= resultHome.matches.length, 'La page /foot doit contenir tous les matchs');
    console.log(`\n  ✓ [PAGE /FOOT 🇫🇷] ${resultFootPage.matches.length} matchs au total récupérés pour la page /foot !`);

    // 3. Test UK (Royaume-Uni 🇬🇧)
    const resultUk = await footballService.getTodayMatches('uk', false, false);
    assert.strictEqual(resultUk.country.id, 'uk');
    console.log(`\n  ✓ [UK 🇬🇧 Accueil] ${resultUk.matches.length} grands matchs avec chaînes britanniques (ex: ${resultUk.matches[0].tvChannels.join(', ')})`);
    assert(resultUk.matches.some(m => m.tvChannels.some(c => c.includes('Sky') || c.includes('TNT Sports') || c.includes('Premier Sports') || c.includes('BBC'))), 'Doit contenir des diffuseurs UK');

    // 4. Test Spain (Espagne 🇪🇸)
    const resultEs = await footballService.getTodayMatches('spain', false, false);
    assert.strictEqual(resultEs.country.id, 'spain');
    console.log(`\n  ✓ [ESPAGNE 🇪🇸 Accueil] ${resultEs.matches.length} grands matchs avec chaînes espagnoles (ex: ${resultEs.matches[0].tvChannels.join(', ')})`);
    assert(resultEs.matches.some(m => m.tvChannels.some(c => c.includes('Movistar') || c.includes('DAZN') || c.includes('RTVE'))), 'Doit contenir des diffuseurs espagnols');

    // 5. Test USA (États-Unis 🇺🇸)
    const resultUs = await footballService.getTodayMatches('usa', false, false);
    assert.strictEqual(resultUs.country.id, 'usa');
    console.log(`\n  ✓ [USA 🇺🇸 Accueil] ${resultUs.matches.length} grands matchs avec chaînes américaines (ex: ${resultUs.matches[0].tvChannels.join(', ')})`);
    assert(resultUs.matches.some(m => m.tvChannels.some(c => c.includes('NBC') || c.includes('Peacock') || c.includes('Paramount+') || c.includes('ESPN') || c.includes('FOX'))), 'Doit contenir des diffuseurs USA');

    // 6. Test Monde Arabe / MENA (Arabe 🌍)
    footballService.clearCache('mena');
    const resultMena = await footballService.getTodayMatches('arabe', true, false);
    assert.strictEqual(resultMena.country.id, 'mena');
    console.log(`\n  ✓ [MONDE ARABE / ARABIC 🌍 Accueil] ${resultMena.matches.length} grands matchs avec chaînes arabes :`);
    resultMena.matches.forEach((m, idx) => {
        const hasFrenchChannels = m.tvChannels.some(c => /canal\+|tf1|m6|france\s*2|rmc\s*sport/i.test(c));
        assert(!hasFrenchChannels, `Le match ${m.homeTeam.name} ne doit PAS contenir de chaîne française en région Arabe : ${m.tvChannels.join(', ')}`);
    });

    assert(resultMena.matches.some(m => m.tvChannels.some(c => c.includes('beIN Sports') || c.includes('Abu Dhabi') || c.includes('TOD') || c.includes('SSC'))), 'Doit contenir des diffuseurs arabes');

    // 7. Test normalisation de TOUS les identifiants arabes possibles de VeloraVIP
    const arabVariants = [
        'arabe', 'arabic', 'arab', 'mena', 'maghreb', 'oriental',
        'country_arabe', 'country_arabic', 'country_arab', 'country_mena',
        'maroc', 'morocco', 'country_maroc', 'country_morocco', 'ma',
        'algerie', 'algeria', 'country_algerie', 'country_algeria', 'dz',
        'tunisie', 'tunisia', 'country_tunisie', 'country_tunisia', 'tn',
        'egypte', 'egypt', 'country_egypte', 'country_egypt', 'eg',
        'saudi', 'saoudite', 'arabie saoudite', 'country_saudi', 'sa',
        'qatar', 'country_qatar', 'qa',
        'uae', 'emirats', 'country_uae', 'ae',
        'kuwait', 'koweit', 'kw'
    ];

    arabVariants.forEach(variant => {
        assert.strictEqual(
            footballService.normalizeCountryCode(variant),
            'mena',
            `L'identifiant "${variant}" doit être normalisé en "mena"`
        );
    });
    console.log(`\n  ✓ Normalisation des ${arabVariants.length} identifiants arabes validée avec succès !`);

    console.log('\n🎉 TOUS LES TESTS DUAL-MODE (ACCUEIL & /FOOT) SONT VALIDÉS AVEC SUCCÈS !');
}

runTests().catch(err => {
    console.error('❌ Erreur de test :', err);
    process.exit(1);
});


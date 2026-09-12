/**
 * Script de test pour l'API /api/matches/today (Vérification du tri et du support multi-pays)
 */

const assert = require('assert');
const footballService = require('../server/services/footballService');

async function runTests() {
    console.log('🧪 Démarrage des tests du tri moderne et support multi-pays...');

    // 1. Test France (Défaut)
    footballService.clearCache();
    const resultFr = await footballService.getTodayMatches('france');

    assert(Array.isArray(resultFr.matches), 'resultFr.matches doit être un tableau');
    assert.strictEqual(resultFr.country.id, 'france', 'Le pays par défaut doit être France');
    console.log(`\n  ✓ [FRANCE 🇫🇷] ${resultFr.matches.length} grands matchs récupérés :`);

    resultFr.matches.forEach((m, idx) => {
        const score = footballService.calculateMatchHypeScore(m.homeTeam.name, m.awayTeam.name, m.competition);
        console.log(`    #${idx + 1} [Score: ${score.toFixed(0)}] [${m.time}] ${m.competition} : ${m.homeTeam.name} vs ${m.awayTeam.name} (${m.tvChannels.join(', ')})`);
    });

    // Vérifier qu'Arsenal et le Real Madrid sont bien au sommet
    const top2Teams = [
        resultFr.matches[0].homeTeam.name.toLowerCase() + resultFr.matches[0].awayTeam.name.toLowerCase(),
        resultFr.matches[1].homeTeam.name.toLowerCase() + resultFr.matches[1].awayTeam.name.toLowerCase()
    ];

    const hasArsenalTop2 = top2Teams.some(t => t.includes('arsenal'));
    const hasRealTop2 = top2Teams.some(t => t.includes('real madrid'));

    assert(hasArsenalTop2, 'Arsenal doit être dans le Top 2');
    assert(hasRealTop2, 'Real Madrid doit être dans le Top 2');
    console.log('\n  ✓ Real Madrid et Arsenal sont bien positionnés en tête du classement !');

    // 2. Test UK (Royaume-Uni 🇬🇧)
    const resultUk = await footballService.getTodayMatches('uk');
    assert.strictEqual(resultUk.country.id, 'uk');
    console.log(`\n  ✓ [UK 🇬🇧] ${resultUk.matches.length} matchs avec chaînes britanniques (ex: ${resultUk.matches[0].tvChannels.join(', ')})`);
    assert(resultUk.matches.some(m => m.tvChannels.some(c => c.includes('Sky') || c.includes('TNT Sports') || c.includes('Premier Sports') || c.includes('BBC'))), 'Doit contenir des diffuseurs UK');

    // 3. Test Spain (Espagne 🇪🇸)
    const resultEs = await footballService.getTodayMatches('spain');
    assert.strictEqual(resultEs.country.id, 'spain');
    console.log(`\n  ✓ [ESPAGNE 🇪🇸] ${resultEs.matches.length} matchs avec chaînes espagnoles (ex: ${resultEs.matches[0].tvChannels.join(', ')})`);
    assert(resultEs.matches.some(m => m.tvChannels.some(c => c.includes('Movistar') || c.includes('DAZN') || c.includes('RTVE'))), 'Doit contenir des diffuseurs espagnols');

    // 4. Test USA (États-Unis 🇺🇸)
    const resultUs = await footballService.getTodayMatches('usa');
    assert.strictEqual(resultUs.country.id, 'usa');
    console.log(`\n  ✓ [USA 🇺🇸] ${resultUs.matches.length} matchs avec chaînes américaines (ex: ${resultUs.matches[0].tvChannels.join(', ')})`);
    assert(resultUs.matches.some(m => m.tvChannels.some(c => c.includes('NBC') || c.includes('Peacock') || c.includes('Paramount+') || c.includes('ESPN') || c.includes('FOX'))), 'Doit contenir des diffuseurs USA');

    // 5. Test Monde Arabe / MENA (Arabe 🌍)
    footballService.clearCache('mena');
    const resultMena = await footballService.getTodayMatches('arabe');
    assert.strictEqual(resultMena.country.id, 'mena');
    console.log(`\n  ✓ [MONDE ARABE / ARABIC 🌍] ${resultMena.matches.length} matchs avec chaînes arabes :`);
    resultMena.matches.forEach((m, idx) => {
        console.log(`    #${idx + 1} [${m.time}] ${m.competition} : ${m.homeTeam.name} vs ${m.awayTeam.name} -> ${m.tvChannels.join(' • ')}`);
        // Vérification stricte : Aucune chaîne française ne doit fuiter dans le flux Arabe
        const hasFrenchChannels = m.tvChannels.some(c => /canal\+|tf1|m6|france\s*2|rmc\s*sport/i.test(c));
        assert(!hasFrenchChannels, `Le match ${m.homeTeam.name} ne doit PAS contenir de chaîne française en région Arabe : ${m.tvChannels.join(', ')}`);
    });

    // Vérifier la présence des diffuseurs arabes officiels
    assert(resultMena.matches.some(m => m.tvChannels.some(c => c.includes('beIN Sports') || c.includes('Abu Dhabi') || c.includes('TOD') || c.includes('SSC'))), 'Doit contenir des diffuseurs arabes');

    // 6. Test normalisation de TOUS les identifiants arabes possibles de VeloraVIP
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

    console.log('\n🎉 TOUS LES TESTS MULTI-PAYS ET CHAÎNES ARABES SONT VALIDÉS AVEC SUCCÈS !');
}

runTests().catch(err => {
    console.error('❌ Erreur de test :', err);
    process.exit(1);
});

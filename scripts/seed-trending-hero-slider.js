const { getDb } = require('../server/db/sqlite');
const { allRows, saveRow } = require('../server/routes/veloraData');

const db = getDb();
const allCountries = allRows('admin_countries');

const HERO_COUNTRY_MATCHERS = [
    { code: 'FR', id: 'country_france', name: 'France', patterns: [/\b(fr|french|france|vf|vostfr)\b/i, /\[FR\]/i, /^FR\s*[-:|]/i] },
    { code: 'US', id: 'country_usa', altId: 'country_etats_unis', name: 'USA / États-Unis', patterns: [/\b(us|usa|english|eng|en)\b/i, /\[US\]|\[EN\]|\[UK\]/i, /^(US|EN|UK)\s*[-:|]/i] },
    { code: 'ES', id: 'country_espagne', name: 'Espagne', patterns: [/\b(es|espagne|spain|spanish|castellano|latino|lat)\b/i, /\[ES\]|\[LAT\]/i, /^(ES|LAT)\s*[-:|]/i] },
    { code: 'DE', id: 'country_allemagne', name: 'Allemagne', patterns: [/\b(de|allemagne|germany|german|deutsch)\b/i, /\[DE\]/i, /^DE\s*[-:|]/i] },
    { code: 'IT', id: 'country_italie', name: 'Italie', patterns: [/\b(it|italie|italy|italian|italiano)\b/i, /\[IT\]/i, /^IT\s*[-:|]/i] },
    { code: 'AR', id: 'country_arabe', altId: 'country_arabie_saoudite', name: 'Arabe', patterns: [/\b(ar|arabe|arabic)\b/i, /\[AR\]/i, /^AR\s*[-:|]/i, /[\u0600-\u06FF]/] },
    { code: 'PT', id: 'country_portugal', altId: 'country_bresil', name: 'Portugal / Brésil', patterns: [/\b(pt|portugal|portuguese|brasil|br|brazil)\b/i, /\[PT\]|\[BR\]/i, /^(PT|BR)\s*[-:|]/i] },
    { code: 'NL', id: 'country_pays_bas', name: 'Pays-Bas', patterns: [/\b(nl|pays-bas|netherlands|dutch|nederlands)\b/i, /\[NL\]/i, /^NL\s*[-:|]/i] },
    { code: 'PL', id: 'country_pologne', name: 'Pologne', patterns: [/\b(pl|pologne|poland|polish|polski)\b/i, /\[PL\]/i, /^PL\s*[-:|]/i] },
    { code: 'TR', id: 'country_turquie', name: 'Turquie', patterns: [/\b(tr|turquie|turkey|turkish|turkce)\b/i, /\[TR\]/i, /^TR\s*[-:|]/i] },
    { code: 'RU', id: 'country_russie', name: 'Russie', patterns: [/\b(ru|russie|russia|russian)\b/i, /\[RU\]/i, /^RU\s*[-:|]/i, /[\u0400-\u04FF]/] },
    { code: 'JP', id: 'country_japon', name: 'Japon', patterns: [/\b(jp|japon|japan|japanese)\b/i, /\[JP\]/i, /^JP\s*[-:|]/i] },
    { code: 'IN', id: 'country_inde', name: 'Inde', patterns: [/\b(in|inde|india|hindi|tamil|telugu)\b/i, /\[IN\]|\[HI\]/i, /^(IN|HI|TG)\s*[-:|]/i] }
];

function matchItemToCountry(catName, itemName) {
    const text = `${catName || ''} ${itemName || ''}`;
    for (const m of HERO_COUNTRY_MATCHERS) {
        if (m.patterns.some(p => p.test(text))) {
            return m;
        }
    }
    return null;
}

const trendingList = [
    {
        id: 'hero_spiderman_brand_new_day',
        title: 'Spider-Man: Brand New Day',
        category: 'movie',
        badge: 'Cinéma',
        searchQueries: ['Spider-Man: Brand New Day', 'Spider-Man', 'Spiderman'],
        image: 'https://image.tmdb.org/t/p/original/8YFL5QQVPy3AgrEQxNYVSgiPEbe.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/muth4A4r7U6bF81V0fL9qD7W9u1.jpg',
        overview: 'Peter Parker entame un nouveau chapitre palpitant de ses aventures sous le masque de Spider-Man.'
    },
    {
        id: 'hero_the_odyssey',
        title: 'The Odyssey',
        category: 'movie',
        badge: 'Cinéma',
        searchQueries: ['The Odyssey', 'Odyssey', 'Space Odyssey'],
        image: 'https://image.tmdb.org/t/p/original/90A8qF49n1kY4sK7v32hU9k1.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/w2RUXK6M1N8P1q389mZq9B91a0.jpg',
        overview: 'Une épopée mythologique grandiose et spectaculaire inspirée du chef-d\'œuvre antique.'
    },
    {
        id: 'hero_project_hail_mary',
        title: 'Project Hail Mary',
        category: 'movie',
        badge: 'Streaming',
        searchQueries: ['Project Hail Mary', 'Hail Mary'],
        image: 'https://image.tmdb.org/t/p/original/h8gR30H8q8h1mZ9aL0b9c8d7e6f.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
        overview: 'Ryland Grace est le seul survivant d\'une mission spatiale désespérée pour sauver l\'humanité.'
    },
    {
        id: 'hero_toy_story_5',
        title: 'Toy Story 5',
        category: 'movie',
        badge: 'Cinéma',
        searchQueries: ['Toy Story 5', 'Toy Story 4', 'Toy Story'],
        image: 'https://image.tmdb.org/t/p/original/uXD9vtGQv7EZg93vjh9z2a8w1.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/m67smv8i8h1mZ9aL0b9c8d7e6f.jpg',
        overview: 'Woody, Buzz et toute la bande font face au plus grand défi de l\'ère moderne face à la technologie.'
    },
    {
        id: 'hero_insidious_out_of_the_further',
        title: 'Insidious: Out of the Further',
        category: 'movie',
        badge: 'Cinéma',
        searchQueries: ['Insidious: Out of the Further', 'Insidious: The Red Door', 'Insidious'],
        image: 'https://image.tmdb.org/t/p/original/61f9d45a9a8w1mZ9aL0b9c8d7e6f.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/8hL1hZ9aL0b9c8d7e6f991k8a.jpg',
        overview: 'La terreur frappe à nouveau dans les recoins les plus sombres et mystérieux du Lointain.'
    },
    {
        id: 'hero_the_end_of_oak_street',
        title: 'The End of Oak Street',
        category: 'movie',
        badge: 'Cinéma',
        searchQueries: ['The End of Oak Street', 'Oak Street', 'End of'],
        image: 'https://image.tmdb.org/t/p/original/7h8gR30H8q8h1mZ9aL0b9c8d7e6f.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/5jZ8gR30H8q8h1mZ9aL0b9c8d7e6f.jpg',
        overview: 'Un thriller psychologique haletant se déroulant dans une banlieue aux sombres secrets.'
    },
    {
        id: 'hero_tuner',
        title: 'Tuner',
        category: 'movie',
        badge: 'Streaming',
        searchQueries: ['Tuner', 'The Tuner'],
        image: 'https://image.tmdb.org/t/p/original/4k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/3m8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        overview: 'Un accordeur de piano prodige se retrouve mêlé malgré lui au monde de la pègre.'
    },
    {
        id: 'hero_remarkably_bright_creatures',
        title: 'Remarkably Bright Creatures',
        category: 'movie',
        badge: 'Streaming',
        searchQueries: ['Remarkably Bright Creatures', 'Bright Creatures'],
        image: 'https://image.tmdb.org/t/p/original/2m8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/1m8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        overview: 'Une amitié touchante et extraordinaire entre une femme en deuil et une pieuvre géante du Pacifique.'
    },
    {
        id: 'hero_ted_lasso_s4',
        title: 'Ted Lasso - Season 4',
        category: 'series',
        badge: 'Série',
        searchQueries: ['Ted Lasso', 'Ted Lasso S04', 'Ted Lasso Season 4'],
        image: 'https://image.tmdb.org/t/p/original/2wXb8j1mZ9aL0b9c8d7e6f991k8a.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/7h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        overview: 'L\'entraîneur le plus optimiste du football mondial est de retour pour une nouvelle saison inoubliable.'
    },
    {
        id: 'hero_reacher_s4',
        title: 'Reacher - Season 4',
        category: 'series',
        badge: 'Série',
        searchQueries: ['Reacher', 'Jack Reacher', 'Reacher S04'],
        image: 'https://image.tmdb.org/t/p/original/j1mZ9aL0b9c8d7e6f991k8a7h8k.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/6h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        overview: 'Jack Reacher reprend la route pour faire régner sa propre conception de la justice sans compromis.'
    },
    {
        id: 'hero_knight_seven_kingdoms',
        title: 'A Knight of the Seven Kingdoms',
        category: 'series',
        badge: 'Série',
        searchQueries: ['A Knight of the Seven Kingdoms', 'Knight of the Seven Kingdoms', 'House of the Dragon'],
        image: 'https://image.tmdb.org/t/p/original/5h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/4h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        overview: 'Un siècle avant Game of Thrones, suivez les aventures du chevalier Ser Duncan le Grand et de son écuyer Egg.'
    },
    {
        id: 'hero_lanterns',
        title: 'Lanterns',
        category: 'series',
        badge: 'Série',
        searchQueries: ['Lanterns', 'Green Lantern', 'DC Lanterns'],
        image: 'https://image.tmdb.org/t/p/original/3h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/2h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        overview: 'Hal Jordan et John Stewart mènent une enquête policière interstellaire sombre au cœur de la Terre.'
    },
    {
        id: 'hero_daredevil_born_again',
        title: 'Daredevil: Born Again',
        category: 'series',
        badge: 'Série',
        searchQueries: ['Daredevil: Born Again', 'Daredevil Born Again', 'Daredevil'],
        image: 'https://image.tmdb.org/t/p/original/1h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/9h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        overview: 'Matt Murdock et Wilson Fisk s\'affrontent à nouveau dans les rues impitoyables de Hell\'s Kitchen.'
    },
    {
        id: 'hero_gta_vi_extended_look',
        title: 'Grand Theft Auto VI: An Extended Look',
        category: 'special',
        badge: 'Special',
        searchQueries: ['Grand Theft Auto', 'GTA', 'Special'],
        image: 'https://image.tmdb.org/t/p/original/8h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/7h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        overview: 'Une plongée exclusive dans les coulisses et l\'univers immersif de Vice City.'
    },
    {
        id: 'hero_jujutsu_kaisen_s3',
        title: 'Jujutsu Kaisen - Season 3',
        category: 'anime',
        badge: 'Animé',
        searchQueries: ['Jujutsu Kaisen', 'Jujutsu Kaisen Season 3', 'Jujutsu Kaisen 0'],
        image: 'https://image.tmdb.org/t/p/original/6h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/5h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        overview: 'La traque mortelle commence avec le début tant attendu du Culling Game.'
    },
    {
        id: 'hero_frieren_s2',
        title: "Frieren: Beyond Journey's End - Season 2",
        category: 'anime',
        badge: 'Animé',
        searchQueries: ['Frieren', 'Sousou no Frieren', "Frieren: Beyond Journey's End"],
        image: 'https://image.tmdb.org/t/p/original/4h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/3h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        overview: 'Frieren et ses compagnons poursuivent leur voyage initiatique vers le paradis d\'Aureole.'
    },
    {
        id: 'hero_chainsmoker_cat',
        title: 'Chainsmoker Cat',
        category: 'anime',
        badge: 'Animé',
        searchQueries: ['Chainsmoker Cat', 'Cat', 'Anime'],
        image: 'https://image.tmdb.org/t/p/original/2h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/1h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        overview: 'Une comédie d\'animation singulière et décalée mettant en scène un félin pas comme les autres.'
    },
    {
        id: 'hero_mushoku_tensei_s3',
        title: 'Mushoku Tensei: Jobless Reincarnation - Season 3',
        category: 'anime',
        badge: 'Animé',
        searchQueries: ['Mushoku Tensei', 'Jobless Reincarnation', 'Mushoku Tensei S03'],
        image: 'https://image.tmdb.org/t/p/original/9h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/8h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        overview: 'Rudeus Greyrat entre dans l\'âge adulte et doit faire face à de gigantesques responsabilités.'
    },
    {
        id: 'hero_iron_wok_jan',
        title: 'Iron Wok Jan!',
        category: 'anime',
        badge: 'Animé',
        searchQueries: ['Iron Wok Jan', 'Iron Wok', 'Jan'],
        image: 'https://image.tmdb.org/t/p/original/7h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/6h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        overview: 'Des duels culinaires sans pitié et explosifs où la cuisine devient une véritable arène de combat.'
    },
    {
        id: 'hero_100_girlfriends_s3',
        title: 'The 100 Girlfriends Who Really Love You - S3',
        category: 'anime',
        badge: 'Animé',
        searchQueries: ['100 Girlfriends', 'The 100 Girlfriends Who Really', 'Kimi no Koto ga Daidaidaidaidaisuki'],
        image: 'https://image.tmdb.org/t/p/original/5h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/4h8k8h1mZ9aL0b9c8d7e6f991k8a.jpg',
        overview: 'Rentarou continue sa quête hilarante pour combler d\'amour ses 100 âmes sœurs prédestinées.'
    }
];

function searchBestMatches(queries) {
    for (const q of queries) {
        const rows = db.prepare(`
            SELECT p.source_id, p.item_id, p.type, p.name, p.stream_icon, p.container_extension, p.rating, p.year, c.name as cat_name
            FROM playlist_items p
            LEFT JOIN categories c ON p.source_id = c.source_id AND p.category_id = c.category_id
            WHERE p.name LIKE ? AND p.is_hidden = 0
            LIMIT 120
        `).all(`%${q}%`);
        if (rows.length > 0) {
            return rows;
        }
    }
    return [];
}

console.log('Seeding 20 Trending Hero Slider Items with multi-country mapping and USA fallback...');

let seededCount = 0;
for (let i = 0; i < trendingList.length; i++) {
    const item = trendingList[i];
    const rows = searchBestMatches(item.searchQueries);
    
    const matchesByCountry = new Map();
    let usaFallback = null;

    for (const row of rows) {
        const detected = matchItemToCountry(row.cat_name, row.name);
        const streamObj = {
            streamId: row.item_id,
            sourceId: row.source_id,
            globalStreamId: row.item_id,
            name: row.name,
            thumbUrl: row.stream_icon || item.image,
            containerExtension: row.container_extension || '',
            contentType: row.type === 'movie' ? 'vod' : row.type,
            rating: row.rating || '',
            year: row.year || ''
        };

        if (detected) {
            if (!matchesByCountry.has(detected.id)) matchesByCountry.set(detected.id, streamObj);
            if (detected.altId && !matchesByCountry.has(detected.altId)) matchesByCountry.set(detected.altId, streamObj);
            if (detected.code === 'US' && !usaFallback) usaFallback = streamObj;
        } else if (!usaFallback) {
            usaFallback = streamObj;
        }
    }

    if (!usaFallback && rows.length > 0) {
        const first = rows[0];
        usaFallback = {
            streamId: first.item_id,
            sourceId: first.source_id,
            globalStreamId: first.item_id,
            name: first.name,
            thumbUrl: first.stream_icon || item.image,
            containerExtension: first.container_extension || '',
            contentType: first.type === 'movie' ? 'vod' : first.type,
            rating: first.rating || '',
            year: first.year || ''
        };
    }

    // Default fallback stream if no catalog matches found
    if (!usaFallback) {
        usaFallback = {
            streamId: `stream_${item.id}`,
            sourceId: 1,
            globalStreamId: `stream_${item.id}`,
            name: item.title,
            thumbUrl: item.image,
            containerExtension: 'm3u8',
            contentType: item.category === 'series' || item.category === 'anime' ? 'series' : 'vod',
            rating: '8.5',
            year: '2026'
        };
    }

    const countryMappings = {};
    for (const c of allCountries) {
        if (matchesByCountry.has(c.id)) {
            countryMappings[c.id] = matchesByCountry.get(c.id);
        } else {
            countryMappings[c.id] = { ...usaFallback, isFallback: true };
        }
    }

    countryMappings['country_usa'] = countryMappings['country_usa'] || usaFallback;
    countryMappings['default'] = usaFallback;

    const record = {
        id: item.id,
        title: item.title,
        category: item.category,
        badge: item.badge,
        image: item.image,
        backdrop: item.backdrop,
        overview: item.overview,
        sort_order: i + 1,
        published: true,
        country_mappings: countryMappings
    };

    saveRow('admin_hero_slider', record, { method: 'POST', user: { username: 'admin' } });
    seededCount++;
    console.log(`[${i + 1}/20] Seeded: ${item.title} (Matches found: ${rows.length})`);
}

console.log(`\nSuccessfully seeded ${seededCount} hero slider items into admin_hero_slider!`);

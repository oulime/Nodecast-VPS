const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { getDb } = require('../server/db/sqlite');

const FANART_API_KEY = process.env.FANART_API_KEY || 'adcce1694cd06785070b4ca811413b15';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '1cf50e6248dc270629e802686245c2c8';

const BACKDROP_DIR = path.join(__dirname, '..', 'public', 'uploads', 'hero-slider', 'backdrops');
const LOGO_DIR = path.join(__dirname, '..', 'public', 'uploads', 'hero-slider', 'logos');
const PUBLIC_BACKDROP_PREFIX = '/uploads/hero-slider/backdrops';
const PUBLIC_LOGO_PREFIX = '/uploads/hero-slider/logos';

fs.mkdirSync(BACKDROP_DIR, { recursive: true });
fs.mkdirSync(LOGO_DIR, { recursive: true });

function httpGetJson(url, timeoutMs = 7000) {
    return new Promise((resolve) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { headers: { 'User-Agent': 'Nodecast/1.0' }, timeout: timeoutMs }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return httpGetJson(res.headers.location, timeoutMs).then(resolve);
            }
            if (res.statusCode !== 200) return resolve(null);
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (_) { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
    });
}

function downloadImage(url, destPath, timeoutMs = 25000) {
    return new Promise((resolve) => {
        const file = fs.createWriteStream(destPath);
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { headers: { 'User-Agent': 'Nodecast/1.0' }, timeout: timeoutMs }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close();
                try { fs.unlinkSync(destPath); } catch (_) {}
                return downloadImage(res.headers.location, destPath, timeoutMs).then(resolve);
            }
            if (res.statusCode !== 200) {
                file.close();
                try { fs.unlinkSync(destPath); } catch (_) {}
                return resolve(false);
            }
            res.pipe(file);
            file.on('finish', () => {
                file.close(() => resolve(true));
            });
        });
        req.on('error', () => {
            file.close();
            try { fs.unlinkSync(destPath); } catch (_) {}
            resolve(false);
        });
        req.on('timeout', () => {
            req.destroy();
            file.close();
            try { fs.unlinkSync(destPath); } catch (_) {}
            resolve(false);
        });
    });
}

function cleanTitle(raw) {
    let t = String(raw || '').trim();
    for (let i = 0; i < 5; i++) {
        const prev = t;
        t = t.replace(/^\[[A-Z0-9\+\-\s]+\]\s*[-:|•]?\s*/i, '')
             .replace(/^([0-9]+K|[0-9]+D|HD|FHD|UHD|4K|VF|VOSTFR|VO|MULTI|TRUEFRENCH|FRENCH|HEVC|HDR|DOLBY|ATMOS)(\s*[-:|•]\s*|\s+)/i, '')
             .replace(/^[A-Z0-9]{1,5}-[A-Z0-9]{1,5}\s*[-:|•]\s+/i, '')
             .replace(/^[A-Z]{2,3}\s*[-:|•]\s+/i, '')
             .trim();
        if (t === prev) break;
    }
    t = t.replace(/\s*[-:]?\s*(?:Season|Saison)\s*\d+/i, '');
    t = t.replace(/\s*[-:]?\s*S\d+/i, '');
    t = t.replace(/\(\d{4}\).*$/, '');
    t = t.replace(/[-:|•]\s*$/, '').trim();
    return t;
}

function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'item';
}

async function resolveFanartAndTmdb(title, isSeries) {
    const cleaned = cleanTitle(title);
    if (!cleaned) return null;

    const endpoint = isSeries ? 'search/tv' : 'search/movie';
    const searchUrl = `https://api.themoviedb.org/3/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleaned)}&language=fr-FR`;
    let tmdbData = await httpGetJson(searchUrl);
    if (!tmdbData?.results?.length) {
        // Retry English
        const enSearchUrl = `https://api.themoviedb.org/3/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleaned)}`;
        tmdbData = await httpGetJson(enSearchUrl);
    }

    const media = tmdbData?.results?.[0];
    const mediaId = media?.id;
    let tvdbId = null;

    if (mediaId && isSeries) {
        const extUrl = `https://api.themoviedb.org/3/tv/${mediaId}/external_ids?api_key=${TMDB_API_KEY}`;
        const extData = await httpGetJson(extUrl);
        tvdbId = extData?.tvdb_id;
    }

    let fanartData = null;
    if (isSeries && tvdbId) {
        fanartData = await httpGetJson(`https://webservice.fanart.tv/v3/tv/${tvdbId}?api_key=${FANART_API_KEY}`);
    } else if (!isSeries && mediaId) {
        fanartData = await httpGetJson(`https://webservice.fanart.tv/v3/movies/${mediaId}?api_key=${FANART_API_KEY}`);
    }

    // 1. Resolve Best 4K / UHD Backdrop
    let backdropUrl = '';
    const fanartBgs = isSeries ? (fanartData?.showbackground || []) : (fanartData?.moviebackground || []);
    if (Array.isArray(fanartBgs) && fanartBgs.length > 0) {
        backdropUrl = fanartBgs[0].url;
    } else if (media?.backdrop_path) {
        backdropUrl = `https://image.tmdb.org/t/p/original${media.backdrop_path}`;
    }

    // 2. Resolve Best Transparent Logo
    let logoUrl = '';
    const fanartLogos = isSeries
        ? (fanartData?.hdtvlogo || fanartData?.clearlogo || fanartData?.tvlogo || [])
        : (fanartData?.hdmovielogo || fanartData?.movielogo || fanartData?.clearlogo || []);
    if (Array.isArray(fanartLogos) && fanartLogos.length > 0) {
        const bestLogo = fanartLogos.find(l => l.lang === 'fr') || fanartLogos.find(l => l.lang === 'en') || fanartLogos[0];
        if (bestLogo?.url) logoUrl = bestLogo.url;
    }

    if (!logoUrl && mediaId) {
        const imagesUrl = `https://api.themoviedb.org/3/${endpoint.replace('search/', '')}/${mediaId}/images?api_key=${TMDB_API_KEY}&include_image_language=fr,en,null`;
        const imagesData = await httpGetJson(imagesUrl);
        const logos = (imagesData?.logos || []).filter(l => l.file_path && l.file_path.endsWith('.png'));
        if (logos.length > 0) {
            logos.sort((a, b) => {
                if (a.iso_639_1 === 'fr' && b.iso_639_1 !== 'fr') return -1;
                if (b.iso_639_1 === 'fr' && a.iso_639_1 !== 'fr') return 1;
                return (b.vote_average || 0) - (a.vote_average || 0);
            });
            logoUrl = `https://image.tmdb.org/t/p/original${logos[0].file_path}`;
        }
    }

    return {
        mediaId: mediaId || null,
        tvdbId: tvdbId || null,
        backdropUrl,
        logoUrl,
        overview: media?.overview || '',
        rating: media?.vote_average ? media.vote_average.toFixed(1) : ''
    };
}

async function migrate() {
    console.log('[Migration] Starting Hero Slider migration to VPS disk...');
    const db = getDb();
    const rows = db.prepare('SELECT row_id, data FROM velora_admin_rows WHERE table_name = ?').all('admin_hero_slider');
    console.log(`[Migration] Found ${rows.length} hero slider rows to process.`);

    let updatedCount = 0;

    for (const row of rows) {
        const item = JSON.parse(row.data);
        const id = item.id;
        const title = item.title;
        const isSeries = item.category === 'series' || item.category === 'anime' || item.category === 'special';
        const baseSlug = slugify(id.replace('hero_', '') || title);

        console.log(`\n--> Processing: [${id}] "${title}" (${item.category})`);

        // Resolve assets via Fanart.tv + TMDB
        const resolved = await resolveFanartAndTmdb(title, isSeries);

        // Backdrop selection: Fanart/TMDB resolved or existing item.backdrop
        let targetBackdrop = resolved?.backdropUrl || item.backdrop || item.image || '';
        if (targetBackdrop.includes('image.tmdb.org/t/p/')) {
            targetBackdrop = targetBackdrop.replace(/\/t\/p\/(?:w\d+|w780|w500|w1280)/, '/t/p/original');
        }

        // Logo selection: Fanart/TMDB resolved or existing item.logo
        let targetLogo = resolved?.logoUrl || item.logo || '';
        if (targetLogo.includes('image.tmdb.org/t/p/')) {
            targetLogo = targetLogo.replace(/\/t\/p\/(?:w\d+|w780|w500|w1280)/, '/t/p/original');
        }

        let localBackdropPath = '';
        if (targetBackdrop) {
            if (targetBackdrop.startsWith('/uploads/hero-slider/backdrops/')) {
                localBackdropPath = targetBackdrop;
            } else {
                const ext = targetBackdrop.includes('.png') ? '.png' : '.jpg';
                const filename = `${baseSlug}${ext}`;
                const dest = path.join(BACKDROP_DIR, filename);
                console.log(`    Downloading backdrop from: ${targetBackdrop.slice(0, 70)}...`);
                const ok = await downloadImage(targetBackdrop, dest);
                if (ok) {
                    localBackdropPath = `${PUBLIC_BACKDROP_PREFIX}/${filename}`;
                    const sizeMb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(2);
                    console.log(`    [SAVED BACKDROP] ${localBackdropPath} (${sizeMb} MB)`);
                } else {
                    console.warn(`    [FAILED BACKDROP] Could not download ${targetBackdrop}`);
                }
            }
        }

        let localLogoPath = '';
        if (targetLogo) {
            if (targetLogo.startsWith('/uploads/hero-slider/logos/')) {
                localLogoPath = targetLogo;
            } else {
                const filename = `${baseSlug}.png`;
                const dest = path.join(LOGO_DIR, filename);
                console.log(`    Downloading logo from: ${targetLogo.slice(0, 70)}...`);
                const ok = await downloadImage(targetLogo, dest);
                if (ok) {
                    localLogoPath = `${PUBLIC_LOGO_PREFIX}/${filename}`;
                    const sizeKb = (fs.statSync(dest).size / 1024).toFixed(1);
                    console.log(`    [SAVED LOGO] ${localLogoPath} (${sizeKb} KB)`);
                } else {
                    console.warn(`    [FAILED LOGO] Could not download ${targetLogo}`);
                }
            }
        }

        // Apply local paths to item
        if (localBackdropPath) {
            item.backdrop = localBackdropPath;
            item.image = localBackdropPath;
        }
        if (localLogoPath) {
            item.logo = localLogoPath;
        }

        // Also update country mappings so all countries get the local backdrop and logo
        if (item.country_mappings && typeof item.country_mappings === 'object') {
            for (const countryId of Object.keys(item.country_mappings)) {
                if (localBackdropPath) {
                    item.country_mappings[countryId].thumbUrl = localBackdropPath;
                }
                if (localLogoPath) {
                    item.country_mappings[countryId].logo = localLogoPath;
                }
            }
        }

        // Save back to sqlite
        db.prepare(`
            UPDATE velora_admin_rows
            SET data = ?, updated_at = CURRENT_TIMESTAMP
            WHERE table_name = ? AND row_id = ?
        `).run(JSON.stringify(item), 'admin_hero_slider', row.row_id);

        updatedCount++;
        console.log(`    [UPDATED DB] ${id} saved successfully.`);
    }

    console.log(`\n[Migration Complete] Successfully migrated ${updatedCount} hero slider items to VPS disk!`);
}

migrate().catch(e => {
    console.error('[Migration Error]', e);
    process.exit(1);
});

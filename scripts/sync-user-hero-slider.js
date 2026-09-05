const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { getDb } = require('../server/db/sqlite');

const FANART_API_KEY = process.env.FANART_API_KEY || 'adcce1694cd06785070b4ca811413b15';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '1cf50e6248dc270629e802686245c2c8';

const BACKDROP_DIR = path.join(__dirname, '..', 'public', 'uploads', 'hero-slider', 'backdrops');
const LOGO_DIR = path.join(__dirname, '..', 'public', 'uploads', 'hero-slider', 'logos');
fs.mkdirSync(BACKDROP_DIR, { recursive: true });
fs.mkdirSync(LOGO_DIR, { recursive: true });

function httpGetJson(url) {
    return new Promise(resolve => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, { headers: { 'User-Agent': 'Nodecast/1.0' }, timeout: 8000 }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return httpGetJson(res.headers.location).then(resolve);
            }
            if (res.statusCode !== 200) return resolve(null);
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try { resolve(JSON.parse(d)); } catch (_) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

function downloadImage(url, dest) {
    return new Promise(resolve => {
        const f = fs.createWriteStream(dest);
        const client = url.startsWith('https') ? https : http;
        client.get(url, { headers: { 'User-Agent': 'Nodecast/1.0' }, timeout: 25000 }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                f.close();
                try { fs.unlinkSync(dest); } catch (_) {}
                return downloadImage(res.headers.location, dest).then(resolve);
            }
            if (res.statusCode !== 200) {
                f.close();
                try { fs.unlinkSync(dest); } catch (_) {}
                return resolve(false);
            }
            res.pipe(f);
            f.on('finish', () => f.close(() => resolve(true)));
        }).on('error', () => { f.close(); try { fs.unlinkSync(dest); } catch (_) {}; resolve(false); });
    });
}

function cleanTitle(raw) {
    let t = String(raw || '').trim();
    for (let i = 0; i < 5; i++) {
        const prev = t;
        t = t.replace(/^[\[\(][A-Z0-9\+\-\s]+[\]\)]\s*[-:|•]?\s*/i, '')
             .replace(/^([0-9]+K|[0-9]+D|HD|FHD|UHD|4K|VF|VOSTFR|VO|MULTI|TRUEFRENCH|FRENCH|HEVC|HDR|DOLBY|ATMOS)(\s*[-:|•]\s*|\s+)/i, '')
             .replace(/^[A-Z0-9]{1,5}-[A-Z0-9]{1,5}\s*[-:|•]\s+/i, '')
             .replace(/^[A-Z]{1,3}\s*[-:|•]\s+/i, '')
             .trim();
        if (t === prev) break;
    }
    t = t.replace(/\s*[-:]?\s*(?:Season|Saison)\s*\d+/i, '');
    t = t.replace(/\s*[-:]?\s*S\d+/i, '');
    t = t.replace(/\s*\(\d{4}(?:-\d{2}-\d{2})?\).*$/, '');
    t = t.replace(/\s*\(\s*(?:US|FR|EN|UK|JP)\s*\)/i, '');
    t = t.replace(/[-:|•]\s*$/, '').trim();
    return t;
}

async function syncExactUserItems() {
    console.log('[Sync] Fetching exact 10 items from remote website (https://nodecast.veloravip.net)...');
    const remoteRes = await fetch('https://nodecast.veloravip.net/api/velora-db/rest/v1/admin_hero_slider?select=*&order=sort_order.asc');
    const realItems = await remoteRes.json();
    console.log(`[Sync] Found ${realItems.length} real items from your live website.`);

    // Clear old uploads so only the user's 10 items exist
    fs.readdirSync(BACKDROP_DIR).forEach(f => {
        try { fs.unlinkSync(path.join(BACKDROP_DIR, f)); } catch (_) {}
    });
    fs.readdirSync(LOGO_DIR).forEach(f => {
        try { fs.unlinkSync(path.join(LOGO_DIR, f)); } catch (_) {}
    });

    const db = getDb();
    // Delete all rows in admin_hero_slider
    db.prepare('DELETE FROM velora_admin_rows WHERE table_name = ?').run('admin_hero_slider');

    for (let i = 0; i < realItems.length; i++) {
        const item = realItems[i];
        const isSeries = item.category === 'series' || item.category === 'anime' || (item.country_mappings && Object.values(item.country_mappings).some(m => m.contentType === 'series'));
        const slug = 'hero-' + (i + 1) + '-' + cleanTitle(item.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        console.log(`\n[${i + 1}/${realItems.length}] Processing: "${item.title}" (slug: ${slug})`);

        const cleaned = cleanTitle(item.title);
        const endpoint = isSeries ? 'search/tv' : 'search/movie';
        let tmdbData = await httpGetJson(`https://api.themoviedb.org/3/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleaned)}&language=fr-FR`);
        if (!tmdbData?.results?.length) {
            tmdbData = await httpGetJson(`https://api.themoviedb.org/3/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleaned)}`);
        }

        const media = tmdbData?.results?.[0];
        const mediaId = media?.id;
        let tvdbId = null;
        if (mediaId && isSeries) {
            const extData = await httpGetJson(`https://api.themoviedb.org/3/tv/${mediaId}/external_ids?api_key=${TMDB_API_KEY}`);
            tvdbId = extData?.tvdb_id;
        }

        let fanartData = null;
        if (isSeries && tvdbId) {
            fanartData = await httpGetJson(`https://webservice.fanart.tv/v3/tv/${tvdbId}?api_key=${FANART_API_KEY}`);
        } else if (!isSeries && mediaId) {
            fanartData = await httpGetJson(`https://webservice.fanart.tv/v3/movies/${mediaId}?api_key=${FANART_API_KEY}`);
        }

        // 1. BACKDROP: Fanart 4K -> TMDB original -> existing
        let targetBg = '';
        const fanartBgs = isSeries ? (fanartData?.showbackground || []) : (fanartData?.moviebackground || []);
        if (Array.isArray(fanartBgs) && fanartBgs.length > 0) {
            targetBg = fanartBgs[0].url;
            console.log('    Found Fanart 4K backdrop:', targetBg.slice(0, 65));
        } else if (media?.backdrop_path) {
            targetBg = `https://image.tmdb.org/t/p/original${media.backdrop_path}`;
            console.log('    Using TMDB original backdrop');
        } else {
            targetBg = item.backdrop || item.image || '';
            console.log('    Using existing backdrop');
        }

        const bgFilename = `${slug}.jpg`;
        const bgDest = path.join(BACKDROP_DIR, bgFilename);
        const bgOk = await downloadImage(targetBg, bgDest);
        let localBg = '';
        if (bgOk) {
            localBg = `/uploads/hero-slider/backdrops/${bgFilename}`;
            const sizeKb = (fs.statSync(bgDest).size / 1024).toFixed(0);
            console.log(`    [SAVED BACKDROP] ${localBg} (${sizeKb} KB)`);
        }

        // 2. LOGO: Fanart HD transparent -> TMDB transparent -> existing logo
        let targetLogo = '';
        const fanartLogos = isSeries
            ? (fanartData?.hdtvlogo || fanartData?.clearlogo || fanartData?.tvlogo || [])
            : (fanartData?.hdmovielogo || fanartData?.movielogo || fanartData?.clearlogo || []);
        if (Array.isArray(fanartLogos) && fanartLogos.length > 0) {
            const bestLogo = fanartLogos.find(l => l.lang === 'fr') || fanartLogos.find(l => l.lang === 'en') || fanartLogos[0];
            if (bestLogo?.url) {
                targetLogo = bestLogo.url;
                console.log('    Found Fanart HD logo:', targetLogo.slice(0, 65));
            }
        }

        if (!targetLogo && mediaId) {
            const imgType = isSeries ? 'tv' : 'movie';
            const imagesData = await httpGetJson(`https://api.themoviedb.org/3/${imgType}/${mediaId}/images?api_key=${TMDB_API_KEY}&include_image_language=fr,en,null`);
            const logos = (imagesData?.logos || []).filter(l => l.file_path && l.file_path.endsWith('.png'));
            if (logos.length > 0) {
                logos.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
                targetLogo = `https://image.tmdb.org/t/p/original${logos[0].file_path}`;
                console.log('    Using TMDB HD logo');
            }
        }

        if (!targetLogo && item.logo) {
            targetLogo = item.logo;
            console.log('    Using existing logo:', targetLogo.slice(0, 65));
        }

        const logoFilename = `${slug}.png`;
        const logoDest = path.join(LOGO_DIR, logoFilename);
        const logoOk = await downloadImage(targetLogo, logoDest);
        let localLogo = '';
        if (logoOk) {
            localLogo = `/uploads/hero-slider/logos/${logoFilename}`;
            const sizeKb = (fs.statSync(logoDest).size / 1024).toFixed(0);
            console.log(`    [SAVED LOGO] ${localLogo} (${sizeKb} KB)`);
        }

        // Apply local paths to item without changing anything else
        if (localBg) {
            item.backdrop = localBg;
            item.image = localBg;
        }
        if (localLogo) {
            item.logo = localLogo;
        }

        if (item.country_mappings && typeof item.country_mappings === 'object') {
            for (const cid of Object.keys(item.country_mappings)) {
                if (localBg) item.country_mappings[cid].thumbUrl = localBg;
                if (localLogo) item.country_mappings[cid].logo = localLogo;
            }
        }

        // Insert into velora_admin_rows
        db.prepare('INSERT INTO velora_admin_rows (table_name, row_id, data) VALUES (?, ?, ?)')
            .run('admin_hero_slider', item.id, JSON.stringify(item));
        console.log(`    [DB OK] Inserted ${item.id}`);
    }

    console.log('\n[DONE] Successfully synced ONLY your exact 10 website items with local VPS 4K backdrops & logos!');
}

syncExactUserItems().catch(e => {
    console.error('[Error]', e);
    process.exit(1);
});

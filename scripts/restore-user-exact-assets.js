const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { getDb } = require('../server/db/sqlite');

const BACKDROP_DIR = path.join(__dirname, '..', 'public', 'uploads', 'hero-slider', 'backdrops');
const LOGO_DIR = path.join(__dirname, '..', 'public', 'uploads', 'hero-slider', 'logos');
fs.mkdirSync(BACKDROP_DIR, { recursive: true });
fs.mkdirSync(LOGO_DIR, { recursive: true });

function download(url, dest) {
    return new Promise(resolve => {
        if (!url || !url.startsWith('http')) return resolve(false);
        const f = fs.createWriteStream(dest);
        const client = url.startsWith('https') ? https : http;
        client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 25000 }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                f.close();
                try { fs.unlinkSync(dest); } catch (_) {}
                return download(res.headers.location, dest).then(resolve);
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

async function restoreUserExactAssets() {
    console.log('[Restore] Fetching exact live items from nodecast.veloravip.net...');
    const res = await fetch('https://nodecast.veloravip.net/api/velora-db/rest/v1/admin_hero_slider?select=*&order=sort_order.asc');
    const items = await res.json();
    console.log(`[Restore] Got ${items.length} items from remote website.`);

    // Clear old files
    fs.readdirSync(BACKDROP_DIR).forEach(f => {
        try { fs.unlinkSync(path.join(BACKDROP_DIR, f)); } catch (_) {}
    });
    fs.readdirSync(LOGO_DIR).forEach(f => {
        try { fs.unlinkSync(path.join(LOGO_DIR, f)); } catch (_) {}
    });

    const db = getDb();
    db.prepare('DELETE FROM velora_admin_rows WHERE table_name = ?').run('admin_hero_slider');

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const originalBgUrl = item.backdrop || item.image;
        const originalLogoUrl = item.logo;
        const slug = 'hero-' + (i + 1) + '-' + item.id.replace('hero_slider_', '');

        console.log(`\n[${i + 1}/${items.length}] ${item.title}`);
        console.log('  Original manual backdrop:', originalBgUrl);
        console.log('  Original manual logo:', originalLogoUrl);

        const bgFile = slug + '.jpg';
        const bgDest = path.join(BACKDROP_DIR, bgFile);
        const bgOk = await download(originalBgUrl, bgDest);
        const localBg = bgOk ? '/uploads/hero-slider/backdrops/' + bgFile : originalBgUrl;
        console.log('  -> Local backdrop:', localBg, '(' + (bgOk ? fs.statSync(bgDest).size : 0) + ' bytes)');

        const logoFile = slug + '.png';
        const logoDest = path.join(LOGO_DIR, logoFile);
        const logoOk = await download(originalLogoUrl, logoDest);
        const localLogo = logoOk ? '/uploads/hero-slider/logos/' + logoFile : originalLogoUrl;
        console.log('  -> Local logo:', localLogo, '(' + (logoOk ? fs.statSync(logoDest).size : 0) + ' bytes)');

        item.backdrop = localBg;
        item.image = localBg;
        item.logo = localLogo;

        if (item.country_mappings && typeof item.country_mappings === 'object') {
            for (const c of Object.keys(item.country_mappings)) {
                item.country_mappings[c].thumbUrl = localBg;
                item.country_mappings[c].logo = localLogo;
            }
        }

        db.prepare('INSERT INTO velora_admin_rows (table_name, row_id, data) VALUES (?, ?, ?)')
            .run('admin_hero_slider', item.id, JSON.stringify(item));
    }

    console.log('\n[SUCCESS] All 10 original manual items saved to VPS disk with exact user images & logos!');
}

restoreUserExactAssets().catch(e => {
    console.error('[Error]', e);
    process.exit(1);
});

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');

const router = express.Router();

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const PUBLIC_UPLOAD_PATH = '/uploads/package-covers';
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'package-covers');
const TMP_DIR = path.join(UPLOAD_DIR, '.tmp');
const DISCOVERED_COVERS_FILE = path.join(__dirname, '..', '..', 'data', 'package-discovered-covers.json');

const IMAGE_TYPES = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif'
};

// In-memory cache for discovered package covers
let discoveredCoversMap = null;

async function loadDiscoveredCovers() {
    if (discoveredCoversMap !== null) return discoveredCoversMap;
    try {
        const raw = await fsp.readFile(DISCOVERED_COVERS_FILE, 'utf8');
        discoveredCoversMap = JSON.parse(raw) || {};
    } catch {
        discoveredCoversMap = {};
    }
    return discoveredCoversMap;
}

async function saveDiscoveredCovers(map) {
    discoveredCoversMap = map;
    try {
        await fsp.mkdir(path.dirname(DISCOVERED_COVERS_FILE), { recursive: true });
        const temp = `${DISCOVERED_COVERS_FILE}.${process.pid}.${Date.now()}.tmp`;
        await fsp.writeFile(temp, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
        await fsp.rename(temp, DISCOVERED_COVERS_FILE);
    } catch (err) {
        console.warn('[package-covers] Failed to write discovered covers file:', err.message);
    }
}

function getBoundary(contentType) {
    const match = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
    return match ? (match[1] || match[2] || '').trim() : '';
}

function splitBuffer(buffer, separator) {
    const parts = [];
    let start = 0;
    let index = buffer.indexOf(separator, start);

    while (index !== -1) {
        parts.push(buffer.subarray(start, index));
        start = index + separator.length;
        index = buffer.indexOf(separator, start);
    }

    parts.push(buffer.subarray(start));
    return parts;
}

function trimMultipartCrlf(buffer) {
    let start = 0;
    let end = buffer.length;

    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;
    if (buffer[end - 2] === 13 && buffer[end - 1] === 10) end -= 2;

    return buffer.subarray(start, end);
}

function parseContentDisposition(value) {
    const result = {};

    for (const part of String(value || '').split(';')) {
        const [rawKey, ...rawValue] = part.trim().split('=');
        if (!rawKey || !rawValue.length) continue;

        const key = rawKey.trim().toLowerCase();
        let val = rawValue.join('=').trim();
        if (val.startsWith('"') && val.endsWith('"')) {
            val = val.slice(1, -1).replace(/\\"/g, '"');
        }
        result[key] = val;
    }

    return result;
}

function parseMultipart(buffer, boundary) {
    const separator = Buffer.from(`--${boundary}`);
    const headerSeparator = Buffer.from('\r\n\r\n');
    const fields = new Map();
    const files = new Map();

    for (const rawPart of splitBuffer(buffer, separator)) {
        let part = trimMultipartCrlf(rawPart);
        if (!part.length || part.equals(Buffer.from('--'))) continue;
        if (part.subarray(0, 2).equals(Buffer.from('--'))) continue;

        const headerEnd = part.indexOf(headerSeparator);
        if (headerEnd === -1) continue;

        const headerText = part.subarray(0, headerEnd).toString('latin1');
        const body = trimMultipartCrlf(part.subarray(headerEnd + headerSeparator.length));
        const headers = new Map();

        for (const line of headerText.split('\r\n')) {
            const index = line.indexOf(':');
            if (index === -1) continue;
            headers.set(line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim());
        }

        const disposition = parseContentDisposition(headers.get('content-disposition'));
        const name = disposition.name;
        if (!name) continue;

        if (disposition.filename != null) {
            files.set(name, {
                filename: disposition.filename,
                contentType: (headers.get('content-type') || '').toLowerCase(),
                data: body
            });
        } else {
            fields.set(name, body.toString('utf8'));
        }
    }

    return { fields, files };
}

function readRequestBuffer(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let bytes = 0;

        req.on('data', chunk => {
            bytes += chunk.length;
            if (bytes > MAX_UPLOAD_BYTES) {
                reject(Object.assign(new Error('Image trop volumineuse.'), { statusCode: 413 }));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });

        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function sniffImage(buffer) {
    if (buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
        return { ext: 'webp', mime: 'image/webp' };
    }

    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return { ext: 'jpg', mime: 'image/jpeg' };
    }

    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return { ext: 'png', mime: 'image/png' };
    }

    if (buffer.length >= 6) {
        const signature = buffer.subarray(0, 6).toString('ascii');
        if (signature === 'GIF87a' || signature === 'GIF89a') {
            return { ext: 'gif', mime: 'image/gif' };
        }
    }

    return null;
}

function sanitizePackageId(value) {
    const safe = String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 120);

    return safe || 'pkg';
}

function publicUrl(req, fileName) {
    return `${req.protocol}://${req.get('host')}${PUBLIC_UPLOAD_PATH}/${encodeURIComponent(fileName)}`;
}

function convertToWebp(ffmpegPath, inputPath, outputPath, isPng = false) {
    if (!ffmpegPath) return Promise.resolve(false);

    return new Promise(resolve => {
        const args = [
            '-y',
            '-i', inputPath,
            '-frames:v', '1',
            '-c:v', 'libwebp',
            ...(isPng
                ? ['-lossless', '1', '-compression_level', '4']
                : ['-q:v', '96', '-preset', 'drawing', '-compression_level', '4']),
            outputPath
        ];
        const child = spawn(ffmpegPath, args, { windowsHide: true, stdio: 'ignore' });

        child.on('error', () => resolve(false));
        child.on('close', code => resolve(code === 0));
    });
}

async function fileExistsWithContent(filePath) {
    try {
        const stat = await fsp.stat(filePath);
        return stat.isFile() && stat.size > 0;
    } catch {
        return false;
    }
}

async function safeUnlink(filePath) {
    try {
        await fsp.unlink(filePath);
    } catch {
        // Best effort cleanup only.
    }
}

async function removeOldPackageCovers(packageSlug, keepFileName) {
    let entries;
    try {
        entries = await fsp.readdir(UPLOAD_DIR, { withFileTypes: true });
    } catch {
        return;
    }

    const prefix = `${packageSlug}-`;
    const allowedExts = new Set(Object.keys(IMAGE_TYPES));

    await Promise.all(entries.map(async entry => {
        if (!entry.isFile() || entry.name === keepFileName || !entry.name.startsWith(prefix)) return;

        const ext = path.extname(entry.name).slice(1).toLowerCase();
        if (!allowedExts.has(ext)) return;

        await safeUnlink(path.join(UPLOAD_DIR, entry.name));
    }));
}

/**
 * GET /api/package-covers/all
 * Returns all package covers (admin manual + user auto-discovered) as a map: { [packageId]: coverUrl }
 */
router.get('/package-covers/all', async (_req, res) => {
    try {
        const covers = {};

        // 1. Add admin explicit covers from SQLite DB (manual uploads only, ignore auto-discovered channel icons)
        let veloraData = null;
        try {
            veloraData = require('./veloraData');
            const adminCovers = veloraData.allRows('admin_package_covers') || [];
            for (const row of adminCovers) {
                const id = String(row.package_id || '');
                const url = String(row.cover_url || '').trim();
                if (id && url && !row.deleted && !row.auto_discovered && !url.includes('tmdb.org') && !url.includes('image.tmdb')) {
                    covers[id] = url;
                }
            }
        } catch (_) {}

        // 2. Official logos filtering, Brand matches & Country flag fallback for packages
        try {
            const channelLogoMatcher = require('../services/channelLogoMatcher');
            const officialOnly = veloraData && typeof veloraData.isOfficialPackagesLogosOnly === 'function'
                ? veloraData.isOfficialPackagesLogosOnly()
                : (veloraData && typeof veloraData.isOfficialLogosOnly === 'function' && veloraData.isOfficialLogosOnly());
            const isOfficial = (url) => veloraData && typeof veloraData.isOfficialLogoUrl === 'function' ? veloraData.isOfficialLogoUrl(url) : true;

            const allPackages = veloraData && typeof veloraData.allRows === 'function' ? (veloraData.allRows('admin_packages') || []) : [];
            const allCountries = veloraData && typeof veloraData.allRows === 'function' ? (veloraData.allRows('admin_countries') || []) : [];
            const countryById = new Map(allCountries.map(c => [String(c.id), c]));

            for (const pkg of allPackages) {
                const pkgId = String(pkg.id || '').trim();
                const catId = String(pkg.category_id || '').trim();
                const pkgName = String(pkg.name || pkg.original_name || '').trim();
                const countryName = countryById.get(String(pkg.country_id))?.name || pkg.country_name || '';

                let existingCover = covers[pkgId] || (catId ? covers[catId] : '') || '';

                if (officialOnly && existingCover && !isOfficial(existingCover)) {
                    existingCover = '';
                }

                // Check brand match first (e.g. Netflix, Canal+, DAZN)
                if (pkgName) {
                    const brandMatch = channelLogoMatcher.matchChannelLogo(pkgName);
                    if (brandMatch && brandMatch.logo) {
                        existingCover = brandMatch.logo;
                    }
                }

                // Fallback to Country Flag / Logo if no dedicated manual/brand logo
                if (!existingCover) {
                    existingCover = channelLogoMatcher.getCountryFlagOrLogo(pkg.country_id, countryName);
                }

                if (existingCover) {
                    if (pkgId) covers[pkgId] = existingCover;
                    if (catId) covers[catId] = existingCover;
                }
            }

            if (officialOnly) {
                for (const [id, url] of Object.entries(covers)) {
                    if (!isOfficial(url)) {
                        delete covers[id];
                    }
                }
            }
        } catch (err) {
            console.warn('[package-cover] error in official/country fallback:', err.message);
        }

        res.set('Cache-Control', 'no-cache');
        return res.json({ ok: true, covers, count: Object.keys(covers).length });
    } catch (err) {
        console.error('[package-cover] get all covers failed:', err);
        return res.status(500).json({ error: 'Unable to load package covers.' });
    }
});

/**
 * POST /api/package-covers/auto-backfill
 * Packages strictly use brand logos or country flags, channel icons are not backfilled.
 */
router.post('/package-covers/auto-backfill', express.json(), async (_req, res) => {
    return res.json({ ok: true, ignored: true });
});

// Admin upload cover
router.post('/r2-package-cover', async (req, res) => {
    const boundary = getBoundary(req.headers['content-type']);
    if (!boundary) {
        return res.status(400).json({ error: 'multipart/form-data requis.' });
    }

    let inputPath = null;
    let webpPath = null;

    try {
        const body = await readRequestBuffer(req);
        const { fields, files } = parseMultipart(body, boundary);
        const file = files.get('file');
        const packageId = fields.get('packageId');

        if (!file || !file.data.length) {
            return res.status(400).json({ error: 'Fichier image manquant.' });
        }

        const detected = sniffImage(file.data);
        if (!detected || !Object.values(IMAGE_TYPES).includes(detected.mime)) {
            return res.status(415).json({ error: 'Format image non supporte.' });
        }

        await fsp.mkdir(TMP_DIR, { recursive: true });
        await fsp.mkdir(UPLOAD_DIR, { recursive: true });

        const packageSlug = sanitizePackageId(packageId);
        const token = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
        const baseName = `${packageSlug}-${token}`;

        inputPath = path.join(TMP_DIR, `${baseName}.${detected.ext}`);
        webpPath = path.join(TMP_DIR, `${baseName}.webp`);
        await fsp.writeFile(inputPath, file.data, { flag: 'wx' });

        const ffmpegPath = req.app && req.app.locals ? req.app.locals.ffmpegPath : null;
        const isPng = detected.ext === 'png';
        const converted = detected.ext !== 'webp' && await convertToWebp(ffmpegPath, inputPath, webpPath, isPng);
        const useWebp = converted && await fileExistsWithContent(webpPath);
        const finalExt = useWebp ? 'webp' : detected.ext;
        const finalName = `${baseName}.${finalExt}`;
        const finalPath = path.join(UPLOAD_DIR, finalName);

        await fsp.rename(useWebp ? webpPath : inputPath, finalPath);
        inputPath = useWebp ? inputPath : null;
        webpPath = useWebp ? null : webpPath;
        await removeOldPackageCovers(packageSlug, finalName);

        const coverUrl = publicUrl(req, finalName);

        // Update in-memory and persistent map
        const map = await loadDiscoveredCovers();
        map[packageId] = {
            packageId,
            coverUrl,
            adminManual: true,
            updatedAt: new Date().toISOString()
        };
        await saveDiscoveredCovers(map);

        return res.json({
            ok: true,
            url: coverUrl,
            path: `${PUBLIC_UPLOAD_PATH}/${finalName}`,
            storage: 'nodecast-vps',
            convertedToWebp: useWebp
        });
    } catch (err) {
        const status = err.statusCode || 500;
        console.error('[package-cover] upload failed:', err);
        return res.status(status).json({ error: status === 500 ? 'Echec upload package cover.' : err.message });
    } finally {
        if (inputPath) await safeUnlink(inputPath);
        if (webpPath) await safeUnlink(webpPath);
    }
});

module.exports = router;

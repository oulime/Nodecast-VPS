const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();
const MAX_BYTES = 2 * 1024 * 1024;
const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'country-logos.json');
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'country-logos');
const PUBLIC_PATH = '/uploads/country-logos';

function clean(value, max = 160) {
    return String(value || '').trim().slice(0, max);
}

function slug(value) {
    return clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'country';
}

function imageType(buffer) {
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'png';
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
    if (buffer.length >= 6 && ['GIF87a','GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'gif';
    return '';
}

async function readMap() {
    try { return JSON.parse(await fs.readFile(DATA_FILE, 'utf8')) || {}; } catch (err) { if (err.code === 'ENOENT') return {}; throw err; }
}

async function writeMap(map) {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    const temp = `${DATA_FILE}.${process.pid}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
    await fs.rename(temp, DATA_FILE);
}

router.get('/', async (_req, res) => {
    try { res.json({ logos: Object.values(await readMap()) }); }
    catch (err) { console.error('[country-logos] read failed:', err); res.status(500).json({ error: 'Unable to read country logos.' }); }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
    try {
        const countryId = clean(req.body?.countryId);
        const countryName = clean(req.body?.countryName, 200);
        const encoded = clean(req.body?.dataBase64, MAX_BYTES * 2);
        if (!countryId || !countryName || !encoded) return res.status(400).json({ error: 'Country and image are required.' });
        const buffer = Buffer.from(encoded.replace(/^data:[^;]+;base64,/, ''), 'base64');
        if (!buffer.length || buffer.length > MAX_BYTES) return res.status(413).json({ error: 'Image must be 2 MB or smaller.' });
        const ext = imageType(buffer);
        if (!ext) return res.status(415).json({ error: 'Use a PNG, JPG, WebP or GIF image.' });
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        const prefix = `${slug(countryId)}-`;
        const fileName = `${prefix}${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
        await fs.writeFile(path.join(UPLOAD_DIR, fileName), buffer, { flag: 'wx' });
        const map = await readMap();
        const previous = map[countryId];
        map[countryId] = { countryId, countryName, path: `${PUBLIC_PATH}/${fileName}`, updatedAt: new Date().toISOString() };
        await writeMap(map);
        if (previous?.path?.startsWith(`${PUBLIC_PATH}/`)) await fs.unlink(path.join(UPLOAD_DIR, path.basename(previous.path))).catch(() => {});
        res.json({ ok: true, logo: map[countryId], storage: 'nodecast-vps' });
    } catch (err) {
        console.error('[country-logos] upload failed:', err);
        res.status(500).json({ error: 'Country logo upload failed.' });
    }
});

module.exports = router;

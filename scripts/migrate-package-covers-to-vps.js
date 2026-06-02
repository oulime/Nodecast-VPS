const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');

require('dotenv').config();

const APPLY = process.argv.includes('--apply');
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
const PUBLIC_BASE_URL = (process.env.PACKAGE_COVERS_PUBLIC_BASE_URL || 'https://nodecast.veloravip.net').replace(/\/+$/, '');
const R2_HOST = process.env.PACKAGE_COVERS_MIGRATE_R2_HOST || 'pub-64908156f66740e19f4e8abe3772f3d8.r2.dev';
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'package-covers');
const TMP_DIR = path.join(UPLOAD_DIR, '.tmp');
const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;

function required(name, value) {
    if (!value) throw new Error(`${name} is required.`);
}

function headers(extra = {}) {
    return {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        ...extra
    };
}

async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
}

async function readRows(table, idColumn) {
    const select = `${encodeURIComponent(idColumn)},cover_url`;
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}&cover_url=not.is.null`;
    const rows = await fetchJson(url, { headers: headers() });
    return (rows || []).map(row => ({ table, idColumn, id: row[idColumn], coverUrl: row.cover_url }));
}

function extensionFor(buffer) {
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'gif';
    throw new Error('Unsupported downloaded image format.');
}

async function download(url) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== R2_HOST) {
        throw new Error(`Refusing non-R2 URL: ${url}`);
    }
    const res = await fetch(parsed, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
    const announced = Number(res.headers.get('content-length') || 0);
    if (announced > MAX_DOWNLOAD_BYTES) throw new Error(`Image too large: ${url}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_DOWNLOAD_BYTES) throw new Error(`Image too large: ${url}`);
    return buffer;
}

function tryConvertToWebp(inputPath, outputPath) {
    return new Promise(resolve => {
        const child = spawn('ffmpeg', [
            '-y', '-i', inputPath, '-frames:v', '1', '-c:v', 'libwebp',
            '-q:v', '82', '-compression_level', '6', outputPath
        ], { windowsHide: true, stdio: 'ignore' });
        child.on('error', () => resolve(false));
        child.on('close', code => resolve(code === 0));
    });
}

async function store(url) {
    const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 20);
    const prefix = `migrated-${hash}`;
    for (const ext of ['webp', 'jpg', 'png', 'gif']) {
        const existing = path.join(UPLOAD_DIR, `${prefix}.${ext}`);
        try {
            const stat = await fs.stat(existing);
            if (stat.isFile() && stat.size > 0) return `${PUBLIC_BASE_URL}/uploads/package-covers/${prefix}.${ext}`;
        } catch {
            // Download below.
        }
    }

    const buffer = await download(url);
    const ext = extensionFor(buffer);
    await fs.mkdir(TMP_DIR, { recursive: true });
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const inputPath = path.join(TMP_DIR, `${prefix}.${ext}`);
    const webpPath = path.join(TMP_DIR, `${prefix}.webp`);
    await fs.writeFile(inputPath, buffer);
    const converted = ext !== 'webp' && await tryConvertToWebp(inputPath, webpPath);
    const finalExt = converted ? 'webp' : ext;
    const finalPath = path.join(UPLOAD_DIR, `${prefix}.${finalExt}`);
    await fs.rename(converted ? webpPath : inputPath, finalPath);
    if (converted) await fs.rm(inputPath, { force: true });
    return `${PUBLIC_BASE_URL}/uploads/package-covers/${prefix}.${finalExt}`;
}

async function updateRow(row, coverUrl) {
    const query = `${encodeURIComponent(row.idColumn)}=eq.${encodeURIComponent(row.id)}`;
    await fetchJson(`${SUPABASE_URL}/rest/v1/${row.table}?${query}`, {
        method: 'PATCH',
        headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ cover_url: coverUrl })
    });
}

async function main() {
    required('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL', SUPABASE_URL);
    required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_PUBLISHABLE_KEY', SUPABASE_KEY);
    const rows = [
        ...await readRows('admin_packages', 'id'),
        ...await readRows('admin_package_covers', 'package_id')
    ];
    const candidates = rows.filter(row => {
        try {
            const parsed = new URL(row.coverUrl);
            return parsed.hostname === R2_HOST;
        } catch {
            return false;
        }
    });
    const distinctUrls = new Set(candidates.map(row => row.coverUrl));
    console.log(`${APPLY ? 'Migrating' : 'Would migrate'} ${candidates.length} rows from ${distinctUrls.size} distinct R2 images.`);
    console.log(`Skipping ${rows.length - candidates.length} rows already on VPS or outside the allowed R2 host.`);
    if (!APPLY) {
        console.log('Dry run only. Re-run with --apply on the VPS to write files and update Supabase URLs.');
        return;
    }
    const migrated = new Map();
    for (const row of candidates) {
        let localUrl = migrated.get(row.coverUrl);
        if (!localUrl) {
            localUrl = await store(row.coverUrl);
            migrated.set(row.coverUrl, localUrl);
        }
        await updateRow(row, localUrl);
        console.log(`${row.table}.${row.idColumn}=${row.id} -> ${localUrl}`);
    }
    console.log(`Done. Migrated ${candidates.length} rows to ${migrated.size} VPS files.`);
}

main().catch(err => {
    console.error(err.message || err);
    process.exitCode = 1;
});

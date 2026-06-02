const fs = require('fs/promises');
const path = require('path');

require('dotenv').config();

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
const VPS_HOST = process.env.PACKAGE_COVERS_VPS_HOST || 'nodecast.veloravip.net';
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'package-covers');
const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;

function required(name, value) {
    if (!value) throw new Error(`${name} is required.`);
}

function headers() {
    return {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
    };
}

async function fetchJson(url) {
    const res = await fetch(url, { headers: headers() });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
}

async function readRows(table) {
    const rows = await fetchJson(`${SUPABASE_URL}/rest/v1/${table}?select=cover_url&cover_url=not.is.null`);
    return rows || [];
}

function localFileName(url) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== VPS_HOST) return null;
    if (!parsed.pathname.startsWith('/uploads/package-covers/')) return null;
    const name = path.basename(decodeURIComponent(parsed.pathname));
    if (!/^[a-zA-Z0-9._-]+\.(?:webp|jpg|jpeg|png|gif)$/i.test(name)) return null;
    return name;
}

async function download(url, fileName) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
    const announced = Number(res.headers.get('content-length') || 0);
    if (announced > MAX_DOWNLOAD_BYTES) throw new Error(`Image too large: ${url}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_DOWNLOAD_BYTES) throw new Error(`Image too large: ${url}`);
    await fs.writeFile(path.join(UPLOAD_DIR, fileName), buffer);
}

async function main() {
    required('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL', SUPABASE_URL);
    required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_PUBLISHABLE_KEY', SUPABASE_KEY);
    const rows = [
        ...await readRows('admin_packages'),
        ...await readRows('admin_package_covers')
    ];
    const byUrl = new Map();
    for (const row of rows) {
        const url = String(row.cover_url || '').trim();
        const fileName = localFileName(url);
        if (fileName) byUrl.set(url, fileName);
    }
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    let downloaded = 0;
    let existing = 0;
    for (const [url, fileName] of byUrl) {
        const filePath = path.join(UPLOAD_DIR, fileName);
        try {
            const stat = await fs.stat(filePath);
            if (stat.isFile() && stat.size > 0) {
                existing++;
                continue;
            }
        } catch {
            // Download below.
        }
        await download(url, fileName);
        downloaded++;
        console.log(`Downloaded ${fileName}`);
    }
    console.log(`Done. ${downloaded} downloaded, ${existing} already present, ${byUrl.size} referenced VPS package-cover files total.`);
}

main().catch(err => {
    console.error(err.message || err);
    process.exitCode = 1;
});

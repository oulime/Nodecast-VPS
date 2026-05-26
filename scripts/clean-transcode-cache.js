const fs = require('fs/promises');
const path = require('path');

const cacheDir = path.join(process.cwd(), 'transcode-cache');
const maxAgeMs = Number(process.env.TRANSCODE_CACHE_MAX_AGE_MINUTES || 60) * 60 * 1000;
const now = Date.now();

async function getLastTouched(sessionDir) {
    try {
        const metadata = JSON.parse(await fs.readFile(path.join(sessionDir, 'session.json'), 'utf8'));
        const lastTouched = Number(metadata.lastAccess || metadata.startTime || 0);
        if (lastTouched) return lastTouched;
    } catch (_) {
        // Missing or invalid metadata: fall back to folder mtime.
    }

    const stat = await fs.stat(sessionDir);
    return stat.mtimeMs;
}

async function clean() {
    let removed = 0;
    let skipped = 0;

    try {
        await fs.access(cacheDir);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('transcode-cache does not exist, nothing to clean.');
            return;
        }
        throw err;
    }

    const dirents = await fs.readdir(cacheDir, { withFileTypes: true });

    for (const dirent of dirents) {
        if (!dirent.isDirectory()) continue;

        const sessionDir = path.join(cacheDir, dirent.name);
        const lastTouched = await getLastTouched(sessionDir);

        if (now - lastTouched > maxAgeMs) {
            await fs.rm(sessionDir, { recursive: true, force: true });
            console.log(`Removed stale transcode cache: ${dirent.name}`);
            removed += 1;
        } else {
            skipped += 1;
        }
    }

    console.log(`Done. Removed ${removed} folder(s), skipped ${skipped} recent folder(s).`);
}

clean().catch(err => {
    console.error('Failed to clean transcode-cache:', err.message);
    process.exitCode = 1;
});

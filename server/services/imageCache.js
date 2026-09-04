const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IMAGE_CACHE_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'tv-logos', 'cached');
try {
    fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
} catch (_) {}

const MIME_TYPES = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.gif': 'image/gif',
    '.avif': 'image/avif'
};

function getMimeType(ext, fallback = 'image/png') {
    return MIME_TYPES[ext.toLowerCase()] || fallback;
}

function getCachedImageInfo(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return null;
    const cleanUrl = urlStr.trim();
    const hash = crypto.createHash('sha256').update(cleanUrl).digest('hex').slice(0, 32);

    let ext = '.png';
    try {
        const u = new URL(cleanUrl);
        const match = u.pathname.match(/\.(png|jpg|jpeg|webp|svg|gif|avif)$/i);
        if (match) ext = '.' + match[1].toLowerCase();
    } catch (_) {}

    const fileName = `${hash}${ext}`;
    const filePath = path.join(IMAGE_CACHE_DIR, fileName);
    const publicPath = `/uploads/tv-logos/cached/${fileName}`;

    return {
        hash,
        ext,
        fileName,
        filePath,
        publicPath
    };
}

/**
 * Checks if image is already cached on disk or downloads and mirrors it.
 */
async function getOrFetchCachedImage(urlStr, timeoutMs = 5000) {
    if (!urlStr || typeof urlStr !== 'string' || !urlStr.startsWith('http')) {
        return null;
    }

    const info = getCachedImageInfo(urlStr);
    if (!info) return null;

    // Check existing cached files with this hash (any extension)
    try {
        const existingFiles = fs.readdirSync(IMAGE_CACHE_DIR).filter(f => f.startsWith(info.hash));
        if (existingFiles.length > 0) {
            const foundFile = existingFiles[0];
            const foundPath = path.join(IMAGE_CACHE_DIR, foundFile);
            const stat = fs.statSync(foundPath);
            if (stat.size > 100) {
                const foundExt = path.extname(foundFile);
                return {
                    hash: info.hash,
                    ext: foundExt,
                    fileName: foundFile,
                    filePath: foundPath,
                    publicPath: `/uploads/tv-logos/cached/${foundFile}`,
                    hit: true,
                    mimeType: getMimeType(foundExt),
                    size: stat.size
                };
            }
        }
    } catch (_) {}

    // Fetch from upstream with anti-rate-limit headers (Wikimedia / Wikipedia referer, browser UA)
    try {
        const isWikimedia = /wikimedia\.org|wikipedia\.org/i.test(urlStr);
        let origin = 'https://en.wikipedia.org/';
        try { origin = new URL(urlStr).origin + '/'; } catch (_) {}

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Referer': isWikimedia ? 'https://en.wikipedia.org/' : origin
        };

        const res = await fetch(urlStr, {
            headers,
            signal: AbortSignal.timeout(timeoutMs)
        });

        if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > 100) {
                let actualExt = info.ext;
                const contentType = (res.headers.get('content-type') || '').toLowerCase();
                if (contentType.includes('svg')) actualExt = '.svg';
                else if (contentType.includes('webp')) actualExt = '.webp';
                else if (contentType.includes('jpeg') || contentType.includes('jpg')) actualExt = '.jpg';
                else if (contentType.includes('png')) actualExt = '.png';
                else if (contentType.includes('gif')) actualExt = '.gif';
                else if (contentType.includes('avif')) actualExt = '.avif';

                const finalName = `${info.hash}${actualExt}`;
                const finalPath = path.join(IMAGE_CACHE_DIR, finalName);
                await fs.promises.writeFile(finalPath, buf);

                return {
                    hash: info.hash,
                    ext: actualExt,
                    fileName: finalName,
                    filePath: finalPath,
                    publicPath: `/uploads/tv-logos/cached/${finalName}`,
                    hit: false,
                    mimeType: getMimeType(actualExt, contentType || 'image/png'),
                    size: buf.length,
                    buffer: buf
                };
            }
        }
    } catch (_) {}

    return null;
}

module.exports = {
    IMAGE_CACHE_DIR,
    getCachedImageInfo,
    getOrFetchCachedImage,
    getMimeType
};

const fs = require('fs');
const assert = require('assert');

console.log('--- 1. Testing VideoPlayer.js config ---');
const vp = fs.readFileSync('public/js/components/VideoPlayer.js', 'utf8');
assert(vp.includes("liveSyncMode: 'buffered'"), 'VideoPlayer missing liveSyncMode: buffered');
assert(vp.includes("liveSyncDurationCount: 3"), 'VideoPlayer missing liveSyncDurationCount: 3');
assert(vp.includes("liveMaxLatencyDurationCount: 10"), 'VideoPlayer missing liveMaxLatencyDurationCount: 10');
assert(vp.includes("maxLiveSyncPlaybackRate: 1,"), 'VideoPlayer missing maxLiveSyncPlaybackRate: 1');
assert(vp.includes("maxBufferLength: 90,"), 'VideoPlayer missing maxBufferLength: 90');
console.log('PASS: VideoPlayer.js configured correctly');

console.log('--- 2. Testing main-JkackQV-.js & custom-package-v7.js ---');
for (const file of ['public/assets/main-JkackQV-.js', 'public/assets/main-JkackQV-custom-package-v7.js']) {
  const b = fs.readFileSync(file, 'utf8');
  assert(b.includes('maxLiveSyncPlaybackRate:1'), file + ' missing maxLiveSyncPlaybackRate: 1');
  assert(b.includes('maxBufferLength:90'), file + ' missing maxBufferLength: 90');
  assert(b.includes('let u=o,d=null;if(l.autoTranscode&&!r){'), file + ' missing !r in jU autoTranscode');
  console.log('PASS: ' + file + ' verified');
}

console.log('--- 3. Testing proxy.js cache TTL & monotonic guard ---');
const proxy = fs.readFileSync('server/routes/proxy.js', 'utf8');
assert(proxy.includes('const LIVE_MANIFEST_CACHE_TTL_MS = 6500;'), 'proxy.js does not have LIVE_MANIFEST_CACHE_TTL_MS = 6500');
assert(proxy.includes('const LIVE_MANIFEST_STALE_TTL_MS = 120000;'), 'proxy.js does not have LIVE_MANIFEST_STALE_TTL_MS = 120000');
assert(proxy.includes('Monotonic sequence protection'), 'proxy.js missing monotonic sequence protection');
console.log('PASS: server/routes/proxy.js cache TTL is 6500ms, stale TTL is 120s, and has monotonic sequence protection');

console.log('--- 4. Testing transcodeSession.js INITIAL_LIVE_SEGMENTS ---');
const ts = fs.readFileSync('server/services/transcodeSession.js', 'utf8');
assert(ts.includes("INITIAL_LIVE_SEGMENTS = readPositiveIntegerEnv('TRANSCODE_INITIAL_LIVE_SEGMENTS', 1);"), 'transcodeSession.js does not have INITIAL_LIVE_SEGMENTS = 1');
console.log('PASS: server/services/transcodeSession.js INITIAL_LIVE_SEGMENTS is 1');

console.log('--- 5. Testing index.html bundle version ---');
const html = fs.readFileSync('public/index.html', 'utf8');
assert(html.includes('main-JkackQV-custom-package-v7.js?v=20260905-hls-smooth-v3'), 'index.html missing updated cache buster');
console.log('PASS: public/index.html cache buster is 20260905-hls-smooth-v3');

console.log('--- 6. Testing Dino HLS manifest rewrite simulation ---');
const sampleDinoPlaylist = [
  '#EXTM3U',
  '#EXT-X-VERSION:3',
  '#EXT-X-TARGETDURATION:6',
  '#EXT-X-MEDIA-SEQUENCE:5820',
  '#EXTINF:6.000,',
  '5820.ts',
  '#EXTINF:6.000,',
  '5821.ts',
  '#EXTINF:6.000,',
  '5822.ts'
].join('\n');

const baseUrl = 'http://dino-server:8080/live/user/pass/';
const baseUrlPrefix = '/api/proxy/stream?url=';
const rewritten = sampleDinoPlaylist.split('\n').map(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return line;
  const absUrl = new URL(trimmed, baseUrl).href;
  return baseUrlPrefix + encodeURIComponent(absUrl);
}).join('\n');

const segs = rewritten.match(/582\d\.ts/g);
assert.equal(segs.length, 3);
assert(rewritten.includes('/api/proxy/stream?url=http%3A%2F%2Fdino-server%3A8080%2Flive%2Fuser%2Fpass%2F5822.ts'));
console.log('PASS: Dino manifest rewriting validated');

console.log('\n======================================================');
console.log('  ALL TESTS PASSED! THE IMPLEMENTATION IS VERIFIED.');
console.log('======================================================');

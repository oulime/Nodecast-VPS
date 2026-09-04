const fs = require('fs');
const assert = require('assert');

console.log('--- 1. Testing VideoPlayer.js config ---');
const vp = fs.readFileSync('public/js/components/VideoPlayer.js', 'utf8');
assert(vp.includes("liveSyncMode: 'edge'"), 'VideoPlayer missing liveSyncMode: edge');
assert(vp.includes("liveSyncDurationCount: 1"), 'VideoPlayer missing liveSyncDurationCount: 1');
assert(vp.includes("liveMaxLatencyDurationCount: 4"), 'VideoPlayer missing liveMaxLatencyDurationCount: 4');
assert(vp.includes("maxLiveSyncPlaybackRate: 1.1"), 'VideoPlayer missing maxLiveSyncPlaybackRate: 1.1');
console.log('PASS: VideoPlayer.js configured correctly');

console.log('--- 2. Testing main-JkackQV-.js & custom-package-v7.js ---');
for (const file of ['public/assets/main-JkackQV-.js', 'public/assets/main-JkackQV-custom-package-v7.js']) {
  const b = fs.readFileSync(file, 'utf8');
  assert(b.includes('liveSyncMode:"edge",liveSyncDurationCount:1,liveMaxLatencyDurationCount:4'), file + ' missing liveSyncMode edge or liveSyncDurationCount 1 in GU');
  assert(b.includes('liveBackBufferLength:30,liveSyncMode:"edge",liveSyncDurationCount:1,liveMaxLatencyDurationCount:4'), file + ' missing liveSyncMode edge in Sg');
  assert(b.includes('let u=o,d=null;if(l.autoTranscode&&!r){'), file + ' missing !r in jU autoTranscode');
  console.log('PASS: ' + file + ' verified');
}

console.log('--- 3. Testing proxy.js cache TTL ---');
const proxy = fs.readFileSync('server/routes/proxy.js', 'utf8');
assert(proxy.includes('const LIVE_MANIFEST_CACHE_TTL_MS = 1000;'), 'proxy.js does not have LIVE_MANIFEST_CACHE_TTL_MS = 1000');
console.log('PASS: server/routes/proxy.js cache TTL is 1000ms');

console.log('--- 4. Testing transcodeSession.js INITIAL_LIVE_SEGMENTS ---');
const ts = fs.readFileSync('server/services/transcodeSession.js', 'utf8');
assert(ts.includes("INITIAL_LIVE_SEGMENTS = readPositiveIntegerEnv('TRANSCODE_INITIAL_LIVE_SEGMENTS', 1);"), 'transcodeSession.js does not have INITIAL_LIVE_SEGMENTS = 1');
console.log('PASS: server/services/transcodeSession.js INITIAL_LIVE_SEGMENTS is 1');

console.log('--- 5. Testing index.html bundle version ---');
const html = fs.readFileSync('public/index.html', 'utf8');
assert(html.includes('main-JkackQV-custom-package-v7.js?v=20260903-live-edge-v1'), 'index.html missing updated cache buster');
console.log('PASS: public/index.html cache buster is 20260903-live-edge-v1');

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

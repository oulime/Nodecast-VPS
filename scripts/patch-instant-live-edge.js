const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const assets = [
    'public/assets/main-JkackQV-.js',
    'public/assets/main-JkackQV-custom-package-v7.js'
];

for (const asset of assets) {
    const filename = path.join(root, asset);
    let source = fs.readFileSync(filename, 'utf8');

    // 1. Hls.js internal default liveSyncDurationCount & liveSyncMode
    source = source.replace(
        'nudgeOnVideoHole:!0,liveSyncMode:"edge",liveSyncDurationCount:1,',
        'nudgeOnVideoHole:!0,liveSyncMode:"buffered",liveSyncDurationCount:3,'
    );
    source = source.replace(
        'liveSyncMode:"edge",liveSyncDurationCount:1,',
        'liveSyncMode:"buffered",liveSyncDurationCount:3,'
    );
    source = source.replace(
        'liveSyncMode:"edge",liveSyncDurationCount:3,',
        'liveSyncMode:"buffered",liveSyncDurationCount:3,'
    );

    // 2. Strict 1.0x playback rate (never speed up on live IPTV streams)
    source = source.replaceAll(
        'maxLiveSyncPlaybackRate:1.05',
        'maxLiveSyncPlaybackRate:1'
    );
    source = source.replaceAll(
        'maxLiveSyncPlaybackRate:1.1',
        'maxLiveSyncPlaybackRate:1'
    );

    // 3. Deep Buffer Cushion in Sg() (90s buffer, 180s max, 250MB)
    source = source.replace(
        'maxBufferLength:30,maxMaxBufferLength:60,maxBufferSize:60*1e3*1e3',
        'maxBufferLength:90,maxMaxBufferLength:180,maxBufferSize:250*1e3*1e3'
    );

    // 4. Relax PTS lookup tolerance and buffer hole in Sg() to avoid false hole detection & jumps
    source = source.replace(
        'maxBufferHole:1,backBufferLength:30,liveBackBufferLength:30',
        'maxBufferHole:1.5,backBufferLength:30,liveBackBufferLength:30'
    );
    source = source.replace(
        'maxFragLookUpTolerance:d?1.5:.25',
        'maxFragLookUpTolerance:1.5'
    );

    // 5. Safe error recovery: startLoad() instead of startLoad(-1) to prevent violent seek jumps to edge
    source = source.replace(
        'if(m.type===X.NETWORK_ERROR)try{h.startLoad(-1);return}catch{}',
        'if(m.type===X.NETWORK_ERROR)try{h.startLoad();return}catch{}'
    );
    source = source.replace(
        'if(c.type===X.NETWORK_ERROR)try{n.startLoad(-1);return}catch{}',
        'if(c.type===X.NETWORK_ERROR)try{n.startLoad();return}catch{}'
    );
    source = source.replace(
        'if(o.type===X.NETWORK_ERROR)try{i.startLoad(-1);return}catch{}',
        'if(o.type===X.NETWORK_ERROR)try{i.startLoad();return}catch{}'
    );

    // 6. Safe watchdog timers: startLoad() instead of startLoad(-1)
    source = source.replaceAll('try{ut.startLoad(-1)}catch{}', 'try{ut.startLoad()}catch{}');
    source = source.replaceAll('try{e.startLoad(-1)}catch{}', 'try{e.startLoad()}catch{}');
    source = source.replaceAll('try{Xe.startLoad(-1)}catch{}', 'try{Xe.startLoad()}catch{}');
    source = source.replaceAll('try{e==null||e.startLoad(-1)}catch{}', 'try{e==null||e.startLoad()}catch{}');

    // 7. Remove forced liveSyncPosition seek on play/resume in main-JkackQV-.js
    source = source.replace(
        'if(ut&&ut.liveSyncPosition)try{V.currentTime=ut.liveSyncPosition}catch{}',
        '/* noop */'
    );

    // 8. jU() bypass autoTranscode upfront probe on Live TV
    const juAutoTranscodeBefore = 'let u=o,d=null;if(l.autoTranscode){';
    const juAutoTranscodeAfter = 'let u=o,d=null;if(l.autoTranscode&&!r){';
    if (source.includes(juAutoTranscodeBefore)) {
        source = source.replace(juAutoTranscodeBefore, juAutoTranscodeAfter);
        console.log(`[${asset}] Patched jU() to stream Live TV directly without upfront probe pause`);
    }

    // 9. jU() mixed-content safe proxy for HTTP streams on HTTPS
    const juProxyBefore = '}}u=l.forceProxy||o.includes("pluto.tv")?XT(a,o):o;';
    const juProxyAfter = '}}u=l.forceProxy||(typeof location!="undefined"&&location.protocol==="https:"&&/^http:\\/\\//i.test(o))||o.includes("pluto.tv")?XT(a,o):o;';
    if (source.includes(juProxyBefore)) {
        source = source.replace(juProxyBefore, juProxyAfter);
        console.log(`[${asset}] Patched jU() mixed-content proxy safety`);
    }

    fs.writeFileSync(filename, source, 'utf8');
    // Verify syntax
    execSync(`node --check "${filename}"`);
    console.log(`[${asset}] Successfully verified syntax.`);
}

console.log('All bundles successfully patched and verified!');

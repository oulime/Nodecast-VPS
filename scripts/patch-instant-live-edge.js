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

    // 2. GU() player config
    source = source.replace(
        'liveSyncMode:"buffered",liveSyncDurationCount:3,liveMaxLatencyDurationCount:4,maxLiveSyncPlaybackRate:1.1,liveDurationInfinity:!0',
        'liveSyncMode:"buffered",liveSyncDurationCount:3,liveMaxLatencyDurationCount:10,maxLiveSyncPlaybackRate:1.05,liveDurationInfinity:!0'
    );
    source = source.replace(
        'liveSyncMode:"edge",liveSyncDurationCount:1,liveMaxLatencyDurationCount:4,maxLiveSyncPlaybackRate:1.1,liveDurationInfinity:!0',
        'liveSyncMode:"buffered",liveSyncDurationCount:3,liveMaxLatencyDurationCount:10,maxLiveSyncPlaybackRate:1.05,liveDurationInfinity:!0'
    );
    source = source.replace(
        'liveSyncDurationCount:3,liveMaxLatencyDurationCount:10,liveDurationInfinity:!0',
        'liveSyncMode:"buffered",liveSyncDurationCount:3,liveMaxLatencyDurationCount:10,maxLiveSyncPlaybackRate:1.05,liveDurationInfinity:!0'
    );

    // 3. Sg() player config
    source = source.replace(
        'liveBackBufferLength:30,liveSyncMode:"edge",liveSyncDurationCount:1,liveMaxLatencyDurationCount:4,maxLiveSyncPlaybackRate:1.1',
        'liveBackBufferLength:30,liveSyncMode:"buffered",liveSyncDurationCount:3,liveMaxLatencyDurationCount:10,maxLiveSyncPlaybackRate:1.05'
    );
    source = source.replace(
        'liveBackBufferLength:30,liveSyncDurationCount:d?2:3,liveMaxLatencyDurationCount:d?6:10',
        'liveBackBufferLength:30,liveSyncMode:"buffered",liveSyncDurationCount:3,liveMaxLatencyDurationCount:10,maxLiveSyncPlaybackRate:1.05'
    );

    // 4. jU() bypass autoTranscode upfront probe on Live TV
    const juAutoTranscodeBefore = 'let u=o,d=null;if(l.autoTranscode){';
    const juAutoTranscodeAfter = 'let u=o,d=null;if(l.autoTranscode&&!r){';
    if (source.includes(juAutoTranscodeBefore)) {
        source = source.replace(juAutoTranscodeBefore, juAutoTranscodeAfter);
        console.log(`[${asset}] Patched jU() to stream Live TV directly without upfront probe pause`);
    }

    // 5. jU() mixed-content safe proxy for HTTP streams on HTTPS
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

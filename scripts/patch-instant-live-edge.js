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

    // 1. Hls.js internal default liveSyncDurationCount
    const hlsDefaultBefore = 'liveSyncMode:"edge",liveSyncDurationCount:3,';
    const hlsDefaultAfter = 'liveSyncMode:"edge",liveSyncDurationCount:1,';
    if (source.includes(hlsDefaultBefore)) {
        source = source.replace(hlsDefaultBefore, hlsDefaultAfter);
        console.log(`[${asset}] Patched Hls default liveSyncDurationCount to 1`);
    }

    // 2. GU() player config
    const guBefore = 'liveSyncDurationCount:3,liveMaxLatencyDurationCount:10,liveDurationInfinity:!0';
    const guAfter = 'liveSyncMode:"edge",liveSyncDurationCount:1,liveMaxLatencyDurationCount:4,maxLiveSyncPlaybackRate:1.1,liveDurationInfinity:!0';
    if (source.includes(guBefore)) {
        source = source.replace(guBefore, guAfter);
        console.log(`[${asset}] Patched GU() live settings to live edge`);
    }

    // 3. Sg() player config
    const sgBefore = 'liveBackBufferLength:30,liveSyncDurationCount:d?2:3,liveMaxLatencyDurationCount:d?6:10';
    const sgAfter = 'liveBackBufferLength:30,liveSyncMode:"edge",liveSyncDurationCount:1,liveMaxLatencyDurationCount:4,maxLiveSyncPlaybackRate:1.1';
    if (source.includes(sgBefore)) {
        source = source.replace(sgBefore, sgAfter);
        console.log(`[${asset}] Patched Sg() live settings to live edge`);
    }

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

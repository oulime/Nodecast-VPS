const fs = require('fs');
const path = require('path');

const assets = [
    'public/assets/main-JkackQV-.js',
    'public/assets/main-JkackQV-custom-package-v7.js'
];

const replacements = [
    [
        ';let y=8;const v=(E,T)=>{const L=y>0;L&&y--,IG(E,L,T)};for(const E of p){',
        ';let y=8;const v=(E,T)=>{const L=y>0;L&&y--,IG(E,L,T)},__velAddLivePackageLogo=(E,T)=>{if(!T)return;const L=document.createElement("img");L.className="vel-package-card__live-logo",L.alt="",L.setAttribute("role","presentation"),L.loading="lazy",L.decoding="async",L.src=T,E.classList.add("vel-package-card--has-live-logo"),L.addEventListener("error",()=>{L.remove(),E.classList.remove("vel-package-card--has-live-logo")}),E.appendChild(L)};for(const E of p){'
    ],
    [
        ',B=w?null:(()=>{const P=g(E).find(H=>$e||!rp(H.name));return P?ph(P.stream_icon,s.base):null})();if(T){',
        ',B=(()=>{const P=(__velIsParentPackage(E)?(E.child_package_ids??[]).flatMap(H=>{const j=es.find(z=>String(z.id)===String(H));return j?g(j):[]}):g(E)).find(H=>($e||!rp(H.name))&&ph(H.stream_icon,s.base));return P?ph(P.stream_icon,s.base):null})();if(T){'
    ],
    [
        'const H=(S=E.cover_url)==null?void 0:S.trim();if(!w&&',
        'const H=(S=E.cover_url)==null?void 0:S.trim();w&&__velAddLivePackageLogo(P,H&&(/^https?:\\/\\//i.test(H)||H.startsWith("/uploads/package-covers/"))?gb(H):B?am(B):null);if(!w&&'
    ],
    [
        'F.appendChild(te)};if(!w&&$){',
        'F.appendChild(te)};w&&__velAddLivePackageLogo(F,$?gb($):B?am(B):null);if(!w&&$){'
    ]
];

function replaceOnce(source, search, replacement, file) {
    const first = source.indexOf(search);
    const second = first < 0 ? -1 : source.indexOf(search, first + search.length);
    if (first < 0 || second >= 0) {
        throw new Error(`${file}: expected exactly one occurrence of ${search.slice(0, 80)}`);
    }
    return source.slice(0, first) + replacement + source.slice(first + search.length);
}

for (const asset of assets) {
    const file = path.join(process.cwd(), asset);
    let source = fs.readFileSync(file, 'utf8');
    let changed = false;
    if (source.includes('__velAddLivePackageLogo')) {
        const legacyFallbacks = [
            'B=(()=>{const P=g(E).find(H=>$e||!rp(H.name));return P?ph(P.stream_icon,s.base):null})()',
            'B=(()=>{const P=g(E).find(H=>($e||!rp(H.name))&&ph(H.stream_icon,s.base));return P?ph(P.stream_icon,s.base):null})()'
        ];
        const parentFallback = 'B=(()=>{const P=(__velIsParentPackage(E)?(E.child_package_ids??[]).flatMap(H=>{const j=es.find(z=>String(z.id)===String(H));return j?g(j):[]}):g(E)).find(H=>($e||!rp(H.name))&&ph(H.stream_icon,s.base));return P?ph(P.stream_icon,s.base):null})()';
        const legacyFallback = legacyFallbacks.find(candidate => source.includes(candidate));
        if (legacyFallback) {
            source = replaceOnce(source, legacyFallback, parentFallback, asset);
            changed = true;
        } else if (!source.includes(parentFallback)) {
            throw new Error(`${asset}: patched live-logo fallback was not found`);
        }
    } else {
        for (const [search, replacement] of replacements) {
            source = replaceOnce(source, search, replacement, asset);
        }
        changed = true;
    }
    if (changed) fs.writeFileSync(file, source);
    console.log(`${asset}: ${changed ? 'patched' : 'already patched'}`);
}

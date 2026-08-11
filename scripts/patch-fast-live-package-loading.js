const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, '..', 'public', 'assets', 'main-JkackQV-custom-package-v7.js');
let source = fs.readFileSync(bundlePath, 'utf8');

const loaderV1 = 'async function __velLoadCachedLivePackage(s){const e=Sr();if(!_||!e)return!1;try{const t=await fetch(`/api/velora-db/admin/package-live-channels?countryId=${encodeURIComponent(e)}&packageId=${encodeURIComponent(s)}`,{cache:"no-store"});if(!t.ok)return!1;const r=await t.json(),n=Array.isArray(r==null?void 0:r.channels)?r.channels:null;if(!n)return!1;const i=String((r==null?void 0:r.package)==null?void 0:r.package.category_id||s),a=n.map(o=>{const l=String(o.stream_id??"").trim(),c=Number(l),u=Number.isFinite(c)?c:l;return{...o,stream_id:u,raw_stream_id:u,nodecast_source_id:String(o.source_id??""),nodecast_media:"live",category_id:i,raw_category_id:i}});return _.streamsByCatAll.set(String(s),a),_.liveLoadedCategoryIds.add(String(s)),yr(),!0}catch(t){return console.warn("[Velora] Cached Live package load failed",t),!1}}';
const loaderV2 = 'async function __velLoadCachedLivePackage(s){const e=Sr(),t=es.find(v=>String(v.id)===String(s));if(!_||!e)return!1;const r=String((t==null?void 0:t.source_id)??""),n=String((t==null?void 0:t.category_id)??""),i=(v,p=n)=>{const y=String(p||s),a=v.map(h=>{const d=String(h.stream_id??h.raw_stream_id??"").trim(),f=Number(d),m=Number.isFinite(f)?f:d;return{...h,stream_id:m,raw_stream_id:m,nodecast_source_id:String(h.nodecast_source_id??h.source_id??r),nodecast_media:"live",category_id:h.category_id??y,raw_category_id:h.raw_category_id??y}});return _.streamsByCatAll.set(String(s),a),_.liveLoadedCategoryIds.add(String(s)),yr(),!0},a=(async()=>{try{const v=await fetch(`/api/velora-db/admin/package-live-channels?countryId=${encodeURIComponent(e)}&packageId=${encodeURIComponent(s)}`,{cache:"no-store"});if(!v.ok)return null;const p=await v.json(),y=Array.isArray(p==null?void 0:p.channels)?p.channels:null;return y?{channels:y,categoryId:String(((p==null?void 0:p.package)==null?void 0:p.package.category_id)||n||s)}:null}catch{return null}})(),o=async()=>{if(!r||!n)return null;try{const v=await Ke(`${_.base}/api/proxy/xtream/${encodeURIComponent(r)}/live_streams?category_id=${encodeURIComponent(n)}`,{headers:_.nodecastAuthHeaders,timeoutMs:5e3}),p=Cs(v).map((y,h)=>mc(y,h)).filter(y=>y!=null).map(y=>({...y,nodecast_source_id:r,nodecast_media:"live"}));return{channels:p,categoryId:n}}catch{return null}},l=await o();if(l)return i(l.channels,l.categoryId),a.then(v=>{v&&(i(v.channels,v.categoryId),_&&Z==="content"&&G==="live"&&Q===s&&We())}),!0;const c=await a;return c?i(c.channels,c.categoryId):!1}';
const loaderV3 = `const __velLoadedLivePackageIds=new Set;window.addEventListener("velora-admin-curation-changed",()=>__velLoadedLivePackageIds.clear());${loaderV2
    .replace('if(!_||!e)return!1;', 'if(!_||!e)return!1;if(__velLoadedLivePackageIds.has(String(s)))return!0;')
    .replace('_.liveLoadedCategoryIds.add(String(s)),yr(),!0', '_.liveLoadedCategoryIds.add(String(s)),__velLoadedLivePackageIds.add(String(s)),yr(),!0')}`;
const loaderV4 = loaderV3.replace(
    'const r=String((t==null?void 0:t.source_id)??""),n=String((t==null?void 0:t.category_id)??""),i=',
    'let r=String((t==null?void 0:t.source_id)??""),n=String((t==null?void 0:t.category_id)??"");if(!r||!n)try{const v=await fetch("/api/velora-db/admin/resolved-packages"),p=await v.json(),y=Array.isArray(p)?p.find(h=>String(h.id)===String(s)):null;r=String((y==null?void 0:y.source_id)??r),n=String((y==null?void 0:y.category_id)??n)}catch{}const i='
);

const delayedLoadingHelpers = 'let __velLiveLoaderTimer=null;function __velScheduleLiveLoader(s,e){__velCancelLiveLoader(),__velLiveLoaderTimer=setTimeout(()=>{__velLiveLoaderTimer=null,_&&Z==="content"&&G==="live"&&Q===s&&y2(e)},250)}function __velCancelLiveLoader(){__velLiveLoaderTimer!==null&&(clearTimeout(__velLiveLoaderTimer),__velLiveLoaderTimer=null)}';
const resolvedLookupV4 = 'if(!r||!n)try{const v=await fetch("/api/velora-db/admin/resolved-packages"),p=await v.json(),y=Array.isArray(p)?p.find(h=>String(h.id)===String(s)):null;r=String((y==null?void 0:y.source_id)??r),n=String((y==null?void 0:y.category_id)??n)}catch{}';
const resolvedLookupV5 = 'if(!r||!n)try{const v=window.__veloraGetResolvedPackages?await window.__veloraGetResolvedPackages():await(await fetch("/api/velora-db/admin/resolved-packages")).json(),y=Array.isArray(v)?v.find(h=>String(h.id)===String(s)):null;r=String((y==null?void 0:y.source_id)??r),n=String((y==null?void 0:y.category_id)??n)}catch{}';
const fullPackageRequestV4 = 'a=(async()=>{try{const v=await fetch(`/api/velora-db/admin/package-live-channels?countryId=${encodeURIComponent(e)}&packageId=${encodeURIComponent(s)}`,{cache:"no-store"});if(!v.ok)return null;const p=await v.json(),y=Array.isArray(p==null?void 0:p.channels)?p.channels:null;return y?{channels:y,categoryId:String(((p==null?void 0:p.package)==null?void 0:p.package.category_id)||n||s)}:null}catch{return null}})()';
const fullPackageRequestV5 = 'a=async()=>{try{const v=await fetch(`/api/velora-db/admin/package-live-channels?countryId=${encodeURIComponent(e)}&packageId=${encodeURIComponent(s)}`);if(!v.ok)return null;const p=await v.json(),y=Array.isArray(p==null?void 0:p.channels)?p.channels:null;return y?{channels:y,categoryId:String(((p==null?void 0:p.package)==null?void 0:p.package.category_id)||n||s)}:null}catch{return null}}';
const eagerFullPackageTailV4 = 'if(l)return i(l.channels,l.categoryId),a.then(v=>{v&&(i(v.channels,v.categoryId),_&&Z==="content"&&G==="live"&&Q===s&&We())}),!0;const c=await a;';
const deferredFullPackageTailV5 = 'if(l){i(l.channels,l.categoryId);const v=()=>a().then(p=>{p&&(i(p.channels,p.categoryId),_&&Z==="content"&&G==="live"&&Q===s&&We())});return typeof requestIdleCallback==="function"?requestIdleCallback(v,{timeout:1500}):setTimeout(v,500),!0}const c=await a();';
const loaderV5 = delayedLoadingHelpers + loaderV4
    .replace(resolvedLookupV4, resolvedLookupV5)
    .replace(fullPackageRequestV4, fullPackageRequestV5)
    .replace(eagerFullPackageTailV4, deferredFullPackageTailV5);

if (loaderV5 === delayedLoadingHelpers + loaderV4) {
    throw new Error('Could not construct the v5 Live package loader.');
}

function replaceOnce(search, replacement, label) {
    const first = source.indexOf(search);
    const second = first < 0 ? -1 : source.indexOf(search, first + search.length);
    if (first < 0) throw new Error(`Missing bundle anchor: ${label}`);
    if (second >= 0) throw new Error(`Bundle anchor is not unique: ${label}`);
    source = source.slice(0, first) + replacement + source.slice(first + search.length);
}

let changed = false;

if (!source.includes(loaderV5)) {
    const installedLoader = [loaderV4, loaderV3, loaderV2, loaderV1].find(loader => source.includes(loader));
    if (installedLoader) {
        source = source.replace(installedLoader, loaderV5);
        changed = true;
    } else if (source.includes('async function __velLoadCachedLivePackage(')) {
        throw new Error('Unknown installed Live package loader version.');
    }
}

if (source.includes('if(r==="live"&&Ze(s)){const l=$t();l&&(En=await HF(l).catch(()=>En),im())}')) {
    replaceOnce(
        'if(r==="live"&&Ze(s)){const l=$t();l&&(En=await HF(l).catch(()=>En),im())}',
        '',
        'per-package curation reload'
    );
    changed = true;
}

if (!source.includes(loaderV5)) {
    replaceOnce(
        'async function sG(s){if(!_||_.mode!=="nodecast"||G!=="live"||!Ze(s))return;',
        `${loaderV5}async function sG(s){if(!_||_.mode!=="nodecast"||G!=="live"||!Ze(s))return;`,
        'Live package loader'
    );
    changed = true;
}

if (source.includes('if(e.size===0&&!r||Dh(s).length>0)return;await __velWarmLiveStreams();')) {
    replaceOnce(
        'if(e.size===0&&!r||Dh(s).length>0)return;await __velWarmLiveStreams();',
        'if(e.size===0&&!r||Dh(s).length>0)return;if(await __velLoadCachedLivePackage(s))return;await __velWarmLiveStreams();',
        'global Live warm-up fallback'
    );
    changed = true;
}

const immediateLiveLoading = 'c?o?y2(l):v2(s,r):(y2(l),!a&&!o&&v2(s,r))';
const delayedLiveLoading = 'c?o?y2(l):v2(s,r):(a?__velScheduleLiveLoader(s,l):y2(l),!a&&!o&&v2(s,r))';
if (source.includes(immediateLiveLoading)) {
    replaceOnce(immediateLiveLoading, delayedLiveLoading, 'delayed Live loading state');
    changed = true;
} else if (!source.includes(delayedLiveLoading)) {
    throw new Error('Missing bundle anchor: delayed Live loading state');
}

const liveLoadFinallyV4 = '_&&Z==="content"&&G==="live"&&Q===s&&(Va=null,We())';
const liveLoadFinallyV5 = '_&&Z==="content"&&G==="live"&&Q===s&&(Va=null,__velCancelLiveLoader(),We())';
if (source.includes(liveLoadFinallyV4)) {
    replaceOnce(liveLoadFinallyV4, liveLoadFinallyV5, 'Live loading state cleanup');
    changed = true;
} else if (!source.includes(liveLoadFinallyV5)) {
    throw new Error('Missing bundle anchor: Live loading state cleanup');
}

if (changed) {
    fs.writeFileSync(bundlePath, source);
    process.stdout.write('Installed lightweight-first Live package loading v5.\n');
} else {
    process.stdout.write('Lightweight-first Live package loading v5 is already installed.\n');
}

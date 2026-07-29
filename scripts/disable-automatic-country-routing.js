const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, '..', 'public', 'assets', 'main-JkackQV-.js');
let source = fs.readFileSync(bundlePath, 'utf8');

const replacements = [
    [
        'if(!__velManualPackageMatchesTab(n))continue;if(Bs(n,Pe)||cG(n,ue))continue;',
        'if(!__velManualPackageMatchesTab(n))continue;'
    ],
    [
        'if(!__velManualPackageMatchesTab(n))continue;if(!__velManualPackageMatchesTab(n))continue;',
        'if(!__velManualPackageMatchesTab(n))continue;'
    ],
    [
        'function Ey(){if($e)return h2(pr);if(G==="movies"||G==="series")return uG();const s=Io();if(ue===Nn||ot(kn()??"")===ot("Autres"))return s;const t=[...uG(),...s];if(Co()&&ue)for(const r of Op)t.push({id:r.id,country_id:ue,name:r.name});return dG(t.sort((r,n)=>r.name.localeCompare(n.name,"fr")))}',
        'function Ey(){if($e)return h2(pr);return uG()}'
    ],
    [
        'const p=a.filter(E=>G==="live"&&wcIsTargetPackage(E)?!1:wn()?!0:',
        'const p=a.filter(E=>wn()?!0:'
    ],
    [
        'const p=a.filter(E=>wn()?!0:',
        'const p=a.filter(E=>Ze(E.id)?!0:wn()?!0:'
    ],
    [
        'function fd(s){const e=s.trim(),t=YN(e);',
        'function fd(s){return null;const e=s.trim(),t=YN(e);'
    ],
    [
        'function Io(){const s=wc(),e=ue;',
        'function Io(){return[];const s=wc(),e=ue;'
    ],
    [
        'function Ey(){if($e)return h2(pr);if(G==="movies"||G==="series")return Io();',
        'function Ey(){if($e)return h2(pr);if(G==="movies"||G==="series")return uG();'
    ],
    [
        'function Dh(s){if(!_)return[];',
        'function Dh(s){if(!_)return[];if((G==="movies"||G==="series")&&Ze(s)){const e=tG(s),t=G==="movies"?_.vodStreamsByCat:_.seriesStreamsByCat,r=[];for(const n of t.values())for(const i of n)e.has(String(i.stream_id??i.series_id??i.item_id??i.id))&&r.push(i);return r.sort((n,i)=>Re(n.name).localeCompare(Re(i.name),"fr"))}'
    ],
    [
        'function uG(){const s=Sr(),e=kn(),t=e?ot(e):"",r=new Map;for(const n of es){',
        'function __velManualPackageMatchesTab(s){const e=Jn(s.name);if(e&&wc().packages.some(t=>Jn(t.name)===e))return!0;if(!_||!Ze(s.id))return!1;const t=tG(s.id),r=G==="movies"?_.vodStreamsByCat:G==="series"?_.seriesStreamsByCat:_.streamsByCatAll;for(const n of r.values())for(const i of n)if(t.has(String(i.stream_id??i.series_id??i.item_id??i.id)))return!0;return!1}function uG(){const s=Sr(),e=kn(),t=e?ot(e):"",r=new Map;for(const n of es){if(!__velManualPackageMatchesTab(n))continue;'
    ],
    [
        'async function HF(s){const{data:e,error:t}=await s.from("admin_stream_curations").select("stream_id, country_id, target_package_id");if(t)throw t;return GF(e??[])}',
        'async function HF(s){const e=[],t=1e3;for(let r=0;;r+=t){const{data:n,error:i}=await s.from("admin_stream_curations").select("stream_id, country_id, target_package_id").range(r,r+t-1);if(i)throw i;const a=n??[];if(e.push(...a),a.length<t)break}return GF(e)}'
    ],
    [
        'function tG(s){const e=new Set;for(const t of vy())for(const[r,n]of t.entries())n===s&&e.add(r);return e}',
        'function tG(s){const e=new Set;for(const t of vy())for(const[r,n]of t.entries())n===s&&e.add(String(r));return e}'
    ],
    [
        'async function xt(){return nl||(nl=oG().finally(()=>{nl=null}),nl)}',
        'window.addEventListener("velora-admin-curation-changed",()=>{xt().then(()=>{_&&Nt()}).catch(s=>console.warn("[manual-curation-refresh]",s))});async function xt(){return nl||(nl=oG().finally(()=>{nl=null}),nl)}'
    ]
];

let changed = false;
for (const [before, after] of replacements) {
    if (after.includes(before) && source.includes(after)) continue;
    if (source.includes(before)) {
        source = source.replace(before, after);
        changed = true;
        continue;
    }
    if (source.includes(after)) continue;
}

const manualTabMatcher = 'function __velManualPackageMatchesTab(s){const e=Jn(s.name);if(e&&wc().packages.some(t=>Jn(t.name)===e))return!0;if(!_||!Ze(s.id))return!1;const t=tG(s.id),r=G==="movies"?_.vodStreamsByCat:G==="series"?_.seriesStreamsByCat:_.streamsByCatAll;for(const n of r.values())for(const i of n)if(t.has(String(i.stream_id??i.series_id??i.item_id??i.id)))return!0;return!1}';
while (source.includes(manualTabMatcher + manualTabMatcher)) {
    source = source.replace(manualTabMatcher + manualTabMatcher, manualTabMatcher);
    changed = true;
}

const cleanedSource = source
    .replace(/window\.__velManualDebug=\(\)=>\(\{.*?\}\);setTimeout\(\(\)=>console\.log\("\[manual-debug\]",JSON\.stringify\(window\.__velManualDebug\(\)\)\),6e3\);/g, '')
    .replace(/setTimeout\(\(\)=>console\.log\("\[manual-debug-small\]",JSON\.stringify\(\{.*?\}\)\),7e3\);/g, '');
if (cleanedSource !== source) {
    source = cleanedSource;
    changed = true;
}

if (changed) {
    fs.writeFileSync(bundlePath, source);
    console.log('Disabled automatic country routing in', bundlePath);
} else {
    console.log('Automatic country routing was already disabled.');
}

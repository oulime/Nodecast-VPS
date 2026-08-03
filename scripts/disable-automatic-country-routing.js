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
        'function Dh(s){if(!_)return[];if(Ze(s)){const e=tG(s),t=G==="movies"?_.vodStreamsByCat:G==="series"?_.seriesStreamsByCat:_.streamsByCatAll,r=[],n=new Set;for(const i of t.values())for(const a of i){const o=String(a.stream_id??a.series_id??a.item_id??a.id);e.has(o)&&!n.has(o)&&(n.add(o),r.push(a))}return r.sort((i,a)=>Re(i.name).localeCompare(Re(a.name),"fr"))}'
    ],
    [
        'o=(r==="movies"||r==="series")&&!Ze(s)&&!Rw(r,s)',
        'o=(r==="movies"||r==="series")&&!Rw(r,Ze(s)?(wc().packages.find(c=>Jn(c.name)===Jn(t.name))?.id??s):s)'
    ],
    [
        'o&&(async()=>{try{await kw(r,s)}finally{',
        'o&&(async()=>{try{const c=Ze(s)?(wc().packages.find(u=>Jn(u.name)===Jn(t.name))?.id??s):s;await kw(r,c)}finally{'
    ],
    [
        'const e=wc().packages.find(t=>t.id===s)??(G==="live"?es.find(t=>t.id===s):void 0);',
        'const e=wc().packages.find(t=>t.id===s)??es.find(t=>t.id===s);'
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
    ],
    [
        'H&&(/^https?:\\/\\//i.test(H)||H.startsWith("/uploads/package-covers/"))&&(le.style.display="none")',
        '(H&&(/^https?:\\/\\//i.test(H)||H.startsWith("/uploads/package-covers/"))||w&&B)&&(le.style.display="none")'
    ],
    [
        '$&&(R.style.display="none")',
        '($||w&&B)&&(R.style.display="none")'
    ],
    [
        'function Nt(){var S;re.innerHTML="";',
        'let __velLiveLogoLoad=null;async function __velWarmLiveLogos(){if(!_||_.mode!=="nodecast")return;let s=[];try{const e=await Ke(`${_.base}/api/sources/catalog`,{headers:_.nodecastAuthHeaders,timeoutMs:8e3});s=Cs(e).filter(t=>t&&t.type==="xtream"&&t.enabled!==0&&t.enabled!==!1).map(t=>String(t.id).trim()).filter(Boolean)}catch{}s.length||(s=(_.nodecastXtreamSourceIds??[]).map(e=>e.trim()).filter(Boolean));if(!s.length&&_.nodecastXtreamSourceId)s=[_.nodecastXtreamSourceId];const e=await Promise.all(s.map(t=>xp(_.base,t,_.nodecastAuthHeaders).catch(()=>new Map))),t=new Map;for(const r of e)Tn(t,r);if(!_||G!=="live")return;Tn(_.streamsByCatAll,t),FG(_.liveLoadedCategoryIds,t),Pe=Qt(_.liveCategories,_.streamsByCatAll,{includeEmptyPackages:!1}),yr(),Z==="packages"&&Nt()}function __velLoadLivePackageLogo(){__velLiveLogoLoad||(__velLiveLogoLoad=__velWarmLiveLogos().catch(e=>console.warn("[live-package-logo]",e)))}function Nt(){var S;re.innerHTML="";'
    ],
    [
        'B=g(E).map(P=>ph(P.stream_icon,s.base)).find(Boolean);if(T){',
        'B=g(E).map(P=>ph(P.stream_icon,s.base)).find(Boolean);T&&w&&!B&&__velLoadLivePackageLogo(E.id);if(T){'
    ],
    [
        'if(!_||Z!=="content"||Q!==s||G!=="live")return;const i=new Map;',
        'if(!_||G!=="live")return;const i=new Map;'
    ],
    [
        'g=E=>h()?f(E.id):d(E.id);Z2();',
        'g=E=>h()&&Ze(E.id)?Dh(E.id):h()?f(E.id):d(E.id);Z2();'
    ],
    [
        'e.has(c.stream_id)&&!i.has(c.stream_id)&&i.set(c.stream_id,c)',
        'e.has(String(c.stream_id))&&!i.has(c.stream_id)&&i.set(c.stream_id,c)'
    ],
    [
        'return r.sort((i,a)=>Re(i.name).localeCompare(Re(a.name),"fr"))}if(G==="live"&&wcIsWorldCupId(s))',
        'return r}if(G==="live"&&wcIsWorldCupId(s))'
    ],
    [
        'if(Ze(s)){const e=tG(s),t=G==="movies"?_.vodStreamsByCat:G==="series"?_.seriesStreamsByCat:_.streamsByCatAll,r=[],n=new Set;for(const i of t.values())for(const a of i){const o=String(a.stream_id??a.series_id??a.item_id??a.id);e.has(o)&&!n.has(o)&&(n.add(o),r.push(a))}return r}',
        'if(Ze(s)){const e=tG(s),t=G==="movies"?_.vodStreamsByCat:G==="series"?_.seriesStreamsByCat:_.streamsByCatAll,r=new Map;for(const n of t.values())for(const i of n){const a=String(i.stream_id??i.series_id??i.item_id??i.id);r.has(a)||r.set(a,i)}const n=[];for(const i of e){const a=r.get(i);a&&n.push(a)}return n}'
    ],
    [
        'function br(){return W2()}',
        'function br(){const s=W2(),e=window.__veloraVisibleCountries;return s.filter(t=>jr(t.name)==="autres"||e instanceof Set&&e.has(jr(t.name)))}'
    ],
    [
        'window.addEventListener("velora-admin-curation-changed",()=>{xt().then(()=>{_&&Nt()}).catch(s=>console.warn("[manual-curation-refresh]",s))});',
        'window.addEventListener("velora-admin-curation-changed",()=>{xt().then(()=>{_&&Nt()}).catch(s=>console.warn("[manual-curation-refresh]",s))});window.addEventListener("velora-country-visibility-changed",()=>{vr(),_&&Z==="packages"&&Nt()});'
    ],
    [
        'const p=a.filter(E=>Ze(E.id)?!0:',
        'const p=a.filter(E=>(ue===Nn||ot(kn()??"")===ot("Autres"))&&!Ze(E.id)?!0:Ze(E.id)?!0:'
    ],
    [
        'const p=a.filter(E=>(ue===Nn||ot(kn()??"")===ot("Autres"))&&!Ze(E.id)?!0:Ze(E.id)?!0:',
        'const p=a.filter(E=>(ue===Nn||ot(kn()??"")===ot("Autres")||ot(((Ie.options[Ie.selectedIndex]?.textContent)??""))===ot("Autres"))&&!Ze(E.id)?!0:Ze(E.id)?!0:'
    ],
    [
        'function Ey(){if($e)return h2(pr);return uG()}',
        'function Ey(){if(ot(((Ie.options[Ie.selectedIndex]?.textContent)??""))===ot("Autres"))return __velUnassignedPackages();if($e)return h2(pr);return uG()}'
    ],
    [
        'function Ey(){if(ot(((Ie.options[Ie.selectedIndex]?.textContent)??""))===ot("Autres"))return __velUnassignedPackages();if($e)return h2(pr);return uG()}',
        'function Ey(){if(String(ue)==="country__other"||ue===Nn||ot(kn()??"")===ot("Autres")||ot(((Ie.options[Ie.selectedIndex]?.textContent)??""))===ot("Autres"))return __velUnassignedPackages();if($e)return h2(pr);return uG()}'
    ],
    [
        'const p=a.filter(E=>(ue===Nn||ot(kn()??"")===ot("Autres")||ot(((Ie.options[Ie.selectedIndex]?.textContent)??""))===ot("Autres"))&&!Ze(E.id)?!0:',
        'const p=a.filter(E=>(String(ue)==="country__other"||ue===Nn||ot(kn()??"")===ot("Autres")||ot(((Ie.options[Ie.selectedIndex]?.textContent)??""))===ot("Autres"))&&!Ze(E.id)?!0:'
    ],
    [
        'const p=a.filter(E=>(String(ue)==="country__other"||ue===Nn||ot(kn()??"")===ot("Autres")||ot(((Ie.options[Ie.selectedIndex]?.textContent)??""))===ot("Autres"))&&!Ze(E.id)?!0:Ze(E.id)?!0:',
        'const p=a.filter(E=>(String(ue)==="country__other"||ue===Nn||ot(kn()??"")===ot("Autres")||ot(((Ie.options[Ie.selectedIndex]?.textContent)??""))===ot("Autres"))&&!Ze(E.id)?!0:Ze(E.id)?Yr[G]?m(E):!0:'
    ],
    [
        'const p=a.filter(E=>(String(ue)==="country__other"||ue===Nn||ot(kn()??"")===ot("Autres")||ot(((Ie.options[Ie.selectedIndex]?.textContent)??""))===ot("Autres"))&&!Ze(E.id)?!0:Ze(E.id)?Yr[G]?m(E):!0:',
        'const p=a.filter(E=>(String(ue)==="country__other"||ue===Nn||ot(kn()??"")===ot("Autres")||ot(((Ie.options[Ie.selectedIndex]?.textContent)??""))===ot("Autres"))&&!Ze(E.id)?!0:Ze(E.id)?Yr[G]?tG(E.id).size===0?!1:G==="live"&&/(?:hevc|h[ .]?265|x265)/i.test(E.name)?m(E):!0:!0:'
    ],
    [
        'function ub(s){if(s.id===bo)return Bd;const e=jr(s.name);',
        'function ub(s){if(s.id===bo||jr(s.name)==="autres")return Bd;const e=jr(s.name);'
    ],
    [
        'function VEL_SEARCH_API_CATEGORIES(s){if(!_||_.mode!=="nodecast")return[];const e=String(_.nodecastXtreamSourceId??"").trim();return VEL_SEARCH_PACKAGES(s).map(t=>{const r=mp(String(t.id),e);return{sourceId:r.sourceId,categoryId:r.categoryId,packageId:t.id,packageName:t.name||""}}).filter(t=>t.sourceId&&t.categoryId&&t.packageId)}',
        'function VEL_SEARCH_API_CATEGORIES(s){if(!_||_.mode!=="nodecast")return[];const e=String(_.nodecastXtreamSourceId??"").trim(),t=VEL_SEARCH_PACKAGES(s),r=new Set(t.map(o=>o.id)),n=new Set(t.map(o=>Jn(o.name)).filter(Boolean)),i=new Map;for(const o of[...t,...s.packages]){const l=mp(String(o.id),e);if(!l.sourceId||!l.categoryId||!o.id)continue;const c=`${l.sourceId}::${l.categoryId}`,u=r.has(o.id)||n.has(Jn(o.name)),d={sourceId:l.sourceId,categoryId:l.categoryId,packageId:o.id,packageName:o.name||"",priority:u};(!i.has(c)||u)&&i.set(c,d)}return[...i.values()]}'
    ],
    [
        'function VEL_SEARCH_API_CATEGORIES(s){if(!_||_.mode!=="nodecast")return[];const e=String(_.nodecastXtreamSourceId??"").trim(),t=VEL_SEARCH_PACKAGES(s),r=new Set(t.map(o=>o.id)),n=new Set(t.map(o=>Jn(o.name)).filter(Boolean)),i=new Map;for(const o of[...t,...s.packages]){const l=mp(String(o.id),e);if(!l.sourceId||!l.categoryId||!o.id)continue;const c=`${l.sourceId}::${l.categoryId}`,u=r.has(o.id)||n.has(Jn(o.name)),d={sourceId:l.sourceId,categoryId:l.categoryId,packageId:o.id,packageName:o.name||"",priority:u};(!i.has(c)||u)&&i.set(c,d)}return[...i.values()]}',
        'function VEL_SEARCH_API_CATEGORIES(s){if(!_||_.mode!=="nodecast")return[];const e=String(_.nodecastXtreamSourceId??"").trim(),t=Ey(),r=new Set(t.map(o=>o.id)),n=new Set(t.map(o=>Jn(o.name)).filter(Boolean)),i=new Map;for(const o of[...t,...s.packages,...h2(pr)]){const l=mp(String(o.id),e);if(!l.sourceId||!l.categoryId||!o.id)continue;const c=`${l.sourceId}::${l.categoryId}`,u=r.has(o.id)||n.has(Jn(o.name)),d={sourceId:l.sourceId,categoryId:l.categoryId,packageId:o.id,packageName:o.name||"",priority:u};(!i.has(c)||u)&&i.set(c,d)}return[...i.values()]}'
    ],
    [
        'u.push({id:v,type:i==="live"?"channel":i,label:f.name||"",packageName:f.packageName||"",countryName:n,thumbUrl:ph(f.streamIcon||"",_.base)||""})}return{countryId:r,countryName:n,source:c.source||"provider-api",debug:{activeTab:G,apiResults:u.length},results:u}}',
        'u.push({id:v,type:i==="live"?"channel":i,label:f.name||"",packageName:f.packageName||"",countryName:f.priority===!0?n:"Autres",thumbUrl:ph(f.streamIcon||"",_.base)||"",preferred:f.priority===!0})}return u.sort((f,m)=>Number(m.preferred)-Number(f.preferred)||f.label.localeCompare(m.label,"fr")),{countryId:r,countryName:n,source:c.source||"provider-api",debug:{activeTab:G,apiResults:u.length},results:u}}'
    ],
    [
        'const c=await l.json(),u=[];VEL_SEARCH_RESULTS.clear();for(const f of c.results??[]){const m=String(f.itemId??""),g=/^\\d+$/.test(m)?Number(m):m,',
        'const c=await l.json(),u=[],d=gw();VEL_SEARCH_RESULTS.clear();for(const f of c.results??[]){const m=String(f.itemId??""),w=f.priority===!0||d.has(Number(m))||d.has(m),g=/^\\d+$/.test(m)?Number(m):m,'
    ],
    [
        'const c=await l.json(),u=[],d=gw();VEL_SEARCH_RESULTS.clear();for(const f of c.results??[]){const m=String(f.itemId??""),w=f.priority===!0||d.has(Number(m))||d.has(m),g=/^\\d+$/.test(m)?Number(m):m,p={stream_id:g,series_id:i==="series"?g:void 0,name:f.name||"",category_id:f.packageId,category_ids:[f.packageId],',
        'const c=await l.json(),u=[],d=gw();VEL_SEARCH_RESULTS.clear();for(const f of c.results??[]){const m=String(f.itemId??""),x=d.get(Number(m))??d.get(m),w=f.priority===!0||x!=null,g=/^\\d+$/.test(m)?Number(m):m,A=x?String(x):f.packageId,p={stream_id:g,series_id:i==="series"?g:void 0,name:f.name||"",category_id:A,category_ids:[A],'
    ],
    [
        'VEL_SEARCH_RESULTS.set(v,{kind:y,packageId:f.packageId,item:p})',
        'VEL_SEARCH_RESULTS.set(v,{kind:y,packageId:A,item:p})'
    ],
    [
        'if(e.kind==="live"){G="live",await hl(e.packageId,{skipResetScroll:!0}),window.setTimeout(()=>{try{Rg(e.item)}catch{}},180);return}',
        'if(e.kind==="live"){G="live",await hl(e.packageId,{skipResetScroll:!0});let s=0;const n=()=>{if(!_||Z!=="content"||Q!==e.packageId||G!=="live")return;const i=Dh(e.packageId).find(a=>String(a.stream_id)===String(e.item.stream_id));if(i){try{Rg(i)}catch{}return}s++<60&&window.setTimeout(n,250)};n();return}'
    ],
    [
        'countryName:f.priority===!0?n:"Autres",thumbUrl:ph(f.streamIcon||"",_.base)||"",preferred:f.priority===!0',
        'countryName:w?n:"Autres",thumbUrl:ph(f.streamIcon||"",_.base)||"",preferred:w'
    ],
    [
        'function __velLoadLivePackageLogo(){__velLiveLogoLoad||(__velLiveLogoLoad=__velWarmLiveLogos().catch(e=>console.warn("[live-package-logo]",e)))}',
        'function __velLoadLivePackageLogo(){return __velLiveLogoLoad||(__velLiveLogoLoad=__velWarmLiveLogos().catch(e=>console.warn("[live-package-logo]",e)))}'
    ],
    [
        'async function sG(s){var a,o;if(!_||_.mode!=="nodecast"||G!=="live"||!Ze(s))return;const e=tG(s);if(e.size===0||Ph(s).length>0)return;const t=(a=_.nodecastXtreamSourceId)==null?void 0:a.trim();if(!t)return;const r=(o=_.nodecastXtreamSourceIds)!=null&&o.length?_.nodecastXtreamSourceIds:[t],n=new Map;for(const l of r){const c=await xp(_.base,l,_.nodecastAuthHeaders);Tn(n,c)}if(!_||G!=="live")return;const i=new Map;for(const l of n.values())for(const c of l)e.has(String(c.stream_id))&&!i.has(c.stream_id)&&i.set(c.stream_id,c);i.size>0&&(_.streamsByCatAll.set(s,[...i.values()]),yr())}',
        'async function sG(s){if(!_||_.mode!=="nodecast"||G!=="live"||!Ze(s))return;const e=tG(s);if(e.size===0||Dh(s).length>0)return;await __velWarmLiveLogos();if(!_||G!=="live")return;const t=new Map;for(const r of _.streamsByCatAll.values())for(const n of r)e.has(String(n.stream_id))&&!t.has(n.stream_id)&&t.set(n.stream_id,n);t.size>0&&(_.streamsByCatAll.set(s,[...t.values()]),yr())}'
    ],
    [
        'async function sG(s){if(!_||_.mode!=="nodecast"||G!=="live"||!Ze(s))return;const e=tG(s);if(e.size===0||Dh(s).length>0)return;await __velLoadLivePackageLogo();if(!_||G!=="live")return;const t=new Map;for(const r of _.streamsByCatAll.values())for(const n of r)e.has(String(n.stream_id))&&!t.has(n.stream_id)&&t.set(n.stream_id,n);t.size>0&&(_.streamsByCatAll.set(s,[...t.values()]),yr())}',
        'async function sG(s){if(!_||_.mode!=="nodecast"||G!=="live"||!Ze(s))return;const e=tG(s);if(e.size===0||Dh(s).length>0)return;await __velWarmLiveLogos();if(!_||G!=="live")return;const t=new Map;for(const r of _.streamsByCatAll.values())for(const n of r)e.has(String(n.stream_id))&&!t.has(n.stream_id)&&t.set(n.stream_id,n);t.size>0&&(_.streamsByCatAll.set(s,[...t.values()]),yr())}'
    ],
    [
        'function tG(s){const e=new Set;for(const t of vy())for(const[r,n]of t.entries())n===s&&e.add(String(r));return e}',
        'function tG(s){const e=new Set;for(const t of En.values())for(const[r,n]of t.entries())n===s&&e.add(String(r));for(const[t,r]of Ll.entries())t.endsWith(`::${s}`)&&r.forEach(n=>e.add(String(n)));return e}'
    ],
    [
        'function tG(s){const e=new Set;for(const t of En.values())for(const[r,n]of t.entries())n===s&&e.add(String(r));return e}',
        'function tG(s){const e=new Set;for(const t of En.values())for(const[r,n]of t.entries())n===s&&e.add(String(r));for(const[t,r]of Ll.entries())t.endsWith(`::${s}`)&&r.forEach(n=>e.add(String(n)));return e}'
    ],
    [
        'const n=r==="live"&&Ze(s)&&pw(s)&&Ph(s).length===0,i=r==="live"&&_y(s),a=n||i,',
        'const n=r==="live"&&Ze(s)&&Dh(s).length===0,i=r==="live"&&_y(s),a=n||i,'
    ]
];

const pagedCurationLoader = 'async function HF(s){const e=[],t=1e3;for(let r=0;;r+=t){const{data:n,error:i}=await s.from("admin_stream_curations").select("stream_id, country_id, target_package_id").range(r,r+t-1);if(i)throw i;const a=n??[];if(e.push(...a),a.length<t)break}return GF(e)}';
const compactCurationLoader = 'async function HF(s){try{const e=await fetch("/api/velora-db/admin/stream-curation-map",{cache:"no-store"});if(!e.ok)throw new Error(`HTTP ${e.status}`);const t=await e.json(),r=Array.isArray(t.countries)?t.countries:[],n=Array.isArray(t.packages)?t.packages:[],i=new Map;for(const a of Array.isArray(t.rows)?t.rows:[]){const o=r[a[0]],l=Number(a[1]),c=n[a[2]];if(!o||!Number.isFinite(l)||!c)continue;let u=i.get(o);u||(u=new Map,i.set(o,u)),u.set(l,c)}return i}catch{const{data:e,error:t}=await s.from("admin_stream_curations").select("stream_id, country_id, target_package_id").range(0,99999);if(t)throw t;return GF(e??[])}}';

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
if (source.includes(pagedCurationLoader)) {
    source = source.replaceAll(pagedCurationLoader, compactCurationLoader);
    changed = true;
}

const legacyLiveLogoLoader = 'const __velLiveLogoLoads=new Set;function __velLoadLivePackageLogo(s){if(__velLiveLogoLoads.has(s))return;__velLiveLogoLoads.add(s),sG(s).then(()=>{_&&Z==="packages"&&Nt()}).catch(e=>console.warn("[live-package-logo]",s,e))}';
const resettingSharedLiveLogoLoader = 'let __velLiveLogoLoad=null;function __velLoadLivePackageLogo(){__velLiveLogoLoad||(__velLiveLogoLoad=BG("live").catch(e=>console.warn("[live-package-logo]",e)).finally(()=>{__velLiveLogoLoad=null}))}';
const sharedLiveLogoLoader = 'let __velLiveLogoLoad=null;function __velLoadLivePackageLogo(){__velLiveLogoLoad||(__velLiveLogoLoad=BG("live").catch(e=>console.warn("[live-package-logo]",e)))}';
const primaryOnlyLiveLogoLoader = 'let __velLiveLogoLoad=null;async function __velWarmLiveLogos(){if(!_||_.mode!=="nodecast")return;const s=(_.nodecastXtreamSourceIds??[]).map(e=>e.trim()).filter(Boolean),e=s.length>1?"all":s[0]??_.nodecastXtreamSourceId;if(!e)return;const t=await xp(_.base,e,_.nodecastAuthHeaders);if(!_||G!=="live")return;Tn(_.streamsByCatAll,t),FG(_.liveLoadedCategoryIds,t),Pe=Qt(_.liveCategories,_.streamsByCatAll,{includeEmptyPackages:!1}),yr(),Z==="packages"&&Nt()}function __velLoadLivePackageLogo(){__velLiveLogoLoad||(__velLiveLogoLoad=__velWarmLiveLogos().catch(e=>console.warn("[live-package-logo]",e)))}';
const completeLiveLogoLoader = 'let __velLiveLogoLoad=null;async function __velWarmLiveLogos(){if(!_||_.mode!=="nodecast")return;let s=[];try{const e=await Ke(`${_.base}/api/sources/catalog`,{headers:_.nodecastAuthHeaders,timeoutMs:8e3});s=Cs(e).filter(t=>t&&t.type==="xtream"&&t.enabled!==0&&t.enabled!==!1).map(t=>String(t.id).trim()).filter(Boolean)}catch{}s.length||(s=(_.nodecastXtreamSourceIds??[]).map(e=>e.trim()).filter(Boolean));if(!s.length&&_.nodecastXtreamSourceId)s=[_.nodecastXtreamSourceId];const e=await Promise.all(s.map(t=>xp(_.base,t,_.nodecastAuthHeaders).catch(()=>new Map))),t=new Map;for(const r of e)Tn(t,r);if(!_||G!=="live")return;Tn(_.streamsByCatAll,t),FG(_.liveLoadedCategoryIds,t),Pe=Qt(_.liveCategories,_.streamsByCatAll,{includeEmptyPackages:!1}),yr(),Z==="packages"&&Nt()}function __velLoadLivePackageLogo(){return __velLiveLogoLoad||(__velLiveLogoLoad=__velWarmLiveLogos().catch(e=>console.warn("[live-package-logo]",e)))}';
if (source.includes(primaryOnlyLiveLogoLoader)) {
    source = source.replace(primaryOnlyLiveLogoLoader, completeLiveLogoLoader);
    changed = true;
}
if (source.includes(sharedLiveLogoLoader)) {
    source = source.replace(sharedLiveLogoLoader, completeLiveLogoLoader);
    changed = true;
}
while (source.includes(completeLiveLogoLoader + completeLiveLogoLoader)) {
    source = source.replace(completeLiveLogoLoader + completeLiveLogoLoader, completeLiveLogoLoader);
    changed = true;
}
if (source.includes(resettingSharedLiveLogoLoader)) {
    source = source.replace(resettingSharedLiveLogoLoader, sharedLiveLogoLoader);
    changed = true;
}
if (source.includes(legacyLiveLogoLoader)) {
    source = source.replace(legacyLiveLogoLoader, sharedLiveLogoLoader);
    changed = true;
}
while (source.includes(sharedLiveLogoLoader + sharedLiveLogoLoader)) {
    source = source.replace(sharedLiveLogoLoader + sharedLiveLogoLoader, sharedLiveLogoLoader);
    changed = true;
}
const liveLogoLoaderStart = source.indexOf('let __velLiveLogoLoad=null;async function __velWarmLiveLogos');
const liveLogoLoaderEnd = liveLogoLoaderStart < 0 ? -1 : source.indexOf('function Nt(){', liveLogoLoaderStart);
if (liveLogoLoaderStart >= 0 && liveLogoLoaderEnd > liveLogoLoaderStart) {
    const normalized = source.slice(0, liveLogoLoaderStart) + completeLiveLogoLoader + source.slice(liveLogoLoaderEnd);
    if (normalized !== source) {
        source = normalized;
        changed = true;
    }
}

const manualTabMatcher = 'function __velManualPackageMatchesTab(s){const e=Jn(s.name);if(e&&wc().packages.some(t=>Jn(t.name)===e))return!0;if(!_||!Ze(s.id))return!1;const t=tG(s.id),r=G==="movies"?_.vodStreamsByCat:G==="series"?_.seriesStreamsByCat:_.streamsByCatAll;for(const n of r.values())for(const i of n)if(t.has(String(i.stream_id??i.series_id??i.item_id??i.id)))return!0;return!1}';
const legacyOrderedManualTabMatcher = 'function __velManualPackageMatchesTab(s){const e=G==="movies"||G==="series"?G:"live",t=["live","movies","series"].filter(r=>(mG(r)||[]).includes(s.id));if(t.length)return t.includes(e);const r=Jn(s.name);if(r&&wc().packages.some(n=>Jn(n.name)===r))return!0;if(!_||!Ze(s.id))return!1;const n=tG(s.id),i=G==="movies"?_.vodStreamsByCat:G==="series"?_.seriesStreamsByCat:_.streamsByCatAll;for(const a of i.values())for(const o of a)if(n.has(String(o.stream_id??o.series_id??o.item_id??o.id)))return!0;return!1}';
const orderedManualTabMatcher = 'function __velManualPackageMatchesTab(s){const e=G==="movies"||G==="series"?G:"live",t=["live","movies","series"].filter(r=>(mG(r)||[]).includes(s.id));if(t.length)return t.includes(e);const r=Jn(s.name);return!!(r&&wc().packages.some(n=>Jn(n.name)===r))}';
if (source.includes(legacyOrderedManualTabMatcher)) {
    source = source.replaceAll(legacyOrderedManualTabMatcher, orderedManualTabMatcher);
    changed = true;
}
if (source.includes(manualTabMatcher)) {
    source = source.replaceAll(manualTabMatcher, orderedManualTabMatcher);
    changed = true;
}
while (source.includes(orderedManualTabMatcher + orderedManualTabMatcher)) {
    source = source.replace(orderedManualTabMatcher + orderedManualTabMatcher, orderedManualTabMatcher);
    changed = true;
}
while (source.includes(manualTabMatcher + manualTabMatcher)) {
    source = source.replace(manualTabMatcher + manualTabMatcher, manualTabMatcher);
    changed = true;
}

const manualCountryPackagesStart = source.indexOf('function __velManualPackageMatchesTab');
const manualCountryPackagesEnd = manualCountryPackagesStart >= 0 ? source.indexOf('function dG(', manualCountryPackagesStart) : -1;
if (manualCountryPackagesStart >= 0 && manualCountryPackagesEnd > manualCountryPackagesStart) {
    const currentManualCountryPackages = source.slice(manualCountryPackagesStart, manualCountryPackagesEnd);
    const automaticOthersPackages = 'function __velUnassignedPackages(){const s=new Map;for(const e of[...wc().packages,...h2(pr)])s.set(e.id,e);const e=[...s.values()],t=new Set;for(const[r,n]of io.entries())if(r.endsWith(`::${G}`))for(const i of n)t.add(i);for(const r of es)if(!t.has(r.id)){const n=Jn(r.name);n&&e.some(i=>Jn(i.name)===n)&&t.add(r.id)}const r=new Set;for(const n of En.values())for(const[i,a]of n.entries())t.has(a)&&r.add(String(i));const n=G==="movies"?_.vodStreamsByCat:G==="series"?_.seriesStreamsByCat:_.streamsByCatAll;return e.filter(i=>!(n.get(String(i.id))??[]).some(a=>r.has(String(a.stream_id??a.series_id??a.item_id??a.id))))}function uG(){const s=Sr(),e=kn(),t=e?ot(e):"",r=new Map;for(const n of es){if(!__velManualPackageMatchesTab(n))continue;if(s&&n.country_id===s){r.set(n.id,n);continue}if(!t)continue;const i=et.find(a=>a.id===n.country_id);i&&ot(i.name)===t&&r.set(n.id,n)}const n=ot(((Ie.options[Ie.selectedIndex]?.textContent)??""))===ot("Autres");if(ue===Nn||t===ot("Autres")||n)for(const i of __velUnassignedPackages())r.set(i.id,i);return[...r.values()]}';
    const completeManualCountryPackages = orderedManualTabMatcher + automaticOthersPackages;
    if (currentManualCountryPackages !== completeManualCountryPackages) {
        source = source.slice(0, manualCountryPackagesStart) + completeManualCountryPackages + source.slice(manualCountryPackagesEnd);
        changed = true;
    }
}

const oldManualContentResolver = 'if((G==="movies"||G==="series")&&Ze(s)){const e=tG(s),t=G==="movies"?_.vodStreamsByCat:_.seriesStreamsByCat,r=[];for(const n of t.values())for(const i of n)e.has(String(i.stream_id??i.series_id??i.item_id??i.id))&&r.push(i);return r.sort((n,i)=>Re(n.name).localeCompare(Re(i.name),"fr"))}';
source = source.replaceAll(oldManualContentResolver, '');
const manualContentResolver = 'if(Ze(s)){const e=tG(s),t=G==="movies"?_.vodStreamsByCat:G==="series"?_.seriesStreamsByCat:_.streamsByCatAll,r=[],n=new Set;for(const i of t.values())for(const a of i){const o=String(a.stream_id??a.series_id??a.item_id??a.id);e.has(o)&&!n.has(o)&&(n.add(o),r.push(a))}return r.sort((i,a)=>Re(i.name).localeCompare(Re(a.name),"fr"))}';
while (source.includes(manualContentResolver + manualContentResolver)) {
    source = source.replace(manualContentResolver + manualContentResolver, manualContentResolver);
    changed = true;
}
const curationRefreshListener = 'window.addEventListener("velora-admin-curation-changed",()=>{xt().then(()=>{_&&Nt()}).catch(s=>console.warn("[manual-curation-refresh]",s))});';
while (source.includes(curationRefreshListener + curationRefreshListener)) {
    source = source.replace(curationRefreshListener + curationRefreshListener, curationRefreshListener);
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

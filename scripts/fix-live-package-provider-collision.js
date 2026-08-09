const fs = require("node:fs");
const path = require("node:path");

const bundlePath = path.resolve(__dirname, "../public/assets/main-JkackQV-.js");
let source = fs.readFileSync(bundlePath, "utf8");

const helper = 'function __velExactLivePackageStreams(s){if(!_||G!=="live"||!Ze(s))return null;const e=es.find(p=>p.id===s);if(!e)return null;const t=dE(e.name),r=_.liveCategories.filter(p=>dE(String(p.category_name??""))===t),n=tG(s),i=p=>{const y=String(p.nodecast_source_id??p.source_id??""),v=String(p.raw_category_id??mp(String(p.category_id??""),y).categoryId??""),S=[p.category_id,p.global_category_id,p.raw_category_id,y&&p.global_category_id?N_(y,String(p.global_category_id)):"",y&&p.raw_category_id?N_(y,String(p.raw_category_id)):""].map(E=>String(E??"")).filter(Boolean);for(const E of S){const T=_.streamsByCatAll.get(E);if(T!=null&&T.length)return[...T]}const E=[];for(const T of _.streamsByCatAll.values())for(const L of T){const w=String(L.nodecast_source_id??L.source_id??""),I=String(L.raw_category_id??mp(String(L.category_id??""),w).categoryId??"");w===y&&I===v&&E.push(L)}return E},a=p=>[...new Map(p.map(y=>[`${String(y.nodecast_source_id??y.source_id??"")}:${String(y.raw_stream_id??y.stream_id??y.item_id??y.id)}`,y])).values()],o=r.map(p=>{const y=a(i(p)),v=y.reduce((S,E)=>S+(n.has(String(E.raw_stream_id??E.stream_id??E.item_id??E.id))?1:0),0);return{streams:y,score:v}}).filter(p=>p.streams.length);if(!o.length)return null;o.sort((p,y)=>y.score-p.score||y.streams.length-p.streams.length);if(o.length>1&&o[0].score===o[1].score)return null;return o[0].streams.sort((p,y)=>Re(p.name).localeCompare(Re(y.name),"fr"))}';

const installedHelperStart = source.indexOf('function __velExactLivePackageStreams(');
if (installedHelperStart >= 0) {
  const installedHelperEnd = source.indexOf('function Ph(', installedHelperStart);
  if (installedHelperEnd < 0) throw new Error("Could not find Ph after installed provider helper");
  source = source.slice(0, installedHelperStart) + helper + source.slice(installedHelperEnd);
}

const replacements = [
  {
    before: 'function Ph(s){const e=`${hw()}|${Co()?"fr":"x"}`;(xa==null?void 0:xa.key)!==e&&(xa={key:e,byPackageId:new Map});const t=xa.byPackageId.get(s);if(t)return t;const r=vw(s,fw(),Co(),gw());return xa.byPackageId.set(s,r),r}',
    after: `${helper}function Ph(s){const e=\`${'${hw()}'}|${'${Co()?"fr":"x"}'}\`;(xa==null?void 0:xa.key)!==e&&(xa={key:e,byPackageId:new Map});const t=xa.byPackageId.get(s);if(t)return t;const r=__velExactLivePackageStreams(s)??vw(s,fw(),Co(),gw());return xa.byPackageId.set(s,r),r}`
  },
  {
    before: 'function Dh(s){if(!_)return[];if(Ze(s)){const e=tG(s),',
    after: 'function Dh(s){if(!_)return[];if(Ze(s)){const a=__velExactLivePackageStreams(s);if(a)return eg(a,Ud(s));const e=tG(s),'
  }
];

for (const replacement of replacements) {
  if (source.includes(replacement.after)) continue;
  if (!source.includes(replacement.before)) {
    throw new Error(`Could not find expected bundle fragment: ${replacement.before}`);
  }
  source = source.replace(replacement.before, replacement.after);
}

fs.writeFileSync(bundlePath, source);
console.log("Legacy live packages now resolve channels from the matching Xtream provider category.");

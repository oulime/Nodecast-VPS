const fs = require("node:fs");
const path = require("node:path");

const bundlePath = path.resolve(__dirname, "../public/assets/main-JkackQV-.js");
const source = fs.readFileSync(bundlePath, "utf8");
const before = 'function GG(){ue=Ie.value||null;try{ue&&sessionStorage.setItem(Wp,ue)}catch{}_&&(G="live",Fo(),(async()=>(await Pw(),_&&Z==="packages"&&G==="live"&&($o(),oa()),Dw()))(),bn())}';
const after = 'function GG(){ue=Ie.value||null;try{ue&&sessionStorage.setItem(Wp,ue)}catch{}if(!_)return;const s=G;s==="live"?(Fo(),(async()=>(await Pw(),_&&Z==="packages"&&G==="live"&&($o(),oa()),Dw()))(),bn()):Ow(s)}';

if (!source.includes(before)) {
  if (source.includes(after)) {
    console.log("Country-change tab preservation is already applied.");
    process.exit(0);
  }
  throw new Error("Could not find the expected country-change handler.");
}

fs.writeFileSync(bundlePath, source.replace(before, after));
console.log("Country changes now preserve the active content tab.");

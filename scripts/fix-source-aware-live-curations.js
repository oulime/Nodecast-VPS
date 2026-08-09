const fs = require("node:fs");
const path = require("node:path");

const bundlePath = path.resolve(__dirname, "../public/assets/main-JkackQV-.js");
let source = fs.readFileSync(bundlePath, "utf8");

const replacements = [
  {
    before: 'const n=String(t.kind??""),i=String(t.source_id??""),a=(n==="vod"||n==="series")&&i?`${n}:${i}:${r}`:r;',
    after: 'const n=String(t.kind??""),i=String(t.source_id??""),a=n==="live"&&i?$v(`${i}:${r}`):(n==="vod"||n==="series")&&i?`${n}:${i}:${r}`:r;'
  },
  {
    before: 'const f=(u==="vod"||u==="series")&&d?`${u}:${d}:${l}`:l;',
    after: 'const f=u==="live"&&d?$v(`${d}:${l}`):(u==="vod"||u==="series")&&d?`${u}:${d}:${l}`:l;'
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
console.log("Live curation keys now include their Xtream provider identity.");

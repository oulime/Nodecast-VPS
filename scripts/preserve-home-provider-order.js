const fs = require('fs');
const path = require('path');

const assetPath = path.join(__dirname, '..', 'public', 'assets', 'velora-home-sections.js');
let source = fs.readFileSync(assetPath, 'utf8');

const alphabeticalSorts = [
    '.sort(function(a,b){return a.name.localeCompare(b.name,"fr")})',
    '.sort(function(a,b){return String(a.name||"").localeCompare(String(b.name||""),"fr")})'
];

let changed = false;
for (const alphabeticalSort of alphabeticalSorts) {
    if (!source.includes(alphabeticalSort)) continue;
    source = source.replaceAll(alphabeticalSort, '');
    changed = true;
}

if (changed) {
    fs.writeFileSync(assetPath, source);
    console.log('Accueil content now preserves provider order in', assetPath);
} else {
    console.log('Accueil content already preserves provider order.');
}

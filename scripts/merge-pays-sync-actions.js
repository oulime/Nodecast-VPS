const fs = require('fs');
const path = require('path');

const assetPath = path.join(__dirname, '..', 'public', 'assets', 'manual-pays.js');
let source = fs.readFileSync(assetPath, 'utf8');
const start = source.indexOf('  async function refreshAndSync()');
const end = source.indexOf('  document.addEventListener("click"', start);

if (start < 0 || end < 0) {
    throw new Error('Could not locate the Pays synchronization functions.');
}

const combined = `  async function syncAndRefreshAll(){const button=$("mp-sync-all");if(button?.disabled)return;button.disabled=true;pageLoading(true,"Synchronisation et actualisation");try{status("Synchronisation du contenu des fournisseurs Xtream...");const catalog=await api("/sources/sync-catalog");status(\`${'${catalog.sources?.length||0}'} fournisseur(s) synchronisé(s). Mise à jour de tous les packages...\`);const packages=await req(\`${'${SURL}'}/admin/sync-packages\`,{method:"POST",headers:{apikey:KEY,Authorization:\`Bearer ${'${KEY}'}\`,"Content-Type":"application/json"},body:"{}"});await init(true);window.dispatchEvent(new CustomEvent("velora-admin-curation-changed"));window.dispatchEvent(new CustomEvent("velora-home-cache-invalidated"));status(\`${'${catalog.sources?.length||0}'} fournisseur(s), ${'${packages.packages||0}'} package(s) et ${'${packages.items||0}'} élément(s) synchronisé(s).\`)}catch(e){status(\`Synchronisation impossible : ${'${e.message}'}\`,true)}finally{pageLoading(false);button.disabled=false}}\n`;

source = source.slice(0, start) + combined + source.slice(end);
source = source.replace('    if(e.target.closest("#mp-refresh"))refreshAndSync()\n', '');
source = source.replace('    if(e.target.closest("#mp-sync-all"))syncAllPackages()', '    if(e.target.closest("#mp-sync-all"))syncAndRefreshAll()');
fs.writeFileSync(assetPath, source);
console.log('Merged the Pays synchronization actions in', assetPath);

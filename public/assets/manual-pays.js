(() => {
  "use strict";
  const SURL="https://vmobanxusorocltxygjo.supabase.co", KEY="sb_publishable_vjz4gbyS9QlZi8rB7qMsLw_ATofLImp";
  const NON_COUNTRIES=new Set(["adult","adulte"]);
  const st={sources:[],source:null,kind:"live",packages:[],loadedKinds:new Set(),loadingKinds:new Map(),allPackages:{live:[],vod:[],series:[]},countries:[],assigned:new Map(),packageStreams:new Map(),packageOrders:new Map(),packageKinds:new Map(),hiddenCountries:new Set(),activeCountry:null,pendingDeleteCountry:null,loaded:false,loadingCount:0}, $=id=>document.getElementById(id);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  async function req(url,opt={}){const r=await fetch(url,opt),b=await r.json().catch(()=>null);if(!r.ok)throw Error(b?.message||b?.error||`HTTP ${r.status}`);return b}
  function api(path){const t=localStorage.getItem("authToken");return req(`/api${path}`,{cache:"no-store",headers:t?{Authorization:`Bearer ${t}`}:{}})}
  function sb(table,q="",opt={}){return req(`${SURL}/rest/v1/${table}${q}`,{...opt,headers:{apikey:KEY,Authorization:`Bearer ${KEY}`,"Content-Type":"application/json",...opt.headers}})}
  function status(msg,bad=false){const n=$("countries-admin-status");if(n){n.textContent=msg;n.classList.toggle("error",bad)}}
  function pageLoading(active,label="Chargement"){st.loadingCount=Math.max(0,st.loadingCount+(active?1:-1));const loader=$("mp-heading-loader"),heading=loader?.closest("h2"),busy=st.loadingCount>0;if(loader){loader.classList.toggle("is-active",busy);loader.setAttribute("aria-hidden",busy?"false":"true");loader.title=busy?label:""}heading?.setAttribute("aria-busy",busy?"true":"false")}
  const streamId=x=>String(x.stream_id??x.series_id??x.item_id??x.id??"");
  const escapeRegex=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  function textMatches(value,term,whole){const text=String(value??"").toLowerCase(),needle=String(term??"").trim().toLowerCase();if(!needle)return true;if(!whole)return text.includes(needle);return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(needle)}(?=$|[^\\p{L}\\p{N}])`,"u").test(text)}
  function drawSources(){const all=`<button type="button" class="manual-pays__stream manual-pays__stream--all${String(st.source?.id)==="all"?" is-active":""}" data-source="all"><span><strong>Tous les streams</strong><br><small>${st.sources.length} stream(s) actif(s)</small></span><span>›</span></button>`;$("mp-stream-list").innerHTML=st.sources.length?all+st.sources.map(x=>`<button type="button" class="manual-pays__stream${String(st.source?.id)===String(x.id)?" is-active":""}" data-source="${esc(x.id)}"><span><strong>${esc(x.name||`Stream ${x.id}`)}</strong><br><small>${esc(x.type)}</small></span><span>›</span></button>`).join(""):'<div class="manual-pays__empty">Aucun stream Xtream actif.</div>'}
  function packageCountryNames(p){const names=[],ids=new Set(p.items.map(streamId)),samePackage=x=>x.name.trim().toLowerCase()===p.name.trim().toLowerCase()&&[...(st.packageStreams.get(x.id)||[])].some(id=>ids.has(id));for(const[countryId,packages]of st.assigned.entries())if(packages.some(samePackage)){const c=st.countries.find(x=>x.id===countryId);if(c)names.push(c.name)}return names.sort((a,b)=>a.localeCompare(b,"fr"))}
  function drawPackages(){const q=($("mp-package-filter")?.value||"").trim(),searchWhole=$("mp-package-filter-whole")?.checked!==false,excluded=($("mp-package-exclude")?.value||"").split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean),excludeWhole=$("mp-package-exclude-whole")?.checked!==false,rows=st.packages.filter(x=>(!q||textMatches(x.name,q,searchWhole))&&!excluded.some(term=>textMatches(x.name,term,excludeWhole))),filtered=q||excluded.length,bulk=rows.length>1?`<article class="manual-pays__package manual-pays__package--bulk" draggable="true" data-packages="${esc(JSON.stringify(rows.map(x=>x.key)))}"><strong>Glisser les ${rows.length} packages ${filtered?"filtrés":"affichés"}</strong><small>Déposez ce bloc sur un pays pour tout ajouter</small></article>`:"";$("mp-package-list").innerHTML=rows.length?bulk+rows.map(x=>{const assigned=packageCountryNames(x);return `<article class="manual-pays__package${assigned.length?" is-assigned":""}" draggable="true" data-package="${esc(x.key)}"><strong>${esc(x.name)}</strong><small>${x.items.length} élément(s) · ${x.label}${assigned.length?` · Ajouté à ${esc(assigned.join(", "))}`:""}</small></article>`}).join(""):`<div class="manual-pays__empty">${st.source?"Aucun package trouvé.":"Sélectionnez un stream."}</div>`}
  async function canonicalRows(){const all=[];for(let from=0;;from+=1000){const rows=await sb("canonical_countries","?select=match_key,display_name&order=display_name.asc",{headers:{Range:`${from}-${from+999}`}});all.push(...rows);if(rows.length<1000)break}return all}
  async function curationRows(){const all=[];for(let from=0;;from+=1000){const rows=await sb("admin_stream_curations","?select=stream_id,target_package_id",{headers:{Range:`${from}-${from+999}`}});all.push(...rows);if(rows.length<1000)break}return all}
  const uiTab=kind=>kind==="vod"?"movies":kind;
  function visiblePackages(countryId){const rows=st.assigned.get(countryId)||[],tab=uiTab(st.kind),names=new Set(st.allPackages[st.kind].map(x=>x.name.trim().toLowerCase()));return rows.filter(x=>{const marked=st.packageKinds.get(x.id);return marked?marked===tab:names.has(x.name.trim().toLowerCase())})}
  async function packageOrderRows(){return sb("admin_country_package_order","?select=country_id,ui_tab,package_order")}
  async function markPackageKind(countryId,packageId,kind=st.kind){const tab=uiTab(kind),key=`${countryId}::${tab}`,order=[...(st.packageOrders.get(key)||[])];if(!order.includes(packageId))order.push(packageId);await sb("admin_country_package_order","?on_conflict=country_id,ui_tab",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({country_id:countryId,ui_tab:tab,package_order:order,updated_at:new Date().toISOString()})});st.packageOrders.set(key,order);st.packageKinds.set(packageId,tab)}
  function drawCountries(){const q=($("mp-country-filter")?.value||"").trim().toLocaleLowerCase("fr"),rows=st.countries.filter(c=>!q||c.name.toLocaleLowerCase("fr").includes(q));$("mp-country-list").innerHTML=rows.length?rows.map(c=>{const p=visiblePackages(c.id),hidden=st.hiddenCountries.has(c.name.toLowerCase());return `<section class="manual-pays__country${hidden?" is-hidden-country":""}" data-country="${esc(c.id)}" tabindex="0" role="button"><div class="manual-pays__country-head"><strong>${esc(c.name)}</strong><div class="manual-pays__country-actions"><button class="manual-pays__visibility" type="button" data-toggle-country="${esc(c.id)}">${hidden?"Afficher":"Masquer"}</button><button class="manual-pays__delete" type="button" data-delete-country="${esc(c.id)}" aria-label="Supprimer ${esc(c.name)}">×</button></div></div><ul class="manual-pays__assigned">${p.length?p.slice(0,8).map(x=>`<li>• ${esc(x.name)}</li>`).join(""):'<li class="manual-pays__assigned-empty">Aucun package dans cet onglet</li>'}${p.length>8?`<li>+ ${p.length-8} autres</li>`:""}</ul></section>`}).join(""):`<div class="manual-pays__empty">${q?"Aucun pays trouvé.":"Créez votre premier pays."}</div>`}
  async function countries(){
    let admin=await sb("admin_countries","?select=id,name&order=name.asc"),canonical=await canonicalRows();
    st.hiddenCountries=new Set(canonical.filter(x=>String(x.match_key).startsWith("__hidden__:")).map(x=>String(x.display_name).trim().toLowerCase()));
    admin=admin.filter(x=>!NON_COUNTRIES.has(x.name.trim().toLowerCase()));const names=[...new Set(canonical.filter(x=>!String(x.match_key).startsWith("__hidden__:")).map(x=>String(x.display_name).trim()).filter(x=>x&&!NON_COUNTRIES.has(x.toLowerCase())))],known=new Set(admin.map(x=>x.name.toLowerCase())),missing=names.filter(x=>!known.has(x.toLowerCase()));
    for(let i=0;i<missing.length;i+=100)await sb("admin_countries","",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(missing.slice(i,i+100).map(name=>({name})))});
    if(missing.length)admin=await sb("admin_countries","?select=id,name&order=name.asc");
    st.countries=admin;const [p,curations,orders]=await Promise.all([sb("admin_packages","?select=id,country_id,name&order=name.asc"),curationRows(),packageOrderRows()]);st.assigned=new Map;st.packageStreams=new Map;st.packageOrders=new Map;st.packageKinds=new Map;for(const x of p){const a=st.assigned.get(x.country_id)||[];a.push(x);st.assigned.set(x.country_id,a)}for(const x of curations){const a=st.packageStreams.get(x.target_package_id)||new Set;a.add(String(x.stream_id));st.packageStreams.set(x.target_package_id,a)}for(const x of orders){const key=`${x.country_id}::${x.ui_tab}`,order=(Array.isArray(x.package_order)?x.package_order:[]).map(String);st.packageOrders.set(key,order);for(const id of order)st.packageKinds.set(id,String(x.ui_tab))}drawCountries();applyVisibility();if(st.activeCountry)drawDialog()
  }
  function applyVisibility(){document.querySelectorAll("#country-select option,#home-country-select option,.vel-home-country-picker__option").forEach(node=>{const name=(node.textContent||"").trim().toLowerCase(),hidden=st.hiddenCountries.has(name)||NON_COUNTRIES.has(name);node.hidden=hidden;node.style.display=hidden?"none":""})}
  async function loadVisibility(){try{const rows=await canonicalRows();st.hiddenCountries=new Set(rows.filter(x=>String(x.match_key).startsWith("__hidden__:")).map(x=>String(x.display_name).trim().toLowerCase()));applyVisibility()}catch(e){console.warn("[manual-pays] country visibility",e)}}
  async function toggleCountry(id){const c=st.countries.find(x=>x.id===id);if(!c)return;const hidden=st.hiddenCountries.has(c.name.toLowerCase());status(`${hidden?"Affichage":"Masquage"} de ${c.name}...`);if(hidden)await sb("canonical_countries",`?match_key=eq.${encodeURIComponent(`__hidden__:${c.name.toLowerCase()}`)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});else await sb("canonical_countries","",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({match_key:`__hidden__:${c.name.toLowerCase()}`,display_name:c.name,sort_order:999999})});await countries();status(`${c.name} est maintenant ${hidden?"visible":"masqué"} dans l'app.`)}
  function askDeleteCountry(id){const c=st.countries.find(x=>x.id===id);if(!c)return;st.pendingDeleteCountry=id;$("mp-delete-country-message").textContent=`Vous êtes sur le point de supprimer « ${c.name} ». `;$("mp-delete-country-dialog").showModal()}
  async function deleteCountry(id){const c=st.countries.find(x=>x.id===id);if(!c)return;const button=$("mp-delete-country-confirm");button.disabled=true;button.textContent="Suppression...";status(`Suppression de ${c.name}...`);try{const packages=st.assigned.get(id)||[];for(const p of packages)await sb("admin_stream_curations",`?target_package_id=eq.${encodeURIComponent(p.id)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});await sb("admin_packages",`?country_id=eq.${encodeURIComponent(id)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});await sb("admin_countries",`?id=eq.${encodeURIComponent(id)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});await sb("canonical_countries",`?display_name=eq.${encodeURIComponent(c.name)}&match_key=like.__*`,{method:"DELETE",headers:{Prefer:"return=minimal"}});if(st.activeCountry===id){st.activeCountry=null;$("mp-country-dialog")?.close()}st.pendingDeleteCountry=null;$("mp-delete-country-dialog").close();await countries();status(`${c.name} a été supprimé de l'app.`)}finally{button.disabled=false;button.textContent="Supprimer définitivement"}}
  function dialogStatus(msg,bad=false){const n=$("mp-dialog-status");if(n){n.textContent=msg;n.classList.toggle("error",bad)}}
  function drawDialog(){
    const c=st.countries.find(x=>x.id===st.activeCountry),list=$("mp-dialog-package-list"),select=$("mp-dialog-package-select");if(!c||!list||!select)return;
    $("mp-dialog-title").textContent=`${c.name} — ${st.kind==="live"?"Live":st.kind==="vod"?"Movies":"Series"}`;const rows=visiblePackages(c.id);
    list.innerHTML=rows.length?rows.map(x=>`<div class="manual-pays-dialog__row"><label class="manual-pays-dialog__select"><input type="checkbox" data-merge-package="${esc(x.id)}" aria-label="Sélectionner ${esc(x.name)}" /><span></span></label><strong>${esc(x.name)}</strong><button type="button" class="manual-pays-dialog__edit" data-edit-package="${esc(x.id)}">Modifier</button><button type="button" class="manual-pays-dialog__remove" data-remove-package="${esc(x.id)}">Supprimer</button></div>`).join(""):'<div class="manual-pays__empty">Aucun package dans ce pays.</div>';
    const existing=new Set(rows.map(x=>x.name.toLowerCase()));const options=st.packages.filter(x=>!existing.has(x.name.toLowerCase()));
    select.innerHTML=options.length?options.map(x=>`<option value="${esc(x.key)}">${esc(x.name)} — ${x.label}</option>`).join(""):'<option value="">Aucun autre package disponible</option>';
    $("mp-dialog-add").disabled=!options.length;updateMergeButton()
  }
  function updateMergeButton(){const count=document.querySelectorAll("#mp-dialog-package-list [data-merge-package]:checked").length,button=$("mp-dialog-merge"),label=$("mp-dialog-merge-count");if(button)button.disabled=count<2;if(label)label.textContent=count<2?"Sélectionnez au moins 2 packages":`${count} packages sélectionnés`}
  function openCountry(id){st.activeCountry=id;drawDialog();dialogStatus(`${visiblePackages(id).length} package(s) dans cet onglet.`);$("mp-country-dialog").showModal()}
  async function removePackage(id){
    const row=(st.assigned.get(st.activeCountry)||[]).find(x=>x.id===id);if(!row||!confirm(`Supprimer « ${row.name} » de ce pays ?`))return;
    dialogStatus("Suppression...");await sb("admin_stream_curations",`?target_package_id=eq.${encodeURIComponent(id)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});await sb("admin_packages",`?id=eq.${encodeURIComponent(id)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});await countries();dialogStatus(`« ${row.name} » a été supprimé.`)
  }
  async function editPackage(id){
    const row=(st.assigned.get(st.activeCountry)||[]).find(x=>x.id===id);if(!row)return;const name=prompt("Nouveau nom du package :",row.name)?.trim();if(!name||name===row.name)return;
    dialogStatus("Enregistrement...");await sb("admin_packages",`?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({name})});await countries();dialogStatus(`Package renommé « ${name} ».`)
  }
  async function packageStreamIds(id){const all=[];for(let from=0;;from+=1000){const rows=await sb("admin_stream_curations",`?select=stream_id&target_package_id=eq.${encodeURIComponent(id)}`,{headers:{Range:`${from}-${from+999}`}});all.push(...rows.map(x=>String(x.stream_id)));if(rows.length<1000)break}return all}
  async function mergePackages(){
    const ids=[...document.querySelectorAll("#mp-dialog-package-list [data-merge-package]:checked")].map(x=>x.dataset.mergePackage),rows=(st.assigned.get(st.activeCountry)||[]).filter(x=>ids.includes(x.id));if(rows.length<2)return updateMergeButton();
    const name=prompt("Nom du package fusionné :",rows[0].name)?.trim();if(!name)return;
    if(!confirm(`Fusionner ${rows.length} packages dans « ${name} » ?\n\nDans l'app, ils apparaîtront comme un seul package.`))return;
    const target=rows[0],sources=rows.slice(1),button=$("mp-dialog-merge");button.disabled=true;dialogStatus(`Fusion de ${rows.length} packages...`);
    try{
      const streamIds=[...new Set((await Promise.all(rows.map(x=>packageStreamIds(x.id)))).flat())],cur=streamIds.map(stream_id=>({stream_id,country_id:st.activeCountry,target_package_id:target.id}));
      for(let i=0;i<cur.length;i+=250)await sb("admin_stream_curations","?on_conflict=stream_id,country_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(cur.slice(i,i+250))});
      await sb("admin_packages",`?id=eq.${encodeURIComponent(target.id)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({name})});
      for(const source of sources){await sb("admin_stream_curations",`?target_package_id=eq.${encodeURIComponent(source.id)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});await sb("admin_packages",`?id=eq.${encodeURIComponent(source.id)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}})}
      await markPackageKind(st.activeCountry,target.id);
      await countries();drawPackages();window.dispatchEvent(new CustomEvent("velora-admin-curation-changed"));dialogStatus(`${rows.length} packages fusionnés dans « ${name} » (${streamIds.length} éléments).`)
    }finally{button.disabled=false;updateMergeButton()}
  }
  const catalogDefinitions={live:["Direct","live_categories","live_streams"],vod:["Movies","vod_categories","vod_streams"],series:["Series","series_categories","series"]};
  async function loadSourceCatalog(source,kind){
    const[label,cp,ip]=catalogDefinitions[kind],[cats,items]=await Promise.all([api(`/proxy/xtream/${source.id}/${cp}?includeHidden=true`).catch(()=>[]),api(`/proxy/xtream/${source.id}/${ip}?includeHidden=true`).catch(()=>[]) ]),byCategory=new Map;
    for(const item of items){const ids=Array.isArray(item.category_ids)&&item.category_ids.length?item.category_ids:[item.category_id];for(const raw of ids){const id=String(raw??"");if(!id)continue;const list=byCategory.get(id)||[];list.push(item);byCategory.set(id,list)}}
    return cats.map(c=>{const id=String(c.category_id??c.id??"");return{key:`${kind}:${source.id}:${id}`,sourceId:String(source.id),label,name:String(c.category_name??c.name??`Package ${id}`),items:byCategory.get(id)||[]}}).sort((a,b)=>a.name.localeCompare(b.name,"fr"))
  }
  async function loadKind(kind,force=false){
    if(st.loadedKinds.has(kind)&&!force)return;if(st.loadingKinds.has(kind))return st.loadingKinds.get(kind);
    const label=catalogDefinitions[kind][0];pageLoading(true,`Chargement ${label}`);const job=(async()=>{status(`Chargement ${label} de tous les streams...`);const groups=await Promise.all(st.sources.map(source=>loadSourceCatalog(source,kind)));st.allPackages[kind]=groups.flat().sort((a,b)=>a.name.localeCompare(b.name,"fr"));st.loadedKinds.add(kind);drawCountries();status(`${st.allPackages[kind].length} packages ${label} chargés depuis ${st.sources.length} stream(s).`)})().finally(()=>{st.loadingKinds.delete(kind);pageLoading(false)});
    st.loadingKinds.set(kind,job);return job
  }
  async function source(id){
    const all=String(id)==="all";st.source=all?{id:"all",name:"Tous les streams",type:"xtream"}:st.sources.find(x=>String(x.id)===String(id))||null;st.packages=[];drawSources();drawPackages();if(!st.source)return;
    const[label]=catalogDefinitions[st.kind];st.packages=all?[...st.allPackages[st.kind]]:st.allPackages[st.kind].filter(x=>x.sourceId===String(st.source.id));drawPackages();drawCountries();if(st.activeCountry&&$("mp-country-dialog")?.open)drawDialog();status(`${st.packages.length} package(s) ${label} dans ${st.source.name}.`)
  }
  async function assign(countryId,key,refresh=true){
    const c=st.countries.find(x=>x.id===countryId),p=st.packages.find(x=>x.key===key);if(!c||!p)return;status(`Affectation de « ${p.name} » à ${c.name}...`);
    let rows=await sb("admin_packages",`?select=id&country_id=eq.${encodeURIComponent(countryId)}&name=eq.${encodeURIComponent(p.name)}&limit=1`),target=rows[0]?.id;
    if(!target){rows=await sb("admin_packages","?select=id",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({country_id:countryId,name:p.name})});target=rows[0]?.id}
    if(!target)throw Error("Création du package cible impossible.");
    await markPackageKind(countryId,target);
    const cur=p.items.map(x=>({stream_id:streamId(x),country_id:countryId,target_package_id:target})).filter(x=>x.stream_id);
    for(let i=0;i<cur.length;i+=250)await sb("admin_stream_curations","?on_conflict=stream_id,country_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(cur.slice(i,i+250))});
    if(refresh){await countries();drawPackages()}status(`« ${p.name} » est visible dans ${c.name} (${cur.length} élément(s)).`);if(refresh)window.dispatchEvent(new CustomEvent("velora-admin-curation-changed"))
  }
  async function assignMany(countryId,keys){
    const c=st.countries.find(x=>x.id===countryId),unique=[...new Set(keys)].filter(key=>st.packages.some(x=>x.key===key));if(!c||!unique.length)return;
    status(`Ajout de ${unique.length} packages à ${c.name}...`);
    for(let i=0;i<unique.length;i++){status(`Ajout à ${c.name} : ${i+1}/${unique.length}...`);await assign(countryId,unique[i],false)}
    await countries();drawPackages();window.dispatchEvent(new CustomEvent("velora-admin-curation-changed"));status(`${unique.length} packages ont été ajoutés à ${c.name}.`)
  }
  async function dropPackage(countryId,key){
    const country=st.countries.find(x=>x.id===countryId),p=st.packages.find(x=>x.key===key);if(!country||!p)return;
    const assigned=packageCountryNames(p);if(assigned.includes(country.name))return status(`« ${p.name} » est déjà ajouté à ${country.name}.`);
    if(assigned.length&&!confirm(`« ${p.name} » est déjà ajouté à ${assigned.join(", ")}.\n\nVoulez-vous aussi l'ajouter à ${country.name} ?`))return;
    await assign(countryId,key)
  }
  async function dropPackages(countryId,keys){
    const country=st.countries.find(x=>x.id===countryId);if(!country)return;
    const unique=[...new Set(keys)].filter(key=>st.packages.some(x=>x.key===key)),pending=unique.filter(key=>!packageCountryNames(st.packages.find(x=>x.key===key)).includes(country.name)),elsewhere=pending.filter(key=>packageCountryNames(st.packages.find(x=>x.key===key)).length);
    if(!pending.length)return status(`Tous ces packages sont déjà ajoutés à ${country.name}.`);
    if(elsewhere.length&&!confirm(`${elsewhere.length} package(s) filtré(s) sont déjà ajoutés à un autre pays.\n\nVoulez-vous aussi les ajouter à ${country.name} ?`))return;
    await assignMany(countryId,pending)
  }
  async function init(force=false){if(st.loaded&&!force)return;st.loaded=true;pageLoading(true,"Chargement des Pays");try{status("Chargement des streams, pays et packages Live...");const sources=await api("/sources/catalog");st.sources=sources.filter(x=>x.enabled!==0&&x.type==="xtream");if(force){st.kind="live";st.source=null;st.loadedKinds.clear();st.loadingKinds.clear();st.allPackages={live:[],vod:[],series:[]};document.querySelectorAll("[data-mp-kind]").forEach(x=>{const active=x.dataset.mpKind==="live";x.classList.toggle("is-active",active);x.setAttribute("aria-selected",active?"true":"false")})}drawSources();await Promise.all([countries(),loadKind("live",force)]);drawCountries();if(st.sources[0])await source(st.source?.id||"all");else status("Aucun stream Xtream actif.",true)}catch(e){st.loaded=false;status(`Chargement impossible : ${e.message}`,true)}finally{pageLoading(false)}}
  document.addEventListener("click",e=>{
    if(e.target.closest("[data-settings-tab='countries']"))setTimeout(init,0);
    const s=e.target.closest("[data-source]");if(s)source(s.dataset.source).catch(x=>status(x.message,true));
    const d=e.target.closest("[data-delete-country]");if(d)askDeleteCountry(d.dataset.deleteCountry);
    const toggle=e.target.closest("[data-toggle-country]");if(toggle)toggleCountry(toggle.dataset.toggleCountry).catch(x=>status(x.message,true));
    const kind=e.target.closest("[data-mp-kind]");if(kind){st.kind=kind.dataset.mpKind;const selectedKind=st.kind;document.querySelectorAll("[data-mp-kind]").forEach(x=>{const active=x.dataset.mpKind===st.kind;x.classList.toggle("is-active",active);x.setAttribute("aria-selected",active?"true":"false")});(async()=>{await loadKind(selectedKind);if(st.kind===selectedKind&&st.source)await source(st.source.id)})().catch(x=>status(x.message,true))}
    const country=e.target.closest("[data-country]");if(country&&!d&&!toggle&&!e.target.closest(".manual-pays-dialog"))openCountry(country.dataset.country);
    const edit=e.target.closest("[data-edit-package]");if(edit)editPackage(edit.dataset.editPackage).catch(x=>dialogStatus(x.message,true));
    const remove=e.target.closest("[data-remove-package]");if(remove)removePackage(remove.dataset.removePackage).catch(x=>dialogStatus(x.message,true));
    if(e.target.closest("#mp-dialog-merge"))mergePackages().catch(x=>dialogStatus(`Fusion impossible : ${x.message}`,true));
    if(e.target.closest("#mp-dialog-close"))$("mp-country-dialog").close();
    if(e.target.closest("#mp-delete-country-cancel")){st.pendingDeleteCountry=null;$("mp-delete-country-dialog").close()}
    if(e.target.closest("#mp-delete-country-confirm")&&st.pendingDeleteCountry)deleteCountry(st.pendingDeleteCountry).catch(x=>status(`Suppression impossible : ${x.message}`,true));
    if(e.target.closest("#mp-dialog-add")){const key=$("mp-dialog-package-select").value;if(key&&st.activeCountry)assign(st.activeCountry,key).then(()=>dialogStatus("Package ajouté au pays.")).catch(x=>dialogStatus(x.message,true))}
    if(e.target.closest("#mp-refresh"))init(true)
  });
  document.addEventListener("keydown",e=>{const c=e.target.closest?.("[data-country]");if(c&&(e.key==="Enter"||e.key===" ")){e.preventDefault();openCountry(c.dataset.country)}});
  document.addEventListener("input",e=>{if(e.target.id==="mp-package-filter"||e.target.id==="mp-package-exclude")drawPackages();if(e.target.id==="mp-country-filter")drawCountries()});
  document.addEventListener("change",e=>{if(e.target.matches?.("[data-merge-package]"))updateMergeButton();if(e.target.id==="mp-package-filter-whole"||e.target.id==="mp-package-exclude-whole")drawPackages()});
  document.addEventListener("submit",e=>{if(e.target.id!=="mp-country-form")return;e.preventDefault();const name=$("mp-country-name").value.trim();if(!name)return status("Saisissez un nom de pays.",true);if(NON_COUNTRIES.has(name.toLowerCase()))return status("Adult est un type de contenu, pas un pays.",true);Promise.all([sb("admin_countries","",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({name})}),sb("canonical_countries","",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({match_key:`__manual__:${name.toLowerCase()}`,display_name:name,sort_order:0})})]).then(()=>{$("mp-country-name").value="";return countries()}).then(()=>status(`${name} est visible dans l'app.`)).catch(x=>status(x.message,true))});
  document.addEventListener("dragstart",e=>{const x=e.target.closest("[data-package],[data-packages]");if(x){x.classList.add("is-dragging");if(x.dataset.packages){e.dataTransfer.setData("application/x-velora-packages",x.dataset.packages);e.dataTransfer.setData("text/plain","__bulk_packages__")}else e.dataTransfer.setData("text/plain",x.dataset.package)}});
  document.addEventListener("dragend",e=>{e.target.closest("[data-package],[data-packages]")?.classList.remove("is-dragging");document.querySelectorAll(".manual-pays__country.is-over").forEach(x=>x.classList.remove("is-over"))});
  document.addEventListener("dragover",e=>{const x=e.target.closest("[data-country]");if(x){e.preventDefault();x.classList.add("is-over")}});
  document.addEventListener("dragleave",e=>{const x=e.target.closest("[data-country]");if(x&&!x.contains(e.relatedTarget))x.classList.remove("is-over")});
  document.addEventListener("drop",e=>{const x=e.target.closest("[data-country]");if(x){e.preventDefault();x.classList.remove("is-over");const bulk=e.dataTransfer.getData("application/x-velora-packages");if(bulk){let keys=[];try{keys=JSON.parse(bulk)}catch{}dropPackages(x.dataset.country,keys).catch(y=>status(`Affectation groupée impossible : ${y.message}`,true))}else dropPackage(x.dataset.country,e.dataTransfer.getData("text/plain")).catch(y=>status(`Affectation impossible : ${y.message}`,true))}})
  const visibilityObserver=new MutationObserver(()=>applyVisibility());const observeVisibility=()=>{if(document.documentElement)visibilityObserver.observe(document.documentElement,{childList:true,subtree:true})};document.documentElement?observeVisibility():document.addEventListener("DOMContentLoaded",observeVisibility,{once:true});loadVisibility();
})();

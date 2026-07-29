(() => {
  "use strict";
  const SURL="https://vmobanxusorocltxygjo.supabase.co", KEY="sb_publishable_vjz4gbyS9QlZi8rB7qMsLw_ATofLImp";
  const NON_COUNTRIES=new Set(["adult","adulte"]);
  const st={sources:[],source:null,kind:"live",packages:[],countries:[],assigned:new Map(),hiddenCountries:new Set(),activeCountry:null,loaded:false}, $=id=>document.getElementById(id);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  async function req(url,opt={}){const r=await fetch(url,opt),b=await r.json().catch(()=>null);if(!r.ok)throw Error(b?.message||b?.error||`HTTP ${r.status}`);return b}
  function api(path){const t=localStorage.getItem("authToken");return req(`/api${path}`,{cache:"no-store",headers:t?{Authorization:`Bearer ${t}`}:{}})}
  function sb(table,q="",opt={}){return req(`${SURL}/rest/v1/${table}${q}`,{...opt,headers:{apikey:KEY,Authorization:`Bearer ${KEY}`,"Content-Type":"application/json",...opt.headers}})}
  function status(msg,bad=false){const n=$("countries-admin-status");if(n){n.textContent=msg;n.classList.toggle("error",bad)}}
  const streamId=x=>String(x.stream_id??x.series_id??x.item_id??x.id??"");
  function drawSources(){ $("mp-stream-list").innerHTML=st.sources.length?st.sources.map(x=>`<button type="button" class="manual-pays__stream${st.source?.id===x.id?" is-active":""}" data-source="${esc(x.id)}"><span><strong>${esc(x.name||`Stream ${x.id}`)}</strong><br><small>${esc(x.type)}</small></span><span>›</span></button>`).join(""):'<div class="manual-pays__empty">Aucun stream Xtream actif.</div>'}
  function drawPackages(){const q=($("mp-package-filter")?.value||"").trim().toLowerCase(),rows=st.packages.filter(x=>!q||x.name.toLowerCase().includes(q));$("mp-package-list").innerHTML=rows.length?rows.map(x=>`<article class="manual-pays__package" draggable="true" data-package="${esc(x.key)}"><strong>${esc(x.name)}</strong><small>${x.items.length} élément(s) · ${x.label}</small></article>`).join(""):`<div class="manual-pays__empty">${st.source?"Aucun package trouvé.":"Sélectionnez un stream."}</div>`}
  async function canonicalRows(){const all=[];for(let from=0;;from+=1000){const rows=await sb("canonical_countries","?select=match_key,display_name&order=display_name.asc",{headers:{Range:`${from}-${from+999}`}});all.push(...rows);if(rows.length<1000)break}return all}
  function drawCountries(){$("mp-country-list").innerHTML=st.countries.length?st.countries.map(c=>{const p=st.assigned.get(c.id)||[],hidden=st.hiddenCountries.has(c.name.toLowerCase());return `<section class="manual-pays__country${hidden?" is-hidden-country":""}" data-country="${esc(c.id)}" tabindex="0" role="button"><div class="manual-pays__country-head"><strong>${esc(c.name)}</strong><button class="manual-pays__visibility" type="button" data-toggle-country="${esc(c.id)}">${hidden?"Afficher":"Masquer"}</button></div><ul class="manual-pays__assigned">${p.slice(0,8).map(x=>`<li>• ${esc(x.name)}</li>`).join("")}${p.length>8?`<li>+ ${p.length-8} autres</li>`:""}</ul></section>`}).join(""):'<div class="manual-pays__empty">Créez votre premier pays.</div>'}
  async function countries(){
    let admin=await sb("admin_countries","?select=id,name&order=name.asc"),canonical=await canonicalRows();
    st.hiddenCountries=new Set(canonical.filter(x=>String(x.match_key).startsWith("__hidden__:")).map(x=>String(x.display_name).trim().toLowerCase()));
    admin=admin.filter(x=>!NON_COUNTRIES.has(x.name.trim().toLowerCase()));const names=[...new Set(canonical.filter(x=>!String(x.match_key).startsWith("__hidden__:")).map(x=>String(x.display_name).trim()).filter(x=>x&&!NON_COUNTRIES.has(x.toLowerCase())))],known=new Set(admin.map(x=>x.name.toLowerCase())),missing=names.filter(x=>!known.has(x.toLowerCase()));
    for(let i=0;i<missing.length;i+=100)await sb("admin_countries","",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(missing.slice(i,i+100).map(name=>({name})))});
    if(missing.length)admin=await sb("admin_countries","?select=id,name&order=name.asc");
    st.countries=admin;const p=await sb("admin_packages","?select=id,country_id,name&order=name.asc");st.assigned=new Map;for(const x of p){const a=st.assigned.get(x.country_id)||[];a.push(x);st.assigned.set(x.country_id,a)}drawCountries();applyVisibility();if(st.activeCountry)drawDialog()
  }
  function applyVisibility(){document.querySelectorAll("#country-select option,#home-country-select option,.vel-home-country-picker__option").forEach(node=>{const name=(node.textContent||"").trim().toLowerCase(),hidden=st.hiddenCountries.has(name)||NON_COUNTRIES.has(name);node.hidden=hidden;node.style.display=hidden?"none":""})}
  async function loadVisibility(){try{const rows=await canonicalRows();st.hiddenCountries=new Set(rows.filter(x=>String(x.match_key).startsWith("__hidden__:")).map(x=>String(x.display_name).trim().toLowerCase()));applyVisibility()}catch(e){console.warn("[manual-pays] country visibility",e)}}
  async function toggleCountry(id){const c=st.countries.find(x=>x.id===id);if(!c)return;const hidden=st.hiddenCountries.has(c.name.toLowerCase());status(`${hidden?"Affichage":"Masquage"} de ${c.name}...`);if(hidden)await sb("canonical_countries",`?match_key=eq.${encodeURIComponent(`__hidden__:${c.name.toLowerCase()}`)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});else await sb("canonical_countries","",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({match_key:`__hidden__:${c.name.toLowerCase()}`,display_name:c.name,sort_order:999999})});await countries();status(`${c.name} est maintenant ${hidden?"visible":"masqué"} dans l'app.`)}
  function dialogStatus(msg,bad=false){const n=$("mp-dialog-status");if(n){n.textContent=msg;n.classList.toggle("error",bad)}}
  function drawDialog(){
    const c=st.countries.find(x=>x.id===st.activeCountry),list=$("mp-dialog-package-list"),select=$("mp-dialog-package-select");if(!c||!list||!select)return;
    $("mp-dialog-title").textContent=c.name;const rows=st.assigned.get(c.id)||[];
    list.innerHTML=rows.length?rows.map(x=>`<div class="manual-pays-dialog__row"><strong>${esc(x.name)}</strong><button type="button" class="manual-pays-dialog__edit" data-edit-package="${esc(x.id)}">Modifier</button><button type="button" class="manual-pays-dialog__remove" data-remove-package="${esc(x.id)}">Supprimer</button></div>`).join(""):'<div class="manual-pays__empty">Aucun package dans ce pays.</div>';
    const existing=new Set(rows.map(x=>x.name.toLowerCase()));const options=st.packages.filter(x=>!existing.has(x.name.toLowerCase()));
    select.innerHTML=options.length?options.map(x=>`<option value="${esc(x.key)}">${esc(x.name)} — ${x.label}</option>`).join(""):'<option value="">Aucun autre package disponible</option>';
    $("mp-dialog-add").disabled=!options.length
  }
  function openCountry(id){st.activeCountry=id;drawDialog();dialogStatus(`${(st.assigned.get(id)||[]).length} package(s) ajouté(s).`);$("mp-country-dialog").showModal()}
  async function removePackage(id){
    const row=(st.assigned.get(st.activeCountry)||[]).find(x=>x.id===id);if(!row||!confirm(`Supprimer « ${row.name} » de ce pays ?`))return;
    dialogStatus("Suppression...");await sb("admin_stream_curations",`?target_package_id=eq.${encodeURIComponent(id)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});await sb("admin_packages",`?id=eq.${encodeURIComponent(id)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});await countries();dialogStatus(`« ${row.name} » a été supprimé.`)
  }
  async function editPackage(id){
    const row=(st.assigned.get(st.activeCountry)||[]).find(x=>x.id===id);if(!row)return;const name=prompt("Nouveau nom du package :",row.name)?.trim();if(!name||name===row.name)return;
    dialogStatus("Enregistrement...");await sb("admin_packages",`?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({name})});await countries();dialogStatus(`Package renommé « ${name} ».`)
  }
  async function source(id){
    st.source=st.sources.find(x=>String(x.id)===String(id))||null;st.packages=[];drawSources();drawPackages();if(!st.source)return;
    status(`Chargement des packages de ${st.source.name}...`);
    const definitions={live:["Direct","live_categories","live_streams"],vod:["Movies","vod_categories","vod_streams"],series:["Series","series_categories","series"]},[label,cp,ip]=definitions[st.kind];
    const cats=await api(`/proxy/xtream/${st.source.id}/${cp}?includeHidden=true`).catch(()=>[]);
    st.packages=(await Promise.all(cats.map(async c=>{const id=String(c.category_id??c.id??""),items=await api(`/proxy/xtream/${st.source.id}/${ip}?category_id=${encodeURIComponent(id)}&includeHidden=true`).catch(()=>[]);return{key:`${st.kind}:${id}`,label,name:String(c.category_name??c.name??`Package ${id}`),items}}))).sort((a,b)=>a.name.localeCompare(b.name,"fr"));
    drawPackages();if(st.activeCountry&&$("mp-country-dialog")?.open)drawDialog();status(`${st.packages.length} package(s) ${label} dans ${st.source.name}. Glissez un package vers un pays.`)
  }
  async function assign(countryId,key){
    const c=st.countries.find(x=>x.id===countryId),p=st.packages.find(x=>x.key===key);if(!c||!p)return;status(`Affectation de « ${p.name} » à ${c.name}...`);
    let rows=await sb("admin_packages",`?select=id&country_id=eq.${encodeURIComponent(countryId)}&name=eq.${encodeURIComponent(p.name)}&limit=1`),target=rows[0]?.id;
    if(!target){rows=await sb("admin_packages","?select=id",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({country_id:countryId,name:p.name})});target=rows[0]?.id}
    if(!target)throw Error("Création du package cible impossible.");
    const cur=p.items.map(x=>({stream_id:streamId(x),country_id:countryId,target_package_id:target})).filter(x=>x.stream_id);
    for(let i=0;i<cur.length;i+=250)await sb("admin_stream_curations","?on_conflict=stream_id,country_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(cur.slice(i,i+250))});
    await countries();status(`« ${p.name} » est visible dans ${c.name} (${cur.length} élément(s)).`);window.dispatchEvent(new CustomEvent("velora-admin-curation-changed"))
  }
  async function init(force=false){if(st.loaded&&!force)return;st.loaded=true;try{status("Chargement des streams et des pays...");const sources=await api("/sources/catalog");st.sources=sources.filter(x=>x.enabled!==0&&x.type==="xtream");drawSources();await countries();if(st.sources[0])await source(st.sources[0].id);else status("Aucun stream Xtream actif.",true)}catch(e){st.loaded=false;status(`Chargement impossible : ${e.message}`,true)}}
  document.addEventListener("click",e=>{
    if(e.target.closest("[data-settings-tab='countries']"))setTimeout(init,0);
    const s=e.target.closest("[data-source]");if(s)source(s.dataset.source).catch(x=>status(x.message,true));
    const d=e.target.closest("[data-delete-country]");if(d){const c=st.countries.find(x=>x.id===d.dataset.deleteCountry);if(c&&confirm(`Supprimer « ${c.name} » et ses packages ?`))sb("admin_countries",`?id=eq.${encodeURIComponent(c.id)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}}).then(countries).catch(x=>status(x.message,true))}
    const toggle=e.target.closest("[data-toggle-country]");if(toggle)toggleCountry(toggle.dataset.toggleCountry).catch(x=>status(x.message,true));
    const kind=e.target.closest("[data-mp-kind]");if(kind){st.kind=kind.dataset.mpKind;document.querySelectorAll("[data-mp-kind]").forEach(x=>{const active=x.dataset.mpKind===st.kind;x.classList.toggle("is-active",active);x.setAttribute("aria-selected",active?"true":"false")});if(st.source)source(st.source.id).catch(x=>status(x.message,true))}
    const country=e.target.closest("[data-country]");if(country&&!d&&!toggle&&!e.target.closest(".manual-pays-dialog"))openCountry(country.dataset.country);
    const edit=e.target.closest("[data-edit-package]");if(edit)editPackage(edit.dataset.editPackage).catch(x=>dialogStatus(x.message,true));
    const remove=e.target.closest("[data-remove-package]");if(remove)removePackage(remove.dataset.removePackage).catch(x=>dialogStatus(x.message,true));
    if(e.target.closest("#mp-dialog-close"))$("mp-country-dialog").close();
    if(e.target.closest("#mp-dialog-add")){const key=$("mp-dialog-package-select").value;if(key&&st.activeCountry)assign(st.activeCountry,key).then(()=>dialogStatus("Package ajouté au pays.")).catch(x=>dialogStatus(x.message,true))}
    if(e.target.closest("#mp-refresh"))init(true)
  });
  document.addEventListener("keydown",e=>{const c=e.target.closest?.("[data-country]");if(c&&(e.key==="Enter"||e.key===" ")){e.preventDefault();openCountry(c.dataset.country)}});
  document.addEventListener("input",e=>{if(e.target.id==="mp-package-filter")drawPackages()});
  document.addEventListener("submit",e=>{if(e.target.id!=="mp-country-form")return;e.preventDefault();const name=$("mp-country-name").value.trim();if(!name)return status("Saisissez un nom de pays.",true);if(NON_COUNTRIES.has(name.toLowerCase()))return status("Adult est un type de contenu, pas un pays.",true);Promise.all([sb("admin_countries","",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({name})}),sb("canonical_countries","",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({match_key:`__manual__:${name.toLowerCase()}`,display_name:name,sort_order:0})})]).then(()=>{$("mp-country-name").value="";return countries()}).then(()=>status(`${name} est visible dans l'app.`)).catch(x=>status(x.message,true))});
  document.addEventListener("dragstart",e=>{const x=e.target.closest("[data-package]");if(x){x.classList.add("is-dragging");e.dataTransfer.setData("text/plain",x.dataset.package)}});
  document.addEventListener("dragend",e=>{e.target.closest("[data-package]")?.classList.remove("is-dragging");document.querySelectorAll(".manual-pays__country.is-over").forEach(x=>x.classList.remove("is-over"))});
  document.addEventListener("dragover",e=>{const x=e.target.closest("[data-country]");if(x){e.preventDefault();x.classList.add("is-over")}});
  document.addEventListener("dragleave",e=>{const x=e.target.closest("[data-country]");if(x&&!x.contains(e.relatedTarget))x.classList.remove("is-over")});
  document.addEventListener("drop",e=>{const x=e.target.closest("[data-country]");if(x){e.preventDefault();x.classList.remove("is-over");assign(x.dataset.country,e.dataTransfer.getData("text/plain")).catch(y=>status(`Affectation impossible : ${y.message}`,true))}})
  const visibilityObserver=new MutationObserver(()=>applyVisibility());visibilityObserver.observe(document.documentElement,{childList:true,subtree:true});loadVisibility();
})();

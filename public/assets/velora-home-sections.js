(function(){"use strict";var base="/api/velora-db/rest/v1",state={sections:[],packages:[],orders:[],countries:[],homeCache:null};
var defaultChannelHiddenFilters=["HEVC","H265","H.265","H 265","x265"],homePrefixes=[],homeHiddenFilters=defaultChannelHiddenFilters.slice();
async function req(path,options){var r=await fetch(base+path,Object.assign({cache:"no-store",headers:{"Content-Type":"application/json","Prefer":"return=representation"}},options||{}));if(!r.ok)throw new Error("HTTP "+r.status);if(r.status===204)return null;var t=await r.text(),payload=t?JSON.parse(t):null;return options&&options.method==="DELETE"&&Array.isArray(payload)&&payload.length===0?null:payload}
var editingSectionId=null,showAllAdminSections=false,verifiedSectionEntries=new Map(),packageMetadataPromises=new Map();
function status(text,error){var e=document.getElementById("home-sections-admin-status");if(e){e.textContent=text;e.classList.toggle("error",!!error)}}
function pkg(id){return state.packages.find(function(p){return String(p.id)===String(id)})}
async function verifiedEntries(section){var cached=Array.isArray(section.entries)?section.entries:[],p=pkg(section.package_id),kind=section.content_type==="movies"?"vod":section.content_type,packageKey=String(section.package_id||"");if(kind==="vod"||kind==="series"){if(!packageMetadataPromises.has(packageKey))packageMetadataPromises.set(packageKey,req("/admin_packages?select=id,country_id,name,source_id,category_id,kind&id=eq."+encodeURIComponent(packageKey)).then(function(rows){return Array.isArray(rows)&&rows[0]?rows[0]:null}));var exactPackage=await packageMetadataPromises.get(packageKey);if(exactPackage)p=exactPackage}if(!p||!(kind==="vod"||kind==="series")||!p.source_id||!p.category_id)return cached;var key=[kind,p.source_id,p.category_id].join(":");if(!verifiedSectionEntries.has(key))verifiedSectionEntries.set(key,(async function(){var endpoint=kind==="series"?"series":"vod_streams",globalCategory=btoa(unescape(encodeURIComponent(String(p.source_id)+":"+String(p.category_id)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""),response=await fetch("/api/proxy/xtream/all/"+endpoint+"?category_id="+encodeURIComponent(globalCategory),{cache:"no-store"});if(!response.ok)throw new Error("HTTP "+response.status);var rows=await response.json();if(!Array.isArray(rows))return cached;return rows.map(function(item,index){var rawId=item.raw_stream_id!=null?item.raw_stream_id:item.raw_series_id!=null?item.raw_series_id:item.stream_id!=null?item.stream_id:item.series_id!=null?item.series_id:index;return{id:"home-verified:"+section.id+":"+rawId,name:String(item.name||item.title||item.series_name||"").trim(),thumbUrl:String(item.stream_icon||item.cover||""),streamId:rawId,sourceId:item.source_id!=null?item.source_id:p.source_id,globalStreamId:item.global_stream_id||item.stream_id,containerExtension:item.container_extension||"",contentType:section.content_type,packageId:section.package_id}}).filter(function(item){return item.name})})().catch(function(){return cached.filter(function(entry){return String(entry.sourceId)===String(p.source_id)})}));return verifiedSectionEntries.get(key)}
// Home is a first-paint surface. Its country-scoped cache already contains the
// ordered preview entries, so never expand every package through the provider
// API here. Full package contents are loaded only after the user opens one.
var homeSectionRenderLimit=20;
verifiedEntries=async function(section){var entries=Array.isArray(section.entries)?section.entries:[];return entries.slice(0,homeSectionRenderLimit)};
function countryKey(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"")}
function normalizeChannelRuleValue(value){try{return String(value||"").normalize("NFKC").trim().toLowerCase()}catch(error){return String(value||"").trim().toLowerCase()}}
function stripChannelPrefixes(value){var original=String(value||"").trim(),name=original;for(var pass=0;pass<64;pass+=1){var prefix=homePrefixes.find(function(candidate){return candidate.length<=name.length&&name.slice(0,candidate.length).toLowerCase()===candidate.toLowerCase()});if(!prefix)break;name=name.slice(prefix.length).trim()}for(var p=0;p<5;p+=1){var next=name.replace(/^[\[\(]?[A-Z0-9\+\-\s]{1,12}[\]\)]\s*[-:]?\s*/i,"").replace(/^([0-9]+K|[0-9]+D|HD|FHD|UHD|4K|VF|VOSTFR|VO|FR|EN|ES|DE|MULTI|TRUEFRENCH|FRENCH)\s*[-:]?\s*/i,"").replace(/^[A-Z0-9]{1,8}-[A-Z0-9]{1,8}\s*[-:]?\s*/i,"").trim();if(next===name)break;name=next}return name||original}
function channelNameIsHidden(value){var name=normalizeChannelRuleValue(value);return homeHiddenFilters.some(function(filter){var normalized=normalizeChannelRuleValue(filter);return normalized.startsWith("suffix:")?name.endsWith(normalized.slice(7).trim()):name.includes(normalized)})}
function applyHomeChannelRules(section,entries){var rows=Array.isArray(entries)?entries:[];if(!section)return rows;return rows.map(function(entry){var rawName=String(entry&&entry._veloraHomeRawName||entry&&entry.name||"").trim();if(!rawName)return null;if(section.content_type==="live"&&channelNameIsHidden(rawName))return null;return Object.assign({},entry,{name:stripChannelPrefixes(rawName),_veloraHomeRawName:rawName})}).filter(function(entry){return entry&&entry.name})}
function applyRulesToHomePayload(payload){if(payload&&Array.isArray(payload.sections))payload.sections.forEach(function(section){section.entries=applyHomeChannelRules(section,section.entries)});return payload}
window.veloraApplyHomeChannelRules=applyHomeChannelRules;
async function loadChannelNameRules(){var results=await Promise.all([req("/admin_channel_name_prefixes?select=prefix,sort_order&order=sort_order.asc,prefix.desc").catch(function(){return[]}),req("/admin_hidden_filters?select=needle&order=needle.asc").catch(function(){return[]})]);homePrefixes=[...new Set((Array.isArray(results[0])?results[0]:[]).map(function(row){return String(row.prefix||"").trim()}).filter(Boolean))].sort(function(left,right){return right.length-left.length});homeHiddenFilters=[...new Set(defaultChannelHiddenFilters.concat((Array.isArray(results[1])?results[1]:[]).map(function(row){return String(row.needle||"").trim()}).filter(Boolean)))].sort(function(left,right){return right.length-left.length})}
function sectionMatchesCountry(row,active){if(!row||!active)return false;if(String(row.country_id||"")===String(active.id||""))return true;var configured=state.countries.find(function(country){return String(country.id)===String(row.country_id)});return !!configured&&countryKey(configured.name)===countryKey(active.name)}
function homeImageUrl(value,forceProxy){var url=String(value||"").trim();if(!url)return "";if(/^\/api\/proxy\/image\?/i.test(url))return url;var absolute=url;if(/^\/\//.test(url))absolute=location.protocol+url;else if(!/^https?:\/\//i.test(url))return url;return forceProxy||location.protocol==="https:"&&/^http:\/\//i.test(absolute)?"/api/proxy/image?url="+encodeURIComponent(absolute):absolute}
window.veloraSetHomeImageSource=window.veloraSetHomeImageSource||function(image,value,onFailure){var direct=homeImageUrl(value,false),proxied=homeImageUrl(value,true),retried=false;function failed(){if(!retried&&proxied&&proxied!==direct){retried=true;image.src=proxied;return}image.removeEventListener("error",failed);if(typeof onFailure==="function")onFailure()}image.addEventListener("error",failed);image.src=direct};
function warmHomeMovie(){return Promise.resolve()}
function prewarmHomeMovies(sections){var entries=[];(sections||[]).forEach(function(section){if(section.content_type==="movies"&&Array.isArray(section.entries))entries.push.apply(entries,section.entries)});entries=entries.slice(0,10);window.setTimeout(async function(){for(var i=0;i<entries.length;i+=2)await Promise.all(entries.slice(i,i+2).map(warmHomeMovie))},350)}
function fillCountries(){var select=document.getElementById("home-section-country");if(!select)return;var current=select.value||"default";select.replaceChildren();var fallback=document.createElement("option");fallback.value="default";fallback.textContent="Accueil par d\u00e9faut";select.appendChild(fallback);state.countries.slice().sort(function(a,b){return String(a.name).localeCompare(String(b.name),"fr")}).forEach(function(country){var option=document.createElement("option");option.value=country.id;option.textContent=country.name;select.appendChild(option)});if(Array.from(select.options).some(function(option){return option.value===current}))select.value=current}
function fillPackages(){var type=document.getElementById("home-section-type"),country=document.getElementById("home-section-country"),select=document.getElementById("home-section-package");if(!type||!country||!select)return;var ids=new Set;state.orders.filter(function(r){return r.ui_tab===type.value&&(country.value==="default"||String(r.country_id)===country.value)}).forEach(function(r){(r.package_order||[]).forEach(function(id){ids.add(String(id))})});select.replaceChildren();state.packages.filter(function(p){return ids.has(String(p.id))&&p.is_hidden!==true&&p.is_hidden!=="true"}).sort(function(a,b){return String(a.name).localeCompare(String(b.name),"fr")}).forEach(function(p){var o=document.createElement("option");o.value=p.id;o.textContent=p.name;select.appendChild(o)})}
async function move(row,direction){var rows=state.sections.filter(function(r){return String(r.country_id||"default")===String(row.country_id||"default")}).sort(function(a,b){return(a.section_order||0)-(b.section_order||0)}),i=rows.findIndex(function(r){return r.id===row.id}),j=i+direction;if(i<0||j<0||j>=rows.length)return;await Promise.all([req("/admin_home_sections?id=eq."+encodeURIComponent(rows[i].id),{method:"PATCH",body:JSON.stringify({section_order:rows[j].section_order})}),req("/admin_home_sections?id=eq."+encodeURIComponent(rows[j].id),{method:"PATCH",body:JSON.stringify({section_order:rows[i].section_order})})]);await load()}
function control(text,title,fn){var b=document.createElement("button");b.type="button";b.textContent=text;b.title=title;b.addEventListener("click",fn);return b}
function resetEditor(){editingSectionId=null;var title=document.getElementById("home-section-title"),orientation=document.getElementById("home-section-card-orientation"),published=document.getElementById("home-section-published"),add=document.getElementById("home-section-add"),cancel=document.getElementById("home-section-cancel");if(title)title.value="";if(orientation)orientation.value="vertical";if(published)published.checked=true;if(add)add.textContent="Cr\u00e9er la section";if(cancel)cancel.hidden=true;renderAdmin()}
function editSection(row){var country=document.getElementById("home-section-country"),type=document.getElementById("home-section-type"),title=document.getElementById("home-section-title"),orientation=document.getElementById("home-section-card-orientation"),select=document.getElementById("home-section-package"),published=document.getElementById("home-section-published"),add=document.getElementById("home-section-add"),cancel=document.getElementById("home-section-cancel");editingSectionId=row.id;if(country)country.value=row.country_id||"default";if(type)type.value=row.content_type;fillPackages();if(select)select.value=String(row.package_id);if(orientation)orientation.value=row.card_orientation||"vertical";if(title){title.value=row.title||"";title.focus();title.scrollIntoView({behavior:"smooth",block:"center"})}if(published)published.checked=row.published!==false;if(add)add.textContent="Enregistrer les modifications";if(cancel)cancel.hidden=false;renderAdmin()}
function renderAdmin(){var wrap=document.getElementById("home-sections-admin-list"),select=document.getElementById("home-section-country"),toggle=document.getElementById("home-sections-show-all");if(!wrap)return;var selected=select?select.value:"default",rows=state.sections.filter(function(row){return showAllAdminSections||String(row.country_id||"default")===String(selected)}).sort(function(a,b){return(a.section_order||0)-(b.section_order||0)});if(toggle){toggle.textContent=showAllAdminSections?"Afficher uniquement ce pays":"Afficher toutes les sections";toggle.setAttribute("aria-pressed",showAllAdminSections?"true":"false")}wrap.replaceChildren();if(!rows.length){var empty=document.createElement("p");empty.className="vel-home-sections-admin-empty";empty.textContent=showAllAdminSections?"Aucune section configur\u00e9e.":"Aucune section cr\u00e9\u00e9e pour ce pays.";wrap.appendChild(empty);return}rows.forEach(function(row){var item=document.createElement("div");item.className="vel-home-sections-admin-row";var label=document.createElement("div"),strong=document.createElement("strong"),small=document.createElement("small"),p=pkg(row.package_id),country=state.countries.find(function(c){return c.id===row.country_id}),orientationLabel=row.card_orientation==="horizontal"?"Horizontal":"Vertical";strong.textContent=row.title;small.textContent=(country?country.name:"Accueil par d\u00e9faut")+"  /  "+row.content_type+" ("+orientationLabel+")  -  "+(p?p.name:row.package_id);label.append(strong,small);var published=row.published!==false;item.classList.toggle("is-unpublished",!published);item.classList.toggle("is-editing",String(editingSectionId)===String(row.id));item.append(label,control("Modifier","Modifier cette section",function(){editSection(row)}),control("\u2191","Monter",function(){move(row,-1)}),control("\u2193","Descendre",function(){move(row,1)}),control(published?"D\u00e9publier":"Publier",published?"Masquer cette section":"Publier cette section",async function(){await req("/admin_home_sections?id=eq."+encodeURIComponent(row.id),{method:"PATCH",body:JSON.stringify({published:!published})});await load()}),control("Supprimer","Supprimer cette section",async function(event){var button=event.currentTarget;event.preventDefault();event.stopPropagation();if(!window.confirm("Supprimer la section \u00ab "+row.title+" \u00bb ?"))return;button.disabled=true;status("Suppression de la section...");try{var deleted=await req("/admin_home_sections?id=eq."+encodeURIComponent(row.id),{method:"DELETE"});if(Array.isArray(deleted)&&deleted.length===0)throw new Error("Section introuvable");if(String(editingSectionId)===String(row.id))resetEditor();if(typeof window.veloraInvalidateHomeCache==="function")window.veloraInvalidateHomeCache();await load();status("Section supprim\u00e9e.")}catch(error){status("Impossible de supprimer la section : "+error.message,true);button.disabled=false}}));wrap.appendChild(item)})}
document.addEventListener("click",async function(event){var button=event.target&&event.target.closest("#home-section-add, #home-section-cancel");if(!button)return;if(button.id==="home-section-cancel"){event.preventDefault();event.stopImmediatePropagation();resetEditor();status("Modification annul\u00e9e.");return}if(editingSectionId==null)return;event.preventDefault();event.stopImmediatePropagation();var country=document.getElementById("home-section-country"),type=document.getElementById("home-section-type"),title=document.getElementById("home-section-title"),orientation=document.getElementById("home-section-card-orientation"),select=document.getElementById("home-section-package"),published=document.getElementById("home-section-published");if(!title||!title.value.trim()||!select||!select.value){status("Choisissez un nom et un package.",true);return}button.disabled=true;try{await req("/admin_home_sections?id=eq."+encodeURIComponent(editingSectionId),{method:"PATCH",body:JSON.stringify({country_id:country.value,content_type:type.value,title:title.value.trim(),card_orientation:orientation?orientation.value:"vertical",package_id:select.value,published:published.checked})});resetEditor();await load();status("Section modifi\u00e9e.")}catch(error){status("Impossible de modifier la section.",true)}finally{button.disabled=false}},true)
var clientBackdropCache = new Map();
function veloraEnsureCardBackdrop(card, media, section, entry) {
  var key = String(entry.sourceId || "") + ":" + String(entry.streamId || "") + ":" + String(entry.name || "");
  if (clientBackdropCache.has(key)) {
    var cached = clientBackdropCache.get(key);
    if (cached && media.tagName === "IMG" && media.src !== cached) {
      media.src = cached;
    }
    return;
  }
  var currentSrc = media.tagName === "IMG" ? (media.src || "") : "";
  if (currentSrc.includes("/w1280") || currentSrc.includes("/w780") || (entry.backdropUrl && entry.backdropUrl !== entry.thumbUrl)) {
    clientBackdropCache.set(key, entry.backdropUrl || currentSrc);
    return;
  }
  var url = "/api/velora-db/media-backdrop?name=" + encodeURIComponent(entry.name || "") +
            "&type=" + encodeURIComponent(section.content_type || "movies") +
            "&stream_id=" + encodeURIComponent(entry.streamId || "") +
            "&source_id=" + encodeURIComponent(entry.sourceId || "");
  fetch(url, { cache: "force-cache" })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data && data.ok && data.backdropUrl) {
        clientBackdropCache.set(key, data.backdropUrl);
        entry.backdropUrl = data.backdropUrl;
        entry.thumbUrl = data.backdropUrl;
        if (media.tagName === "IMG") {
          if (typeof window.veloraSetHomeImageSource === "function") {
            window.veloraSetHomeImageSource(media, data.backdropUrl, function() {
              media.removeAttribute("src");
              media.classList.add("vel-home-section__fallback");
            });
          } else {
            media.src = data.backdropUrl;
            media.classList.remove("vel-home-section__fallback");
          }
        }
      }
    })
    .catch(function() {});
}

function card(section,entry){var b=document.createElement("button"),packageRow=pkg(section.package_id),countryRow=state.countries.find(function(country){return String(country.id)===String(section.country_id)}),isHorizontal=(section&&section.card_orientation==="horizontal")||(entry&&entry.card_orientation==="horizontal");b.type="button";b.className="vel-home-section__card vel-home-section__card--"+section.content_type+(isHorizontal?" vel-home-section__card--horizontal":"");var cleanTitle=stripChannelPrefixes(entry.name||"");b.setAttribute("aria-label",cleanTitle);b.dataset.packageId=String(section.package_id||entry.packageId||"");b.dataset.packageName=String(packageRow&&packageRow.name||section.title||"");b.dataset.contentType=String(section.content_type||entry.contentType||"");b.dataset.countryName=String(countryRow&&countryRow.name||"");b.dataset.mediaId=String(entry.streamId||entry.globalStreamId||entry.id||"");var media,imgUrl=isHorizontal?(entry.backdropUrl||entry.backdrop||entry.thumbUrl):(entry.thumbUrl||entry.backdropUrl||entry.backdrop);if(imgUrl){media=document.createElement("img");media.alt="";media.loading="lazy";window.veloraSetHomeImageSource(media,imgUrl,function(){media.removeAttribute("src");media.classList.add("vel-home-section__fallback")})}else{media=document.createElement("span");media.classList.add("vel-home-section__fallback");media.textContent="\u25b6"}media.classList.add("vel-home-section__media");var name=document.createElement("span");name.className="vel-home-section__name";name.textContent=cleanTitle;b.append(media,name);if(isHorizontal&&(section.content_type==="movies"||section.content_type==="series")){veloraEnsureCardBackdrop(b,media,section,entry)}if(typeof window.veloraBindHomeCardActivation==="function")window.veloraBindHomeCardActivation(b,section,entry);if(section.content_type==="movies"){b.addEventListener("pointerenter",function(){warmHomeMovie(entry)},{once:true});b.addEventListener("focus",function(){warmHomeMovie(entry)},{once:true})}b.addEventListener("click",function(){if(typeof window.veloraOpenHomeCacheEntry==="function")window.veloraOpenHomeCacheEntry(section,entry,b)});return b}
var homeRenderVersion=0;async function renderHome(){var wrap=document.getElementById("vel-home-sections"),countrySelect=document.getElementById("country-select");if(!wrap)return;if(typeof window.veloraIsStartupCountryReady==="function"&&!window.veloraIsStartupCountryReady(countrySelect))return;var savedScrolls=new Map();wrap.querySelectorAll(".vel-home-section").forEach(function(sec){var r=sec.querySelector(".vel-home-section__rail"),heading=sec.querySelector(".vel-home-section__heading"),k=heading?heading.textContent.trim():"";if(k&&r&&Number.isFinite(r.scrollLeft)&&r.scrollLeft>0){savedScrolls.set(k,r.scrollLeft)}});var renderVersion=++homeRenderVersion,fragment=document.createDocumentFragment();if(typeof window.veloraRenderResumeSection==="function"){var resumeBlock=window.veloraRenderResumeSection();if(resumeBlock)fragment.appendChild(resumeBlock)}var source=state.homeCache&&Array.isArray(state.homeCache.sections)?state.homeCache.sections:state.sections,active=typeof window.veloraGetActiveCountry==="function"?window.veloraGetActiveCountry():{id:typeof window.veloraGetActiveCountryId==="function"?window.veloraGetActiveCountryId():"",name:""},published=source.filter(function(row){return row.published!==false}),specific=published.filter(function(row){return sectionMatchesCountry(row,active)}),rows=(specific.length?specific:published.filter(function(row){return !row.country_id||row.country_id==="default"})).slice().sort(function(a,b){return(a.section_order||0)-(b.section_order||0)});for(var section of rows){var isHorizontal=section.card_orientation==="horizontal",block=document.createElement("section"),heading=document.createElement("h3"),rail=document.createElement("div");block.className="vel-home-section"+(isHorizontal?" vel-home-section--horizontal":"");heading.className="vel-home-section__heading";heading.textContent=section.title;rail.className="vel-home-section__rail";block.append(heading,rail);fragment.appendChild(block);for(var placeholderIndex=0;placeholderIndex<6;placeholderIndex+=1){var placeholder=document.createElement("span");placeholder.className="vel-home-section__skeleton vel-home-section__skeleton--"+section.content_type+(isHorizontal?" vel-home-section__skeleton--horizontal":"");placeholder.setAttribute("aria-hidden","true");rail.appendChild(placeholder)}
try{var entries=await verifiedEntries(section);if(!entries.length&&Array.isArray(section.entries)){var sourceCounts={};section.entries.forEach(function(entry){var source=String(entry.sourceId||"");if(source)sourceCounts[source]=(sourceCounts[source]||0)+1});var dominantSource=Object.keys(sourceCounts).sort(function(a,b){return sourceCounts[b]-sourceCounts[a]})[0];entries=section.entries.filter(function(entry){return !dominantSource||String(entry.sourceId||"")===dominantSource})}rail.replaceChildren();entries.forEach(function(entry){rail.appendChild(card(section,entry))});if(!entries.length){var empty=document.createElement("p");empty.className="vel-home-section__empty";empty.textContent="Aucun contenu disponible.";rail.appendChild(empty)}}catch(e){rail.replaceChildren();var fallbackEntries=Array.isArray(section.entries)?section.entries:[],sourceCounts={};fallbackEntries.forEach(function(entry){var source=String(entry.sourceId||"");if(source)sourceCounts[source]=(sourceCounts[source]||0)+1});var dominantSource=Object.keys(sourceCounts).sort(function(a,b){return sourceCounts[b]-sourceCounts[a]})[0];fallbackEntries.filter(function(entry){return !dominantSource||String(entry.sourceId||"")===dominantSource}).forEach(function(entry){rail.appendChild(card(section,entry))});if(!rail.children.length){var failed=document.createElement("p");failed.className="vel-home-section__empty";failed.textContent="Section indisponible.";rail.appendChild(failed)}}}if(renderVersion===homeRenderVersion){wrap.replaceChildren(fragment);wrap.querySelectorAll(".vel-home-section").forEach(function(sec){var r=sec.querySelector(".vel-home-section__rail"),heading=sec.querySelector(".vel-home-section__heading"),k=heading?heading.textContent.trim():"";if(k&&r&&savedScrolls.has(k)){r.scrollLeft=savedScrolls.get(k)}});document.dispatchEvent(new CustomEvent("velora-home-country-rendered"))}}
async function loadHomeCache(){if(typeof window.veloraLoadHomeCache==="function")state.homeCache=await window.veloraLoadHomeCache(true);else{var response=await fetch("/api/velora-db/home-cache?t="+Date.now(),{cache:"no-store"});if(!response.ok)throw new Error("HTTP "+response.status);state.homeCache=await response.json()}return applyRulesToHomePayload(state.homeCache)}
async function load(){try{var v=await Promise.all([req("/admin_home_sections?select=*&order=section_order.asc"),req("/admin_packages?select=id,country_id,name,source_id,category_id,kind,is_hidden&order=name.asc"),req("/admin_country_package_order?select=country_id,ui_tab,package_order"),req("/admin_countries?select=id,name&order=name.asc"),loadHomeCache(false).catch(function(){return null})]);state.sections=v[0]||[];state.packages=v[1]||[];state.orders=v[2]||[];state.countries=v[3]||[];fillCountries();fillPackages();renderAdmin();renderHome();status(state.sections.length?state.sections.length+" section(s) configur\u00e9e(s).":"Aucune section configur\u00e9e.")}catch(e){status("Impossible de charger les sections Accueil.",true)}}
async function ensurePlayerCatalog(){if(typeof window.veloraHomeCatalogReady==="function"&&window.veloraHomeCatalogReady())return;if(typeof window.veloraForceAutoconnect!=="function")throw new Error("Connexion au catalogue indisponible");window.veloraForceAutoconnect();for(var attempt=0;attempt<120;attempt+=1){if(typeof window.veloraHomeCatalogReady==="function"&&window.veloraHomeCatalogReady())return;await new Promise(function(resolve){window.setTimeout(resolve,250)})}throw new Error("Le catalogue ne s'est pas charg\u00e9 \u00e0 temps")}
function init(){var type=document.getElementById("home-section-type"),country=document.getElementById("home-section-country"),packageSelect=document.getElementById("home-section-package"),orientationSelect=document.getElementById("home-section-card-orientation"),add=document.getElementById("home-section-add"),rebuild=document.getElementById("home-cache-rebuild"),cacheStatus=document.getElementById("home-cache-status"),showAll=document.getElementById("home-sections-show-all");if(type)type.addEventListener("change",fillPackages);if(country)country.addEventListener("change",function(){showAllAdminSections=false;fillPackages();renderAdmin()});if(packageSelect)packageSelect.addEventListener("change",function(){var title=document.getElementById("home-section-title"),option=packageSelect.options[packageSelect.selectedIndex];if(title&&option)title.value=String(option.textContent||"").trim()});if(showAll)showAll.addEventListener("click",function(){showAllAdminSections=!showAllAdminSections;renderAdmin()});document.getElementById("country-select")?.addEventListener("change",function(){window.setTimeout(renderHome,0)});if(rebuild)rebuild.addEventListener("click",async function(){rebuild.disabled=true;if(cacheStatus){cacheStatus.textContent="Chargement des packages et reconstruction du cache...";cacheStatus.classList.remove("error")}try{await ensurePlayerCatalog();var cachedSections=[];for(var section of state.sections){var isHoriz=section.card_orientation==="horizontal",entries=typeof window.veloraGetHomeSectionContent==="function"?await window.veloraGetHomeSectionContent(section.content_type,section.package_id,isHoriz):[];if(isHoriz&&Array.isArray(entries)){entries=entries.map(function(e){var key=String(e.sourceId||"")+":"+String(e.streamId||"")+":"+String(e.name||"");var cached=clientBackdropCache.get(key);var b=cached||e.backdropUrl||e.backdrop||e.thumbUrl;return Object.assign({},e,{thumbUrl:b,backdropUrl:b})})}cachedSections.push(Object.assign({},section,{entries:entries,card_orientation:section.card_orientation||"vertical"}))}if(!cachedSections.some(function(section){return section.entries.length>0}))throw new Error("Aucun contenu charge depuis les packages");var response=await fetch("/api/velora-db/home-cache/rebuild",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({sections:cachedSections})}),result=await response.json();if(!response.ok)throw new Error(result.error||"HTTP "+response.status);if(typeof window.veloraInvalidateHomeCache==="function")window.veloraInvalidateHomeCache();await loadHomeCache(true);renderHome();if(cacheStatus)cacheStatus.textContent="Cache recree : "+result.sections+" section(s), "+result.entries+" contenu(s)."}catch(e){if(cacheStatus){cacheStatus.textContent="Impossible de reconstruire le cache Accueil : "+(e&&e.message?e.message:String(e));cacheStatus.classList.add("error")}}finally{rebuild.disabled=false}});if(add)add.addEventListener("click",async function(){var title=document.getElementById("home-section-title"),select=document.getElementById("home-section-package"),orientation=document.getElementById("home-section-card-orientation"),published=document.getElementById("home-section-published");if(!title.value.trim()||!select.value){status("Choisissez un nom et un package.",true);return}add.disabled=true;try{var order=state.sections.length?Math.max.apply(null,state.sections.map(function(r){return Number(r.section_order)||0}))+1:0;await req("/admin_home_sections",{method:"POST",body:JSON.stringify({country_id:country.value,content_type:type.value,title:title.value.trim(),card_orientation:orientation?orientation.value:"vertical",package_id:select.value,published:published.checked,section_order:order})});title.value="";await load()}catch(e){status("Impossible de cr\u00e9er la section.",true)}finally{add.disabled=false}});loadHomeCache(false).then(function(){renderHome()}).catch(function(){});var adminLoaded=false,main=document.getElementById("main");function loadAdminIfVisible(){if(adminLoaded||!main||!main.classList.contains("main--velora-admin"))return;adminLoaded=true;load()}if(main){new MutationObserver(loadAdminIfVisible).observe(main,{attributes:true,attributeFilter:["class"]});loadAdminIfVisible()}}
// Refresh the small country-scoped Home payload before the canonical render.
// The cache module coalesces this with its own request, so one country change
// produces one request rather than two competing network loads.
document.getElementById("country-select")?.addEventListener("change",function(){loadHomeCache(false).then(renderHome).catch(function(){})});
function refreshHomeChannelRules(){loadChannelNameRules().then(function(){return loadHomeCache(true)}).then(renderHome).catch(function(){})}
loadChannelNameRules().then(function(){if(state.homeCache){applyRulesToHomePayload(state.homeCache);renderHome()}}).catch(function(){});
document.addEventListener("velora-channel-prefixes-changed",refreshHomeChannelRules);document.addEventListener("velora-channel-suffixes-changed",refreshHomeChannelRules);
document.addEventListener("velora-app-ready",function(){if(state.homeCache)renderHome()});document.addEventListener("velora-countries-ready",function(){if(state.homeCache)window.setTimeout(renderHome,0)});document.addEventListener("velora-home-cache-invalidated",function(){loadHomeCache(true).then(renderHome).catch(function(){})});document.addEventListener("velora-watch-history-updated",function(){if(typeof window.veloraInjectResumeSection==="function")window.veloraInjectResumeSection()});if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init()})();

/* Desktop mouse-drag support for the horizontal Accueil rails. Touch devices
   retain their native momentum scrolling. */
(function(){
function bindRailDrag(rail){
  if(!rail||rail.dataset.dragScrollBound==="true")return;
  rail.dataset.dragScrollBound="true";
  var drag=null,blockClick=false;
  var section=rail.closest(".vel-home-section");
  if(!section)return;

  var previousButton=section.querySelector(".vel-home-section__scroll-btn--prev");
  var nextButton=section.querySelector(".vel-home-section__scroll-btn--next");

  function updateScrollButtons(){
    if(!previousButton||!nextButton)return;
    var hasOverflow=rail.scrollWidth>rail.clientWidth+4;
    section.classList.toggle("has-scroll-controls",hasOverflow);
    previousButton.disabled=!hasOverflow||rail.scrollLeft<=4;
    nextButton.disabled=!hasOverflow||(rail.scrollLeft+rail.clientWidth>=rail.scrollWidth-4);
  }

  function addScrollButton(direction,label,modifier){
    var existing=section.querySelector(".vel-home-section__scroll-btn--"+modifier);
    if(existing)return existing;
    var button=document.createElement("button");
    button.type="button";
    button.className="vel-home-section__scroll-btn vel-home-section__scroll-btn--"+modifier;
    button.setAttribute("aria-label",label);
    button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
    if(direction>0)button.querySelector("svg").style.transform="rotate(180deg)";
    button.addEventListener("click",function(e){
      e.stopPropagation();
      rail.scrollBy({left:direction*Math.max(280,rail.clientWidth*.82),behavior:"smooth"});
    });
    section.appendChild(button);
    return button;
  }

  if(!previousButton) previousButton=addScrollButton(-1,"Faire défiler vers la gauche","prev");
  if(!nextButton) nextButton=addScrollButton(1,"Faire défiler vers la droite","next");

  rail.addEventListener("scroll",updateScrollButtons,{passive:true});
  section.addEventListener("mouseenter",updateScrollButtons,{passive:true});
  if(typeof ResizeObserver!=="undefined")new ResizeObserver(updateScrollButtons).observe(rail);

  // Re-check scroll buttons after initial layout & images load
  [0, 100, 300, 800, 1500].forEach(function(delay){
    window.setTimeout(updateScrollButtons, delay);
  });

  rail.addEventListener("pointerdown",function(event){
    if(event.pointerType!=="mouse"||event.button!==0||event.buttons!==1)return;
    drag={id:event.pointerId,x:event.clientX,left:rail.scrollLeft,moved:false};
  });
  rail.addEventListener("pointermove",function(event){
    if(!drag||drag.id!==event.pointerId||event.buttons!==1){
      if(drag){
        drag=null;
        rail.classList.remove("is-dragging");
      }
      return;
    }
    var delta=event.clientX-drag.x;
    if(!drag.moved&&Math.abs(delta)<8)return;
    if(!drag.moved){
      drag.moved=true;
      try{rail.setPointerCapture(event.pointerId)}catch(error){}
      rail.classList.add("is-dragging");
    }
    rail.scrollLeft=drag.left-delta;
    event.preventDefault();
  });
  function finish(event){
    if(!drag)return;
    blockClick=drag.moved;
    drag=null;
    rail.classList.remove("is-dragging");
    window.setTimeout(function(){blockClick=false},50);
  }
  rail.addEventListener("pointerup",finish);
  rail.addEventListener("pointercancel",finish);
  rail.addEventListener("lostpointercapture",finish);
  window.addEventListener("pointerup",finish);
  window.addEventListener("blur",finish);
  rail.addEventListener("click",function(event){
    if(!blockClick)return;
    event.preventDefault();
    event.stopImmediatePropagation();
  },true);
}

function bindAllRails(root){
  (root||document).querySelectorAll(".vel-home-section__rail").forEach(bindRailDrag);
}

function startRailObserver(){
  bindAllRails(document);
  if(typeof MutationObserver!=="undefined"){
    var observer=new MutationObserver(function(){
      bindAllRails(document);
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }
  document.addEventListener("velora-home-country-rendered",function(){bindAllRails(document);});
  document.addEventListener("velora-watch-history-updated",function(){bindAllRails(document);});
  window.addEventListener("resize",function(){
    document.querySelectorAll(".vel-home-section__rail").forEach(function(r){
      r.dispatchEvent(new Event("scroll"));
    });
  },{passive:true});
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",startRailObserver,{once:true});
else startRailObserver();
})();

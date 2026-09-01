(function(){"use strict";var base="/api/velora-db/rest/v1",state={sections:[],packages:[],orders:[],countries:[],visibleCountryNames:new Set(),homeCache:null};
var defaultChannelHiddenFilters=["HEVC","H265","H.265","H 265","x265"],homePrefixes=[],homeSuffixes=[],homeHiddenFilters=defaultChannelHiddenFilters.slice();
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
function stripChannelPrefixes(value){var original=String(value||"").trim(),name=original;for(var pass=0;pass<32;pass+=1){var prefix=homePrefixes.find(function(candidate){return candidate.length<=name.length&&name.slice(0,candidate.length).toLowerCase()===candidate.toLowerCase()});if(!prefix)break;name=name.slice(prefix.length).trim();name=name.replace(/^[-:|•\s]+/g,"").trim()}for(var pass=0;pass<32;pass+=1){var suffix=homeSuffixes.find(function(candidate){return candidate.length<=name.length&&name.slice(-candidate.length).toLowerCase()===candidate.toLowerCase()});if(!suffix)break;name=name.slice(0,-suffix.length).trim();name=name.replace(/[-:|•\s]+$/g,"").trim()}for(var p=0;p<5;p+=1){var next=name.replace(/^[\[\(][A-Z0-9\+\-\s]{1,12}[\]\)]\s*[-:|•]?\s*/i,"").replace(/^([0-9]+K|[0-9]+D|HD|FHD|UHD|4K|VF|VOSTFR|VO|FR|AR|EN|UK|US|ES|DE|IT|PT|TR|NL|RU|PL|RO|MULTI|TRUEFRENCH|FRENCH)(\s*[-:|•]\s*|\s+)/i,"").replace(/\s*([\[\(][A-Z0-9\+\-\s]{1,12}[\]\)]|\b(HD|FHD|UHD|4K|VF|VOSTFR|VO|FR|AR|EN|UK|US|ES|DE|IT|PT|TR|NL|RU|PL|RO|MULTI|TRUEFRENCH|FRENCH)\b)$/i,"").replace(/\s*[-:|•]\s*$/g,"").trim();if(next===name||!next)break;name=next}return name||original}
function channelNameIsHidden(value){var name=normalizeChannelRuleValue(value);return homeHiddenFilters.some(function(filter){var normalized=normalizeChannelRuleValue(filter);return normalized.startsWith("suffix:")?name.endsWith(normalized.slice(7).trim()):name.includes(normalized)})}
function applyHomeChannelRules(section,entries){var rows=Array.isArray(entries)?entries:[];if(!section)return rows;return rows.map(function(entry){var rawName=String(entry&&entry._veloraHomeRawName||entry&&entry.name||"").trim();if(!rawName)return null;if(section.content_type==="live"&&channelNameIsHidden(rawName))return null;return Object.assign({},entry,{name:stripChannelPrefixes(rawName),_veloraHomeRawName:rawName})}).filter(function(entry){return entry&&entry.name})}
function applyRulesToHomePayload(payload){if(payload&&Array.isArray(payload.sections))payload.sections.forEach(function(section){section.entries=applyHomeChannelRules(section,section.entries)});return payload}
window.veloraApplyHomeChannelRules=applyHomeChannelRules;
async function loadChannelNameRules(){var results=await Promise.all([req("/admin_channel_name_prefixes?select=prefix,sort_order&order=sort_order.asc,prefix.desc").catch(function(){return[]}),req("/admin_channel_name_suffixes?select=suffix,sort_order&order=sort_order.asc,suffix.desc").catch(function(){return[]}),req("/admin_hidden_filters?select=needle&order=needle.asc").catch(function(){return[]})]);homePrefixes=[...new Set((Array.isArray(results[0])?results[0]:[]).map(function(row){return String(row.prefix||"").trim()}).filter(Boolean))].sort(function(left,right){return right.length-left.length});homeSuffixes=[...new Set((Array.isArray(results[1])?results[1]:[]).map(function(row){return String(row.suffix||"").trim()}).filter(Boolean))].sort(function(left,right){return right.length-left.length});homeHiddenFilters=[...new Set(defaultChannelHiddenFilters.concat((Array.isArray(results[2])?results[2]:[]).map(function(row){return String(row.needle||"").trim()}).filter(Boolean)))].sort(function(left,right){return right.length-left.length})}
function getRowCountryIds(row){if(!row)return["default"];if(Array.isArray(row.country_ids)&&row.country_ids.length)return row.country_ids;if(!row.country_id||row.country_id==="default")return["default"];return String(row.country_id).split(",").map(function(s){return s.trim()}).filter(Boolean)}
function sectionMatchesCountry(row,active){if(!row||!active)return false;var ids=getRowCountryIds(row);if(ids.includes("default")||ids.includes("all"))return true;if(ids.includes(String(active.id||"")))return true;var configured=state.countries.filter(function(c){return ids.includes(String(c.id))});return configured.some(function(c){return countryKey(c.name)===countryKey(active.name)})}
function homeImageUrl(value,forceProxy){var url=String(value||"").trim();if(!url)return "";if(/^\/api\/proxy\/image\?/i.test(url))return url;var absolute=url;if(/^\/\//.test(url))absolute=location.protocol+url;else if(!/^https?:\/\//i.test(url))return url;return forceProxy||location.protocol==="https:"&&/^http:\/\//i.test(absolute)?"/api/proxy/image?url="+encodeURIComponent(absolute):absolute}
window.veloraSetHomeImageSource=window.veloraSetHomeImageSource||function(image,value,onFailure){var direct=homeImageUrl(value,false),proxied=homeImageUrl(value,true),retried=false;function failed(){if(!retried&&proxied&&proxied!==direct){retried=true;image.src=proxied;return}image.removeEventListener("error",failed);if(typeof onFailure==="function")onFailure()}image.addEventListener("error",failed);image.src=direct};
function warmHomeMovie(){return Promise.resolve()}
function prewarmHomeMovies(sections){var entries=[];(sections||[]).forEach(function(section){if(section.content_type==="movies"&&Array.isArray(section.entries))entries.push.apply(entries,section.entries)});entries=entries.slice(0,10);window.setTimeout(async function(){for(var i=0;i<entries.length;i+=2)await Promise.all(entries.slice(i,i+2).map(warmHomeMovie))},350)}
function visibilityKey(value){return String(value??"").trim().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/g," ").trim()}
function getCountryLogoUrl(countryId,countryName){var normKey=String(countryName||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");if(window.__veloraCountryLogosByName&&window.__veloraCountryLogosByName[normKey]){return window.__veloraCountryLogosByName[normKey]}if(typeof window.__veloraCountryFlagUrl==="function"){var flag=window.__veloraCountryFlagUrl(countryName);if(flag)return flag}var codeMap={france:"fr",angleterre:"gb",etats_unis:"us",usa:"us",canada:"ca",espagne:"es",italie:"it",allemagne:"de",portugal:"pt",belgique:"be",suisse:"ch",algerie:"dz",maroc:"ma",tunisie:"tn",turquie:"tr",pays_bas:"nl",roumanie:"ro",russie:"ru",pologne:"pl",bresil:"br",mexique:"mx",argentine:"ar",egypte:"eg",arabie_saoudite:"sa",emirats_arabes_unis:"ae",inde:"in",chine:"cn",japon:"jp",coree_du_sud:"kr",suede:"se",norvege:"no",danemark:"dk",finlande:"fi",grece:"gr",autriche:"at",afrique_du_sud:"za",albanie:"al",armenie:"am",australie:"au",azerbaidjan:"az",bahrein:"bh",bangladesh:"bd",bolivie:"bo",bosnie:"ba",bulgarie:"bg",chili:"cl",chypre:"cy",colombie:"co",costa_rica:"cr",croatie:"hr",cuba:"cu",equateur:"ec",estonie:"ee",georgie:"ge",guatemala:"gt",honduras:"hn",hong_kong:"hk",hongrie:"hu",indonesie:"id",irak:"iq",iran:"ir",irlande:"ie",islande:"is",israel:"il",jordanie:"jo",kazakhstan:"kz",koweit:"kw",laos:"la",lettonie:"lv",liban:"lb",libye:"ly",lituanie:"lt",malaisie:"my",mali:"ml",malte:"mt",maurice:"mu",mauritanie:"mr",monaco:"mc",montenegro:"me",namibie:"na",nepal:"np",nicaragua:"ni",nigeria:"ng",nouvelle_zelande:"nz",oman:"om",ouzbekistan:"uz",pakistan:"pk",palestine:"ps",panama:"pa",paraguay:"py",perou:"pe",philippines:"ph",qatar:"qa",republique_dominicaine:"do",republique_tcheque:"cz",senegal:"sn",serbie:"rs",slovenie:"si",somalie:"so",soudan:"sd",sri_lanka:"lk",suriname:"sr",syrie:"sy",thailande:"th",ukraine:"ua",uruguay:"uy",venezuela:"ve",vietnam:"vn",yemen:"ye"};var cCode=codeMap[normKey];return cCode?"https://flagcdn.com/w40/"+cCode+".png":""}
function fillCountries(){var listWrap=document.getElementById("home-section-countries-list"),filterSelect=document.getElementById("home-section-filter-country"),visibleOnlyCheckbox=document.getElementById("home-section-country-visible-only"),visibleOnly=visibleOnlyCheckbox?visibleOnlyCheckbox.checked:true;var visibleSet=window.__veloraVisibleCountries||state.visibleCountryKeys||new Set();var list=state.countries.slice();if(visibleOnly&&visibleSet&&visibleSet.size>0){list=list.filter(function(country){var key=visibilityKey(country.name);return visibleSet.has(key)})}list.sort(function(a,b){return String(a.name).localeCompare(String(b.name),"fr")});if(listWrap){var previousChecked=new Set();listWrap.querySelectorAll("input[type='checkbox']:checked").forEach(function(cb){previousChecked.add(cb.value)});listWrap.replaceChildren();list.forEach(function(country){var lbl=document.createElement("label");lbl.className="vel-home-country-checkbox-item";var cb=document.createElement("input");cb.type="checkbox";cb.value=country.id;cb.dataset.countryName=country.name;if(previousChecked.has(country.id))cb.checked=true;var flagUrl=getCountryLogoUrl(country.id,country.name);if(flagUrl){var flagImg=document.createElement("img");flagImg.className="vel-home-country-flag";flagImg.src=flagUrl;flagImg.alt="";flagImg.loading="lazy";flagImg.onerror=function(){flagImg.style.display="none"};lbl.append(cb,flagImg)}else{lbl.append(cb)}var span=document.createElement("span");span.textContent=country.name;lbl.appendChild(span);listWrap.appendChild(lbl)})}if(filterSelect){var curFilter=filterSelect.value||"default";filterSelect.replaceChildren();var defaultOpt=document.createElement("option");defaultOpt.value="default";defaultOpt.textContent="\ud83c\udf10 Accueil par d\u00e9faut";var allOpt=document.createElement("option");allOpt.value="all";allOpt.textContent="\ud83c\udf0d Toutes les sections";filterSelect.append(defaultOpt,allOpt);if(list.length>0){var optGroup=document.createElement("optgroup");optGroup.label=visibleOnly?"\ud83d\udccd Pays activ\u00e9s ("+list.length+")":"\ud83d\udccd Tous les pays ("+list.length+")";list.forEach(function(country){var opt=document.createElement("option");opt.value=country.id;opt.textContent=country.name;optGroup.appendChild(opt)});filterSelect.appendChild(optGroup)}if(Array.from(filterSelect.options).some(function(o){return o.value===curFilter}))filterSelect.value=curFilter;else filterSelect.value="default"}}
function fillPackages(){var type=document.getElementById("home-section-type"),filterSelect=document.getElementById("home-section-filter-country"),select=document.getElementById("home-section-package"),search=document.getElementById("home-section-package-search"),count=document.getElementById("home-section-package-count");if(!type||!select)return;var currentVal=select.value,filterVal=filterSelect?filterSelect.value:"default",typeVal=type.value||"movies",q=search?String(search.value||"").trim().toLowerCase():"";select.replaceChildren();var emptyOpt=document.createElement("option");emptyOpt.value="";emptyOpt.textContent="\u2728 Section vide personnalis\u00e9e (sans package li\u00e9)";select.appendChild(emptyOpt);var isSpecificCountry=filterVal&&filterVal!=="all"&&filterVal!=="default";var ids=new Set();if(isSpecificCountry){state.orders.filter(function(r){var tabMatch=r.ui_tab===typeVal||(typeVal==="movies"&&(r.ui_tab==="vod"||r.ui_tab==="movies"));return tabMatch&&String(r.country_id)===filterVal}).forEach(function(r){(r.package_order||[]).forEach(function(id){ids.add(String(id))})})}var candidates=state.packages.filter(function(p){if(p.is_hidden===true||p.is_hidden==="true")return false;var pKind=String(p.kind||"").toLowerCase();if(typeVal==="movies"&&pKind&&pKind!=="movies"&&pKind!=="vod")return false;if(typeVal==="series"&&pKind&&pKind!=="series")return false;if(isSpecificCountry){if(ids.size>0)return ids.has(String(p.id));if(String(p.country_id)===filterVal)return true;return false}return true});if(q){candidates=candidates.filter(function(p){return String(p.name||"").toLowerCase().includes(q)})}candidates.sort(function(a,b){return String(a.name).localeCompare(String(b.name),"fr")});if(count)count.textContent=candidates.length+" package(s) dispo";candidates.forEach(function(p){var o=document.createElement("option");o.value=p.id;o.textContent=p.name;select.appendChild(o)});if(currentVal&&candidates.some(function(p){return String(p.id)===String(currentVal)})){select.value=currentVal}}
async function move(row,direction){var filterSelect=document.getElementById("home-section-filter-country"),selected=filterSelect?(filterSelect.value||"default"):"default";var rows=state.sections.filter(function(r){var ids=getRowCountryIds(r);if(selected==="all")return true;if(selected==="default")return ids.includes("default");return ids.includes(selected)}).sort(function(a,b){return(a.section_order||0)-(b.section_order||0)}),i=rows.findIndex(function(r){return r.id===row.id}),j=i+direction;if(i<0||j<0||j>=rows.length)return;await Promise.all([req("/admin_home_sections?id=eq."+encodeURIComponent(rows[i].id),{method:"PATCH",body:JSON.stringify({section_order:rows[j].section_order})}),req("/admin_home_sections?id=eq."+encodeURIComponent(rows[j].id),{method:"PATCH",body:JSON.stringify({section_order:rows[i].section_order})})]);await load()}
function control(text,title,fn){var b=document.createElement("button");b.type="button";b.textContent=text;b.title=title;b.addEventListener("click",fn);return b}
function updateLogoPreview(url){var preview=document.getElementById("home-section-logo-preview");if(!preview)return;var cleanUrl=String(url||"").trim();if(cleanUrl){preview.src=cleanUrl;preview.style.display="inline-block";preview.onerror=function(){preview.style.display="none"}}else{preview.removeAttribute("src");preview.style.display="none"}}
function resetEditor(){editingSectionId=null;var formTitle=document.getElementById("home-section-form-title"),title=document.getElementById("home-section-title"),type=document.getElementById("home-section-type"),orientation=document.getElementById("home-section-card-orientation"),logo=document.getElementById("home-section-logo-url"),search=document.getElementById("home-section-package-search"),select=document.getElementById("home-section-package"),published=document.getElementById("home-section-published"),add=document.getElementById("home-section-add"),cancel=document.getElementById("home-section-cancel"),defaultCountry=document.getElementById("home-section-country-default"),listWrap=document.getElementById("home-section-countries-list");if(formTitle)formTitle.textContent="Ajouter une section";if(title)title.value="";if(type&&type.value!=="movies"&&type.value!=="series")type.value="movies";if(orientation)orientation.value="vertical";if(logo)logo.value="";if(search)search.value="";if(select)select.value="";updateLogoPreview("");if(defaultCountry)defaultCountry.checked=true;if(listWrap)listWrap.querySelectorAll("input[type='checkbox']").forEach(function(cb){cb.checked=false});if(published)published.checked=true;if(add)add.textContent="Cr\u00e9er la section";if(cancel)cancel.hidden=true;fillPackages();renderAdmin()}
function editSection(row){var formTitle=document.getElementById("home-section-form-title"),type=document.getElementById("home-section-type"),title=document.getElementById("home-section-title"),orientation=document.getElementById("home-section-card-orientation"),logo=document.getElementById("home-section-logo-url"),search=document.getElementById("home-section-package-search"),select=document.getElementById("home-section-package"),published=document.getElementById("home-section-published"),add=document.getElementById("home-section-add"),cancel=document.getElementById("home-section-cancel"),defaultCountry=document.getElementById("home-section-country-default"),listWrap=document.getElementById("home-section-countries-list");editingSectionId=row.id;if(formTitle)formTitle.textContent="Modifier la section : \u00ab "+(row.title||"")+" \u00bb";if(type)type.value=row.content_type||"movies";if(search)search.value="";fillPackages();if(select)select.value=String(row.package_id||"");if(orientation)orientation.value=row.card_orientation||"vertical";var val=row.logo_url||row.badge_logo_url||"";if(logo)logo.value=val;updateLogoPreview(val);if(title){title.value=row.title||"";title.focus();title.scrollIntoView({behavior:"smooth",block:"center"})}var ids=getRowCountryIds(row);var isDefault=ids.includes("default");if(defaultCountry)defaultCountry.checked=isDefault;if(listWrap){listWrap.querySelectorAll("input[type='checkbox']").forEach(function(cb){cb.checked=!isDefault&&ids.includes(String(cb.value))})}if(published)published.checked=row.published!==false;if(add)add.textContent="Enregistrer les modifications";if(cancel)cancel.hidden=false;renderAdmin()}
function renderAdmin(){var wrap=document.getElementById("home-sections-admin-list"),filterSelect=document.getElementById("home-section-filter-country");if(!wrap)return;var selected=filterSelect?(filterSelect.value||"default"):"default",rows=state.sections.filter(function(row){var ids=getRowCountryIds(row);if(selected==="all")return true;if(selected==="default")return ids.includes("default");return ids.includes(selected)}).sort(function(a,b){return(a.section_order||0)-(b.section_order||0)});wrap.replaceChildren();if(!rows.length){var empty=document.createElement("p");empty.className="vel-home-sections-admin-empty";empty.textContent="Aucune section configur\u00e9e pour ce filtre.";wrap.appendChild(empty);return}rows.forEach(function(row){var item=document.createElement("div");item.className="vel-home-sections-admin-row";var label=document.createElement("div"),strong=document.createElement("strong"),small=document.createElement("small"),p=row.package_id?pkg(row.package_id):null,orientationLabel=row.card_orientation==="horizontal"?"Horizontal":"Vertical",customCount=Array.isArray(row.custom_entries)?row.custom_entries.length:0;strong.textContent=row.title;if(row.logo_url||row.badge_logo_url){var preview=document.createElement("img");preview.className="vel-home-sections-admin-logo-preview";preview.alt="Logo";preview.src=row.logo_url||row.badge_logo_url;strong.appendChild(preview)}var ids=getRowCountryIds(row),flagsSpan=document.createElement("span");flagsSpan.style.marginRight="5px";var countryNames=[];if(ids.includes("default")){countryNames.push("\ud83c\udf10 Accueil g\u00e9n\u00e9ral")}else{ids.forEach(function(cId){var c=state.countries.find(function(item){return item.id===cId});if(c){var flagUrl=getCountryLogoUrl(c.id,c.name);if(flagUrl){var flagImg=document.createElement("img");flagImg.className="vel-home-country-flag";flagImg.src=flagUrl;flagImg.alt="";flagImg.style.width="16px";flagImg.style.height="11px";flagImg.style.marginRight="4px";flagImg.style.verticalAlign="middle";flagsSpan.appendChild(flagImg)}countryNames.push(c.name)}})}var metaText=(countryNames.join(", ")||"Accueil par d\u00e9faut")+"  /  "+row.content_type+" ("+orientationLabel+")  -  "+(p?p.name:(customCount>0?"Section personnalis\u00e9e ("+customCount+" \u00e9l\u00e9ments)":"Section vide personnalis\u00e9e"));small.replaceChildren(flagsSpan,document.createTextNode(metaText));label.append(strong,small);var published=row.published!==false;item.classList.toggle("is-unpublished",!published);item.classList.toggle("is-editing",String(editingSectionId)===String(row.id));var moreWrap=document.createElement("div");moreWrap.className="vel-home-row-more";var moreTrigger=document.createElement("button");moreTrigger.type="button";moreTrigger.className="vel-home-row-more-trigger";moreTrigger.title="Options";moreTrigger.textContent="\u22ee";var moreMenu=document.createElement("div");moreMenu.className="vel-home-row-more-menu";moreMenu.hidden=true;var togglePubBtn=document.createElement("button");togglePubBtn.type="button";togglePubBtn.className="vel-home-row-more-item";togglePubBtn.textContent=published?"\ud83d\udc41\ufe0f D\u00e9publier":"\ud83d\udc41\ufe0f Publier";togglePubBtn.addEventListener("click",async function(e){e.stopPropagation();moreMenu.hidden=true;await req("/admin_home_sections?id=eq."+encodeURIComponent(row.id),{method:"PATCH",body:JSON.stringify({published:!published})});await load()});var deleteBtn=document.createElement("button");deleteBtn.type="button";deleteBtn.className="vel-home-row-more-item vel-home-row-more-item--danger";deleteBtn.textContent="\ud83d\uddd1\ufe0f Supprimer";deleteBtn.addEventListener("click",async function(e){e.stopPropagation();moreMenu.hidden=true;if(!window.confirm("Supprimer la section \u00ab "+row.title+" \u00bb ?"))return;status("Suppression de la section...");try{var deleted=await req("/admin_home_sections?id=eq."+encodeURIComponent(row.id),{method:"DELETE"});if(Array.isArray(deleted)&&deleted.length===0)throw new Error("Section introuvable");if(String(editingSectionId)===String(row.id))resetEditor();if(typeof window.veloraInvalidateHomeCache==="function")window.veloraInvalidateHomeCache();await load();status("Section supprim\u00e9e.")}catch(error){status("Impossible de supprimer la section : "+error.message,true)}});moreMenu.append(togglePubBtn,deleteBtn);moreTrigger.addEventListener("click",function(e){e.stopPropagation();document.querySelectorAll(".vel-home-row-more-menu").forEach(function(m){if(m!==moreMenu)m.hidden=true});moreMenu.hidden=!moreMenu.hidden});moreWrap.append(moreTrigger,moreMenu);item.append(label,control("Modifier","Modifier cette section",function(){editSection(row)}),control("Contenu","G\u00e9rer le contenu de cette section",function(){openSectionContentDialog(row)}),control("\u2191","Monter",function(){move(row,-1)}),control("\u2193","Descendre",function(){move(row,1)}),moreWrap);wrap.appendChild(item)})}
document.addEventListener("click",function(){document.querySelectorAll(".vel-home-row-more-menu").forEach(function(m){m.hidden=true})});
var activeContentSection=null,activeContentItems=[],activePackageCatalogItems=[];
function velNormStr(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
async function openSectionContentDialog(row){var dialog=document.getElementById("home-section-content-dialog");if(!dialog)return;activeContentSection=row;activeContentItems=[];activePackageCatalogItems=[];var titleEl=document.getElementById("home-section-content-title"),subtitleEl=document.getElementById("home-section-content-subtitle"),searchInput=document.getElementById("home-section-content-search-input"),searchResults=document.getElementById("home-section-content-search-results"),statusEl=document.getElementById("home-section-content-status");if(titleEl)titleEl.textContent=row.title||"Section Accueil";if(subtitleEl){var p=pkg(row.package_id);subtitleEl.textContent=(row.content_type==="series"?"S\u00e9ries":"Films")+" ("+(row.card_orientation==="horizontal"?"Horizontal":"Vertical")+") \u2014 Package : "+(p?p.name:row.package_id)}if(searchInput)searchInput.value="";if(searchResults){searchResults.replaceChildren();searchResults.hidden=true}if(statusEl)statusEl.textContent="Chargement des \u00e9l\u00e9ments...";dialog.showModal();try{var isHoriz=row.card_orientation==="horizontal";if(typeof window.veloraGetHomeSectionContent==="function"){window.veloraGetHomeSectionContent(row.content_type,row.package_id,isHoriz).then(function(catItems){if(Array.isArray(catItems))activePackageCatalogItems=catItems}).catch(function(e){})}if(Array.isArray(row.custom_entries)&&row.custom_entries.length>0){activeContentItems=JSON.parse(JSON.stringify(row.custom_entries))}else{var cachedSec=state.homeCache&&Array.isArray(state.homeCache.sections)?state.homeCache.sections.find(function(s){return String(s.id)===String(row.id)}):null;if(cachedSec&&Array.isArray(cachedSec.entries)&&cachedSec.entries.length>0){activeContentItems=JSON.parse(JSON.stringify(cachedSec.entries))}else if(typeof window.veloraGetHomeSectionContent==="function"){var entries=await window.veloraGetHomeSectionContent(row.content_type,row.package_id,isHoriz);activeContentItems=Array.isArray(entries)?JSON.parse(JSON.stringify(entries)):[];if(Array.isArray(entries))activePackageCatalogItems=entries}}if(statusEl)statusEl.textContent=""}catch(err){if(statusEl)statusEl.textContent="Erreur lors du chargement : "+err.message}renderContentDialogItems()}
function renderContentDialogItems(){var grid=document.getElementById("home-section-content-items"),countEl=document.getElementById("home-section-content-count");if(!grid)return;grid.replaceChildren();if(countEl)countEl.textContent=activeContentItems.length+" \u00e9l\u00e9ment(s)";if(!activeContentItems.length){var empty=document.createElement("p");empty.className="vel-home-content-dialog__empty";empty.textContent="Cette section ne contient aucun \u00e9l\u00e9ment. Utilisez la recherche ci-dessus pour en ajouter.";grid.appendChild(empty);return}var isHoriz=activeContentSection&&activeContentSection.card_orientation==="horizontal";activeContentItems.forEach(function(item,idx){var card=document.createElement("div");card.className="vel-home-content-item-card"+(isHoriz?" vel-home-content-item-card--horizontal":"");var mediaWrap=document.createElement("div");mediaWrap.className="vel-home-content-item-card__media-wrap";var img=document.createElement("img"),imgSrc=(isHoriz?(item.backdropUrl||item.backdrop||item.thumbUrl):(item.thumbUrl||item.backdropUrl))||"";img.src=imgSrc;img.alt="";img.loading="lazy";img.onerror=function(){if(imgSrc!==item.thumbUrl&&item.thumbUrl)img.src=item.thumbUrl};var delBtn=document.createElement("button");delBtn.type="button";delBtn.className="vel-home-content-item-card__delete-btn";delBtn.title="Supprimer de la section";delBtn.textContent="\u2715";delBtn.addEventListener("click",function(e){e.stopPropagation();activeContentItems.splice(idx,1);renderContentDialogItems()});mediaWrap.append(img,delBtn);var body=document.createElement("div");body.className="vel-home-content-item-card__body";var title=document.createElement("div");title.className="vel-home-content-item-card__title";title.title=item.name||item.title||"";title.textContent=item.name||item.title||"Sans titre";var controls=document.createElement("div");controls.className="vel-home-content-item-card__controls";var moveLeft=document.createElement("button");moveLeft.type="button";moveLeft.className="vel-home-content-item-card__ctrl-btn";moveLeft.title="D\u00e9placer vers la gauche";moveLeft.textContent="\u2190";moveLeft.disabled=idx===0;moveLeft.addEventListener("click",function(e){e.stopPropagation();if(idx>0){var temp=activeContentItems[idx-1];activeContentItems[idx-1]=activeContentItems[idx];activeContentItems[idx]=temp;renderContentDialogItems()}});var moveRight=document.createElement("button");moveRight.type="button";moveRight.className="vel-home-content-item-card__ctrl-btn";moveRight.title="D\u00e9placer vers la droite";moveRight.textContent="\u2192";moveRight.disabled=idx===activeContentItems.length-1;moveRight.addEventListener("click",function(e){e.stopPropagation();if(idx<activeContentItems.length-1){var temp=activeContentItems[idx+1];activeContentItems[idx+1]=activeContentItems[idx];activeContentItems[idx]=temp;renderContentDialogItems()}});controls.append(moveLeft,moveRight);body.append(title,controls);card.append(mediaWrap,body);grid.appendChild(card)})}
async function searchMediaForContentDialog(query) {
  var searchResults = document.getElementById("home-section-content-search-results"),
      statusEl = document.getElementById("home-section-content-status");
  if (!searchResults || !activeContentSection) return;
  var cleanQ = String(query || "").trim();
  if (!cleanQ) {
    searchResults.replaceChildren();
    searchResults.hidden = true;
    return;
  }
  var normQ = velNormStr(cleanQ);
  if (normQ.length < 2) {
    searchResults.replaceChildren();
    searchResults.hidden = true;
    return;
  }
  var targetKind = activeContentSection.content_type || "movies",
      isMovie = targetKind === "movies",
      isHoriz = activeContentSection.card_orientation === "horizontal";

  searchResults.hidden = false;
  searchResults.replaceChildren();
  var loadingItem = document.createElement("div");
  loadingItem.style.padding = "0.75rem";
  loadingItem.style.textAlign = "center";
  loadingItem.style.color = "#94a3b8";
  loadingItem.textContent = "\ud83d\udd0d Recherche de tous les " + (isMovie ? "films" : "s\u00e9ries") + " dans tout le catalogue...";
  searchResults.appendChild(loadingItem);

  try {
    var pool = [], seenKeys = new Set();
    function addCandidate(name, sId, sourceId, thumb, pkgId, catName, year, rating, containerExt, gId) {
      var cleanName = String(name || "").trim();
      if (!cleanName) return;
      var rawId = String(sId || cleanName.toLowerCase());
      var key = targetKind + ":" + (sourceId ? sourceId + ":" : "") + rawId + ":" + (pkgId || "");
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      pool.push({
        streamId: rawId,
        sourceId: sourceId || "",
        globalStreamId: gId || rawId,
        name: cleanName,
        cleanTitle: cleanName,
        year: year || "",
        type: isMovie ? "vod" : "series",
        thumbUrl: thumb || "",
        backdropUrl: thumb || "",
        containerExtension: containerExt || "",
        categoryName: catName || "",
        rating: rating || "",
        packageId: pkgId || activeContentSection.package_id
      });
    }

    var appState = typeof window.veloraGetState === "function" ? window.veloraGetState() : null;
    if (appState) {
      var targetMap = isMovie ? appState.vodStreamsByCat : appState.seriesStreamsByCat;
      if (targetMap && typeof targetMap.forEach === "function") {
        targetMap.forEach(function(catList, catId) {
          if (Array.isArray(catList)) {
            var pkgRow = state.packages.find(function(p) { return String(p.id) === String(catId); });
            var pkgName = pkgRow ? pkgRow.name : (catId || "");
            catList.forEach(function(it) {
              var itName = String(it.name || it.title || it.series_name || "").trim();
              if (!itName || !velNormStr(itName).includes(normQ)) return;
              var sId = it.raw_series_id || it.raw_stream_id || it.series_id || it.stream_id || it.id;
              var sIcon = it.stream_icon || it.cover || it.movie_image || it.series_image || "";
              addCandidate(itName, sId, it.nodecast_source_id || it.source_id, sIcon, catId, it.category_name || pkgName, it.year, it.rating, it.container_extension, it.nodecast_global_stream_id);
            });
          }
        });
      }
    }

    if (typeof window.veloraSearchCountryContent === "function") {
      try {
        var frontRes = await window.veloraSearchCountryContent(cleanQ);
        if (frontRes) {
          var list = isMovie ? frontRes.movies : (frontRes.series || frontRes.results);
          if (Array.isArray(list)) {
            list.forEach(function(m) {
              var it = m.item || m;
              var itName = m.label || it.name || it.title || it.series_name;
              var sId = it.raw_series_id || it.raw_stream_id || it.series_id || it.stream_id || it.id || m.id;
              var sIcon = m.thumbUrl || it.stream_icon || it.cover || it.movie_image || it.series_image || "";
              var pkgId = m.packageId || it.package_id || activeContentSection.package_id;
              addCandidate(itName, sId, it.nodecast_source_id || it.source_id, sIcon, pkgId, m.packageName || it.category_name, it.year, it.rating || it.vod_rating, it.container_extension, it.nodecast_global_stream_id || it.global_stream_id);
            });
          }
        }
      } catch (errFront) {}
    }

    if (activePackageCatalogItems && activePackageCatalogItems.length > 0) {
      activePackageCatalogItems.forEach(function(it) {
        var itName = String(it.name || it.title || it.series_name || "").trim();
        if (!itName || !velNormStr(itName).includes(normQ)) return;
        var sId = it.raw_series_id || it.raw_stream_id || it.series_id || it.stream_id || it.id;
        var sIcon = it.thumbUrl || it.stream_icon || it.cover || "";
        addCandidate(itName, sId, it.sourceId || it.source_id, sIcon, it.packageId || activeContentSection.package_id, it.categoryName, it.year, it.rating, it.containerExtension, it.globalStreamId);
      });
    }

    if (typeof window.veloraGetHomeSectionContent === "function" && Array.isArray(state.packages)) {
      var relevantPkgs = state.packages.filter(function(p) {
        if (p.is_hidden === true || p.is_hidden === "true") return false;
        var pkKind = String(p.kind || "").toLowerCase();
        if (isMovie && pkKind && pkKind !== "movies" && pkKind !== "vod") return false;
        if (!isMovie && pkKind && pkKind !== "series") return false;
        return true;
      });
      for (var i = 0; i < relevantPkgs.length; i += 6) {
        var batch = relevantPkgs.slice(i, i + 6);
        await Promise.all(batch.map(async function(p) {
          try {
            var items = await window.veloraGetHomeSectionContent(targetKind, p.id, isHoriz);
            if (Array.isArray(items)) {
              items.forEach(function(it) {
                var itName = String(it.name || it.title || it.series_name || "").trim();
                if (!itName || !velNormStr(itName).includes(normQ)) return;
                addCandidate(itName, it.streamId || it.id, it.sourceId, it.thumbUrl || it.backdropUrl, p.id, p.name, it.year, it.rating, it.containerExtension, it.globalStreamId);
              });
            }
          } catch (errPkg) {}
        }));
      }
    }

    try {
      var heroRes = await fetch("/api/velora-db/hero-slider/search-catalog?q=" + encodeURIComponent(cleanQ) + "&type=" + encodeURIComponent(isMovie ? "movie" : "series") + "&country_id=all", { cache: "no-store" });
      if (heroRes.ok) {
        var candidates = await heroRes.json();
        if (Array.isArray(candidates)) {
          candidates.forEach(function(c) {
            addCandidate(c.name || c.cleanTitle, c.streamId || c.id, c.sourceId, c.thumbUrl, activeContentSection.package_id, c.categoryName, c.year, c.rating, c.containerExtension);
          });
        }
      }
    } catch (errHero) {}

    searchResults.replaceChildren();
    if (!pool.length) {
      var noRes = document.createElement("div");
      noRes.style.padding = "0.75rem";
      noRes.style.textAlign = "center";
      noRes.style.color = "#94a3b8";
      noRes.textContent = "Aucun " + (isMovie ? "film" : "s\u00e9rie") + " trouv\u00e9 pour \u00ab " + cleanQ + " \u00bb dans le catalogue.";
      searchResults.appendChild(noRes);
      return;
    }

    pool.sort(function(a, b) {
      var aExact = velNormStr(a.name) === normQ ? 0 : (velNormStr(a.name).startsWith(normQ) ? 1 : 2),
          bExact = velNormStr(b.name) === normQ ? 0 : (velNormStr(b.name).startsWith(normQ) ? 1 : 2);
      if (aExact !== bExact) return aExact - bExact;
      return a.name.localeCompare(b.name, "fr");
    });

    pool.slice(0, 150).forEach(function(cand) {
      var itemName = cand.cleanTitle || cand.name;
      var thumb = cand.thumbUrl || cand.backdropUrl || "";
      var rowEl = document.createElement("div");
      rowEl.className = "vel-home-content-search-item";
      var img = document.createElement("img");
      img.src = thumb;
      img.alt = "";
      img.onerror = function() { img.style.display = "none"; };
      var info = document.createElement("div");
      info.className = "vel-home-content-search-item__info";
      var nameEl = document.createElement("div");
      nameEl.className = "vel-home-content-search-item__name";
      nameEl.textContent = itemName + (cand.year ? " (" + cand.year + ")" : "");
      var meta = document.createElement("div");
      meta.className = "vel-home-content-search-item__meta";
      meta.textContent = (isMovie ? "Film" : "S\u00e9rie") + (cand.categoryName ? " \u2022 " + cand.categoryName : "") + (cand.year ? " \u2022 " + cand.year : "");
      info.append(nameEl, meta);
      var addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "primary";
      addBtn.style.padding = "0.35rem 0.75rem";
      addBtn.style.fontSize = "0.8rem";
      addBtn.style.whiteSpace = "nowrap";
      addBtn.textContent = "+ Ajouter";
      addBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        var rawId = cand.streamId || crypto.randomUUID(), finalThumb = thumb;
        var newEntry = {
          id: "home-custom:" + activeContentSection.id + ":" + rawId,
          name: itemName,
          thumbUrl: finalThumb,
          backdropUrl: finalThumb,
          section_logo_url: activeContentSection.logo_url || activeContentSection.badge_logo_url || "",
          streamId: rawId,
          sourceId: cand.sourceId,
          globalStreamId: cand.globalStreamId || rawId,
          containerExtension: cand.containerExtension || "",
          contentType: targetKind,
          packageId: cand.packageId || activeContentSection.package_id
        };
        var exists = activeContentItems.some(function(it) {
          return String(it.streamId || it.id) === String(newEntry.streamId || newEntry.id) && String(it.packageId || "") === String(newEntry.packageId || "");
        });
        if (exists) {
          if (statusEl) statusEl.textContent = "\u00ab " + itemName + " \u00bb est d\u00e9j\u00e0 dans cette section.";
          return;
        }
        activeContentItems.unshift(newEntry);
        renderContentDialogItems();
        searchResults.hidden = true;
        if (statusEl) statusEl.textContent = "\u00ab " + itemName + " \u00bb ajout\u00e9 avec succ\u00e8s !";
      });
      rowEl.append(img, info, addBtn);
      searchResults.appendChild(rowEl);
    });
  } catch (err) {
    searchResults.replaceChildren();
    var errEl = document.createElement("div");
    errEl.style.padding = "0.75rem";
    errEl.style.color = "#ef4444";
    errEl.textContent = "Erreur de recherche : " + err.message;
    searchResults.appendChild(errEl);
  }
}
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

function card(section,entry){var b=document.createElement("button"),packageRow=pkg(section.package_id),countryRow=state.countries.find(function(country){return String(country.id)===String(section.country_id)}),isHorizontal=(section&&section.card_orientation==="horizontal")||(entry&&entry.card_orientation==="horizontal");b.type="button";b.className="vel-home-section__card vel-home-section__card--"+section.content_type+(isHorizontal?" vel-home-section__card--horizontal":"");var cleanTitle=stripChannelPrefixes(entry.name||"");b.setAttribute("aria-label",cleanTitle);b.dataset.packageId=String(section.package_id||entry.packageId||"");b.dataset.packageName=String(packageRow&&packageRow.name||section.title||"");b.dataset.contentType=String(section.content_type||entry.contentType||"");b.dataset.countryName=String(countryRow&&countryRow.name||"");b.dataset.mediaId=String(entry.streamId||entry.globalStreamId||entry.id||"");var media,imgUrl=isHorizontal?(entry.backdropUrl||entry.backdrop||entry.thumbUrl):(entry.thumbUrl||entry.backdropUrl||entry.backdrop);if(imgUrl){media=document.createElement("img");media.alt="";media.loading="lazy";window.veloraSetHomeImageSource(media,imgUrl,function(){media.removeAttribute("src");media.classList.add("vel-home-section__fallback")})}else{media=document.createElement("span");media.classList.add("vel-home-section__fallback");media.textContent="\u25b6"}media.classList.add("vel-home-section__media");var name=document.createElement("span");name.className="vel-home-section__name";name.textContent=cleanTitle;b.append(media,name);var logoUrl=String(section&&(section.logo_url||section.badge_logo_url)||entry&&(entry.section_logo_url||entry.logo_url)||"").trim();if(logoUrl){b.classList.add("vel-home-section__card--has-badge");var logoEl=document.createElement("img");logoEl.className="vel-home-section__badge-logo";logoEl.alt="";logoEl.loading="lazy";if(typeof window.veloraSetHomeImageSource==="function"){window.veloraSetHomeImageSource(logoEl,logoUrl,function(){logoEl.remove()})}else{logoEl.src=logoUrl;logoEl.onerror=function(){logoEl.remove()}}b.appendChild(logoEl)}if(isHorizontal&&(section.content_type==="movies"||section.content_type==="series")){veloraEnsureCardBackdrop(b,media,section,entry)}if(typeof window.veloraBindHomeCardActivation==="function")window.veloraBindHomeCardActivation(b,section,entry);if(section.content_type==="movies"){b.addEventListener("pointerenter",function(){warmHomeMovie(entry)},{once:true});b.addEventListener("focus",function(){warmHomeMovie(entry)},{once:true})}b.addEventListener("click",function(){if(typeof window.veloraOpenHomeCacheEntry==="function")window.veloraOpenHomeCacheEntry(section,entry,b)});return b}
var homeRenderVersion=0;async function renderHome(){var wrap=document.getElementById("vel-home-sections"),countrySelect=document.getElementById("country-select");if(!wrap)return;if(typeof window.veloraIsStartupCountryReady==="function"&&!window.veloraIsStartupCountryReady(countrySelect))return;var savedScrolls=new Map();wrap.querySelectorAll(".vel-home-section").forEach(function(sec){var r=sec.querySelector(".vel-home-section__rail"),heading=sec.querySelector(".vel-home-section__heading"),k=heading?heading.textContent.trim():"";if(k&&r&&Number.isFinite(r.scrollLeft)&&r.scrollLeft>0){savedScrolls.set(k,r.scrollLeft)}});var renderVersion=++homeRenderVersion,fragment=document.createDocumentFragment();if(typeof window.veloraRenderResumeSection==="function"){var resumeBlock=window.veloraRenderResumeSection();if(resumeBlock)fragment.appendChild(resumeBlock)}var source=state.homeCache&&Array.isArray(state.homeCache.sections)?state.homeCache.sections:state.sections,active=typeof window.veloraGetActiveCountry==="function"?window.veloraGetActiveCountry():{id:typeof window.veloraGetActiveCountryId==="function"?window.veloraGetActiveCountryId():"",name:""},published=source.filter(function(row){return row.published!==false}),specific=published.filter(function(row){var ids=getRowCountryIds(row);return!ids.includes("default")&&sectionMatchesCountry(row,active)}),defaults=published.filter(function(row){var ids=getRowCountryIds(row);return ids.includes("default")}),rows=(specific.length?specific:defaults).slice().sort(function(a,b){return(a.section_order||0)-(b.section_order||0)});for(var section of rows){var isHorizontal=section.card_orientation==="horizontal",block=document.createElement("section"),heading=document.createElement("h3"),rail=document.createElement("div");block.className="vel-home-section"+(isHorizontal?" vel-home-section--horizontal":"");heading.className="vel-home-section__heading";heading.textContent=section.title;rail.className="vel-home-section__rail";block.append(heading,rail);fragment.appendChild(block);for(var placeholderIndex=0;placeholderIndex<6;placeholderIndex+=1){var placeholder=document.createElement("span");placeholder.className="vel-home-section__skeleton vel-home-section__skeleton--"+section.content_type+(isHorizontal?" vel-home-section__skeleton--horizontal":"");placeholder.setAttribute("aria-hidden","true");rail.appendChild(placeholder)}
try{var entries=await verifiedEntries(section);if(!entries.length&&Array.isArray(section.entries)){var sourceCounts={};section.entries.forEach(function(entry){var source=String(entry.sourceId||"");if(source)sourceCounts[source]=(sourceCounts[source]||0)+1});var dominantSource=Object.keys(sourceCounts).sort(function(a,b){return sourceCounts[b]-sourceCounts[a]})[0];entries=section.entries.filter(function(entry){return !dominantSource||String(entry.sourceId||"")===dominantSource})}rail.replaceChildren();entries.forEach(function(entry){rail.appendChild(card(section,entry))});if(!entries.length){var empty=document.createElement("p");empty.className="vel-home-section__empty";empty.textContent="Aucun contenu disponible.";rail.appendChild(empty)}}catch(e){rail.replaceChildren();var fallbackEntries=Array.isArray(section.entries)?section.entries:[],sourceCounts={};fallbackEntries.forEach(function(entry){var source=String(entry.sourceId||"");if(source)sourceCounts[source]=(sourceCounts[source]||0)+1});var dominantSource=Object.keys(sourceCounts).sort(function(a,b){return sourceCounts[b]-sourceCounts[a]})[0];fallbackEntries.filter(function(entry){return !dominantSource||String(entry.sourceId||"")===dominantSource}).forEach(function(entry){rail.appendChild(card(section,entry))});if(!rail.children.length){var failed=document.createElement("p");failed.className="vel-home-section__empty";failed.textContent="Section indisponible.";rail.appendChild(failed)}}}if(renderVersion===homeRenderVersion){wrap.replaceChildren(fragment);wrap.querySelectorAll(".vel-home-section").forEach(function(sec){var r=sec.querySelector(".vel-home-section__rail"),heading=sec.querySelector(".vel-home-section__heading"),k=heading?heading.textContent.trim():"";if(k&&r&&savedScrolls.has(k)){r.scrollLeft=savedScrolls.get(k)}});document.dispatchEvent(new CustomEvent("velora-home-country-rendered"))}}
async function loadHomeCache(){if(typeof window.veloraLoadHomeCache==="function")state.homeCache=await window.veloraLoadHomeCache(true);else{var response=await fetch("/api/velora-db/home-cache?t="+Date.now(),{cache:"no-store"});if(!response.ok)throw new Error("HTTP "+response.status);state.homeCache=await response.json()}return applyRulesToHomePayload(state.homeCache)}
async function load(){try{var v=await Promise.all([req("/admin_home_sections?select=*&order=section_order.asc"),req("/admin_packages?select=id,country_id,name,source_id,category_id,kind,is_hidden&order=name.asc"),req("/admin_country_package_order?select=country_id,ui_tab,package_order"),req("/admin_countries?select=id,name&order=name.asc"),req("/canonical_countries?select=match_key,display_name").catch(function(){return[]}),loadHomeCache(false).catch(function(){return null})]);state.sections=v[0]||[];state.packages=v[1]||[];state.orders=v[2]||[];state.countries=v[3]||[];var canonical=Array.isArray(v[4])?v[4]:[];state.visibleCountryKeys=new Set(canonical.filter(function(x){return String(x.match_key||"").startsWith("__visible__:")}).map(function(x){return visibilityKey(x.display_name||String(x.match_key).slice(12))}));if(!window.__veloraVisibleCountries||!window.__veloraVisibleCountries.size){window.__veloraVisibleCountries=new Set(state.visibleCountryKeys)}fillCountries();fillPackages();renderAdmin();renderHome();status(state.sections.length?state.sections.length+" section(s) configur\u00e9e(s).":"Aucune section configur\u00e9e.")}catch(e){status("Impossible de charger les sections Accueil.",true)}}
async function ensurePlayerCatalog(){if(typeof window.veloraHomeCatalogReady==="function"&&window.veloraHomeCatalogReady())return;if(typeof window.veloraForceAutoconnect!=="function")throw new Error("Connexion au catalogue indisponible");window.veloraForceAutoconnect();for(var attempt=0;attempt<120;attempt+=1){if(typeof window.veloraHomeCatalogReady==="function"&&window.veloraHomeCatalogReady())return;await new Promise(function(resolve){window.setTimeout(resolve,250)})}throw new Error("Le catalogue ne s'est pas charg\u00e9 \u00e0 temps")}
function init(){var type=document.getElementById("home-section-type"),countryVisibleOnly=document.getElementById("home-section-country-visible-only"),filterCountry=document.getElementById("home-section-filter-country"),packageSelect=document.getElementById("home-section-package"),packageSearch=document.getElementById("home-section-package-search"),orientationSelect=document.getElementById("home-section-card-orientation"),logo=document.getElementById("home-section-logo-url"),logoFile=document.getElementById("home-section-logo-file"),logoUploadBtn=document.getElementById("home-section-logo-upload-btn"),add=document.getElementById("home-section-add"),rebuild=document.getElementById("home-cache-rebuild"),cacheStatus=document.getElementById("home-cache-status"),countriesAllBtn=document.getElementById("home-section-countries-all"),countriesNoneBtn=document.getElementById("home-section-countries-none"),defaultCountryCb=document.getElementById("home-section-country-default"),listWrap=document.getElementById("home-section-countries-list");var cancel=document.getElementById("home-section-cancel");if(cancel)cancel.addEventListener("click",function(){resetEditor();status("Modification annul\u00e9e.")});if(type)type.addEventListener("change",fillPackages);if(countryVisibleOnly)countryVisibleOnly.addEventListener("change",function(){fillCountries();fillPackages();renderAdmin()});if(filterCountry)filterCountry.addEventListener("change",function(){fillPackages();renderAdmin()});if(defaultCountryCb){defaultCountryCb.addEventListener("change",function(){if(defaultCountryCb.checked&&listWrap){listWrap.querySelectorAll("input[type='checkbox']").forEach(function(cb){cb.checked=false})}})}if(listWrap){listWrap.addEventListener("change",function(e){if(e.target&&e.target.type==="checkbox"){var anyChecked=Array.from(listWrap.querySelectorAll("input[type='checkbox']")).some(function(cb){return cb.checked});if(defaultCountryCb){defaultCountryCb.checked=!anyChecked}}})}if(countriesAllBtn)countriesAllBtn.addEventListener("click",function(){if(listWrap){listWrap.querySelectorAll("input[type='checkbox']").forEach(function(cb){cb.checked=true})}if(defaultCountryCb)defaultCountryCb.checked=false});if(countriesNoneBtn)countriesNoneBtn.addEventListener("click",function(){if(listWrap){listWrap.querySelectorAll("input[type='checkbox']").forEach(function(cb){cb.checked=false})}if(defaultCountryCb)defaultCountryCb.checked=true});if(packageSearch)packageSearch.addEventListener("input",function(){fillPackages()});if(packageSelect)packageSelect.addEventListener("change",function(){var title=document.getElementById("home-section-title"),option=packageSelect.options[packageSelect.selectedIndex];if(title&&option&&option.value&&(!title.value.trim()||editingSectionId==null)){title.value=String(option.textContent||"").trim()}});if(logo)logo.addEventListener("input",function(){updateLogoPreview(logo.value)});if(logoUploadBtn&&logoFile){logoUploadBtn.addEventListener("click",function(){logoFile.click()});logoFile.addEventListener("change",async function(){var file=logoFile.files&&logoFile.files[0];if(!file)return;if(file.size>5*1024*1024){status("Le fichier est trop volumineux (max 5 Mo).",true);return}logoUploadBtn.disabled=true;logoUploadBtn.textContent="\u23f3 Import...";status("T\u00e9l\u00e9versement du logo...");try{var reader=new FileReader();reader.onload=async function(e){try{var dataBase64=e.target.result;var res=await fetch("/api/velora-db/upload-section-logo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dataBase64:dataBase64,fileName:file.name})});var json=await res.json();if(!res.ok||!json.ok)throw new Error(json.error||"Erreur upload");if(logo)logo.value=json.url;updateLogoPreview(json.url);status("Logo import\u00e9 avec succ\u00e8s.")}catch(err){status("Impossible d'importer le logo : "+err.message,true)}finally{logoUploadBtn.disabled=false;logoUploadBtn.textContent="\ud83d\udcc1 Importer";logoFile.value=""}};reader.readAsDataURL(file)}catch(err){logoUploadBtn.disabled=false;logoUploadBtn.textContent="\ud83d\udcc1 Importer";status("Impossible de lire le fichier.",true)}})}var contentDialog=document.getElementById("home-section-content-dialog"),contentClose=document.getElementById("home-section-content-close"),contentCancel=document.getElementById("home-section-content-cancel-btn"),contentSave=document.getElementById("home-section-content-save-btn"),contentSearchInput=document.getElementById("home-section-content-search-input"),contentSearchBtn=document.getElementById("home-section-content-search-btn");if(contentClose)contentClose.addEventListener("click",function(){if(contentDialog)contentDialog.close()});if(contentCancel)contentCancel.addEventListener("click",function(){if(contentDialog)contentDialog.close()});if(contentSearchBtn&&contentSearchInput){contentSearchBtn.addEventListener("click",function(){searchMediaForContentDialog(contentSearchInput.value)});contentSearchInput.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();searchMediaForContentDialog(contentSearchInput.value)}});var searchDebounce=null;contentSearchInput.addEventListener("input",function(){if(searchDebounce)clearTimeout(searchDebounce);searchDebounce=setTimeout(function(){searchMediaForContentDialog(contentSearchInput.value)},320)})}if(contentSave&&contentDialog){contentSave.addEventListener("click",async function(){if(!activeContentSection)return;contentSave.disabled=true;contentSave.textContent="Enregistrement...";var statusEl=document.getElementById("home-section-content-status");if(statusEl)statusEl.textContent="Enregistrement du contenu...";try{await req("/admin_home_sections?id=eq."+encodeURIComponent(activeContentSection.id),{method:"PATCH",body:JSON.stringify({custom_entries:activeContentItems})});activeContentSection.custom_entries=activeContentItems;if(state.homeCache&&Array.isArray(state.homeCache.sections)){var cached=state.homeCache.sections.find(function(s){return String(s.id)===String(activeContentSection.id)});if(cached)cached.entries=activeContentItems.slice()}if(typeof window.veloraInvalidateHomeCache==="function")window.veloraInvalidateHomeCache();await loadHomeCache(true);renderHome();status("Contenu de la section \u00ab "+activeContentSection.title+" \u00bb enregistr\u00e9 !");contentDialog.close()}catch(err){if(statusEl)statusEl.textContent="Erreur : "+err.message}finally{contentSave.disabled=false;contentSave.textContent="Enregistrer le contenu"}})}document.getElementById("country-select")?.addEventListener("change",function(){window.setTimeout(renderHome,0)});if(rebuild)rebuild.addEventListener("click",async function(){rebuild.disabled=true;if(cacheStatus){cacheStatus.textContent="Chargement des packages et reconstruction du cache...";cacheStatus.classList.remove("error")}try{await ensurePlayerCatalog();var cachedSections=[];for(var section of state.sections){var isHoriz=section.card_orientation==="horizontal",entries=[];if(Array.isArray(section.custom_entries)&&section.custom_entries.length>0){entries=section.custom_entries.slice()}else{entries=typeof window.veloraGetHomeSectionContent==="function"?await window.veloraGetHomeSectionContent(section.content_type,section.package_id,isHoriz):[]}if(isHoriz&&Array.isArray(entries)){entries=entries.map(function(e){var key=String(e.sourceId||"")+":"+String(e.streamId||"")+":"+String(e.name||"");var cached=clientBackdropCache.get(key);var b=cached||e.backdropUrl||e.backdrop||e.thumbUrl;return Object.assign({},e,{thumbUrl:b,backdropUrl:b,section_logo_url:section.logo_url||section.badge_logo_url||""})})}cachedSections.push(Object.assign({},section,{entries:entries,card_orientation:section.card_orientation||"vertical",logo_url:section.logo_url||section.badge_logo_url||""}))}if(!cachedSections.some(function(section){return section.entries.length>0}))throw new Error("Aucun contenu charge depuis les packages");var response=await fetch("/api/velora-db/home-cache/rebuild",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({sections:cachedSections})}),result=await response.json();if(!response.ok)throw new Error(result.error||"HTTP "+response.status);if(typeof window.veloraInvalidateHomeCache==="function")window.veloraInvalidateHomeCache();await loadHomeCache(true);renderHome();if(cacheStatus)cacheStatus.textContent="Cache recree : "+result.sections+" section(s), "+result.entries+" contenu(s)."}catch(e){if(cacheStatus){cacheStatus.textContent="Impossible de reconstruire le cache Accueil : "+(e&&e.message?e.message:String(e));cacheStatus.classList.add("error")}}finally{rebuild.disabled=false}});if(add)add.addEventListener("click",async function(){var title=document.getElementById("home-section-title"),select=document.getElementById("home-section-package"),orientation=document.getElementById("home-section-card-orientation"),logo=document.getElementById("home-section-logo-url"),published=document.getElementById("home-section-published"),defaultCountry=document.getElementById("home-section-country-default"),listWrap=document.getElementById("home-section-countries-list");if(!title||!title.value.trim()){status("Veuillez saisir un nom pour la section.",true);if(title)title.focus();return}var targetCountries=[];if(defaultCountry&&defaultCountry.checked){targetCountries.push("default")}else if(listWrap){listWrap.querySelectorAll("input[type='checkbox']:checked").forEach(function(cb){if(cb.value&&!targetCountries.includes(cb.value))targetCountries.push(cb.value)})}if(!targetCountries.length)targetCountries=["default"];if(editingSectionId!=null){add.disabled=true;try{await req("/admin_home_sections?id=eq."+encodeURIComponent(editingSectionId),{method:"PATCH",body:JSON.stringify({country_id:targetCountries.join(","),country_ids:targetCountries,content_type:type.value,title:title.value.trim(),card_orientation:orientation?orientation.value:"vertical",logo_url:logo?logo.value.trim():"",package_id:select?select.value:"",published:published?published.checked:true})});resetEditor();await load();status("Section modifi\u00e9e avec succ\u00e8s !")}catch(e){status("Impossible de modifier la section : "+e.message,true)}finally{add.disabled=false}return}add.disabled=true;status("Cr\u00e9ation de la section...");try{var order=state.sections.length?Math.max.apply(null,state.sections.map(function(r){return Number(r.section_order)||0}))+1:0;await req("/admin_home_sections",{method:"POST",body:JSON.stringify({country_id:targetCountries.join(","),country_ids:targetCountries,content_type:type.value,title:title.value.trim(),card_orientation:orientation?orientation.value:"vertical",logo_url:logo?logo.value.trim():"",package_id:select?select.value:"",custom_entries:[],published:published?published.checked:true,section_order:order})});resetEditor();await load();status("Section cr\u00e9\u00e9e avec succ\u00e8s ! Cliquez sur \u00ab Contenu \u00bb pour y ajouter des films ou s\u00e9ries.")}catch(e){status("Impossible de cr\u00e9er la section : "+e.message,true)}finally{add.disabled=false}});loadHomeCache(false).then(function(){renderHome()}).catch(function(){});var adminLoaded=false,main=document.getElementById("main");function loadAdminIfVisible(){if(adminLoaded||!main||!main.classList.contains("main--velora-admin"))return;adminLoaded=true;load()}if(main){new MutationObserver(loadAdminIfVisible).observe(main,{attributes:true,attributeFilter:["class"]});loadAdminIfVisible()}}
function handleCountrySwitch(){window.setTimeout(function(){loadHomeCache(false).then(renderHome).catch(function(){})},40)}
document.getElementById("country-select")?.addEventListener("change",handleCountrySwitch);
document.getElementById("home-country-select")?.addEventListener("change",handleCountrySwitch);
document.addEventListener("velora-country-change",handleCountrySwitch);
document.addEventListener("velora-country-changed",handleCountrySwitch);
document.addEventListener("velora-country-switch",handleCountrySwitch);
function refreshHomeChannelRules(){loadChannelNameRules().then(function(){return loadHomeCache(true)}).then(renderHome).catch(function(){})}
loadChannelNameRules().then(function(){if(state.homeCache){applyRulesToHomePayload(state.homeCache);renderHome()}}).catch(function(){});
document.addEventListener("velora-channel-prefixes-changed",refreshHomeChannelRules);document.addEventListener("velora-channel-suffixes-changed",refreshHomeChannelRules);
document.addEventListener("velora-country-visibility-changed",function(){req("/canonical_countries?select=match_key,display_name").then(function(canonical){if(Array.isArray(canonical)){state.visibleCountryKeys=new Set(canonical.filter(function(x){return String(x.match_key||"").startsWith("__visible__:")}).map(function(x){return visibilityKey(x.display_name||String(x.match_key).slice(12))}));window.__veloraVisibleCountries=new Set(state.visibleCountryKeys);fillCountries();fillPackages();renderAdmin()}}).catch(function(){})});
document.addEventListener("velora-country-logos-changed",function(){fillCountries();renderAdmin()});
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

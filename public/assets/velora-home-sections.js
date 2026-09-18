(function(){"use strict";var base="/api/velora-db/rest/v1",state={sections:[],packages:[],orders:[],countries:[],visibleCountryNames:new Set(),homeCache:null};
window.veloraHomeSectionsState=state;
window.veloraGetHomeSectionByNodeOrTitle=function(sectionNode,sectionTitle){var secId=sectionNode?String(sectionNode.dataset.sectionId||sectionNode.dataset.packageId||"").trim():"";var cleanTitle=String(sectionTitle||"").trim().toLowerCase();var allSecs=[];if(state.homeCache&&Array.isArray(state.homeCache.sections)){allSecs=allSecs.concat(state.homeCache.sections)}if(Array.isArray(state.sections)){allSecs=allSecs.concat(state.sections)}if(secId){var match=allSecs.find(function(s){return String(s.id)===secId||String(s.package_id)===secId});if(match)return match}if(cleanTitle){var matchByTitle=allSecs.find(function(s){return String(s.title||"").trim().toLowerCase()===cleanTitle});if(matchByTitle)return matchByTitle}return null};
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

var clientBackdropCache = new Map();
function veloraEnsureCardBackdrop(card, media, section, entry) {
  if (!section || !entry) return;
  if (entry && (entry.has_integrated_title || entry.horizontal_thumb)) return;
  if (card && card.classList.contains("has-integrated-title")) return;
  var key = String(entry.sourceId || "") + ":" + String(entry.streamId || "") + ":" + String(entry.name || "");
  if (clientBackdropCache.has(key)) {
    var cached = clientBackdropCache.get(key);
    if (cached && media && media.tagName === "IMG" && media.src !== cached) {
      if (typeof window.veloraSetHomeImageSource === "function") {
        window.veloraSetHomeImageSource(media, cached);
      } else {
        media.src = cached;
      }
    }
    return;
  }
  var currentSrc = media && media.tagName === "IMG" ? (media.src || "") : "";
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
        if (media && media.tagName === "IMG") {
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

async function openSectionContentDialog(row){
  var dialog=document.getElementById("home-section-content-dialog");
  if(!dialog)return;
  activeContentSection=row;
  activeContentItems=[];
  activePackageCatalogItems=[];
  var titleEl=document.getElementById("home-section-content-title"),
      subtitleEl=document.getElementById("home-section-content-subtitle"),
      searchInput=document.getElementById("home-section-content-search-input"),
      searchResults=document.getElementById("home-section-content-search-results"),
      statusEl=document.getElementById("home-section-content-status"),
      enrichBtn=document.getElementById("home-section-content-enrich-btn");
  if(titleEl)titleEl.textContent=row.title||"Section Accueil";
  if(subtitleEl){
    var p=pkg(row.package_id);
    subtitleEl.textContent=(row.content_type==="series"?"Séries":"Films")+" ("+(row.card_orientation==="horizontal"?"Horizontal":"Vertical")+") — Package : "+(p?p.name:row.package_id);
  }
  if(searchInput)searchInput.value="";
  if(searchResults){searchResults.replaceChildren();searchResults.hidden=true}
  if(statusEl)statusEl.textContent="Chargement des éléments...";
  if(enrichBtn){enrichBtn.disabled=false;enrichBtn.textContent="✨ Récupérer visuels Fanart / TMDB";}
  dialog.showModal();
  try{
    var isHoriz=row.card_orientation==="horizontal";
    if(typeof window.veloraGetHomeSectionContent==="function"){
      window.veloraGetHomeSectionContent(row.content_type,row.package_id,isHoriz).then(function(catItems){
        if(Array.isArray(catItems))activePackageCatalogItems=catItems;
      }).catch(function(e){});
    }
    if(Array.isArray(row.custom_entries)&&row.custom_entries.length>0){
      activeContentItems=JSON.parse(JSON.stringify(row.custom_entries));
    }else{
      var cachedSec=state.homeCache&&Array.isArray(state.homeCache.sections)?state.homeCache.sections.find(function(s){return String(s.id)===String(row.id)}):null;
      if(cachedSec&&Array.isArray(cachedSec.entries)&&cachedSec.entries.length>0){
        activeContentItems=JSON.parse(JSON.stringify(cachedSec.entries));
      }else if(typeof window.veloraGetHomeSectionContent==="function"){
        var entries=await window.veloraGetHomeSectionContent(row.content_type,row.package_id,isHoriz);
        activeContentItems=Array.isArray(entries)?JSON.parse(JSON.stringify(entries)):[];
        if(Array.isArray(entries))activePackageCatalogItems=entries;
      }
    }
    // Match backdrops from client cache if available
    if(isHoriz&&Array.isArray(activeContentItems)){
      activeContentItems.forEach(function(item){
        if(!item||!item.name)return;
        var key=String(item.sourceId||"")+":"+String(item.streamId||"")+":"+String(item.name||"");
        if(clientBackdropCache&&clientBackdropCache.has(key)){
          var cachedBd=clientBackdropCache.get(key);
          if(cachedBd){
            item.backdropUrl=cachedBd;
            if(!item.thumbUrl)item.thumbUrl=cachedBd;
          }
        }
      });
    }
    if(statusEl)statusEl.textContent="";
  }catch(err){
    if(statusEl)statusEl.textContent="Erreur lors du chargement : "+err.message;
  }
  renderContentDialogItems();
}

function renderContentDialogItems(){
  var grid=document.getElementById("home-section-content-items"),
      countEl=document.getElementById("home-section-content-count");
  if(!grid)return;
  grid.replaceChildren();

  var isHoriz=activeContentSection&&activeContentSection.card_orientation==="horizontal";
  grid.className="vel-home-content-dialog__grid"+(isHoriz?" vel-home-content-dialog__grid--horizontal":"");

  if(countEl)countEl.textContent=activeContentItems.length+" élément(s)";

  if(!activeContentItems.length){
    var empty=document.createElement("p");
    empty.className="vel-home-content-dialog__empty";
    empty.textContent="Cette section ne contient aucun élément. Utilisez la recherche ci-dessus pour en ajouter.";
    grid.appendChild(empty);
    return;
  }

  activeContentItems.forEach(function(item,idx){
    var cleanTitle=stripChannelPrefixes(item.name||item.title||"");
    var isHorizontalThumb=Boolean(
      item.has_integrated_title ||
      item.horizontal_thumb ||
      (item.thumbUrl && String(item.thumbUrl).includes("/uploads/horizontal-thumbs/")) ||
      (item.backdropUrl && String(item.backdropUrl).includes("/uploads/horizontal-thumbs/"))
    );
    if(isHorizontalThumb){
      delete item.title_logo;
      delete item.titleLogo;
    }
    var titleLogoUrl=String(item.title_logo||item.titleLogo||"").trim();

    var card=document.createElement("div");
    card.className="vel-home-content-item-card"+(isHoriz?" vel-home-content-item-card--horizontal":"");
    if(isHorizontalThumb)card.classList.add("has-integrated-title");
    else if(titleLogoUrl&&titleLogoUrl!=="NONE")card.classList.add("has-title-logo");

    var mediaWrap=document.createElement("div");
    mediaWrap.className="vel-home-content-item-card__media-wrap";

    var img=document.createElement("img");
    img.className="vel-home-content-item-card__media";
    img.alt="";
    img.loading="lazy";

    var imgSrc=isHoriz
      ?(item.horizontal_thumb||item.backdropUrl||item.backdrop||item.thumbUrl||"")
      :(item.thumbUrl||item.backdropUrl||"");

    if(imgSrc){
      if(typeof window.veloraSetHomeImageSource==="function"){
        window.veloraSetHomeImageSource(img,imgSrc);
      }else{
        img.src=imgSrc;
      }
    }else{
      img.src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='170' fill='%23111'><rect width='300' height='170'/><text x='50%' y='50%' fill='%23555' font-family='sans-serif' font-size='14' text-anchor='middle'>Pas d'image</text></svg>";
    }

    mediaWrap.appendChild(img);

    // Front-end card overlays & dynamic visual resolution:
    if(isHoriz){
      if(!isHorizontalThumb&&titleLogoUrl&&titleLogoUrl!=="NONE"){
        var logoImg=document.createElement("img");
        logoImg.className="vel-home-section__title-logo";
        logoImg.alt=cleanTitle;
        logoImg.loading="lazy";
        function smartScale(){
          var nw=logoImg.naturalWidth,nh=logoImg.naturalHeight;
          if(nw&&nh){
            var r=nw/nh;
            if(r>=2.4)logoImg.classList.add("vel-title-logo--wide");
            else if(r<=1.45)logoImg.classList.add("vel-title-logo--tall");
            else logoImg.classList.add("vel-title-logo--standard");
          }
        }
        logoImg.onload=smartScale;
        logoImg.src=titleLogoUrl;
        if(logoImg.complete)smartScale();
        mediaWrap.appendChild(logoImg);
      }else if(!isHorizontalThumb){
        var nameOverlay=document.createElement("span");
        nameOverlay.className="vel-home-section__name";
        nameOverlay.textContent=cleanTitle;
        mediaWrap.appendChild(nameOverlay);
      }

      // Visual badge
      var badge=document.createElement("span");
      badge.className="vel-home-content-item-card__badge";
      if(isHorizontalThumb){
        badge.classList.add("vel-home-content-item-card__badge--thumb");
        badge.textContent="🖼️ Vignette";
        mediaWrap.appendChild(badge);
      }else if(titleLogoUrl&&titleLogoUrl!=="NONE"){
        badge.classList.add("vel-home-content-item-card__badge--logo");
        badge.textContent="🏷️ Logo titre";
        mediaWrap.appendChild(badge);
      }

      // Live resolution of backdrop and logo/thumb for preview cards
      if(activeContentSection&&(activeContentSection.content_type==="movies"||activeContentSection.content_type==="series")){
        veloraEnsureCardBackdrop(card,img,activeContentSection,item);
        if(!isHorizontalThumb&&!titleLogoUrl&&cleanTitle){
          var cType=activeContentSection.content_type||"movies";
          if(!window.__veloraFetchingLogos)window.__veloraFetchingLogos=new Map();
          var logoKey=cType+":"+cleanTitle.toLowerCase();
          if(!window.__veloraFetchingLogos.has(logoKey)){
            var p=fetch("/api/velora-db/title-logo?name="+encodeURIComponent(cleanTitle)+"&type="+encodeURIComponent(cType))
              .then(function(r){return r.ok?r.json():null;})
              .then(function(data){
                if(data&&data.hasHorizontalThumb&&data.thumbUrl){
                  item.horizontal_thumb=data.thumbUrl;
                  item.has_integrated_title=true;
                  item.backdropUrl=data.thumbUrl;
                  item.thumbUrl=data.thumbUrl;
                  delete item.title_logo;
                  return {type:"thumb",url:data.thumbUrl};
                }
                if(data&&data.url){
                  item.title_logo=data.url;
                  return {type:"logo",url:data.url};
                }
                return null;
              }).catch(function(){return null;});
            window.__veloraFetchingLogos.set(logoKey,p);
          }
          window.__veloraFetchingLogos.get(logoKey).then(function(res){
            if(!res)return;
            if(res.type==="thumb"&&res.url){
              card.classList.add("has-integrated-title");
              card.classList.remove("has-title-logo");
              var exLogo=mediaWrap.querySelector(".vel-home-section__title-logo");
              if(exLogo)exLogo.remove();
              var exName=mediaWrap.querySelector(".vel-home-section__name");
              if(exName)exName.remove();
              if(typeof window.veloraSetHomeImageSource==="function"){
                window.veloraSetHomeImageSource(img,res.url);
              }else{
                img.src=res.url;
              }
              var exBadge=mediaWrap.querySelector(".vel-home-content-item-card__badge");
              if(!exBadge){
                exBadge=document.createElement("span");
                mediaWrap.appendChild(exBadge);
              }
              exBadge.className="vel-home-content-item-card__badge vel-home-content-item-card__badge--thumb";
              exBadge.textContent="🖼️ Vignette";
            }else if(res.type==="logo"&&res.url){
              if(!card.classList.contains("has-integrated-title")){
                card.classList.add("has-title-logo");
                var exLogo=mediaWrap.querySelector(".vel-home-section__title-logo");
                if(!exLogo){
                  var dynLogo=document.createElement("img");
                  dynLogo.className="vel-home-section__title-logo";
                  dynLogo.alt=cleanTitle;
                  dynLogo.loading="lazy";
                  function smartScaleDyn(){
                    var nw=dynLogo.naturalWidth,nh=dynLogo.naturalHeight;
                    if(nw&&nh){
                      var r=nw/nh;
                      if(r>=2.4)dynLogo.classList.add("vel-title-logo--wide");
                      else if(r<=1.45)dynLogo.classList.add("vel-title-logo--tall");
                      else dynLogo.classList.add("vel-title-logo--standard");
                    }
                  }
                  dynLogo.onload=smartScaleDyn;
                  dynLogo.src=res.url;
                  if(dynLogo.complete)smartScaleDyn();
                  mediaWrap.appendChild(dynLogo);
                }
                var exBadge=mediaWrap.querySelector(".vel-home-content-item-card__badge");
                if(!exBadge){
                  exBadge=document.createElement("span");
                  mediaWrap.appendChild(exBadge);
                }
                exBadge.className="vel-home-content-item-card__badge vel-home-content-item-card__badge--logo";
                exBadge.textContent="🏷️ Logo titre";
              }
            }
          });
        }
      }
    }

    var delBtn=document.createElement("button");
    delBtn.type="button";
    delBtn.className="vel-home-content-item-card__delete-btn";
    delBtn.title="Supprimer de la section";
    delBtn.textContent="✕";
    delBtn.addEventListener("click",function(e){
      e.stopPropagation();
      activeContentItems.splice(idx,1);
      renderContentDialogItems();
    });
    mediaWrap.appendChild(delBtn);

    var body=document.createElement("div");
    body.className="vel-home-content-item-card__body";

    var title=document.createElement("div");
    title.className="vel-home-content-item-card__title";
    title.title=item.name||item.title||"";
    title.textContent=cleanTitle||item.name||"Sans titre";

    var controls=document.createElement("div");
    controls.className="vel-home-content-item-card__controls";

    var moveLeft=document.createElement("button");
    moveLeft.type="button";
    moveLeft.className="vel-home-content-item-card__ctrl-btn";
    moveLeft.title="Déplacer vers la gauche";
    moveLeft.textContent="←";
    moveLeft.disabled=(idx===0);
    moveLeft.addEventListener("click",function(e){
      e.stopPropagation();
      if(idx>0){
        var temp=activeContentItems[idx-1];
        activeContentItems[idx-1]=activeContentItems[idx];
        activeContentItems[idx]=temp;
        renderContentDialogItems();
      }
    });

    var replaceBtn=document.createElement("button");
    replaceBtn.type="button";
    replaceBtn.className="vel-home-content-item-card__ctrl-btn";
    replaceBtn.title="Choisir une autre image pour ce titre (Fanart.tv / TMDB)";
    replaceBtn.textContent="✏️";
    replaceBtn.addEventListener("click",function(e){
      e.stopPropagation();
      var cType=(activeContentSection&&activeContentSection.content_type)||"movies";
      window.veloraOpenCandidatePicker({
        name:cleanTitle||item.name,
        category:isHoriz?"horizontal-thumbs":"posters",
        contentType:cType,
        onApplied:function(newUrl, candidate){
          if(isHoriz || (candidate && candidate.type !== 'logo' && candidate.type !== 'poster')){
            item.horizontal_thumb=newUrl;
            item.has_integrated_title=true;
            item.backdropUrl=newUrl;
            item.thumbUrl=newUrl;
            delete item.title_logo;
            delete item.titleLogo;
          }else{
            item.thumbUrl=newUrl;
          }
          renderContentDialogItems();
        }
      });
    });

    var moveRight=document.createElement("button");
    moveRight.type="button";
    moveRight.className="vel-home-content-item-card__ctrl-btn";
    moveRight.title="Déplacer vers la droite";
    moveRight.textContent="→";
    moveRight.disabled=(idx===activeContentItems.length-1);
    moveRight.addEventListener("click",function(e){
      e.stopPropagation();
      if(idx<activeContentItems.length-1){
        var temp=activeContentItems[idx+1];
        activeContentItems[idx+1]=activeContentItems[idx];
        activeContentItems[idx]=temp;
        renderContentDialogItems();
      }
    });

    controls.append(moveLeft,replaceBtn,moveRight);
    body.append(title,controls);
    card.append(mediaWrap,body);
    grid.appendChild(card);
  });
}

async function enrichSectionContentVisuels(){
  var enrichBtn=document.getElementById("home-section-content-enrich-btn"),
      statusEl=document.getElementById("home-section-content-status");
  if(!activeContentSection||!activeContentItems.length)return;

  if(enrichBtn){
    enrichBtn.disabled=true;
    enrichBtn.textContent="⏳ Récupération en cours...";
  }
  if(statusEl){
    statusEl.textContent="Recherche des visuels Fanart / TMDB en cours...";
    statusEl.style.color="#a78bfa";
  }

  var cType=activeContentSection.content_type||"movies";
  var isHoriz=activeContentSection.card_orientation==="horizontal";
  var updatedCount=0;
  var total=activeContentItems.length;

  for(var i=0;i<total;i++){
    var item=activeContentItems[i];
    if(!item||!item.name)continue;
    var cleanTitle=stripChannelPrefixes(item.name);
    if(!cleanTitle)continue;

    var hasVisual=isHoriz?Boolean(item.horizontal_thumb||item.title_logo):Boolean(item.thumbUrl);
    if(hasVisual&&isHoriz&&item.backdropUrl&&item.backdropUrl!==item.thumbUrl){
      continue;
    }

    if(statusEl){
      statusEl.textContent="Traitement ("+(i+1)+"/"+total+") : « "+cleanTitle+" »...";
    }

    try{
      // 1. Fetch Fanart.tv horizontal thumb / title logo via API
      var res=await fetch("/api/velora-db/title-logo?name="+encodeURIComponent(cleanTitle)+"&type="+encodeURIComponent(cType));
      if(res.ok){
        var data=await res.json();
        if(data){
          if(data.hasHorizontalThumb&&data.thumbUrl){
            item.horizontal_thumb=data.thumbUrl;
            item.has_integrated_title=true;
            item.backdropUrl=data.thumbUrl;
            item.thumbUrl=data.thumbUrl;
            delete item.title_logo;
            updatedCount++;
          }else if(data.url){
            item.title_logo=data.url;
            updatedCount++;
          }
        }
      }

      // 2. Fetch TMDB backdrop if needed for horizontal cards
      if(isHoriz&&!item.horizontal_thumb&&(!item.backdropUrl||item.backdropUrl===item.thumbUrl||!String(item.backdropUrl).includes("/w1280"))){
        var bdRes=await fetch("/api/velora-db/media-backdrop?name="+encodeURIComponent(cleanTitle)+"&type="+encodeURIComponent(cType)+"&stream_id="+encodeURIComponent(item.streamId||"")+"&source_id="+encodeURIComponent(item.sourceId||""));
        if(bdRes.ok){
          var bdData=await bdRes.json();
          if(bdData&&bdData.ok&&bdData.backdropUrl){
            item.backdropUrl=bdData.backdropUrl;
            if(!item.thumbUrl)item.thumbUrl=bdData.backdropUrl;
          }
        }
      }
    }catch(err){
      console.warn("Erreur enrichissement visuel pour",cleanTitle,err);
    }

    renderContentDialogItems();
  }

  if(enrichBtn){
    enrichBtn.disabled=false;
    enrichBtn.textContent="✨ Récupérer visuels Fanart / TMDB";
  }
  if(statusEl){
    statusEl.textContent="✨ Terminé ! "+updatedCount+" visuel(s) récupéré(s) ou mis à jour. Cliquez sur « Enregistrer le contenu » pour sauvegarder.";
    statusEl.style.color="#86efac";
  }
}
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

function card(section,entry){var b=document.createElement("button"),packageRow=pkg(section.package_id),countryRow=state.countries.find(function(country){return String(country.id)===String(section.country_id)}),isHorizontal=(section&&section.card_orientation==="horizontal")||(entry&&entry.card_orientation==="horizontal");b.type="button";b.className="vel-home-section__card vel-home-section__card--"+section.content_type+(isHorizontal?" vel-home-section__card--horizontal":"");var cleanTitle=stripChannelPrefixes(entry.name||"");b.setAttribute("aria-label",cleanTitle);b.dataset.sectionId=String(section.id||"");b.dataset.packageId=String(section.package_id||entry.packageId||"");b.dataset.packageName=String(packageRow&&packageRow.name||section.title||"");b.dataset.contentType=String(section.content_type||entry.contentType||"");b.dataset.countryName=String(countryRow&&countryRow.name||"");b.dataset.mediaId=String(entry.streamId||entry.globalStreamId||entry.id||"");var media,imgUrl=isHorizontal?(entry.horizontal_thumb||entry.backdropUrl||entry.backdrop||entry.thumbUrl):(entry.thumbUrl||entry.backdropUrl||entry.backdrop);if(imgUrl){media=document.createElement("img");media.alt="";media.loading="lazy";window.veloraSetHomeImageSource(media,imgUrl,function(){media.removeAttribute("src");media.classList.add("vel-home-section__fallback")})}else{media=document.createElement("span");media.classList.add("vel-home-section__fallback");media.textContent="\u25b6"}media.classList.add("vel-home-section__media");var name=document.createElement("span");name.className="vel-home-section__name";name.textContent=cleanTitle;b.append(media,name);if(isHorizontal){var hasIntegratedTitle=Boolean(entry.has_integrated_title||entry.horizontal_thumb||(entry.thumbUrl&&String(entry.thumbUrl).includes("/uploads/horizontal-thumbs/"))||(entry.backdropUrl&&String(entry.backdropUrl).includes("/uploads/horizontal-thumbs/")));if(hasIntegratedTitle){b.classList.add("has-integrated-title");b.classList.remove("has-title-logo");var exLogo=b.querySelector(".vel-home-section__title-logo");if(exLogo)exLogo.remove();}else{var titleLogoUrl=String(entry.title_logo||entry.titleLogo||entry.logo||"").trim();function applyTitleLogo(url){if(!url||url==="NONE")return;if(b.classList.contains("has-integrated-title"))return;if(b.querySelector(".vel-home-section__title-logo"))return;b.classList.add("has-title-logo");var logoImg=document.createElement("img");logoImg.className="vel-home-section__title-logo";logoImg.alt=cleanTitle;logoImg.loading="lazy";logoImg.decoding="async";function smartScale(){var nw=logoImg.naturalWidth,nh=logoImg.naturalHeight;if(nw&&nh){var r=nw/nh;if(r>=2.4)logoImg.classList.add("vel-title-logo--wide");else if(r<=1.45)logoImg.classList.add("vel-title-logo--tall");else logoImg.classList.add("vel-title-logo--standard")}}logoImg.onload=smartScale;logoImg.onerror=function(){b.classList.remove("has-title-logo");logoImg.remove()};logoImg.src=url;if(logoImg.complete)smartScale();b.appendChild(logoImg)}if(titleLogoUrl){applyTitleLogo(titleLogoUrl)}else if(cleanTitle&&(section.content_type==="movies"||section.content_type==="series"||entry.contentType==="movies"||entry.contentType==="series")){var cType=section.content_type||entry.contentType||"movies";if(!window.__veloraFetchingLogos)window.__veloraFetchingLogos=new Map();var logoKey=cType+":"+cleanTitle.toLowerCase();if(!window.__veloraFetchingLogos.has(logoKey)){var p=fetch("/api/velora-db/title-logo?name="+encodeURIComponent(cleanTitle)+"&type="+encodeURIComponent(cType)).then(function(r){return r.ok?r.json():null}).then(function(data){if(data&&data.hasHorizontalThumb&&data.thumbUrl){entry.horizontal_thumb=data.thumbUrl;entry.has_integrated_title=true;entry.backdropUrl=data.thumbUrl;entry.thumbUrl=data.thumbUrl;delete entry.title_logo;return {type:"thumb",url:data.thumbUrl}}if(data&&data.url){entry.title_logo=data.url;return {type:"logo",url:data.url}}return null}).catch(function(){return null});window.__veloraFetchingLogos.set(logoKey,p)}window.__veloraFetchingLogos.get(logoKey).then(function(res){if(!res)return;if(res.type==="thumb"&&res.url){b.classList.add("has-integrated-title");b.classList.remove("has-title-logo");var exLogo=b.querySelector(".vel-home-section__title-logo");if(exLogo)exLogo.remove();if(media.tagName==="IMG"){if(typeof window.veloraSetHomeImageSource==="function"){window.veloraSetHomeImageSource(media,res.url)}else{media.src=res.url}}}else if(res.type==="logo"&&res.url){if(!b.classList.contains("has-integrated-title")){applyTitleLogo(res.url)}}})}}}var logoUrl=String(section&&(section.logo_url||section.badge_logo_url)||entry&&(entry.section_logo_url||entry.logo_url)||"").trim();if(logoUrl){b.classList.add("vel-home-section__card--has-badge");var logoEl=document.createElement("img");logoEl.className="vel-home-section__badge-logo";logoEl.alt="";logoEl.loading="lazy";if(typeof window.veloraSetHomeImageSource==="function"){window.veloraSetHomeImageSource(logoEl,logoUrl,function(){logoEl.remove()})}else{logoEl.src=logoUrl;logoEl.onerror=function(){logoEl.remove()}}b.appendChild(logoEl)}if(isHorizontal&&(section.content_type==="movies"||section.content_type==="series")){veloraEnsureCardBackdrop(b,media,section,entry)}if(typeof window.veloraBindHomeCardActivation==="function")window.veloraBindHomeCardActivation(b,section,entry);if(section.content_type==="movies"){b.addEventListener("pointerenter",function(){warmHomeMovie(entry)},{once:true});b.addEventListener("focus",function(){warmHomeMovie(entry)},{once:true})}b.addEventListener("click",function(){if(typeof window.veloraOpenHomeCacheEntry==="function")window.veloraOpenHomeCacheEntry(section,entry,b)});return b}
var homeRenderVersion=0;async function renderHome(){var wrap=document.getElementById("vel-home-sections"),countrySelect=document.getElementById("country-select");if(!wrap)return;if(typeof window.veloraIsStartupCountryReady==="function"&&!window.veloraIsStartupCountryReady(countrySelect))return;var savedScrolls=new Map();wrap.querySelectorAll(".vel-home-section").forEach(function(sec){var r=sec.querySelector(".vel-home-section__rail"),heading=sec.querySelector(".vel-home-section__heading"),k=heading?heading.textContent.trim():"";if(k&&r&&Number.isFinite(r.scrollLeft)&&r.scrollLeft>0){savedScrolls.set(k,r.scrollLeft)}});var renderVersion=++homeRenderVersion,fragment=document.createDocumentFragment();if(typeof window.veloraRenderResumeSection==="function"){var resumeBlock=window.veloraRenderResumeSection();if(resumeBlock)fragment.appendChild(resumeBlock)}var source=state.homeCache&&Array.isArray(state.homeCache.sections)?state.homeCache.sections:state.sections,active=typeof window.veloraGetActiveCountry==="function"?window.veloraGetActiveCountry():{id:typeof window.veloraGetActiveCountryId==="function"?window.veloraGetActiveCountryId():"",name:""},published=source.filter(function(row){return row.published!==false}),specific=published.filter(function(row){var ids=getRowCountryIds(row);return!ids.includes("default")&&sectionMatchesCountry(row,active)}),defaults=published.filter(function(row){var ids=getRowCountryIds(row);return ids.includes("default")}),rows=(specific.length?specific:defaults).slice().sort(function(a,b){return(a.section_order||0)-(b.section_order||0)});for(var section of rows){var isHorizontal=section.card_orientation==="horizontal",block=document.createElement("div"),headerSec=document.createElement("section"),tvxgSpan=document.createElement("span"),heading=document.createElement("h2"),seeMore=document.createElement("a"),railWrap=document.createElement("div"),rail=document.createElement("div");block.className="UI3iHJ vel-home-section"+(isHorizontal?" vel-home-section--horizontal":"");block.dataset.testid="navigation-carousel-wrapper";block.dataset.sectionId=String(section.id||"");block.dataset.contentType=String(section.content_type||"movies");if(section.package_id)block.dataset.packageId=String(section.package_id);headerSec.className="QHjixV vel-home-section__header";tvxgSpan.className="TvxgS1";heading.className="qwttco vel-home-section__heading";heading.style.cursor="pointer";heading.innerHTML='<span data-testid="carousel-title"><span>'+(section.title||"")+'</span></span>';seeMore.href="#";seeMore.className="toEceS vel-home-section__see-more";seeMore.dataset.testid="see-more";seeMore.setAttribute("aria-label",section.title||"");seeMore.innerHTML='<span class="IcIpJ_">Voir plus</span><svg class="_22qEau" viewBox="0 0 24 24" height="24" width="24" role="img" aria-hidden="true"><title>Link Arrow</title><path stroke="currentColor" stroke-width="2" d="M9.5 17.5l5-5-5-5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>';var openSec=(function(secObj,secBlock){return function(e){e.preventDefault();e.stopPropagation();var hasCustomEntries=Array.isArray(secObj.custom_entries)&&secObj.custom_entries.length>0;var customList=hasCustomEntries?secObj.custom_entries:null;var matchedPkg=null;if(Array.isArray(state.packages)){if(secObj.package_id){matchedPkg=state.packages.find(function(p){return String(p.id)===String(secObj.package_id)})}if(!matchedPkg&&secObj.title){var sTitle=String(secObj.title).trim().toLowerCase();matchedPkg=state.packages.find(function(p){return String(p.name||"").trim().toLowerCase()===sTitle})}}if(typeof window.veloraOpenPrimePackageModal==="function"){var effectiveKind=secObj.content_type||(matchedPkg&&matchedPkg.kind==="series"?"series":"movies");window.veloraOpenPrimePackageModal(effectiveKind,{id:secObj.package_id||(matchedPkg&&matchedPkg.id)||secObj.id||secObj.title,name:secObj.title,category_id:matchedPkg?matchedPkg.category_id:undefined,source_id:matchedPkg?matchedPkg.source_id:undefined,country_id:matchedPkg?matchedPkg.country_id:(secObj.country_id||"country_france"),customItems:customList||undefined})}else if(typeof window.veloraOpenHomeCustomSectionModal==="function"){window.veloraOpenHomeCustomSectionModal(secBlock,secObj.title,secObj.content_type,secObj.card_orientation==="horizontal")}}})(section,block);heading.addEventListener("click",openSec);seeMore.addEventListener("click",openSec);tvxgSpan.append(heading,seeMore);headerSec.appendChild(tvxgSpan);railWrap.className="vJYTdI LiEb2X UEOrk2 CHGlLt OH_E2I vel-home-section__rail-wrap";rail.className="lw1NJZ vel-home-section__rail";rail.dataset.testid="card-container-list";railWrap.appendChild(rail);block.append(headerSec,railWrap);fragment.appendChild(block);for(var placeholderIndex=0;placeholderIndex<6;placeholderIndex+=1){var placeholder=document.createElement("span");placeholder.className="vel-home-section__skeleton vel-home-section__skeleton--"+section.content_type+(isHorizontal?" vel-home-section__skeleton--horizontal":"");placeholder.setAttribute("aria-hidden","true");rail.appendChild(placeholder)}
try{var entries=await verifiedEntries(section);if(!entries.length&&Array.isArray(section.entries)){var sourceCounts={};section.entries.forEach(function(entry){var source=String(entry.sourceId||"");if(source)sourceCounts[source]=(sourceCounts[source]||0)+1});var dominantSource=Object.keys(sourceCounts).sort(function(a,b){return sourceCounts[b]-sourceCounts[a]})[0];entries=section.entries.filter(function(entry){return !dominantSource||String(entry.sourceId||"")===dominantSource})}rail.replaceChildren();entries.forEach(function(entry){rail.appendChild(card(section,entry))});if(!entries.length){var empty=document.createElement("p");empty.className="vel-home-section__empty";empty.textContent="Aucun contenu disponible.";rail.appendChild(empty)}}catch(e){rail.replaceChildren();var fallbackEntries=Array.isArray(section.entries)?section.entries:[],sourceCounts={};fallbackEntries.forEach(function(entry){var source=String(entry.sourceId||"");if(source)sourceCounts[source]=(sourceCounts[source]||0)+1});var dominantSource=Object.keys(sourceCounts).sort(function(a,b){return sourceCounts[b]-sourceCounts[a]})[0];fallbackEntries.filter(function(entry){return !dominantSource||String(entry.sourceId||"")===dominantSource}).forEach(function(entry){rail.appendChild(card(section,entry))});if(!rail.children.length){var failed=document.createElement("p");failed.className="vel-home-section__empty";failed.textContent="Section indisponible.";rail.appendChild(failed)}}}if(renderVersion===homeRenderVersion){wrap.replaceChildren(fragment);wrap.querySelectorAll(".vel-home-section").forEach(function(sec){var r=sec.querySelector(".vel-home-section__rail"),heading=sec.querySelector(".vel-home-section__heading"),k=heading?heading.textContent.trim():"";if(k&&r&&savedScrolls.has(k)){r.scrollLeft=savedScrolls.get(k)}});document.dispatchEvent(new CustomEvent("velora-home-country-rendered"))}}
async function loadHomeCache(){if(typeof window.veloraLoadHomeCache==="function")state.homeCache=await window.veloraLoadHomeCache(true);else{var response=await fetch("/api/velora-db/home-cache?t="+Date.now(),{cache:"no-store"});if(!response.ok)throw new Error("HTTP "+response.status);state.homeCache=await response.json()}return applyRulesToHomePayload(state.homeCache)}
async function load(){try{var v=await Promise.all([req("/admin_home_sections?select=*&order=section_order.asc"),req("/admin_packages?select=id,country_id,name,source_id,category_id,kind,is_hidden&order=name.asc"),req("/admin_country_package_order?select=country_id,ui_tab,package_order"),req("/admin_countries?select=id,name&order=name.asc"),req("/canonical_countries?select=match_key,display_name").catch(function(){return[]}),loadHomeCache(false).catch(function(){return null}),req("/admin_settings?key=eq.resume_min_watch_minutes").catch(function(){return[]})]);state.sections=v[0]||[];state.packages=v[1]||[];state.orders=v[2]||[];state.countries=v[3]||[];var canonical=Array.isArray(v[4])?v[4]:[];state.visibleCountryKeys=new Set(canonical.filter(function(x){return String(x.match_key||"").startsWith("__visible__:")}).map(function(x){return visibilityKey(x.display_name||String(x.match_key).slice(12))}));if(!window.__veloraVisibleCountries||!window.__veloraVisibleCountries.size){window.__veloraVisibleCountries=new Set(state.visibleCountryKeys)}var resumeRows=Array.isArray(v[6])?v[6]:[],minMins=3;if(resumeRows.length>0&&resumeRows[0].value!=null){var parsedMin=parseFloat(resumeRows[0].value);if(!isNaN(parsedMin)&&parsedMin>=0)minMins=parsedMin}window.__veloraResumeMinWatchMinutes=minMins;try{localStorage.setItem("velora_resume_min_watch_minutes",String(minMins))}catch(_){}var resumeInp=document.getElementById("home-resume-min-minutes");if(resumeInp)resumeInp.value=minMins;fillCountries();fillPackages();renderAdmin();renderHome();status(state.sections.length?state.sections.length+" section(s) configur\u00e9e(s).":"Aucune section configur\u00e9e.")}catch(e){status("Impossible de charger les sections Accueil.",true)}}
async function ensurePlayerCatalog(){if(typeof window.veloraHomeCatalogReady==="function"&&window.veloraHomeCatalogReady())return;if(typeof window.veloraForceAutoconnect!=="function")throw new Error("Connexion au catalogue indisponible");window.veloraForceAutoconnect();for(var attempt=0;attempt<120;attempt+=1){if(typeof window.veloraHomeCatalogReady==="function"&&window.veloraHomeCatalogReady())return;await new Promise(function(resolve){window.setTimeout(resolve,250)})}throw new Error("Le catalogue ne s'est pas charg\u00e9 \u00e0 temps")}
function init(){var type=document.getElementById("home-section-type"),countryVisibleOnly=document.getElementById("home-section-country-visible-only"),filterCountry=document.getElementById("home-section-filter-country"),packageSelect=document.getElementById("home-section-package"),packageSearch=document.getElementById("home-section-package-search"),orientationSelect=document.getElementById("home-section-card-orientation"),logo=document.getElementById("home-section-logo-url"),logoFile=document.getElementById("home-section-logo-file"),logoUploadBtn=document.getElementById("home-section-logo-upload-btn"),add=document.getElementById("home-section-add"),rebuild=document.getElementById("home-cache-rebuild"),cacheStatus=document.getElementById("home-cache-status"),countriesAllBtn=document.getElementById("home-section-countries-all"),countriesNoneBtn=document.getElementById("home-section-countries-none"),defaultCountryCb=document.getElementById("home-section-country-default"),listWrap=document.getElementById("home-section-countries-list");var cancel=document.getElementById("home-section-cancel");if(cancel)cancel.addEventListener("click",function(){resetEditor();status("Modification annul\u00e9e.")});
var resumeMinInput=document.getElementById("home-resume-min-minutes"),resumeMinSaveBtn=document.getElementById("home-resume-min-minutes-save"),resumeMinStatus=document.getElementById("home-resume-settings-status");async function saveResumeMinMinutes(){if(!resumeMinInput)return;var rawVal=parseFloat(resumeMinInput.value),val=(isNaN(rawVal)||rawVal<0)?3:rawVal;resumeMinInput.value=val;if(resumeMinSaveBtn)resumeMinSaveBtn.disabled=true;if(resumeMinStatus){resumeMinStatus.textContent="Enregistrement...";resumeMinStatus.style.color="#a78bfa"}try{await req("/admin_settings",{method:"POST",body:JSON.stringify({id:"resume_min_watch_minutes",key:"resume_min_watch_minutes",value:val})});window.__veloraResumeMinWatchMinutes=val;try{localStorage.setItem("velora_resume_min_watch_minutes",String(val))}catch(_){}if(resumeMinStatus){resumeMinStatus.textContent="Temps minimum ("+val+" min) enregistr\u00e9 avec succ\u00e8s !";resumeMinStatus.style.color="#86efac";setTimeout(function(){if(resumeMinStatus)resumeMinStatus.textContent=""},4000)}if(typeof window.veloraInjectResumeSection==="function")window.veloraInjectResumeSection();document.dispatchEvent(new CustomEvent("velora-resume-settings-changed"));document.dispatchEvent(new CustomEvent("velora-watch-history-updated"))}catch(err){if(resumeMinStatus){resumeMinStatus.textContent="Erreur : "+err.message;resumeMinStatus.style.color="#fca5a5"}}finally{if(resumeMinSaveBtn)resumeMinSaveBtn.disabled=false}}if(resumeMinSaveBtn)resumeMinSaveBtn.addEventListener("click",saveResumeMinMinutes);if(resumeMinInput){resumeMinInput.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();saveResumeMinMinutes()}})}if(type)type.addEventListener("change",fillPackages);if(countryVisibleOnly)countryVisibleOnly.addEventListener("change",function(){fillCountries();fillPackages();renderAdmin()});if(filterCountry)filterCountry.addEventListener("change",function(){fillPackages();renderAdmin()});if(defaultCountryCb){defaultCountryCb.addEventListener("change",function(){if(defaultCountryCb.checked&&listWrap){listWrap.querySelectorAll("input[type='checkbox']").forEach(function(cb){cb.checked=false})}})}if(listWrap){listWrap.addEventListener("change",function(e){if(e.target&&e.target.type==="checkbox"){var anyChecked=Array.from(listWrap.querySelectorAll("input[type='checkbox']")).some(function(cb){return cb.checked});if(defaultCountryCb){defaultCountryCb.checked=!anyChecked}}})}if(countriesAllBtn)countriesAllBtn.addEventListener("click",function(){if(listWrap){listWrap.querySelectorAll("input[type='checkbox']").forEach(function(cb){cb.checked=true})}if(defaultCountryCb)defaultCountryCb.checked=false});if(countriesNoneBtn)countriesNoneBtn.addEventListener("click",function(){if(listWrap){listWrap.querySelectorAll("input[type='checkbox']").forEach(function(cb){cb.checked=false})}if(defaultCountryCb)defaultCountryCb.checked=true});if(packageSearch)packageSearch.addEventListener("input",function(){fillPackages()});if(packageSelect)packageSelect.addEventListener("change",function(){var title=document.getElementById("home-section-title"),option=packageSelect.options[packageSelect.selectedIndex];if(title&&option&&option.value&&(!title.value.trim()||editingSectionId==null)){title.value=String(option.textContent||"").trim()}});if(logo)logo.addEventListener("input",function(){updateLogoPreview(logo.value)});if(logoUploadBtn&&logoFile){logoUploadBtn.addEventListener("click",function(){logoFile.click()});logoFile.addEventListener("change",async function(){var file=logoFile.files&&logoFile.files[0];if(!file)return;if(file.size>5*1024*1024){status("Le fichier est trop volumineux (max 5 Mo).",true);return}logoUploadBtn.disabled=true;logoUploadBtn.textContent="\u23f3 Import...";status("T\u00e9l\u00e9versement du logo...");try{var reader=new FileReader();reader.onload=async function(e){try{var dataBase64=e.target.result;var res=await fetch("/api/velora-db/upload-section-logo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dataBase64:dataBase64,fileName:file.name})});var json=await res.json();if(!res.ok||!json.ok)throw new Error(json.error||"Erreur upload");if(logo)logo.value=json.url;updateLogoPreview(json.url);status("Logo import\u00e9 avec succ\u00e8s.")}catch(err){status("Impossible d'importer le logo : "+err.message,true)}finally{logoUploadBtn.disabled=false;logoUploadBtn.textContent="\ud83d\udcc1 Importer";logoFile.value=""}};reader.readAsDataURL(file)}catch(err){logoUploadBtn.disabled=false;logoUploadBtn.textContent="\ud83d\udcc1 Importer";status("Impossible de lire le fichier.",true)}})}var contentDialog=document.getElementById("home-section-content-dialog"),contentClose=document.getElementById("home-section-content-close"),contentCancel=document.getElementById("home-section-content-cancel-btn"),contentSave=document.getElementById("home-section-content-save-btn"),contentSearchInput=document.getElementById("home-section-content-search-input"),contentSearchBtn=document.getElementById("home-section-content-search-btn");if(contentClose)contentClose.addEventListener("click",function(){if(contentDialog)contentDialog.close()});if(contentCancel)contentCancel.addEventListener("click",function(){if(contentDialog)contentDialog.close()});if(contentSearchBtn&&contentSearchInput){contentSearchBtn.addEventListener("click",function(){searchMediaForContentDialog(contentSearchInput.value)});contentSearchInput.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();searchMediaForContentDialog(contentSearchInput.value)}});var searchDebounce=null;contentSearchInput.addEventListener("input",function(){if(searchDebounce)clearTimeout(searchDebounce);searchDebounce=setTimeout(function(){searchMediaForContentDialog(contentSearchInput.value)},320)})}if(contentSave&&contentDialog){contentSave.addEventListener("click",async function(){if(!activeContentSection)return;contentSave.disabled=true;contentSave.textContent="Enregistrement...";var statusEl=document.getElementById("home-section-content-status");if(statusEl)statusEl.textContent="Enregistrement du contenu...";try{await req("/admin_home_sections?id=eq."+encodeURIComponent(activeContentSection.id),{method:"PATCH",body:JSON.stringify({custom_entries:activeContentItems})});activeContentSection.custom_entries=activeContentItems;if(state.homeCache&&Array.isArray(state.homeCache.sections)){var cached=state.homeCache.sections.find(function(s){return String(s.id)===String(activeContentSection.id)});if(cached)cached.entries=activeContentItems.slice()}if(typeof window.veloraInvalidateHomeCache==="function")window.veloraInvalidateHomeCache();await loadHomeCache(true);renderHome();status("Contenu de la section \u00ab "+activeContentSection.title+" \u00bb enregistr\u00e9 !");contentDialog.close()}catch(err){if(statusEl)statusEl.textContent="Erreur : "+err.message}finally{contentSave.disabled=false;contentSave.textContent="Enregistrer le contenu"}})}document.getElementById("country-select")?.addEventListener("change",function(){window.setTimeout(renderHome,0)});if(rebuild)rebuild.addEventListener("click",async function(){rebuild.disabled=true;if(cacheStatus){cacheStatus.textContent="Chargement des packages et reconstruction du cache...";cacheStatus.classList.remove("error")}try{await ensurePlayerCatalog();var cachedSections=[];for(var section of state.sections){var isHoriz=section.card_orientation==="horizontal",entries=[];if(Array.isArray(section.custom_entries)&&section.custom_entries.length>0){entries=section.custom_entries.slice()}else{entries=typeof window.veloraGetHomeSectionContent==="function"?await window.veloraGetHomeSectionContent(section.content_type,section.package_id,isHoriz):[]}if(isHoriz&&Array.isArray(entries)){entries=entries.map(function(e){var key=String(e.sourceId||"")+":"+String(e.streamId||"")+":"+String(e.name||"");var cached=clientBackdropCache.get(key);var b=cached||e.backdropUrl||e.backdrop||e.thumbUrl;return Object.assign({},e,{thumbUrl:b,backdropUrl:b,section_logo_url:section.logo_url||section.badge_logo_url||""})})}cachedSections.push(Object.assign({},section,{entries:entries,card_orientation:section.card_orientation||"vertical",logo_url:section.logo_url||section.badge_logo_url||""}))}if(!cachedSections.some(function(section){return section.entries.length>0}))throw new Error("Aucun contenu charge depuis les packages");var response=await fetch("/api/velora-db/home-cache/rebuild",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({sections:cachedSections})}),result=await response.json();if(!response.ok)throw new Error(result.error||"HTTP "+response.status);if(typeof window.veloraInvalidateHomeCache==="function")window.veloraInvalidateHomeCache();await loadHomeCache(true);renderHome();if(cacheStatus)cacheStatus.textContent="Cache recree : "+result.sections+" section(s), "+result.entries+" contenu(s)."}catch(e){if(cacheStatus){cacheStatus.textContent="Impossible de reconstruire le cache Accueil : "+(e&&e.message?e.message:String(e));cacheStatus.classList.add("error")}}finally{rebuild.disabled=false}});if(add)add.addEventListener("click",async function(){var title=document.getElementById("home-section-title"),select=document.getElementById("home-section-package"),orientation=document.getElementById("home-section-card-orientation"),logo=document.getElementById("home-section-logo-url"),published=document.getElementById("home-section-published"),defaultCountry=document.getElementById("home-section-country-default"),listWrap=document.getElementById("home-section-countries-list");if(!title||!title.value.trim()){status("Veuillez saisir un nom pour la section.",true);if(title)title.focus();return}var targetCountries=[];if(defaultCountry&&defaultCountry.checked){targetCountries.push("default")}else if(listWrap){listWrap.querySelectorAll("input[type='checkbox']:checked").forEach(function(cb){if(cb.value&&!targetCountries.includes(cb.value))targetCountries.push(cb.value)})}if(!targetCountries.length)targetCountries=["default"];if(editingSectionId!=null){add.disabled=true;try{await req("/admin_home_sections?id=eq."+encodeURIComponent(editingSectionId),{method:"PATCH",body:JSON.stringify({country_id:targetCountries.join(","),country_ids:targetCountries,content_type:type.value,title:title.value.trim(),card_orientation:orientation?orientation.value:"vertical",logo_url:logo?logo.value.trim():"",package_id:select?select.value:"",published:published?published.checked:true})});resetEditor();await load();status("Section modifi\u00e9e avec succ\u00e8s !")}catch(e){status("Impossible de modifier la section : "+e.message,true)}finally{add.disabled=false}return}add.disabled=true;status("Cr\u00e9ation de la section...");try{var order=state.sections.length?Math.max.apply(null,state.sections.map(function(r){return Number(r.section_order)||0}))+1:0;await req("/admin_home_sections",{method:"POST",body:JSON.stringify({country_id:targetCountries.join(","),country_ids:targetCountries,content_type:type.value,title:title.value.trim(),card_orientation:orientation?orientation.value:"vertical",logo_url:logo?logo.value.trim():"",package_id:select?select.value:"",custom_entries:[],published:published?published.checked:true,section_order:order})});resetEditor();await load();status("Section cr\u00e9\u00e9e avec succ\u00e8s ! Cliquez sur \u00ab Contenu \u00bb pour y ajouter des films ou s\u00e9ries.")}catch(e){status("Impossible de cr\u00e9er la section : "+e.message,true)}finally{add.disabled=false}});

loadHomeCache(false).then(function(){renderHome()}).catch(function(){});var adminLoaded=false,main=document.getElementById("main");function loadAdminIfVisible(){if(adminLoaded||!main||!main.classList.contains("main--velora-admin"))return;adminLoaded=true;load()}if(main){new MutationObserver(loadAdminIfVisible).observe(main,{attributes:true,attributeFilter:["class"]});loadAdminIfVisible()}}

// Global Stored Media Manager (TMDB / Fanart.tv cached files)
var storedMediaItems = [];
var activeReplaceTarget = null;

window.veloraOpenStoredMediaDialog = function() {
  var dialog = document.getElementById("home-stored-media-dialog");
  if (!dialog) return;
  if (typeof dialog.showModal === "function") {
    try {
      if (!dialog.open) dialog.showModal();
    } catch (e) {
      dialog.setAttribute("open", "");
    }
  } else {
    dialog.setAttribute("open", "");
  }
  dialog.style.display = "block";
  window.veloraLoadStoredMedia();
};

window.veloraCloseStoredMediaDialog = function() {
  var dialog = document.getElementById("home-stored-media-dialog");
  if (!dialog) return;
  if (typeof dialog.close === "function") {
    try {
      dialog.close();
    } catch (e) {
      dialog.removeAttribute("open");
    }
  } else {
    dialog.removeAttribute("open");
  }
  dialog.style.display = "none";
};

window.veloraLoadStoredMedia = async function() {
  var statusText = document.getElementById("stored-media-status-text");
  var grid = document.getElementById("stored-media-grid");
  var empty = document.getElementById("stored-media-empty");
  if (statusText) statusText.textContent = "Chargement des images stockées...";
  try {
    var res = await fetch("/api/velora-db/stored-media?t=" + Date.now());
    var json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "Erreur serveur");
    storedMediaItems = Array.isArray(json.items) ? json.items : [];
    window.veloraRenderStoredMediaGrid();
    if (statusText) {
      statusText.textContent = storedMediaItems.length
        ? storedMediaItems.length + " image(s) trouvée(s)."
        : "Aucune image stockée pour le moment.";
    }
  } catch (err) {
    if (statusText) statusText.textContent = "Erreur : " + err.message;
    if (grid) grid.replaceChildren();
    if (empty) {
      empty.style.display = "block";
      empty.textContent = "Impossible de charger les images : " + err.message;
    }
  }
};

window.veloraRenderStoredMediaGrid = function() {
  var grid = document.getElementById("stored-media-grid");
  var empty = document.getElementById("stored-media-empty");
  var searchInput = document.getElementById("stored-media-search-input");
  var categorySelect = document.getElementById("stored-media-category-select");
  var badge = document.getElementById("stored-media-count-badge");
  var statusText = document.getElementById("stored-media-status-text");
  if (!grid) return;

  grid.replaceChildren();
  var searchQ = (searchInput ? searchInput.value : "").trim().toLowerCase();
  var catFilter = categorySelect ? categorySelect.value : "all";

  var filtered = storedMediaItems.filter(function(item) {
    if (catFilter !== "all" && item.category !== catFilter) return false;
    if (searchQ) {
      var matchFn = item.filename.toLowerCase().includes(searchQ);
      var matchCat = (item.categoryLabel || "").toLowerCase().includes(searchQ);
      if (!matchFn && !matchCat) return false;
    }
    return true;
  });

  if (badge) badge.textContent = filtered.length + " / " + storedMediaItems.length + " fichier(s)";

  if (!filtered.length) {
    if (empty) {
      empty.style.display = "block";
      empty.textContent = storedMediaItems.length ? "Aucun résultat pour ce filtre." : "Aucune image stockée.";
    }
    return;
  }
  if (empty) empty.style.display = "none";

  filtered.forEach(function(item) {
    var card = document.createElement("div");
    card.className = "vel-stored-media-card";

    var preview = document.createElement("div");
    preview.className = "vel-stored-media-card__preview";

    var img = document.createElement("img");
    img.alt = item.filename;
    img.loading = "lazy";
    img.src = item.url;

    var catBadge = document.createElement("span");
    catBadge.className = "vel-stored-media-card__category-badge";
    catBadge.textContent = item.categoryLabel || item.category;

    var sizeBadge = document.createElement("span");
    sizeBadge.className = "vel-stored-media-card__size-badge";
    sizeBadge.textContent = item.sizeBytes ? (item.sizeBytes / 1024).toFixed(1) + " Ko" : "";

    preview.append(img, catBadge, sizeBadge);

    var info = document.createElement("div");
    info.className = "vel-stored-media-card__info";

    var nameEl = document.createElement("div");
    nameEl.className = "vel-stored-media-card__name";
    var cleanName = (item.title || item.name || "").trim();
    if (!cleanName) {
      cleanName = item.filename.replace(/\.[^.]+$/, '')
        .replace(/[-_]\d{10,}/g, '')
        .replace(/^slider[-_]\d+[-_]?/i, '')
        .replace(/^hero[-_]\d+[-_]?/i, '')
        .replace(/[-_]+/g, ' ')
        .trim();
      cleanName = cleanName ? (cleanName.charAt(0).toUpperCase() + cleanName.slice(1)) : item.filename;
    }
    nameEl.textContent = cleanName;
    nameEl.title = cleanName;

    var fnEl = document.createElement("div");
    fnEl.className = "vel-stored-media-card__filename";
    fnEl.textContent = item.filename;
    fnEl.title = item.filename;

    info.append(nameEl, fnEl);

    var actions = document.createElement("div");
    actions.className = "vel-stored-media-card__actions";

    var replaceBtn = document.createElement("button");
    replaceBtn.type = "button";
    replaceBtn.className = "vel-stored-media-card__btn";
    replaceBtn.innerHTML = "✏️ Remplacer";
    replaceBtn.title = "Remplacer cette image (Fanart.tv / TMDB / Fichier)";
    replaceBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      window.veloraOpenCandidatePicker(item);
    });

    var viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "vel-stored-media-card__btn";
    viewBtn.innerHTML = "👁️";
    viewBtn.title = "Ouvrir l'image en grand";
    viewBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      window.open(item.url, "_blank");
    });

    var delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "vel-stored-media-card__btn vel-stored-media-card__btn--delete";
    delBtn.innerHTML = "🗑️";
    delBtn.title = "Supprimer cette image";
    delBtn.addEventListener("click", async function(e) {
      e.stopPropagation();
      if (!confirm("Supprimer définitivement l'image « " + item.filename + " » ?")) return;
      delBtn.disabled = true;
      if (statusText) statusText.textContent = "Suppression de " + item.filename + "...";
      try {
        var res = await fetch("/api/velora-db/stored-media/item?category=" + encodeURIComponent(item.category) + "&filename=" + encodeURIComponent(item.filename), {
          method: "DELETE"
        });
        var data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "Erreur lors de la suppression");
        storedMediaItems = storedMediaItems.filter(function(x) { return x.id !== item.id; });
        window.veloraRenderStoredMediaGrid();
        if (statusText) statusText.textContent = "« " + item.filename + " » supprimée avec succès.";

        if (typeof window.veloraInvalidateHomeCache === "function") {
          window.veloraInvalidateHomeCache();
        }
        if (window.__veloraFetchingLogos) {
          window.__veloraFetchingLogos.clear();
        }
        if (typeof loadHomeCache === "function") {
          loadHomeCache(true).then(function() { if (typeof renderHome === "function") renderHome(); }).catch(function(){});
        }
      } catch (err) {
        alert("Erreur : " + err.message);
        delBtn.disabled = false;
      }
    });

    actions.append(replaceBtn, viewBtn, delBtn);
    card.append(preview, info, actions);
    grid.appendChild(card);
  });
};

// Candidate Picker for TMDB & Fanart.tv
var fetchedCandidates = [];
var activeCandidateFilter = 'all';
var activeCandidateLang = 'all';

window.veloraOpenCandidatePicker = function(item) {
  activeReplaceTarget = item;
  var dialog = document.getElementById("home-stored-media-replace-dialog");
  if (!dialog) return;

  var titleEl = document.getElementById("stored-media-replace-title");
  var searchInput = document.getElementById("stored-media-replace-search-input");
  var typeSelect = document.getElementById("stored-media-replace-type-select");
  var statusText = document.getElementById("stored-media-replace-status-text");

  var rawTitle = (item.title || item.name || '').trim();
  var fn = item.filename || '';
  var extractedTitle = rawTitle;
  var tmdbId = item.tmdbId || '';
  if (!extractedTitle) {
    var match = fn.match(/^(.*?)(?:-(\d+))?\.[a-zA-Z0-9]+$/);
    extractedTitle = match ? match[1].replace(/[-_]\d{10,}/g, '').replace(/^slider[-_]\d+[-_]?/i, '').replace(/^hero[-_]\d+[-_]?/i, '').replace(/[-_]+/g, ' ').trim() : fn;
    if (match && match[2] && match[2].length < 10) tmdbId = match[2];
  }
  if (extractedTitle) {
    extractedTitle = stripChannelPrefixes(extractedTitle);
    extractedTitle = extractedTitle.charAt(0).toUpperCase() + extractedTitle.slice(1);
  }

  if (titleEl) titleEl.innerHTML = '<span>🎨 Choisir une nouvelle image pour : <strong>' + (extractedTitle || rawTitle || fn) + '</strong></span>';
  if (searchInput) searchInput.value = extractedTitle || rawTitle || fn;
  if (typeSelect) {
    if (item.category === 'series' || item.contentType === 'series' || fn.includes('tv') || fn.includes('series')) typeSelect.value = 'tv';
    else if (item.category === 'movies' || item.contentType === 'movies' || fn.includes('movie')) typeSelect.value = 'movie';
    else typeSelect.value = 'auto';
  }
  if (statusText) statusText.textContent = "Recherche en cours sur Fanart.tv et TMDB...";

  activeCandidateFilter = 'all';
  activeCandidateLang = 'all';
  document.querySelectorAll('#stored-media-replace-type-tabs .vel-candidate-tab').forEach(function(tab) {
    tab.classList.toggle('is-active', tab.getAttribute('data-type-filter') === 'all');
  });
  var langSel = document.getElementById("stored-media-replace-lang-select");
  if (langSel) langSel.value = 'all';

  if (typeof dialog.showModal === "function") {
    try {
      if (!dialog.open) dialog.showModal();
    } catch (e) {
      dialog.setAttribute("open", "");
    }
  } else {
    dialog.setAttribute("open", "");
  }
  dialog.style.display = "block";

  window.veloraFetchCandidates(extractedTitle || rawTitle, typeSelect ? typeSelect.value : 'auto', tmdbId, item.category);
};

window.veloraCloseCandidatePicker = function() {
  var dialog = document.getElementById("home-stored-media-replace-dialog");
  if (!dialog) return;
  if (typeof dialog.close === "function") {
    try {
      dialog.close();
    } catch (e) {
      dialog.removeAttribute("open");
    }
  } else {
    dialog.removeAttribute("open");
  }
  dialog.style.display = "none";
};

window.veloraFetchCandidates = async function(title, type, tmdbId, category) {
  var grid = document.getElementById("stored-media-candidates-grid");
  var loading = document.getElementById("stored-media-candidates-loading");
  var empty = document.getElementById("stored-media-candidates-empty");
  var badge = document.getElementById("stored-media-replace-count-badge");
  var statusText = document.getElementById("stored-media-replace-status-text");

  if (grid) grid.replaceChildren();
  if (loading) loading.style.display = "block";
  if (empty) empty.style.display = "none";
  if (badge) badge.textContent = "Recherche...";

  try {
    var queryParams = new URLSearchParams();
    if (title) queryParams.set("title", title);
    if (type && type !== 'auto') queryParams.set("type", type);
    if (tmdbId) queryParams.set("tmdbId", tmdbId);
    if (category) queryParams.set("category", category);
    if (activeReplaceTarget && activeReplaceTarget.filename) queryParams.set("filename", activeReplaceTarget.filename);

    var res = await fetch("/api/velora-db/stored-media/candidates?" + queryParams.toString() + "&t=" + Date.now());
    var json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "Erreur de recherche");

    fetchedCandidates = Array.isArray(json.candidates) ? json.candidates : [];
    if (loading) loading.style.display = "none";

    window.veloraRenderCandidatesGrid();

    if (statusText) {
      statusText.textContent = fetchedCandidates.length
        ? fetchedCandidates.length + " image(s) trouvée(s) pour « " + (json.title || title) + " » (" + (json.year || 'TMDB') + "). Cliquez sur « Choisir » pour appliquer."
        : "Aucune image trouvée sur Fanart.tv / TMDB.";
    }
  } catch (err) {
    if (loading) loading.style.display = "none";
    if (empty) {
      empty.style.display = "block";
      empty.textContent = "Erreur de chargement : " + err.message;
    }
    if (statusText) statusText.textContent = "Erreur : " + err.message;
  }
};

window.veloraRenderCandidatesGrid = function() {
  var grid = document.getElementById("stored-media-candidates-grid");
  var empty = document.getElementById("stored-media-candidates-empty");
  var badge = document.getElementById("stored-media-replace-count-badge");
  if (!grid) return;

  grid.replaceChildren();

  var filtered = fetchedCandidates.filter(function(cand) {
    if (activeCandidateFilter !== 'all' && cand.type !== activeCandidateFilter) return false;
    if (activeCandidateLang !== 'all') {
      if (activeCandidateLang === 'null' && cand.lang && cand.lang !== 'null') return false;
      if (activeCandidateLang !== 'null' && cand.lang !== activeCandidateLang) return false;
    }
    return true;
  });

  if (badge) badge.textContent = filtered.length + " / " + fetchedCandidates.length + " image(s)";

  if (!filtered.length) {
    if (empty) {
      empty.style.display = "block";
      empty.textContent = fetchedCandidates.length ? "Aucun résultat pour ce filtre." : "Aucune image disponible.";
    }
    return;
  }
  if (empty) empty.style.display = "none";

  filtered.forEach(function(cand) {
    var card = document.createElement("div");
    card.className = "vel-candidate-card" + (cand.type === 'poster' ? " vel-candidate-card--poster" : "");

    var preview = document.createElement("div");
    preview.className = "vel-candidate-card__preview";

    var img = document.createElement("img");
    img.alt = cand.typeLabel || "";
    img.loading = "lazy";
    img.src = cand.previewUrl;

    var sourceBadge = document.createElement("span");
    sourceBadge.className = "vel-candidate-badge vel-candidate-badge--source " + (cand.source === 'Fanart.tv' ? "vel-candidate-badge--fanart" : "vel-candidate-badge--tmdb");
    sourceBadge.textContent = cand.source;

    var langBadge = document.createElement("span");
    langBadge.className = "vel-candidate-badge vel-candidate-badge--lang " + (cand.lang === 'fr' ? "vel-candidate-badge--lang-fr" : "");
    langBadge.textContent = cand.lang && cand.lang !== 'null' ? cand.lang.toUpperCase() : 'Sans texte';

    preview.append(img, sourceBadge, langBadge);

    var info = document.createElement("div");
    info.className = "vel-candidate-card__info";

    var typeEl = document.createElement("div");
    typeEl.className = "vel-candidate-card__type";
    typeEl.textContent = cand.typeLabel || cand.type;

    var metaEl = document.createElement("div");
    metaEl.className = "vel-candidate-card__meta";
    var dimSpan = document.createElement("span");
    dimSpan.textContent = (cand.width && cand.height) ? (cand.width + " × " + cand.height) : (cand.isTransparent ? "PNG Transparent" : "HD");
    var likesSpan = document.createElement("span");
    likesSpan.textContent = cand.likes ? ("★ " + cand.likes) : "";
    metaEl.append(dimSpan, likesSpan);

    info.append(typeEl, metaEl);

    var actions = document.createElement("div");
    actions.className = "vel-candidate-card__actions";

    var chooseBtn = document.createElement("button");
    chooseBtn.type = "button";
    chooseBtn.className = "vel-candidate-card__btn-choose";
    chooseBtn.innerHTML = "✓ Choisir";
    chooseBtn.title = "Appliquer cette image";
    chooseBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      window.veloraApplyCandidateImage(cand);
    });

    var viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "vel-candidate-card__btn-view";
    viewBtn.innerHTML = "👁️";
    viewBtn.title = "Ouvrir en grand";
    viewBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      window.open(cand.fullUrl || cand.previewUrl, "_blank");
    });

    actions.append(chooseBtn, viewBtn);
    card.append(preview, info, actions);
    grid.appendChild(card);
  });
};

window.veloraApplyCandidateImage = async function(candidate) {
  if (!candidate) return;
  var statusText = document.getElementById("stored-media-replace-status-text");
  if (statusText) statusText.textContent = "Téléchargement et application de l'image...";

  var searchInp = document.getElementById("stored-media-replace-search-input");
  var typeSel = document.getElementById("stored-media-replace-type-select");
  var currentSearchTitle = searchInp ? searchInp.value.trim() : "";
  var currentType = typeSel ? typeSel.value : "auto";

  var cat = (activeReplaceTarget && activeReplaceTarget.category) || "";
  if (!cat || cat === "movies" || cat === "series" || cat === "horizontal") {
    cat = (candidate.type === "logo") ? "title-logos" : "horizontal-thumbs";
  }

  var candidateTitle = (activeReplaceTarget && (activeReplaceTarget.name || activeReplaceTarget.title)) || currentSearchTitle || "";
  var computedFilename = (activeReplaceTarget && activeReplaceTarget.filename) || "";
  if (!computedFilename) {
    var slug = (candidateTitle || "media").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "media";
    var isPng = (candidate.fullUrl || candidate.previewUrl || "").includes(".png") || cat === "title-logos" || candidate.type === "logo";
    var idSuffix = candidate.tmdbId || Date.now();
    computedFilename = slug + "-" + idSuffix + (isPng ? ".png" : ".jpg");
  }

  try {
    var res = await fetch("/api/velora-db/stored-media/apply-candidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: cat,
        filename: computedFilename,
        title: candidateTitle,
        imageUrl: candidate.fullUrl || candidate.previewUrl,
        candidateType: candidate.type || "",
        contentType: (activeReplaceTarget && activeReplaceTarget.contentType) || currentType,
        tmdbId: candidate.tmdbId || ""
      })
    });
    var data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Erreur lors du remplacement");

    if (statusText) statusText.textContent = "Image appliquée avec succès !";
    window.veloraCloseCandidatePicker();

    var appliedUrl = data.url || candidate.fullUrl || candidate.previewUrl;
    if (activeReplaceTarget && typeof activeReplaceTarget.onApplied === "function") {
      activeReplaceTarget.onApplied(appliedUrl, candidate);
    }

    var mainStatus = document.getElementById("stored-media-status-text");
    if (mainStatus) mainStatus.textContent = "L'image a été appliquée depuis " + candidate.source + " !";

    if (typeof window.veloraInvalidateHomeCache === "function") {
      window.veloraInvalidateHomeCache();
    }
    if (window.__veloraFetchingLogos) {
      window.__veloraFetchingLogos.clear();
    }
    loadHomeCache(true).then(function() { renderHome(); }).catch(function(){});

    await window.veloraLoadStoredMedia();
  } catch (err) {
    alert("Impossible d'appliquer l'image : " + err.message);
    if (statusText) statusText.textContent = "Erreur : " + err.message;
  }
};

document.addEventListener("click", function(event) {
  var target = event.target;
  if (!target) return;
  if (target.closest("#home-section-content-enrich-btn")) {
    event.preventDefault();
    enrichSectionContentVisuels();
  } else if (target.closest("#home-stored-media-manager-btn")) {
    event.preventDefault();
    window.veloraOpenStoredMediaDialog();
  } else if (target.closest("#home-stored-media-close") || target.closest("#home-stored-media-close-footer")) {
    event.preventDefault();
    window.veloraCloseStoredMediaDialog();
  } else if (target.closest("#home-stored-media-replace-close") || target.closest("#home-stored-media-replace-close-footer")) {
    event.preventDefault();
    window.veloraCloseCandidatePicker();
  } else if (target.closest("#stored-media-refresh-btn")) {
    event.preventDefault();
    window.veloraLoadStoredMedia();
  } else if (target.closest("#stored-media-replace-search-btn")) {
    event.preventDefault();
    var searchInp = document.getElementById("stored-media-replace-search-input");
    var typeSel = document.getElementById("stored-media-replace-type-select");
    var q = searchInp ? searchInp.value.trim() : "";
    var t = typeSel ? typeSel.value : "auto";
    if (q) window.veloraFetchCandidates(q, t, "", activeReplaceTarget ? activeReplaceTarget.category : "");
  } else if (target.closest(".vel-candidate-tab")) {
    var tab = target.closest(".vel-candidate-tab");
    activeCandidateFilter = tab.getAttribute("data-type-filter") || "all";
    document.querySelectorAll('#stored-media-replace-type-tabs .vel-candidate-tab').forEach(function(tb) {
      tb.classList.toggle("is-active", tb === tab);
    });
    window.veloraRenderCandidatesGrid();
  } else if (target.closest("#stored-media-replace-local-file-btn")) {
    event.preventDefault();
    var fileReplacer = document.getElementById("stored-media-file-replacer");
    if (fileReplacer) {
      fileReplacer.value = "";
      fileReplacer.click();
    }
  } else if (target.closest("#stored-media-delete-all-btn")) {
    event.preventDefault();
    var catSelect = document.getElementById("stored-media-category-select");
    var cat = catSelect ? catSelect.value : "all";
    var catLabel = cat === "all" ? "TOUTES les images stockées" : "les images de la catégorie sélectionnée";
    if (!confirm("⚠️ ATTENTION : Voulez-vous vraiment supprimer " + catLabel + " ?\nCette action est irréversible.")) return;
    var statusText = document.getElementById("stored-media-status-text");
    if (statusText) statusText.textContent = "Suppression en masse...";
    fetch("/api/velora-db/stored-media/clear-all?category=" + encodeURIComponent(cat), { method: "DELETE" })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data || !data.ok) throw new Error(data && data.error || "Erreur suppression");
        if (statusText) statusText.textContent = (data.deletedCount || 0) + " image(s) supprimée(s).";
        window.veloraLoadStoredMedia();
        if (typeof window.veloraInvalidateHomeCache === "function") {
          window.veloraInvalidateHomeCache();
        }
        if (window.__veloraFetchingLogos) {
          window.__veloraFetchingLogos.clear();
        }
        if (typeof loadHomeCache === "function") {
          loadHomeCache(true).then(function() { if (typeof renderHome === "function") renderHome(); }).catch(function(){});
        }
      })
      .catch(function(err) {
        alert("Erreur : " + err.message);
      });
  }
});

document.addEventListener("input", function(event) {
  if (event.target && event.target.id === "stored-media-search-input") {
    window.veloraRenderStoredMediaGrid();
  }
});

document.addEventListener("keydown", function(event) {
  if (event.key === "Enter" && event.target && event.target.id === "stored-media-replace-search-input") {
    event.preventDefault();
    var searchInp = document.getElementById("stored-media-replace-search-input");
    var typeSel = document.getElementById("stored-media-replace-type-select");
    var q = searchInp ? searchInp.value.trim() : "";
    var t = typeSel ? typeSel.value : "auto";
    if (q) window.veloraFetchCandidates(q, t, "", activeReplaceTarget ? activeReplaceTarget.category : "");
  }
});

document.addEventListener("change", function(event) {
  if (event.target && event.target.id === "stored-media-category-select") {
    window.veloraRenderStoredMediaGrid();
  } else if (event.target && event.target.id === "stored-media-replace-lang-select") {
    activeCandidateLang = event.target.value || "all";
    window.veloraRenderCandidatesGrid();
  } else if (event.target && event.target.id === "stored-media-file-replacer") {
    var fileReplacer = event.target;
    var file = fileReplacer.files && fileReplacer.files[0];
    if (!file || !activeReplaceTarget) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("Fichier trop volumineux (max 10 Mo).");
      return;
    }
    var statusText = document.getElementById("stored-media-status-text");
    if (statusText) statusText.textContent = "Remplacement en cours...";
    var reader = new FileReader();
    reader.onload = async function(e) {
      try {
        var dataBase64 = e.target.result;
        var uploadFilename = (activeReplaceTarget && activeReplaceTarget.filename) || "";
        if (!uploadFilename) {
          var baseSlug = (file.name || "image").toLowerCase().replace(/[^a-z0-9.]+/g, "_");
          uploadFilename = baseSlug.includes(".") ? baseSlug : (baseSlug + ".png");
        }
        var res = await fetch("/api/velora-db/stored-media/upload-replace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: (activeReplaceTarget && activeReplaceTarget.category) || "horizontal-thumbs",
            filename: uploadFilename,
            dataBase64: dataBase64
          })
        });
        var json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Erreur remplacement");
        if (statusText) statusText.textContent = "Image remplacée avec succès !";
        window.veloraCloseCandidatePicker();
        await window.veloraLoadStoredMedia();
      } catch (err) {
        alert("Impossible de remplacer l'image : " + err.message);
      } finally {
        fileReplacer.value = "";
        activeReplaceTarget = null;
      }
    };
    reader.readAsDataURL(file);
  }
});
function handleCountrySwitch(){window.setTimeout(function(){loadHomeCache(false).then(renderHome).catch(function(){})},40)}
document.getElementById("country-select")?.addEventListener("change",handleCountrySwitch);
document.getElementById("home-country-select")?.addEventListener("change",handleCountrySwitch);
document.addEventListener("velora-country-change",handleCountrySwitch);
document.addEventListener("velora-country-changed",handleCountrySwitch);
document.addEventListener("velora-country-switch",handleCountrySwitch);
function refreshHomeChannelRules(){loadChannelNameRules().then(function(){return loadHomeCache(true)}).then(renderHome).catch(function(){})}
loadChannelNameRules().then(function(){if(state.homeCache){applyRulesToHomePayload(state.homeCache);renderHome()}}).catch(function(){});
document.addEventListener("velora-channel-prefixes-changed",refreshHomeChannelRules);document.addEventListener("velora-channel-suffixes-changed",refreshHomeChannelRules);document.addEventListener("velora-channel-hidden-filters-changed",refreshHomeChannelRules);
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

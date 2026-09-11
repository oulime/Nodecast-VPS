const fs = require('fs');
const path = require('path');

const bundlePath = path.resolve(__dirname, '../public/assets/main-JkackQV-custom-package-v7.js');
let code = fs.readFileSync(bundlePath, 'utf8');

const targetPattern = 'window.veloraOpenFavoriteItem=async(s,e)=>{';
const targetIndex = code.indexOf(targetPattern);
if (targetIndex === -1) {
  throw new Error('window.veloraOpenFavoriteItem not found');
}

const endPattern = 'window.veloraOpenCachedHomeItem=';
const endIndex = code.indexOf(endPattern, targetIndex);
if (endIndex === -1) {
  throw new Error('window.veloraOpenCachedHomeItem not found');
}

const originalFn = code.substring(targetIndex, endIndex);
console.log('Found original function length:', originalFn.length);

const newFn = `window.veloraOpenFavoriteItem=async(s,e)=>{if(!_||!s)return false;const t=o=>String(o??"").trim(),r=t(s.source_id??s.sourceId),n=t(s.item_id??s.itemId??s.stream_id??s.streamId),i=s.item_type==="channel"?"live":s.item_type==="series"?"series":"movies";delete document.body.dataset.velTopLevel,delete document.body.dataset.veloraReturnHome,document.body.dataset.veloraReturnFavorites=(s.item_type==="series"?"series":s.item_type==="movie"||s.item_type==="movies"?"movie":"channel"),document.body.classList.remove("vel-home-empty-active");const o=document.getElementById("vel-home-empty-page");o&&(o.classList.add("hidden"),o.setAttribute("aria-hidden","true"));try{document.dispatchEvent(new CustomEvent("velora-home-media-open",{detail:{title:s.name||"",contentType:i}}))}catch{}if(s.item_type==="channel"){__velAutoPlayRunId++;const targetSource=r,targetStream=n,matchFn=ch=>{const oStream=t(ch.stream_id??ch.raw_stream_id??ch.itemId??ch.id),oSource=t(ch.nodecast_source_id??ch.source_id??"");if(oStream!==targetStream)return false;if(targetSource&&oSource&&targetSource!=="all"&&oSource!=="all"){return oSource===targetSource}return true};window.veloraSyncFavoriteChannelPackage(e);G="live";await hl(VEL_FAVORITE_CHANNEL_PACKAGE_ID,{skipResetScroll:!0,skipAutoPlay:!0,liveStreamId:/^\\d+$/.test(targetStream)?Number(targetStream):targetStream});__velAutoPlayRunId++;let l=Dh(VEL_FAVORITE_CHANNEL_PACKAGE_ID).find(matchFn);if(!l){l=Dh(VEL_FAVORITE_CHANNEL_PACKAGE_ID).find(ch=>t(ch.stream_id??ch.raw_stream_id??ch.itemId)===targetStream)}if(!l){l=Dh(VEL_FAVORITE_CHANNEL_PACKAGE_ID).find(ch=>t(ch.name).toLowerCase()===t(s.name).toLowerCase())}if(!l){const all=Dh(VEL_FAVORITE_CHANNEL_PACKAGE_ID);all&&all.length>0&&(l=all[0])}if(!l)return false;_e=l.stream_id,In=null,We();const c=String(l.stream_id),u=()=>{const d=[...oe.querySelectorAll(".vel-media-item-row")],h=d.find(f=>String(f.dataset.streamId)===c);for(const f of d){const m=String(f.dataset.streamId)===c,v=f.querySelector(".media-item__main"),S=f.querySelector(".vel-channel-playing-badge");f.classList.toggle("vel-media-item-row--active",m),v==null||v.classList.toggle("selected",m),m?v==null||v.setAttribute("aria-current","true"):v==null||v.removeAttribute("aria-current"),S==null||S.classList.toggle("hidden",!m)}h&&h.scrollIntoView({block:"center",inline:"nearest",behavior:"smooth"})};requestAnimationFrame(()=>requestAnimationFrame(u)),Rg(l),_n(!0);return true}const l=i,c=t(s.package_id??s.packageId);if(!c||!n||!r||typeof window.veloraOpenCachedHomeItem!=="function")return false;const a=obj=>t(obj.nodecast_source_id??obj.source_id??"")===r&&t(obj.raw_stream_id??obj.raw_series_id??obj.stream_id??obj.series_id??obj.item_id??obj.id)===n;const u=VEL_FAVORITE_ITEM(s,c),d=l==="movies"?_.vodStreamsByCat:_.seriesStreamsByCat,h=d.get(c)??[];h.some(a)||d.set(c,[u,...h]),l==="movies"?Et=Qt(_.vodCategories,_.vodStreamsByCat,{includeEmptyPackages:!0}):Mt=Qt(_.seriesCategories,_.seriesStreamsByCat,{includeEmptyPackages:!0});window.veloraOpenCachedHomeItem({id:"favorites-"+l,content_type:l,package_id:c},{id:"favorite:"+r+":"+n,name:s.name||"",thumbUrl:s.thumb_url??s.thumbUrl??"",streamId:n,sourceId:r,globalStreamId:s.global_stream_id??s.globalStreamId??"",containerExtension:s.container_extension??s.containerExtension??"",packageId:c});return true};`;

code = code.substring(0, targetIndex) + newFn + code.substring(endIndex);
fs.writeFileSync(bundlePath, code, 'utf8');
console.log('Successfully patched favorite channel selection in main-JkackQV-custom-package-v7.js');

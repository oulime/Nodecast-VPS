const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const assets = [
  "public/assets/main-JkackQV-.js",
  "public/assets/main-JkackQV-custom-package-v7.js"
];

const before = 'if(i){try{Rg(i)}catch{}return}s++<60&&window.setTimeout(n,250)';
const previousAfter = 'if(i){_e=i.stream_id,In=null;const a=String(i.stream_id),o=[...oe.querySelectorAll(".vel-media-item-row")],l=o.find(c=>String(c.dataset.streamId)===a);for(const c of o){const u=String(c.dataset.streamId)===a,d=c.querySelector(".media-item__main"),h=c.querySelector(".vel-channel-playing-badge");c.classList.toggle("vel-media-item-row--active",u),d==null||d.classList.toggle("selected",u),u?d==null||d.setAttribute("aria-current","true"):d==null||d.removeAttribute("aria-current"),h==null||h.classList.toggle("hidden",!u)}l&&window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>l.scrollIntoView({block:"center",inline:"nearest",behavior:"smooth"})));try{Rg(i)}catch{}return}s++<60&&window.setTimeout(n,250)';
const after = 'if(i){_e=i.stream_id,In=null;const a=String(i.stream_id),o=l=>{const c=[...oe.querySelectorAll(".vel-media-item-row")],u=c.find(d=>String(d.dataset.streamId)===a);for(const d of c){const h=String(d.dataset.streamId)===a,f=d.querySelector(".media-item__main"),m=d.querySelector(".vel-channel-playing-badge");d.classList.toggle("vel-media-item-row--active",h),f==null||f.classList.toggle("selected",h),h?f==null||f.setAttribute("aria-current","true"):f==null||f.removeAttribute("aria-current"),m==null||m.classList.toggle("hidden",!h)}u&&u.scrollIntoView({block:"center",inline:"nearest",behavior:l?"smooth":"auto"})};o(!1),window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>o(!0))),window.setTimeout(()=>o(!1),250),window.setTimeout(()=>o(!1),1200);try{Rg(i)}catch{}return}s++<60&&window.setTimeout(n,250)';
const rowBefore = 'const c=document.createElement("button");c.type="button",c.className="media-item media-item__main",_e===o.stream_id&&c.classList.add("selected");';
const rowAfter = 'const c=document.createElement("button");c.type="button",c.className="media-item media-item__main",_e===o.stream_id&&(c.classList.add("selected"),c.setAttribute("aria-current","true"));';

for (const asset of assets) {
  const filename = path.join(root, asset);
  const source = fs.readFileSync(filename, "utf8");
  let patched = source;
  if (patched.includes(previousAfter)) patched = patched.replace(previousAfter, after);
  else if (!patched.includes(after)) {
    const occurrences = patched.split(before).length - 1;
    if (occurrences !== 1) {
      throw new Error(`${asset}: expected one live search opener, found ${occurrences}`);
    }
    patched = patched.replace(before, after);
  }
  if (patched.includes(rowBefore)) patched = patched.replace(rowBefore, rowAfter);
  else if (!patched.includes(rowAfter)) {
    throw new Error(`${asset}: live channel row renderer was not found`);
  }
  fs.writeFileSync(filename, patched);
  console.log(`Patched ${asset}`);
}

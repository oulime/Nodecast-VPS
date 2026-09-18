const fs = require("node:fs");
const path = require("node:path");

const bundlePath = path.resolve(__dirname, "../public/assets/main-JkackQV-custom-package-v7.js");
let source = fs.readFileSync(bundlePath, "utf8");

const oldEwTw = 'if(document.body.dataset.veloraReturnHome==="true"){delete document.body.dataset.veloraReturnHome;document.dispatchEvent(new CustomEvent("velora-return-home"));return}';
const newEwTw = 'if(document.body.dataset.veloraReturnHome==="true"){delete document.body.dataset.veloraReturnHome;const curTab=document.body.dataset.velActiveTab;if(!curTab||curTab==="home"||document.body.classList.contains("vel-home-empty-active")){document.dispatchEvent(new CustomEvent("velora-return-home"));return}}';

const oldD2 = 'if(document.body.dataset.veloraReturnHome==="true"||document.body.dataset.velActiveTab==="home"||document.body.classList.contains("vel-home-empty-active")){delete document.body.dataset.veloraReturnHome;ts();Js();pt.classList.add("hidden");pt.classList.remove("content-view--vod-film-detail");oe.classList.remove("item-list--vod-film-detail","item-list--vod-vertical");oe.innerHTML="";kl();bt="list";Qe=null;dt="list";Fe=null;_e=null;In=null;Z="packages";Q=null;document.dispatchEvent(new CustomEvent("velora-show-home"));document.dispatchEvent(new CustomEvent("velora-return-home"));return}';
const newD2 = 'const isHomeView=(!document.body.dataset.velActiveTab||document.body.dataset.velActiveTab==="home"||document.body.classList.contains("vel-home-empty-active"));if((document.body.dataset.veloraReturnHome==="true"||isHomeView)&&isHomeView){delete document.body.dataset.veloraReturnHome;ts();Js();pt.classList.add("hidden");pt.classList.remove("content-view--vod-film-detail");oe.classList.remove("item-list--vod-film-detail","item-list--vod-vertical");oe.innerHTML="";kl();bt="list";Qe=null;dt="list";Fe=null;_e=null;In=null;Z="packages";Q=null;document.dispatchEvent(new CustomEvent("velora-show-home"));document.dispatchEvent(new CustomEvent("velora-return-home"));return}';

const oldPop = 'if(Z==="packages"&&document.body.classList.contains("vel-home-choice-picked")&&!document.body.classList.contains("vel-home-empty-active")){nt=Math.max(0,nt-1),document.dispatchEvent(new CustomEvent("velora-show-home")),nn(),Ht(),Mn();return}';
const newPop = 'if(Z==="packages"&&(document.body.dataset.velActiveTab==="home"||!document.body.dataset.velActiveTab)&&document.body.classList.contains("vel-home-choice-picked")&&!document.body.classList.contains("vel-home-empty-active")){nt=Math.max(0,nt-1),document.dispatchEvent(new CustomEvent("velora-show-home")),nn(),Ht(),Mn();return}';

if (!source.includes(oldEwTw) && !source.includes(newEwTw)) {
  throw new Error("Could not find oldEwTw");
}
if (!source.includes(oldD2) && !source.includes(newD2)) {
  throw new Error("Could not find oldD2");
}
if (!source.includes(oldPop) && !source.includes(newPop)) {
  throw new Error("Could not find oldPop");
}

source = source.replaceAll(oldEwTw, newEwTw);
source = source.replace(oldD2, newD2);
source = source.replace(oldPop, newPop);

fs.writeFileSync(bundlePath, source, "utf8");
console.log("Successfully patched navigation return-home guards in main-JkackQV-custom-package-v7.js");


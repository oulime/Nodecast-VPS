const fs = require("node:fs");
const path = require("node:path");

const assetPath = path.resolve(__dirname, "../public/assets/velora-home-sections.js");
let source = fs.readFileSync(assetPath, "utf8");

const replacements = [
  [
    "async function renderHome(){var wrap=document.getElementById(\"vel-home-sections\");if(!wrap)return;wrap.replaceChildren();var source=",
    "var homeRenderVersion=0;async function renderHome(){var wrap=document.getElementById(\"vel-home-sections\");if(!wrap)return;var renderVersion=++homeRenderVersion,fragment=document.createDocumentFragment(),source=",
  ],
  ["wrap.appendChild(block);for(var placeholderIndex=0;", "fragment.appendChild(block);for(var placeholderIndex=0;"],
  [
    "if(!rail.children.length){var failed=document.createElement(\"p\");failed.className=\"vel-home-section__empty\";failed.textContent=\"Section indisponible.\";rail.appendChild(failed)}}}}\nasync function loadHomeCache()",
    "if(!rail.children.length){var failed=document.createElement(\"p\");failed.className=\"vel-home-section__empty\";failed.textContent=\"Section indisponible.\";rail.appendChild(failed)}}}if(renderVersion===homeRenderVersion)wrap.replaceChildren(fragment)}\nasync function loadHomeCache()",
  ],
];

for (const [before, after] of replacements) {
  if (source.includes(after)) continue;
  if (!source.includes(before)) throw new Error(`Expected Home renderer fragment not found: ${before.slice(0, 80)}`);
  source = source.replace(before, after);
}

fs.writeFileSync(assetPath, source);
console.log("Home sections now render atomically and stale renders are discarded.");

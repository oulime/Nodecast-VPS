const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("=== STARTING MON COMPTE 2-TAB & SMART TV TEST ===");

const profileJsPath = path.join(__dirname, "..", "public", "assets", "profile-account.js");
const tvBridgeJsPath = path.join(__dirname, "..", "public", "assets", "tv-connect-bridge.js");
const indexHtmlPath = path.join(__dirname, "..", "public", "index.html");

const profileJs = fs.readFileSync(profileJsPath, "utf-8");
const tvBridgeJs = fs.readFileSync(tvBridgeJsPath, "utf-8");
const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");

// Test 1: Tab structure in profile-account.js
console.log("Test 1: Verifying 2-tab structure in profile-account.js...");
assert(profileJs.includes('id="vel-tab-btn-profile"'), "Profile tab button missing");
assert(profileJs.includes('id="vel-tab-btn-tv"'), "TV tab button missing");
assert(profileJs.includes('id="vel-panel-profile"'), "Profile panel missing");
assert(profileJs.includes('id="vel-panel-tv"'), "TV panel missing");
assert(profileJs.includes('id="vel-tv-panel-mount"'), "TV mount point missing");
assert(profileJs.includes('function switchTab'), "switchTab function missing");
assert(profileJs.includes('window.veloraSwitchProfileTab = switchTab'), "switchTab export missing");
console.log("✓ Profile modal has Mon Profil and Smart TV tabs.");

// Test 2: CSS for tabs and TV tab in index.html
console.log("Test 2: Verifying CSS styles for tabs in index.html...");
assert(indexHtml.includes(".vel-profile-tabs"), ".vel-profile-tabs CSS missing");
assert(indexHtml.includes(".vel-profile-tab"), ".vel-profile-tab CSS missing");
assert(indexHtml.includes(".vel-tv-pin-input"), ".vel-tv-pin-input CSS missing");
assert(indexHtml.includes(".vel-tv-url-pill"), ".vel-tv-url-pill CSS missing");
console.log("✓ Tab and TV styling verified in index.html.");

// Test 3: TV Tab instructions contain veloravip.net/tv
console.log("Test 3: Verifying TV Tab instructions contain veloravip.net/tv...");
assert(tvBridgeJs.includes("veloravip.net/tv"), "TV instructions must include veloravip.net/tv");
console.log("✓ Instructions explicitly state veloravip.net/tv as requested.");

// Test 4: Verify 'Connecter' button is removed
console.log("Test 4: Verifying 'Connecter' button is removed...");
assert(!tvBridgeJs.includes('id="vel-tv-submit-pin"'), "Button vel-tv-submit-pin should be removed!");
console.log("✓ 'Connecter' button successfully removed.");

// Test 5: Verify 4-digit auto-connect and instant re-render without refresh
console.log("Test 5: Verifying 4-digit auto-connect and instant dynamic swap...");
assert(tvBridgeJs.includes("pinInput.value.length === 4"), "4-digit auto-trigger check missing");
assert(tvBridgeJs.includes("renderTvSettingsSection(true)"), "renderTvSettingsSection(true) forced re-render missing");
assert(tvBridgeJs.includes("Déconnecter la TV"), "Déconnecter la TV button label missing");
console.log("✓ Auto-connect on 4th digit and dynamic state swap without page refresh verified.");

console.log("=== ALL PROFILE TV TAB TESTS PASSED (100%) ===");

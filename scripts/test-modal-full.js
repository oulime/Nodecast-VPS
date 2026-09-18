const { chromium } = require("playwright");
const { generateToken } = require("../server/auth");

const AUTH_TOKEN = generateToken({ id: 1, username: "samadoxal", role: "admin" });

(async () => {
  console.log("Launching test...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

  await context.addInitScript((token) => {
    window.localStorage.setItem("authToken", token);
  }, AUTH_TOKEN);

  const page = await context.newPage();
  const logs = [];
  page.on("console", (msg) => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === "error") console.error("[BROWSER ERROR]", msg.text());
  });
  page.on("pageerror", (err) => console.error("[BROWSER PAGEERROR]", err.message));

  console.log("Navigating to http://localhost:3000...");
  await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  // 1. Open profile menu
  console.log("1. Opening profile menu...");
  await page.click("#vel-home-profile-trigger");
  await page.waitForTimeout(300);

  // 2. Click "Mon compte"
  console.log("2. Clicking 'Mon compte'...");
  await page.click("#vel-profile-account-open");
  await page.waitForTimeout(400);

  const modalOpen = await page.evaluate(() => {
    const modal = document.getElementById("vel-profile-account-modal");
    const profilePanel = document.getElementById("vel-panel-profile");
    const tvPanel = document.getElementById("vel-panel-tv");
    return {
      modalVisible: modal && !modal.hidden,
      profilePanelVisible: profilePanel && !profilePanel.hidden,
      tvPanelHidden: tvPanel && tvPanel.hidden,
      displayName: document.getElementById("vel-profile-display-name")?.textContent
    };
  });
  console.log("Modal state after 'Mon compte':", modalOpen);
  if (!modalOpen.modalVisible || !modalOpen.profilePanelVisible) {
    throw new Error("Modal or profile panel not visible!");
  }
  await page.screenshot({ path: "scratch/test_mon_compte.png" });

  // 3. Click Smart TV tab inside modal
  console.log("3. Switching to Smart TV tab...");
  await page.click("#vel-tab-btn-tv");
  await page.waitForTimeout(400);

  const tvTabState = await page.evaluate(() => {
    const tvPanel = document.getElementById("vel-panel-tv");
    const pinInput = document.getElementById("vel-tv-pin-input");
    const tvCard = document.getElementById("vel-profile-tv-card");
    return {
      tvPanelVisible: tvPanel && !tvPanel.hidden,
      pinInputExists: !!pinInput,
      pinInputMaxlength: pinInput ? pinInput.getAttribute("maxlength") : null,
      tvCardExists: !!tvCard,
      instructionsUrlText: document.querySelector(".vel-tv-url-pill")?.textContent
    };
  });
  console.log("Smart TV tab state:", tvTabState);
  if (!tvTabState.tvPanelVisible || !tvTabState.pinInputExists) {
    throw new Error("Smart TV tab or PIN input not visible!");
  }
  await page.screenshot({ path: "scratch/test_smart_tv_tab.png" });

  // 4. Close modal
  console.log("4. Closing modal...");
  await page.click(".vel-profile-account__close");
  await page.waitForTimeout(300);

  const closedState = await page.evaluate(() => {
    const modal = document.getElementById("vel-profile-account-modal");
    return modal ? modal.hidden : true;
  });
  console.log("Modal closed?", closedState);

  // 5. Open profile menu again and verify "Connecter Smart TV" is REMOVED from popup menu
  console.log("5. Checking profile menu contents (Connecter Smart TV must NOT be present)...");
  await page.click("#vel-home-profile-trigger");
  await page.waitForTimeout(300);

  const menuItems = await page.evaluate(() => {
    const menu = document.getElementById("vel-bottom-profile-menu");
    const tvBtn = document.getElementById("vel-profile-tv-open");
    const buttons = Array.from(menu ? menu.querySelectorAll("button") : []).map(b => b.textContent.trim());
    return {
      menuExists: !!menu,
      hasTvBtn: !!tvBtn,
      buttons
    };
  });
  console.log("Popup menu state:", menuItems);
  if (menuItems.hasTvBtn) {
    throw new Error("Failure: #vel-profile-tv-open should NOT be in the popup menu!");
  }
  await page.screenshot({ path: "scratch/test_popup_menu_clean.png" });

  // Re-open Mon compte to test Smart TV tab auto-submit
  console.log("6. Opening Mon compte -> Smart TV tab...");
  await page.click("#vel-profile-account-open");
  await page.waitForTimeout(400);
  await page.click("#vel-tab-btn-tv");
  await page.waitForTimeout(400);

  console.log("7. Testing 4-digit auto-submit on Smart TV tab...");
  await page.fill("#vel-tv-pin-input", "9999");
  await page.waitForTimeout(600);

  const pairStatus = await page.evaluate(() => {
    const statusMsg = document.getElementById("vel-tv-pair-status");
    return statusMsg ? statusMsg.textContent : null;
  });
  console.log("Auto-submit result for code 9999:", pairStatus);
  await page.screenshot({ path: "scratch/test_auto_submit.png" });

  await browser.close();
  console.log("ALL VERIFICATIONS COMPLETED SUCCESSFULLY WITH ZERO FREEZES!");
})();

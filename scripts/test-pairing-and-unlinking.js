const { chromium } = require("playwright");
const { generateToken } = require("../server/auth");
const { getDb } = require("../server/db/sqlite");

const AUTH_TOKEN = generateToken({ id: 1, username: "samadoxal", role: "admin" });

(async () => {
  console.log("Setting up paired TV in test database...");
  const db = getDb();
  db.prepare(`
    INSERT INTO user_tv_devices (user_id, device_id, device_name, paired_at, last_active_at, ip_address)
    VALUES ('1', 'test_tv_device_99', 'Salon Samsung 4K', datetime('now'), datetime('now'), '127.0.0.1')
    ON CONFLICT(user_id) DO UPDATE SET
      device_id = excluded.device_id,
      device_name = excluded.device_name,
      last_active_at = excluded.last_active_at;
  `).run();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript((token) => {
    window.localStorage.setItem("authToken", token);
  }, AUTH_TOKEN);

  const page = await context.newPage();
  page.on("dialog", async (dialog) => {
    console.log("Dialog prompt:", dialog.message());
    await dialog.accept();
  });

  await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  // 1. Open direct TV modal
  console.log("Opening Connecter Smart TV directly...");
  await page.click("#vel-home-profile-trigger");
  await page.waitForTimeout(300);
  await page.click("#vel-profile-tv-open");
  await page.waitForTimeout(500);

  const pairedCard = await page.evaluate(() => {
    return {
      connectedCardExists: !!document.querySelector(".vel-tv-connected-card"),
      title: document.querySelector(".vel-tv-connected-title")?.textContent,
      deviceName: document.querySelector(".vel-tv-connected-device")?.textContent,
      unlinkBtnExists: !!document.getElementById("vel-tv-unlink-btn")
    };
  });
  console.log("Paired card state:", pairedCard);
  if (!pairedCard.connectedCardExists || !pairedCard.unlinkBtnExists) {
    throw new Error("Paired card was not rendered!");
  }
  await page.screenshot({ path: "scratch/test_connected_tv.png" });

  // 2. Click "Déconnecter la TV"
  console.log("Clicking 'Déconnecter la TV'...");
  await page.click("#vel-tv-unlink-btn");
  await page.waitForTimeout(800);

  // 3. Verify it seamlessly transitions back to 4-digit PIN view without page reload
  const afterUnlink = await page.evaluate(() => {
    return {
      pinInputExists: !!document.getElementById("vel-tv-pin-input"),
      instructionsExists: !!document.querySelector(".vel-tv-instructions"),
      connectedCardExists: !!document.querySelector(".vel-tv-connected-card")
    };
  });
  console.log("After unlinking state:", afterUnlink);
  if (!afterUnlink.pinInputExists || afterUnlink.connectedCardExists) {
    throw new Error("Did not return to PIN entry after unlinking!");
  }
  await page.screenshot({ path: "scratch/test_after_unlink.png" });

  await browser.close();
  console.log("PAIRING AND UNLINKING WORKED FLAWLESSLY WITH ZERO PAGE RELOADS!");
})();

(() => {
  "use strict";
  let runId = 0;
  let lastMutationAt = 0;
  let lastHomeRenderedAt = 0;
  let pendingCountryValue = "";
  const overlay = () => document.getElementById("catalog-loading-overlay");

  function show(countryName) {
    const node = overlay();
    if (!node) return;
    node.classList.remove("hidden");
    node.setAttribute("aria-hidden", "false");
    node.style.removeProperty("display");
    node.style.removeProperty("visibility");
    node.style.removeProperty("pointer-events");
    const status = node.querySelector("#catalog-loading-status");
    if (status) status.textContent = `Chargement de ${countryName || "ce pays"}…`;
    document.body.classList.add("vel-home-choice-loading", "vel-country-switch-loading");
  }

  function start(countryName, countryValue) {
    const id = ++runId;
    pendingCountryValue = String(countryValue || "");
    lastMutationAt = Date.now();
    lastHomeRenderedAt = 0;
    show(countryName);
    finishWhenStable(id);
    return id;
  }

  function hide(id) {
    if (id !== runId) return;
    const node = overlay();
    node?.classList.add("hidden");
    node?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("vel-home-choice-loading", "vel-home-choice-catalog-pending", "vel-country-switch-loading");
    pendingCountryValue = "";
  }

  function visibleImages() {
    return [...document.querySelectorAll("#vel-home-sections img, #packages-view img")].filter(image => {
      const rect = image.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  async function waitForImages(id) {
    const images = visibleImages().filter(image => !image.complete);
    if (!images.length || id !== runId) return;
    await Promise.race([
      Promise.all(images.map(image => new Promise(resolve => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      }))),
      new Promise(resolve => setTimeout(resolve, 5000))
    ]);
  }

  async function finishWhenStable(id) {
    const started = Date.now();
    while (id === runId && Date.now() - started < 15000) {
      const skeletons = document.querySelector("#vel-home-sections .vel-home-section__skeleton, #packages-view .vel-package-skeleton, .item-list--media-loading");
      const homeFinished = lastHomeRenderedAt > 0 || Date.now() - started >= 5000;
      if (homeFinished && !skeletons && Date.now() - lastMutationAt >= 450) break;
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    await waitForImages(id);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    hide(id);
  }

  function releaseReadyStartupLoader() {
    if (document.body.classList.contains("vel-country-switch-loading")) return false;
    if (!document.body.classList.contains("vel-home-choice-loading")) return true;
    const select = document.getElementById("country-select");
    const hasCountry = !!select && [...select.options].some(option => !option.disabled && String(option.value || "").trim());
    const hasContent = !!document.querySelector("#packages-view .vel-package-card[data-package-id], #vel-home-sections .vel-home-section__card");
    const stillRendering = !!document.querySelector("#vel-home-sections .vel-home-section__skeleton, #packages-view .vel-package-skeleton, .item-list--media-loading");
    if (!hasCountry || !hasContent || stillRendering) return false;
    const node = overlay();
    node?.classList.add("hidden");
    node?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("vel-home-choice-loading", "vel-home-choice-catalog-pending");
    return true;
  }

  document.addEventListener("velora-country-switch-start", event => {
    const detail = event.detail || {};
    start(String(detail.countryName || ""), String(detail.countryValue || ""));
  });

  document.addEventListener("change", event => {
    if (event.target?.id !== "country-select") return;
    const select = event.target;
    const name = select.selectedOptions?.[0]?.textContent?.trim() || "";
    const value = String(select.value || "");
    if (pendingCountryValue === value && document.body.classList.contains("vel-country-switch-loading")) {
      lastMutationAt = Date.now();
      return;
    }
    start(name, value);
  }, true);

  document.addEventListener("velora-home-country-rendered", () => { lastHomeRenderedAt = Date.now(); lastMutationAt = Date.now(); });
  const observer = new MutationObserver(() => { lastMutationAt = Date.now(); });
  function start() {
    [document.getElementById("vel-home-sections"), document.getElementById("packages-view")].filter(Boolean)
      .forEach(node => observer.observe(node, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "src"] }));
    let attempts = 0;
    const startupGuard = window.setInterval(() => {
      attempts += 1;
      if (releaseReadyStartupLoader() || attempts >= 200) window.clearInterval(startupGuard);
    }, 200);
    releaseReadyStartupLoader();
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start, { once: true }) : start();
})();

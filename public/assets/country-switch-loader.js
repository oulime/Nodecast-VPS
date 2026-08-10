(() => {
  "use strict";
  let runId = 0;
  let lastMutationAt = 0;
  let lastHomeRenderedAt = 0;
  let pendingCountryValue = "";
  let switchStartedAt = 0;
  const MIN_VISIBLE_MS = 300;
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
    if (status) status.textContent = `Chargement de ${countryName || "ce pays"}\u2026`;
    document.body.classList.add("vel-home-choice-loading", "vel-country-switch-loading");
    document.documentElement.classList.add("vel-country-switch-loading");
  }

  function maintainOverlay(id, countryName) {
    if (id !== runId || !document.body.classList.contains("vel-country-switch-loading")) return;
    const node = overlay();
    if (node) {
      if (node.classList.contains("hidden")) node.classList.remove("hidden");
      if (node.getAttribute("aria-hidden") !== "false") node.setAttribute("aria-hidden", "false");
      const status = node.querySelector("#catalog-loading-status");
      const expectedStatus = `Chargement de ${countryName || "ce pays"}\u2026`;
      if (status && status.textContent !== expectedStatus) status.textContent = expectedStatus;
    }
    window.setTimeout(() => maintainOverlay(id, countryName), 250);
  }

  function startCountrySwitch(countryName, countryValue) {
    const nextValue = String(countryValue || "");
    if (
      nextValue &&
      nextValue === pendingCountryValue &&
      document.body.classList.contains("vel-country-switch-loading")
    ) {
      lastMutationAt = Date.now();
      show(countryName);
      return runId;
    }
    const id = ++runId;
    pendingCountryValue = nextValue;
    switchStartedAt = Date.now();
    lastMutationAt = switchStartedAt;
    lastHomeRenderedAt = 0;
    show(countryName);
    window.setTimeout(() => maintainOverlay(id, countryName), 250);
    finishWhenStable(id);
    return id;
  }

  function hide(id) {
    if (id !== runId) return;
    const node = overlay();
    node?.classList.add("hidden");
    node?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("vel-home-choice-loading", "vel-home-choice-catalog-pending", "vel-country-switch-loading");
    document.documentElement.classList.remove("vel-country-switch-loading");
    pendingCountryValue = "";
  }

  function visibleImages() {
    return [...document.querySelectorAll("#vel-home-sections img, #packages-view img")].filter(image => {
      const rect = image.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  async function finishWhenStable(id) {
    const started = Date.now();
    while (id === runId && Date.now() - started < 5000) {
      const skeletons = document.querySelector("#vel-home-sections .vel-home-section__skeleton, #packages-view .vel-package-skeleton, .item-list--media-loading");
      const homeFinished = lastHomeRenderedAt > 0 || Date.now() - started >= 1500;
      if (homeFinished && !skeletons && Date.now() - lastMutationAt >= 180) break;
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    // Posters are lazy and must never keep the whole application blocked.
    const remainingMinimum = MIN_VISIBLE_MS - (Date.now() - switchStartedAt);
    if (remainingMinimum > 0) await new Promise(resolve => setTimeout(resolve, remainingMinimum));
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
    startCountrySwitch(String(detail.countryName || ""), String(detail.countryValue || ""));
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
    startCountrySwitch(name, value);
  }, true);

  document.addEventListener("velora-home-country-rendered", () => { lastHomeRenderedAt = Date.now(); lastMutationAt = Date.now(); });
  const observer = new MutationObserver(() => { lastMutationAt = Date.now(); });
  function initialize() {
    [document.getElementById("vel-home-sections"), document.getElementById("packages-view")].filter(Boolean)
      .forEach(node => observer.observe(node, { childList: true, subtree: true }));
    let attempts = 0;
    const startupGuard = window.setInterval(() => {
      attempts += 1;
      if (releaseReadyStartupLoader() || attempts >= 200) window.clearInterval(startupGuard);
    }, 200);
    releaseReadyStartupLoader();
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", initialize, { once: true }) : initialize();
})();

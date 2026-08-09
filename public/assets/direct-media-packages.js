(() => {
  "use strict";

  const MEDIA_TABS = new Set(["movies", "series"]);
  const packageCache = new Map();
  const packageCardCache = new Map();
  const selectedPackages = new Map();
  let updateQueued = false;
  let openingKey = "";
  let navigationGeneration = 0;

  const packagesView = document.getElementById("packages-view");
  const contentView = document.getElementById("content-view");
  const countrySelect = document.getElementById("country-select");
  const headerContext = document.getElementById("vel-header-context-title");
  if (!packagesView || !contentView || !headerContext) return;

  function activeTab() {
    return document.body.dataset.velActiveTab || "live";
  }

  function countryKey() {
    return String(countrySelect?.value || "all");
  }

  function cacheKey(tab = activeTab()) {
    return `${countryKey()}::${tab}`;
  }

  function packageName(card) {
    const title = card.querySelector(".vel-package-card__title, h2, h3, strong");
    return String(title?.textContent || card.getAttribute("aria-label") || card.textContent || "Package")
      .replace(/\s+/g, " ")
      .trim();
  }

  function visiblePackageCards() {
    return [...packagesView.querySelectorAll(".vel-package-card[data-package-id]")]
      .filter(card => card instanceof HTMLElement && !card.hidden)
      .map(card => ({
        id: String(card.dataset.packageId || ""),
        name: packageName(card),
        card
      }))
      .filter(item => item.id);
  }

  function rememberPackages(tab) {
    const packages = visiblePackageCards();
    if (packages.length) {
      const key = cacheKey(tab);
      packageCache.set(key, packages.map(({ id, name }) => ({ id, name })));
      packageCardCache.set(key, new Map(packages.map(({ id, card }) => [id, card])));
    }
    return packages;
  }

  function ensurePicker() {
    let picker = document.getElementById("vel-media-package-picker");
    if (picker) return picker;

    picker = document.createElement("div");
    picker.id = "vel-media-package-picker";
    picker.className = "vel-media-package-picker";
    picker.innerHTML = [
      '<div class="vel-media-package-picker__control">',
      '<select id="vel-media-package-select" aria-label="Choisir un package"></select>',
      '<span aria-hidden="true">⌄</span>',
      "</div>"
    ].join("");
    headerContext.appendChild(picker);
    picker.querySelector("select").addEventListener("change", event => {
      const tab = activeTab();
      const id = String(event.target.value || "");
      if (!MEDIA_TABS.has(tab) || !id) return;
      selectedPackages.set(cacheKey(tab), id);
      openingKey = `${cacheKey(tab)}::${id}`;
      const card = packageCardCache.get(cacheKey(tab))?.get(id);
      if (!card) return;
      packagesView.appendChild(card);
      card.click();
      card.remove();
      window.setTimeout(() => {
        if (openingKey.endsWith(`::${id}`)) openingKey = "";
        scheduleUpdate();
      }, 1200);
    });
    return picker;
  }

  function syncPicker(tab) {
    const picker = ensurePicker();
    const select = picker.querySelector("select");
    const packages = packageCache.get(cacheKey(tab)) || [];
    const show = MEDIA_TABS.has(tab) && !contentView.classList.contains("hidden") && packages.length > 0;
    picker.hidden = !show;
    headerContext.classList.toggle("vel-header-context-title--package-picker", show);
    if (!show) return;

    const signature = packages.map(item => `${item.id}\u0000${item.name}`).join("\u0001");
    if (select.dataset.signature !== signature) {
      select.replaceChildren(...packages.map(item => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name;
        return option;
      }));
      select.dataset.signature = signature;
    }
    const selected = selectedPackages.get(cacheKey(tab));
    if (selected && packages.some(item => item.id === selected)) select.value = selected;
  }

  function update() {
    updateQueued = false;
    const tab = activeTab();
    if (!MEDIA_TABS.has(tab)) {
      const picker = document.getElementById("vel-media-package-picker");
      if (picker) picker.hidden = true;
      headerContext.classList.remove("vel-header-context-title--package-picker");
      return;
    }

    const cards = rememberPackages(tab);
    syncPicker(tab);
    const packageListIsOpen = !packagesView.classList.contains("hidden") && cards.length > 0;
    if (!packageListIsOpen) return;

    const key = cacheKey(tab);
    const preferredId = selectedPackages.get(key);
    const target = cards.find(item => item.id === preferredId) || cards[0];
    if (!target || openingKey === `${key}::${target.id}`) return;
    const scheduledGeneration = navigationGeneration;
    selectedPackages.set(key, target.id);
    openingKey = `${key}::${target.id}`;
    window.requestAnimationFrame(() => {
      // A rapid Films/Series switch can leave this callback queued for the old
      // tab. Never let stale work click an old card or clear the new tab's DOM.
      if (
        scheduledGeneration !== navigationGeneration ||
        activeTab() !== tab ||
        cacheKey(tab) !== key ||
        !packagesView.contains(target.card)
      ) {
        if (openingKey === `${key}::${target.id}`) openingKey = "";
        scheduleUpdate();
        return;
      }
      target.card.click();
      // The main app owns the transition from packages to content. Clearing the
      // cards here can produce a blank page when a first-load click is ignored
      // because another media tab is still finishing its catalogue request.
    });
    window.setTimeout(() => {
      if (openingKey === `${key}::${target.id}`) openingKey = "";
      scheduleUpdate();
    }, 1200);
  }

  function scheduleUpdate() {
    if (updateQueued) return;
    updateQueued = true;
    window.requestAnimationFrame(update);
  }

  new MutationObserver(scheduleUpdate).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-vel-active-tab"]
  });
  countrySelect?.addEventListener("change", () => {
    navigationGeneration += 1;
    openingKey = "";
    scheduleUpdate();
  });
  document.addEventListener("click", event => {
    const back = event.target.closest?.("#btn-header-back, #btn-back-home");
    const tab = activeTab();
    const isDetail = contentView.classList.contains("content-view--vod-film-detail") ||
      Boolean(contentView.querySelector(".vel-vod-detail, .vel-series-detail, .vel-vod-series-detail"));
    if (!back || !MEDIA_TABS.has(tab) || contentView.classList.contains("hidden") || isDetail) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    document.querySelector('[data-bottom-nav="home"]')?.click();
  }, true);
  document.addEventListener("velora-home-tab", () => {
    navigationGeneration += 1;
    openingKey = "";
    scheduleUpdate();
  });
  scheduleUpdate();
})();

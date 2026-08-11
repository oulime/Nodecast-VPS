(() => {
  "use strict";

  const MEDIA_TABS = new Set(["movies", "series"]);
  const packageCache = new Map();
  const selectedPackages = new Map();
  let updateQueued = false;
  let pendingOpen = "";

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

  function gridBelongsTo(tab) {
    const renderKey = String(packagesView.dataset.renderedGridKey || "");
    return renderKey.startsWith(`${tab}|`);
  }

  function packageName(card) {
    const title = card.querySelector(".vel-package-card__title, h2, h3, strong");
    return String(title?.textContent || card.getAttribute("aria-label") || card.textContent || "Package")
      .replace(/\s+/g, " ")
      .trim();
  }

  function currentPackageCards(tab) {
    if (!gridBelongsTo(tab)) return [];
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
    const cards = currentPackageCards(tab);
    if (cards.length) {
      packageCache.set(cacheKey(tab), cards.map(({ id, name }) => ({ id, name })));
    }
    return cards;
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
      if (!MEDIA_TABS.has(tab) || !id || !gridBelongsTo(tab)) return;
      const target = currentPackageCards(tab).find(item => item.id === id);
      if (!target) return;
      selectedPackages.set(cacheKey(tab), id);
      pendingOpen = `${cacheKey(tab)}::${id}`;
      target.card.click();
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

  function openSelectedPackage(tab, cards) {
    if (
      !MEDIA_TABS.has(tab) ||
      packagesView.classList.contains("hidden") ||
      !contentView.classList.contains("hidden") ||
      !gridBelongsTo(tab) ||
      !cards.length
    ) return;

    const key = cacheKey(tab);
    const selected = selectedPackages.get(key);
    const target = cards.find(item => item.id === selected) || cards[0];
    const openKey = `${key}::${target.id}`;
    if (pendingOpen === openKey) return;

    selectedPackages.set(key, target.id);
    pendingOpen = openKey;
    window.requestAnimationFrame(() => {
      if (
        activeTab() !== tab ||
        packagesView.classList.contains("hidden") ||
        !contentView.classList.contains("hidden") ||
        !gridBelongsTo(tab) ||
        !packagesView.contains(target.card)
      ) return;
      target.card.click();
    });
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
    openSelectedPackage(tab, cards);
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
    attributeFilter: ["class", "data-vel-active-tab", "data-rendered-grid-key"]
  });

  countrySelect?.addEventListener("change", () => {
    pendingOpen = "";
    scheduleUpdate();
  });

  document.addEventListener("velora-home-tab", () => {
    pendingOpen = "";
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

  scheduleUpdate();
})();

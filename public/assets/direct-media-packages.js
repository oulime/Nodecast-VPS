(() => {
  "use strict";

  const MEDIA_TABS = new Set(["movies", "series"]);
  const packageCache = new Map();
  const selectedPackages = new Map();
  let updateQueued = false;
  let pendingOpen = "";
  let liveTopLevelNodes = [];
  let inlineLiveParentId = "";
  let inlineLiveParentClose = null;

  const packagesView = document.getElementById("packages-view");
  const contentView = document.getElementById("content-view");
  const countrySelect = document.getElementById("country-select");
  const headerContext = document.getElementById("vel-header-context-title");
  const headerContextText = document.getElementById("vel-header-context-title-text");
  const headerBack = document.getElementById("btn-header-back");
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

  function isParentPackageView() {
    return Boolean(packagesView.dataset.parentPackageId);
  }

  function syncParentPackageHeader() {
    const parentView = packagesView.querySelector(".vel-parent-package-view");
    const active = activeTab() !== "live" && isParentPackageView() && Boolean(parentView);
    document.body.classList.toggle("vel-parent-package-open", active);
    if (headerBack) {
      headerBack.title = active ? "Retour aux packages" : "Retour";
      headerBack.setAttribute("aria-label", active ? "Retour aux packages" : "Retour");
    }
    if (!active || !headerContextText) return;
    const title = parentView.querySelector(".vel-parent-package-view__title");
    headerContextText.textContent = String(title?.textContent || "").trim();
    headerContext.classList.add("is-visible");
  }

  function rememberLiveTopLevel() {
    if (
      activeTab() !== "live" ||
      isParentPackageView() ||
      packagesView.querySelector(".vel-parent-package-children") ||
      packagesView.classList.contains("hidden")
    ) return;
    const cards = packagesView.querySelectorAll(".vel-package-card[data-package-id]");
    if (cards.length) liveTopLevelNodes = [...packagesView.childNodes];
  }

  function unfoldLiveParent() {
    if (activeTab() !== "live" || !isParentPackageView()) return false;
    if (packagesView.querySelector(".vel-parent-package-children")) return true;

    const parentId = String(packagesView.dataset.parentPackageId || "");
    const parentView = packagesView.querySelector(".vel-parent-package-view");
    const parentTitle = String(
      parentView?.querySelector(".vel-parent-package-view__title")?.textContent || "Package"
    ).trim();
    const closeButton = parentView?.querySelector(".vel-parent-package-view__back");
    const childCards = [...packagesView.querySelectorAll(".vel-package-card[data-package-id]")];
    const parentCard = liveTopLevelNodes.find(node =>
      node instanceof HTMLElement && String(node.dataset.packageId || "") === parentId
    );
    if (!parentId || !parentCard || !closeButton || !childCards.length) return false;

    for (const node of liveTopLevelNodes) {
      if (!(node instanceof HTMLElement)) continue;
      node.classList.remove("vel-package-card--parent-expanded");
      node.removeAttribute("aria-expanded");
    }

    const children = document.createElement("div");
    children.className = "vel-parent-package-children";
    children.dataset.parentPackageId = parentId;
    children.setAttribute("role", "group");
    children.setAttribute("aria-label", `Sous-packages de ${parentTitle}`);
    for (const card of childCards) {
      card.classList.add("vel-package-card--parent-child");
      children.appendChild(card);
    }

    packagesView.replaceChildren(...liveTopLevelNodes);
    parentCard.classList.add("vel-package-card--parent-expanded");
    parentCard.setAttribute("aria-expanded", "true");
    parentCard.insertAdjacentElement("afterend", children);
    inlineLiveParentId = parentId;
    inlineLiveParentClose = closeButton;
    document.body.dataset.velTopLevel = "live";
    document.dispatchEvent(new CustomEvent("velora-top-level-tab", { detail: { tab: "live" } }));
    return true;
  }

  function closeInlineLiveParent(event) {
    if (!inlineLiveParentId || !inlineLiveParentClose) return false;
    const card = event.target.closest?.(".vel-package-card[data-package-id]");
    if (!card || String(card.dataset.packageId || "") !== inlineLiveParentId) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    const closeButton = inlineLiveParentClose;
    inlineLiveParentId = "";
    inlineLiveParentClose = null;
    closeButton.click();
    document.body.dataset.velTopLevel = "live";
    document.dispatchEvent(new CustomEvent("velora-top-level-tab", { detail: { tab: "live" } }));
    scheduleUpdate();
    return true;
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
      isParentPackageView() ||
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
    if (activeTab() === "live") {
      if (!unfoldLiveParent()) rememberLiveTopLevel();
    }
    syncParentPackageHeader();
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
    attributeFilter: ["class", "data-vel-active-tab", "data-rendered-grid-key", "data-parent-package-id"]
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
    if (activeTab() === "live" && closeInlineLiveParent(event)) return;
    const back = event.target.closest?.("#btn-header-back, #btn-back-home");
    const tab = activeTab();
    const isDetail = contentView.classList.contains("content-view--vod-film-detail") ||
      Boolean(contentView.querySelector(".vel-vod-detail, .vel-series-detail, .vel-vod-series-detail"));
    if (!back) return;
    if (isParentPackageView()) {
      const parentBack = packagesView.querySelector(".vel-parent-package-view__back");
      if (!parentBack) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      parentBack.click();
      document.dispatchEvent(new CustomEvent("velora-top-level-tab", { detail: { tab } }));
      scheduleUpdate();
      return;
    }
    if (!MEDIA_TABS.has(tab) || contentView.classList.contains("hidden") || isDetail) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    pendingOpen = "";
    document.dispatchEvent(new CustomEvent("velora-show-home"));
  }, true);

  document.addEventListener("keydown", event => {
    if (
      activeTab() === "live" &&
      ["Enter", "NumpadEnter", " ", "Spacebar"].includes(event.key) &&
      closeInlineLiveParent(event)
    ) return;
    if (!isParentPackageView() || !event.target.closest?.("#btn-header-back")) return;
    if (!["Enter", "NumpadEnter", " ", "Spacebar"].includes(event.key)) return;
    const parentBack = packagesView.querySelector(".vel-parent-package-view__back");
    if (!parentBack) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    parentBack.click();
    document.dispatchEvent(new CustomEvent("velora-top-level-tab", { detail: { tab: activeTab() } }));
    scheduleUpdate();
  }, true);

  scheduleUpdate();
})();

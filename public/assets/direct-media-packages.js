(() => {
  "use strict";

  const MEDIA_TABS = new Set(["movies", "series"]);
  const packageCache = new Map();
  const selectedPackages = new Map();
  let updateQueued = false;
  let pendingOpen = "";
  let adultMoviesAutoOpenBlocked = false;
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

  function isAdultMode() {
    return Boolean(document.querySelector(".main--velora")?.classList.contains("main--velora-adult"));
  }

  function countryKey() {
    return String(countrySelect?.value || "all");
  }

  function cacheKey(tab = activeTab()) {
    if (isAdultMode()) return `adult::${tab}`;
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

  function collapseInlineLiveParent() {
    if (!inlineLiveParentId || !inlineLiveParentClose) return false;
    const closeButton = inlineLiveParentClose;
    inlineLiveParentId = "";
    inlineLiveParentClose = null;
    closeButton.click();
    document.body.dataset.velTopLevel = "live";
    document.dispatchEvent(new CustomEvent("velora-top-level-tab", { detail: { tab: "live" } }));
    scheduleUpdate();
    return true;
  }

  function closeInlineLiveParent(event) {
    if (!inlineLiveParentId || !inlineLiveParentClose) return false;
    const card = event.target.closest?.(".vel-package-card[data-package-id]");
    if (!card || String(card.dataset.packageId || "") !== inlineLiveParentId) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    return collapseInlineLiveParent();
  }

  function packageName(card) {
    const title = card.querySelector(".vel-package-card__title, h2, h3, strong");
    return String(title?.textContent || card.getAttribute("aria-label") || card.textContent || "Package")
      .replace(/\s+/g, " ")
      .trim();
  }

  function syncAdultPackageExclusions() {
    const adultMode = document.querySelector(".main--velora")?.classList.contains("main--velora-adult");
    packagesView.querySelectorAll(".vel-package-card[data-package-id]").forEach(card => {
      const excluded = adultMode && /\badult[\s_-]*swim\b/i.test(packageName(card));
      if (excluded) {
        card.remove();
      } else if (card.hasAttribute("data-vel-adult-excluded")) {
        card.hidden = false;
        card.removeAttribute("data-vel-adult-excluded");
      }
    });
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

  function closePackageMenu(picker, restoreFocus = false) {
    const trigger = picker?.querySelector("#vel-media-package-trigger");
    const menu = picker?.querySelector("#vel-media-package-menu");
    if (!trigger || !menu || menu.hidden) return;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    picker.classList.remove("is-open");
    document.body.classList.remove("vel-media-package-menu-open");
    if (restoreFocus) trigger.focus();
  }

  function activateMediaPackage(id) {
    const tab = activeTab();
    if (!MEDIA_TABS.has(tab) || !id || !gridBelongsTo(tab)) return;
    const target = currentPackageCards(tab).find(item => item.id === id);
    if (!target) return;
    selectedPackages.set(cacheKey(tab), id);
    pendingOpen = `${cacheKey(tab)}::${id}`;
    target.card.click();
  }

  function ensurePicker() {
    let picker = document.getElementById("vel-media-package-picker");
    if (picker) return picker;

    picker = document.createElement("div");
    picker.id = "vel-media-package-picker";
    picker.className = "vel-media-package-picker";
    picker.innerHTML = [
      '<button id="vel-media-package-trigger" class="vel-media-package-picker__trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="vel-media-package-menu">',
      '<span class="vel-media-package-picker__label">Choisir un package</span>',
      '<svg class="vel-media-package-picker__chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
      '</button>',
      '<div id="vel-media-package-menu" class="vel-media-package-picker__menu" role="listbox" aria-label="Choisir un package" hidden>',
      '<span class="vel-media-package-picker__menu-title">Choisir un package</span>',
      "</div>"
    ].join("");
    headerContext.appendChild(picker);

    const trigger = picker.querySelector("#vel-media-package-trigger");
    const menu = picker.querySelector("#vel-media-package-menu");

    trigger.addEventListener("click", () => {
      const open = menu.hidden;
      menu.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
      picker.classList.toggle("is-open", open);
      document.body.classList.toggle("vel-media-package-menu-open", open);
      if (open) {
        window.requestAnimationFrame(() => {
          menu.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
        });
      }
    });

    trigger.addEventListener("keydown", event => {
      if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      if (menu.hidden) trigger.click();
      window.requestAnimationFrame(() => {
        (menu.querySelector('[aria-selected="true"]') || menu.querySelector('[role="option"]'))?.focus();
      });
    });

    menu.addEventListener("click", event => {
      const option = event.target.closest?.("[data-package-id]");
      if (!option) return;
      closePackageMenu(picker);
      activateMediaPackage(String(option.dataset.packageId || ""));
    });

    menu.addEventListener("keydown", event => {
      const items = [...menu.querySelectorAll('[role="option"]')];
      const index = items.indexOf(event.target);
      if (index < 0) return;
      let next = index;
      if (event.key === "ArrowDown") next = Math.min(items.length - 1, index + 1);
      else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = items.length - 1;
      else return;
      event.preventDefault();
      items[next]?.focus();
    });

    document.addEventListener("click", event => {
      if (!picker.contains(event.target)) closePackageMenu(picker);
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closePackageMenu(picker, true);
    });
    return picker;
  }

  function syncPicker(tab) {
    const picker = ensurePicker();
    const trigger = picker.querySelector("#vel-media-package-trigger");
    const label = picker.querySelector(".vel-media-package-picker__label");
    const menu = picker.querySelector("#vel-media-package-menu");
    const packages = packageCache.get(cacheKey(tab)) || [];
    const show = MEDIA_TABS.has(tab) && !contentView.classList.contains("hidden") && packages.length > 0;
    picker.hidden = !show;
    headerContext.classList.toggle("vel-header-context-title--package-picker", show);
    if (!show) {
      closePackageMenu(picker);
      return;
    }

    const signature = packages.map(item => `${item.id}\u0000${item.name}`).join("\u0001");
    if (menu.dataset.signature !== signature) {
      menu.querySelectorAll("[data-package-id]").forEach(option => option.remove());
      menu.append(...packages.map(item => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "vel-media-package-picker__option";
        option.dataset.packageId = item.id;
        option.setAttribute("role", "option");
        const name = document.createElement("span");
        name.textContent = item.name;
        const check = document.createElement("span");
        check.className = "vel-media-package-picker__check";
        check.textContent = "✓";
        check.setAttribute("aria-hidden", "true");
        option.append(name, check);
        return option;
      }));
      menu.dataset.signature = signature;
    }

    const selected = selectedPackages.get(cacheKey(tab));
    const selectedPackage = packages.find(item => item.id === selected) || packages[0];
    if (!selectedPackage) return;
    label.textContent = selectedPackage.name;
    trigger.setAttribute("aria-label", `Package : ${selectedPackage.name}`);
    menu.querySelectorAll("[data-package-id]").forEach(option => {
      const active = option.dataset.packageId === selectedPackage.id;
      option.classList.toggle("is-selected", active);
      if (option.getAttribute("aria-selected") !== String(active)) {
        option.setAttribute("aria-selected", String(active));
      }
    });
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
    syncAdultPackageExclusions();
    if (isAdultMode()) {
      if (activeTab() === "movies") {
        const cards = rememberPackages("movies");
        syncPicker("movies");
        if (!adultMoviesAutoOpenBlocked) openSelectedPackage("movies", cards);
        return;
      }
      const picker = document.getElementById("vel-media-package-picker");
      if (picker) {
        closePackageMenu(picker);
        picker.hidden = true;
      }
      headerContext.classList.remove("vel-header-context-title--package-picker");
      return;
    }
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

  function prepareAdultMoviesOpen(event) {
    if (!isAdultMode() || !event.target.closest?.("#adult-tab-movies")) return;
    adultMoviesAutoOpenBlocked = false;
    pendingOpen = "";
    scheduleUpdate();
  }

  document.addEventListener("pointerdown", prepareAdultMoviesOpen, true);
  document.addEventListener("click", prepareAdultMoviesOpen, true);

  document.addEventListener("velora-adult-packages-back", event => {
    if (event.detail?.tab !== "movies") return;
    adultMoviesAutoOpenBlocked = true;
    pendingOpen = "";
  });

  document.addEventListener("click", event => {
    if (isAdultMode()) {
      const card = event.target.closest?.(".vel-package-card[data-package-id]");
      if (activeTab() === "movies" && card && packagesView.contains(card)) {
        const id = String(card.dataset.packageId || "");
        if (id) {
          adultMoviesAutoOpenBlocked = false;
          selectedPackages.set(cacheKey("movies"), id);
          pendingOpen = `${cacheKey("movies")}::${id}`;
        }
      }
      return;
    }
    if (activeTab() === "live" && closeInlineLiveParent(event)) return;
    const back = event.target.closest?.("#btn-header-back, #btn-back-home");
    const tab = activeTab();
    const isDetail = contentView.classList.contains("content-view--vod-film-detail") ||
      Boolean(contentView.querySelector(".vel-vod-detail, .vel-series-detail, .vel-vod-series-detail"));
    if (!back) return;
    if (tab !== "live" && isParentPackageView()) {
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
    if (isAdultMode()) return;
    if (
      activeTab() === "live" &&
      ["Enter", "NumpadEnter", " ", "Spacebar"].includes(event.key) &&
      closeInlineLiveParent(event)
    ) return;
    if (activeTab() === "live" || !isParentPackageView() || !event.target.closest?.("#btn-header-back")) return;
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

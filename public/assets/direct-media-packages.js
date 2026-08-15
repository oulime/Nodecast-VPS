(() => {
  "use strict";

  const MEDIA_TABS = new Set(["movies", "series"]);
  const packageCache = new Map();
  const mediaCountCache = new Map();
  const mediaCountLoads = new Map();
  let countryPackagePayloadPromise = null;
  const selectedPackages = new Map();
  const adultLiveArtworkCache = new Map();
  const liveParentChildrenCache = new Map();
  const LIVE_PARENT_CACHE_LIMIT = 12;
  let updateQueued = false;
  let pendingOpen = "";
  let adultMoviesAutoOpenBlocked = false;
  let liveTopLevelNodes = [];
  let inlineLiveParentId = "";
  let inlineLiveParentClose = null;
  let liveParentScrollState = null;

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

  function countLabel(tab, count) {
    const value = Number(count) || 0;
    const noun = tab === "series"
      ? value === 1 ? "série" : "séries"
      : value === 1 ? "film" : "films";
    return `${value} ${noun}`;
  }

  function syncPackageCardCounts(tab) {
    const counts = mediaCountCache.get(cacheKey(tab));
    if (!counts || !gridBelongsTo(tab)) return;
    for (const { id, card } of currentPackageCards(tab)) {
      const count = counts.get(id) ?? 0;
      let badge = card.querySelector(":scope > .vel-package-card__media-count");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "vel-package-card__media-count";
        card.appendChild(badge);
      }
      const text = countLabel(tab, count);
      if (badge.textContent !== text) badge.textContent = text;
    }
  }

  function mediaCountsFromCountryPackageCache(payload, countryId, tab) {
    const kind = tab === "movies" ? "vod" : "series";
    const memberships = payload?.memberships || {};
    const countries = Array.isArray(memberships.countries) ? memberships.countries : [];
    const packageIds = Array.isArray(memberships.packages) ? memberships.packages : [];
    const rows = Array.isArray(memberships.rows) ? memberships.rows : [];
    const itemKeysByPackage = new Map();

    for (const row of rows) {
      if (!Array.isArray(row) || countries[row[0]] !== countryId || row[4] !== kind) continue;
      const packageId = String(packageIds[row[2]] || "");
      if (!packageId) continue;
      if (!itemKeysByPackage.has(packageId)) itemKeysByPackage.set(packageId, new Set());
      itemKeysByPackage.get(packageId).add(`${String(row[3] ?? "")}:${String(row[1] ?? "")}`);
    }

    const counts = new Map();
    for (const packageRow of Array.isArray(payload?.packages) ? payload.packages : []) {
      if (String(packageRow.country_id || "") !== countryId || packageRow.kind !== kind) continue;
      const packageId = String(packageRow.id || "");
      const isParent = packageRow.is_parent === true || packageRow.is_parent === "true";
      if (!isParent) {
        counts.set(packageId, itemKeysByPackage.get(packageId)?.size || 0);
        continue;
      }
      const uniqueItems = new Set();
      for (const childId of Array.isArray(packageRow.child_package_ids) ? packageRow.child_package_ids : []) {
        for (const itemKey of itemKeysByPackage.get(String(childId)) || []) uniqueItems.add(itemKey);
      }
      counts.set(packageId, uniqueItems.size);
    }
    return counts;
  }

  async function loadCountsFromCountryPackageCache(countryId, tab) {
    if (!countryPackagePayloadPromise) {
      countryPackagePayloadPromise = fetch("/api/velora-db/country-package-cache", { cache: "no-store" })
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .catch(error => {
          countryPackagePayloadPromise = null;
          throw error;
        });
    }
    return mediaCountsFromCountryPackageCache(await countryPackagePayloadPromise, countryId, tab);
  }

  async function loadMediaPackageCounts(tab) {
    if (!MEDIA_TABS.has(tab) || isAdultMode()) return null;
    const countryId = countryKey();
    if (!countryId || countryId === "all") return null;
    const key = cacheKey(tab);
    if (mediaCountCache.has(key)) return mediaCountCache.get(key);
    if (mediaCountLoads.has(key)) return mediaCountLoads.get(key);

    const request = (async () => {
      try {
        const token = window.localStorage.getItem("authToken");
        const response = await fetch(
          `/api/velora-db/admin/package-media-counts?countryId=${encodeURIComponent(countryId)}&kind=${encodeURIComponent(tab)}`,
          {
            cache: "no-store",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined
          }
        );
        const contentType = String(response.headers.get("content-type") || "");
        if (!response.ok || !contentType.includes("application/json")) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        if (!Array.isArray(payload?.counts)) throw new Error("Invalid media count response");
        const counts = new Map(payload.counts.map(item => [
          String(item.package_id || ""),
          Math.max(0, Number(item.count) || 0)
        ]));
        mediaCountCache.set(key, counts);
        if (cacheKey(tab) === key) {
          syncPackageCardCounts(tab);
          syncPicker(tab);
        }
        return counts;
      } catch (error) {
        try {
          const counts = await loadCountsFromCountryPackageCache(countryId, tab);
          mediaCountCache.set(key, counts);
          if (cacheKey(tab) === key) {
            syncPackageCardCounts(tab);
            syncPicker(tab);
          }
          return counts;
        } catch (fallbackError) {
          console.warn("[Velora] Package media counts failed", { tab, countryId, error, fallbackError });
          return null;
        }
      } finally {
        mediaCountLoads.delete(key);
      }
    })();
    mediaCountLoads.set(key, request);
    return request;
  }

  function gridBelongsTo(tab) {
    const renderKey = String(packagesView.dataset.renderedGridKey || "");
    return renderKey.startsWith(`${tab}|`);
  }

  function isParentPackageView() {
    return Boolean(packagesView.dataset.parentPackageId);
  }

  function liveParentCacheKey(parentId) {
    return `${countryKey()}::${String(parentId || "")}`;
  }

  function liveParentCardsSignature(cards) {
    return cards.map(card => {
      const id = String(card.dataset.packageId || "");
      const image = card.querySelector(":scope > img");
      const imageSrc = String(image?.getAttribute("src") || "");
      return `${id}\u0000${packageName(card)}\u0000${imageSrc}`;
    }).join("\u0001");
  }

  function rememberLiveParentChildren(parentId, children) {
    if (!parentId || !children) return;
    const cards = [...children.querySelectorAll(":scope > .vel-package-card[data-package-id]")];
    if (!cards.length) return;
    const key = liveParentCacheKey(parentId);
    liveParentChildrenCache.delete(key);
    liveParentChildrenCache.set(key, {
      children,
      signature: liveParentCardsSignature(cards)
    });
    while (liveParentChildrenCache.size > LIVE_PARENT_CACHE_LIMIT) {
      liveParentChildrenCache.delete(liveParentChildrenCache.keys().next().value);
    }
  }

  function reuseLiveParentChildren(parentId, freshCards) {
    const key = liveParentCacheKey(parentId);
    const cached = liveParentChildrenCache.get(key);
    if (!cached) return null;
    if (cached.signature !== liveParentCardsSignature(freshCards)) {
      liveParentChildrenCache.delete(key);
      return null;
    }
    liveParentChildrenCache.delete(key);
    liveParentChildrenCache.set(key, cached);
    cached.children.dataset.memoryCache = "reused";
    return cached.children;
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

    let children = reuseLiveParentChildren(parentId, childCards);
    if (!children) {
      children = document.createElement("div");
      children.className = "vel-parent-package-children";
      children.dataset.parentPackageId = parentId;
      children.dataset.memoryCache = "fresh";
      children.setAttribute("role", "group");
      children.setAttribute("aria-label", `Sous-packages de ${parentTitle}`);
      for (const card of childCards) {
        card.classList.add("vel-package-card--parent-child");
        children.appendChild(card);
      }
    }

    packagesView.replaceChildren(...liveTopLevelNodes);
    parentCard.classList.add("vel-package-card--parent-expanded");
    parentCard.setAttribute("aria-expanded", "true");
    parentCard.insertAdjacentElement("afterend", children);
    inlineLiveParentId = parentId;
    inlineLiveParentClose = closeButton;
    restoreLiveParentScroll();
    document.body.dataset.velTopLevel = "live";
    document.dispatchEvent(new CustomEvent("velora-top-level-tab", { detail: { tab: "live" } }));
    return true;
  }

  function rememberLiveParentScroll(event) {
    if (isAdultMode() || activeTab() !== "live" || isParentPackageView()) return;
    const card = event.target.closest?.(".vel-package-card[data-package-id]");
    if (!card || !packagesView.contains(card) || packagesView.classList.contains("hidden")) return;
    const main = document.querySelector(".main--velora");
    liveParentScrollState = {
      windowX: window.scrollX,
      windowY: window.scrollY,
      main,
      mainLeft: main?.scrollLeft || 0,
      mainTop: main?.scrollTop || 0
    };
  }

  function restoreLiveParentScroll() {
    const state = liveParentScrollState;
    liveParentScrollState = null;
    if (!state) return;
    const restore = () => {
      if (state.main?.isConnected) {
        state.main.scrollLeft = state.mainLeft;
        state.main.scrollTop = state.mainTop;
      }
      window.scrollTo(state.windowX, state.windowY);
    };
    restore();
    window.requestAnimationFrame(() => window.requestAnimationFrame(restore));
  }

  function clearLiveParentContextForAdult() {
    if (!isParentPackageView()) return false;
    const parentBack = packagesView.querySelector(".vel-parent-package-view__back");
    inlineLiveParentId = "";
    inlineLiveParentClose = null;
    liveTopLevelNodes = [];
    liveParentScrollState = null;
    if (!parentBack) return false;
    parentBack.click();
    return true;
  }

  function collapseInlineLiveParent() {
    if (!inlineLiveParentId || !inlineLiveParentClose) return false;
    const closeButton = inlineLiveParentClose;
    const children = packagesView.querySelector(".vel-parent-package-children");
    if (children) {
      children.remove();
      rememberLiveParentChildren(inlineLiveParentId, children);
    }
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

  function decodeAdultLivePackageId(packageId) {
    const raw = String(packageId || "").trim();
    const delimiter = raw.indexOf("::");
    let sourceId = delimiter > 0 ? raw.slice(0, delimiter) : "";
    let categoryId = delimiter > 0 ? raw.slice(delimiter + 2) : raw;
    try {
      const encoded = categoryId.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = window.atob(encoded + "=".repeat((4 - encoded.length % 4) % 4));
      const separator = decoded.indexOf(":");
      if (separator > 0) {
        sourceId = decoded.slice(0, separator);
        categoryId = decoded.slice(separator + 1);
      }
    } catch (_) {}
    return sourceId && categoryId ? { sourceId, categoryId } : null;
  }

  function firstStreamArtwork(payload) {
    const lists = [
      payload,
      payload?.data,
      payload?.items,
      payload?.streams,
      payload?.channels,
      payload?.results
    ];
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const stream of list) {
        const artwork = String(
          stream?.stream_icon || stream?.streamIcon || stream?.icon || stream?.logo || stream?.thumbnail || ""
        ).trim();
        if (artwork) return artwork;
      }
    }
    return "";
  }

  function proxiedArtwork(url) {
    if (!/^https?:\/\//i.test(url)) return url;
    const encoded = encodeURIComponent(url);
    return `/proxy?target=${encoded}&from=${encoded}`;
  }

  async function loadAdultLiveArtwork(packageId) {
    if (adultLiveArtworkCache.has(packageId)) return adultLiveArtworkCache.get(packageId);
    const request = (async () => {
      const decoded = decodeAdultLivePackageId(packageId);
      if (!decoded) return "";
      const base = `/api/proxy/xtream/${encodeURIComponent(decoded.sourceId)}`;
      const category = encodeURIComponent(decoded.categoryId);
      const endpoints = [
        `${base}/live_streams?category_id=${category}`,
        `${base}/player_api?action=get_live_streams&category_id=${category}`
      ];
      const token = window.localStorage.getItem("authToken");
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            cache: "force-cache",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined
          });
          if (!response.ok) continue;
          const artwork = firstStreamArtwork(await response.json());
          if (artwork) return proxiedArtwork(artwork);
        } catch (_) {}
      }
      return "";
    })();
    adultLiveArtworkCache.set(packageId, request);
    return request;
  }

  function syncAdultLivePackageCards() {
    if (!isAdultMode() || activeTab() !== "live") return;
    packagesView.querySelectorAll(".vel-package-card[data-package-id]").forEach(card => {
      const packageId = String(card.dataset.packageId || "");
      if (!packageId) return;
      card.classList.remove("vel-package-card--live-default-art");
      card.classList.add("vel-package-card--adult-live-art");
      card.querySelector(".vel-package-card__title")?.classList.remove("vel-package-card__title--live-default-art");
      if (card.querySelector(":scope > img")) return;
      loadAdultLiveArtwork(packageId).then(artwork => {
        if (!artwork || !card.isConnected || card.querySelector(":scope > img")) return;
        const image = document.createElement("img");
        image.alt = "";
        image.setAttribute("role", "presentation");
        image.className = "vel-package-card__art vel-package-card__art--contain";
        image.loading = "lazy";
        image.decoding = "async";
        image.src = artwork;
        image.addEventListener("error", () => image.remove(), { once: true });
        card.prepend(image);
      });
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
    if (isAdultMode() && tab === "movies") {
      if (typeof PointerEvent === "function") {
        target.card.dispatchEvent(new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerId: 77,
          pointerType: "mouse"
        }));
      } else {
        target.card.click();
      }
      return;
    }
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

    const counts = mediaCountCache.get(cacheKey(tab));
    const signature = packages.map(item =>
      `${item.id}\u0000${item.name}\u0000${counts?.get(item.id) ?? ""}`
    ).join("\u0001");
    if (menu.dataset.signature !== signature) {
      menu.querySelectorAll("[data-package-id]").forEach(option => option.remove());
      menu.append(...packages.map(item => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "vel-media-package-picker__option";
        option.dataset.packageId = item.id;
        option.setAttribute("role", "option");
        const name = document.createElement("span");
        name.className = "vel-media-package-picker__name";
        name.textContent = item.name;
        const count = document.createElement("span");
        count.className = "vel-media-package-picker__count";
        count.textContent = counts ? countLabel(tab, counts.get(item.id) ?? 0) : "…";
        const check = document.createElement("span");
        check.className = "vel-media-package-picker__check";
        check.textContent = "✓";
        check.setAttribute("aria-hidden", "true");
        option.append(name, count, check);
        return option;
      }));
      menu.dataset.signature = signature;
    }

    const selected = selectedPackages.get(cacheKey(tab));
    const selectedPackage = packages.find(item => item.id === selected) || packages[0];
    if (!selectedPackage) return;
    const selectedCount = counts?.get(selectedPackage.id);
    label.textContent = selectedCount == null
      ? selectedPackage.name
      : `${selectedPackage.name} · ${countLabel(tab, selectedCount)}`;
    trigger.setAttribute("aria-label", selectedCount == null
      ? `Package : ${selectedPackage.name}`
      : `Package : ${selectedPackage.name}, ${countLabel(tab, selectedCount)}`);
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
      if (clearLiveParentContextForAdult()) return;
      syncAdultLivePackageCards();
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
    syncPackageCardCounts(tab);
    syncPicker(tab);
    void loadMediaPackageCounts(tab);
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

  window.addEventListener("velora-admin-curation-changed", () => {
    mediaCountCache.clear();
    mediaCountLoads.clear();
    countryPackagePayloadPromise = null;
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
  document.addEventListener("pointerdown", rememberLiveParentScroll, true);
  document.addEventListener("click", rememberLiveParentScroll, true);

  document.addEventListener("velora-adult-packages-back", event => {
    if (event.detail?.tab !== "movies") return;
    adultMoviesAutoOpenBlocked = true;
    pendingOpen = "";
  });

  document.addEventListener("pointerup", event => {
    if (isAdultMode() || activeTab() !== "live") return;
    closeInlineLiveParent(event);
  }, true);

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

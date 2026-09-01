/**
 * Velora Netflix-Style Multi-Row Carousel Feed (Vertical Poster Cards) & Full Package Modal
 * Powered by VPS Precomputed Media Feed Cache (/api/velora-db/country-media-feed)
 */
(() => {
  "use strict";

  const MEDIA_TABS = new Set(["movies", "series"]);
  let isRendering = false;
  let lastFeedKey = "";
  const feedCache = new Map(); // key: `${countryId}:${tab}` -> feedData
  const packageFullItemsCache = new Map(); // key: `${tab}:${pkgId}` -> items array

  function activeTab() {
    if (document.body.classList.contains("vel-home-empty-active")) return "home";
    const homePage = document.getElementById("vel-home-empty-page");
    if (homePage && !homePage.classList.contains("hidden")) return "home";
    return document.body.dataset.velActiveTab || "";
  }

  function getActiveCountryId() {
    if (typeof window.veloraGetActiveCountryId === "function") {
      const c = window.veloraGetActiveCountryId();
      if (c) return String(c);
    }
    const select = document.getElementById("country-select") || document.getElementById("home-country-select");
    if (select && select.value) return String(select.value);
    return "country_france";
  }

  function stripTitle(name) {
    let clean = String(name || "").trim();
    for (let pass = 0; pass < 5; pass++) {
      const next = clean
        .replace(/^[\[\(]?[A-Z0-9\+\-\s]{1,12}[\]\)]\s*[-:]?\s*/i, "")
        .replace(/^([0-9]+K|[0-9]+D|HD|FHD|UHD|4K|VF|VOSTFR|VO|FR|EN|ES|DE|MULTI|TRUEFRENCH|FRENCH)\s*[-:]?\s*/i, "")
        .replace(/^[A-Z0-9]{1,8}-[A-Z0-9]{1,8}\s*[-:]?\s*/i, "")
        .trim();
      if (next === clean) break;
      clean = next;
    }
    return clean || name || "";
  }

  function formatPackageTitle(title) {
    let clean = String(title || "").trim();
    return clean
      .replace(/^[A-Z0-9\-_]{2,8}\s*[-:]\s*/i, "")
      .replace(/^([A-Z]{2,4}|[0-9]+K)\s*[-:]\s*/i, "")
      .trim() || title || "Catalogue";
  }

  function getContainer() {
    let container = document.getElementById("vel-prime-carousels-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "vel-prime-carousels-container";
      container.className = "vel-prime-container";
      const packagesView = document.getElementById("packages-view");
      if (packagesView && packagesView.parentNode) {
        packagesView.parentNode.insertBefore(container, packagesView.nextSibling);
      } else {
        document.body.appendChild(container);
      }
    }
    return container;
  }

  // Fetch precomputed country media feed in 1 fast local request
  async function fetchCountryMediaFeed(countryId, tab) {
    const cacheKey = `${countryId}:${tab}`;
    if (feedCache.has(cacheKey)) {
      return feedCache.get(cacheKey);
    }
    try {
      const res = await fetch(`/api/velora-db/country-media-feed?country_id=${encodeURIComponent(countryId)}&tab=${encodeURIComponent(tab)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.packages)) {
          feedCache.set(cacheKey, data);
          return data;
        }
      }
    } catch (err) {
      console.warn("[Velora Prime] Feed request failed:", err.message);
    }
    return { ok: false, packages: [] };
  }

  // Open / Play Item
  function openItem(tab, pkg, item, cardEl) {
    if (typeof window.veloraOpenCachedHomeItem === "function") {
      window.veloraOpenCachedHomeItem({ id: pkg.id, content_type: tab, package_id: pkg.id }, item);
      return;
    }
    if (typeof window.veloraOpenHomeCacheEntry === "function") {
      window.veloraOpenHomeCacheEntry({ id: pkg.id, content_type: tab, package_id: pkg.id }, item, cardEl);
      return;
    }
  }

  // Helper to extract vertical poster vs backdrop from raw stream item
  function extractMediaImages(it) {
    let poster = it.poster || it.poster_path || it.stream_icon || it.cover || it.cover_big || it.movie_image || it.series_image || "";
    if (Array.isArray(poster) && poster.length > 0) poster = poster[0];
    if (typeof poster === "string" && poster.startsWith("/")) poster = "https://image.tmdb.org/t/p/w500" + poster;

    let backdrop = it.backdrop_path || it.backdrop || it.backdrop_url || "";
    if (Array.isArray(backdrop) && backdrop.length > 0) backdrop = backdrop[0];
    if (typeof backdrop === "string" && backdrop.startsWith("/")) backdrop = "https://image.tmdb.org/t/p/w780" + backdrop;

    // If poster is an obvious horizontal landscape TMDb backdrop (w1280), try not to use it as poster
    if (typeof poster === "string" && (poster.includes("/w1280/") || poster.includes("/backdrop/"))) {
      if (!backdrop) backdrop = poster;
      // keep it only if no other option
    }

    const finalPoster = poster || backdrop;
    const finalBackdrop = backdrop || poster;
    return { poster: finalPoster, backdrop: finalBackdrop };
  }

  // Fetch full items of a package for the "Voir tout" popup
  async function fetchPackageFullItems(tab, pkg) {
    const cacheKey = `${tab}:${pkg.id}`;
    if (packageFullItemsCache.has(cacheKey)) {
      return packageFullItemsCache.get(cacheKey);
    }

    const appState = typeof window.veloraGetState === "function" ? window.veloraGetState() : null;
    if (appState) {
      const streamMap = tab === "movies" ? appState.vodStreamsByCat : appState.seriesStreamsByCat;
      if (streamMap) {
        const rawList = streamMap.get(pkg.id) || streamMap.get(String(pkg.id)) || (pkg.category_id ? streamMap.get(String(pkg.category_id)) : null);
        if (Array.isArray(rawList) && rawList.length > 0) {
          const items = rawList.map((it, idx) => {
            const rawId = it.raw_stream_id ?? it.raw_series_id ?? it.stream_id ?? it.series_id ?? idx;
            const { poster, backdrop } = extractMediaImages(it);
            return {
              id: `feed:${pkg.id}:${rawId}`,
              name: stripTitle(it.name || it.title || it.series_name || ""),
              rawName: it.name || it.title || it.series_name || "",
              thumbUrl: poster,
              posterUrl: poster,
              backdropUrl: backdrop,
              rating: it.rating || it.rating_5based || it.score || "",
              year: it.year || it.releaseDate || "",
              plot: it.plot || it.description || it.overview || "",
              streamId: rawId,
              sourceId: it.nodecast_source_id ?? it.source_id ?? pkg.source_id,
              globalStreamId: it.nodecast_global_stream_id ?? it.global_stream_id ?? rawId,
              containerExtension: it.container_extension || "",
              contentType: tab,
              packageId: pkg.id
            };
          });
          packageFullItemsCache.set(cacheKey, items);
          return items;
        }
      }
    }

    // Fetch from backend package-media-items API
    try {
      const countryId = getActiveCountryId();
      const kind = tab === "movies" ? "vod" : "series";
      const res = await fetch(`/api/velora-db/admin/package-media-items?countryId=${encodeURIComponent(countryId)}&packageId=${encodeURIComponent(pkg.id)}&kind=${encodeURIComponent(kind)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.items) && data.items.length > 0) {
          const items = data.items.map(it => {
            const rawId = it.stream_id || it.id;
            const { poster, backdrop } = extractMediaImages(it);
            return {
              id: `feed:${pkg.id}:${rawId}`,
              name: stripTitle(it.name || it.title || ""),
              rawName: it.name || it.title || "",
              thumbUrl: poster,
              posterUrl: poster,
              backdropUrl: backdrop,
              rating: it.rating || "",
              year: it.year || "",
              plot: it.plot || it.description || "",
              streamId: rawId,
              sourceId: it.source_id || pkg.source_id,
              globalStreamId: it.globalStreamId || rawId,
              containerExtension: it.containerExtension || "",
              contentType: tab,
              packageId: pkg.id
            };
          });
          packageFullItemsCache.set(cacheKey, items);
          return items;
        }
      }
    } catch (err) {
      console.warn("[Velora Prime] Could not fetch package items:", err.message);
    }

    return Array.isArray(pkg.items) ? pkg.items : [];
  }

  // Open Full Package Content Modal (Popup)
  async function openPackageModal(tab, pkg) {
    let modal = document.getElementById("vel-pkg-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "vel-pkg-modal";
      modal.className = "vel-pkg-modal";
      modal.innerHTML = `
        <div class="vel-pkg-modal__backdrop"></div>
        <div class="vel-pkg-modal__dialog">
          <div class="vel-pkg-modal__header">
            <div class="vel-pkg-modal__titles">
              <h2 class="vel-pkg-modal__title" id="vel-pkg-modal-title"></h2>
              <span class="vel-pkg-modal__count" id="vel-pkg-modal-count"></span>
            </div>
            <div class="vel-pkg-modal__search-wrap">
              <svg class="vel-pkg-modal__search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" class="vel-pkg-modal__search" id="vel-pkg-modal-search" placeholder="Rechercher un titre..." />
            </div>
            <button type="button" class="vel-pkg-modal__close" id="vel-pkg-modal-close" aria-label="Fermer">✕</button>
          </div>
          <div class="vel-pkg-modal__body" id="vel-pkg-modal-body">
            <div class="vel-pkg-modal__loader">
              <div class="vel-pkg-modal__spinner"></div>
              <span>Chargement du contenu...</span>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeBtn = modal.querySelector("#vel-pkg-modal-close");
      const backdrop = modal.querySelector(".vel-pkg-modal__backdrop");
      const closeModal = () => {
        modal.classList.remove("is-open");
        document.body.classList.remove("vel-modal-active");
      };
      closeBtn.addEventListener("click", closeModal);
      backdrop.addEventListener("click", closeModal);
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
      });
    }

    const titleEl = modal.querySelector("#vel-pkg-modal-title");
    const countEl = modal.querySelector("#vel-pkg-modal-count");
    const searchInput = modal.querySelector("#vel-pkg-modal-search");
    const bodyEl = modal.querySelector("#vel-pkg-modal-body");

    const pkgTitle = formatPackageTitle(pkg.name);
    titleEl.textContent = pkgTitle;
    countEl.textContent = `${pkg.totalCount || pkg.items?.length || 0} ${tab === "series" ? "séries" : "films"}`;
    searchInput.value = "";

    bodyEl.innerHTML = `
      <div class="vel-pkg-modal__loader">
        <div class="vel-pkg-modal__spinner"></div>
        <span>Chargement du catalogue complet...</span>
      </div>
    `;

    modal.classList.add("is-open");
    document.body.classList.add("vel-modal-active");

    const allItems = await fetchPackageFullItems(tab, pkg);
    countEl.textContent = `${allItems.length} ${tab === "series" ? "séries" : "films"}`;

    function renderGrid(filterText = "") {
      const q = filterText.trim().toLowerCase();
      const filtered = q ? allItems.filter(it => (it.name || "").toLowerCase().includes(q) || (it.rawName || "").toLowerCase().includes(q)) : allItems;

      if (!filtered.length) {
        bodyEl.innerHTML = `<div class="vel-pkg-modal__empty">Aucun résultat trouvé pour « ${filterText} ».</div>`;
        return;
      }

      bodyEl.innerHTML = "";
      const grid = document.createElement("div");
      grid.className = "vel-pkg-modal__grid";

      filtered.forEach((item, idx) => {
        const card = document.createElement("div");
        card.className = "vel-pkg-modal__card";
        card.setAttribute("role", "button");
        card.tabIndex = 0;

        const thumbWrap = document.createElement("div");
        thumbWrap.className = "vel-pkg-modal__card-thumb";

        const thumb = item.posterUrl || item.thumbUrl || item.backdropUrl;
        if (thumb) {
          const img = document.createElement("img");
          img.alt = item.name;
          img.loading = "lazy";
          img.decoding = "async";
          img.src = thumb;
          img.onload = () => img.classList.add("is-loaded");
          img.onerror = () => { thumbWrap.innerHTML = `<div class="vel-prime-fallback"><div class="vel-prime-fallback__title">${stripTitle(item.name)}</div></div>`; };
          thumbWrap.appendChild(img);
        } else {
          thumbWrap.innerHTML = `<div class="vel-prime-fallback"><div class="vel-prime-fallback__title">${stripTitle(item.name)}</div></div>`;
        }

        const overlay = document.createElement("div");
        overlay.className = "vel-pkg-modal__card-overlay";
        overlay.innerHTML = '<div class="U6kOYF"><svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg></div>';

        const grad = document.createElement("div");
        grad.className = "dDns1P UhCVR_";

        const nameEl = document.createElement("div");
        nameEl.className = "vel-prime-card-title";
        nameEl.textContent = stripTitle(item.name);

        thumbWrap.append(overlay, grad, nameEl);
        card.appendChild(thumbWrap);

        const playAction = (e) => {
          e.stopPropagation();
          modal.classList.remove("is-open");
          document.body.classList.remove("vel-modal-active");
          openItem(tab, pkg, item, card);
        };

        card.addEventListener("click", playAction);
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") playAction(e);
        });

        grid.appendChild(card);
      });

      bodyEl.appendChild(grid);
    }

    renderGrid();

    searchInput.oninput = (e) => {
      renderGrid(e.target.value);
    };
  }

  // Build Hero Spotlight Banner
  function buildHeroSpotlight(tab, heroItem, pkg) {
    const isSeries = tab === "series";
    const hero = document.createElement("div");
    hero.className = "vel-netflix-hero";
    hero.dataset.heroItemId = String(heroItem.streamId || heroItem.id || "");

    const backdropWrap = document.createElement("div");
    backdropWrap.className = "vel-netflix-hero__backdrop-wrap";

    const backdropImg = document.createElement("img");
    backdropImg.className = "vel-netflix-hero__backdrop";
    backdropImg.alt = heroItem.name;
    backdropImg.loading = "eager";
    backdropImg.decoding = "async";

    const backdropUrl = heroItem.backdropUrl || heroItem.posterUrl || heroItem.thumbUrl || "";
    if (backdropUrl) {
      backdropImg.src = backdropUrl;
      backdropImg.onload = () => backdropImg.classList.add("is-loaded");
      backdropWrap.appendChild(backdropImg);
    }

    const gradient = document.createElement("div");
    gradient.className = "vel-netflix-hero__gradient";

    const content = document.createElement("div");
    content.className = "vel-netflix-hero__content";

    const badgeRow = document.createElement("div");
    badgeRow.className = "vel-netflix-hero__badge-row";

    const badge = document.createElement("span");
    badge.className = "vel-netflix-hero__badge";
    badge.innerHTML = isSeries ? "🍿 SÉRIE À LA UNE" : "🎬 FILM À LA UNE";
    badgeRow.appendChild(badge);

    const meta = document.createElement("span");
    meta.className = "vel-netflix-hero__meta";

    if (heroItem.rating) {
      const rating = document.createElement("span");
      rating.className = "vel-netflix-hero__rating";
      rating.textContent = `★ ${heroItem.rating}`;
      meta.appendChild(rating);
    }
    if (heroItem.year) {
      const year = document.createElement("span");
      year.textContent = heroItem.year;
      meta.appendChild(year);
    }
    const quality = document.createElement("span");
    quality.className = "vel-netflix-hero__quality";
    quality.textContent = "4K ULTRA HD";
    meta.appendChild(quality);
    badgeRow.appendChild(meta);

    const title = document.createElement("h1");
    title.className = "vel-netflix-hero__title";
    title.textContent = stripTitle(heroItem.name);

    const plot = document.createElement("p");
    plot.className = "vel-netflix-hero__plot";
    plot.textContent = heroItem.plot || (isSeries 
      ? "Plongez dans les épisodes complets en haute définition. Disponible immédiatement en streaming."
      : "Regardez ce film en haute qualité audio et vidéo dès maintenant.");

    const actions = document.createElement("div");
    actions.className = "vel-netflix-hero__actions";

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "vel-netflix-hero__btn-play";
    playBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
      <span>Regarder</span>
    `;
    playBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openItem(tab, pkg, heroItem, playBtn);
    });

    const infoBtn = document.createElement("button");
    infoBtn.type = "button";
    infoBtn.className = "vel-netflix-hero__btn-info";
    infoBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
      <span>Voir la catégorie</span>
    `;
    infoBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openPackageModal(tab, pkg);
    });

    actions.append(playBtn, infoBtn);
    content.append(badgeRow, title, plot, actions);
    hero.append(backdropWrap, gradient, content);
    return hero;
  }

  // Build a single Vertical Card inside a horizontal rail
  function buildCard(tab, pkg, item, index) {
    const li = document.createElement("li");
    li.className = "NQEYQF egDugf";
    li.dataset.index = String(index + 1);

    const article = document.createElement("article");
    article.className = "ulDoOY I3vXhO ae7h_p";
    article.dataset.cardTitle = item.name;
    article.dataset.cardPosition = String(index);
    article.dataset.testid = "card";

    const section = document.createElement("section");
    section.className = "qFCD8F Hbj8Gx";

    const packshot = document.createElement("div");
    packshot.className = "BVySw9 jaSqrZ";

    const btn = document.createElement("button");
    btn.className = "n17vJx";
    btn.setAttribute("aria-label", item.name);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openItem(tab, pkg, item, btn);
    });

    const lz = document.createElement("div");
    lz.className = "lz5SHd ITi_XJ";
    lz.style.aspectRatio = "2/3";

    const thumb = item.posterUrl || item.thumbUrl || item.backdropUrl;
    if (thumb) {
      const picture = document.createElement("picture");
      const img = document.createElement("img");
      img.alt = item.name;
      img.className = "dJLfVG X6Hqju znZ24z";
      img.style.aspectRatio = "2/3";
      img.loading = "lazy";
      img.decoding = "async";
      img.src = thumb;
      img.onload = () => { img.classList.add("is-ready"); lz.classList.add("is-loaded"); };
      img.onerror = () => { lz.innerHTML = `<div class="vel-prime-fallback"><div class="vel-prime-fallback__title">${stripTitle(item.name)}</div></div>`; };
      picture.appendChild(img);
      lz.appendChild(picture);
    } else {
      lz.innerHTML = `<div class="vel-prime-fallback"><div class="vel-prime-fallback__title">${stripTitle(item.name)}</div></div>`;
    }

    const overlay = document.createElement("div");
    overlay.className = "MaQfAR OhaBAC";
    overlay.innerHTML = '<div class="U6kOYF"><svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg></div>';

    const gradient = document.createElement("div");
    gradient.className = "dDns1P UhCVR_ fbl-gradient";

    const title = document.createElement("div");
    title.className = "vel-prime-card-title";
    title.textContent = stripTitle(item.name);

    packshot.append(btn, lz, overlay, gradient, title);
    section.appendChild(packshot);
    article.appendChild(section);
    li.appendChild(article);
    return li;
  }

  // Build and populate an active row
  function buildRow(tab, pkg) {
    const pkgTitle = formatPackageTitle(pkg.name);
    const items = Array.isArray(pkg.items) ? pkg.items : [];

    const wrapper = document.createElement("div");
    wrapper.dataset.testid = "navigation-carousel-wrapper";
    wrapper.className = "UI3iHJ";
    wrapper.dataset.packageId = String(pkg.id);

    const section = document.createElement("section");
    section.dataset.testid = "standard-carousel";

    const header = document.createElement("section");
    header.className = "QHjixV";

    const tvxg = document.createElement("span");
    tvxg.className = "TvxgS1";

    const h2 = document.createElement("h2");
    h2.className = "qwttco";
    h2.innerHTML = `<span data-testid="carousel-title"><span>${pkgTitle}</span></span>`;
    h2.style.cursor = "pointer";

    const seeMore = document.createElement("a");
    seeMore.href = "#";
    seeMore.className = "toEceS";
    seeMore.innerHTML = `
      <span class="IcIpJ_">Voir tout (${pkg.totalCount || items.length})</span>
      <svg class="_22qEau" viewBox="0 0 24 24" height="24" width="24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9.5 17.5l5-5-5-5"></path>
      </svg>
    `;

    const openPkg = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPackageModal(tab, pkg);
    };

    h2.addEventListener("click", openPkg);
    seeMore.addEventListener("click", openPkg);
    tvxg.append(h2, seeMore);
    header.appendChild(tvxg);

    const railWrap = document.createElement("div");
    railWrap.className = "vJYTdI LiEb2X UEOrk2 CHGlLt OH_E2I";

    const leftBtn = document.createElement("button");
    leftBtn.className = "Zaab8D kSwXPp vEZoyH iS7JPD";
    leftBtn.setAttribute("aria-label", "Défiler vers la gauche");
    leftBtn.innerHTML = '<div class="tImv1k"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></div>';

    const rightBtn = document.createElement("button");
    rightBtn.className = "Zaab8D kSwXPp vEZoyH u5kdG4";
    rightBtn.setAttribute("aria-label", "Défiler vers la droite");
    rightBtn.innerHTML = '<div class="tImv1k"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg></div>';

    const ul = document.createElement("ul");
    ul.className = "lw1NJZ";
    ul.dataset.testid = "card-container-list";

    items.forEach((item, idx) => {
      ul.appendChild(buildCard(tab, pkg, item, idx));
    });

    leftBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      ul.scrollBy({ left: -Math.max(260, ul.clientWidth * 0.75), behavior: "smooth" });
    });

    rightBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      ul.scrollBy({ left: Math.max(260, ul.clientWidth * 0.75), behavior: "smooth" });
    });

    railWrap.append(leftBtn, ul, rightBtn);
    section.append(header, railWrap);
    wrapper.appendChild(section);
    return wrapper;
  }

  // Render the full Netflix-style page feed instantly from precomputed cache
  async function render() {
    const tab = activeTab();
    const country = getActiveCountryId();
    const container = getContainer();

    if (!MEDIA_TABS.has(tab)) {
      container.style.setProperty("display", "none", "important");
      return;
    }

    container.style.removeProperty("display");

    const feedKey = `${country}:${tab}`;
    if (feedKey === lastFeedKey && container.children.length > 0) {
      return;
    }

    if (isRendering) return;
    isRendering = true;

    try {
      const feed = await fetchCountryMediaFeed(country, tab);
      let packages = feed && Array.isArray(feed.packages) ? feed.packages : [];

      // Always cross-reference and enrich items from appState if available
      const appState = typeof window.veloraGetState === "function" ? window.veloraGetState() : null;
      if (appState) {
        const streamMap = tab === "movies" ? appState.vodStreamsByCat : appState.seriesStreamsByCat;
        if (streamMap && streamMap.size > 0) {
          packages.forEach(pkg => {
            const rawList = streamMap.get(pkg.id) || streamMap.get(String(pkg.id)) || (pkg.category_id ? streamMap.get(String(pkg.category_id)) : null);
            if (Array.isArray(rawList) && rawList.length > 0) {
              pkg.totalCount = Math.max(pkg.totalCount || 0, rawList.length);

              const streamById = new Map();
              rawList.forEach(it => {
                const rawId = String(it.raw_stream_id ?? it.raw_series_id ?? it.stream_id ?? it.series_id ?? '');
                if (rawId) streamById.set(rawId, it);
              });

              if (Array.isArray(pkg.items) && pkg.items.length > 0) {
                // Enrich existing preview items with real vertical poster from appState
                pkg.items.forEach(it => {
                  const raw = streamById.get(String(it.streamId || ''));
                  if (raw) {
                    const { poster, backdrop } = extractMediaImages(raw);
                    if (poster) {
                      it.posterUrl = poster;
                      it.thumbUrl = poster;
                    }
                    if (backdrop) {
                      it.backdropUrl = backdrop;
                    }
                  }
                });
              } else {
                // Populate preview items if empty
                pkg.items = rawList.slice(0, 20).map((it, idx) => {
                  const rawId = it.raw_stream_id ?? it.raw_series_id ?? it.stream_id ?? it.series_id ?? idx;
                  const { poster, backdrop } = extractMediaImages(it);
                  return {
                    id: `feed:${pkg.id}:${rawId}`,
                    name: stripTitle(it.name || it.title || it.series_name || ""),
                    rawName: it.name || it.title || it.series_name || "",
                    thumbUrl: poster,
                    posterUrl: poster,
                    backdropUrl: backdrop,
                    rating: it.rating || it.rating_5based || it.score || "",
                    year: it.year || it.releaseDate || "",
                    plot: it.plot || it.description || it.overview || "",
                    streamId: rawId,
                    sourceId: it.nodecast_source_id ?? it.source_id,
                    globalStreamId: it.nodecast_global_stream_id ?? it.global_stream_id ?? rawId,
                    containerExtension: it.container_extension || "",
                    contentType: tab,
                    packageId: pkg.id
                  };
                });
              }
            }
          });
        }
      }

      // Filter packages that have preview items
      const validPackages = packages.filter(p => Array.isArray(p.items) && p.items.length > 0);

      if (!validPackages.length) {
        container.style.display = "none";
        return;
      }

      lastFeedKey = feedKey;
      container.innerHTML = "";

      // 1. Create top Hero Spotlight Banner from the first package with items
      const heroPkg = validPackages[0];
      if (heroPkg && heroPkg.items.length > 0) {
        const heroItem = heroPkg.items.find(it => it.backdropUrl || it.thumbUrl) || heroPkg.items[0];
        const heroEl = buildHeroSpotlight(tab, heroItem, heroPkg);
        container.appendChild(heroEl);
      }

      // 2. Render horizontal carousel rows (vertical cards)
      validPackages.forEach(pkg => {
        const rowEl = buildRow(tab, pkg);
        container.appendChild(rowEl);
      });

    } finally {
      isRendering = false;
    }
  }

  function syncHeaderForMediaTabs() {
    const tab = activeTab();
    const isMedia = MEDIA_TABS.has(tab);
    const homePage = document.getElementById("vel-home-empty-page");
    const isHome = tab === "home" || document.body.classList.contains("vel-home-empty-active") || (homePage && !homePage.classList.contains("hidden"));
    const contentView = document.getElementById("content-view");
    const vodPlayer = document.getElementById("vod-player-container");
    const livePlayer = document.getElementById("player-container");
    const isDetailOrPlayerOpen = (contentView && !contentView.classList.contains("hidden")) || (vodPlayer && !vodPlayer.classList.contains("hidden")) || (livePlayer && !livePlayer.classList.contains("hidden"));
    const stickyTop = document.querySelector(".vel-sticky-top");
    const velHeader = document.querySelector(".vel-header");
    let primeSearchBtn = document.getElementById("vel-prime-search-btn");
    const globalSearch = document.getElementById("vel-global-search");
    const primeContainer = document.getElementById("vel-prime-carousels-container");

    if (isHome) {
      if (primeContainer) primeContainer.style.setProperty("display", "none", "important");
      if (primeSearchBtn) primeSearchBtn.style.setProperty("display", "none", "important");
      if (velHeader) velHeader.style.setProperty("display", "none", "important");
      if (stickyTop && !isDetailOrPlayerOpen) stickyTop.style.setProperty("display", "none", "important");
      return;
    }

    if (isMedia && !isDetailOrPlayerOpen) {
      if (primeContainer) primeContainer.style.removeProperty("display");
      if (stickyTop) stickyTop.style.setProperty("display", "none", "important");
      if (velHeader) velHeader.style.setProperty("display", "none", "important");
      if (!primeSearchBtn) {
        primeSearchBtn = document.createElement("button");
        primeSearchBtn.id = "vel-prime-search-btn";
        primeSearchBtn.type = "button";
        primeSearchBtn.className = "vel-prime-search-btn vel-header-search-btn";
        primeSearchBtn.setAttribute("aria-label", "Rechercher");
        primeSearchBtn.setAttribute("title", "Recherche");
        primeSearchBtn.innerHTML = `
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M10.8 4a6.8 6.8 0 1 0 4.24 12.12l3.42 3.42a1 1 0 0 0 1.42-1.42l-3.42-3.42A6.8 6.8 0 0 0 10.8 4Zm0 2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6Z"></path>
          </svg>
        `;
        primeSearchBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          primeSearchBtn.classList.add("is-hidden");
          document.dispatchEvent(new CustomEvent("velora-open-search"));
        });
        document.body.appendChild(primeSearchBtn);
      }

      if (globalSearch && !globalSearch._primeObserverAttached) {
        globalSearch._primeObserverAttached = true;
        new MutationObserver(() => {
          const isOpen = !globalSearch.classList.contains("hidden");
          const btn = document.getElementById("vel-prime-search-btn");
          if (btn) {
            if (isOpen) btn.classList.add("is-hidden");
            else btn.classList.remove("is-hidden");
          }
        }).observe(globalSearch, { attributes: true, attributeFilter: ["class"] });
      }

      const isSearchOpen = globalSearch && !globalSearch.classList.contains("hidden");
      if (isSearchOpen) {
        primeSearchBtn.classList.add("is-hidden");
        primeSearchBtn.style.setProperty("display", "none", "important");
      } else {
        primeSearchBtn.classList.remove("is-hidden");
        primeSearchBtn.style.setProperty("display", "flex", "important");
      }
    } else {
      if (stickyTop) stickyTop.style.removeProperty("display");
      if (velHeader) velHeader.style.removeProperty("display");
      if (primeSearchBtn) {
        primeSearchBtn.style.setProperty("display", "none", "important");
      }
      if (primeContainer) {
        primeContainer.style.setProperty("display", "none", "important");
      }
    }
  }

  const cvEl = document.getElementById("content-view");
  if (cvEl) {
    new MutationObserver(() => {
      syncHeaderForMediaTabs();
    }).observe(cvEl, { attributes: true, attributeFilter: ["class"] });
  }

  const vpEl = document.getElementById("vod-player-container");
  if (vpEl) {
    new MutationObserver(() => {
      syncHeaderForMediaTabs();
    }).observe(vpEl, { attributes: true, attributeFilter: ["class"] });
  }

  // Listeners & Lifecycle
  document.addEventListener("velora-home-tab", () => {
    lastFeedKey = "";
    syncHeaderForMediaTabs();
    setTimeout(render, 30);
  });

  document.addEventListener("velora-country-change", () => {
    lastFeedKey = "";
    feedCache.clear();
    packageFullItemsCache.clear();
    syncHeaderForMediaTabs();
    setTimeout(render, 30);
  });

  // When Xtream catalog data finishes loading in background, refresh posters if needed
  window.addEventListener("velora-vod-ready", () => {
    lastFeedKey = "";
    syncHeaderForMediaTabs();
    render();
  });
  window.addEventListener("velora-series-ready", () => {
    lastFeedKey = "";
    syncHeaderForMediaTabs();
    render();
  });

  const countrySelect = document.getElementById("country-select");
  if (countrySelect) {
    countrySelect.addEventListener("change", () => {
      lastFeedKey = "";
      feedCache.clear();
      packageFullItemsCache.clear();
      syncHeaderForMediaTabs();
      setTimeout(render, 30);
    });
  }

  new MutationObserver(() => {
    const tab = activeTab();
    syncHeaderForMediaTabs();
    if (MEDIA_TABS.has(tab)) {
      render();
    } else {
      const c = document.getElementById("vel-prime-carousels-container");
      if (c) c.style.display = "none";
    }
  }).observe(document.body, {
    attributes: true,
    attributeFilter: ["data-vel-active-tab"]
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      syncHeaderForMediaTabs();
      render();
    }, { once: true });
  } else {
    syncHeaderForMediaTabs();
    render();
  }
})();

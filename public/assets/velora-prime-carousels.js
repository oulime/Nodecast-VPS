/**
 * Velora Netflix-Style Multi-Row Carousel Feed
 * Powered by VPS Precomputed Media Feed Cache (/api/velora-db/country-media-feed)
 */
(() => {
  "use strict";

  const MEDIA_TABS = new Set(["movies", "series"]);
  let isRendering = false;
  let lastFeedKey = "";
  const feedCache = new Map(); // key: `${countryId}:${tab}` -> feedData

  function activeTab() {
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
    openFullPackage(pkg);
  }

  // Open Full Package View on demand ("Voir tout" / "Voir plus")
  function openFullPackage(pkg) {
    if (typeof window.veloraActivateMediaPackage === "function") {
      window.veloraActivateMediaPackage(pkg.id);
      return;
    }
    const packagesView = document.getElementById("packages-view");
    if (packagesView) {
      const card = packagesView.querySelector(`.vel-package-card[data-package-id="${pkg.id}"]`);
      if (card) {
        card.click();
        return;
      }
    }
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

    const backdropUrl = heroItem.backdropUrl || heroItem.thumbUrl || "";
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
      openFullPackage(pkg);
    });

    actions.append(playBtn, infoBtn);
    content.append(badgeRow, title, plot, actions);
    hero.append(backdropWrap, gradient, content);
    return hero;
  }

  // Build a single Card inside a horizontal rail
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
    lz.style.aspectRatio = "16/9";

    const thumb = item.backdropUrl || item.thumbUrl;
    if (thumb) {
      const picture = document.createElement("picture");
      const img = document.createElement("img");
      img.alt = item.name;
      img.className = "dJLfVG X6Hqju znZ24z";
      img.style.aspectRatio = "16/9";
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
      openFullPackage(pkg);
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
      ul.scrollBy({ left: -Math.max(320, ul.clientWidth * 0.75), behavior: "smooth" });
    });

    rightBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      ul.scrollBy({ left: Math.max(320, ul.clientWidth * 0.75), behavior: "smooth" });
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
      container.style.display = "none";
      return;
    }

    container.style.display = "flex";

    const feedKey = `${country}:${tab}`;
    if (feedKey === lastFeedKey && container.children.length > 0) {
      return;
    }

    if (isRendering) return;
    isRendering = true;

    try {
      const feed = await fetchCountryMediaFeed(country, tab);
      let packages = feed && Array.isArray(feed.packages) ? feed.packages : [];

      // If server feed has packages without preview items, hydrate from appState if populated
      const appState = typeof window.veloraGetState === "function" ? window.veloraGetState() : null;
      if (appState) {
        const streamMap = tab === "movies" ? appState.vodStreamsByCat : appState.seriesStreamsByCat;
        if (streamMap && streamMap.size > 0) {
          packages.forEach(pkg => {
            if (!Array.isArray(pkg.items) || pkg.items.length === 0) {
              const rawList = streamMap.get(pkg.id) || streamMap.get(String(pkg.id)) || (pkg.category_id ? streamMap.get(String(pkg.category_id)) : null);
              if (Array.isArray(rawList) && rawList.length > 0) {
                pkg.items = rawList.slice(0, 20).map((it, idx) => {
                  const rawId = it.raw_stream_id ?? it.raw_series_id ?? it.stream_id ?? it.series_id ?? idx;
                  let thumb = it.backdrop_path || it.backdrop || it.backdrop_url || it.cover_big || it.movie_image || it.series_image || it.stream_icon || it.cover || "";
                  if (Array.isArray(thumb) && thumb.length > 0) thumb = thumb[0];
                  if (typeof thumb === "string" && thumb.startsWith("/")) thumb = "https://image.tmdb.org/t/p/w780" + thumb;
                  return {
                    id: `feed:${pkg.id}:${rawId}`,
                    name: stripTitle(it.name || it.title || it.series_name || ""),
                    rawName: it.name || it.title || it.series_name || "",
                    thumbUrl: thumb,
                    backdropUrl: thumb,
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
                pkg.totalCount = Math.max(pkg.totalCount || 0, rawList.length);
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

      // 2. Render horizontal carousel rows
      validPackages.forEach(pkg => {
        const rowEl = buildRow(tab, pkg);
        container.appendChild(rowEl);
      });

    } finally {
      isRendering = false;
    }
  }

  // Listeners & Lifecycle
  document.addEventListener("velora-home-tab", () => {
    lastFeedKey = "";
    setTimeout(render, 30);
  });

  document.addEventListener("velora-country-change", () => {
    lastFeedKey = "";
    feedCache.clear();
    setTimeout(render, 30);
  });

  const countrySelect = document.getElementById("country-select");
  if (countrySelect) {
    countrySelect.addEventListener("change", () => {
      lastFeedKey = "";
      feedCache.clear();
      setTimeout(render, 30);
    });
  }

  new MutationObserver(() => {
    const tab = activeTab();
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
    document.addEventListener("DOMContentLoaded", render, { once: true });
  } else {
    render();
  }
})();

(function () {
  "use strict";
  var storageKey = "velora.home-cache.first-paint.v1";
  var cachePayload = null;
  var cacheRequests = new Map();
  var cacheCountryId = "";
  var cacheUpdatedAt = 0;
  var registeredHomeCards = new WeakMap();
  var homeTouchGesture = null;
  var nativeTouchGesture = null;
  var lastDirectTouchCard = null;
  var lastDirectTouchAt = 0;
  var homeRootObserver = null;
  var renderVersion = 0;
  var railPageSize = 36;

  function activateDirectTouch(card, payload) {
    var now = Date.now();
    if (card === lastDirectTouchCard && now - lastDirectTouchAt < 650) return;
    lastDirectTouchCard = card;
    lastDirectTouchAt = now;
    window.veloraOpenHomeCacheEntry(payload.section, payload.entry, card);
  }

  window.veloraBindHomeCardActivation = function (card, section, entry) {
    if (card) registeredHomeCards.set(card, { section: section, entry: entry });
  };

  document.addEventListener("pointerdown", function (event) {
    // Use the same direct activation path for mouse and touch. A plain click
    // is not reliable on desktop because the app also installs global pointer
    // handlers (notably for TV navigation) which can consume the later click.
    // Tracking pointer movement still lets users drag a horizontal rail
    // without accidentally opening a card.
    if (event.pointerType === "mouse" && event.button !== 0) return;
    var card = event.target instanceof Element && event.target.closest(".vel-home-section__card");
    if (!card || !registeredHomeCards.has(card)) return;
    homeTouchGesture = { card: card, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  }, true);
  document.addEventListener("pointermove", function (event) {
    var gesture = homeTouchGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 12) gesture.moved = true;
  }, true);
  document.addEventListener("pointerup", function (event) {
    var gesture = homeTouchGesture;
    homeTouchGesture = null;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.moved) return;
    var payload = registeredHomeCards.get(gesture.card);
    if (!payload) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    activateDirectTouch(gesture.card, payload);
  }, true);
  document.addEventListener("pointercancel", function () { homeTouchGesture = null; }, true);
  document.addEventListener("touchstart", function (event) {
    var touch = event.touches && event.touches[0];
    var card = event.target instanceof Element && event.target.closest(".vel-home-section__card");
    if (!touch || !card || !registeredHomeCards.has(card)) return;
    nativeTouchGesture = { card: card, x: touch.clientX, y: touch.clientY, moved: false };
  }, { capture: true, passive: true });
  document.addEventListener("touchmove", function (event) {
    var gesture = nativeTouchGesture;
    var touch = event.touches && event.touches[0];
    if (!gesture || !touch) return;
    if (Math.hypot(touch.clientX - gesture.x, touch.clientY - gesture.y) > 12) gesture.moved = true;
  }, { capture: true, passive: true });
  document.addEventListener("touchend", function (event) {
    var gesture = nativeTouchGesture;
    nativeTouchGesture = null;
    if (!gesture || gesture.moved) return;
    var payload = registeredHomeCards.get(gesture.card);
    if (!payload || gesture.card.dataset.homeOpenPending === "true") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    activateDirectTouch(gesture.card, payload);
  }, { capture: true, passive: false });
  document.addEventListener("touchcancel", function () { nativeTouchGesture = null; }, { capture: true, passive: true });

  window.veloraLoadHomeCache = function (force) {
    // Several legacy modules ask for a "forced" load during startup.  Treat
    // those as the same request when the payload was just obtained; an actual
    // admin invalidation still refreshes after this small coalescing window.
    var countryId = activeCountryId();
    if (cachePayload && cacheCountryId === countryId && (!force || Date.now() - cacheUpdatedAt < 1000)) return Promise.resolve(cachePayload);
    if (cacheRequests.has(countryId)) return cacheRequests.get(countryId);
    var request = fetch("/api/velora-db/home-cache?country_id=" + encodeURIComponent(countryId) + "&limit=10", {
      cache: force ? "reload" : "force-cache"
    }).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    }).then(function (payload) {
      // A late response for the old country must never replace the current
      // country view or its cache entry.
      if (activeCountryId() === countryId) {
        cachePayload = payload;
        cacheCountryId = countryId;
        cacheUpdatedAt = Date.now();
        window.veloraHomeCachePayload = payload;
      }
      return payload;
    }).finally(function () { cacheRequests.delete(countryId); });
    cacheRequests.set(countryId, request);
    return request;
  };

  window.veloraInvalidateHomeCache = function () {
    cachePayload = null;
    cacheCountryId = "";
    cacheUpdatedAt = 0;
    cacheRequests.clear();
    window.veloraHomeCachePayload = null;
  };

  function loadSectionPage(section, offset) {
    var countryId = activeCountryId();
    return fetch("/api/velora-db/home-cache?country_id=" + encodeURIComponent(countryId) +
      "&section_id=" + encodeURIComponent(section.id) + "&offset=" + offset + "&limit=10", {
      cache: "force-cache"
    }).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    }).then(function (payload) {
      return Array.isArray(payload.sections) && payload.sections[0] ? payload.sections[0] : null;
    });
  }

  function activeCountryId() {
    var select = document.getElementById("country-select");
    return select ? String(select.value || "") : "";
  }

  function revealEntry(section, entry) {
    delete document.body.dataset.velTopLevel;
    document.body.dataset.veloraReturnHome = "true";
    document.body.classList.remove("vel-home-empty-active");
    var homePage = document.getElementById("vel-home-empty-page");
    if (homePage) {
      homePage.classList.add("hidden");
      homePage.setAttribute("aria-hidden", "true");
    }
    document.dispatchEvent(new CustomEvent("velora-home-media-open", {
      detail: { title: entry.name || "", contentType: section.content_type }
    }));
    document.querySelectorAll("[data-bottom-nav]").forEach(function (button) {
      var active = button.getAttribute("data-bottom-nav") === "home";
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    window.veloraOpenCachedHomeItem(section, entry);
  }

  window.veloraOpenHomeCacheEntry = function (section, entry, button) {
    if (!entry || entry.streamId == null) return;
    if (button && button.dataset.homeOpenPending === "true") return;
    if (button) {
      button.dataset.homeOpenPending = "true";
      button.classList.add("is-opening");
      button.setAttribute("aria-busy", "true");
    }
    var started = Date.now();
    function finish() {
      if (button) {
        delete button.dataset.homeOpenPending;
        button.classList.remove("is-opening");
        button.removeAttribute("aria-busy");
      }
    }
    function attempt() {
      var ready = typeof window.veloraHomeCatalogReady !== "function" || window.veloraHomeCatalogReady();
      if (ready && typeof window.veloraOpenCachedHomeItem === "function") {
        finish();
        revealEntry(section, entry);
        return;
      }
      if (Date.now() - started >= 20000) {
        finish();
        return;
      }
      try { window.veloraForceAutoconnect && window.veloraForceAutoconnect(); } catch (error) {}
      window.setTimeout(attempt, 120);
    }
    attempt();
  };

  function createCard(section, entry) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "vel-home-section__card vel-home-section__card--" + section.content_type;
    card.setAttribute("aria-label", entry.name || "");
    var media;
    if (entry.thumbUrl) {
      media = document.createElement("img");
      card.classList.add("is-poster-loading");
      media.alt = "";
      media.loading = "lazy";
      media.decoding = "async";
      media.src = entry.thumbUrl;
      media.addEventListener("load", function () {
        card.classList.remove("is-poster-loading");
        card.classList.add("is-poster-ready");
      }, { once: true });
      media.addEventListener("error", function () {
        card.classList.remove("is-poster-loading");
        media.removeAttribute("src");
        media.classList.add("vel-home-section__fallback");
      });
    } else {
      media = document.createElement("span");
      media.classList.add("vel-home-section__fallback");
      media.textContent = "▶";
    }
    media.classList.add("vel-home-section__media");
    var name = document.createElement("span");
    name.className = "vel-home-section__name";
    name.textContent = entry.name || "";
    card.append(media, name);
    window.veloraBindHomeCardActivation(card, section, entry);
    card.addEventListener("click", function () { window.veloraOpenHomeCacheEntry(section, entry, card); });
    return card;
  }

  function matchingSections(payload) {
    var sections = payload && Array.isArray(payload.sections) ? payload.sections : [];
    var countryId = activeCountryId();
    var matching = sections.filter(function (section) {
      return section.published !== false && String(section.country_id || "") === countryId;
    });
    if (!matching.length) {
      matching = sections.filter(function (section) {
        return section.published !== false && (!section.country_id || section.country_id === "default");
      });
    }
    return matching.sort(function (a, b) {
      return (Number(a.section_order) || 0) - (Number(b.section_order) || 0);
    });
  }

  function revealHomeFirstPaint() {
    if (document.body.classList.contains("vel-country-switch-loading")) return;
    var homeButton = document.querySelector('[data-bottom-nav="home"]');
    var homePage = document.getElementById("vel-home-empty-page");
    var homeIsActuallyVisible = !!homePage &&
      !homePage.classList.contains("hidden") &&
      homePage.getAttribute("aria-hidden") !== "true";
    var isHome = homeIsActuallyVisible ||
      document.body.classList.contains("vel-home-empty-active") ||
      (homeButton && homeButton.classList.contains("is-active") && !document.body.dataset.velTopLevel);
    if (!isHome) return;
    var overlay = document.getElementById("catalog-loading-overlay");
    if (overlay) {
      overlay.classList.add("hidden");
      overlay.setAttribute("aria-hidden", "true");
    }
  }

  function releaseStaleHomeLoader() {
    if (document.body.classList.contains("vel-country-switch-loading")) return;
    var homePage = document.getElementById("vel-home-empty-page");
    var cards = document.querySelector("#vel-home-sections .vel-home-section__card");
    if (!homePage || homePage.classList.contains("hidden") || !cards) return;
    var overlay = document.getElementById("catalog-loading-overlay");
    if (overlay) {
      overlay.classList.add("hidden");
      overlay.setAttribute("aria-hidden", "true");
    }
  }

  function renderSkeleton(payload) {
    var root = document.getElementById("vel-home-sections");
    if (!root || root.children.length) return false;
    var sections = matchingSections(payload);
    if (!sections.length) return false;
    root.replaceChildren();
    sections.forEach(function (section) {
      var block = document.createElement("section");
      block.className = "vel-home-section vel-home-section--skeleton";
      var heading = document.createElement("h3");
      heading.className = "vel-home-section__heading";
      heading.textContent = section.title || "";
      var rail = document.createElement("div");
      rail.className = "vel-home-section__rail";
      var count = Math.max(4, Math.min(8, Array.isArray(section.entries) ? section.entries.length : 6));
      for (var index = 0; index < count; index += 1) {
        var placeholder = document.createElement("span");
        placeholder.className = "vel-home-section__skeleton vel-home-section__skeleton--" + section.content_type;
        placeholder.setAttribute("aria-hidden", "true");
        rail.appendChild(placeholder);
      }
      block.append(heading, rail);
      root.appendChild(block);
    });
    revealHomeFirstPaint();
    return true;
  }

  function appendRailPage(rail, section, entries, start) {
    var end = Math.min(entries.length, start + railPageSize);
    var fragment = document.createDocumentFragment();
    for (var index = start; index < end; index += 1) fragment.appendChild(createCard(section, entries[index]));
    rail.appendChild(fragment);
    var total = Number(section.entryCount || entries.length);
    if (end >= total) return;
    var more = document.createElement("button");
    more.type = "button";
    more.className = "vel-home-section__more";
    more.textContent = "Voir plus";
    more.addEventListener("click", function () {
      more.disabled = true;
      more.textContent = "Chargement…";
      more.remove();
      loadSectionPage(section, end).then(function (page) {
        if (!page) return;
        var nextEntries = entries.concat(Array.isArray(page.entries) ? page.entries : []);
        section.entryCount = page.entryCount || total;
        window.setTimeout(function () { appendRailPage(rail, section, nextEntries, end); }, 0);
      }).catch(function () {});
    }, { once: true });
    rail.appendChild(more);
  }

  function render(payload) {
    var root = document.getElementById("vel-home-sections");
    if (!root) return false;
    var version = ++renderVersion;
    var matching = matchingSections(payload);
    var fragment = document.createDocumentFragment();
    matching.forEach(function (section) {
      var block = document.createElement("section");
      block.className = "vel-home-section";
      var heading = document.createElement("h3");
      heading.className = "vel-home-section__heading";
      heading.textContent = section.title || "";
      var rail = document.createElement("div");
      rail.className = "vel-home-section__rail";
      var entries = Array.isArray(section.entries) ? section.entries : [];
      var sourceCounts = {};
      entries.forEach(function (entry) {
        var source = String(entry.sourceId || "");
        if (source) sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      });
      var dominantSource = Object.keys(sourceCounts).sort(function (a, b) {
        return sourceCounts[b] - sourceCounts[a];
      })[0];
      var filteredEntries = entries.filter(function (entry) {
        return !dominantSource || String(entry.sourceId || "") === dominantSource;
      });
      appendRailPage(rail, section, filteredEntries, 0);
      block.append(heading, rail);
      fragment.appendChild(block);
    });
    if (version !== renderVersion) return false;
    root.replaceChildren(fragment);
    revealHomeFirstPaint();
    return !!root.querySelector(".vel-home-section__card");
  }

  function protectRenderedHome(payload) {
    var root = document.getElementById("vel-home-sections");
    if (!root || homeRootObserver) return;
    homeRootObserver = new MutationObserver(function () {
      window.setTimeout(function () {
        if (!root.querySelector(".vel-home-section__card")) render(payload);
      }, 80);
    });
    homeRootObserver.observe(root, { childList: true, subtree: true });
  }

  async function loadAndRender() {
    var countrySelect = document.getElementById("country-select");
    var requestedCountry = activeCountryId();
    if (typeof window.veloraIsStartupCountryReady === "function" &&
        !window.veloraIsStartupCountryReady(countrySelect)) {
      if (countrySelect && countrySelect.options && countrySelect.options.length) {
        window.setTimeout(function () {
          if (window.veloraIsStartupCountryReady(countrySelect)) loadAndRender();
        }, 0);
      }
      return;
    }
    try {
      var stored = sessionStorage.getItem(storageKey);
      if (stored) renderSkeleton(JSON.parse(stored));
    } catch (error) {}
    try {
      var payload = await window.veloraLoadHomeCache(false);
      if (activeCountryId() !== requestedCountry) return;
      protectRenderedHome(payload);
      try { sessionStorage.setItem(storageKey, JSON.stringify(payload)); } catch (error) {}
      renderSkeleton(payload);
      window.veloraHomeCacheFirstPaintReady = true;
      document.body.dataset.veloraLoadStage = "home";
      document.dispatchEvent(new CustomEvent("velora-home-cache-ready", {
        detail: { countryId: activeCountryId() }
      }));
      // Give the canonical renderer a brief chance to paint the provider-ordered
      // cards. If it was interrupted by another startup script, never leave Home
      // empty (or stuck on skeletons): the cache is already stored in provider
      // order and is a safe real-content fallback.
      window.setTimeout(function () {
        var root = document.getElementById("vel-home-sections");
        if (!root || !root.querySelector(".vel-home-section__card")) render(payload);
      }, 350);
    } catch (error) {}
  }

  document.addEventListener("velora-app-ready", loadAndRender);
  document.addEventListener("velora-countries-ready", loadAndRender);
  document.getElementById("country-select")?.addEventListener("change", loadAndRender);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadAndRender, { once: true });
  } else {
    loadAndRender();
  }
  // Country options are populated asynchronously by the bundled application.
  // Its ready event can happen before this listener is attached, so always run
  // a couple of idempotent late passes as well.
  window.setTimeout(loadAndRender, 500);
  window.setTimeout(loadAndRender, 1800);
  window.setTimeout(releaseStaleHomeLoader, 1200);
  window.setTimeout(releaseStaleHomeLoader, 3000);
})();

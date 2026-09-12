(function () {
  "use strict";
  var storageKey = "velora.home-cache.first-paint.v4";
  var cachePayload = null;
  var cacheRequests = new Map();
  var cachePayloads = new Map();
  var cacheUpdatedAtByCountry = new Map();
  var cacheCountryId = "";
  var cacheUpdatedAt = 0;
  var registeredHomeCards = new WeakMap();
  var homeTouchGesture = null;
  var nativeTouchGesture = null;
  var lastDirectTouchCard = null;
  var lastDirectTouchAt = 0;
  var homeRootObserver = null;
  var renderVersion = 0;
  var railPageSize = 20;

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
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(".vel-resume-remove-btn, [data-prevent-card-open]")) return;
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
    if (event.target instanceof Element && event.target.closest(".vel-resume-remove-btn, [data-prevent-card-open]")) return;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.moved) return;
    var payload = registeredHomeCards.get(gesture.card);
    if (!payload) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    activateDirectTouch(gesture.card, payload);
  }, true);
  document.addEventListener("pointercancel", function () { homeTouchGesture = null; }, true);
  document.addEventListener("touchstart", function (event) {
    if (event.target instanceof Element && event.target.closest(".vel-resume-remove-btn, [data-prevent-card-open]")) return;
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
    if (event.target instanceof Element && event.target.closest(".vel-resume-remove-btn, [data-prevent-card-open]")) return;
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
    var countryPayload = cachePayloads.get(countryId);
    var countryUpdatedAt = cacheUpdatedAtByCountry.get(countryId) || 0;
    if (!force && countryPayload && Date.now() - countryUpdatedAt < 60000) {
      cachePayload = countryPayload;
      cacheCountryId = countryId;
      cacheUpdatedAt = countryUpdatedAt;
      window.veloraHomeCachePayload = countryPayload;
      return Promise.resolve(countryPayload);
    }
    if (cacheRequests.has(countryId)) return cacheRequests.get(countryId);
    var request = fetch("/api/velora-db/home-cache?country_id=" + encodeURIComponent(countryId) + "&limit=20", {
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
      cachePayloads.set(countryId, payload);
      cacheUpdatedAtByCountry.set(countryId, Date.now());
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
    cachePayloads.clear();
    cacheUpdatedAtByCountry.clear();
    window.veloraHomeCachePayload = null;
  };

  function loadSectionPage(section, offset) {
    var countryId = activeCountryId();
    return fetch("/api/velora-db/home-cache?country_id=" + encodeURIComponent(countryId) +
      "&section_id=" + encodeURIComponent(section.id) + "&offset=" + offset + "&limit=20", {
      cache: "force-cache"
    }).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    }).then(function (payload) {
      return Array.isArray(payload.sections) && payload.sections[0] ? payload.sections[0] : null;
    });
  }

  function activeCountryId() {
    if (typeof window.veloraGetActiveCountryId === "function") {
      var id = window.veloraGetActiveCountryId();
      if (id) return String(id);
    }
    var select = document.getElementById("country-select") || document.getElementById("home-country-select");
    if (select && select.value) return String(select.value);
    try {
      var saved = localStorage.getItem("lumina_selected_country_id") || sessionStorage.getItem("lumina_selected_country_id");
      if (saved) return String(saved);
    } catch (_) {}
    return "country_france";
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
    if (entry && (entry.isResumeCard || entry.rawItem) && typeof window.veloraResumePlayback === "function") {
      window.veloraResumePlayback(entry.rawItem || entry);
      return;
    }
    document.dispatchEvent(new CustomEvent("velora-home-media-open", {
      detail: { title: entry.name || "", contentType: section.content_type }
    }));
    var targetTab = section.content_type === "movies" ? "movies" : section.content_type === "series" ? "series" : section.content_type === "live" ? "live" : "home";
    document.querySelectorAll("[data-bottom-nav]").forEach(function (button) {
      var active = button.getAttribute("data-bottom-nav") === targetTab;
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

  var clientBackdropCache = new Map();
  function veloraEnsureCardBackdrop(card, media, section, entry) {
    if (entry && (entry.has_integrated_title || entry.horizontal_thumb)) return;
    if (card && card.classList.contains("has-integrated-title")) return;
    var key = String(entry.sourceId || "") + ":" + String(entry.streamId || "") + ":" + String(entry.name || "");
    if (clientBackdropCache.has(key)) {
      var cached = clientBackdropCache.get(key);
      if (cached && media.tagName === "IMG" && media.src !== cached) {
        media.src = cached;
      }
      return;
    }
    var currentSrc = media.tagName === "IMG" ? (media.src || "") : "";
    if (currentSrc.includes("/w1280") || currentSrc.includes("/w780") || (entry.backdropUrl && entry.backdropUrl !== entry.thumbUrl)) {
      clientBackdropCache.set(key, entry.backdropUrl || currentSrc);
      return;
    }
    var url = "/api/velora-db/media-backdrop?name=" + encodeURIComponent(entry.name || "") +
              "&type=" + encodeURIComponent(section.content_type || "movies") +
              "&stream_id=" + encodeURIComponent(entry.streamId || "") +
              "&source_id=" + encodeURIComponent(entry.sourceId || "");
    fetch(url, { cache: "force-cache" })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data && data.ok && data.backdropUrl) {
          clientBackdropCache.set(key, data.backdropUrl);
          entry.backdropUrl = data.backdropUrl;
          entry.thumbUrl = data.backdropUrl;
          if (media.tagName === "IMG") {
            if (typeof window.veloraSetHomeImageSource === "function") {
              window.veloraSetHomeImageSource(media, data.backdropUrl, function() {
                media.removeAttribute("src");
                media.classList.add("vel-home-section__fallback");
              });
            } else {
              media.src = data.backdropUrl;
              media.classList.remove("vel-home-section__fallback");
            }
          }
        }
      })
      .catch(function() {});
  }
  window.veloraEnsureCardBackdrop = veloraEnsureCardBackdrop;

  function createCard(section, entry) {
    var card = document.createElement("button");
    var isHorizontal = (section && section.card_orientation === "horizontal") || (entry && entry.card_orientation === "horizontal");
    card.type = "button";
    card.className = "vel-home-section__card vel-home-section__card--" + section.content_type + (isHorizontal ? " vel-home-section__card--horizontal" : "");
    var cleanTitle = String(entry.name || "").trim();
    if (typeof window.veloraApplyHomeChannelRules === "function") {
      var processed = window.veloraApplyHomeChannelRules(section, [entry]);
      if (processed && processed[0] && processed[0].name) cleanTitle = processed[0].name;
    } else {
      for (var p = 0; p < 5; p += 1) {
        var next = cleanTitle
          .replace(/^[\[\(][A-Z0-9\+\-\s]{1,12}[\]\)]\s*[-:|•]?\s*/i, "")
          .replace(/^([0-9]+K|[0-9]+D|HD|FHD|UHD|4K|VF|VOSTFR|VO|FR|AR|EN|UK|US|ES|DE|IT|PT|TR|NL|RU|PL|RO|MULTI|TRUEFRENCH|FRENCH)(\s*[-:|•]\s*|\s+)/i, "")
          .replace(/\s*([\[\(][A-Z0-9\+\-\s]{1,12}[\]\)]|\b(HD|FHD|UHD|4K|VF|VOSTFR|VO|FR|AR|EN|UK|US|ES|DE|IT|PT|TR|NL|RU|PL|RO|MULTI|TRUEFRENCH|FRENCH)\b)$/i, "")
          .replace(/\s*[-:|•]\s*$/g, "")
          .trim();
        if (next === cleanTitle || !next) break;
        cleanTitle = next;
      }
    }
    card.setAttribute("aria-label", cleanTitle || entry.name || "");
    card.dataset.packageId = String(section.package_id || entry.packageId || "");
    card.dataset.contentType = String(section.content_type || entry.contentType || "");
    var media, imgUrl = isHorizontal ? (entry.horizontal_thumb || entry.backdropUrl || entry.backdrop || entry.thumbUrl) : (entry.thumbUrl || entry.backdropUrl || entry.backdrop);
    if (imgUrl) {
      media = document.createElement("img");
      card.classList.add("is-poster-loading");
      media.alt = "";
      media.loading = "lazy";
      media.decoding = "async";
      media.addEventListener("load", function () {
        card.classList.remove("is-poster-loading");
        card.classList.add("is-poster-ready");
      }, { once: true });
      var markImageFailed = function () {
        card.classList.remove("is-poster-loading");
        media.removeAttribute("src");
        media.classList.add("vel-home-section__fallback");
      };
      if (typeof window.veloraSetHomeImageSource === "function") {
        window.veloraSetHomeImageSource(media, imgUrl, markImageFailed);
      } else {
        media.addEventListener("error", markImageFailed, { once: true });
        media.src = imgUrl;
      }
    } else {
      media = document.createElement("span");
      media.classList.add("vel-home-section__fallback");
      media.textContent = "▶";
    }
    media.classList.add("vel-home-section__media");
    var name = document.createElement("span");
    name.className = "vel-home-section__name";
    name.textContent = cleanTitle || entry.name || "";
    card.append(media, name);
    if (isHorizontal) {
      var hasIntegratedTitle = Boolean(entry.has_integrated_title || entry.horizontal_thumb);
      if (hasIntegratedTitle) {
        card.classList.add("has-integrated-title");
      } else {
        var titleLogoUrl = String(entry.title_logo || entry.titleLogo || entry.logo || "").trim();
        var applyTitleLogo = function (url) {
          if (!url || url === "NONE") return;
          if (card.querySelector(".vel-home-section__title-logo")) return;
          card.classList.add("has-title-logo");
          var logoImg = document.createElement("img");
          logoImg.className = "vel-home-section__title-logo";
          logoImg.alt = cleanTitle || entry.name || "";
          logoImg.loading = "lazy";
          logoImg.decoding = "async";
          var smartScale = function () {
            var nw = logoImg.naturalWidth, nh = logoImg.naturalHeight;
            if (nw && nh) {
              var r = nw / nh;
              if (r >= 2.4) logoImg.classList.add("vel-title-logo--wide");
              else if (r <= 1.45) logoImg.classList.add("vel-title-logo--tall");
              else logoImg.classList.add("vel-title-logo--standard");
            }
          };
          logoImg.onload = smartScale;
          logoImg.onerror = function () {
            card.classList.remove("has-title-logo");
            logoImg.remove();
          };
          logoImg.src = url;
          if (logoImg.complete) smartScale();
          card.appendChild(logoImg);
        };
        if (titleLogoUrl) {
          applyTitleLogo(titleLogoUrl);
        } else if (cleanTitle && (section.content_type === "movies" || section.content_type === "series" || entry.contentType === "movies" || entry.contentType === "series")) {
          var cType = section.content_type || entry.contentType || "movies";
          if (!window.__veloraFetchingLogos) window.__veloraFetchingLogos = new Map();
          var logoKey = cType + ":" + cleanTitle.toLowerCase();
          if (!window.__veloraFetchingLogos.has(logoKey)) {
            var p = fetch("/api/velora-db/title-logo?name=" + encodeURIComponent(cleanTitle) + "&type=" + encodeURIComponent(cType))
              .then(function (r) { return r.ok ? r.json() : null; })
              .then(function (data) {
                if (data && data.hasHorizontalThumb && data.thumbUrl) {
                  entry.horizontal_thumb = data.thumbUrl;
                  entry.has_integrated_title = true;
                  entry.backdropUrl = data.thumbUrl;
                  entry.thumbUrl = data.thumbUrl;
                  delete entry.title_logo;
                  return { type: "thumb", url: data.thumbUrl };
                }
                if (data && data.url) {
                  entry.title_logo = data.url;
                  return { type: "logo", url: data.url };
                }
                return null;
              })
              .catch(function () { return null; });
            window.__veloraFetchingLogos.set(logoKey, p);
          }
          window.__veloraFetchingLogos.get(logoKey).then(function (res) {
            if (!res) return;
            if (res.type === "thumb" && res.url) {
              card.classList.add("has-integrated-title");
              card.classList.remove("has-title-logo");
              var exLogo = card.querySelector(".vel-home-section__title-logo");
              if (exLogo) exLogo.remove();
              if (media.tagName === "IMG") {
                if (typeof window.veloraSetHomeImageSource === "function") {
                  window.veloraSetHomeImageSource(media, res.url);
                } else {
                  media.src = res.url;
                }
              }
            } else if (res.type === "logo" && res.url) {
              if (!card.classList.contains("has-integrated-title")) {
                applyTitleLogo(res.url);
              }
            }
          });
        }
      }
    }
    var logoUrl = String(section && (section.logo_url || section.badge_logo_url) || entry && (entry.section_logo_url || entry.logo_url) || "").trim();
    if (logoUrl) {
      card.classList.add("vel-home-section__card--has-badge");
      var logoEl = document.createElement("img");
      logoEl.className = "vel-home-section__badge-logo";
      logoEl.alt = "";
      logoEl.loading = "lazy";
      if (typeof window.veloraSetHomeImageSource === "function") {
        window.veloraSetHomeImageSource(logoEl, logoUrl, function () { logoEl.remove(); });
      } else {
        logoEl.src = logoUrl;
        logoEl.onerror = function () { logoEl.remove(); };
      }
      card.appendChild(logoEl);
    }
    if (isHorizontal && (section.content_type === "movies" || section.content_type === "series")) {
      veloraEnsureCardBackdrop(card, media, section, entry);
    }
    window.veloraBindHomeCardActivation(card, section, entry);
    card.addEventListener("click", function () { window.veloraOpenHomeCacheEntry(section, entry, card); });
    return card;
  }

  function getSectionCountryIds(section) {
    if (!section) return ["default"];
    if (Array.isArray(section.country_ids) && section.country_ids.length) return section.country_ids;
    if (!section.country_id || section.country_id === "default") return ["default"];
    return String(section.country_id).split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function matchingSections(payload) {
    var sections = payload && Array.isArray(payload.sections) ? payload.sections : [];
    var countryId = activeCountryId();
    var select = document.getElementById("country-select") || document.getElementById("home-country-select");
    var countryName = String(select && select.selectedOptions && select.selectedOptions[0] ? select.selectedOptions[0].textContent : "").toLowerCase().trim();
    if (!countryName) {
      try {
        countryName = String(localStorage.getItem("velora_selected_country_name_v1") || sessionStorage.getItem("velora_selected_country_name_v1") || "").toLowerCase().trim();
      } catch (_) {}
    }
    var normCountryId = String(countryId || "").toLowerCase().replace(/^country_/, "").trim();
    var normCountryName = String(countryName || "").toLowerCase().replace(/^country_/, "").trim();

    var published = sections.filter(function (section) {
      return section.published !== false;
    });
    var specific = published.filter(function (section) {
      var ids = getSectionCountryIds(section);
      if (ids.includes("default") || ids.includes("all")) return false;
      if (countryId && ids.includes(countryId)) return true;
      return ids.some(function(id) {
        var n = String(id).toLowerCase().replace(/^country_/, "").trim();
        if (normCountryId && (n === normCountryId || normCountryId.includes(n) || n.includes(normCountryId))) return true;
        if (normCountryName && (n === normCountryName || normCountryName.includes(n) || n.includes(normCountryName))) return true;
        return false;
      });
    });
    var defaults = published.filter(function (section) {
      var ids = getSectionCountryIds(section);
      return ids.includes("default") || ids.includes("all");
    });
    var matching = specific.length ? specific : defaults;
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
      var isHorizontal = section.card_orientation === "horizontal";
      var block = document.createElement("div");
      block.className = "UI3iHJ vel-home-section vel-home-section--skeleton" + (isHorizontal ? " vel-home-section--horizontal" : "");
      block.dataset.testid = "navigation-carousel-wrapper";
      var headerSec = document.createElement("section");
      headerSec.className = "QHjixV vel-home-section__header";
      var tvxgSpan = document.createElement("span");
      tvxgSpan.className = "TvxgS1";
      var heading = document.createElement("h2");
      heading.className = "qwttco vel-home-section__heading";
      heading.innerHTML = '<span data-testid="carousel-title"><span>' + (section.title || "") + '</span></span>';
      var seeMore = document.createElement("a");
      seeMore.href = "#";
      seeMore.className = "toEceS vel-home-section__see-more";
      seeMore.dataset.testid = "see-more";
      seeMore.setAttribute("aria-label", section.title || "");
      seeMore.innerHTML = '<span class="IcIpJ_">Voir plus</span><svg class="_22qEau" viewBox="0 0 24 24" height="24" width="24" role="img" aria-hidden="true"><title>Link Arrow</title><path stroke="currentColor" stroke-width="2" d="M9.5 17.5l5-5-5-5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
      tvxgSpan.append(heading, seeMore);
      headerSec.appendChild(tvxgSpan);
      var railWrap = document.createElement("div");
      railWrap.className = "vJYTdI LiEb2X UEOrk2 CHGlLt OH_E2I vel-home-section__rail-wrap";
      var rail = document.createElement("div");
      rail.className = "lw1NJZ vel-home-section__rail";
      rail.dataset.testid = "card-container-list";
      railWrap.appendChild(rail);
      var count = Math.max(4, Math.min(8, Array.isArray(section.entries) ? section.entries.length : 6));
      for (var index = 0; index < count; index += 1) {
        var placeholder = document.createElement("span");
        placeholder.className = "vel-home-section__skeleton vel-home-section__skeleton--" + section.content_type + (isHorizontal ? " vel-home-section__skeleton--horizontal" : "");
        placeholder.setAttribute("aria-hidden", "true");
        rail.appendChild(placeholder);
      }
      block.append(headerSec, railWrap);
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
  }

  function render(payload) {
    var root = document.getElementById("vel-home-sections");
    if (!root) return false;
    var version = ++renderVersion;
    var matching = matchingSections(payload);
    var fragment = document.createDocumentFragment();
    if (typeof window.veloraRenderResumeSection === "function") {
      var resumeBlock = window.veloraRenderResumeSection();
      if (resumeBlock) fragment.appendChild(resumeBlock);
    }
    if (typeof window.veloraRenderFootballSectionDirect === "function") {
      var footBlock = window.veloraRenderFootballSectionDirect();
      if (footBlock) fragment.appendChild(footBlock);
    }
    matching.forEach(function (section) {
      var isHorizontal = section.card_orientation === "horizontal";
      var block = document.createElement("div");
      block.className = "UI3iHJ vel-home-section" + (isHorizontal ? " vel-home-section--horizontal" : "");
      block.dataset.testid = "navigation-carousel-wrapper";
      block.dataset.sectionId = String(section.id || "");
      block.dataset.contentType = String(section.content_type || "movies");
      if (section.package_id) block.dataset.packageId = String(section.package_id);
      var headerSec = document.createElement("section");
      headerSec.className = "QHjixV vel-home-section__header";
      var tvxgSpan = document.createElement("span");
      tvxgSpan.className = "TvxgS1";
      var heading = document.createElement("h2");
      heading.className = "qwttco vel-home-section__heading";
      heading.style.cursor = "pointer";
      heading.innerHTML = '<span data-testid="carousel-title"><span>' + (section.title || "") + '</span></span>';
      var seeMore = document.createElement("a");
      seeMore.href = "#";
      seeMore.className = "toEceS vel-home-section__see-more";
      seeMore.dataset.testid = "see-more";
      seeMore.setAttribute("aria-label", section.title || "");
      seeMore.innerHTML = '<span class="IcIpJ_">Voir plus</span><svg class="_22qEau" viewBox="0 0 24 24" height="24" width="24" role="img" aria-hidden="true"><title>Link Arrow</title><path stroke="currentColor" stroke-width="2" d="M9.5 17.5l5-5-5-5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
      var openSec = function (e) {
        e.preventDefault();
        e.stopPropagation();
        var customList = Array.isArray(section.custom_entries) && section.custom_entries.length > 0
          ? section.custom_entries
          : null;
        if (typeof window.veloraOpenPrimePackageModal === "function") {
          window.veloraOpenPrimePackageModal(section.content_type || "movies", {
            id: section.package_id || section.id || section.title,
            name: section.title,
            customItems: customList || undefined
          });
        } else if (typeof window.veloraOpenHomeCustomSectionModal === "function") {
          window.veloraOpenHomeCustomSectionModal(block, section.title, section.content_type, section.card_orientation === "horizontal");
        }
      };
      heading.addEventListener("click", openSec);
      seeMore.addEventListener("click", openSec);
      tvxgSpan.append(heading, seeMore);
      headerSec.appendChild(tvxgSpan);
      var railWrap = document.createElement("div");
      railWrap.className = "vJYTdI LiEb2X UEOrk2 CHGlLt OH_E2I vel-home-section__rail-wrap";
      var rail = document.createElement("div");
      rail.className = "lw1NJZ vel-home-section__rail";
      rail.dataset.testid = "card-container-list";
      railWrap.appendChild(rail);
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
      if (filteredEntries.length < 3) return;
      appendRailPage(rail, section, filteredEntries, 0);
      block.append(headerSec, railWrap);
      fragment.appendChild(block);
    });
    if (version !== renderVersion) return false;
    root.replaceChildren(fragment);
    if (typeof window.veloraInjectFootballSection === "function") window.veloraInjectFootballSection();
    document.dispatchEvent(new CustomEvent("velora-home-country-rendered", {
      detail: { countryId: activeCountryId() }
    }));
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
    function getScopedStorageKey(cid) {
      var id = cid || activeCountryId();
      return storageKey + (id ? "." + id : "");
    }
    try {
      var stored = sessionStorage.getItem(getScopedStorageKey(requestedCountry));
      if (stored) renderSkeleton(JSON.parse(stored));
    } catch (error) {}
    try {
      var payload = await window.veloraLoadHomeCache(false);
      if (activeCountryId() !== requestedCountry) return;
      protectRenderedHome(payload);
      try { sessionStorage.setItem(getScopedStorageKey(requestedCountry), JSON.stringify(payload)); } catch (error) {}
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
  document.addEventListener("velora-country-change", function () { window.setTimeout(loadAndRender, 40); });
  document.addEventListener("velora-country-changed", function () { window.setTimeout(loadAndRender, 40); });
  document.addEventListener("velora-country-switch", function () { window.setTimeout(loadAndRender, 40); });
  window.addEventListener("velora-country-change", function () { window.setTimeout(loadAndRender, 40); });
  window.addEventListener("velora-countries-ready", function () { window.setTimeout(loadAndRender, 40); });
  document.addEventListener("change", function (event) {
    if (event.target && (event.target.id === "country-select" || event.target.id === "home-country-select")) {
      loadAndRender();
    }
  }, true);
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

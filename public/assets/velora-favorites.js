(function () {
  "use strict";

  var PAGE_SIZE = 12;
  var FAVORITE_TABS = [
    { type: "channel", label: "Chaînes" },
    { type: "movie", label: "Films" },
    { type: "series", label: "Séries" }
  ];
  var state = { items: new Map(), limits: { movie: PAGE_SIZE, series: PAGE_SIZE, channel: PAGE_SIZE }, page: null, open: false, activeType: "channel", decorateTimer: 0, currentDetailDescriptor: null };
  var heartSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8.5-4.8-8.5-11.2A4.8 4.8 0 0 1 12 6.7a4.8 4.8 0 0 1 8.5 3.1C20.5 16.2 12 21 12 21Z"/></svg>';

  // Pre-load from local cache for 0ms instant display
  try {
    var initialCache = localStorage.getItem("velora_favorites_cache");
    if (initialCache) {
      var parsedCache = JSON.parse(initialCache);
      if (Array.isArray(parsedCache)) {
        parsedCache.forEach(function (row) {
          if (row) {
            var item = normalize(row);
            state.items.set(favoriteKey(item), item);
          }
        });
      }
    }
  } catch (_) {}

  function token() {
    try { return localStorage.getItem("authToken") || ""; } catch (_) { return ""; }
  }

  function favoriteKey(item) {
    return [String(item.source_id ?? item.sourceId ?? ""), String(item.item_id ?? item.itemId ?? ""), String(item.item_type ?? item.itemType ?? "")].join("\u001f");
  }

  function normalize(item) {
    return {
      id: item.id,
      source_id: String(item.source_id ?? item.sourceId ?? ""),
      item_id: String(item.item_id ?? item.itemId ?? ""),
      item_type: String(item.item_type ?? item.itemType ?? "channel"),
      name: String(item.name || ""),
      thumb_url: String(item.thumb_url ?? item.thumbUrl ?? ""),
      package_id: String(item.package_id ?? item.packageId ?? ""),
      global_stream_id: String(item.global_stream_id ?? item.globalStreamId ?? ""),
      container_extension: String(item.container_extension ?? item.containerExtension ?? ""),
      created_at: item.created_at || new Date().toISOString()
    };
  }

  function fromDescriptor(item) {
    return normalize(item);
  }

  function favoriteItemDescriptor(item) {
    var normalized = normalize(item);
    return {
      sourceId: normalized.source_id,
      itemId: normalized.item_id,
      itemType: normalized.item_type,
      name: normalized.name,
      thumbUrl: normalized.thumb_url,
      packageId: normalized.package_id,
      globalStreamId: normalized.global_stream_id,
      containerExtension: normalized.container_extension
    };
  }

  async function request(options) {
    var authToken = token();
    if (!authToken) throw new Error("Connectez-vous pour utiliser les favoris.");
    var response = await fetch("/api/favorites", {
      cache: "no-store",
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + authToken,
        ...(options && options.body ? { "Content-Type": "application/json" } : {}),
        ...((options && options.headers) || {})
      }
    });
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(payload.error || "HTTP " + response.status);
    return payload;
  }

  async function loadFavorites() {
    if (!token()) {
      state.items.clear();
      syncHearts();
      return [];
    }
    var rows = await request({ method: "GET" });
    state.items = new Map((Array.isArray(rows) ? rows : []).map(function (row) {
      var item = normalize(row);
      return [favoriteKey(item), item];
    }));
    try {
      localStorage.setItem("velora_favorites_cache", JSON.stringify(Array.from(state.items.values())));
    } catch (_) {}
    syncHearts();
    if (typeof window.veloraSyncFavoriteChannelPackage === "function") {
      window.veloraSyncFavoriteChannelPackage(Array.from(state.items.values()));
    }
    return Array.from(state.items.values());
  }

  function setHeartState(heart, active) {
    heart.classList.toggle("is-active", active);
    heart.setAttribute("aria-pressed", active ? "true" : "false");
    heart.setAttribute("aria-label", active ? "Dans vos favoris (cliquer pour retirer)" : "Ajouter aux favoris");
    heart.title = active ? "Dans vos favoris (cliquer pour retirer)" : "Ajouter aux favoris";
    var label = heart.querySelector(".vel-favorite-detail-button__label");
    if (label) {
      label.textContent = active ? "Ajouté aux favoris" : "Ajouter aux favoris";
    }
  }

  function syncHearts() {
    document.querySelectorAll(".vel-favorite-heart[data-favorite-key], .vel-favorite-detail-button[data-favorite-key]").forEach(function (heart) {
      setHeartState(heart, state.items.has(heart.dataset.favoriteKey));
    });
  }

  function toast(message, bad) {
    var node = document.getElementById("vel-favorites-toast");
    if (!node) {
      node = document.createElement("div");
      node.id = "vel-favorites-toast";
      node.className = "vel-favorites-toast";
      node.setAttribute("role", "status");
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.toggle("is-error", Boolean(bad));
    node.classList.add("is-visible");
    window.clearTimeout(node._hideTimer);
    node._hideTimer = window.setTimeout(function () { node.classList.remove("is-visible"); }, 2200);
  }

  async function toggleFavorite(heart) {
    var descriptor = heart._veloraFavorite;
    if (!descriptor || heart.dataset.pending === "true") return;
    if (!token()) {
      toast("Connectez-vous pour utiliser les favoris.", true);
      window.setTimeout(function () { location.assign("/login"); }, 700);
      return;
    }
    var item = fromDescriptor(descriptor);
    var key = favoriteKey(item);
    var removing = state.items.has(key);
    heart.dataset.pending = "true";
    if (removing) state.items.delete(key); else state.items.set(key, item);
    syncHearts();
    try {
      await request({
        method: removing ? "DELETE" : "POST",
        body: JSON.stringify({
          sourceId: item.source_id,
          itemId: item.item_id,
          itemType: item.item_type,
          name: item.name,
          thumbUrl: item.thumb_url,
          packageId: item.package_id,
          globalStreamId: item.global_stream_id,
          containerExtension: item.container_extension
        })
      });
      if (typeof window.veloraSyncFavoriteChannelPackage === "function") {
        window.veloraSyncFavoriteChannelPackage(Array.from(state.items.values()));
      }
      if (state.open) renderPage();
      toast(removing ? "Retiré des favoris." : "Ajouté aux favoris.");
    } catch (error) {
      if (removing) state.items.set(key, item); else state.items.delete(key);
      syncHearts();
      toast(error.message, true);
    } finally {
      delete heart.dataset.pending;
    }
  }

  function stopHeartEvent(event) {
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function activateHeart(event, heart) {
    stopHeartEvent(event);
    var now = Date.now();
    if (now - Number(heart._veloraLastActivation || 0) < 650) return;
    heart._veloraLastActivation = now;
    void toggleFavorite(heart);
  }

  function captureHeartInteraction(event) {
    var target = event.target;
    var heart = target && typeof target.closest === "function"
      ? target.closest(".vel-favorite-heart, .vel-favorite-detail-button")
      : null;
    if (!heart) return;
    if (
      event.type === "touchend" ||
      event.type === "click" ||
      (event.type === "pointerup" && (event.pointerType === "touch" || event.pointerType === "pen"))
    ) {
      activateHeart(event, heart);
      return;
    }
    stopHeartEvent(event);
  }

  function bindHeartActivation(heart) {
    heart.addEventListener("pointerdown", stopHeartEvent);
    heart.addEventListener("pointerup", function (event) {
      if (event.pointerType === "touch" || event.pointerType === "pen") activateHeart(event, heart);
      else stopHeartEvent(event);
    });
    heart.addEventListener("touchstart", stopHeartEvent, { passive: false });
    heart.addEventListener("touchend", function (event) { activateHeart(event, heart); }, { passive: false });
    heart.addEventListener("mousedown", stopHeartEvent);
    heart.addEventListener("mouseup", stopHeartEvent);
    heart.addEventListener("click", function (event) { activateHeart(event, heart); });
    heart.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") activateHeart(event, heart);
    });
  }

  function createHeart(descriptor, nested) {
    var heart = document.createElement(nested ? "span" : "button");
    if (!nested) heart.type = "button";
    heart.className = "vel-favorite-heart";
    heart.innerHTML = heartSvg;
    heart.dataset.favoriteKey = favoriteKey({ sourceId: descriptor.sourceId, itemId: descriptor.itemId, itemType: descriptor.itemType });
    heart._veloraFavorite = descriptor;
    if (nested) {
      heart.setAttribute("role", "button");
      heart.tabIndex = 0;
    }
    setHeartState(heart, state.items.has(heart.dataset.favoriteKey));
    bindHeartActivation(heart);
    return heart;
  }

  window.veloraCreateFavoriteHeart = function (descriptor) {
    if (!descriptor || !descriptor.itemId) return null;
    return createHeart(descriptor, true);
  };

  function detailDescriptor(detail) {
    var sourceId = String(detail.dataset.favoriteSourceId || "");
    var itemId = String(detail.dataset.favoriteItemId || "");
    var itemType = String(detail.dataset.favoriteItemType || "");
    var descriptor = sourceId && itemId && (itemType === "movie" || itemType === "series") ? {
      sourceId: sourceId,
      itemId: itemId,
      itemType: itemType,
      name: String(detail.dataset.favoriteName || detail.getAttribute("aria-label") || ""),
      thumbUrl: String(detail.dataset.favoriteThumbUrl || ""),
      packageId: String(detail.dataset.favoritePackageId || ""),
      globalStreamId: String(detail.dataset.favoriteGlobalStreamId || ""),
      containerExtension: String(detail.dataset.favoriteContainerExtension || "")
    } : state.currentDetailDescriptor;
    if (!descriptor) return null;
    var expectedType = detail.classList.contains("vel-vod-detail--series") ? "series" : "movie";
    descriptor.itemType = expectedType;
    return descriptor;
  }

  window.veloraSetDetailDescriptor = function (desc) {
    if (!desc) return;
    var normalized = {
      sourceId: String(desc.sourceId || desc.source_id || ""),
      itemId: String(desc.itemId || desc.item_id || desc.streamId || desc.stream_id || ""),
      itemType: String(desc.itemType || desc.item_type || (desc.contentType === "series" ? "series" : "movie")),
      name: String(desc.name || desc.title || desc.series_name || ""),
      thumbUrl: String(desc.thumbUrl || desc.thumb_url || desc.stream_icon || desc.cover || ""),
      packageId: String(desc.packageId || desc.package_id || ""),
      globalStreamId: String(desc.globalStreamId || desc.global_stream_id || ""),
      containerExtension: String(desc.containerExtension || desc.container_extension || "")
    };
    if (normalized.itemId && (normalized.itemType === "movie" || normalized.itemType === "series")) {
      state.currentDetailDescriptor = normalized;
      scheduleDecorate();
    }
  };

  function rememberCardDetail(event) {
    var target = event.target;
    if (!target || typeof target.closest !== "function" || target.closest(".vel-favorite-heart, .vel-favorite-detail-button")) return;
    var card = target.closest(".vel-vod-movie-card");
    if (!card) return;
    var heart = card.querySelector(":scope > .vel-favorite-heart");
    var descriptor = heart && heart._veloraFavorite;
    if (!descriptor && typeof window.veloraDescribeFavoriteCard === "function") descriptor = window.veloraDescribeFavoriteCard(card);
    if (descriptor && (descriptor.itemType === "movie" || descriptor.itemType === "series")) state.currentDetailDescriptor = descriptor;
  }

  function installCachedHomeBridge() {
    var original = window.veloraOpenCachedHomeItem;
    if (typeof original !== "function" || original._veloraFavoriteWrapped) return;
    function wrapped(section, item) {
      var contentType = String((section && section.content_type) || "");
      var itemType = contentType === "series" ? "series" : contentType === "movies" ? "movie" : "";
      if (itemType && item) {
        state.currentDetailDescriptor = {
          sourceId: String(item.sourceId || ""),
          itemId: String(item.streamId || item.itemId || ""),
          itemType: itemType,
          name: String(item.name || ""),
          thumbUrl: String(item.thumbUrl || ""),
          packageId: String((section && section.package_id) || item.packageId || ""),
          globalStreamId: String(item.globalStreamId || ""),
          containerExtension: String(item.containerExtension || "")
        };
      }
      return original.apply(this, arguments);
    }
    wrapped._veloraFavoriteWrapped = true;
    window.veloraOpenCachedHomeItem = wrapped;
  }

  function createDetailFavoriteButton(descriptor) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "vel-favorite-detail-button";
    button.innerHTML = heartSvg + '<span class="vel-favorite-detail-button__label"></span>';
    button.dataset.favoriteKey = favoriteKey({ sourceId: descriptor.sourceId, itemId: descriptor.itemId, itemType: descriptor.itemType });
    button._veloraFavorite = descriptor;
    setHeartState(button, state.items.has(button.dataset.favoriteKey));
    bindHeartActivation(button);
    return button;
  }

  var dominantColorCache = new Map();

  function toProxiedImageUrl(url) {
    if (!url) return "";
    var clean = String(url).trim().replace(/^url\(["']?/, "").replace(/["']?\)$/, "");
    if (!clean) return "";
    if (clean.startsWith("/proxy") || clean.startsWith("data:")) return clean;
    if (typeof window.An === "function") {
      try { return window.An(clean); } catch (e) {}
    }
    if (/^https?:\/\//i.test(clean)) {
      try {
        var u = new URL(clean, window.location.origin);
        if (u.origin === window.location.origin) return clean;
      } catch (e) {}
      return "/proxy?target=" + encodeURIComponent(clean);
    }
    return clean;
  }

  function sampleHeroDominantColor(imgUrl, targetEl) {
    if (!imgUrl || !targetEl) return;
    try {
      var rawUrl = imgUrl.replace(/^url\(["']?/, "").replace(/["']?\)$/, "").trim();
      if (!rawUrl) return;
      if (dominantColorCache.has(rawUrl)) {
        targetEl.style.setProperty("--vel-vod-dominant-color", dominantColorCache.get(rawUrl));
        return;
      }
      var proxiedUrl = toProxiedImageUrl(rawUrl);
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () {
        try {
          var canvas = document.createElement("canvas");
          canvas.width = 40;
          canvas.height = 40;
          var ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, 40, 40);
          var data = ctx.getImageData(0, 0, 40, 40).data;
          var bins = {};
          var totalPixels = 0;
          for (var i = 0; i < data.length; i += 4) {
            var r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
            if (a < 160) continue;
            totalPixels++;
            var qr = (r >> 3) << 3;
            var qg = (g >> 3) << 3;
            var qb = (b >> 3) << 3;
            var key = qr + "," + qg + "," + qb;
            if (!bins[key]) {
              bins[key] = { r: qr, g: qg, b: qb, count: 1 };
            } else {
              bins[key].count++;
            }
          }
          if (totalPixels === 0) return;
          var bestColor = null;
          var bestScore = -1;
          for (var k in bins) {
            var bin = bins[k];
            if (bin.count < totalPixels * 0.015) continue;
            var br = bin.r, bg = bin.g, bb = bin.b;
            var max = Math.max(br, bg, bb), min = Math.min(br, bg, bb);
            var sat = max === 0 ? 0 : (max - min) / max;
            var lum = (br * 0.299 + bg * 0.587 + bb * 0.114) / 255;
            
            // Skip pitch blacks or pure washed-out whites
            if (lum < 0.12 || lum > 0.92) continue;
            
            var freqWeight = bin.count / totalPixels;
            var lumWeight = 1 - Math.abs(lum - 0.50) * 0.7;
            var satBonus = 1 + Math.min(sat, 0.85) * 1.8;
            var score = freqWeight * satBonus * lumWeight;
            if (score > bestScore) {
              bestScore = score;
              bestColor = bin;
            }
          }
          if (bestColor) {
            var fr = bestColor.r, fg = bestColor.g, fb = bestColor.b;
            var maxC = Math.max(fr, fg, fb);
            if (maxC > 0 && maxC < 165) {
              var boost = 165 / maxC;
              fr = Math.min(255, Math.round(fr * boost));
              fg = Math.min(255, Math.round(fg * boost));
              fb = Math.min(255, Math.round(fb * boost));
            }
            var colorStr = "rgb(" + fr + ", " + fg + ", " + fb + ")";
            dominantColorCache.set(rawUrl, colorStr);
            targetEl.style.setProperty("--vel-vod-dominant-color", colorStr);
          }
        } catch (e) {}
      };
      img.src = proxiedUrl;
    } catch (e) {}
  }

  function decorateDetails() {
    document.querySelectorAll(".vel-vod-detail").forEach(function (detail) {
      var descriptor = detailDescriptor(detail);
      if (!descriptor) return;
      var existing = detail.querySelector(":scope .vel-favorite-detail-button");
      if (existing) {
        existing._veloraFavorite = descriptor;
        existing.dataset.favoriteKey = favoriteKey({ sourceId: descriptor.sourceId, itemId: descriptor.itemId, itemType: descriptor.itemType });
        setHeartState(existing, state.items.has(existing.dataset.favoriteKey));
        return;
      }
      var meta = detail.querySelector(".vel-vod-detail__meta");
      var watch = detail.querySelector(".vel-vod-detail__watch--film");
      var plot = detail.querySelector(".vel-vod-detail__plot");
      var fullDesc = detail.querySelector(".vel-vod-detail__full-description");
      if (fullDesc) fullDesc.remove();
      var target = detail.querySelector(".vel-vod-detail__details-panel") || detail.querySelector(".vel-vod-detail__inner");

      if (watch && target && watch.parentElement === target) {
        var watchIcon = watch.querySelector(".vel-vod-detail__watch-icon");
        if (watchIcon && !watchIcon.querySelector("svg")) {
          watchIcon.innerHTML = '<svg viewBox="0 0 24 24" width="1.25rem" height="1.25rem" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11.04-6.86a1 1 0 0 0 0-1.72L9.5 4.28a1 1 0 0 0-1.5.86z"/></svg>';
        }
      }

      function updateDetailThemeFromBackdrop() {
        var bgEl = detail.querySelector(".vel-vod-detail__bg");
        var bgUrl = "";
        if (bgEl) {
          var inlineBg = bgEl.style.backgroundImage || bgEl.style.getPropertyValue("--vel-vod-hero-url") || "";
          var match = inlineBg.match(/url\(["']?([^"']+)["']?\)/);
          if (match && match[1]) bgUrl = match[1];
        }
        var posterImg = detail.querySelector(".vel-vod-detail__poster-img");
        var targetUrl = bgUrl || descriptor.backdropUrl || (posterImg && posterImg.src) || descriptor.posterUrl || descriptor.thumbUrl || "";
        if (targetUrl) {
          var rawTargetUrl = targetUrl.replace(/^url\(["']?/, "").replace(/["']?\)$/, "").trim();
          if (dominantColorCache.has(rawTargetUrl)) {
            detail.style.setProperty("--vel-vod-dominant-color", dominantColorCache.get(rawTargetUrl));
          } else {
            sampleHeroDominantColor(rawTargetUrl, detail);
          }
        }
      }

      // Initialize with neutral ice-cyan baseline
      detail.style.setProperty("--vel-vod-dominant-color", "rgb(56, 189, 248)");
      updateDetailThemeFromBackdrop();

      // Observe background element for async backdrop load
      var bgEl = detail.querySelector(".vel-vod-detail__bg");
      if (bgEl && typeof MutationObserver !== "undefined") {
        var bgObserver = new MutationObserver(function () {
          updateDetailThemeFromBackdrop();
        });
        bgObserver.observe(bgEl, { attributes: true, attributeFilter: ["style", "class"] });
      }

      // Attach floating favorite heart button at the top-left of the detail hero card
      var button = createDetailFavoriteButton(descriptor);
      detail.appendChild(button);
      setHeartState(button, state.items.has(button.dataset.favoriteKey));
    });
  }

  function decorateCards() {
    installCachedHomeBridge();
    if (typeof window.veloraDescribeFavoriteCard === "function") {
      document.querySelectorAll(".vel-vod-movie-card, .vel-media-item-row").forEach(function (card) {
        if (card.closest("#vel-favorites-page")) return;
        var descriptor = window.veloraDescribeFavoriteCard(card);
        if (!descriptor) return;
        var existing = card.querySelector(":scope > .vel-favorite-heart");
        if (existing) {
          existing._veloraFavorite = descriptor;
          existing.dataset.favoriteKey = favoriteKey({ sourceId: descriptor.sourceId, itemId: descriptor.itemId, itemType: descriptor.itemType });
          setHeartState(existing, state.items.has(existing.dataset.favoriteKey));
          return;
        }
        card.dataset.favoriteDecorated = "true";
        card.appendChild(createHeart(descriptor, card.classList.contains("vel-vod-movie-card")));
      });
    }
    decorateDetails();
  }

  function scheduleDecorate() {
    window.clearTimeout(state.decorateTimer);
    state.decorateTimer = window.setTimeout(decorateCards, 20);
  }

  function imageUrl(value) {
    var url = String(value || "").trim();
    if (!url) return "";
    if (location.protocol === "https:" && /^http:\/\//i.test(url)) return "/api/proxy/image?url=" + encodeURIComponent(url);
    return url;
  }

  function appendArtwork(parent, item) {
    var artwork = document.createElement("span");
    artwork.className = "vel-favorites-card__art";
    var url = imageUrl(item.thumb_url);
    if (url) {
      var image = document.createElement("img");
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      var markFailure = function () {
        image.remove();
        artwork.classList.add("is-empty");
        artwork.textContent = item.item_type === "channel" ? "TV" : item.item_type === "series" ? "S" : "F";
      };
      if (typeof window.veloraSetHomeImageSource === "function") window.veloraSetHomeImageSource(image, url, markFailure);
      else {
        image.addEventListener("error", markFailure, { once: true });
        image.src = url;
      }
      artwork.appendChild(image);
    } else {
      artwork.classList.add("is-empty");
      artwork.textContent = item.item_type === "channel" ? "TV" : item.item_type === "series" ? "S" : "F";
    }
    parent.appendChild(artwork);
  }

  async function ensureCatalog() {
    if (typeof window.veloraOpenFavoriteItem === "function") return true;
    if (typeof window.veloraHomeCatalogReady === "function" && window.veloraHomeCatalogReady()) return true;
    try { window.veloraForceAutoconnect && window.veloraForceAutoconnect(); } catch (_) {}
    for (var attempt = 0; attempt < 20; attempt += 1) {
      if (typeof window.veloraOpenFavoriteItem === "function") return true;
      if (typeof window.veloraHomeCatalogReady === "function" && window.veloraHomeCatalogReady()) return true;
      await new Promise(function (resolve) { window.setTimeout(resolve, 50); });
    }
    return typeof window.veloraOpenFavoriteItem === "function";
  }

  async function openItem(item, button) {
    button.disabled = true;
    try {
      if (!await ensureCatalog()) throw new Error("Le catalogue n’est pas encore disponible.");
      if (typeof window.veloraOpenFavoriteItem !== "function") throw new Error("Le lecteur de favoris est indisponible.");
      var favoriteType = state.activeType || item.item_type || "channel";
      if (item.item_type === "movie" || item.item_type === "series") state.currentDetailDescriptor = favoriteItemDescriptor(item);
      var opened = await window.veloraOpenFavoriteItem(item, Array.from(state.items.values()));
      if (opened === false) throw new Error("Impossible d’ouvrir ce favori.");
      delete document.body.dataset.veloraReturnHome;
      delete document.body.dataset.veloraReturnAdult;
      document.body.dataset.veloraReturnFavorites = favoriteType;
      window._veloraFavoriteReturnTab = favoriteType;
      closePage(false);
    } catch (error) {
      toast(error.message, true);
      state.page.hidden = false;
      state.open = true;
    } finally {
      button.disabled = false;
    }
  }

  function favoriteCard(item) {
    var card = document.createElement("article");
    card.className = "vel-favorites-card vel-favorites-card--" + item.item_type;
    var open = document.createElement("button");
    open.type = "button";
    open.className = "vel-favorites-card__open";
    appendArtwork(open, item);
    var label = document.createElement("span");
    label.className = "vel-favorites-card__name";
    label.textContent = item.name || (item.item_type === "channel" ? "Chaîne favorite" : item.item_type === "series" ? "Série favorite" : "Film favori");
    open.appendChild(label);
    open.addEventListener("click", function () { void openItem(item, open); });
    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "vel-favorite-heart vel-favorite-heart--page is-active";
    remove.innerHTML = heartSvg;
    remove.dataset.favoriteKey = favoriteKey(item);
    remove._veloraFavorite = item;
    setHeartState(remove, true);
    bindHeartActivation(remove);
    card.append(open, remove);
    return card;
  }

  function group(type) {
    var all = Array.from(state.items.values()).filter(function (item) { return item.item_type === type; });
    var section = document.createElement("section");
    section.className = "vel-favorites-group vel-favorites-group--" + type;
    section.id = "vel-favorites-panel-" + type;
    section.setAttribute("role", "tabpanel");
    section.setAttribute("aria-labelledby", "vel-favorites-tab-" + type);
    var grid = document.createElement("div");
    grid.className = "vel-favorites-grid";
    all.slice(0, state.limits[type]).forEach(function (item) { grid.appendChild(favoriteCard(item)); });
    if (!all.length) {
      var empty = document.createElement("p");
      empty.className = "vel-favorites-group__empty";
      empty.textContent = type === "channel" ? "Aucune chaîne favorite." : type === "series" ? "Aucune série favorite." : "Aucun film favori.";
      grid.appendChild(empty);
    }
    section.appendChild(grid);
    if (all.length > state.limits[type]) {
      var more = document.createElement("button");
      more.type = "button";
      more.className = "vel-favorites-show-more";
      more.textContent = "Afficher plus";
      more.addEventListener("click", function () {
        state.limits[type] += PAGE_SIZE;
        renderPage();
      });
      section.appendChild(more);
    }
    return section;
  }

  function ensurePage() {
    if (state.page) return state.page;
    var page = document.createElement("div");
    page.id = "vel-favorites-page";
    page.className = "vel-favorites-page";
    page.hidden = true;
    page.innerHTML = '<header class="vel-favorites-page__header"><h1>Mes favoris</h1></header><nav class="vel-favorites-tabs" role="tablist" aria-label="Catégories de favoris"><button type="button" id="vel-favorites-tab-channel" class="vel-favorites-tab" role="tab" data-favorites-tab="channel" aria-controls="vel-favorites-panel-channel"><span>Chaînes</span><small>0</small></button><button type="button" id="vel-favorites-tab-movie" class="vel-favorites-tab" role="tab" data-favorites-tab="movie" aria-controls="vel-favorites-panel-movie"><span>Films</span><small>0</small></button><button type="button" id="vel-favorites-tab-series" class="vel-favorites-tab" role="tab" data-favorites-tab="series" aria-controls="vel-favorites-panel-series"><span>Séries</span><small>0</small></button></nav><main class="vel-favorites-page__content" aria-live="polite"></main>';
    page.querySelector(".vel-favorites-tabs").addEventListener("click", function (event) {
      var tab = event.target.closest("[data-favorites-tab]");
      if (!tab) return;
      state.activeType = tab.dataset.favoritesTab;
      renderPage();
    });
    page.querySelector(".vel-favorites-tabs").addEventListener("keydown", function (event) {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      var tabs = Array.from(page.querySelectorAll("[data-favorites-tab]"));
      var current = tabs.indexOf(document.activeElement);
      if (current < 0) return;
      event.preventDefault();
      var next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].click();
      tabs[next].focus();
    });
    document.body.appendChild(page);
    state.page = page;
    return page;
  }

  function renderPage() {
    var page = ensurePage();
    var content = page.querySelector(".vel-favorites-page__content");
    FAVORITE_TABS.forEach(function (definition) {
      var tab = page.querySelector('[data-favorites-tab="' + definition.type + '"]');
      var active = definition.type === state.activeType;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
      tab.querySelector("small").textContent = String(Array.from(state.items.values()).filter(function (item) { return item.item_type === definition.type; }).length);
    });
    content.replaceChildren(group(state.activeType));
  }

  function closeActivePlayers() {
    if (typeof window.veloraStopAllPlayback === "function") {
      try { window.veloraStopAllPlayback(); } catch (_) {}
    }

    document.querySelectorAll("video, audio").forEach(function (v) {
      try {
        v.pause();
        v.muted = true;
        v.currentTime = 0;
        if (v.hls && typeof v.hls.destroy === "function") {
          try { v.hls.destroy(); } catch (_) {}
          v.hls = null;
        }
        v.removeAttribute("src");
        v.load();
      } catch (_) {}
    });

    if (window.hls && typeof window.hls.destroy === "function") {
      try { window.hls.destroy(); } catch (_) {}
      window.hls = null;
    }

    try {
      if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
        document.exitFullscreen().catch(function () {});
      }
    } catch (_) {}

    [
      "player-container",
      "vod-player-container",
      "now-playing",
      "now-playing-vod",
      "content-view",
      "packages-view",
      "adult-view"
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.classList.add("hidden");
        el.setAttribute("aria-hidden", "true");
      }
    });
  }

  async function openPage(initialType) {
    closeActivePlayers();
    var page = ensurePage();
    document.getElementById("vel-bottom-profile-menu")?.setAttribute("hidden", "");
    state.limits = { movie: PAGE_SIZE, series: PAGE_SIZE, channel: PAGE_SIZE };
    if (initialType && (initialType === "channel" || initialType === "movie" || initialType === "series")) {
      state.activeType = initialType;
    }
    state.open = true;
    document.body.classList.add("vel-favorites-open");
    page.hidden = false;

    // Instant render from cache (0ms latency)
    if (state.items.size > 0) {
      renderPage();
    } else {
      page.querySelector(".vel-favorites-page__content").innerHTML = '<p class="vel-favorites-page__loading">Chargement de vos favoris…</p>';
    }

    var activeTabBtn = page.querySelector('[data-favorites-tab="' + state.activeType + '"]');
    if (activeTabBtn) activeTabBtn.focus();

    // Silently refresh in background
    try {
      await loadFavorites();
      if (state.open) renderPage();
    } catch (error) {
      if (state.items.size === 0) {
        page.querySelector(".vel-favorites-page__content").innerHTML = '<p class="vel-favorites-page__loading is-error"></p>';
        page.querySelector(".is-error").textContent = error.message;
      }
    }
  }

  function closePage(andReturnHome) {
    if (!state.page) return;
    state.page.hidden = true;
    state.open = false;
    document.body.classList.remove("vel-favorites-open");
    if (andReturnHome !== false) {
      delete document.body.dataset.veloraReturnFavorites;
      document.dispatchEvent(new CustomEvent("velora-show-home"));
    }
  }

  function stopAndReturnFavorites(tab) {
    window._veloraNavLock = true;
    setTimeout(function () { window._veloraNavLock = false; }, 600);

    var targetTab = tab && (tab === "channel" || tab === "movie" || tab === "series")
      ? tab
      : state.activeType || "channel";

    delete document.body.dataset.veloraReturnFavorites;
    delete window._veloraFavoriteReturnTab;
    delete document.body.dataset.veloraReturnAdult;
    delete document.body.dataset.veloraReturnHome;

    closeActivePlayers();

    var contextTitle = document.getElementById("vel-header-context-title-text");
    if (contextTitle) contextTitle.textContent = "";

    void openPage(targetTab);
  }

  function init() {
    ["pointerdown", "pointerup", "mousedown", "mouseup", "click"].forEach(function (eventName) {
      document.addEventListener(eventName, captureHeartInteraction, true);
    });
    document.addEventListener("touchstart", captureHeartInteraction, { capture: true, passive: false });
    document.addEventListener("touchend", captureHeartInteraction, { capture: true, passive: false });
    document.addEventListener("pointerdown", rememberCardDetail, true);
    document.addEventListener("click", rememberCardDetail, true);
    var profileFavorite = document.getElementById("vel-profile-favorites");
    if (profileFavorite) {
      profileFavorite.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void openPage();
      }, true);
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.open) closePage(true);
    });
    function handleBottomNavAction(event) {
      var target = event.target.closest("[data-bottom-nav]");
      if (!target) return;
      var action = target.getAttribute("data-bottom-nav");
      if (action === "country" || action === "profile" || action === "favorites") return;
      delete document.body.dataset.veloraReturnFavorites;
      delete window._veloraFavoriteReturnTab;
      delete document.body.dataset.veloraSearchMediaOpen;
      state.currentDetailDescriptor = null;
      document.body.classList.remove("vel-favorites-open", "vel-favorites-player-active");
      closePage(false);
    }
    document.getElementById("vel-bottom-nav")?.addEventListener("pointerdown", handleBottomNavAction, true);
    document.getElementById("vel-bottom-nav")?.addEventListener("click", handleBottomNavAction, true);
    document.addEventListener("velora-return-favorites", function (event) {
      var tab = event.detail && event.detail.tab ? event.detail.tab : state.activeType || "channel";
      stopAndReturnFavorites(tab);
    });
    window.veloraOpenFavoritesPage = openPage;
    window.veloraCloseFavoritesPage = closePage;
    window.veloraStopAndReturnFavorites = stopAndReturnFavorites;
    new MutationObserver(scheduleDecorate).observe(document.body, { childList: true, subtree: true });
    document.addEventListener("velora-app-ready", scheduleDecorate);
    document.addEventListener("velora-top-level-tab", scheduleDecorate);
    document.addEventListener("velora-home-tab", scheduleDecorate);
    document.addEventListener("velora-home-country-rendered", scheduleDecorate);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) scheduleDecorate(); });
    window.setInterval(function () { if (!document.hidden) decorateCards(); }, 600);
    scheduleDecorate();
    loadFavorites().catch(function () {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();

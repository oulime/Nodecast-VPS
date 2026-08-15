(function () {
  "use strict";

  var PAGE_SIZE = 12;
  var state = { items: new Map(), limits: { movie: PAGE_SIZE, series: PAGE_SIZE, channel: PAGE_SIZE }, page: null, open: false, decorateTimer: 0 };
  var heartSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8.5-4.8-8.5-11.2A4.8 4.8 0 0 1 12 6.7a4.8 4.8 0 0 1 8.5 3.1C20.5 16.2 12 21 12 21Z"/></svg>';

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
    syncHearts();
    if (typeof window.veloraSyncFavoriteChannelPackage === "function") {
      window.veloraSyncFavoriteChannelPackage(Array.from(state.items.values()));
    }
    return Array.from(state.items.values());
  }

  function setHeartState(heart, active) {
    heart.classList.toggle("is-active", active);
    heart.setAttribute("aria-pressed", active ? "true" : "false");
    heart.setAttribute("aria-label", active ? "Retirer des favoris" : "Ajouter aux favoris");
    heart.title = active ? "Retirer des favoris" : "Ajouter aux favoris";
  }

  function syncHearts() {
    document.querySelectorAll(".vel-favorite-heart[data-favorite-key]").forEach(function (heart) {
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
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
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
    ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend"].forEach(function (type) {
      heart.addEventListener(type, stopHeartEvent);
    });
    heart.addEventListener("click", function (event) {
      stopHeartEvent(event);
      void toggleFavorite(heart);
    });
    heart.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      stopHeartEvent(event);
      void toggleFavorite(heart);
    });
    return heart;
  }

  function decorateCards() {
    if (typeof window.veloraDescribeFavoriteCard !== "function") return;
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
    if (typeof window.veloraHomeCatalogReady === "function" && window.veloraHomeCatalogReady()) return true;
    try { window.veloraForceAutoconnect && window.veloraForceAutoconnect(); } catch (_) {}
    for (var attempt = 0; attempt < 100; attempt += 1) {
      if (typeof window.veloraHomeCatalogReady === "function" && window.veloraHomeCatalogReady()) return true;
      await new Promise(function (resolve) { window.setTimeout(resolve, 150); });
    }
    return false;
  }

  async function openItem(item, button) {
    button.disabled = true;
    toast("Ouverture…");
    try {
      if (!await ensureCatalog()) throw new Error("Le catalogue n’est pas encore disponible.");
      closePage();
      if (typeof window.veloraOpenFavoriteItem !== "function") throw new Error("Le lecteur de favoris est indisponible.");
      await window.veloraOpenFavoriteItem(item, Array.from(state.items.values()));
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
    remove.addEventListener("click", function (event) {
      stopHeartEvent(event);
      void toggleFavorite(remove);
    });
    card.append(open, remove);
    return card;
  }

  function group(type, title) {
    var all = Array.from(state.items.values()).filter(function (item) { return item.item_type === type; });
    var section = document.createElement("section");
    section.className = "vel-favorites-group vel-favorites-group--" + type;
    var heading = document.createElement("div");
    heading.className = "vel-favorites-group__heading";
    heading.innerHTML = "<h2></h2><span></span>";
    heading.querySelector("h2").textContent = title;
    heading.querySelector("span").textContent = String(all.length);
    var grid = document.createElement("div");
    grid.className = "vel-favorites-grid";
    all.slice(0, state.limits[type]).forEach(function (item) { grid.appendChild(favoriteCard(item)); });
    if (!all.length) {
      var empty = document.createElement("p");
      empty.className = "vel-favorites-group__empty";
      empty.textContent = type === "channel" ? "Aucune chaîne favorite." : type === "series" ? "Aucune série favorite." : "Aucun film favori.";
      grid.appendChild(empty);
    }
    section.append(heading, grid);
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
    page.innerHTML = '<header class="vel-favorites-page__header"><div><p>MA LISTE</p><h1>Mes favoris</h1></div><button type="button" class="vel-favorites-page__close" aria-label="Fermer les favoris">×</button></header><main class="vel-favorites-page__content" aria-live="polite"></main>';
    page.querySelector(".vel-favorites-page__close").addEventListener("click", closePage);
    document.body.appendChild(page);
    state.page = page;
    return page;
  }

  function renderPage() {
    var page = ensurePage();
    var content = page.querySelector(".vel-favorites-page__content");
    content.replaceChildren(group("movie", "Films"), group("series", "Séries"), group("channel", "Chaînes"));
  }

  async function openPage() {
    var page = ensurePage();
    document.getElementById("vel-bottom-profile-menu")?.setAttribute("hidden", "");
    state.limits = { movie: PAGE_SIZE, series: PAGE_SIZE, channel: PAGE_SIZE };
    state.open = true;
    page.hidden = false;
    page.querySelector(".vel-favorites-page__content").innerHTML = '<p class="vel-favorites-page__loading">Chargement de vos favoris…</p>';
    try {
      await loadFavorites();
      renderPage();
    } catch (error) {
      page.querySelector(".vel-favorites-page__content").innerHTML = '<p class="vel-favorites-page__loading is-error"></p>';
      page.querySelector(".is-error").textContent = error.message;
    }
    page.querySelector(".vel-favorites-page__close").focus();
  }

  function closePage() {
    if (!state.page) return;
    state.page.hidden = true;
    state.open = false;
  }

  function init() {
    var profileFavorite = document.getElementById("vel-profile-favorites");
    if (profileFavorite) {
      profileFavorite.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void openPage();
      }, true);
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.open) closePage();
    });
    document.getElementById("vel-bottom-nav")?.addEventListener("click", function () {
      if (state.open) closePage();
    }, true);
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

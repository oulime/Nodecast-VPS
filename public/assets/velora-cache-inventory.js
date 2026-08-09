(function () {
  "use strict";

  var root;
  var pollTimer = null;
  var kindLabels = { live: "TV", vod: "Films", series: "Séries" };

  function headers() {
    var token = "";
    var adminToken = "";
    try { token = localStorage.getItem("authToken") || ""; } catch (_) {}
    try { adminToken = sessionStorage.getItem("velora_catalog_admin_token") || ""; } catch (_) {}
    var result = token ? { Authorization: "Bearer " + token } : {};
    if (adminToken) result["X-Velora-Catalog-Admin"] = adminToken;
    return result;
  }

  async function createCatalogAdminSession(username, password) {
    var response = await fetch("/api/velora/catalog/admin-session", {
      method: "POST",
      cache: "no-store",
      headers: Object.assign({ "Content-Type": "application/json" }, headers()),
      body: JSON.stringify({ username: username, password: password })
    });
    var payload = await response.json();
    if (!response.ok || !payload.token) throw new Error(payload.error || "Admin session unavailable");
    sessionStorage.setItem("velora_catalog_admin_token", payload.token);
  }

  async function request(path, options) {
    var response = await fetch(path, {
      method: options && options.method ? options.method : "GET",
      cache: "no-store",
      headers: headers()
    });
    var payload = null;
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(payload && payload.error ? payload.error : "HTTP " + response.status);
    return payload || {};
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function searchKey(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  async function refreshPackagePosters(refreshButton, status, button, provider, packageRow, content) {
    refreshButton.disabled = true;
    status.classList.remove("is-error");
    status.textContent = "Actualisation des affiches du package...";
    try {
      var result = await request(
        "/api/velora/catalog/inventory/" + encodeURIComponent(provider.sourceId) +
        "/vod/" + encodeURIComponent(packageRow.categoryId) + "/posters/refresh",
        { method: "POST" }
      );
      status.textContent = result.providerMovies + " films recus - " + result.providerPosters +
        " affiches recues - " + result.addedPosters + " nouvelle(s) - " +
        result.missingPosters + " manquante(s). Reconstruction du cache...";
      for (var attempt = 0; attempt < 60; attempt += 1) {
        await new Promise(function (resolve) { window.setTimeout(resolve, 2000); });
        var cacheStatus = await request("/api/velora/catalog/status");
        if (!cacheStatus.running) {
          if (cacheStatus.error) throw new Error(cacheStatus.error);
          content.hidden = true;
          button.setAttribute("aria-expanded", "false");
          await openPackage(button, provider, packageRow, content);
          return;
        }
      }
      status.textContent = "Affiches sauvegardees. Le cache continue en arriere-plan.";
    } catch (error) {
      status.textContent = "Impossible d'actualiser les affiches : " + error.message;
      status.classList.add("is-error");
    } finally {
      refreshButton.disabled = false;
    }
  }

  async function openPackage(button, provider, packageRow, content) {
    if (!content.hidden) {
      content.hidden = true;
      button.setAttribute("aria-expanded", "false");
      return;
    }
    button.setAttribute("aria-expanded", "true");
    content.hidden = false;
    content.replaceChildren(element("p", "cache-inventory__loading", "Chargement du contenu…"));
    try {
      var result = await request(
        "/api/velora/catalog/inventory/" + encodeURIComponent(provider.sourceId) + "/" +
        encodeURIComponent(packageRow.kind) + "/" + encodeURIComponent(packageRow.categoryId)
      );
      content.replaceChildren();
      var items = Array.isArray(result.items) ? result.items : [];
      if (packageRow.kind === "vod") {
        var tools = element("div", "cache-inventory__tools");
        var refreshButton = element("button", "cache-inventory__refresh", "Actualiser les affiches de ce package");
        var refreshStatus = element(
          "span",
          "cache-inventory__refresh-status",
          (result.posterCount || 0) + " / " + (result.count || 0) + " affiches en cache"
        );
        refreshButton.type = "button";
        refreshButton.addEventListener("click", function () {
          refreshPackagePosters(refreshButton, refreshStatus, button, provider, packageRow, content);
        });
        tools.append(refreshButton, refreshStatus);
        content.appendChild(tools);
      }
      if (!items.length) {
        content.appendChild(element("p", "cache-inventory__empty", "Aucun contenu chargé dans ce package."));
        return;
      }
      var grid = element("div", "cache-inventory__items");
      items.forEach(function (item) {
        var row = element("div", "cache-inventory__item");
        if (item.image) {
          var image = document.createElement("img");
          image.src = item.image;
          image.alt = "";
          image.loading = "lazy";
          row.appendChild(image);
        }
        row.appendChild(element("span", "", item.name || "Sans nom"));
        grid.appendChild(row);
      });
      content.appendChild(grid);
    } catch (error) {
      content.replaceChildren(element("p", "cache-inventory__empty", "Impossible de charger ce package."));
    }
  }

  function addPackageRows(packages, provider, packageRows) {
    packages.replaceChildren();
    packageRows.forEach(function (packageRow) {
      var wrapper = element("div", "cache-inventory__package");
      wrapper.dataset.search = searchKey(provider.name + " " + packageRow.name + " " + (kindLabels[packageRow.kind] || packageRow.kind));
      var button = element(
        "button",
        "cache-inventory__package-button",
        packageRow.name + " · " + (kindLabels[packageRow.kind] || packageRow.kind) + " · " + packageRow.itemCount + " contenu(s)"
      );
      button.type = "button";
      button.setAttribute("aria-expanded", "false");
      var content = element("div", "cache-inventory__content");
      content.hidden = true;
      button.addEventListener("click", function () { openPackage(button, provider, packageRow, content); });
      wrapper.append(button, content);
      packages.appendChild(wrapper);
    });
  }

  async function toggleProvider(providerButton, packages, provider) {
    if (!packages.hidden) {
      packages.hidden = true;
      providerButton.setAttribute("aria-expanded", "false");
      return;
    }
    packages.hidden = false;
    providerButton.setAttribute("aria-expanded", "true");
    if (packages.dataset.loaded === "true") return;
    packages.replaceChildren(element("p", "cache-inventory__loading", "Chargement des packages de ce fournisseur…"));
    try {
      var result = await request("/api/velora/catalog/inventory/" + encodeURIComponent(provider.sourceId));
      var packageRows = Array.isArray(result.packages) ? result.packages : [];
      packages.dataset.loaded = "true";
      addPackageRows(packages, provider, packageRows);
      if (!packageRows.length) packages.appendChild(element("p", "cache-inventory__empty", "Aucun package dans le cache pour ce fournisseur."));
    } catch (_) {
      packages.replaceChildren(element("p", "cache-inventory__empty", "Impossible de charger les packages de ce fournisseur."));
    }
  }

  function render(payload) {
    root.replaceChildren();
    var providers = payload && Array.isArray(payload.providers) ? payload.providers : [];
    if (!providers.length) {
      root.appendChild(element("p", "cache-inventory__empty", "Aucun fournisseur trouvé dans le cache catalogue."));
      return;
    }
    root.appendChild(element("h3", "cache-inventory__title", providers.length + " fournisseur(s) disponibles"));
    var filter = document.createElement("input");
    filter.type = "search";
    filter.className = "cache-inventory__filter";
    filter.placeholder = "Filtrer les fournisseurs ou packages…";
    filter.setAttribute("aria-label", "Filtrer les fournisseurs ou packages");
    root.appendChild(filter);
    providers.forEach(function (provider) {
      var section = element("section", "cache-inventory__provider");
      section.dataset.search = searchKey(provider.name);
      var providerButton = element("button", "cache-inventory__provider-button", provider.name);
      providerButton.type = "button";
      providerButton.setAttribute("aria-expanded", "false");
      var packages = element("div", "cache-inventory__packages");
      packages.hidden = true;
      providerButton.addEventListener("click", function () {
        toggleProvider(providerButton, packages, provider);
      });
      section.appendChild(providerButton);
      section.appendChild(packages);
      root.appendChild(section);
    });
    filter.addEventListener("input", function () {
      var query = searchKey(filter.value);
      root.querySelectorAll(".cache-inventory__provider").forEach(function (section) {
        var packageList = section.querySelector(".cache-inventory__packages");
        var providerButton = section.querySelector(".cache-inventory__provider-button");
        var matches = 0;
        section.querySelectorAll(".cache-inventory__package").forEach(function (packageNode) {
          var visible = !query || packageNode.dataset.search.includes(query);
          packageNode.hidden = !visible;
          if (visible) matches += 1;
        });
        var providerMatch = !query || section.dataset.search.includes(query);
        section.hidden = query ? !(providerMatch || matches > 0) : false;
        if (query && !section.hidden && packageList.dataset.loaded === "true") {
          packageList.hidden = false;
          providerButton.setAttribute("aria-expanded", "true");
        } else if (!query) {
          packageList.hidden = true;
          providerButton.setAttribute("aria-expanded", "false");
        }
      });
    });
  }

  async function loadInventory() {
    if (!root) return;
    root.replaceChildren(element("p", "cache-inventory__loading", "Chargement des packages du cache…"));
    try {
      render(await request("/api/velora/catalog/inventory"));
    } catch (_) {
      root.replaceChildren(element("p", "cache-inventory__empty", "La liste des packages n’est pas encore disponible."));
    }
  }

  function followWarmup() {
    if (pollTimer) window.clearInterval(pollTimer);
    var attempts = 0;
    pollTimer = window.setInterval(async function () {
      attempts += 1;
      try {
        var status = await request("/api/velora/catalog/status");
        if (!status.running) {
          window.clearInterval(pollTimer);
          pollTimer = null;
          if (!status.error) loadInventory();
        }
      } catch (_) {}
      if (attempts >= 70 && pollTimer) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    }, 2000);
  }

  function init() {
    root = document.getElementById("cache-package-inventory");
    if (!root) return;
    var style = document.createElement("style");
    style.textContent = ".cache-package-inventory{margin-top:1rem}.cache-inventory__title{margin:0 0 .75rem}.cache-inventory__filter{width:100%;margin:0 0 .75rem;padding:.7rem .8rem;border:1px solid rgba(255,255,255,.15);border-radius:9px;background:rgba(0,0,0,.26);color:inherit}.cache-inventory__provider{margin:.75rem 0;padding:.65rem;border:1px solid rgba(255,255,255,.12);border-radius:12px}.cache-inventory__provider-button{width:100%;padding:.65rem .75rem;text-align:left;border:0;border-radius:8px;background:rgba(255,255,255,.06);color:inherit;font-weight:800;cursor:pointer}.cache-inventory__provider-button:after{content:'▸';float:right}.cache-inventory__provider-button[aria-expanded=true]:after{content:'▾'}.cache-inventory__packages{display:grid;gap:.4rem;margin-top:.55rem}.cache-inventory__package-button{width:100%;padding:.65rem .8rem;text-align:left;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.06);color:inherit;cursor:pointer}.cache-inventory__package-button[aria-expanded=true]{border-color:#a855f7}.cache-inventory__content{padding:.6rem}.cache-inventory__items{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.45rem}.cache-inventory__item{display:flex;align-items:center;gap:.55rem;min-width:0;padding:.4rem;border-radius:7px;background:rgba(0,0,0,.24)}.cache-inventory__item img{width:38px;height:52px;object-fit:cover;border-radius:4px;flex:none}.cache-inventory__item span{overflow:hidden;text-overflow:ellipsis}.cache-inventory__loading,.cache-inventory__empty{margin:.6rem 0;color:#aeb0bd}";
    style.textContent += ".cache-inventory__tools{display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;margin:0 0 .7rem}.cache-inventory__refresh{padding:.58rem .75rem;border:1px solid rgba(168,85,247,.65);border-radius:8px;background:rgba(168,85,247,.16);color:inherit;font-weight:750;cursor:pointer}.cache-inventory__refresh:disabled{opacity:.55;cursor:wait}.cache-inventory__refresh-status{font-size:.88rem;color:#b9bbc8}.cache-inventory__refresh-status.is-error{color:#ff8b8b}";
    document.head.appendChild(style);
    document.getElementById("cache-warm-run")?.addEventListener("click", followWarmup, true);
    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!form || form.id !== "vel-admin-login-form") return;
      var username = form.querySelector("#vel-admin-username");
      var password = form.querySelector("#vel-admin-password");
      var usernameValue = username ? username.value : "";
      var passwordValue = password ? password.value : "";
      window.setTimeout(function () {
        if (sessionStorage.getItem("velora_admin_settings") !== "1") return;
        createCatalogAdminSession(usernameValue, passwordValue).catch(function () {});
      }, 0);
    }, true);
    document.addEventListener("click", function (event) {
      if (event.target && event.target.closest && event.target.closest("#settings-tab-btn-cache")) loadInventory();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();

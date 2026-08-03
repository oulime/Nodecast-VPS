(function () {
  "use strict";

  var root;
  var pollTimer = null;
  var kindLabels = { live: "TV", vod: "Films", series: "Séries" };

  function headers() {
    var token = "";
    try { token = localStorage.getItem("authToken") || ""; } catch (_) {}
    return token ? { Authorization: "Bearer " + token } : {};
  }

  async function request(path) {
    var response = await fetch(path, { cache: "no-store", headers: headers() });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
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

  function render(payload) {
    root.replaceChildren();
    var providers = payload && Array.isArray(payload.providers) ? payload.providers : [];
    if (!providers.length) {
      root.appendChild(element("p", "cache-inventory__empty", "Aucun package trouvé dans le cache catalogue."));
      return;
    }
    var summary = providers.reduce(function (total, provider) { return total + provider.packages.length; }, 0);
    root.appendChild(element("h3", "cache-inventory__title", providers.length + " fournisseur(s) · " + summary + " package(s) chargés"));
    providers.forEach(function (provider) {
      var section = element("section", "cache-inventory__provider");
      section.appendChild(element("h4", "", provider.name + " · " + provider.packages.length + " package(s)"));
      var packages = element("div", "cache-inventory__packages");
      provider.packages.forEach(function (packageRow) {
        var wrapper = element("div", "cache-inventory__package");
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
      section.appendChild(packages);
      root.appendChild(section);
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
    style.textContent = ".cache-package-inventory{margin-top:1rem}.cache-inventory__title{margin:0 0 .75rem}.cache-inventory__provider{margin:.75rem 0;padding:.75rem;border:1px solid rgba(255,255,255,.12);border-radius:12px}.cache-inventory__provider h4{margin:0 0 .6rem}.cache-inventory__packages{display:grid;gap:.4rem}.cache-inventory__package-button{width:100%;padding:.65rem .8rem;text-align:left;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.06);color:inherit;cursor:pointer}.cache-inventory__package-button[aria-expanded=true]{border-color:#a855f7}.cache-inventory__content{padding:.6rem}.cache-inventory__items{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.45rem}.cache-inventory__item{display:flex;align-items:center;gap:.55rem;min-width:0;padding:.4rem;border-radius:7px;background:rgba(0,0,0,.24)}.cache-inventory__item img{width:38px;height:52px;object-fit:cover;border-radius:4px;flex:none}.cache-inventory__item span{overflow:hidden;text-overflow:ellipsis}.cache-inventory__loading,.cache-inventory__empty{margin:.6rem 0;color:#aeb0bd}";
    document.head.appendChild(style);
    document.getElementById("cache-warm-run")?.addEventListener("click", followWarmup, true);
    document.addEventListener("click", function (event) {
      if (event.target && event.target.closest && event.target.closest('[data-settings-tab="cache"]')) loadInventory();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();

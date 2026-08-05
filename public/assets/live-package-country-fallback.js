(function () {
  "use strict";

  var observer = null;

  // The compiled grid sets an image URL before it appends the image to its
  // package card. A MutationObserver therefore runs too late: the browser has
  // already started downloading the first channel logo. Delay property-based
  // image sources for one microtask, inspect the final parent, and never set a
  // source for default live package artwork.
  var imageSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  var delayedSources = new WeakMap();
  if (imageSrc && imageSrc.get && imageSrc.set) {
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      configurable: true,
      enumerable: imageSrc.enumerable,
      get: imageSrc.get,
      set: function (value) {
        var image = this;
        var source = String(value || "");
        delayedSources.set(image, source);
        queueMicrotask(function () {
          if (delayedSources.get(image) !== source) return;
          delayedSources.delete(image);
          var card = image.closest && image.closest(".vel-package-card--live-default-art");
          if (card && image.classList.contains("vel-package-card__art")) return;
          imageSrc.set.call(image, source);
        });
      }
    });
  }

  function countryLogo() {
    var select = document.getElementById("country-select");
    var name = String(select?.selectedOptions?.[0]?.textContent || "").trim();
    var normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    var savedKey = normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    var saved = String(window.__veloraCountryLogosByName?.[savedKey] || "").trim();
    if (saved) return saved;
    if (normalized === "arabe") return "/logos/arabe.svg";
    var visibleFlag = document.getElementById("home-country-flag") ||
      document.getElementById("vel-brand-country-flag") ||
      document.getElementById("vel-bottom-country-flag");
    var visible = String(visibleFlag?.currentSrc || visibleFlag?.src || "").trim();
    if (visible) return visible;
    var countryKey = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    var codes = {
      france: "fr", belgique: "be", suisse: "ch", maroc: "ma", algerie: "dz",
      tunisie: "tn", espagne: "es", portugal: "pt", allemagne: "de", italie: "it",
      "royaume-uni": "gb", angleterre: "gb", "etats-unis": "us", usa: "us", canada: "ca"
    };
    return codes[countryKey] ? "https://flagcdn.com/w160/" + codes[countryKey] + ".png" : "";
  }

  function prepare(card, logo) {
    if (!(card instanceof HTMLElement) || !card.classList.contains("vel-package-card--live")) return;
    // Default live artwork is the first channel logo. It is not a package
    // cover, so discard it immediately: keeping it hidden still downloads it.
    if (!card.classList.contains("vel-package-card--live-default-art")) return;
    card.querySelectorAll("img.vel-package-card__art").forEach(function (image) {
      image.removeAttribute("src");
      image.remove();
    });
    card.querySelectorAll(".vel-package-card__title").forEach(function (title) {
      title.style.removeProperty("display");
    });
    card.classList.add("vel-live-country-fallback");
    if (logo) card.style.setProperty("--vel-live-country-logo", `url("${logo.replace(/["\\]/g, "")}")`);
    else card.style.removeProperty("--vel-live-country-logo");
  }

  function refresh() {
    var root = document.getElementById("packages-view");
    if (!root) return;
    var logo = countryLogo();
    root.querySelectorAll(".vel-package-card--live").forEach(function (card) { prepare(card, logo); });
    if (!observer) {
      observer = new MutationObserver(function (changes) {
        var currentLogo = countryLogo();
        changes.forEach(function (change) {
          change.addedNodes.forEach(function (node) {
            if (!(node instanceof Element)) return;
            if (node.matches(".vel-package-card--live")) prepare(node, currentLogo);
            node.querySelectorAll?.(".vel-package-card--live").forEach(function (card) { prepare(card, currentLogo); });
          });
        });
      });
      observer.observe(root, { childList: true, subtree: true });
    }
  }

  document.addEventListener("velora-country-logos-changed", refresh);
  document.addEventListener("velora-countries-ready", refresh);
  document.getElementById("country-select")?.addEventListener("change", function () {
    window.setTimeout(refresh, 0);
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh, { once: true });
  else refresh();
  window.setTimeout(refresh, 1200);
})();

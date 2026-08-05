(function () {
  "use strict";

  var observer = null;

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

(function () {
  "use strict";

  var payload = null;
  var timer = null;
  var renderedCountry = null;

  function sectionsForCountry(data) {
    var country = String(document.getElementById("country-select")?.value || "");
    var sections = Array.isArray(data?.sections) ? data.sections : [];
    var rows = sections.filter(function (row) {
      return row.published !== false && String(row.country_id || "") === country;
    });
    if (!rows.length) {
      rows = sections.filter(function (row) {
        return row.published !== false && (!row.country_id || row.country_id === "default");
      });
    }
    return rows.sort(function (a, b) {
      return (Number(a.section_order) || 0) - (Number(b.section_order) || 0);
    });
  }

  function card(section, entry) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "vel-home-section__card vel-home-section__card--" + section.content_type;
    button.setAttribute("aria-label", entry.name || "");
    button.dataset.packageId = String(section.package_id || entry.packageId || "");
    button.dataset.packageName = String(section.title || "");
    button.dataset.contentType = String(section.content_type || "");
    button.dataset.mediaId = String(entry.streamId || entry.seriesId || entry.id || "");
    var media;
    if (entry.thumbUrl) {
      media = document.createElement("img");
      media.src = entry.thumbUrl;
      media.alt = "";
      media.loading = "lazy";
    } else {
      media = document.createElement("span");
      media.textContent = "▶";
      media.classList.add("vel-home-section__fallback");
    }
    media.classList.add("vel-home-section__media");
    var name = document.createElement("span");
    name.className = "vel-home-section__name";
    name.textContent = entry.name || "";
    button.append(media, name);
    if (typeof window.veloraBindHomeCardActivation === "function") {
      window.veloraBindHomeCardActivation(button, section, entry);
    }
    button.addEventListener("click", function () {
      if (typeof window.veloraOpenHomeCacheEntry === "function") {
        window.veloraOpenHomeCacheEntry(section, entry, button);
      }
    });
    return button;
  }

  function renderIfEmpty() {
    var root = document.getElementById("vel-home-sections");
    var country = String(document.getElementById("country-select")?.value || "");
    if (!payload || !root) return;
    if (root.querySelector(".vel-home-section__card") && renderedCountry === country) return;
    var sections = sectionsForCountry(payload);
    if (!sections.length) return;
    root.replaceChildren();
    sections.forEach(function (section) {
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
          : (Array.isArray(section.entries) && section.entries.length > 0 ? section.entries : null);
        if (typeof window.veloraOpenPrimePackageModal === "function") {
          window.veloraOpenPrimePackageModal(section.content_type || "movies", {
            id: section.package_id || section.id || section.title,
            name: section.title,
            customItems: customList
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
      if (typeof window.veloraApplyHomeChannelRules === "function") entries = window.veloraApplyHomeChannelRules(section, entries);
      entries.forEach(function (entry) {
        rail.appendChild(card(section, entry));
      });
      block.append(headerSec, railWrap);
      root.appendChild(block);
    });
    renderedCountry = country;
    document.dispatchEvent(new CustomEvent("velora-home-country-rendered", {
      detail: { countryId: String(document.getElementById("country-select")?.value || "") }
    }));
  }

  async function load() {
    try {
      var response = await fetch("/api/velora-db/home-cache?t=" + Date.now(), { cache: "no-store" });
      if (!response.ok) return;
      payload = await response.json();
      renderIfEmpty();
      if (!timer) timer = window.setInterval(renderIfEmpty, 1000);
    } catch (error) {}
  }

  window.addEventListener("load", load, { once: true });
  document.addEventListener("velora-countries-ready", load);
  document.addEventListener("velora-home-cache-ready", renderIfEmpty);
  window.setTimeout(load, 1200);
  window.setTimeout(function () {
    document.getElementById("country-select")?.addEventListener("change", function () {
      window.setTimeout(renderIfEmpty, 50);
    });
  }, 0);
})();

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
      var block = document.createElement("section");
      block.className = "vel-home-section";
      var heading = document.createElement("h3");
      heading.className = "vel-home-section__heading";
      heading.textContent = section.title || "";
      var rail = document.createElement("div");
      rail.className = "vel-home-section__rail";
      (Array.isArray(section.entries) ? section.entries : []).forEach(function (entry) {
        rail.appendChild(card(section, entry));
      });
      block.append(heading, rail);
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

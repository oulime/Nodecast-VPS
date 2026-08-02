(function () {
  "use strict";

  function activeCountryId() {
    var select = document.getElementById("country-select");
    return select ? String(select.value || "") : "";
  }

  function openEntry(section, entry) {
    document.body.dataset.veloraReturnHome = "true";
    document.body.classList.remove("vel-home-empty-active");
    document.body.dataset.velActiveTab = section.content_type;
    document.querySelectorAll("[data-bottom-nav]").forEach(function (button) {
      var active = button.getAttribute("data-bottom-nav") === section.content_type;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (entry.streamId != null && typeof window.veloraOpenCachedHomeItem === "function") {
      window.veloraOpenCachedHomeItem(section, entry);
    } else if (typeof window.veloraOpenSearchResult === "function") {
      window.veloraOpenSearchResult(entry.id);
    }
  }

  function createCard(section, entry) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "vel-home-section__card vel-home-section__card--" + section.content_type;
    card.setAttribute("aria-label", entry.name || "");
    var media;
    if (entry.thumbUrl) {
      media = document.createElement("img");
      media.src = entry.thumbUrl;
      media.alt = "";
      media.loading = "lazy";
      media.addEventListener("error", function () {
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
    card.addEventListener("click", function () { openEntry(section, entry); });
    return card;
  }

  function render(payload) {
    var root = document.getElementById("vel-home-sections");
    if (!root || root.querySelector(".vel-home-section__card")) return true;
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
    matching.sort(function (a, b) { return (Number(a.section_order) || 0) - (Number(b.section_order) || 0); });
    root.replaceChildren();
    matching.forEach(function (section) {
      var block = document.createElement("section");
      block.className = "vel-home-section";
      var heading = document.createElement("h3");
      heading.className = "vel-home-section__heading";
      heading.textContent = section.title || "";
      var rail = document.createElement("div");
      rail.className = "vel-home-section__rail";
      (Array.isArray(section.entries) ? section.entries : []).forEach(function (entry) {
        rail.appendChild(createCard(section, entry));
      });
      block.append(heading, rail);
      root.appendChild(block);
    });
    return !!root.querySelector(".vel-home-section__card");
  }

  async function loadAndRender() {
    try {
      var response = await fetch("/api/velora-db/home-cache", { cache: "no-store" });
      if (!response.ok) return;
      var payload = await response.json();
      var attempts = 0;
      var timer = window.setInterval(function () {
        attempts += 1;
        if (render(payload) || attempts >= 30) window.clearInterval(timer);
      }, 300);
      render(payload);
    } catch (error) {}
  }

  document.addEventListener("velora-app-ready", loadAndRender);
  document.getElementById("country-select")?.addEventListener("change", loadAndRender);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadAndRender, { once: true });
  } else {
    loadAndRender();
  }
})();

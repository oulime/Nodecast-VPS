(() => {
  "use strict";

  const root = document.getElementById("vel-home-sections");

  function openCustomSectionModal(sectionNode, sectionTitle, contentType, isHorizontal) {
    if (!sectionNode && !sectionTitle) return;

    const oldModal = document.getElementById("vel-home-custom-section-modal");
    if (oldModal) oldModal.remove();

    let secObj = null;
    if (typeof window.veloraGetHomeSectionByNodeOrTitle === "function") {
      secObj = window.veloraGetHomeSectionByNodeOrTitle(sectionNode, sectionTitle);
    }

    const cards = sectionNode ? Array.from(sectionNode.querySelectorAll(".vel-home-section__rail > .vel-home-section__card:not(.vel-home-section__package-link)")) : [];
    const firstCard = cards[0];
    const packageId = String(sectionNode?.dataset?.packageId || firstCard?.dataset?.packageId || secObj?.package_id || "").trim();
    const effectiveContentType = contentType || sectionNode?.dataset?.contentType || secObj?.content_type || "movies";
    const customList = (secObj && Array.isArray(secObj.custom_entries) && secObj.custom_entries.length > 0)
      ? secObj.custom_entries
      : null;

    let matchedPkg = null;
    if (window.veloraHomeSectionsState && Array.isArray(window.veloraHomeSectionsState.packages)) {
      if (packageId) {
        matchedPkg = window.veloraHomeSectionsState.packages.find(p => String(p.id) === packageId);
      }
      if (!matchedPkg && sectionTitle) {
        const sTitle = String(sectionTitle).trim().toLowerCase();
        matchedPkg = window.veloraHomeSectionsState.packages.find(p => String(p.name || "").trim().toLowerCase() === sTitle);
      }
    }

    const finalKind = effectiveContentType || (matchedPkg && matchedPkg.kind === "series" ? "series" : "movies");
    const payload = {
      id: packageId || (matchedPkg && matchedPkg.id) || secObj?.id || sectionTitle,
      name: sectionTitle,
      category_id: matchedPkg?.category_id,
      source_id: matchedPkg?.source_id,
      country_id: matchedPkg?.country_id || secObj?.country_id,
      customItems: customList || undefined
    };

    if (typeof window.veloraOpenPrimePackageModal === "function") {
      window.veloraOpenPrimePackageModal(finalKind, payload);
    } else {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts++;
        if (typeof window.veloraOpenPrimePackageModal === "function") {
          clearInterval(timer);
          window.veloraOpenPrimePackageModal(finalKind, payload);
        } else if (attempts > 30) {
          clearInterval(timer);
        }
      }, 50);
    }
  }

  window.veloraOpenHomeCustomSectionModal = openCustomSectionModal;

  function decoratePackageLinks() {
    const container = document.getElementById("vel-home-sections");
    if (!container) return;

    container.querySelectorAll(":scope > .vel-home-section").forEach(sectionNode => {
      // Remove any trailing package-link cards from rail
      sectionNode.querySelectorAll(".vel-home-section__package-link").forEach(el => el.remove());
      sectionNode.querySelectorAll(".vel-home-section__header-toggle").forEach(el => el.remove());

      if (sectionNode.classList.contains("vel-home-section--resume")) {
        return; // Continue watching doesn't need "Voir plus"
      }

      const rail = sectionNode.querySelector(":scope > .vel-home-section__rail, :scope > .vel-home-section__rail-wrap > .vel-home-section__rail");
      const firstCard = rail ? rail.querySelector(":scope > .vel-home-section__card") : null;
      let heading = sectionNode.querySelector(".vel-home-section__heading, .qwttco");
      const sectionTitle = heading ? (heading.querySelector("[data-testid='carousel-title']") ? heading.querySelector("[data-testid='carousel-title']").textContent.trim() : heading.textContent.trim()) : "";

      if (!sectionTitle) return;

      let secObj = null;
      if (typeof window.veloraGetHomeSectionByNodeOrTitle === "function") {
        secObj = window.veloraGetHomeSectionByNodeOrTitle(sectionNode, sectionTitle);
      }

      const packageId = String(sectionNode.dataset.packageId || firstCard?.dataset?.packageId || secObj?.package_id || "").trim();
      const contentType = String(sectionNode.dataset.contentType || firstCard?.dataset?.contentType || secObj?.content_type || "movies");
      const isHorizontal = sectionNode.classList.contains("vel-home-section--horizontal");
      const customList = (secObj && Array.isArray(secObj.custom_entries) && secObj.custom_entries.length > 0)
        ? secObj.custom_entries
        : null;

      let matchedPkg = null;
      if (window.veloraHomeSectionsState && Array.isArray(window.veloraHomeSectionsState.packages)) {
        if (packageId) {
          matchedPkg = window.veloraHomeSectionsState.packages.find(p => String(p.id) === packageId);
        }
        if (!matchedPkg && sectionTitle) {
          const sTitle = String(sectionTitle).trim().toLowerCase();
          matchedPkg = window.veloraHomeSectionsState.packages.find(p => String(p.name || "").trim().toLowerCase() === sTitle);
        }
      }

      let header = sectionNode.querySelector(":scope > .vel-home-section__header, :scope > .QHjixV");

      const onOpen = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.veloraOpenPrimePackageModal === "function") {
          const finalKind = contentType || (matchedPkg && matchedPkg.kind === "series" ? "series" : "movies");
          window.veloraOpenPrimePackageModal(finalKind, {
            id: packageId || (matchedPkg && matchedPkg.id) || secObj?.id || sectionTitle,
            name: sectionTitle,
            category_id: matchedPkg?.category_id,
            source_id: matchedPkg?.source_id,
            country_id: matchedPkg?.country_id || secObj?.country_id,
            customItems: customList || undefined
          });
        } else {
          openCustomSectionModal(sectionNode, sectionTitle, contentType, isHorizontal);
        }
      };

      if (!header) {
        header = document.createElement("section");
        header.className = "QHjixV vel-home-section__header";
        const tvxg = document.createElement("span");
        tvxg.className = "TvxgS1";

        const newH2 = document.createElement("h2");
        newH2.className = "qwttco vel-home-section__heading";
        newH2.style.cursor = "pointer";
        newH2.innerHTML = `<span data-testid="carousel-title"><span>${sectionTitle}</span></span>`;

        const seeMore = document.createElement("a");
        seeMore.href = "#";
        seeMore.className = "toEceS vel-home-section__see-more";
        seeMore.dataset.testid = "see-more";
        seeMore.setAttribute("aria-label", sectionTitle);
        seeMore.innerHTML = `
          <span class="IcIpJ_">Voir plus</span>
          <svg class="_22qEau" viewBox="0 0 24 24" height="24" width="24" role="img" aria-hidden="true">
            <title>Link Arrow</title>
            <path stroke="currentColor" stroke-width="2" d="M9.5 17.5l5-5-5-5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        `;

        newH2.addEventListener("click", onOpen);
        seeMore.addEventListener("click", onOpen);

        tvxg.append(newH2, seeMore);
        header.appendChild(tvxg);

        if (heading) heading.remove();
        sectionNode.insertBefore(header, sectionNode.firstChild);
      } else {
        let seeMore = header.querySelector(".toEceS, .vel-home-section__see-more");
        if (!seeMore) {
          seeMore = document.createElement("a");
          seeMore.href = "#";
          seeMore.className = "toEceS vel-home-section__see-more";
          seeMore.dataset.testid = "see-more";
          seeMore.setAttribute("aria-label", sectionTitle);
          seeMore.innerHTML = `
            <span class="IcIpJ_">Voir plus</span>
            <svg class="_22qEau" viewBox="0 0 24 24" height="24" width="24" role="img" aria-hidden="true">
              <title>Link Arrow</title>
              <path stroke="currentColor" stroke-width="2" d="M9.5 17.5l5-5-5-5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
          `;
          const tvxg = header.querySelector(".TvxgS1") || header;
          tvxg.appendChild(seeMore);
          seeMore.addEventListener("click", onOpen);
        }
        if (heading && !heading._veloraClickBound) {
          heading._veloraClickBound = true;
          heading.style.cursor = "pointer";
          heading.addEventListener("click", onOpen);
        }
      }
    });
  }

  if (root) {
    new MutationObserver(decoratePackageLinks).observe(root, { childList: true, subtree: true });
  }
  document.addEventListener("velora-home-country-rendered", decoratePackageLinks);
  document.addEventListener("velora-home-cache-ready", decoratePackageLinks);
  decoratePackageLinks();
})();

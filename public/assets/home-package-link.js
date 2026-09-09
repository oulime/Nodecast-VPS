(() => {
  "use strict";

  const root = document.getElementById("vel-home-sections");

  function openCustomSectionModal(sectionNode, sectionTitle, contentType, isHorizontal) {
    if (!sectionNode && !sectionTitle) return;

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
      : (secObj && Array.isArray(secObj.entries) && secObj.entries.length > 0 ? secObj.entries : null);

    if (typeof window.veloraOpenPrimePackageModal === "function") {
      window.veloraOpenPrimePackageModal(effectiveContentType, {
        id: packageId || secObj?.id || sectionTitle,
        name: sectionTitle,
        customItems: customList
      });
      return;
    }

    let modal = document.getElementById("vel-home-custom-section-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "vel-home-custom-section-modal";
      modal.className = "vel-home-custom-section-modal vel-pkg-modal";
      modal.innerHTML = `
        <div class="vel-home-custom-section-modal__backdrop vel-pkg-modal__backdrop"></div>
        <div class="vel-home-custom-section-modal__dialog vel-pkg-modal__dialog" role="dialog" aria-modal="true">
          <div class="vel-home-custom-section-modal__header vel-pkg-modal__header">
            <div class="vel-home-custom-section-modal__header-info vel-pkg-modal__titles">
              <h2 class="vel-home-custom-section-modal__title vel-pkg-modal__title"></h2>
              <span class="vel-home-custom-section-modal__badge vel-pkg-modal__count"></span>
            </div>
            <button type="button" class="vel-home-custom-section-modal__close vel-pkg-modal__close" aria-label="Fermer" title="Fermer">✕</button>
          </div>
          <div class="vel-home-custom-section-modal__body vel-pkg-modal__body">
            <div class="vel-home-custom-section-modal__grid vel-pkg-modal__grid"></div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeBtn = modal.querySelector(".vel-home-custom-section-modal__close");
      const backdrop = modal.querySelector(".vel-home-custom-section-modal__backdrop");
      const closeModal = () => {
        modal.classList.add("hidden");
        modal.classList.remove("is-open");
        document.body.classList.remove("vel-modal-active");
      };
      closeBtn.addEventListener("click", closeModal);
      backdrop.addEventListener("click", closeModal);
      document.addEventListener("keydown", e => {
        if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
      });
    }

    const titleEl = modal.querySelector(".vel-home-custom-section-modal__title");
    const badgeEl = modal.querySelector(".vel-home-custom-section-modal__badge");
    const gridEl = modal.querySelector(".vel-home-custom-section-modal__grid");
    const bodyEl = modal.querySelector(".vel-home-custom-section-modal__body");

    titleEl.textContent = sectionTitle || "Section Accueil";

    if (isHorizontal) {
      gridEl.classList.add("vel-home-custom-section-modal__grid--horizontal");
    } else {
      gridEl.classList.remove("vel-home-custom-section-modal__grid--horizontal");
    }

    gridEl.replaceChildren();

    const itemsToRender = Array.isArray(customList) && customList.length > 0 ? customList : cards;

    if (badgeEl) {
      const count = itemsToRender.length;
      badgeEl.textContent = count + (count > 1 ? " éléments" : " élément");
    }

    if (Array.isArray(customList) && customList.length > 0) {
      customList.forEach(item => {
        const cardBtn = document.createElement("button");
        cardBtn.type = "button";
        cardBtn.className = "vel-home-section__card vel-home-section__card--" + effectiveContentType;
        const name = item.name || item.title || "";
        cardBtn.setAttribute("aria-label", name);
        const thumb = item.thumbUrl || item.posterUrl || item.backdropUrl || "";
        if (thumb) {
          const img = document.createElement("img");
          img.src = thumb;
          img.alt = "";
          img.loading = "lazy";
          img.className = "vel-home-section__media";
          cardBtn.appendChild(img);
        }
        const nameSpan = document.createElement("span");
        nameSpan.className = "vel-home-section__name";
        nameSpan.textContent = name;
        cardBtn.appendChild(nameSpan);

        cardBtn.addEventListener("click", () => {
          modal.classList.add("hidden");
          modal.classList.remove("is-open");
          document.body.classList.remove("vel-modal-active");
          if (typeof window.veloraOpenHomeCacheEntry === "function") {
            window.veloraOpenHomeCacheEntry(secObj || { content_type: effectiveContentType }, item, cardBtn);
          }
        });
        gridEl.appendChild(cardBtn);
      });
    } else {
      cards.forEach(cardNode => {
        const clone = cardNode.cloneNode(true);
        clone.addEventListener("click", () => {
          modal.classList.add("hidden");
          modal.classList.remove("is-open");
          document.body.classList.remove("vel-modal-active");
          cardNode.click();
        });
        gridEl.appendChild(clone);
      });
    }

    if (bodyEl) bodyEl.scrollTop = 0;
    modal.classList.remove("hidden");
    modal.classList.add("is-open");
    document.body.classList.add("vel-modal-active");
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
        : (secObj && Array.isArray(secObj.entries) && secObj.entries.length > 0 ? secObj.entries : null);

      let header = sectionNode.querySelector(":scope > .vel-home-section__header, :scope > .QHjixV");

      const onOpen = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.veloraOpenPrimePackageModal === "function") {
          window.veloraOpenPrimePackageModal(contentType, {
            id: packageId || secObj?.id || sectionTitle,
            name: sectionTitle,
            customItems: customList
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

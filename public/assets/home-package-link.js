(() => {
  "use strict";

  const root = document.getElementById("vel-home-sections");
  if (!root) return;

  function openCustomSectionModal(sectionNode, sectionTitle, contentType, isHorizontal) {
    let modal = document.getElementById("vel-home-custom-section-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "vel-home-custom-section-modal";
      modal.className = "vel-home-custom-section-modal hidden";
      modal.innerHTML = `
        <div class="vel-home-custom-section-modal__backdrop"></div>
        <div class="vel-home-custom-section-modal__dialog" role="dialog" aria-modal="true">
          <div class="vel-home-custom-section-modal__header">
            <div class="vel-home-custom-section-modal__header-info">
              <h2 class="vel-home-custom-section-modal__title"></h2>
              <span class="vel-home-custom-section-modal__badge"></span>
            </div>
            <button type="button" class="vel-home-custom-section-modal__close" aria-label="Fermer" title="Fermer">✕</button>
          </div>
          <div class="vel-home-custom-section-modal__body">
            <div class="vel-home-custom-section-modal__grid"></div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeBtn = modal.querySelector(".vel-home-custom-section-modal__close");
      const backdrop = modal.querySelector(".vel-home-custom-section-modal__backdrop");
      const closeModal = () => modal.classList.add("hidden");
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

    const cards = sectionNode.querySelectorAll(".vel-home-section__rail > .vel-home-section__card:not(.vel-home-section__package-link)");
    if (badgeEl) {
      badgeEl.textContent = cards.length + (cards.length > 1 ? " éléments" : " élément");
    }

    cards.forEach(cardNode => {
      const clone = cardNode.cloneNode(true);
      clone.addEventListener("click", () => {
        modal.classList.add("hidden");
        cardNode.click();
      });
      gridEl.appendChild(clone);
    });

    if (bodyEl) bodyEl.scrollTop = 0;
    modal.classList.remove("hidden");
  }

  function decoratePackageLinks() {
    root.querySelectorAll(":scope > .vel-home-section").forEach(sectionNode => {
      const rail = sectionNode.querySelector(":scope > .vel-home-section__rail");
      if (!rail || rail.querySelector(":scope > .vel-home-section__package-link")) return;

      const firstCard = rail.querySelector(":scope > .vel-home-section__card");
      if (!firstCard) return;

      const packageId = String(firstCard.dataset.packageId || "").trim();
      const contentType = String(firstCard.dataset.contentType || "series");
      const heading = sectionNode.querySelector(":scope > .vel-home-section__heading");
      const sectionTitle = heading ? heading.textContent.trim() : "";
      const isHorizontal = sectionNode.classList.contains("vel-home-section--horizontal");

      // Remove any existing header buttons if present
      sectionNode.querySelectorAll(".vel-home-section__header-toggle").forEach(el => el.remove());

      const button = document.createElement("button");
      button.type = "button";
      button.className = `vel-home-section__card vel-home-section__package-link vel-home-section__package-link--${contentType}${isHorizontal ? " vel-home-section__package-link--horizontal" : ""}`;
      if (packageId) button.dataset.packageId = packageId;
      button.dataset.contentType = contentType;
      button.setAttribute("aria-label", "Voir plus");

      const icon = document.createElement("span");
      icon.className = "vel-home-section__package-link-icon";
      icon.innerHTML = '<svg viewBox="0 0 48 48" focusable="false"><circle cx="24" cy="24" r="19"></circle><path d="M15.5 24h16.2m-6.4-6.4 6.4 6.4-6.4 6.4"></path></svg>';
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "vel-home-section__package-link-label";
      label.textContent = "Voir plus";
      button.append(icon, label);

      const onOpen = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openCustomSectionModal(sectionNode, sectionTitle, contentType, isHorizontal);
      };
      button.addEventListener("click", onOpen);

      rail.appendChild(button);
    });
  }

  new MutationObserver(decoratePackageLinks).observe(root, { childList: true, subtree: true });
  document.addEventListener("velora-home-country-rendered", decoratePackageLinks);
  document.addEventListener("velora-home-cache-ready", decoratePackageLinks);
  decoratePackageLinks();
})();

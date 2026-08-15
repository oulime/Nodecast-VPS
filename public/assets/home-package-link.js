(() => {
  "use strict";

  const root = document.getElementById("vel-home-sections");
  if (!root) return;

  function decoratePackageLinks() {
    root.querySelectorAll(":scope > .vel-home-section").forEach(sectionNode => {
      const rail = sectionNode.querySelector(":scope > .vel-home-section__rail");
      if (!rail || rail.querySelector(":scope > .vel-home-section__package-link")) return;
      const firstCard = rail.querySelector(":scope > .vel-home-section__card[data-package-id]");
      if (!firstCard) return;
      const packageId = String(firstCard.dataset.packageId || "");
      const contentType = String(firstCard.dataset.contentType || "live");
      if (!packageId) return;

      const button = document.createElement("button");
      button.type = "button";
      button.className = `vel-home-section__card vel-home-section__package-link vel-home-section__package-link--${contentType}`;
      button.dataset.packageId = packageId;
      button.dataset.contentType = contentType;
      button.setAttribute("aria-label", "Voir tout le package");

      const icon = document.createElement("span");
      icon.className = "vel-home-section__package-link-icon";
      icon.textContent = "→";
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "vel-home-section__package-link-label";
      label.textContent = "Voir tout le package";
      const hint = document.createElement("small");
      hint.textContent = "Afficher tous les contenus";
      button.append(icon, label, hint);
      button.addEventListener("click", () => {
        window.veloraOpenHomePackage?.({ package_id: packageId, content_type: contentType }, button);
      });
      rail.appendChild(button);
    });
  }

  new MutationObserver(decoratePackageLinks).observe(root, { childList: true, subtree: true });
  document.addEventListener("velora-home-country-rendered", decoratePackageLinks);
  document.addEventListener("velora-home-cache-ready", decoratePackageLinks);
  decoratePackageLinks();
})();

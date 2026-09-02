(function () {
  "use strict";

  function scrollToTop() {
    var main = document.querySelector(".main--velora") || document.getElementById("main");
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }

  // Reset scroll on all navigation custom events
  ["velora-top-level-tab", "velora-home-tab", "velora-show-home", "velora-return-home", "velora-country-change"].forEach(function (evt) {
    document.addEventListener(evt, scrollToTop, { passive: true });
  });

  // Watch for tab and view changes via MutationObserver
  var lastTab = "";
  new MutationObserver(function () {
    var currentTab = String(document.body.dataset.velActiveTab || document.body.dataset.velTopLevel || "");
    if (document.body.classList.contains("vel-home-empty-active")) currentTab = "home";
    if (document.body.classList.contains("vel-favorites-open")) currentTab = "favorites";
    if (document.body.classList.contains("vel-adult-active")) currentTab = "adult";

    if (currentTab && currentTab !== lastTab) {
      lastTab = currentTab;
      scrollToTop();
    }
  }).observe(document.body, {
    attributes: true,
    attributeFilter: ["class", "data-vel-active-tab", "data-vel-top-level"]
  });

  // Reset scroll on any navigation click (bottom nav, home tabs, logo, back buttons)
  document.addEventListener("click", function (event) {
    var btn = event.target && event.target.closest("[data-bottom-nav], #btn-logo-home, [data-home-tab], #btn-header-back, .vel-header-back-btn, #btn-back-home");
    if (btn) scrollToTop();
  }, true);

  window.veloraScrollToTop = scrollToTop;
})();

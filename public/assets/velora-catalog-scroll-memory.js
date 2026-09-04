(function () {
  "use strict";

  function scrollToTop() {
    var main = document.querySelector(".main--velora") || document.getElementById("main");
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }

  // Reset scroll on explicit page navigation clicks (Accueil, TV, Films, Séries) - EXCLUDING country picker button
  document.addEventListener("click", function (event) {
    if (event.target && event.target.closest("#vel-bottom-country-menu, #country-select, .country-select, .country-select-trigger, .velora-country-select-menu, [data-bottom-nav='country']")) {
      return;
    }
    var navBtn = event.target && event.target.closest("#vel-bottom-nav [data-bottom-nav]:not([data-bottom-nav='country']), #btn-logo-home, #btn-adult-back-home");
    if (navBtn) {
      scrollToTop();
    }
  }, true);

  window.veloraScrollToTop = scrollToTop;
})();

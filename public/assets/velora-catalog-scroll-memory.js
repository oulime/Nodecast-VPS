(function () {
  "use strict";

  function scrollToTop() {
    var main = document.querySelector(".main--velora") || document.getElementById("main");
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }

  // Only reset scroll when user explicitly clicks main navigation buttons (bottom nav, logo, back to home)
  document.addEventListener("click", function (event) {
    var navBtn = event.target && event.target.closest("#vel-bottom-nav [data-bottom-nav], #btn-logo-home, #btn-adult-back-home");
    if (navBtn) {
      scrollToTop();
    }
  }, true);

  window.veloraScrollToTop = scrollToTop;
})();

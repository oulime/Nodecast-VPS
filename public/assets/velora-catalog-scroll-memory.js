(function () {
  "use strict";

  function scrollToTop() {
    var main = document.querySelector(".main--velora") || document.getElementById("main");
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }

  // Reset scroll on explicit bottom nav / logo clicks
  document.addEventListener("click", function (event) {
    var navBtn = event.target && event.target.closest("#vel-bottom-nav [data-bottom-nav], #btn-logo-home, #btn-adult-back-home");
    if (navBtn) {
      scrollToTop();
    }
  }, true);

  window.veloraScrollToTop = scrollToTop;
})();

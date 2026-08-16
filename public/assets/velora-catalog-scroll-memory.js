(function () {
  "use strict";

  var main = document.querySelector(".main--velora");
  var packagesView = document.getElementById("packages-view");
  var contentView = document.getElementById("content-view");
  var dynamicList = document.getElementById("dynamic-list");

  if (!main || !packagesView || !contentView || !dynamicList) return;

  var pendingPackages = null;
  var pendingDetail = null;
  var lastPointerCapture = { key: "", at: 0 };

  function activeTab() {
    var tab = String(document.body.dataset.velActiveTab || "");
    return tab === "movies" || tab === "series" || tab === "live" ? tab : "";
  }

  function visible(node) {
    return Boolean(node && !node.classList.contains("hidden"));
  }

  function markerFor(node, attribute) {
    return {
      attribute: attribute,
      value: String(node.dataset[attribute === "data-package-id" ? "packageId" : "streamId"] || ""),
      offset: node.getBoundingClientRect().top - main.getBoundingClientRect().top
    };
  }

  function snapshot(kind, node, attribute) {
    return {
      kind: kind,
      tab: activeTab(),
      top: Math.max(0, main.scrollTop || 0),
      marker: markerFor(node, attribute),
      entered: false,
      createdAt: Date.now()
    };
  }

  function findMarker(saved) {
    if (!saved.marker || !saved.marker.value) return null;
    var scope = saved.kind === "packages" ? packagesView : dynamicList;
    var cards = scope.querySelectorAll("[" + saved.marker.attribute + "]");
    for (var i = 0; i < cards.length; i += 1) {
      if (cards[i].getAttribute(saved.marker.attribute) === saved.marker.value) return cards[i];
    }
    return null;
  }

  function applyPosition(saved) {
    if (!saved || (saved.tab && activeTab() !== saved.tab)) return;

    var oldBehavior = main.style.scrollBehavior;
    main.style.scrollBehavior = "auto";
    main.scrollTop = saved.top;

    // Keep the selected card at the same visual point as well. This corrects
    // small shifts caused by a rebuilt heading or responsive grid.
    var marker = findMarker(saved);
    if (marker) {
      var currentOffset = marker.getBoundingClientRect().top - main.getBoundingClientRect().top;
      var adjustment = currentOffset - saved.marker.offset;
      if (Math.abs(adjustment) > 0.5) main.scrollTop += adjustment;
    }

    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
    main.style.scrollBehavior = oldBehavior;
  }

  function restore(saved) {
    var run = function () { applyPosition(saved); };
    run();
    requestAnimationFrame(function () {
      run();
      requestAnimationFrame(run);
    });
    window.setTimeout(run, 90);
    window.setTimeout(run, 240);
    window.setTimeout(run, 600);
  }

  function isNestedAction(target, card) {
    var action = target.closest("button, a, input, select, textarea, [role='button']");
    return Boolean(action && action !== card);
  }

  function rememberOrigin(event) {
    var target = event.target;
    if (!target || typeof target.closest !== "function") return;

    var detailCard = target.closest(".vel-vod-movie-card[data-stream-id]");
    if (
      detailCard &&
      dynamicList.contains(detailCard) &&
      dynamicList.classList.contains("item-list--vod-vertical") &&
      !isNestedAction(target, detailCard)
    ) {
      var detailKey = "detail:" + activeTab() + ":" + detailCard.dataset.streamId;
      if (event.type !== "click" || lastPointerCapture.key !== detailKey || Date.now() - lastPointerCapture.at > 800) {
        pendingDetail = snapshot("detail", detailCard, "data-stream-id");
      }
      if (event.type === "pointerdown" || event.type === "touchstart") {
        lastPointerCapture = { key: detailKey, at: Date.now() };
      }
      return;
    }

    var packageCard = target.closest("#packages-view .vel-package-card[data-package-id]");
    if (packageCard && visible(packagesView) && !isNestedAction(target, packageCard)) {
      var packageKey = "packages:" + activeTab() + ":" + packageCard.dataset.packageId;
      if (event.type !== "click" || lastPointerCapture.key !== packageKey || Date.now() - lastPointerCapture.at > 800) {
        pendingPackages = snapshot("packages", packageCard, "data-package-id");
      }
      if (event.type === "pointerdown" || event.type === "touchstart") {
        lastPointerCapture = { key: packageKey, at: Date.now() };
      }
    }
  }

  function reconcileViews() {
    var tab = activeTab();
    var inDetail = visible(contentView) && Boolean(
      contentView.classList.contains("content-view--vod-film-detail") ||
      dynamicList.querySelector(".vel-vod-detail, .vel-series-detail, .vel-vod-series-detail")
    );
    var inContentList = visible(contentView) && !inDetail && dynamicList.classList.contains("item-list--vod-vertical");
    var inPackages = visible(packagesView) && !visible(contentView);

    if (pendingDetail) {
      if (pendingDetail.tab && tab !== pendingDetail.tab) pendingDetail = null;
      else if (inDetail) pendingDetail.entered = true;
      else if (pendingDetail.entered && inContentList) {
        var detailPosition = pendingDetail;
        pendingDetail = null;
        restore(detailPosition);
      }
    }

    if (pendingPackages) {
      if (pendingPackages.tab && tab !== pendingPackages.tab) pendingPackages = null;
      else if (visible(contentView)) pendingPackages.entered = true;
      else if (pendingPackages.entered && inPackages) {
        var packagesPosition = pendingPackages;
        pendingPackages = null;
        restore(packagesPosition);
      }
    }
  }

  document.addEventListener("pointerdown", rememberOrigin, true);
  document.addEventListener("touchstart", rememberOrigin, { capture: true, passive: true });
  document.addEventListener("click", rememberOrigin, true);

  new MutationObserver(reconcileViews).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-vel-active-tab"]
  });
})();

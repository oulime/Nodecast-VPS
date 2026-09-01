(function() {
  "use strict";

  var currentSlideIndex = 0;
  var sliderItems = [];
  var autoSlideTimer = null;
  var isPaused = false;
  var activeCountryId = "";
  var container = null;
  var AUTO_SLIDE_DELAY = 5500;

  function formatCleanTitle(text) {
    return String(text || '')
      .replace(/^(4K-?|UHD-?|FHD-?|HD-?)?([A-Za-z0-9]{1,6}(?:-[A-Za-z0-9]{1,6})?)\s*[-:|]\s*/i, '')
      .replace(/\[[^\]]+\]/g, '')
      .replace(/\b(4K|UHD|FHD|HD|HEVC|H265|1080p|720p|CAM|TS|DVD|BLURAY|TELESYNC|VOSTFR|VF|MULTI)\b/gi, '')
      .replace(/\(\d{4}(?:-\d{2}-\d{2})?\)/g, '')
      .replace(/\(\d{4}\)/g, '')
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
      .replace(/\((?:US|FR|DE|ES|IT|AR|UK|ZA|TR|PL|NL)\)/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getActiveCountry() {
    if (typeof window.veloraGetActiveCountry === "function") {
      var c = window.veloraGetActiveCountry();
      if (c && c.id) return c.id;
    }
    if (typeof window.veloraGetActiveCountryId === "function") {
      var id = window.veloraGetActiveCountryId();
      if (id) return id;
    }
    var select = document.getElementById("country-select");
    if (select && select.value) return select.value;
    return "default";
  }

  async function fetchHeroSliderData(countryId) {
    try {
      var cid = countryId || getActiveCountry();
      var response = await fetch("/api/velora-db/hero-slider?country_id=" + encodeURIComponent(cid) + "&t=" + Date.now(), {
        cache: "no-store"
      });
      if (!response.ok) return [];
      var data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn("[Hero Slider] Failed to fetch data:", e.message);
      return [];
    }
  }

  function getBadgeClass(badge, category) {
    var b = String(badge || category || "").toLowerCase();
    if (b.includes("cinéma") || b.includes("cinema")) return "vel-hero-badge--cinema";
    if (b.includes("animé") || b.includes("anime") || b.includes("manga")) return "vel-hero-badge--anime";
    return "vel-hero-badge--streaming";
  }

  function getBadgeLabel(item) {
    if (item.badge) return item.badge;
    var cat = String(item.category || "").toLowerCase();
    if (cat === "series") return "Série";
    if (cat === "anime") return "Animé";
    return "Film";
  }

  function playSlideItem(item) {
    if (!item) return;
    var stream = item.stream;
    if (!stream) {
      console.warn("[Hero Slider] No stream object for item:", item.title);
      return;
    }

    var entry = {
      id: "hero:" + item.id + ":" + (stream.streamId || stream.globalStreamId || item.id),
      name: stream.name || item.title,
      thumbUrl: stream.thumbUrl || item.image || item.backdrop,
      streamId: stream.streamId || stream.globalStreamId,
      sourceId: stream.sourceId,
      globalStreamId: stream.globalStreamId || stream.streamId,
      containerExtension: stream.containerExtension || "",
      contentType: stream.contentType || item.category || "movie",
      packageId: stream.packageId || ""
    };

    var section = {
      id: "hero_section_" + item.id,
      title: item.title,
      content_type: stream.contentType === "series" ? "series" : "movies",
      package_id: stream.packageId || ""
    };

    if (typeof window.veloraOpenHomeCacheEntry === "function") {
      window.veloraOpenHomeCacheEntry(section, entry, null);
      return;
    }

    // Direct stream trigger fallback
    if (typeof window.veloraPlayStreamDirect === "function") {
      window.veloraPlayStreamDirect(entry);
    }
  }

  function goToSlide(index) {
    if (!sliderItems.length) return;
    if (index < 0) index = sliderItems.length - 1;
    if (index >= sliderItems.length) index = 0;
    currentSlideIndex = index;

    var track = container.querySelector(".vel-hero-track");
    if (track) {
      track.style.transform = "translateX(-" + (currentSlideIndex * 100) + "%)";
    }

    var slides = container.querySelectorAll(".vel-hero-slide");
    slides.forEach(function(slide, idx) {
      slide.classList.toggle("active", idx === currentSlideIndex);
    });

    var dots = container.querySelectorAll(".vel-hero-dot");
    dots.forEach(function(dot, idx) {
      dot.classList.toggle("active", idx === currentSlideIndex);
    });

    resetAutoSlideTimer();
  }

  function nextSlide() {
    goToSlide(currentSlideIndex + 1);
  }

  function prevSlide() {
    goToSlide(currentSlideIndex - 1);
  }

  function startAutoSlide() {
    stopAutoSlide();
    autoSlideTimer = setInterval(function() {
      if (!isPaused) {
        nextSlide();
      }
    }, AUTO_SLIDE_DELAY);
  }

  function stopAutoSlide() {
    if (autoSlideTimer) {
      clearInterval(autoSlideTimer);
      autoSlideTimer = null;
    }
  }

  function resetAutoSlideTimer() {
    stopAutoSlide();
    startAutoSlide();
  }

  function formatLogoUrl(url) {
    if (!url) return "";
    var u = String(url).trim();
    if (u.includes("fanart.tv") || (!u.includes("tmdb.org") && (u.startsWith("http://") || u.startsWith("https://")))) {
      return "/api/proxy/image?url=" + encodeURIComponent(u);
    }
    return u;
  }

  function renderHeroSlider(items) {
    if (!container) return;
    sliderItems = items;
    currentSlideIndex = 0;

    if (!items || !items.length) {
      container.innerHTML = "";
      container.style.display = "none";
      return;
    }

    container.style.display = "block";
    container.innerHTML = "";

    var slider = document.createElement("div");
    slider.className = "vel-hero-slider";

    var track = document.createElement("div");
    track.className = "vel-hero-track";

    items.forEach(function(item, idx) {
      var slide = document.createElement("div");
      slide.className = "vel-hero-slide" + (idx === 0 ? " active" : "");

      var img = document.createElement("img");
      img.className = "vel-hero-slide__bg";
      var cleanTitle = formatCleanTitle(item.title);
      img.alt = cleanTitle;
      img.decoding = "async";
      img.loading = idx === 0 ? "eager" : "lazy";
      if (idx === 0) {
        img.setAttribute("fetchpriority", "high");
      }
      img.src = item.backdrop || item.image || "";

      var overlay = document.createElement("div");
      overlay.className = "vel-hero-slide__overlay";

      var content = document.createElement("div");
      content.className = "vel-hero-slide__content";

      var logoUrl = (item.logo || item.logo_url || item.title_logo || (item.stream && item.stream.logo) || "").trim();
      if (logoUrl) {
        var logoWrap = document.createElement("h2");
        logoWrap.className = "vel-hero-title-art";
        logoWrap.setAttribute("aria-label", cleanTitle);

        var logoImg = document.createElement("img");
        logoImg.className = "vel-hero-title-logo";
        logoImg.alt = cleanTitle;
        logoImg.decoding = "async";
        logoImg.loading = idx === 0 ? "eager" : "lazy";

        logoImg.onerror = function() {
          console.warn("[Hero Slider] Logo image failed to load for:", cleanTitle, logoUrl);
          var fallbackTitle = document.createElement("h2");
          fallbackTitle.className = "vel-hero-title";
          fallbackTitle.textContent = cleanTitle;
          if (logoWrap.parentNode) {
            logoWrap.parentNode.replaceChild(fallbackTitle, logoWrap);
          } else {
            logoWrap.replaceWith(fallbackTitle);
          }
        };

        var resolvedLogoSrc = formatLogoUrl(logoUrl);
        logoImg.src = resolvedLogoSrc;
        logoWrap.appendChild(logoImg);
        content.appendChild(logoWrap);
      } else {
        var title = document.createElement("h2");
        title.className = "vel-hero-title";
        title.textContent = cleanTitle;
        content.appendChild(title);
      }

      if (item.overview) {
        var overview = document.createElement("p");
        overview.className = "vel-hero-overview";
        overview.textContent = item.overview;
        content.appendChild(overview);
      }

      slide.appendChild(img);
      slide.appendChild(overlay);
      slide.appendChild(content);

      slide.addEventListener("click", function() {
        playSlideItem(item);
      });

      track.appendChild(slide);
    });

    slider.appendChild(track);

    // Prev / Next Arrows
    if (items.length > 1) {
      var prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "vel-hero-arrow vel-hero-arrow--prev";
      prevBtn.setAttribute("aria-label", "Précédent");
      prevBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
      prevBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        prevSlide();
      });

      var nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "vel-hero-arrow vel-hero-arrow--next";
      nextBtn.setAttribute("aria-label", "Suivant");
      nextBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
      nextBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        nextSlide();
      });

      slider.appendChild(prevBtn);
      slider.appendChild(nextBtn);

      // Colored Neon Pagination Dots
      var dotsWrap = document.createElement("div");
      dotsWrap.className = "vel-hero-dots";

      items.forEach(function(_, idx) {
        var dot = document.createElement("button");
        dot.type = "button";
        dot.className = "vel-hero-dot" + (idx === 0 ? " active" : "");
        dot.setAttribute("aria-label", "Aller au slide " + (idx + 1));
        dot.addEventListener("click", function(e) {
          e.stopPropagation();
          goToSlide(idx);
        });
        dotsWrap.appendChild(dot);
      });

      slider.appendChild(dotsWrap);
    }

    // Pause auto-slide on hover
    slider.addEventListener("pointerenter", function() {
      isPaused = true;
    });
    slider.addEventListener("pointerleave", function() {
      isPaused = false;
    });

    // Touch Swipe Navigation
    var touchStartX = 0;
    var touchEndX = 0;
    slider.addEventListener("touchstart", function(e) {
      touchStartX = e.changedTouches[0].screenX;
      isPaused = true;
    }, { passive: true });

    slider.addEventListener("touchend", function(e) {
      touchEndX = e.changedTouches[0].screenX;
      isPaused = false;
      var diff = touchStartX - touchEndX;
      if (Math.abs(diff) > 45) {
        if (diff > 0) nextSlide();
        else prevSlide();
      }
    }, { passive: true });

    container.appendChild(slider);
    startAutoSlide();
  }

  async function updateHeroSliderForCountry(countryId) {
    activeCountryId = countryId || getActiveCountry();
    var items = await fetchHeroSliderData(activeCountryId);
    renderHeroSlider(items);
  }

  function initHeroSlider() {
    var homeWrap = document.getElementById("vel-home-sections");
    if (!homeWrap) return;

    var existing = document.getElementById("vel-home-hero-slider");
    if (!existing) {
      container = document.createElement("div");
      container.id = "vel-home-hero-slider";
      container.className = "vel-hero-slider-wrap";
      homeWrap.parentNode.insertBefore(container, homeWrap);
    } else {
      container = existing;
    }

    updateHeroSliderForCountry();

    // Listen for Country changes
    var countrySelect = document.getElementById("country-select");
    if (countrySelect) {
      countrySelect.addEventListener("change", function() {
        window.setTimeout(function() {
          updateHeroSliderForCountry();
        }, 80);
      });
    }

    document.addEventListener("velora-country-change", function() {
      updateHeroSliderForCountry();
    });

    document.addEventListener("velora-home-country-rendered", function() {
      var current = getActiveCountry();
      if (current !== activeCountryId) {
        updateHeroSliderForCountry(current);
      }
    });

    document.addEventListener("velora-hero-slider-updated", function() {
      updateHeroSliderForCountry();
    });
  }

  window.veloraReloadHeroSlider = function() {
    updateHeroSliderForCountry();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeroSlider, { once: true });
  } else {
    initHeroSlider();
  }
})();

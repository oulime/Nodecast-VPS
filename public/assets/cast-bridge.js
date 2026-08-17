(function () {
  "use strict";

  var DEFAULT_CAST_RECEIVER = "CC1AD845";
  var state = {
    activeVideo: null,
    lastMedia: null,
    castAvailable: false,
    hlsPatched: false
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function isUsableUrl(url) {
    return !!url && !/^(blob:|data:|about:|mediastream:)/i.test(String(url));
  }

  function absoluteUrl(url) {
    if (!isUsableUrl(url)) return "";
    try {
      return new URL(url, window.location.href).href;
    } catch (_) {
      return "";
    }
  }

  function contentTypeFor(url) {
    var clean = String(url || "").split("?")[0].toLowerCase();
    if (clean.indexOf(".m3u8") !== -1) return "application/x-mpegURL";
    if (clean.indexOf(".mpd") !== -1) return "application/dash+xml";
    if (clean.indexOf(".ts") !== -1) return "video/mp2t";
    if (clean.indexOf(".webm") !== -1) return "video/webm";
    return "video/mp4";
  }

  function textFrom(selectors) {
    for (var i = 0; i < selectors.length; i += 1) {
      var node = document.querySelector(selectors[i]);
      var text = node && String(node.textContent || "").trim();
      if (text) return text;
    }
    return "";
  }

  function currentTitle(video) {
    return textFrom([
      "#watch-title",
      "#watch-content-title",
      "#player-channel-name",
      ".vel-player-title",
      ".vel-media-title",
      ".channel-name",
      ".program-title"
    ]) || (video && video.getAttribute("aria-label")) || document.title || "VeloraVIP";
  }

  function currentPoster(video) {
    var candidates = [
      video && video.getAttribute("poster"),
      byId("watch-poster") && byId("watch-poster").getAttribute("src"),
      document.querySelector(".movie-poster img") && document.querySelector(".movie-poster img").getAttribute("src"),
      document.querySelector(".series-poster img") && document.querySelector(".series-poster img").getAttribute("src")
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var url = absoluteUrl(candidates[i]);
      if (url) return url;
    }
    return "";
  }

  function appPlayerUrl() {
    var app = window.app || {};
    return absoluteUrl(
      app.pages && app.pages.watch && app.pages.watch.currentUrl ||
      app.player && app.player.currentUrl
    );
  }

  function rememberMedia(video, url) {
    var mediaUrl = absoluteUrl(url);
    if (!mediaUrl) return;
    if (video) {
      video.__veloraCastUrl = mediaUrl;
      state.activeVideo = video;
    }
    state.lastMedia = {
      url: mediaUrl,
      title: currentTitle(video),
      poster: currentPoster(video),
      contentType: contentTypeFor(mediaUrl)
    };
    syncButton();
  }

  function activeVideo() {
    var videos = Array.prototype.slice.call(document.querySelectorAll("video"));
    return videos.find(function (video) {
      return video && !video.paused && !video.ended && video.readyState > 0;
    }) || state.activeVideo || videos.find(function (video) {
      return video && (video.__veloraCastUrl || video.currentSrc || video.src);
    }) || null;
  }

  function currentMedia() {
    var video = activeVideo();
    var mediaUrl = appPlayerUrl() ||
      absoluteUrl(video && video.__veloraCastUrl) ||
      absoluteUrl(video && (video.currentSrc || video.src)) ||
      (state.lastMedia && state.lastMedia.url);

    if (!mediaUrl) return null;
    return {
      video: video,
      url: mediaUrl,
      title: currentTitle(video) || (state.lastMedia && state.lastMedia.title) || "VeloraVIP",
      poster: currentPoster(video) || (state.lastMedia && state.lastMedia.poster) || "",
      contentType: contentTypeFor(mediaUrl)
    };
  }

  function patchVideoSources() {
    if (HTMLMediaElement.prototype.__veloraCastPatched) return;
    HTMLMediaElement.prototype.__veloraCastPatched = true;

    try {
      var descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
      if (descriptor && descriptor.get && descriptor.set) {
        Object.defineProperty(HTMLMediaElement.prototype, "src", {
          configurable: true,
          enumerable: descriptor.enumerable,
          get: function () {
            return descriptor.get.call(this);
          },
          set: function (value) {
            rememberMedia(this, value);
            return descriptor.set.call(this, value);
          }
        });
      }
    } catch (_) {}

    var originalSetAttribute = HTMLMediaElement.prototype.setAttribute;
    if (typeof originalSetAttribute === "function") {
      HTMLMediaElement.prototype.setAttribute = function (name, value) {
        if (String(name || "").toLowerCase() === "src") rememberMedia(this, value);
        return originalSetAttribute.apply(this, arguments);
      };
    }
  }

  function patchHls() {
    if (state.hlsPatched || !window.Hls || !window.Hls.prototype) return;
    var originalLoadSource = window.Hls.prototype.loadSource;
    if (typeof originalLoadSource !== "function") return;
    state.hlsPatched = true;
    window.Hls.prototype.loadSource = function (url) {
      rememberMedia(this.media || activeVideo(), url);
      return originalLoadSource.apply(this, arguments);
    };
  }

  function icon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18v3h3a3 3 0 0 0-3-3Zm0-4v2a5 5 0 0 1 5 5h2a7 7 0 0 0-7-7Zm0-4v2a9 9 0 0 1 9 9h2A11 11 0 0 0 3 10Zm0-7v5h2V5h14v12h-3v2h5V3H3Z"/></svg>';
  }

  function option(id, title, note) {
    return '<button type="button" class="velora-cast-option" data-cast-option="' + id + '">' +
      icon() + '<span><strong>' + title + '</strong><small>' + note + '</small></span></button>';
  }

  function installUi() {
    if (byId("velora-cast-button")) return;

    var style = document.createElement("style");
    style.textContent = [
      ".velora-cast-button{position:fixed;right:16px;bottom:calc(78px + env(safe-area-inset-bottom,0px));z-index:2147483000;width:50px;height:50px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.22);border-radius:14px;background:rgba(12,14,24,.86);color:#fff;box-shadow:0 12px 30px rgba(0,0,0,.42);backdrop-filter:blur(14px);cursor:pointer}",
      ".velora-cast-button:hover,.velora-cast-button:focus-visible{background:rgba(83,105,255,.95);outline:none}",
      ".velora-cast-button[disabled]{opacity:.42;cursor:not-allowed}",
      ".velora-cast-button svg{width:26px;height:26px;fill:currentColor}",
      ".velora-cast-panel{position:fixed;right:16px;bottom:calc(138px + env(safe-area-inset-bottom,0px));z-index:2147483001;width:min(350px,calc(100vw - 32px));padding:10px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:rgba(12,14,24,.97);color:#fff;box-shadow:0 20px 50px rgba(0,0,0,.48);backdrop-filter:blur(18px)}",
      ".velora-cast-panel[hidden]{display:none!important}",
      ".velora-cast-title{margin:3px 4px 8px;font-size:13px;font-weight:900;color:rgba(255,255,255,.84)}",
      ".velora-cast-option{width:100%;display:flex;align-items:center;gap:10px;padding:10px;border:0;border-radius:8px;background:transparent;color:#fff;text-align:left;cursor:pointer}",
      ".velora-cast-option:hover,.velora-cast-option:focus-visible{background:rgba(255,255,255,.1);outline:none}",
      ".velora-cast-option[disabled]{opacity:.45;cursor:not-allowed}",
      ".velora-cast-option svg{width:22px;height:22px;fill:currentColor;flex:0 0 auto}",
      ".velora-cast-option strong{display:block;font-size:13px}",
      ".velora-cast-option small{display:block;margin-top:2px;font-size:12px;line-height:1.3;color:rgba(255,255,255,.68)}",
      ".velora-cast-note{margin:8px 4px 2px;font-size:12px;line-height:1.35;color:rgba(255,255,255,.66)}",
      "@media(max-width:768px){.velora-cast-button{right:12px;bottom:calc(86px + env(safe-area-inset-bottom,0px));width:52px;height:52px}.velora-cast-panel{right:12px;bottom:calc(148px + env(safe-area-inset-bottom,0px));}}"
    ].join("");
    document.head.appendChild(style);

    var button = document.createElement("button");
    button.id = "velora-cast-button";
    button.className = "velora-cast-button";
    button.type = "button";
    button.title = "Cast video to TV";
    button.setAttribute("aria-label", "Cast video to TV");
    button.innerHTML = icon();

    var panel = document.createElement("div");
    panel.id = "velora-cast-panel";
    panel.className = "velora-cast-panel";
    panel.hidden = true;
    panel.innerHTML =
      '<div class="velora-cast-title">Cast video to TV</div>' +
      option("google", "Chromecast / Google TV", "For Chromecast, Google TV and Android TV with Cast.") +
      option("airplay", "AirPlay", "For iPhone, iPad, Mac and AirPlay TVs.") +
      option("wvc", "Web Video Caster", "Fallback for Samsung, LG, Roku, Fire TV and DLNA receiver apps.") +
      option("copy", "Copy video link", "Use in a TV browser or receiver app.") +
      '<p class="velora-cast-note">This sends the video stream, not the whole website.</p>';

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      primaryCast();
    });

    panel.addEventListener("click", function (event) {
      var control = event.target.closest("[data-cast-option]");
      if (!control || control.disabled) return;
      event.preventDefault();
      runOption(control.getAttribute("data-cast-option"));
    });

    document.addEventListener("click", function (event) {
      if (panel.hidden) return;
      if (button.contains(event.target) || panel.contains(event.target)) return;
      panel.hidden = true;
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") panel.hidden = true;
    });

    document.body.appendChild(button);
    document.body.appendChild(panel);
    syncButton();
  }

  function syncButton() {
    var button = byId("velora-cast-button");
    if (button) button.disabled = !currentMedia();
  }

  function showPanel() {
    var panel = byId("velora-cast-panel");
    if (!panel) return;
    var media = currentMedia();
    var google = panel.querySelector('[data-cast-option="google"]');
    var airplay = panel.querySelector('[data-cast-option="airplay"]');
    if (google) google.disabled = !state.castAvailable;
    if (airplay) airplay.disabled = !(media && media.video && typeof media.video.webkitShowPlaybackTargetPicker === "function");
    panel.hidden = false;
  }

  function primaryCast() {
    var media = currentMedia();
    if (!media) {
      alert("Start a video first, then cast it.");
      return;
    }
    if (state.castAvailable) return castGoogle();
    if (media.video && typeof media.video.webkitShowPlaybackTargetPicker === "function") return castAirPlay();
    showPanel();
  }

  async function castGoogle() {
    var media = currentMedia();
    if (!media || !window.cast || !window.cast.framework || !window.chrome || !window.chrome.cast) return showPanel();

    try {
      var context = window.cast.framework.CastContext.getInstance();
      var session = context.getCurrentSession() || await context.requestSession();
      var info = new window.chrome.cast.media.MediaInfo(media.url, media.contentType);
      info.metadata = new window.chrome.cast.media.GenericMediaMetadata();
      info.metadata.title = media.title;
      if (media.poster) info.metadata.images = [{ url: media.poster }];
      info.streamType = media.contentType === "application/x-mpegURL"
        ? window.chrome.cast.media.StreamType.LIVE
        : window.chrome.cast.media.StreamType.BUFFERED;

      var request = new window.chrome.cast.media.LoadRequest(info);
      request.autoplay = true;
      if (media.video && Number.isFinite(media.video.currentTime)) {
        request.currentTime = Math.max(0, media.video.currentTime);
      }
      await session.loadMedia(request);
      var panel = byId("velora-cast-panel");
      if (panel) panel.hidden = true;
    } catch (error) {
      console.warn("[Cast] Google Cast failed:", error);
      showPanel();
    }
  }

  function castAirPlay() {
    var media = currentMedia();
    if (!media || !media.video || typeof media.video.webkitShowPlaybackTargetPicker !== "function") return showPanel();
    media.video.webkitShowPlaybackTargetPicker();
    var panel = byId("velora-cast-panel");
    if (panel) panel.hidden = true;
  }

  function openWebVideoCaster() {
    var media = currentMedia();
    if (!media) return;
    window.location.href = "wvc-x-callback://open?url=" + encodeURIComponent(media.url) +
      "&title=" + encodeURIComponent(media.title || "VeloraVIP") +
      "&mime_type=" + encodeURIComponent(media.contentType || contentTypeFor(media.url));
  }

  async function copyVideoLink() {
    var media = currentMedia();
    if (!media) return;
    try {
      await navigator.clipboard.writeText(media.url);
      alert("Video link copied.");
    } catch (_) {
      window.prompt("Copy this video link:", media.url);
    }
  }

  function runOption(name) {
    if (name === "google") return castGoogle();
    if (name === "airplay") return castAirPlay();
    if (name === "wvc") return openWebVideoCaster();
    if (name === "copy") return copyVideoLink();
  }

  function initGoogleCast() {
    window.__onGCastApiAvailable = function (available) {
      state.castAvailable = Boolean(available && window.cast && window.cast.framework);
      if (!state.castAvailable) return syncButton();
      try {
        window.cast.framework.CastContext.getInstance().setOptions({
          receiverApplicationId: DEFAULT_CAST_RECEIVER,
          autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
        });
      } catch (error) {
        console.warn("[Cast] Google Cast init failed:", error);
      }
      syncButton();
    };

    if (byId("velora-google-cast-sdk")) return;
    var script = document.createElement("script");
    script.id = "velora-google-cast-sdk";
    script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
    script.async = true;
    document.head.appendChild(script);
  }

  function bindVideos() {
    Array.prototype.forEach.call(document.querySelectorAll("video"), function (video) {
      if (video.__veloraCastBound) return;
      video.__veloraCastBound = true;
      ["play", "loadedmetadata", "canplay", "timeupdate"].forEach(function (eventName) {
        video.addEventListener(eventName, function () {
          state.activeVideo = video;
          rememberMedia(video, video.__veloraCastUrl || video.currentSrc || video.src);
          syncButton();
        }, true);
      });
    });
  }

  function boot() {
    patchVideoSources();
    installUi();
    initGoogleCast();
    bindVideos();
    patchHls();
    new MutationObserver(function () {
      bindVideos();
      patchHls();
      syncButton();
    }).observe(document.documentElement, { childList: true, subtree: true });
    window.setInterval(function () {
      patchHls();
      syncButton();
    }, 1000);
  }

  window.VeloraCast = {
    cast: primaryCast,
    showPanel: showPanel,
    rememberMedia: rememberMedia,
    getCurrentMedia: currentMedia
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();

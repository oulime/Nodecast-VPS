(function () {
  "use strict";

  var MAX_ITEMS = 60;
  var MIN_WATCH_SECONDS = 2;
  var FINISHED_WATCH_PERCENT = 90;
  var state = {
    currentPlaying: null,
    cachedHistory: null,
    lastDiskSaveTimestamp: 0,
    lastDbSyncTimestamp: 0,
    dbSyncInProgress: false,
    isDecorating: false,
    decorateTimer: null,
    heartbeatInterval: null,
    needsResumeRailRefresh: false
  };

  function isVodPlayerVisible() {
    var vodContainer = document.getElementById("vod-player-container");
    return !!(vodContainer && !vodContainer.classList.contains("hidden"));
  }

  // Inject Self-Contained Styles
  function injectStyles() {
    if (document.getElementById("velora-watch-history-styles")) return;
    var style = document.createElement("style");
    style.id = "velora-watch-history-styles";
    style.textContent = `
      /* --- Home "Reprendre la lecture" Rail --- */
      .vel-home-section--resume {
        --vel-home-heading-a: #e50914;
        --vel-home-heading-b: #ff5252;
        --vel-home-heading-glow: rgba(229, 9, 20, 0.45);
        order: -1;
        margin: 0 !important;
        margin-top: 0 !important;
        margin-bottom: 0 !important;
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        transition: opacity 0.3s ease, transform 0.3s ease, margin 0.3s ease;
      }
      .vel-home-section--resume .vel-home-section__rail {
        padding-bottom: 2px !important;
      }
      .vel-home-section--resume.is-hiding {
        opacity: 0 !important;
        transform: translateY(-8px) !important;
        margin-bottom: 0 !important;
        pointer-events: none !important;
      }
      .vel-home-section__card--resume {
        position: relative !important;
        flex: 0 0 clamp(14.5rem, 38vw, 20.5rem) !important;
        flex-basis: clamp(14.5rem, 38vw, 20.5rem) !important;
        width: clamp(14.5rem, 38vw, 20.5rem) !important;
        max-width: clamp(14.5rem, 38vw, 20.5rem) !important;
        aspect-ratio: 16/9 !important;
        padding: 0 !important;
        overflow: hidden !important;
        border: 1px solid rgba(255, 255, 255, 0.18) !important;
        border-radius: 10px !important;
        background: #0d0c14 !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.52) !important;
        display: block !important;
        cursor: pointer !important;
        transition: opacity 0.28s cubic-bezier(0.2, 0, 0, 1), width 0.28s cubic-bezier(0.2, 0, 0, 1), min-width 0.28s cubic-bezier(0.2, 0, 0, 1), max-width 0.28s cubic-bezier(0.2, 0, 0, 1), margin 0.28s cubic-bezier(0.2, 0, 0, 1), padding 0.28s cubic-bezier(0.2, 0, 0, 1) !important;
        transform: none !important;
      }
      .vel-home-section__card--resume:hover,
      .vel-home-section__card--resume:focus,
      .vel-home-section__card--resume:focus-visible,
      .vel-home-section__card--resume:active {
        transform: none !important;
        border-color: rgba(255, 255, 255, 0.18) !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.52) !important;
        outline: none !important;
        z-index: 1 !important;
      }
      .vel-home-section__card--resume::before {
        content: "" !important;
        position: absolute !important;
        inset: 0 !important;
        background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.08) 35%, rgba(3, 2, 8, 0.65) 70%, rgba(3, 2, 8, 0.94) 100%) !important;
        pointer-events: none !important;
        z-index: 2 !important;
        transition: none !important;
      }
      .vel-home-section__card--resume.is-removing {
        opacity: 0 !important;
        transform: scale(0.65) !important;
        width: 0px !important;
        min-width: 0px !important;
        max-width: 0px !important;
        margin-left: 0px !important;
        margin-right: 0px !important;
        padding-left: 0px !important;
        padding-right: 0px !important;
        border-width: 0px !important;
        border-color: transparent !important;
        pointer-events: none !important;
      }
      .vel-home-section__card--resume .vel-home-section__media {
        position: absolute !important;
        inset: 0 !important;
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        aspect-ratio: 16/9 !important;
        object-fit: cover !important;
        border-radius: inherit !important;
        background: #090811 !important;
        transition: none !important;
        transform: none !important;
      }
      .vel-home-section__card--resume:hover .vel-home-section__media,
      .vel-home-section__card--resume:focus .vel-home-section__media,
      .vel-home-section__card--resume:focus-visible .vel-home-section__media,
      .vel-home-section__card--resume:active .vel-home-section__media {
        transform: none !important;
      }
      .vel-resume-play-center {
        position: absolute;
        top: 42%;
        left: 50%;
        transform: translate(-50%, -50%) !important;
        width: 2.6rem;
        height: 2.6rem;
        border-radius: 50%;
        background: rgba(15, 12, 28, 0.72);
        border: 1.5px solid rgba(255, 255, 255, 0.55);
        color: #fff;
        display: grid;
        place-items: center;
        z-index: 3;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
        transition: none !important;
        pointer-events: none;
      }
      .vel-resume-play-center svg {
        width: 1.35rem;
        height: 1.35rem;
        margin-left: 2px;
        fill: currentColor;
      }
      .vel-home-section__card--resume:hover .vel-resume-play-center,
      .vel-home-section__card--resume:focus .vel-resume-play-center,
      .vel-home-section__card--resume:focus-visible .vel-resume-play-center,
      .vel-home-section__card--resume:active .vel-resume-play-center {
        transform: translate(-50%, -50%) !important;
        background: rgba(15, 12, 28, 0.72) !important;
        border-color: rgba(255, 255, 255, 0.55) !important;
      }
      .vel-resume-badge {
        position: absolute;
        top: 8px;
        left: 8px;
        z-index: 4;
        padding: 3px 8px;
        border-radius: 6px;
        background: rgba(8, 7, 16, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.25);
        color: #fbbf24;
        font-size: 0.65rem;
        font-weight: 800;
        letter-spacing: 0.02em;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.55);
      }
      .vel-resume-remove-btn {
        position: absolute !important;
        top: 8px !important;
        right: 8px !important;
        z-index: 6 !important;
        width: 22px !important;
        height: 22px !important;
        padding: 0 !important;
        margin: 0 !important;
        border-radius: 50% !important;
        background: rgba(15, 12, 28, 0.75) !important;
        border: 1px solid rgba(255, 255, 255, 0.28) !important;
        color: rgba(255, 255, 255, 0.85) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        cursor: pointer !important;
        backdrop-filter: blur(10px) !important;
        -webkit-backdrop-filter: blur(10px) !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5) !important;
        opacity: 0;
        transition: opacity 0.18s ease, transform 0.18s ease, background 0.18s ease, border-color 0.18s ease !important;
      }
      .vel-resume-remove-btn svg {
        display: block !important;
        width: 11px !important;
        height: 11px !important;
        pointer-events: none !important;
      }
      .vel-home-section__card--resume:hover .vel-resume-remove-btn,
      .vel-home-section__card--resume:focus-within .vel-resume-remove-btn {
        opacity: 1 !important;
      }
      /* Clean and touch-friendly on mobile devices */
      @media (hover: none), (max-width: 768px) {
        .vel-resume-remove-btn {
          opacity: 0.85 !important;
          width: 24px !important;
          height: 24px !important;
        }
        .vel-resume-remove-btn svg {
          width: 12px !important;
          height: 12px !important;
        }
      }
      .vel-resume-remove-btn:hover,
      .vel-resume-remove-btn:active {
        background: #e50914 !important;
        color: #ffffff !important;
        border-color: #ffffff !important;
        transform: scale(1.12) !important;
        box-shadow: 0 4px 12px rgba(229, 9, 20, 0.6) !important;
      }
      .vel-resume-progress-bar {
        position: absolute !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        height: 4.5px !important;
        background: rgba(255, 255, 255, 0.25) !important;
        z-index: 5 !important;
        border-bottom-left-radius: 10px;
        border-bottom-right-radius: 10px;
        overflow: hidden;
      }
      .vel-resume-progress-fill {
        height: 100% !important;
        background: #e50914 !important;
        box-shadow: 0 0 8px rgba(229, 9, 20, 0.9) !important;
      }
      .vel-home-section__card--resume .vel-home-section__name {
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-end !important;
        position: absolute !important;
        bottom: 8px !important;
        left: 10px !important;
        right: 10px !important;
        max-width: calc(100% - 20px) !important;
        z-index: 3 !important;
        min-height: auto !important;
        padding: 0 !important;
        margin: 0 !important;
        background: transparent !important;
        text-align: left !important;
        pointer-events: none !important;
      }
      .vel-home-section__card--resume .vel-home-section__name strong {
        display: block !important;
        font-size: clamp(0.78rem, 1.8vw, 0.92rem) !important;
        font-weight: 900 !important;
        color: #ffffff !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.95), 0 1px 3px rgba(0, 0, 0, 0.9) !important;
        line-height: 1.2 !important;
      }
      .vel-home-section__card--resume .vel-home-section__name small {
        display: block !important;
        font-size: clamp(0.65rem, 1.5vw, 0.72rem) !important;
        font-weight: 750 !important;
        color: #cbd5e1 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9) !important;
        margin-top: 1px !important;
        line-height: 1.15 !important;
      }
      @media(max-width:640px) {
        .vel-home-section__card--resume {
          flex: 0 0 clamp(12.5rem, 62vw, 17.5rem) !important;
          flex-basis: clamp(12.5rem, 62vw, 17.5rem) !important;
          width: clamp(12.5rem, 62vw, 17.5rem) !important;
          max-width: clamp(12.5rem, 62vw, 17.5rem) !important;
          border-radius: 9px !important;
        }
        .vel-home-section__card--resume .vel-home-section__name {
          bottom: 6px !important;
          left: 8px !important;
          right: 8px !important;
          max-width: calc(100% - 16px) !important;
        }
        .vel-home-section__card--resume .vel-home-section__name strong {
          font-size: 0.78rem !important;
        }
        .vel-home-section__card--resume .vel-home-section__name small {
          font-size: 0.64rem !important;
        }
      }

      /* --- Series Episode Rows in Series Detail Page --- */
      .vel-vod-detail__episode {
        position: relative !important;
        transition: opacity 0.2s ease, filter 0.2s ease, background 0.2s ease !important;
      }
      .vel-vod-detail__episode--watched {
        opacity: 0.68 !important;
        filter: grayscale(35%) !important;
        background: rgba(16, 185, 129, 0.05) !important;
        border-color: rgba(16, 185, 129, 0.25) !important;
      }
      .vel-vod-detail__episode--watched:hover,
      .vel-vod-detail__episode--watched:focus-visible {
        opacity: 1 !important;
        filter: none !important;
      }
      .vel-vod-detail__episode--watched .vel-vod-detail__episode-badge {
        background: rgba(16, 185, 129, 0.2) !important;
        color: #6ee7b7 !important;
        border: 1px solid rgba(16, 185, 129, 0.35) !important;
      }
      .vel-vod-detail__episode--watched .vel-vod-detail__episode-title {
        color: #cbd5e1 !important;
      }
      .vel-ep-watched-tag {
        position: absolute !important;
        bottom: 8px !important;
        right: 12px !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 3px !important;
        padding: 2px 7px !important;
        border-radius: 5px !important;
        background: rgba(16, 185, 129, 0.22) !important;
        border: 1px solid rgba(16, 185, 129, 0.5) !important;
        color: #34d399 !important;
        font-size: 0.65rem !important;
        font-weight: 850 !important;
        letter-spacing: 0.02em !important;
        pointer-events: none !important;
        z-index: 6 !important;
      }
      .vel-ep-progress-bar {
        display: block !important;
        width: 100% !important;
        height: 3.5px !important;
        margin-top: 5px !important;
        border-radius: 2px !important;
        background: rgba(255, 255, 255, 0.18) !important;
        overflow: hidden !important;
      }
      .vel-ep-progress-fill {
        display: block !important;
        height: 100% !important;
        background: #e50914 !important;
        box-shadow: 0 0 6px rgba(229, 9, 20, 0.8) !important;
        transition: width 0.25s linear !important;
      }
    `;
    document.head.appendChild(style);
  }

  function isValidMediaEntry(media) {
    if (!media || typeof media !== "object") return false;
    if (media.type === "live" || media.type === "channel" || media.contentType === "live" || media.item_type === "channel" || media.item_type === "live") return false;
    if (media.type !== "movie" && media.type !== "series") return false;
    if (media.isAdult || media.is_adult || media.source === "adult" || media.sourceId === "adult") return false;
    var id = String(media.id || "");
    if (id.startsWith("live:") || id.startsWith("channel:") || id.startsWith("adult:") || id.startsWith("favorite:adult:")) return false;
    var pkg = String(media.packageId || media.package_id || media.category_id || "").toLowerCase();
    if (pkg.includes("adult") || pkg.includes("xxx") || pkg.includes("adulte") || pkg.includes("+18")) return false;
    var name = String(media.name || "").trim();
    if (!name || name.toLowerCase() === "titre" || name.toLowerCase() === "titre...") return false;
    if (/\b(adult|adulte|\+18|18\+|xxx)\b/i.test(name)) return false;
    if (!media.streamId && !media.episodeStreamId && !media.seriesId) return false;
    return true;
  }

  function authToken() {
    try { return localStorage.getItem("authToken") || ""; } catch (_) { return ""; }
  }

  function getActiveUserKey() {
    try {
      var userRaw = localStorage.getItem("velora_user") || localStorage.getItem("user");
      if (userRaw) {
        var u = JSON.parse(userRaw);
        var uid = u && (u.id || u.username || u.email);
        if (uid) return "velora_resume_v13_" + String(uid).trim();
      }
      var token = authToken();
      if (token && token.includes(".")) {
        try {
          var payload = JSON.parse(atob(token.split(".")[1]));
          var tid = payload.sub || payload.id || payload.email || payload.username;
          if (tid) return "velora_resume_v13_" + String(tid).trim();
        } catch (_) {}
      }
      return "velora_resume_v13_guest";
    } catch (_) {
      return "velora_resume_v13_guest";
    }
  }

  function cleanCoverUrl(url) {
    if (!url || typeof url !== "string") return "";
    var s = url.trim();
    if (s.startsWith("//")) return location.protocol + s;
    return s;
  }

  function normalizeTitle(t) {
    return String(t || "").toLowerCase()
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/\b(4k|8k|fhd|hd|hevc|vf|vostfr|multi)\b/gi, "")
      .replace(/[^a-z0-9]/g, "")
      .trim();
  }

  // --- Tombstones (Deleted History Registry) ---
  function getTombstones() {
    try {
      var raw = localStorage.getItem("velora_deleted_history_tombstones");
      if (raw) {
        var list = JSON.parse(raw);
        if (Array.isArray(list)) return list;
      }
      return [];
    } catch (_) {
      return [];
    }
  }

  function addTombstone(item) {
    if (!item) return;
    try {
      var list = getTombstones();
      var norm = normalizeTitle(item.seriesName || item.name || "");
      var entry = {
        id: item.id ? String(item.id) : null,
        streamId: item.streamId ? String(item.streamId) : null,
        episodeStreamId: item.episodeStreamId ? String(item.episodeStreamId) : null,
        seriesId: item.seriesId ? String(item.seriesId) : null,
        name: item.name ? String(item.name).trim() : null,
        seriesName: item.seriesName ? String(item.seriesName).trim() : null,
        normTitle: norm || null,
        type: item.type || "movie",
        timestamp: Date.now()
      };
      list.push(entry);
      var cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
      list = list.filter(function (t) { return t && t.timestamp > cutoff; }).slice(-200);
      localStorage.setItem("velora_deleted_history_tombstones", JSON.stringify(list));
    } catch (_) {}
  }

  function removeTombstoneForMedia(media) {
    if (!media) return;
    try {
      var list = getTombstones();
      if (!list.length) return;
      var norm = normalizeTitle(media.seriesName || media.name || "");
      var mId = String(media.id || "");
      var sId = String(media.seriesId || media.streamId || "");
      var filtered = list.filter(function (t) {
        if (mId && t.id && t.id === mId) return false;
        if (sId && (t.seriesId === sId || t.streamId === sId)) return false;
        if (norm && t.normTitle && t.normTitle === norm) return false;
        return true;
      });
      localStorage.setItem("velora_deleted_history_tombstones", JSON.stringify(filtered));
    } catch (_) {}
  }

  function isItemTombstoned(item) {
    if (!item) return false;
    var list = getTombstones();
    if (!list.length) return false;
    var itId = String(item.id || "");
    var itStreamId = item.streamId ? String(item.streamId) : "";
    var itEpId = item.episodeStreamId ? String(item.episodeStreamId) : "";
    var itSeriesId = item.seriesId ? String(item.seriesId) : "";
    var itNorm = normalizeTitle(item.seriesName || item.name || "");

    return list.some(function (t) {
      if (itId && t.id && t.id === itId) return true;
      if (t.type === "series" || item.type === "series") {
        if (itSeriesId && t.seriesId && itSeriesId === t.seriesId) return true;
        if (itSeriesId && t.streamId && itSeriesId === t.streamId) return true;
        if (itStreamId && t.seriesId && itStreamId === t.seriesId) return true;
        if (itNorm && t.normTitle && itNorm === t.normTitle) return true;
      }
      if (itStreamId && t.streamId && itStreamId === t.streamId) return true;
      if (itEpId && t.episodeStreamId && itEpId === t.episodeStreamId) return true;
      if (itNorm && itNorm.length >= 2 && t.normTitle && itNorm === t.normTitle) return true;
      return false;
    });
  }

  function getLocalHistory() {
    if (state.cachedHistory && Array.isArray(state.cachedHistory)) {
      return state.cachedHistory.filter(function (it) { return !isItemTombstoned(it); });
    }
    try {
      var activeKey = getActiveUserKey();
      var raw = localStorage.getItem(activeKey);
      if (raw) {
        var items = JSON.parse(raw);
        if (Array.isArray(items) && items.length > 0) {
          var validOnly = items.filter(isValidMediaEntry).filter(function (it) { return !isItemTombstoned(it); });
          state.cachedHistory = validOnly;
          return validOnly;
        }
      }

      // Seamlessly scan legacy keys
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.startsWith("velora_resume_") && k !== activeKey) {
          try {
            var legacyRaw = localStorage.getItem(k);
            if (legacyRaw) {
              var legItems = JSON.parse(legacyRaw);
              if (Array.isArray(legItems) && legItems.length > 0) {
                var validLeg = legItems.filter(isValidMediaEntry).filter(function (it) { return !isItemTombstoned(it); });
                if (validLeg.length > 0) {
                  localStorage.setItem(activeKey, JSON.stringify(validLeg));
                  return validLeg;
                }
              }
            }
          } catch (_) {}
        }
      }
      return [];
    } catch (_) {
      return [];
    }
  }

  function saveLocalHistory(items, skipDomRebuild) {
    try {
      var valid = items.filter(isValidMediaEntry).filter(function (it) { return !isItemTombstoned(it); });
      var key = getActiveUserKey();
      localStorage.setItem(key, JSON.stringify(valid.slice(0, MAX_ITEMS)));
      document.dispatchEvent(new CustomEvent("velora-watch-history-updated"));
      if (!skipDomRebuild) {
        injectResumeSectionDirectly();
      }
      requestDecorateEpisodes();
    } catch (_) {}
  }

  function filterHistoryList(list, item) {
    if (!Array.isArray(list) || !item) return [];
    var targetId = String(item.id || "");
    var sId = item.streamId ? String(item.streamId) : "";
    var epId = item.episodeStreamId ? String(item.episodeStreamId) : "";
    var seriesId = item.seriesId ? String(item.seriesId) : "";
    var normTitle = normalizeTitle(item.seriesName || item.name || "");
    var isSeries = item.type === "series";

    return list.filter(function (it) {
      if (!it) return false;
      if (isItemTombstoned(it)) return false;
      if (targetId && String(it.id) === targetId) return false;

      var itSeriesId = it.seriesId ? String(it.seriesId) : "";
      var itStreamId = it.streamId ? String(it.streamId) : "";
      var itEpId = it.episodeStreamId ? String(it.episodeStreamId) : "";
      var itNormTitle = normalizeTitle(it.seriesName || it.name || "");
      var itIsSeries = it.type === "series";

      // If item is a series, completely wipe ALL episodes of this series from history
      if (isSeries || itIsSeries) {
        if (seriesId && (itSeriesId === seriesId || itStreamId === seriesId)) return false;
        if (itSeriesId && (itSeriesId === sId || itSeriesId === targetId)) return false;
        if (normTitle && normTitle.length >= 2 && itNormTitle && normTitle === itNormTitle) return false;
      }

      if (sId && (itStreamId === sId || itEpId === sId)) return false;
      if (epId && (itEpId === epId || itStreamId === epId)) return false;
      if (normTitle && normTitle.length >= 2 && itNormTitle && normTitle === itNormTitle) return false;

      return isValidMediaEntry(it);
    });
  }

  function removeHistoryItem(item, cardEl) {
    if (!item) return;

    // 1. Add to tombstones immediately so it can never resurrect
    addTombstone(item);

    // 2. Clear any active playback / session state for this item
    if (state.currentPlaying) {
      var curNorm = normalizeTitle(state.currentPlaying.seriesName || state.currentPlaying.name || "");
      var itemNorm = normalizeTitle(item.seriesName || item.name || "");
      var curSId = String(state.currentPlaying.seriesId || state.currentPlaying.streamId || "");
      var itemSId = String(item.seriesId || item.streamId || "");
      if (
        String(state.currentPlaying.id) === String(item.id) ||
        (curSId && curSId === itemSId) ||
        (curNorm && itemNorm && curNorm === itemNorm)
      ) {
        state.currentPlaying = null;
        sessionTracker.mediaId = null;
        sessionTracker.continuousSeconds = 0;
        sessionTracker.qualified = false;
        sessionTracker.rewindActive = false;
      }
    }

    // 3. Clear series episode cache if series
    if (item.type === "series") {
      var sId = item.seriesId || item.streamId;
      if (sId) {
        delete window.__veloraSeriesEpisodesCache[String(sId)];
        try { localStorage.removeItem("velora_series_eps_" + String(sId)); } catch (_) {}
      }
    }

    // 4. Clean from ALL localStorage keys immediately so it is never resurrected on reload
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.startsWith("velora_resume_")) {
          try {
            var raw = localStorage.getItem(k);
            if (raw) {
              var parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                var filtered = filterHistoryList(parsed, item);
                localStorage.setItem(k, JSON.stringify(filtered));
              }
            }
          } catch (_) {}
        }
      }
    } catch (_) {}

    state.cachedHistory = null;
    var activeItems = filterHistoryList(getLocalHistory(), item);
    saveLocalHistory(activeItems, !!cardEl);

    // 5. Sync removal to backend database for all IDs and series metadata
    var token = authToken();
    if (token) {
      var idsToDelete = new Set();
      if (item.id) idsToDelete.add(String(item.id));
      if (item.streamId) idsToDelete.add(String(item.streamId));
      if (item.episodeStreamId) idsToDelete.add(String(item.episodeStreamId));
      if (item.seriesId) idsToDelete.add(String(item.seriesId));

      var qParams = new URLSearchParams();
      if (item.seriesId) qParams.set("seriesId", String(item.seriesId));
      if (item.name) qParams.set("name", String(item.name));
      if (item.seriesName) qParams.set("seriesName", String(item.seriesName));
      var queryString = qParams.toString() ? ("?" + qParams.toString()) : "";

      idsToDelete.forEach(function (id) {
        fetch("/api/history/" + encodeURIComponent(String(id)) + queryString, {
          method: "DELETE",
          headers: { Authorization: "Bearer " + token }
        }).catch(function () {});
      });
    }

    // 6. Refresh episode row decorations in detail page (clears "✓ Vu" and progress bar)
    requestDecorateEpisodes();
  }

  function parseSeasonEpisode(badgeText, titleText) {
    var combined = (badgeText || "") + " " + (titleText || "");
    var m = combined.match(/S(\d+)[\s:._-]*E(\d+)/i) || combined.match(/(\d+)\s*[xX]\s*(\d+)/i);
    if (m) {
      return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };
    }
    var m2 = combined.match(/E(?:P|PISODE)?[\s.:_-]*(\d+)/i);
    if (m2) {
      return { season: 1, episode: parseInt(m2[1], 10) };
    }
    return null;
  }

  // ============================================================
  // Series Episodes Cache & Next Episode Engine
  // ============================================================
  window.__veloraSeriesEpisodesCache = window.__veloraSeriesEpisodesCache || {};

  function parseEpisodesFromSeriesInfo(s) {
    if (!s || typeof s !== "object") return [];
    var d = (s.data && typeof s.data === "object") ? s.data : s;
    var epsObj = d.episodes;
    if (!epsObj || typeof epsObj !== "object" || Array.isArray(epsObj)) {
      if (Array.isArray(d.episodes)) return d.episodes;
      return [];
    }
    var result = [];
    var seasonKeys = Object.keys(epsObj).sort(function (a, b) { return Number(a) - Number(b); });
    for (var sIdx = 0; sIdx < seasonKeys.length; sIdx++) {
      var seasonNum = Number(seasonKeys[sIdx]);
      var list = epsObj[seasonKeys[sIdx]];
      if (!Array.isArray(list)) continue;
      var sorted = list.slice().sort(function (a, b) {
        var ea = Number((a && (a.episode_num ?? a.episode_number)) || 0);
        var eb = Number((b && (b.episode_num ?? b.episode_number)) || 0);
        return ea - eb;
      });
      for (var eIdx = 0; eIdx < sorted.length; eIdx++) {
        var ep = sorted[eIdx];
        if (!ep || typeof ep !== "object") continue;
        var streamId = Number(ep.stream_id ?? ep.id);
        if (!Number.isFinite(streamId) || streamId <= 0) continue;
        var epNum = Number(ep.episode_num ?? ep.episode_number ?? 0);
        var season = ep.season != null && Number.isFinite(Number(ep.season)) ? Number(ep.season) : seasonNum;
        var title = String(ep.title || ep.name || "").trim() || (Number.isFinite(epNum) ? ("Épisode " + epNum) : "Épisode");
        var duration = (ep.info && typeof ep.info === "object" && typeof ep.info.duration === "string") ? ep.info.duration.trim() : "";
        var containerExtension = typeof ep.container_extension === "string" ? ep.container_extension.trim().toLowerCase() : "mp4";
        result.push({
          episodeStreamId: streamId,
          seasonNumber: season,
          episodeNum: epNum,
          title: title,
          duration: duration,
          containerExtension: containerExtension
        });
      }
    }
    return result;
  }

  function getSeriesEpisodesCache(seriesId) {
    if (!seriesId) return null;
    var sId = String(seriesId).trim();
    if (window.__veloraSeriesEpisodesCache && window.__veloraSeriesEpisodesCache[sId]) {
      return window.__veloraSeriesEpisodesCache[sId];
    }
    try {
      var raw = localStorage.getItem("velora_series_eps_" + sId);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          window.__veloraSeriesEpisodesCache[sId] = parsed;
          return parsed;
        }
      }
    } catch (_) {}
    return null;
  }

  window.veloraCacheSeriesEpisodes = function (seriesId, episodes) {
    if (!seriesId || !Array.isArray(episodes) || !episodes.length) return;
    var sId = String(seriesId).trim();
    window.__veloraSeriesEpisodesCache[sId] = episodes;
    try {
      localStorage.setItem("velora_series_eps_" + sId, JSON.stringify(episodes));
    } catch (_) {}
  };

  async function fetchSeriesEpisodes(seriesId, sourceId) {
    if (!seriesId) return [];
    var sId = String(seriesId).trim();
    var cached = getSeriesEpisodesCache(sId);
    if (cached && cached.length > 0) return cached;

    var token = authToken();
    var src = sourceId || "";
    if (!src) {
      if (window.__veloraActiveSourceId) src = window.__veloraActiveSourceId;
      else {
        try {
          var userRaw = localStorage.getItem("velora_user") || localStorage.getItem("user");
          if (userRaw) {
            var u = JSON.parse(userRaw);
            src = u.nodecastXtreamSourceId || u.sourceId || "";
          }
        } catch (_) {}
      }
    }

    if (src) {
      try {
        var urls = [
          "/api/proxy/xtream/" + encodeURIComponent(src) + "/series_info?series_id=" + encodeURIComponent(sId),
          "/api/proxy/xtream/" + encodeURIComponent(src) + "/player_api?action=get_series_info&series_id=" + encodeURIComponent(sId)
        ];
        for (var u of urls) {
          var res = await fetch(u, { headers: token ? { Authorization: "Bearer " + token } : {} });
          if (res.ok) {
            var data = await res.json();
            var eps = parseEpisodesFromSeriesInfo(data);
            if (eps && eps.length > 0) {
              window.veloraCacheSeriesEpisodes(sId, eps);
              return eps;
            }
          }
        }
      } catch (e) {
        console.warn("[Watch History] Failed fetching series episodes for", sId, e);
      }
    }
    return [];
  }

  function findNextEpisodeInList(episodes, currentSeason, currentEpisode, episodeStreamId) {
    if (!Array.isArray(episodes) || episodes.length === 0) return null;

    var sorted = episodes.slice().sort(function (a, b) {
      if (a.seasonNumber !== b.seasonNumber) return a.seasonNumber - b.seasonNumber;
      return a.episodeNum - b.episodeNum;
    });

    var curIdx = -1;
    if (episodeStreamId) {
      curIdx = sorted.findIndex(function (e) {
        return String(e.episodeStreamId) === String(episodeStreamId);
      });
    }

    if (curIdx === -1 && currentSeason != null && currentEpisode != null) {
      curIdx = sorted.findIndex(function (e) {
        return Number(e.seasonNumber) === Number(currentSeason) && Number(e.episodeNum) === Number(currentEpisode);
      });
    }

    if (curIdx !== -1) {
      if (curIdx + 1 < sorted.length) {
        return sorted[curIdx + 1];
      } else {
        return null;
      }
    }

    if (currentSeason != null) {
      var next = sorted.find(function (e) {
        if (e.seasonNumber > Number(currentSeason)) return true;
        if (e.seasonNumber === Number(currentSeason) && e.episodeNum > Number(currentEpisode || 0)) return true;
        return false;
      });
      return next || null;
    }

    return null;
  }

  // Database Sync
  async function syncProgressToDatabase(entry) {
    if (!isValidMediaEntry(entry)) return;
    var token = authToken();
    if (!token) return;
    try {
      var itemId = entry.type === "series" ? (entry.episodeStreamId || entry.streamId) : entry.streamId;
      var parentId = entry.type === "series" ? (entry.seriesId || entry.streamId) : null;
      await fetch("/api/history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({
          id: String(itemId),
          type: entry.type === "series" ? "series" : "movie",
          parentId: parentId ? String(parentId) : null,
          progress: entry.currentTime || 0,
          duration: entry.duration || 0,
          sourceId: entry.sourceId || null,
          data: entry
        })
      });
    } catch (err) {
      console.warn("[Watch History] DB sync failed", err);
    }
  }

  async function loadHistoryFromDatabase() {
    var token = authToken();
    if (!token || state.dbSyncInProgress) return;
    state.dbSyncInProgress = true;
    try {
      var res = await fetch("/api/history?limit=40", {
        headers: { Authorization: "Bearer " + token }
      });
      if (res.ok) {
        var rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          var serverItems = rows.map(function (r) {
            var d = r.data || {};
            var duration = r.duration || d.duration || 0;
            var progress = r.progress || d.currentTime || 0;
            var percent = duration > 0 ? Math.round((progress / duration) * 100) : (d.progressPercent || 5);
            return Object.assign({}, d, {
              id: r.item_id ? (r.item_type === "series" ? "series:" + (r.parent_id || r.item_id) + ":ep:" + r.item_id : "movie:" + r.item_id) : d.id,
              type: r.item_type === "series" ? "series" : "movie",
              currentTime: progress,
              duration: duration,
              progressPercent: Math.min(100, Math.max(1, percent)),
              isFinished: percent >= FINISHED_WATCH_PERCENT,
              updatedAt: r.updated_at ? Number(r.updated_at) : (d.updatedAt || Date.now())
            });
          }).filter(isValidMediaEntry).filter(function (it) {
            return !isItemTombstoned(it);
          });

          var local = getLocalHistory();
          var mergedMap = new Map();
          local.forEach(function (it) { mergedMap.set(String(it.id), it); });
          serverItems.forEach(function (it) {
            var existing = mergedMap.get(String(it.id));
            if (!existing || (it.updatedAt || 0) >= (existing.updatedAt || 0)) {
              mergedMap.set(String(it.id), it);
            }
          });

          var merged = Array.from(mergedMap.values()).sort(function (a, b) {
            return (b.updatedAt || 0) - (a.updatedAt || 0);
          });
          saveLocalHistory(merged);
        }
      }
    } catch (e) {
      console.warn("[Watch History] Failed loading server history", e);
    } finally {
      state.dbSyncInProgress = false;
    }
  }

  var sessionTracker = {
    mediaId: null,
    continuousSeconds: 0,
    lastTick: null,
    qualified: false,
    seekFromTime: 0,
    rewindActive: false,
    rewindStartTime: 0,
    rewindContinuousSeconds: 0
  };

  function updateSessionTrackerMedia(mediaId, mediaObj) {
    if (!mediaId) return;
    if (mediaObj) removeTombstoneForMedia(mediaObj);
    if (sessionTracker.mediaId === mediaId) return;
    var history = getLocalHistory();
    var alreadySaved = history.some(function (it) {
      return String(it.id) === String(mediaId);
    });

    var isRewindEpisode = false;
    if (mediaObj && mediaObj.type === "series") {
      var sId = String(mediaObj.seriesId || mediaObj.streamId || "");
      var sNorm = normalizeTitle(mediaObj.name || mediaObj.seriesName || "");
      var curSeason = Number(mediaObj.seasonNumber) || 1;
      var curEpisode = Number(mediaObj.episodeNumber) || 1;

      var existingSeriesEp = history.find(function (it) {
        if (!it || it.type !== "series") return false;
        var itSId = String(it.seriesId || it.streamId || "");
        if (sId && itSId === sId) return true;
        if (sNorm && it.name && normalizeTitle(it.name) === sNorm) return true;
        return false;
      });

      if (existingSeriesEp) {
        var exSeason = Number(existingSeriesEp.seasonNumber) || 1;
        var exEpisode = Number(existingSeriesEp.episodeNumber) || 1;
        if (curSeason < exSeason || (curSeason === exSeason && curEpisode < exEpisode)) {
          isRewindEpisode = true;
        }
      }
    }

    sessionTracker.mediaId = mediaId;
    sessionTracker.continuousSeconds = 0;
    sessionTracker.lastTick = null;
    sessionTracker.qualified = alreadySaved;
    sessionTracker.seekFromTime = 0;
    sessionTracker.rewindActive = isRewindEpisode;
    sessionTracker.rewindStartTime = 0;
    sessionTracker.rewindContinuousSeconds = 0;
  }

  function tickHeartbeat() {
    var vodVideo = document.getElementById("video-vod");
    if (!vodVideo || vodVideo.paused || vodVideo.seeking || vodVideo.ended) {
      sessionTracker.lastTick = null;
      return;
    }

    var now = Date.now();
    if (sessionTracker.lastTick) {
      var delta = (now - sessionTracker.lastTick) / 1000;
      if (delta > 0 && delta < 8) {
        sessionTracker.continuousSeconds += delta;
        if (sessionTracker.rewindActive) {
          sessionTracker.rewindContinuousSeconds += delta;
          if (sessionTracker.rewindContinuousSeconds >= 5) {
            sessionTracker.rewindActive = false;
            sessionTracker.rewindContinuousSeconds = 0;
            sessionTracker.qualified = true;
            recordProgress(vodVideo, false, false, true);
          }
        }
      }
    }
    sessionTracker.lastTick = now;

    var minSec = getResumeMinWatchSeconds();
    if (!sessionTracker.qualified && sessionTracker.continuousSeconds >= minSec) {
      sessionTracker.qualified = true;
      recordProgress(vodVideo, false, true);
    } else if (sessionTracker.qualified) {
      if (now - state.lastDiskSaveTimestamp >= 15000) {
        recordProgress(vodVideo, false, true);
      }
    }
  }

  // Record playback progress (Strictly for VOD Movies & Series Episodes only)
  function recordProgress(video, isEnd, isThrottled, isRewindCommit) {
    if (!video || video.id === "video" || video.id === "vel-adult-video" || isNaN(video.currentTime) || (video.currentTime < MIN_WATCH_SECONDS && !isEnd)) return;
    if (document.body.dataset.velActiveTab === "live" || document.body.dataset.velActiveTab === "adult" || document.body.dataset.veloraReturnAdult === "true" || document.body.classList.contains("vel-adult-active")) return;
    if (!isVodPlayerVisible()) return;

    var media = state.currentPlaying;
    if (!media) {
      var activeEp = document.querySelector(".vel-vod-detail__episode--playing, .vel-vod-detail__episode[aria-current='true']");
      var seriesTitle = document.querySelector(".vel-vod-detail__title");
      var detailEl = document.querySelector(".vel-vod-detail");
      var sId = detailEl ? (detailEl.dataset.seriesId || detailEl.dataset.streamId || "") : "";
      if (activeEp) {
        var badge = activeEp.querySelector(".vel-vod-detail__episode-badge");
        var epTitle = activeEp.querySelector(".vel-vod-detail__episode-title");
        var parsed = parseSeasonEpisode(badge ? badge.textContent : "", epTitle ? epTitle.textContent : "");
        var epStreamId = activeEp.dataset.episodeStreamId || activeEp.dataset.streamId || "";
        media = {
          id: "series:" + (sId || "series") + ":ep:" + (epStreamId || "ep"),
          type: "series",
          streamId: epStreamId,
          seriesId: sId || null,
          episodeStreamId: epStreamId,
          name: seriesTitle ? seriesTitle.textContent.trim() : "Série",
          episodeTitle: epTitle ? epTitle.textContent.trim() : "",
          seasonNumber: parsed ? parsed.season : 1,
          episodeNumber: parsed ? parsed.episode : 1,
          updatedAt: Date.now()
        };
        state.currentPlaying = media;
      }
    }

    if (!media || !isValidMediaEntry(media) || isItemTombstoned(media)) return;

    var id = media.id;
    var existingEntry = getLocalHistory().find(function (item) { return String(item.id) === String(id); });

    var realCurrent = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    var realDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : (media.duration || 0);

    var duration = Math.round(realDuration);
    var currentPos = isEnd ? duration : Math.max(0, Math.round(realCurrent));
    var percent = isEnd ? 100 : (duration > 0 ? Math.round((currentPos / duration) * 100) : 5);
    var isFinished = isEnd || (duration > 0 && percent >= FINISHED_WATCH_PERCENT);

    if (!isFinished && !sessionTracker.qualified && !existingEntry && !isRewindCommit) {
      // User has not watched continuously for the required minimum time yet and video is not finished
      return;
    }

    var items = getLocalHistory().filter(function (item) {
      return String(item.id) !== String(id);
    });

    // If user is watching a series episode, prune any subsequent episodes of this series (e.g. Ep 8 when currently watching Ep 4) and unstarted placeholders
    if (media.type === "series") {
      var activeSeriesId = String(media.seriesId || media.streamId || "");
      var sNorm = normalizeTitle(media.name || media.seriesName || "");
      var curSeason = Number(media.seasonNumber) || 1;
      var curEpisode = Number(media.episodeNumber) || 1;

      items = items.filter(function (it) {
        if (!it || it.type !== "series") return true;
        var itSId = String(it.seriesId || it.streamId || "");
        var sameSeries = (activeSeriesId && itSId === activeSeriesId) || (sNorm && it.name && normalizeTitle(it.name) === sNorm);
        if (sameSeries) {
          var itSeason = Number(it.seasonNumber) || 1;
          var itEpisode = Number(it.episodeNumber) || 1;
          // 1. If it's a later episode than the one currently being watched (e.g. Ep 8 when currently watching Ep 4), forget/remove it!
          if (itSeason > curSeason || (itSeason === curSeason && itEpisode > curEpisode)) {
            return false;
          }
          // 2. If it's an unstarted placeholder episode for this series, remove it
          if (it.currentTime === 0 && (it.progressPercent === 0 || it.progressPercent == null) && !it.isFinished) {
            return false;
          }
        }
        return true;
      });
    }

    var thumb = cleanCoverUrl(media.thumbUrl || (existingEntry ? existingEntry.thumbUrl : "") || "");
    var backdrop = cleanCoverUrl(media.backdropUrl || (existingEntry ? existingEntry.backdropUrl : "") || media.thumbUrl || "");

    var entry = {
      id: String(id),
      type: media.type,
      streamId: media.streamId || null,
      seriesId: media.seriesId || null,
      episodeStreamId: media.episodeStreamId || null,
      seasonNumber: media.seasonNumber != null ? Number(media.seasonNumber) : null,
      episodeNumber: media.episodeNumber != null ? Number(media.episodeNumber) : null,
      name: media.name,
      seriesName: media.seriesName || media.name || null,
      episodeTitle: media.episodeTitle || null,
      thumbUrl: thumb,
      backdropUrl: backdrop || thumb,
      packageId: media.packageId || "",
      sourceId: media.sourceId || "",
      containerExtension: media.containerExtension || "mp4",
      currentTime: isFinished ? duration : currentPos,
      duration: duration,
      progressPercent: isFinished ? 100 : Math.min(100, Math.max(1, percent)),
      isFinished: isFinished,
      updatedAt: Date.now()
    };

    if (!isValidMediaEntry(entry)) return;

    items.unshift(entry);

    if (media.type === "series" && isFinished) {
      var sId = media.seriesId || media.streamId;
      var cachedEps = getSeriesEpisodesCache(sId);
      if (cachedEps && cachedEps.length > 0) {
        var nextEp = findNextEpisodeInList(cachedEps, media.seasonNumber, media.episodeNumber, media.episodeStreamId);
        if (nextEp) {
          var nextId = "series:" + sId + ":ep:" + nextEp.episodeStreamId;
          var existingNext = items.find(function (it) { return String(it.id) === String(nextId); });
          if (!existingNext) {
            var nextEntry = {
              id: nextId,
              type: "series",
              streamId: media.streamId || null,
              seriesId: media.seriesId || null,
              episodeStreamId: nextEp.episodeStreamId,
              seasonNumber: nextEp.seasonNumber,
              episodeNumber: nextEp.episodeNum,
              name: media.name,
              seriesName: media.seriesName || media.name || null,
              episodeTitle: nextEp.title || null,
              thumbUrl: thumb,
              backdropUrl: backdrop || thumb,
              packageId: media.packageId || "",
              sourceId: media.sourceId || "",
              containerExtension: nextEp.containerExtension || media.containerExtension || "mp4",
              currentTime: 0,
              duration: 0,
              progressPercent: 0,
              isFinished: false,
              updatedAt: Date.now() + 1
            };
            items.unshift(nextEntry);
          }
        }
      } else {
        fetchSeriesEpisodes(sId, media.sourceId).then(function (eps) {
          if (eps && eps.length > 0) {
            var nextEpAsync = findNextEpisodeInList(eps, media.seasonNumber, media.episodeNumber, media.episodeStreamId);
            if (nextEpAsync) {
              var curHist = getLocalHistory();
              var nextIdAsync = "series:" + sId + ":ep:" + nextEpAsync.episodeStreamId;
              if (!curHist.some(function (it) { return String(it.id) === String(nextIdAsync); })) {
                var nextEntryAsync = {
                  id: nextIdAsync,
                  type: "series",
                  streamId: media.streamId || null,
                  seriesId: media.seriesId || null,
                  episodeStreamId: nextEpAsync.episodeStreamId,
                  seasonNumber: nextEpAsync.seasonNumber,
                  episodeNumber: nextEpAsync.episodeNum,
                  name: media.name,
                  seriesName: media.seriesName || media.name || null,
                  episodeTitle: nextEpAsync.title || null,
                  thumbUrl: thumb,
                  backdropUrl: backdrop || thumb,
                  packageId: media.packageId || "",
                  sourceId: media.sourceId || "",
                  containerExtension: nextEpAsync.containerExtension || media.containerExtension || "mp4",
                  currentTime: 0,
                  duration: 0,
                  progressPercent: 0,
                  isFinished: false,
                  updatedAt: Date.now() + 1
                };
                curHist.unshift(nextEntryAsync);
                saveLocalHistory(curHist);
              }
            }
          }
        });
      }
    }

    saveLocalHistory(items, !isRewindCommit && (isThrottled || isVodPlayerVisible()));

    var now = Date.now();
    if (isEnd || isRewindCommit || !isThrottled || (now - state.lastDbSyncTimestamp >= 30000)) {
      state.lastDbSyncTimestamp = now;
      syncProgressToDatabase(entry);
    }
  }

  function formatPlaybackTimestamp(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
    var totalSecs = Math.max(0, Math.floor(seconds));
    var h = Math.floor(totalSecs / 3600);
    var m = Math.floor((totalSecs % 3600) / 60);
    var hStr = h < 10 ? "0" + h : String(h);
    var mStr = m < 10 ? "0" + m : String(m);
    return hStr + ":" + mStr;
  }

  function formatRemainingTime(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "";
    var mins = Math.round(seconds / 60);
    if (mins < 60) return mins + " min rest.";
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return h + "h" + (m > 0 ? (m < 10 ? "0" : "") + m : "") + " rest.";
  }

  // ============================================================
  // Requirement 1 & 3: Series Episode List Decoration (Red Progress Bar in Body & "✓ Vu" Badge)
  // ============================================================
  function requestDecorateEpisodes() {
    if (state.decorateTimer) clearTimeout(state.decorateTimer);
    state.decorateTimer = setTimeout(function () {
      decorateSeriesEpisodes();
    }, 30);
  }

  function findHistoryForEpisodeRow(row, history, currentSeriesName, currentSeriesId) {
    if (!row) return null;
    var epId = String(row.dataset.episodeStreamId || row.dataset.streamId || "").trim();
    var badge = row.querySelector(".vel-vod-detail__episode-badge");
    var title = row.querySelector(".vel-vod-detail__episode-title");
    var parsed = parseSeasonEpisode(badge ? badge.textContent : "", title ? title.textContent : "");

    var normCurrent = normalizeTitle(currentSeriesName);
    var curSeriesId = currentSeriesId ? String(currentSeriesId).trim() : "";

    for (var i = 0; i < history.length; i++) {
      var it = history[i];
      if (!it || it.type !== "series") continue;

      // 1. Direct Episode Stream ID match
      if (epId && (String(it.episodeStreamId || "") === epId || String(it.streamId || "") === epId)) {
        if (curSeriesId && it.seriesId && String(it.seriesId) !== curSeriesId) continue;
        return it;
      }

      // 2. Match strictly by same Series (by seriesId or normalized series name) + Season + Episode
      var isSameSeries = false;
      if (curSeriesId && it.seriesId && String(it.seriesId) === curSeriesId) {
        isSameSeries = true;
      } else if (normCurrent && it.name && normCurrent.length >= 2) {
        var normHist = normalizeTitle(it.name);
        if (normCurrent === normHist) {
          isSameSeries = true;
        }
      }

      if (isSameSeries && parsed && it.seasonNumber != null && it.episodeNumber != null) {
        if (Number(it.seasonNumber) === Number(parsed.season) && Number(it.episodeNumber) === Number(parsed.episode)) {
          return it;
        }
      }
    }
    return null;
  }

  window.veloraHasSavedProgress = function (streamId, name) {
    if (!streamId && !name) return false;
    var sId = String(streamId || "").trim();
    var normN = name ? normalizeTitle(name) : "";
    var history = getLocalHistory();
    var item = history.find(function (it) {
      if (!it || it.type === "series") return false;
      if (sId && String(it.streamId || "") === sId) return true;
      if (normN && normN.length >= 2 && it.name && normalizeTitle(it.name) === normN) return true;
      return false;
    });
    return !!(item && item.currentTime > 3 && !item.isFinished && (item.progressPercent == null || item.progressPercent < FINISHED_WATCH_PERCENT));
  };

  function updateMovieWatchButtonLabel() {
    var watchBtn = document.querySelector(".vel-vod-detail__watch--film");
    if (!watchBtn) return;
    var labelSpan = watchBtn.querySelector(".vel-vod-detail__watch-label");
    if (!labelSpan) return;

    var detail = watchBtn.closest(".vel-vod-detail");
    var titleEl = detail ? detail.querySelector(".vel-vod-detail__title") : null;
    var movieTitle = titleEl ? titleEl.textContent.trim() : "";
    var streamId = watchBtn.dataset.streamId || "";

    var hasProgress = window.veloraHasSavedProgress(streamId, movieTitle);
    labelSpan.textContent = hasProgress ? "Continuer de regarder" : "Regarder maintenant";
    watchBtn.setAttribute("aria-label", (hasProgress ? "Continuer de regarder" : "Regarder") + (movieTitle ? " « " + movieTitle + " »" : ""));
  }

  function decorateSeriesEpisodes() {
    updateMovieWatchButtonLabel();
    if (state.isDecorating) return;
    state.isDecorating = true;

    try {
      var episodeRows = document.querySelectorAll(".vel-vod-detail__episode");
      if (!episodeRows || !episodeRows.length) return;

      var history = getLocalHistory();
      if (!history || !history.length) return;

      var seriesTitleEl = document.querySelector(".vel-vod-detail__title");
      var currentSeriesName = seriesTitleEl ? seriesTitleEl.textContent.trim() : "";
      var detailEl = document.querySelector(".vel-vod-detail");
      var currentSeriesId = detailEl ? (detailEl.dataset.seriesId || detailEl.dataset.streamId || "") : "";

      episodeRows.forEach(function (row) {
        var item = findHistoryForEpisodeRow(row, history, currentSeriesName, currentSeriesId);
        var body = row.querySelector(".vel-vod-detail__episode-body");
        if (!body) return;

        var targetState = "none";
        var targetPercent = 0;
        if (item && (item.isFinished || (item.progressPercent && item.progressPercent >= FINISHED_WATCH_PERCENT))) {
          targetState = "watched";
          targetPercent = 100;
        } else if (item && item.progressPercent && item.progressPercent >= 3) {
          targetState = "in-progress:" + item.progressPercent;
          targetPercent = item.progressPercent;
        }

        if (targetState === "none") {
          if (row.dataset.velDecoratedState) {
            delete row.dataset.velDecoratedState;
            row.classList.remove("vel-vod-detail__episode--watched");
            row.classList.remove("vel-vod-detail__episode--in-progress");
            var oldTag = row.querySelector(".vel-ep-watched-tag");
            if (oldTag) oldTag.remove();
            var oldBar = body.querySelector(".vel-ep-progress-bar");
            if (oldBar) oldBar.remove();
          }
          return;
        }

        if (row.dataset.velDecoratedState === targetState) return;
        row.dataset.velDecoratedState = targetState;

        var tag = row.querySelector(".vel-ep-watched-tag");
        var bar = body.querySelector(".vel-ep-progress-bar");

        if (targetState === "watched") {
          row.classList.add("vel-vod-detail__episode--watched");
          row.classList.remove("vel-vod-detail__episode--in-progress");
          if (!tag) {
            tag = document.createElement("span");
            tag.className = "vel-ep-watched-tag";
            tag.textContent = "✓ Vu";
            row.appendChild(tag);
          }
          if (bar) bar.remove();
        } else if (targetState.startsWith("in-progress")) {
          row.classList.remove("vel-vod-detail__episode--watched");
          row.classList.add("vel-vod-detail__episode--in-progress");
          if (tag) tag.remove();
          if (!bar) {
            bar = document.createElement("div");
            bar.className = "vel-ep-progress-bar";
            var fill = document.createElement("div");
            fill.className = "vel-ep-progress-fill";
            fill.style.width = targetPercent + "%";
            bar.appendChild(fill);
            body.appendChild(bar);
          } else {
            var f = bar.querySelector(".vel-ep-progress-fill");
            if (f) f.style.width = targetPercent + "%";
          }
        }
      });
    } finally {
      state.isDecorating = false;
    }
  }

  // ============================================================
  // Requirement 2: Auto-Resume Playback Seek Engine
  // ============================================================
  window.__veloraPendingResumeSeek = null;
  function tryApplySeekOnActiveVideo(videoEl) {
    var pending = window.__veloraPendingResumeSeek;
    if (!pending || pending.applied || !pending.targetSeconds || pending.targetSeconds <= 0) return;
    if (Date.now() - (pending.timestamp || 0) > 45000) {
      window.__veloraPendingResumeSeek = null;
      return;
    }

    var target = pending.targetSeconds;
    pending.applied = true;
    window.__veloraPendingResumeSeek = null;

    if (typeof window.veloraSeekToSeconds === "function") {
      console.info("[Watch History] Calling window.veloraSeekToSeconds to resume at", target, "seconds");
      window.veloraSeekToSeconds(target);
      return;
    }

    if (videoEl && videoEl.readyState >= 1) {
      try {
        videoEl.currentTime = target;
        console.info("[Watch History] Direct HTML5 resumed at", target, "seconds");
      } catch (err) {
        console.warn("[Watch History] Seek error:", err);
      }
    }
  }

  function formatPlayerTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
    var totalSec = Math.max(0, Math.floor(seconds));
    var hrs = Math.floor(totalSec / 3600);
    var mins = Math.floor((totalSec % 3600) / 60);
    var secs = totalSec % 60;
    var sMins = (mins < 10 ? "0" : "") + mins;
    var sSecs = (secs < 10 ? "0" : "") + secs;
    if (hrs > 0) {
      return hrs + ":" + sMins + ":" + sSecs;
    }
    return sMins + ":" + sSecs;
  }

  function updateActiveEpisodeLiveProgress() {
    var activeRow = document.querySelector(".vel-vod-detail__episode--playing, .vel-vod-detail__episode[aria-current='true']");
    if (!activeRow) return;
    var body = activeRow.querySelector(".vel-vod-detail__episode-body");
    if (!body) return;

    var realCurrent = 0;
    var realDuration = 0;

    if (typeof window.__veloraGetVodPlaybackInfo === "function") {
      var info = window.__veloraGetVodPlaybackInfo();
      if (info) {
        if (Number.isFinite(info.currentSeconds) && info.currentSeconds > 0) realCurrent = info.currentSeconds;
        if (Number.isFinite(info.durationSeconds) && info.durationSeconds > 0) realDuration = info.durationSeconds;
      }
    }

    if (!realCurrent) {
      var durEl = document.getElementById("vod-ctl-duration");
      if (durEl && durEl.textContent && durEl.textContent.includes("/")) {
        var parts = durEl.textContent.split("/");
        var curParsed = parseVodClock(parts[0]);
        var durParsed = parseVodClock(parts[1]);
        if (Number.isFinite(curParsed) && curParsed > 0) realCurrent = curParsed;
        if (Number.isFinite(durParsed) && durParsed > 0) realDuration = durParsed;
      }
    }

    if (!realCurrent) {
      var vodVideo = document.getElementById("video-vod");
      if (vodVideo && Number.isFinite(vodVideo.currentTime)) realCurrent = vodVideo.currentTime;
    }

    if (!realDuration || !(realDuration > 0)) {
      var metaEl = activeRow.querySelector(".vel-vod-detail__episode-meta");
      if (metaEl && metaEl.textContent) {
        var p = parseVodClock(metaEl.textContent.trim());
        if (Number.isFinite(p) && p > 0) realDuration = p;
      }
    }

    if (!realDuration || !(realDuration > 0)) return;

    var percent = Math.min(100, Math.max(0, (realCurrent / realDuration) * 100));

    if (percent >= FINISHED_WATCH_PERCENT) {
      activeRow.classList.add("vel-vod-detail__episode--watched");
      activeRow.classList.remove("vel-vod-detail__episode--in-progress");
      var tag = activeRow.querySelector(".vel-ep-watched-tag");
      if (!tag) {
        tag = document.createElement("span");
        tag.className = "vel-ep-watched-tag";
        tag.textContent = "✓ Vu";
        activeRow.appendChild(tag);
      }
      var oldBar = body.querySelector(".vel-ep-progress-bar");
      if (oldBar) oldBar.remove();
    } else if (percent >= 0.5) {
      activeRow.classList.remove("vel-vod-detail__episode--watched");
      activeRow.classList.add("vel-vod-detail__episode--in-progress");
      var oldTag = activeRow.querySelector(".vel-ep-watched-tag");
      if (oldTag) oldTag.remove();

      var bar = body.querySelector(".vel-ep-progress-bar");
      if (!bar) {
        bar = document.createElement("div");
        bar.className = "vel-ep-progress-bar";
        var fill = document.createElement("div");
        fill.className = "vel-ep-progress-fill";
        fill.style.width = percent.toFixed(2) + "%";
        bar.appendChild(fill);
        body.appendChild(bar);
      } else {
        var fill = bar.querySelector(".vel-ep-progress-fill");
        if (fill) fill.style.width = percent.toFixed(2) + "%";
      }
    }
  }

  function bindVideoTrackers() {
    // Strictly bind only VOD player (video-vod). Live TV player (video) is live stream and never tracked in resume.
    var vodVideo = document.getElementById("video-vod");
    if (vodVideo && !vodVideo.__veloraResumeTrackerBound) {
      vodVideo.__veloraResumeTrackerBound = true;

      function startHeartbeat() {
        if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
        sessionTracker.lastTick = Date.now();
        state.heartbeatInterval = setInterval(tickHeartbeat, 3000);
      }

      function stopHeartbeat() {
        if (state.heartbeatInterval) {
          clearInterval(state.heartbeatInterval);
          state.heartbeatInterval = null;
        }
        sessionTracker.lastTick = null;
      }

      var lastKnownVodTime = 0;

      vodVideo.addEventListener("timeupdate", function () {
        if (!vodVideo.seeking && Number.isFinite(vodVideo.currentTime) && vodVideo.currentTime > 0) {
          lastKnownVodTime = vodVideo.currentTime;
        }
        tryApplySeekOnActiveVideo(vodVideo);
      }, { passive: true });

      vodVideo.addEventListener("playing", function () {
        sessionTracker.lastTick = Date.now();
        tryApplySeekOnActiveVideo(vodVideo);
        startHeartbeat();
      }, { passive: true });

      vodVideo.addEventListener("seeking", function () {
        sessionTracker.seekFromTime = lastKnownVodTime || (Number.isFinite(vodVideo.currentTime) ? vodVideo.currentTime : 0);
        if (!sessionTracker.qualified) {
          sessionTracker.continuousSeconds = 0;
          sessionTracker.lastTick = null;
        }
      }, { passive: true });

      vodVideo.addEventListener("seeked", function () {
        var toTime = Number.isFinite(vodVideo.currentTime) ? vodVideo.currentTime : 0;
        var fromTime = sessionTracker.seekFromTime || 0;
        var history = getLocalHistory();
        var curEntry = history.find(function (it) {
          return state.currentPlaying && String(it.id) === String(state.currentPlaying.id);
        });
        var refTime = Math.max(fromTime, curEntry && Number.isFinite(curEntry.currentTime) ? curEntry.currentTime : 0);

        if (toTime < refTime - 2) {
          // Backward seek (rewind): arm 5-second continuous watch timer to commit new resume point
          sessionTracker.rewindActive = true;
          sessionTracker.rewindStartTime = toTime;
          sessionTracker.rewindContinuousSeconds = 0;
          sessionTracker.lastTick = Date.now();
        } else {
          // Forward seek / normal scrubbing
          sessionTracker.rewindActive = false;
          sessionTracker.rewindContinuousSeconds = 0;
        }
        lastKnownVodTime = toTime;
      }, { passive: true });

      vodVideo.addEventListener("waiting", function () {
        sessionTracker.lastTick = null;
      }, { passive: true });

      vodVideo.addEventListener("canplay", function () {
        tryApplySeekOnActiveVideo(vodVideo);
      }, { passive: true });

      vodVideo.addEventListener("loadedmetadata", function () {
        tryApplySeekOnActiveVideo(vodVideo);
      }, { passive: true });

      vodVideo.addEventListener("pause", function () {
        stopHeartbeat();
        if (sessionTracker.rewindActive && sessionTracker.rewindContinuousSeconds >= 5) {
          sessionTracker.rewindActive = false;
          sessionTracker.rewindContinuousSeconds = 0;
          sessionTracker.qualified = true;
          recordProgress(vodVideo, false, false, true);
        } else {
          recordProgress(vodVideo, false, false, false);
        }
      }, { passive: true });

      vodVideo.addEventListener("ended", function () {
        stopHeartbeat();
        sessionTracker.lastTick = null;
        sessionTracker.qualified = true;
        recordProgress(vodVideo, true, false, false);
      }, { passive: true });
    }

    // When Live TV player starts, always reset currentPlaying to prevent state leakage
    var liveVideo = document.getElementById("video");
    if (liveVideo && !liveVideo.__veloraLiveResetBound) {
      liveVideo.__veloraLiveResetBound = true;
      liveVideo.addEventListener("play", function () {
        state.currentPlaying = null;
      }, { passive: true });
    }

    requestDecorateEpisodes();
  }

  // Safe seek handler once video playback actively starts (Netflix-style 5s rewind buffer)
  window.veloraResumePlayback = function (item) {
    if (!isValidMediaEntry(item)) return;
    var isSeries = item.type === "series";
    var rawSeconds = Number(item.currentTime) || 0;
    var targetSeconds = rawSeconds > 0 ? Math.max(0, rawSeconds - 5) : 0;
    window.__veloraPendingResumeSeek = targetSeconds > 0 ? { targetSeconds: targetSeconds, applied: false, timestamp: Date.now() } : null;

    // 1. Close home page
    delete document.body.dataset.velTopLevel;
    document.body.dataset.veloraReturnHome = "true";
    document.body.classList.remove("vel-home-empty-active");
    var homePage = document.getElementById("vel-home-empty-page");
    if (homePage) {
      homePage.classList.add("hidden");
      homePage.setAttribute("aria-hidden", "true");
    }

    // 2. Open real series or movie detail page
    if (isSeries) {
      var seriesEntry = {
        streamId: item.seriesId || item.streamId,
        seriesId: item.seriesId || item.streamId,
        name: item.name,
        thumbUrl: item.thumbUrl,
        sourceId: item.sourceId || "",
        contentType: "series"
      };

      if (typeof window.veloraOpenCachedHomeItem === "function") {
        window.veloraOpenCachedHomeItem({
          id: "series",
          content_type: "series",
          package_id: item.packageId || "series:all"
        }, seriesEntry);
      }

      var epAttempts = 0;
      var epTimer = setInterval(function () {
        epAttempts += 1;
        var seasonSelect = document.querySelector(".vel-vod-detail__season-select");
        if (seasonSelect && item.seasonNumber) {
          var seasonValue = String(item.seasonNumber);
          if (seasonSelect.value !== seasonValue) {
            seasonSelect.value = seasonValue;
            seasonSelect.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }

        var epButton = null;
        if (item.episodeStreamId) {
          epButton = document.querySelector('.vel-vod-detail__episode[data-episode-stream-id="' + item.episodeStreamId + '"]');
        }
        if (!epButton && item.seasonNumber != null && item.episodeNumber != null) {
          var allEps = document.querySelectorAll(".vel-vod-detail__episode");
          for (var eIdx = 0; eIdx < allEps.length; eIdx++) {
            var badgeEl = allEps[eIdx].querySelector(".vel-vod-detail__episode-badge");
            var titleEl = allEps[eIdx].querySelector(".vel-vod-detail__episode-title");
            var parsedEp = parseSeasonEpisode(badgeEl ? badgeEl.textContent : "", titleEl ? titleEl.textContent : "");
            if (parsedEp && Number(parsedEp.season) === Number(item.seasonNumber) && Number(parsedEp.episode) === Number(item.episodeNumber)) {
              epButton = allEps[eIdx];
              break;
            }
          }
        }

        if (epButton) {
          clearInterval(epTimer);
          epButton.click();
          try {
            epButton.scrollIntoView({ behavior: "smooth", block: "center" });
          } catch (_) {}
          [150, 400, 800].forEach(function (delay) {
            setTimeout(function () {
              try {
                epButton.scrollIntoView({ behavior: "smooth", block: "center" });
              } catch (_) {}
            }, delay);
          });
          return;
        }

        if (epAttempts >= 30) {
          clearInterval(epTimer);
          var fallbackEp = document.querySelector(".vel-vod-detail__episode");
          if (fallbackEp) {
            fallbackEp.click();
            try {
              fallbackEp.scrollIntoView({ behavior: "smooth", block: "center" });
            } catch (_) {}
          }
        }
      }, 100);
    } else {
      var movieEntry = {
        streamId: item.streamId,
        name: item.name,
        thumbUrl: item.thumbUrl,
        sourceId: item.sourceId || "",
        contentType: "movies"
      };

      if (typeof window.veloraOpenCachedHomeItem === "function") {
        window.veloraOpenCachedHomeItem({
          id: "movies",
          content_type: "movies",
          package_id: item.packageId || "movies:all"
        }, movieEntry);
      }

      var movieAttempts = 0;
      var movieTimer = setInterval(function () {
        movieAttempts += 1;
        var watchButton = document.querySelector(".vel-vod-detail__watch");
        if (watchButton) {
          clearInterval(movieTimer);
          watchButton.click();
          return;
        }
        if (movieAttempts >= 30) clearInterval(movieTimer);
      }, 100);
    }
  };

  // Capture user clicks on Episode rows & Movie Watch buttons to arm resume point immediately
  document.addEventListener("click", function (e) {
    var epBtn = e.target.closest(".vel-vod-detail__episode");
    if (epBtn) {
      var history = getLocalHistory();
      var seriesTitleEl = document.querySelector(".vel-vod-detail__title");
      var sName = seriesTitleEl ? seriesTitleEl.textContent.trim() : "";
      var detailEl = epBtn.closest(".vel-vod-detail") || document.querySelector(".vel-vod-detail");
      var sId = detailEl ? (detailEl.dataset.seriesId || detailEl.dataset.streamId || "") : "";
      var saved = findHistoryForEpisodeRow(epBtn, history, sName, sId);

      if (saved && saved.currentTime > 3 && !saved.isFinished && (saved.progressPercent == null || saved.progressPercent < FINISHED_WATCH_PERCENT)) {
        var targetEpSeek = Math.max(0, (saved.currentTime || 0) - 5);
        window.__veloraPendingResumeSeek = { targetSeconds: targetEpSeek, applied: false, timestamp: Date.now() };
        console.info("[Watch History] Clicked episode resume armed at", targetEpSeek, "seconds (with -5s rewind buffer).");
      } else {
        window.__veloraPendingResumeSeek = null;
      }
      return;
    }

    var watchBtn = e.target.closest(".vel-vod-detail__watch");
    if (watchBtn) {
      var activeCard = document.querySelector(".vel-vod-movie-card--active") || document.querySelector(".vel-vod-movie-card[data-stream-id]");
      if (activeCard && activeCard.dataset.streamId) {
        var historyM = getLocalHistory();
        var mSaved = historyM.find(function (it) {
          return it && it.type !== "series" && String(it.streamId) === String(activeCard.dataset.streamId);
        });
        if (mSaved && mSaved.currentTime > 3 && !mSaved.isFinished && (mSaved.progressPercent == null || mSaved.progressPercent < FINISHED_WATCH_PERCENT)) {
          var targetMovieSeek = Math.max(0, (mSaved.currentTime || 0) - 5);
          window.__veloraPendingResumeSeek = { targetSeconds: targetMovieSeek, applied: false, timestamp: Date.now() };
          console.info("[Watch History] Clicked movie resume armed at", targetMovieSeek, "seconds (with -5s rewind buffer).");
        } else {
          window.__veloraPendingResumeSeek = null;
        }
      }
    }
  }, true);

  // Listen to playback started: automatically detect saved progress for episodes and movies
  window.addEventListener("velora-playback-started", function (event) {
    if (!event || !event.detail) return;
    var d = event.detail;

    var isSeries = d.type === "series";
    var history = getLocalHistory();
    var savedProgress = null;

    if (isSeries) {
      var epId = String(d.episodeStreamId || d.streamId || "").trim();
      var sId = d.seriesId ? String(d.seriesId).trim() : "";
      var currentSeriesNorm = normalizeTitle(d.seriesName || d.name || "");

      savedProgress = history.find(function (it) {
        if (!it || it.type !== "series") return false;

        // 1. Direct episode ID match
        if (epId && (String(it.episodeStreamId || "") === epId || String(it.streamId || "") === epId)) {
          if (sId && it.seriesId && String(it.seriesId) !== sId) return false;
          return true;
        }

        // 2. Fallback: match strictly by same Series (ID or exact title) + same Season + same Episode
        var isSameSeries = false;
        if (sId && it.seriesId && String(it.seriesId) === sId) {
          isSameSeries = true;
        } else if (currentSeriesNorm && it.name && currentSeriesNorm.length >= 2) {
          var histNorm = normalizeTitle(it.name);
          if (currentSeriesNorm === histNorm) {
            isSameSeries = true;
          }
        }

        if (isSameSeries && d.seasonNumber != null && d.episodeNumber != null && it.seasonNumber != null && it.episodeNumber != null) {
          if (Number(it.seasonNumber) === Number(d.seasonNumber) && Number(it.episodeNumber) === Number(d.episodeNumber)) {
            return true;
          }
        }

        return false;
      });
    } else {
      var sId = String(d.streamId || "").trim();
      var mNorm = normalizeTitle(d.name || "");
      savedProgress = history.find(function (it) {
        if (!it || it.type === "series") return false;
        if (sId && String(it.streamId || "") === sId) return true;
        if (mNorm && it.name && mNorm.length >= 2 && normalizeTitle(it.name) === mNorm) return true;
        return false;
      });
    }

    var initialSeekTime = 0;
    if (savedProgress && savedProgress.currentTime > 3 && !savedProgress.isFinished && (savedProgress.progressPercent == null || savedProgress.progressPercent < FINISHED_WATCH_PERCENT)) {
      initialSeekTime = Math.max(0, (savedProgress.currentTime || 0) - 5);
      window.__veloraPendingResumeSeek = { targetSeconds: initialSeekTime, applied: false, timestamp: Date.now() };
      console.info("[Watch History] Auto-resuming with -5s buffer at", initialSeekTime, "seconds (saved was", savedProgress.currentTime, "s) for", d.name || d.episodeTitle || d.seriesName);
    } else {
      window.__veloraPendingResumeSeek = null;
    }

    state.currentPlaying = {
      id: isSeries ? "series:" + (d.seriesId || d.streamId) + ":ep:" + (d.episodeStreamId || d.streamId) : "movie:" + d.streamId,
      type: isSeries ? "series" : "movie",
      streamId: d.streamId,
      seriesId: d.seriesId || null,
      episodeStreamId: d.episodeStreamId || null,
      seasonNumber: d.seasonNumber || null,
      episodeNumber: d.episodeNumber || null,
      name: d.seriesName || d.name,
      seriesName: d.seriesName || d.name,
      episodeTitle: d.episodeTitle || null,
      thumbUrl: cleanCoverUrl(d.poster || d.cover || d.thumbUrl || ""),
      backdropUrl: cleanCoverUrl(d.backdropUrl || d.backdrop || d.backdrop_path || d.backdrop_url || d.cover || d.poster || ""),
      packageId: d.packageId || "",
      sourceId: d.sourceId || "",
      containerExtension: d.containerExtension || "mp4",
      duration: savedProgress ? (savedProgress.duration || 0) : 0,
      currentTime: initialSeekTime,
      updatedAt: Date.now()
    };

    updateSessionTrackerMedia(state.currentPlaying.id, state.currentPlaying);
  });

  // Helper to get minimum watch seconds required for Reprendre rail (default 3 mins = 180s)
  function getResumeMinWatchSeconds() {
    var minutes = 3;
    if (typeof window.__veloraResumeMinWatchMinutes === "number" && !isNaN(window.__veloraResumeMinWatchMinutes)) {
      minutes = window.__veloraResumeMinWatchMinutes;
    } else {
      try {
        var cached = localStorage.getItem("velora_resume_min_watch_minutes");
        if (cached != null && !isNaN(parseFloat(cached))) {
          minutes = parseFloat(cached);
        }
      } catch (_) {}
    }
    return Math.max(0, minutes * 60);
  }

  async function syncResumeMinWatchSetting() {
    try {
      var res = await fetch("/api/velora-db/rest/v1/admin_settings?key=eq.resume_min_watch_minutes", { cache: "no-store" });
      if (res.ok) {
        var rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0 && rows[0].value != null) {
          var m = parseFloat(rows[0].value);
          if (!isNaN(m) && m >= 0) {
            window.__veloraResumeMinWatchMinutes = m;
            try { localStorage.setItem("velora_resume_min_watch_minutes", String(m)); } catch (_) {}
            injectResumeSectionDirectly();
          }
        }
      }
    } catch (_) {}
  }

  // ============================================================
  // Requirement 4 & 5: Reprendre Rail (Strictly 1 card per series, No Live TV Channels)
  // ============================================================
  window.veloraRenderResumeSection = function () {
    var allItems = getLocalHistory();
    if (!allItems || !allItems.length) return null;

    var seriesGroups = new Map();
    var movieItems = [];

    allItems.forEach(function (it) {
      if (!isValidMediaEntry(it)) return;
      if (it.type === "movie" || it.type === "movies") {
        if (!it.isFinished && (it.progressPercent == null || it.progressPercent < FINISHED_WATCH_PERCENT)) {
          movieItems.push(it);
        }
      } else if (it.type === "series") {
        var sKey = String(it.seriesId || it.name || "").trim().toLowerCase();
        if (!sKey) sKey = String(it.streamId || "");
        if (!seriesGroups.has(sKey)) seriesGroups.set(sKey, []);
        seriesGroups.get(sKey).push(it);
      }
    });

    var resolvedSeriesCards = [];

    seriesGroups.forEach(function (epsList, sKey) {
      epsList.sort(function (a, b) {
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });

      var activeEp = epsList[0];
      if (!activeEp) return;

      // 1. In-progress episode takes precedence
      if (!activeEp.isFinished && (activeEp.progressPercent == null || activeEp.progressPercent < FINISHED_WATCH_PERCENT)) {
        resolvedSeriesCards.push(activeEp);
        return;
      }

      // 2. All recorded episodes are finished: advance to next episode
      var latestFinished = activeEp;
      var sId = latestFinished.seriesId || latestFinished.streamId;
      var cachedEps = getSeriesEpisodesCache(sId);
      if (cachedEps && cachedEps.length > 0) {
        var nextEp = findNextEpisodeInList(cachedEps, latestFinished.seasonNumber, latestFinished.episodeNumber, latestFinished.episodeStreamId);
        if (nextEp) {
          var nextCardItem = Object.assign({}, latestFinished, {
            id: "series:" + sId + ":ep:" + nextEp.episodeStreamId,
            episodeStreamId: nextEp.episodeStreamId,
            seasonNumber: nextEp.seasonNumber,
            episodeNumber: nextEp.episodeNum,
            episodeTitle: nextEp.title,
            currentTime: 0,
            duration: 0,
            progressPercent: 0,
            isFinished: false,
            updatedAt: latestFinished.updatedAt || Date.now()
          });
          resolvedSeriesCards.push(nextCardItem);
        }
      } else {
        fetchSeriesEpisodes(sId, latestFinished.sourceId).then(function (eps) {
          if (eps && eps.length > 0) {
            injectResumeSectionDirectly();
          }
        });
      }
    });

    var deduplicated = movieItems.concat(resolvedSeriesCards).sort(function (a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    if (!deduplicated.length) return null;

    var block = document.createElement("div");
    block.className = "UI3iHJ vel-home-section vel-home-section--resume vel-home-section--horizontal";
    block.dataset.testid = "navigation-carousel-wrapper";

    var headerSec = document.createElement("section");
    headerSec.className = "QHjixV vel-home-section__header";
    var tvxgSpan = document.createElement("span");
    tvxgSpan.className = "TvxgS1";
    var heading = document.createElement("h2");
    heading.className = "qwttco vel-home-section__heading";
    heading.innerHTML = '<span data-testid="carousel-title"><span>Continuer de regarder</span></span>';
    tvxgSpan.appendChild(heading);
    headerSec.appendChild(tvxgSpan);

    var railWrap = document.createElement("div");
    railWrap.className = "vJYTdI LiEb2X UEOrk2 CHGlLt OH_E2I vel-home-section__rail-wrap";
    var rail = document.createElement("div");
    rail.className = "lw1NJZ vel-home-section__rail";
    rail.dataset.testid = "card-container-list";
    railWrap.appendChild(rail);

    deduplicated.forEach(function (item) {
      if (!isValidMediaEntry(item)) return;
      var isSeries = item.type === "series";
      var card = document.createElement("button");
      card.type = "button";
      card.className = "vel-home-section__card vel-home-section__card--" + (isSeries ? "series" : "movies") + " vel-home-section__card--resume vel-home-section__card--horizontal";
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", "Continuer de regarder " + (item.seriesName || item.name));

      var entryForOpen = isSeries ? {
        id: "series:" + (item.seriesId || item.streamId),
        streamId: item.seriesId || item.streamId,
        seriesId: item.seriesId || item.streamId,
        episodeStreamId: item.episodeStreamId || item.streamId,
        seasonNumber: item.seasonNumber,
        episodeNumber: item.episodeNumber,
        currentTime: item.currentTime,
        name: item.seriesName || item.name,
        thumbUrl: item.thumbUrl || item.cover || item.stream_icon || "",
        backdropUrl: item.backdropUrl || item.backdrop || item.thumbUrl || item.cover || "",
        cover: item.thumbUrl || item.cover || item.stream_icon || "",
        packageId: item.packageId || "series:all",
        sourceId: item.sourceId || "",
        contentType: "series",
        isResumeCard: true,
        rawItem: item
      } : Object.assign({}, item, {
        isResumeCard: true,
        rawItem: item
      });

      var sectionMeta = {
        id: isSeries ? "series" : "movies",
        content_type: isSeries ? "series" : "movies",
        package_id: item.packageId || (isSeries ? "series:all" : "movies:all"),
        card_orientation: "horizontal"
      };
      if (typeof window.veloraBindHomeCardActivation === "function") {
        window.veloraBindHomeCardActivation(card, sectionMeta, entryForOpen);
      }

      // Poster / Backdrop Media (16:9)
      var media = document.createElement("img");
      media.alt = "";
      media.loading = "lazy";
      media.decoding = "async";
      media.className = "vel-home-section__media";
      var imgSrc = item.backdropUrl || item.backdrop || item.thumbUrl || item.cover || "";
      if (imgSrc && typeof window.veloraSetHomeImageSource === "function") {
        window.veloraSetHomeImageSource(media, imgSrc, function () {
          if (imgSrc !== item.thumbUrl && item.thumbUrl) {
            media.src = item.thumbUrl;
          } else {
            media.removeAttribute("src");
            media.classList.add("vel-home-section__fallback");
            media.textContent = "▶";
          }
        });
      } else if (imgSrc) {
        media.src = imgSrc;
      } else {
        media.classList.add("vel-home-section__fallback");
        media.textContent = "▶";
      }

      // Center Glass Play Button
      var centerPlay = document.createElement("span");
      centerPlay.className = "vel-resume-play-center";
      centerPlay.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';

      // Single Clean Top-Left Badge (S1:E3 for series, or HH:MM elapsed position for movies)
      var badge = document.createElement("span");
      badge.className = "vel-resume-badge";

      if (isSeries && item.seasonNumber != null && item.episodeNumber != null) {
        badge.textContent = "S" + item.seasonNumber + ":E" + item.episodeNumber;
      } else {
        var curSec = item.currentTime != null && !isNaN(item.currentTime)
          ? Number(item.currentTime)
          : (item.duration && item.progressPercent ? (item.duration * item.progressPercent / 100) : 0);
        badge.textContent = formatPlaybackTimestamp(curSec);
      }

      // Netflix-Style Red Progress Bar
      var progressBar = document.createElement("div");
      progressBar.className = "vel-resume-progress-bar";
      var progressFill = document.createElement("div");
      progressFill.className = "vel-resume-progress-fill";
      progressFill.style.width = Math.min(100, Math.max(0, item.progressPercent || 0)) + "%";
      progressBar.appendChild(progressFill);

      // Top-Right Remove Button (vector close icon)
      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "vel-resume-remove-btn";
      removeBtn.setAttribute("aria-label", "Supprimer de Continuer de regarder");
      removeBtn.title = "Supprimer de Continuer de regarder";
      removeBtn.setAttribute("data-prevent-card-open", "true");
      removeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

      function handleRemoveAction(event) {
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        var parentRail = card.parentElement;
        var section = card.closest(".vel-home-section--resume");
        var activeCards = parentRail ? parentRail.querySelectorAll(".vel-home-section__card--resume:not(.is-removing)") : [];

        card.classList.add("is-removing");
        removeHistoryItem(item, card);

        if (activeCards.length <= 1 && section) {
          section.classList.add("is-hiding");
        }

        setTimeout(function () {
          card.remove();
          if (parentRail && parentRail.querySelectorAll(".vel-home-section__card--resume").length === 0) {
            if (section) section.remove();
          }
        }, 280);
      }

      function stopBubble(event) {
        event.stopPropagation();
        event.stopImmediatePropagation();
      }

      removeBtn.addEventListener("pointerdown", stopBubble);
      removeBtn.addEventListener("pointerup", stopBubble);
      removeBtn.addEventListener("touchstart", stopBubble, { passive: false });
      removeBtn.addEventListener("touchend", stopBubble, { passive: false });
      removeBtn.addEventListener("click", handleRemoveAction);

      card.append(media, centerPlay, badge, removeBtn, progressBar);

      if (typeof window.veloraEnsureCardBackdrop === "function") {
        window.veloraEnsureCardBackdrop(card, media, sectionMeta, entryForOpen);
      }

      card.addEventListener("click", function (event) {
        if (event.target && event.target.closest(".vel-resume-remove-btn, [data-prevent-card-open]")) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        window.veloraResumePlayback(item);
      });

      card.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          window.veloraResumePlayback(item);
        }
      });

      rail.appendChild(card);
    });

    if (rail.children.length === 0) return null;
    block.append(headerSec, railWrap);
    return block;
  };

  function injectResumeSectionDirectly() {
    var root = document.getElementById("vel-home-sections");
    if (!root) return;
    var existing = root.querySelector(".vel-home-section--resume");
    var savedScrollLeft = 0;
    if (existing) {
      var oldRail = existing.querySelector(".vel-home-section__rail");
      if (oldRail && Number.isFinite(oldRail.scrollLeft)) {
        savedScrollLeft = oldRail.scrollLeft;
      }
    }
    var block = window.veloraRenderResumeSection();
    if (!block) {
      if (existing) existing.remove();
      return;
    }
    if (existing) {
      existing.replaceWith(block);
      var newRail = block.querySelector(".vel-home-section__rail");
      if (newRail && savedScrollLeft > 0) {
        newRail.scrollLeft = savedScrollLeft;
      }
    } else {
      root.prepend(block);
    }
  }
  window.veloraInjectResumeSection = injectResumeSectionDirectly;

  // Lifecycle boot
  function init() {
    injectStyles();
    bindVideoTrackers();

    loadHistoryFromDatabase();
    syncResumeMinWatchSetting();

    document.addEventListener("velora-user-logged-in", function () {
      state.cachedHistory = null;
      loadHistoryFromDatabase();
      syncResumeMinWatchSetting();
    });

    document.addEventListener("velora-resume-settings-changed", injectResumeSectionDirectly);

    // Refresh resume section only when returning home or viewing home
    document.addEventListener("velora-home-tab", function () {
      if (state.needsResumeRailRefresh) {
        state.needsResumeRailRefresh = false;
        injectResumeSectionDirectly();
      }
      requestDecorateEpisodes();
    });

    document.addEventListener("velora-show-home", function () {
      if (state.needsResumeRailRefresh) {
        state.needsResumeRailRefresh = false;
        injectResumeSectionDirectly();
      }
    });

    document.addEventListener("velora-home-media-open", function () {
      bindVideoTrackers();
      requestDecorateEpisodes();
    });

    window.addEventListener("pagehide", function () {
      var video = document.getElementById("video-vod");
      if (video) recordProgress(video, false, false);
    });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        var video = document.getElementById("video-vod");
        if (video) recordProgress(video, false, false);
      }
    });

    window.setTimeout(injectResumeSectionDirectly, 300);
    window.setTimeout(requestDecorateEpisodes, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

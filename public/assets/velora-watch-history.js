(function () {
  "use strict";

  var MAX_ITEMS = 60;
  var MIN_WATCH_SECONDS = 2;
  var FINISHED_WATCH_PERCENT = 90;
  var state = {
    currentPlaying: null,
    lastSavedTimestamp: 0,
    dbSyncInProgress: false,
    isDecorating: false,
    decorateTimer: null
  };

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
        margin-bottom: 0.65rem;
      }
      .vel-home-section__card--resume {
        position: relative !important;
        overflow: hidden !important;
        border: 1px solid rgba(255, 255, 255, 0.18) !important;
        background: #0d0c14 !important;
      }
      .vel-home-section__card--resume .vel-home-section__media {
        display: block;
        width: 100%;
        aspect-ratio: 2/3;
        object-fit: cover;
        border-radius: 11px;
      }
      .vel-resume-play-center {
        position: absolute;
        top: 42%;
        left: 50%;
        transform: translate(-50%, -50%);
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
        transition: transform 0.18s ease, background 0.18s ease;
        pointer-events: none;
      }
      .vel-resume-play-center svg {
        width: 1.35rem;
        height: 1.35rem;
        margin-left: 2px;
        fill: currentColor;
      }
      .vel-home-section__card--resume:hover .vel-resume-play-center {
        transform: translate(-50%, -50%) scale(1.12);
        background: #e50914;
        border-color: #fff;
      }
      .vel-resume-badge {
        position: absolute;
        top: 7px;
        left: 7px;
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
        top: 7px !important;
        right: 7px !important;
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
        border-bottom-left-radius: 11px;
        border-bottom-right-radius: 11px;
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
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        z-index: 3 !important;
        min-height: auto !important;
        padding: 1.8rem 0.55rem 0.55rem !important;
        background: linear-gradient(0deg, rgba(5,4,10,0.96) 0%, rgba(5,4,10,0.72) 65%, transparent 100%) !important;
        text-align: left !important;
        pointer-events: none !important;
      }
      .vel-home-section__card--resume .vel-home-section__name strong {
        display: block;
        font-size: 0.76rem;
        font-weight: 900;
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-shadow: 0 2px 8px rgba(0,0,0,0.8);
      }
      .vel-home-section__card--resume .vel-home-section__name small {
        display: block;
        font-size: 0.64rem;
        font-weight: 700;
        color: #cbd5e1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-top: 1px;
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
      }
    `;
    document.head.appendChild(style);
  }

  function isValidMediaEntry(media) {
    if (!media || typeof media !== "object") return false;
    if (media.type === "live" || media.type === "channel" || media.contentType === "live" || media.item_type === "channel" || media.item_type === "live") return false;
    if (media.type !== "movie" && media.type !== "series") return false;
    var id = String(media.id || "");
    if (id.startsWith("live:") || id.startsWith("channel:")) return false;
    var name = String(media.name || "").trim();
    if (!name || name.toLowerCase() === "titre" || name.toLowerCase() === "titre...") return false;
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

  function getLocalHistory() {
    try {
      var activeKey = getActiveUserKey();
      var raw = localStorage.getItem(activeKey);
      if (raw) {
        var items = JSON.parse(raw);
        if (Array.isArray(items) && items.length > 0) {
          var validOnly = items.filter(isValidMediaEntry);
          if (validOnly.length !== items.length) {
            localStorage.setItem(activeKey, JSON.stringify(validOnly));
          }
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
                var validLeg = legItems.filter(isValidMediaEntry);
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

  function saveLocalHistory(items) {
    try {
      var valid = items.filter(isValidMediaEntry);
      var key = getActiveUserKey();
      localStorage.setItem(key, JSON.stringify(valid.slice(0, MAX_ITEMS)));
      document.dispatchEvent(new CustomEvent("velora-watch-history-updated"));
      injectResumeSectionDirectly();
      requestDecorateEpisodes();
    } catch (_) {}
  }

  function filterHistoryList(list, item) {
    if (!Array.isArray(list) || !item) return [];
    var targetId = String(item.id || "");
    var sId = item.streamId ? String(item.streamId) : "";
    var epId = item.episodeStreamId ? String(item.episodeStreamId) : "";
    var seriesId = item.seriesId ? String(item.seriesId) : "";

    return list.filter(function (it) {
      if (!it) return false;
      if (targetId && String(it.id) === targetId) return false;
      if (item.type === "series" && seriesId && (String(it.seriesId) === seriesId || String(it.streamId) === seriesId)) return false;
      if (sId && (String(it.streamId) === sId || String(it.episodeStreamId) === sId)) return false;
      if (epId && (String(it.episodeStreamId) === epId || String(it.streamId) === epId)) return false;
      return isValidMediaEntry(it);
    });
  }

  function removeHistoryItem(item) {
    if (!item) return;

    // 1. Clean from ALL localStorage keys immediately so it is never resurrected on reload
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

    var activeItems = filterHistoryList(getLocalHistory(), item);
    saveLocalHistory(activeItems);

    // 2. Sync removal to backend database for all IDs
    var token = authToken();
    if (token) {
      var idsToDelete = new Set();
      if (item.id) idsToDelete.add(String(item.id));
      if (item.streamId) idsToDelete.add(String(item.streamId));
      if (item.episodeStreamId) idsToDelete.add(String(item.episodeStreamId));
      if (item.seriesId) idsToDelete.add(String(item.seriesId));

      idsToDelete.forEach(function (id) {
        fetch("/api/history/" + encodeURIComponent(String(id)), {
          method: "DELETE",
          headers: { Authorization: "Bearer " + token }
        }).catch(function () {});
      });
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
          }).filter(isValidMediaEntry);

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

  // Record playback progress (Strictly for VOD Movies & Series Episodes only)
  function recordProgress(video, isEnd) {
    if (!video || video.id === "video" || isNaN(video.currentTime) || (video.currentTime < MIN_WATCH_SECONDS && !isEnd)) return;
    if (document.body.dataset.velActiveTab === "live") return;
    var vodContainer = document.getElementById("vod-player-container");
    if (!vodContainer || vodContainer.classList.contains("hidden")) return;

    var media = state.currentPlaying;
    if (!media) {
      var activeEp = document.querySelector(".vel-vod-detail__episode--playing, .vel-vod-detail__episode[aria-current='true']");
      var seriesTitle = document.querySelector(".vel-vod-detail__title");
      if (activeEp) {
        var badge = activeEp.querySelector(".vel-vod-detail__episode-badge");
        var epTitle = activeEp.querySelector(".vel-vod-detail__episode-title");
        var parsed = parseSeasonEpisode(badge ? badge.textContent : "", epTitle ? epTitle.textContent : "");
        media = {
          id: "series:" + (activeEp.dataset.episodeStreamId || "ep"),
          type: "series",
          streamId: activeEp.dataset.episodeStreamId,
          episodeStreamId: activeEp.dataset.episodeStreamId,
          name: seriesTitle ? seriesTitle.textContent.trim() : "Série",
          episodeTitle: epTitle ? epTitle.textContent.trim() : "",
          seasonNumber: parsed ? parsed.season : 1,
          episodeNumber: parsed ? parsed.episode : 1,
          updatedAt: Date.now()
        };
        state.currentPlaying = media;
      }
    }

    if (!media || !isValidMediaEntry(media)) return;

    var castMedia = window.VeloraCast?.media;
    var rawDuration = castMedia && Number.isFinite(castMedia.duration) && castMedia.duration > 0 ? castMedia.duration : Number(video.duration);
    var duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : (media.duration || 0);
    var offset = castMedia && Number.isFinite(castMedia.offset || castMedia.position) ? (Number(castMedia.offset || castMedia.position) || 0) : 0;
    var currentPos = isFinished ? duration : Math.max(0, offset + (Number(video.currentTime) || 0));
    var percent = isEnd ? 100 : (duration > 0 ? (currentPos / duration) * 100 : 5);
    var id = media.id;
    var isFinished = isEnd || (duration > 0 && percent >= FINISHED_WATCH_PERCENT);

    var items = getLocalHistory().filter(function (item) {
      return String(item.id) !== String(id);
    });

    var existingEntry = getLocalHistory().find(function (item) { return String(item.id) === String(id); });
    var thumb = cleanCoverUrl(media.thumbUrl || (existingEntry ? existingEntry.thumbUrl : "") || "");

    var entry = {
      id: String(id),
      type: media.type,
      streamId: media.streamId || null,
      seriesId: media.seriesId || null,
      episodeStreamId: media.episodeStreamId || null,
      seasonNumber: media.seasonNumber != null ? Number(media.seasonNumber) : null,
      episodeNumber: media.episodeNumber != null ? Number(media.episodeNumber) : null,
      name: media.name,
      episodeTitle: media.episodeTitle || null,
      thumbUrl: thumb,
      packageId: media.packageId || "",
      sourceId: media.sourceId || "",
      containerExtension: media.containerExtension || "mp4",
      currentTime: isFinished ? Math.round(duration || currentPos) : Math.round(currentPos),
      duration: Math.round(duration),
      progressPercent: isFinished ? 100 : Math.min(100, Math.max(1, Math.round(percent || 5))),
      isFinished: isFinished,
      updatedAt: Date.now()
    };

    if (!isValidMediaEntry(entry)) return;

    items.unshift(entry);
    saveLocalHistory(items);
    syncProgressToDatabase(entry);
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

  function findHistoryForEpisodeRow(row, history, currentSeriesName) {
    var epId = String(row.dataset.episodeStreamId || "");
    var badge = row.querySelector(".vel-vod-detail__episode-badge");
    var title = row.querySelector(".vel-vod-detail__episode-title");
    var parsed = parseSeasonEpisode(badge ? badge.textContent : "", title ? title.textContent : "");

    var normCurrent = normalizeTitle(currentSeriesName);

    for (var i = 0; i < history.length; i++) {
      var it = history[i];
      if (it.type !== "series") continue;

      // 1. Direct Episode Stream ID match
      if (epId && (String(it.episodeStreamId) === epId || String(it.streamId) === epId)) {
        return it;
      }

      // 2. Match by Series Name + Season + Episode
      if (parsed && it.seasonNumber != null && it.episodeNumber != null) {
        if (Number(it.seasonNumber) === Number(parsed.season) && Number(it.episodeNumber) === Number(parsed.episode)) {
          if (!normCurrent || !it.name) return it;
          var normHist = normalizeTitle(it.name);
          if (normCurrent === normHist || normCurrent.includes(normHist) || normHist.includes(normCurrent)) {
            return it;
          }
        }
      }
    }
    return null;
  }

  function decorateSeriesEpisodes() {
    if (state.isDecorating) return;
    state.isDecorating = true;

    try {
      var episodeRows = document.querySelectorAll(".vel-vod-detail__episode");
      if (!episodeRows || !episodeRows.length) return;

      var history = getLocalHistory();
      if (!history || !history.length) return;

      var seriesTitleEl = document.querySelector(".vel-vod-detail__title");
      var currentSeriesName = seriesTitleEl ? seriesTitleEl.textContent.trim() : "";

      episodeRows.forEach(function (row) {
        var item = findHistoryForEpisodeRow(row, history, currentSeriesName);
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
    if (!pending || pending.applied || !pending.targetSeconds || pending.targetSeconds <= 0 || !videoEl) return;
    if (Date.now() - (pending.timestamp || 0) > 45000) {
      window.__veloraPendingResumeSeek = null;
      return;
    }

    if (videoEl.readyState >= 1) {
      var target = pending.targetSeconds;
      var dur = Number(videoEl.duration);
      if (Number.isFinite(dur) && dur > 0 && target >= dur * 0.95) {
        pending.applied = true;
        return;
      }
      if (Math.abs(videoEl.currentTime - target) > 1.5) {
        try {
          videoEl.currentTime = target;
          pending.applied = true;
          console.info("[Watch History] Resumed at", target, "seconds");
        } catch (err) {
          console.warn("[Watch History] Seek error:", err);
        }
      } else {
        pending.applied = true;
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

  function bindVideoTrackers() {
    // Strictly bind only VOD player (video-vod). Live TV player (video) is live stream and never tracked in resume.
    var vodVideo = document.getElementById("video-vod");
    if (vodVideo && !vodVideo.__veloraResumeTrackerBound) {
      vodVideo.__veloraResumeTrackerBound = true;

      function onTimeUpdate() {
        if (vodVideo.paused || vodVideo.seeking) return;
        var now = Date.now();
        if (now - state.lastSavedTimestamp >= 2000) {
          state.lastSavedTimestamp = now;
          recordProgress(vodVideo, false);
        }
      }

      function onPause() {
        recordProgress(vodVideo, false);
      }

      vodVideo.addEventListener("timeupdate", function () { tryApplySeekOnActiveVideo(vodVideo); onTimeUpdate(); }, { passive: true });
      vodVideo.addEventListener("playing", function () { tryApplySeekOnActiveVideo(vodVideo); }, { passive: true });
      vodVideo.addEventListener("canplay", function () { tryApplySeekOnActiveVideo(vodVideo); }, { passive: true });
      vodVideo.addEventListener("loadedmetadata", function () { tryApplySeekOnActiveVideo(vodVideo); }, { passive: true });
      vodVideo.addEventListener("pause", onPause, { passive: true });
      vodVideo.addEventListener("ended", function () {
        recordProgress(vodVideo, true);
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

  // Safe seek handler once video playback actively starts
  window.veloraResumePlayback = function (item) {
    if (!isValidMediaEntry(item)) return;
    var isSeries = item.type === "series";
    var targetSeconds = Math.max(0, Number(item.currentTime) || 0);
    window.__veloraPendingResumeSeek = { targetSeconds: targetSeconds, applied: false, timestamp: Date.now() };

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
      var saved = findHistoryForEpisodeRow(epBtn, history, sName);

      if (saved && saved.currentTime > 3 && !saved.isFinished && (saved.progressPercent == null || saved.progressPercent < FINISHED_WATCH_PERCENT)) {
        window.__veloraPendingResumeSeek = { targetSeconds: saved.currentTime, applied: false, timestamp: Date.now() };
        console.info("[Watch History] Clicked episode resume armed at", saved.currentTime, "seconds.");
      }
      return;
    }

    var watchBtn = e.target.closest(".vel-vod-detail__watch");
    if (watchBtn) {
      var activeCard = document.querySelector(".vel-vod-movie-card--active") || document.querySelector(".vel-vod-movie-card[data-stream-id]");
      if (activeCard && activeCard.dataset.streamId) {
        var historyM = getLocalHistory();
        var mSaved = historyM.find(function (it) {
          return it.type !== "series" && String(it.streamId) === String(activeCard.dataset.streamId);
        });
        if (mSaved && mSaved.currentTime > 3 && !mSaved.isFinished && (mSaved.progressPercent == null || mSaved.progressPercent < FINISHED_WATCH_PERCENT)) {
          window.__veloraPendingResumeSeek = { targetSeconds: mSaved.currentTime, applied: false, timestamp: Date.now() };
          console.info("[Watch History] Clicked movie resume armed at", mSaved.currentTime, "seconds.");
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
      var epId = String(d.episodeStreamId || d.streamId || "");
      savedProgress = history.find(function (it) {
        if (it.type !== "series") return false;
        if (epId && (String(it.episodeStreamId) === epId || String(it.streamId) === epId)) return true;
        if (d.seasonNumber != null && d.episodeNumber != null &&
            Number(it.seasonNumber) === Number(d.seasonNumber) &&
            Number(it.episodeNumber) === Number(d.episodeNumber)) {
          return true;
        }
        return false;
      });
    } else {
      var sId = String(d.streamId || "");
      savedProgress = history.find(function (it) {
        return it.type !== "series" && String(it.streamId) === sId;
      });
    }

    var initialSeekTime = 0;
    if (savedProgress && savedProgress.currentTime > 3 && !savedProgress.isFinished && (savedProgress.progressPercent == null || savedProgress.progressPercent < FINISHED_WATCH_PERCENT)) {
      initialSeekTime = savedProgress.currentTime;
      window.__veloraPendingResumeSeek = { targetSeconds: initialSeekTime, applied: false, timestamp: Date.now() };
      console.info("[Watch History] Auto-resuming at", initialSeekTime, "seconds for", d.name || d.episodeTitle);
    }

    state.currentPlaying = {
      id: isSeries ? "series:" + (d.seriesId || d.streamId) + ":ep:" + (d.episodeStreamId || d.streamId) : "movie:" + d.streamId,
      type: isSeries ? "series" : "movie",
      streamId: d.streamId,
      seriesId: d.seriesId || null,
      episodeStreamId: d.episodeStreamId || null,
      seasonNumber: d.seasonNumber || null,
      episodeNumber: d.episodeNumber || null,
      name: d.name || d.seriesName,
      episodeTitle: d.episodeTitle || null,
      thumbUrl: cleanCoverUrl(d.poster || ""),
      packageId: d.packageId || "",
      sourceId: d.sourceId || "",
      containerExtension: d.containerExtension || "mp4",
      duration: savedProgress ? (savedProgress.duration || 0) : 0,
      currentTime: initialSeekTime,
      updatedAt: Date.now()
    };
  });

  // ============================================================
  // Requirement 4 & 5: Reprendre Rail (Strictly 1 card per series, No Live TV Channels)
  // ============================================================
  window.veloraRenderResumeSection = function () {
    var allItems = getLocalHistory();
    if (!allItems || !allItems.length) return null;

    var validInProgress = allItems.filter(function (it) {
      if (!isValidMediaEntry(it) || it.isFinished) return false;
      if (it.type !== "series" && it.type !== "movie" && it.type !== "movies") return false;
      if (it.progressPercent != null && it.progressPercent >= FINISHED_WATCH_PERCENT) return false;
      return true;
    });

    if (!validInProgress.length) return null;

    var seenSeries = new Map();
    var deduplicated = [];

    validInProgress.forEach(function (item) {
      var isSeries = item.type === "series";
      if (!isSeries) {
        deduplicated.push(item);
        return;
      }

      var sKey = String(item.seriesId || item.name || "").trim().toLowerCase();
      var existing = seenSeries.get(sKey);
      if (!existing) {
        seenSeries.set(sKey, item);
        deduplicated.push(item);
      } else {
        var curScore = (Number(item.seasonNumber) || 1) * 1000 + (Number(item.episodeNumber) || 1);
        var exScore = (Number(existing.seasonNumber) || 1) * 1000 + (Number(existing.episodeNumber) || 1);
        if (curScore >= exScore) {
          var idx = deduplicated.indexOf(existing);
          if (idx !== -1) {
            deduplicated[idx] = item;
            seenSeries.set(sKey, item);
          }
        }
      }
    });

    if (!deduplicated.length) return null;

    var block = document.createElement("section");
    block.className = "vel-home-section vel-home-section--resume";

    var heading = document.createElement("h3");
    heading.className = "vel-home-section__heading";
    heading.textContent = "Reprendre la lecture";

    var rail = document.createElement("div");
    rail.className = "vel-home-section__rail";

    deduplicated.forEach(function (item) {
      if (!isValidMediaEntry(item)) return;
      var isSeries = item.type === "series";
      var card = document.createElement("div");
      card.className = "vel-home-section__card vel-home-section__card--" + (isSeries ? "series" : "movies") + " vel-home-section__card--resume";
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", "Reprendre " + item.name);

      // Poster Media
      var media = document.createElement("img");
      media.alt = "";
      media.loading = "lazy";
      media.decoding = "async";
      media.className = "vel-home-section__media";
      if (item.thumbUrl && typeof window.veloraSetHomeImageSource === "function") {
        window.veloraSetHomeImageSource(media, item.thumbUrl, function () {
          media.removeAttribute("src");
          media.classList.add("vel-home-section__fallback");
          media.textContent = "▶";
        });
      } else if (item.thumbUrl) {
        media.src = item.thumbUrl;
      } else {
        media.classList.add("vel-home-section__fallback");
        media.textContent = "▶";
      }

      // Center Glass Play Button
      var centerPlay = document.createElement("span");
      centerPlay.className = "vel-resume-play-center";
      centerPlay.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';

      // Single Clean Top-Left Badge (S1:E3 for series, or remaining time for movies)
      var badge = document.createElement("span");
      badge.className = "vel-resume-badge";
      var remainingSeconds = Math.max(0, (item.duration || 0) - (item.currentTime || 0));
      var timeStr = formatRemainingTime(remainingSeconds);

      if (isSeries && item.seasonNumber != null && item.episodeNumber != null) {
        badge.textContent = "S" + item.seasonNumber + ":E" + item.episodeNumber;
      } else if (timeStr) {
        badge.textContent = timeStr;
      } else if (item.progressPercent) {
        badge.textContent = item.progressPercent + "%";
      } else {
        badge.textContent = "Film";
      }

      // Netflix-Style Red Progress Bar
      var progressBar = document.createElement("div");
      progressBar.className = "vel-resume-progress-bar";
      var progressFill = document.createElement("div");
      progressFill.className = "vel-resume-progress-fill";
      progressFill.style.width = Math.min(100, Math.max(0, item.progressPercent || 0)) + "%";
      progressBar.appendChild(progressFill);

      // Card Title Info
      var name = document.createElement("span");
      name.className = "vel-home-section__name";
      var titleStrong = document.createElement("strong");
      titleStrong.textContent = item.name;
      name.appendChild(titleStrong);

      if (isSeries && item.episodeTitle) {
        var epTitle = item.episodeTitle.trim();
        if (item.name && epTitle.toLowerCase().startsWith(item.name.toLowerCase())) {
          epTitle = epTitle.slice(item.name.length).replace(/^[\s\-–—:]+/, "").trim();
        }
        if (epTitle && epTitle.toLowerCase() !== item.name.toLowerCase()) {
          var sub = document.createElement("small");
          sub.textContent = epTitle;
          name.appendChild(sub);
        }
      }

      // Top-Right Remove Button (vector close icon)
      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "vel-resume-remove-btn";
      removeBtn.setAttribute("aria-label", "Supprimer de Reprendre la lecture");
      removeBtn.title = "Supprimer de Reprendre la lecture";
      removeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

      removeBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        card.style.transition = "opacity 0.2s ease, transform 0.2s ease";
        card.style.opacity = "0";
        card.style.transform = "scale(0.9)";
        setTimeout(function () {
          removeHistoryItem(item);
        }, 180);
      });

      card.append(media, centerPlay, badge, removeBtn, name, progressBar);

      card.addEventListener("click", function (event) {
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
    block.append(heading, rail);
    return block;
  };

  function injectResumeSectionDirectly() {
    var root = document.getElementById("vel-home-sections");
    if (!root) return;
    var existing = root.querySelector(".vel-home-section--resume");
    var block = window.veloraRenderResumeSection();
    if (!block) {
      if (existing) existing.remove();
      return;
    }
    if (existing) {
      existing.replaceWith(block);
    } else {
      root.prepend(block);
    }
  }
  window.veloraInjectResumeSection = injectResumeSectionDirectly;

  // Lifecycle boot
  function init() {
    injectStyles();
    bindVideoTrackers();

    var observer = new MutationObserver(function (mutations) {
      bindVideoTrackers();
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.addedNodes && m.addedNodes.length > 0) {
          requestDecorateEpisodes();
          break;
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Periodic sweep to ensure dynamic episode lists always render the bar immediately
    setInterval(function () {
      if (document.querySelector(".vel-vod-detail--series, .vel-vod-detail__episodes")) {
        decorateSeriesEpisodes();
      }
    }, 250);

    loadHistoryFromDatabase();
    document.addEventListener("velora-user-logged-in", loadHistoryFromDatabase);
    window.addEventListener("pagehide", function () {
      var video = document.getElementById("video-vod");
      if (video) recordProgress(video, false);
    });
    window.setTimeout(injectResumeSectionDirectly, 300);
    window.setTimeout(requestDecorateEpisodes, 400);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

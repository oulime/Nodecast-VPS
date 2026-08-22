(function () {
  "use strict";

  var MAX_ITEMS = 20;
  var MIN_WATCH_SECONDS = 3;
  var MAX_WATCH_PERCENT = 93;
  var state = {
    currentPlaying: null,
    lastSavedTimestamp: 0,
    dbSyncInProgress: false
  };

  function isValidMediaEntry(media) {
    if (!media || typeof media !== "object") return false;
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
      var raw = localStorage.getItem(getActiveUserKey());
      if (!raw) return [];
      var items = JSON.parse(raw);
      if (!Array.isArray(items)) return [];
      var valid = items.filter(isValidMediaEntry);
      if (valid.length !== items.length) {
        localStorage.setItem(getActiveUserKey(), JSON.stringify(valid));
      }
      return valid;
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
    } catch (_) {}
  }

  // Database Sync (Option B)
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
      var res = await fetch("/api/history?limit=20", {
        headers: { Authorization: "Bearer " + token }
      });
      if (res.ok) {
        var rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          var serverItems = rows.map(function (r) {
            var d = r.data || {};
            return Object.assign({}, d, {
              id: r.item_id ? (r.item_type === "series" ? "series:" + (r.parent_id || r.item_id) + ":ep:" + r.item_id : "movie:" + r.item_id) : d.id,
              type: r.item_type === "series" ? "series" : "movie",
              currentTime: r.progress || d.currentTime || 0,
              duration: r.duration || d.duration || 0,
              progressPercent: r.duration > 0 ? Math.min(99, Math.max(1, Math.round((r.progress / r.duration) * 100))) : (d.progressPercent || 5),
              updatedAt: r.updated_at || d.updatedAt || Date.now()
            });
          }).filter(isValidMediaEntry);

          var local = getLocalHistory();
          var merged = serverItems.concat(local.filter(function (l) {
            return !serverItems.some(function (s) { return String(s.id) === String(l.id); });
          })).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
          saveLocalHistory(merged);
        }
      }
    } catch (err) {
      console.warn("[Watch History] DB fetch failed", err);
    } finally {
      state.dbSyncInProgress = false;
    }
  }

  function removeHistoryItem(id) {
    if (!id) return;
    var items = getLocalHistory().filter(function (item) {
      return String(item.id) !== String(id);
    });
    saveLocalHistory(items);
    var token = authToken();
    if (token) {
      var rawId = id.includes(":") ? id.split(":").pop() : id;
      fetch("/api/history/" + encodeURIComponent(rawId), {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token }
      }).catch(function () {});
    }
  }

  function cleanCoverUrl(url) {
    if (!url) return "";
    var s = String(url).trim();
    if (s.startsWith("//")) return location.protocol + s;
    return s;
  }

  // Intercept exact playback start events
  window.addEventListener("velora-playback-started", function (event) {
    var d = event.detail;
    if (!d) return;
    var isSeries = d.type === "series";
    var poster = cleanCoverUrl(d.poster || "");
    var name = String(d.seriesName || d.name || "").trim();

    if (!name || name.toLowerCase() === "titre") {
      return;
    }

    state.currentPlaying = {
      id: isSeries ? ("series:" + (d.seriesId || d.streamId) + ":ep:" + (d.episodeStreamId || d.streamId)) : ("movie:" + d.streamId),
      type: isSeries ? "series" : "movie",
      streamId: d.streamId || d.episodeStreamId || null,
      seriesId: d.seriesId || null,
      episodeStreamId: d.episodeStreamId || null,
      name: name,
      episodeTitle: isSeries ? (d.episodeTitle || "") : null,
      seasonNumber: d.seasonNumber != null ? Number(d.seasonNumber) : 1,
      episodeNumber: d.episodeNumber != null ? Number(d.episodeNumber) : 1,
      thumbUrl: poster,
      packageId: d.packageId || "",
      sourceId: d.sourceId || "",
      containerExtension: d.containerExtension || "mp4"
    };
  });

  // Track progress on video players
  function recordProgress(video) {
    if (!video || !Number.isFinite(video.currentTime) || video.currentTime < MIN_WATCH_SECONDS) return;
    var rawDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    var duration = rawDuration > 0 ? rawDuration : Math.max(3600, Math.round(video.currentTime * 2));

    var media = state.currentPlaying;
    if (!isValidMediaEntry(media)) return;

    var percent = duration > 0 ? (video.currentTime / duration) * 100 : 5;
    var id = media.id;

    if (rawDuration > 0 && percent >= MAX_WATCH_PERCENT) {
      removeHistoryItem(id);
      return;
    }

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
      currentTime: Math.round(video.currentTime),
      duration: Math.round(duration),
      progressPercent: Math.min(99, Math.max(1, Math.round(percent || 5))),
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

  
  
  window.__veloraPendingResumeSeek = null;
  function tryApplySeekOnActiveVideo(videoEl) {
    var pending = window.__veloraPendingResumeSeek;
    if (!pending || pending.applied || !pending.targetSeconds || pending.targetSeconds <= 0 || !videoEl) return;
    if (Date.now() - (pending.timestamp || 0) > 40000) {
      window.__veloraPendingResumeSeek = null;
      return;
    }
    // Only seek when video is ACTUALLY playing with buffered frames (readyState >= 3, not paused, currentTime > 0)
    if (videoEl.readyState >= 3 && !videoEl.paused && videoEl.currentTime > 0) {
      pending.applied = true;
      var target = pending.targetSeconds;
      if (Math.abs(videoEl.currentTime - target) > 2) {
        try {
          videoEl.currentTime = target;
          console.info("[Watch History] Auto-resumed playback at", target, "seconds");
        } catch (err) {
          console.warn("[Watch History] Seek error", err);
        }
      }
    }
  }

function bindVideoTrackers() {
    ["video", "video-vod"].forEach(function (id) {
      var video = document.getElementById(id);
      if (!video || video.__veloraResumeTrackerBound) return;
      video.__veloraResumeTrackerBound = true;

      function onTimeUpdate() {
        if (video.paused || video.seeking) return;
        var now = Date.now();
        if (now - state.lastSavedTimestamp < 2000) return;
        state.lastSavedTimestamp = now;
        recordProgress(video);
      }

      function onPause() {
        recordProgress(video);
      }

      video.addEventListener("timeupdate", function () { tryApplySeekOnActiveVideo(video); onTimeUpdate(); }, { passive: true });
      video.addEventListener("playing", function () { tryApplySeekOnActiveVideo(video); }, { passive: true });
      video.addEventListener("canplay", function () { tryApplySeekOnActiveVideo(video); }, { passive: true });
      video.addEventListener("loadedmetadata", function () { tryApplySeekOnActiveVideo(video); }, { passive: true });
      video.addEventListener("pause", onPause, { passive: true });
      video.addEventListener("ended", function () {
        if (state.currentPlaying) {
          removeHistoryItem(state.currentPlaying.id);
        }
      }, { passive: true });
    });
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

      // Wait for series info & episodes to load
      var epAttempts = 0;
      var epTimer = setInterval(function () {
        epAttempts += 1;

        // If season select exists and differs, change season
        var seasonSelect = document.querySelector(".vel-vod-detail__season-select");
        if (seasonSelect && item.seasonNumber) {
          var targetSeasonVal = String(item.seasonNumber);
          if (seasonSelect.value !== targetSeasonVal) {
            seasonSelect.value = targetSeasonVal;
            seasonSelect.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }

        var episodes = Array.from(document.querySelectorAll(".vel-vod-detail__episode"));
        if (episodes.length > 0) {
          var targetEp = episodes.find(function (ep) {
            if (item.episodeStreamId && ep.dataset.episodeStreamId === String(item.episodeStreamId)) return true;
            var badge = ep.querySelector(".vel-vod-detail__episode-badge")?.textContent || "";
            var match = badge.match(/S(d+)E(d+)/i);
            if (match && item.seasonNumber != null && item.episodeNumber != null) {
              return parseInt(match[1], 10) === parseInt(item.seasonNumber, 10) && parseInt(match[2], 10) === parseInt(item.episodeNumber, 10);
            }
            return false;
          });

          if (targetEp) {
            clearInterval(epTimer);
            targetEp.click();
            try {
              targetEp.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
              window.setTimeout(function () {
                targetEp.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
              }, 250);
              window.setTimeout(function () {
                targetEp.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
              }, 700);
            } catch (_) {}
            var video = document.getElementById("video") || document.getElementById("video-vod");
            /* pending seek handled on playing event */
          }
        }

        if (epAttempts >= 50) clearInterval(epTimer);
      }, 150);
    } else {
      var movieEntry = {
        streamId: item.streamId,
        name: item.name,
        thumbUrl: item.thumbUrl,
        sourceId: (item.sourceId && item.sourceId !== "all") ? item.sourceId : "",
        containerExtension: item.containerExtension || "mkv",
        contentType: "movies"
      };

      if (typeof window.veloraOpenCachedHomeItem === "function") {
        window.veloraOpenCachedHomeItem({
          id: "movies",
          content_type: "movies",
          package_id: item.packageId || "vod:all"
        }, movieEntry);
      }

      var mvAttempts = 0;
      var mvClicked = false;
      var mvTimer = setInterval(function () {
        mvAttempts += 1;
        if (mvClicked) {
          clearInterval(mvTimer);
          return;
        }
        var watchBtn = document.querySelector(".vel-vod-detail__watch--film, .vel-vod-detail__watch");
        if (watchBtn && !watchBtn.classList.contains("hidden") && !watchBtn.disabled) {
          mvClicked = true;
          clearInterval(mvTimer);
          window.setTimeout(function () {
            try {
              watchBtn.click();
            } catch (_) {}
          }, 350);
        }
        if (mvAttempts >= 50) clearInterval(mvTimer);
      }, 150);
    }
  };

  window.veloraClearAllWatchHistory = function () {
    try {
      var key = getActiveUserKey();
      localStorage.removeItem(key);
      Object.keys(localStorage).forEach(function(k) {
        if (k.startsWith("velora_resume_")) localStorage.removeItem(k);
      });
    } catch (_) {}
    var token = authToken();
    if (token) {
      fetch("/api/history", {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token }
      }).catch(function () {});
    }
    document.dispatchEvent(new CustomEvent("velora-watch-history-updated"));
    injectResumeSectionDirectly();
  };

  // Render the "Reprendre la lecture" section
  window.veloraRenderResumeSection = function () {
    var items = getLocalHistory();
    if (!items || !items.length) return null;

    var block = document.createElement("section");
    block.className = "vel-home-section vel-home-section--resume";

    var heading = document.createElement("h3");
    heading.className = "vel-home-section__heading";
    heading.textContent = "Reprendre la lecture";

    var rail = document.createElement("div");
    rail.className = "vel-home-section__rail";

    items.forEach(function (item) {
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

      // Card Title Info (Deduplicated clean layout)
      var name = document.createElement("span");
      name.className = "vel-home-section__name";
      var titleStrong = document.createElement("strong");
      titleStrong.textContent = item.name;
      name.appendChild(titleStrong);

      if (isSeries && item.episodeTitle) {
        var epTitle = item.episodeTitle.trim();
        // Avoid duplicating series name if episode title starts with series name
        if (item.name && epTitle.toLowerCase().startsWith(item.name.toLowerCase())) {
          epTitle = epTitle.slice(item.name.length).replace(/^[\s\-–—:]+/, "").trim();
        }
        if (epTitle && epTitle.toLowerCase() !== item.name.toLowerCase()) {
          var sub = document.createElement("small");
          sub.textContent = epTitle;
          name.appendChild(sub);
        }
      }

      card.append(media, centerPlay, badge, name, progressBar);

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
    try {
      Object.keys(localStorage).forEach(function(k) {
        if (k.startsWith("velora_resume_") && !k.startsWith("velora_resume_v13_")) {
          localStorage.removeItem(k);
        }
      });
    } catch (_) {}

    bindVideoTrackers();
    new MutationObserver(bindVideoTrackers).observe(document.documentElement, { childList: true, subtree: true });
    loadHistoryFromDatabase();
    document.addEventListener("velora-user-logged-in", loadHistoryFromDatabase);
    window.addEventListener("pagehide", function () {
      ["video", "video-vod"].forEach(function (id) {
        var video = document.getElementById(id);
        if (video) recordProgress(video);
      });
    });
    window.setTimeout(injectResumeSectionDirectly, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

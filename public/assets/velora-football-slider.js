/**
 * VeloraVIP - Contrôleur du Rail Football sur la Page d'Accueil
 * Affiche les matchs télévisés du jour sous forme de slider horizontal
 * positionné immédiatement sous le rail « Continuer de regarder » (Reprendre).
 * Garantit l'unicité stricte (1 seul slider) et la persistance lors des changements de pays.
 */

(function () {
  'use strict';

  var cachedMatchesByCountry = new Map();
  var isFetching = false;
  var lastInjectedCountry = null;
  var observerAttached = false;
  var injectDebounceTimer = null;
  var isUserTouching = false;
  var touchEndTimer = null;

  function normalizeCountry(c) {
    if (!c) return 'france';
    var s = String(c).toLowerCase().replace(/^country_/, '').replace(/[_\-\s]+/g, ' ').trim();
    
    // Support caractères arabes et termes régionaux MENA
    if (/[\u0600-\u06FF]/.test(s) || /(arabe|arabic|arab|mena|oriental|maghreb|maroc|morocco|algerie|algeria|tunisie|tunisia|egypt|egypte|saudi|saoudite|qatar|emirats|uae|kuwait|koweit|bahrain|oman|iraq|irak|jordan|jordanie|lebanon|liban|libya|libye|sudan|soudan|yemen|syria|syrie|palestine|\b(ar|dz|ma|tn|eg|sa|ae|qa|kw|om|bh|iq|jo|lb|ly|sd|ye|sy)\b)/i.test(s)) {
      return 'mena';
    }
    if (/(uk|gb|gbr|england|angleterre|united kingdom|great britain|royaume uni|royaume-uni|\b(uk|gb)\b)/i.test(s)) return 'uk';
    if (/(spain|espagne|espana|españa|spanish|\b(es|esp)\b)/i.test(s)) return 'spain';
    if (/(usa|us|united states|etats unis|etats-unis|états-unis|america|amerique|amérique|\b(us|usa)\b)/i.test(s)) return 'usa';
    if (/(italy|italie|italia|italian|\b(it|ita)\b)/i.test(s)) return 'italy';
    if (/(germany|allemagne|deutschland|german|\b(de|deu|ger)\b)/i.test(s)) return 'germany';
    if (/(portugal|portugais|portuguese|\b(pt|prt)\b)/i.test(s)) return 'portugal';
    return 'france';
  }

  function detectActiveCountry(hint) {
    try {
      if (hint) {
        var fromHint = normalizeCountry(hint);
        if (fromHint) return fromHint;
      }

      if (typeof window.veloraGetActiveCountryId === 'function') {
        var acid = window.veloraGetActiveCountryId();
        if (acid) return normalizeCountry(acid);
      }

      if (typeof window.veloraGetActiveCountry === 'function') {
        var cObj = window.veloraGetActiveCountry();
        if (cObj && cObj.name) return normalizeCountry(cObj.name);
      }

      var countrySelect = document.getElementById('country-select') || document.getElementById('home-country-select');
      if (countrySelect) {
        if (countrySelect.value) return normalizeCountry(countrySelect.value);
        if (countrySelect.selectedOptions && countrySelect.selectedOptions[0]) {
          return normalizeCountry(countrySelect.selectedOptions[0].textContent);
        }
      }

      var savedId = localStorage.getItem('lumina_selected_country_id') || sessionStorage.getItem('lumina_selected_country_id');
      if (savedId) return normalizeCountry(savedId);

      var savedName = localStorage.getItem('velora_selected_country_name_v1') || sessionStorage.getItem('velora_selected_country_name_v1');
      if (savedName) return normalizeCountry(savedName);

      var params = new URLSearchParams(window.location.search);
      var q = params.get('country');
      if (q) return normalizeCountry(q);
    } catch (_) {}

    return 'france';
  }

  function getSectionTitles() {
    return { title: 'Football aujourd\'hui', seeMore: 'Tout voir' };
  }

  async function fetchTodayMatches(country, forceRefresh) {
    if (!forceRefresh && cachedMatchesByCountry.has(country)) {
      var entry = cachedMatchesByCountry.get(country);
      if (entry && entry.expiresAt > Date.now()) {
        return entry.matches;
      }
    }

    try {
      isFetching = true;
      var url = '/api/matches/today?country=' + encodeURIComponent(country) + (forceRefresh ? '&refresh=1' : '');
      var res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      var list = Array.isArray(data) ? data : [];
      cachedMatchesByCountry.set(country, {
        matches: list,
        expiresAt: Date.now() + (30 * 60 * 1000)
      });
      return list;
    } catch (err) {
      console.warn('[Velora Football Home Slider] Échec du chargement:', err.message);
      return [];
    } finally {
      isFetching = false;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showFootballToast(message, type, autoDismissMs) {
    var toast = document.getElementById('vel-football-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'vel-football-toast';
      toast.className = 'vel-football-toast';
      document.body.appendChild(toast);
    }

    var iconHtml = type === 'loading'
      ? '<div class="vel-football-toast__spinner"></div>'
      : type === 'warning'
        ? '<span class="vel-football-toast__icon">⚠️</span>'
        : type === 'error'
          ? '<span class="vel-football-toast__icon">❌</span>'
          : '<span class="vel-football-toast__icon">⚽</span>';

    toast.innerHTML = iconHtml + '<span class="vel-football-toast__msg">' + escapeHtml(message) + '</span>';
    toast.className = 'vel-football-toast vel-football-toast--visible vel-football-toast--' + (type || 'info');

    if (window.__velFootToastTimer) {
      clearTimeout(window.__velFootToastTimer);
      window.__velFootToastTimer = null;
    }

    if (autoDismissMs) {
      window.__velFootToastTimer = setTimeout(function () {
        hideFootballToast();
      }, autoDismissMs);
    }
  }

  function hideFootballToast() {
    var toast = document.getElementById('vel-football-toast');
    if (toast) {
      toast.classList.remove('vel-football-toast--visible');
      setTimeout(function () {
        if (!toast.classList.contains('vel-football-toast--visible')) {
          toast.remove();
        }
      }, 300);
    }
  }

  function normalizeChannelText(str) {
    if (!str) return '';
    return String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\b(fhd|uhd|4k|hd|sd|hevc|h265|h264|50fps|60fps|1080p|720p|vip|raw|premium|multi-canal|multisports|bar)\b/gi, ' ')
      .replace(/[|+_\-\[\]():.#/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function scoreChannelMatch(stream, targetChannelName) {
    if (!stream || !stream.name || !targetChannelName) return 0;
    
    var sNorm = normalizeChannelText(stream.name);
    var tNorm = normalizeChannelText(targetChannelName);
    if (!sNorm || !tNorm) return 0;

    var sClean = sNorm.replace(/^(fr|ar|uk|gb|es|it|de|pt|us|mena|arab|arabic)\s+/, '').trim();
    var tClean = tNorm.replace(/^(fr|ar|uk|gb|es|it|de|pt|us|mena|arab|arabic)\s+/, '').trim();

    if (sClean === tClean) return 100;

    var tNumbers = tClean.match(/\b\d+\b/g) || [];
    var sNumbers = sClean.match(/\b\d+\b/g) || [];

    if (tNumbers.length > 0) {
      for (var i = 0; i < tNumbers.length; i++) {
        if (!sNumbers.includes(tNumbers[i])) {
          return 0; // Mauvais numéro de chaîne (ex: beIN 1 vs beIN 2)
        }
      }
    }

    var tTokens = tClean.split(' ').filter(function (t) { return t.length > 1 || /\d/.test(t); });
    var sTokens = sClean.split(' ').filter(function (t) { return t.length > 1 || /\d/.test(t); });
    if (tTokens.length === 0) return 0;

    var matchCount = 0;
    for (var j = 0; j < tTokens.length; j++) {
      var tok = tTokens[j];
      if (sTokens.includes(tok) || sClean.includes(tok)) {
        matchCount++;
      }
    }

    if (matchCount === tTokens.length) {
      if (sClean.includes(tClean) || tClean.includes(sClean)) {
        return 95;
      }
      return 85;
    }

    if (matchCount >= 2 && matchCount >= tTokens.length - 1) {
      return 60 + matchCount * 5;
    }

    return 0;
  }

  async function searchBroadcastingChannels(match, priorityChannel) {
    var targetChannels = Array.isArray(match.tvChannels) ? match.tvChannels.slice() : [];
    if (priorityChannel) {
      targetChannels = [priorityChannel].concat(targetChannels.filter(function (c) { return c !== priorityChannel; }));
    }

    var foundStreamsMap = new Map();
    var state = (typeof window.veloraGetState === 'function') ? window.veloraGetState() : null;
    var countryId = (typeof window.veloraGetActiveCountryId === 'function') ? window.veloraGetActiveCountryId() : null;

    // 1. Recherche dans les chaînes déjà chargées du pays actif
    if (state && state.streamsByCatAll) {
      var candidatePackages = [];
      if (window.Pe && Array.isArray(window.Pe.packages)) {
        candidatePackages = window.Pe.packages.filter(function (p) {
          return !countryId || p.country_id === countryId || (typeof window.xo === 'function' && window.xo(p.country_id, countryId, window.Pe));
        });
      }

      var localStreams = [];
      if (candidatePackages.length > 0) {
        candidatePackages.forEach(function (pkg) {
          var streams = state.streamsByCatAll.get(String(pkg.id));
          if (Array.isArray(streams)) {
            localStreams.push.apply(localStreams, streams);
          }
        });
      }

      if (localStreams.length === 0) {
        state.streamsByCatAll.forEach(function (streams) {
          if (Array.isArray(streams)) {
            localStreams.push.apply(localStreams, streams);
          }
        });
      }

      targetChannels.forEach(function (tvCh) {
        localStreams.forEach(function (st) {
          var score = scoreChannelMatch(st, tvCh);
          if (score >= 60) {
            var sid = String(st.stream_id || st.id);
            var existing = foundStreamsMap.get(sid);
            if (!existing || existing.score < score) {
              foundStreamsMap.set(sid, { stream: st, score: score, matchedChannel: tvCh });
            }
          }
        });
      });
    }

    // 2. Recherche via l'API de recherche du pays (VPS / Nodecast)
    if (typeof window.veloraSearchCountryContent === 'function') {
      for (var i = 0; i < targetChannels.length; i++) {
        var chQuery = targetChannels[i];
        if (!chQuery || chQuery.length < 2 || chQuery === 'Chaîne à confirmer') continue;
        try {
          var searchRes = await window.veloraSearchCountryContent(chQuery);
          var liveItems = (searchRes && Array.isArray(searchRes.live)) ? searchRes.live :
                          (searchRes && Array.isArray(searchRes.results)) ? searchRes.results.filter(function (r) { return r && (r.type === 'channel' || r.type === 'live'); }) : [];

          liveItems.forEach(function (item) {
            var stObj = item.item || item;
            var score = scoreChannelMatch(stObj, chQuery);
            if (score >= 60) {
              var sid = String(stObj.stream_id || stObj.id || item.stream_id || item.streamId);
              var existing = foundStreamsMap.get(sid);
              if (!existing || existing.score < score) {
                foundStreamsMap.set(sid, { stream: stObj, score: score, matchedChannel: chQuery });
              }
            }
          });
        } catch (_) {}
      }
    }

    // 3. Si aucune chaîne spécifique n'est trouvée, recherche par équipes du match (ex: chaînes EVENT)
    if (foundStreamsMap.size === 0 && (match.homeTeam?.name || match.awayTeam?.name)) {
      var queryTeams = [match.homeTeam?.name, match.awayTeam?.name].filter(Boolean);
      for (var k = 0; k < queryTeams.length; k++) {
        try {
          var tRes = await window.veloraSearchCountryContent(queryTeams[k]);
          var tLive = (tRes && Array.isArray(tRes.live)) ? tRes.live : [];
          tLive.forEach(function (item) {
            var stObj = item.item || item;
            var sid = String(stObj.stream_id || stObj.id || item.stream_id);
            if (!foundStreamsMap.has(sid)) {
              foundStreamsMap.set(sid, { stream: stObj, score: 70, matchedChannel: queryTeams[k] });
            }
          });
        } catch (_) {}
      }
    }

    var sortedEntries = Array.from(foundStreamsMap.values()).sort(function (a, b) {
      return b.score - a.score;
    });

    return sortedEntries.map(function (e) { return e.stream; });
  }

  function removeMatchBanner() {
    var ex = document.getElementById('vel-live-match-banner');
    if (ex) ex.remove();
  }

  function renderMatchBanner(match) {
    removeMatchBanner();
    if (!match) return;

    var contentView = document.getElementById('content-view');
    var dynamicList = document.getElementById('dynamic-list');
    if (!contentView) return;

    var homeName = match.homeTeam?.name || 'Équipe 1';
    var awayName = match.awayTeam?.name || 'Équipe 2';
    var homeInitial = homeName.charAt(0).toUpperCase();
    var awayInitial = awayName.charAt(0).toUpperCase();
    var timeInfo = getMatchTimeDetails(match.time);

    var timeBadgeHtml = '';
    if (timeInfo.status === 'live') {
      timeBadgeHtml = '<span class="vel-football-card__time-badge vel-football-card__time-badge--live">' +
        '<span class="vel-football-card__live-dot"></span>' +
        '<span>EN DIRECT</span>' +
      '</span>';
    } else if (timeInfo.status === 'starting_soon') {
      timeBadgeHtml = '<span class="vel-football-card__time-badge vel-football-card__time-badge--starting-soon">' +
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' +
        '<span>' + escapeHtml(match.time || '--:--') + '</span>' +
      '</span>';
    } else {
      timeBadgeHtml = '<span class="vel-football-card__time-badge">' +
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' +
        '<span>' + escapeHtml(match.time || '--:--') + '</span>' +
      '</span>';
    }

    var banner = document.createElement('div');
    banner.id = 'vel-live-match-banner';
    banner.className = 'vel-live-match-banner';
    banner.innerHTML =
      '<div class="vel-match-banner-comp-wrap">' +
        '<span class="vel-match-banner-comp">' + escapeHtml(match.competition || 'Football') + '</span>' +
        timeBadgeHtml +
      '</div>' +
      '<div class="vel-match-banner-teams">' +
        '<div class="vel-match-banner-team vel-match-banner-team--home">' +
          '<div class="vel-match-banner-logo-wrap">' +
            '<img class="vel-match-banner-logo" src="' + escapeHtml(match.homeTeam?.logoUrl || '') + '" alt="' + escapeHtml(homeName) + '" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML=\'<span class=\\\'vel-match-banner-fallback-logo\\\'>' + homeInitial + '</span>\'">' +
          '</div>' +
          '<span class="vel-match-banner-team-name">' + escapeHtml(homeName) + '</span>' +
        '</div>' +
        '<div class="vel-match-banner-vs-wrap">' +
          '<span class="vel-match-banner-vs">VS</span>' +
        '</div>' +
        '<div class="vel-match-banner-team vel-match-banner-team--away">' +
          '<div class="vel-match-banner-logo-wrap">' +
            '<img class="vel-match-banner-logo" src="' + escapeHtml(match.awayTeam?.logoUrl || '') + '" alt="' + escapeHtml(awayName) + '" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML=\'<span class=\\\'vel-match-banner-fallback-logo\\\'>' + awayInitial + '</span>\'">' +
          '</div>' +
          '<span class="vel-match-banner-team-name">' + escapeHtml(awayName) + '</span>' +
        '</div>' +
      '</div>';

    if (dynamicList && dynamicList.parentNode === contentView) {
      contentView.insertBefore(banner, dynamicList);
    } else {
      contentView.prepend(banner);
    }
  }

  window.veloraOpenMatchChannels = async function (match, priorityChannel) {
    if (!match) return;
    var homeName = match.homeTeam?.name || '';
    var awayName = match.awayTeam?.name || '';
    var matchTitle = (homeName && awayName) ? (homeName + ' vs ' + awayName) : (homeName || awayName || 'Match de Football');
    var comp = match.competition || '';
    var displayTitle = comp ? (matchTitle + ' • ' + comp) : matchTitle;

    showFootballToast('Recherche des chaînes pour ' + matchTitle + '…', 'loading');

    // Attente si le catalogue n'est pas encore initialisé
    if (typeof window.veloraHomeCatalogReady === 'function' && !window.veloraHomeCatalogReady()) {
      showFootballToast('Connexion au catalogue TV…', 'loading');
      var maxWait = 15;
      while (maxWait > 0 && typeof window.veloraHomeCatalogReady === 'function' && !window.veloraHomeCatalogReady()) {
        await new Promise(function (r) { setTimeout(r, 400); });
        maxWait--;
      }
    }

    try {
      var matchingChannels = await searchBroadcastingChannels(match, priorityChannel);
      if (matchingChannels && matchingChannels.length > 0) {
        hideFootballToast();
        if (typeof window.veloraOpenSearchChannelItem === 'function') {
          var ok = await window.veloraOpenSearchChannelItem(matchingChannels[0], matchingChannels, displayTitle);
          if (ok) {
            renderMatchBanner(match);
            return;
          }
        }
        if (typeof window.veloraPlayLiveChannel === 'function') {
          window.veloraPlayLiveChannel(matchingChannels[0]);
          renderMatchBanner(match);
          return;
        }
      } else {
        var plannedChs = (Array.isArray(match.tvChannels) && match.tvChannels.length > 0)
          ? match.tvChannels.join(', ')
          : 'non renseignées';
        showFootballToast('Aucune chaîne disponible dans votre bouquet pour « ' + matchTitle + ' » (Chaînes prévues : ' + plannedChs + ')', 'warning', 4500);
      }
    } catch (err) {
      console.error('[Velora Football] Erreur recherche chaînes:', err);
      showFootballToast('Erreur lors de la recherche des chaînes', 'error', 3000);
    }
  };

  function getMatchTimeDetails(matchTimeStr) {
    if (!matchTimeStr) return { diffMinutes: 9999, status: 'upcoming', formattedTime: '--:--' };

    var cleaned = String(matchTimeStr).trim().replace(/[hH.]/, ':');
    var parts = cleaned.match(/(\d{1,2})\s*:\s*(\d{2})/);
    if (!parts) return { diffMinutes: 9999, status: 'upcoming', formattedTime: matchTimeStr };

    var hours = parseInt(parts[1], 10);
    var minutes = parseInt(parts[2], 10);

    var now = new Date();
    var matchDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);

    var diffMs = matchDate.getTime() - now.getTime();
    var diffMinutes = Math.round(diffMs / 60000);

    // Live: started within last 115 minutes (diffMinutes between -115 and 0)
    // Starting soon: starts in <= 30 mins and not started yet (diffMinutes between 0 and 30)
    // Finished: started > 115 minutes ago (diffMinutes < -115)
    // Upcoming: starts in > 30 minutes
    if (diffMinutes < -115) {
      return { diffMinutes: diffMinutes, status: 'finished', formattedTime: matchTimeStr };
    } else if (diffMinutes <= 0) {
      return { diffMinutes: diffMinutes, status: 'live', formattedTime: matchTimeStr };
    } else if (diffMinutes <= 30) {
      return { diffMinutes: diffMinutes, status: 'starting_soon', formattedTime: matchTimeStr };
    } else {
      return { diffMinutes: diffMinutes, status: 'upcoming', formattedTime: matchTimeStr };
    }
  }

  function sortFootballMatches(matches) {
    if (!Array.isArray(matches)) return [];

    var mapped = matches.map(function (m, idx) {
      return {
        match: m,
        originalIndex: idx,
        timeInfo: getMatchTimeDetails(m.time)
      };
    });

    mapped.sort(function (a, b) {
      var rankMap = { live: 0, starting_soon: 1, upcoming: 2, finished: 3 };
      var aRank = rankMap[a.timeInfo.status] != null ? rankMap[a.timeInfo.status] : 2;
      var bRank = rankMap[b.timeInfo.status] != null ? rankMap[b.timeInfo.status] : 2;

      if (aRank !== bRank) {
        return aRank - bRank;
      }

      // Within each status group (especially upcoming >30min), strictly preserve our ranking system order
      return a.originalIndex - b.originalIndex;
    });

    return mapped.map(function (item) {
      return item.match;
    });
  }

  function createFootballMatchCard(match) {
    var card = document.createElement('div');
    card.className = 'vel-football-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');

    var timeInfo = getMatchTimeDetails(match.time);
    var timeBadgeHtml = '';

    if (timeInfo.status === 'live') {
      card.classList.add('is-live');
      card.setAttribute('aria-label', (match.homeTeam?.name || '') + ' vs ' + (match.awayTeam?.name || '') + ' - EN DIRECT (' + (match.time || '') + ')');
      timeBadgeHtml = '<span class="vel-football-card__time-badge vel-football-card__time-badge--live">' +
        '<span class="vel-football-card__live-dot"></span>' +
        '<span>EN DIRECT</span>' +
      '</span>';
    } else if (timeInfo.status === 'starting_soon') {
      card.classList.add('is-starting-soon');
      card.setAttribute('aria-label', (match.homeTeam?.name || '') + ' vs ' + (match.awayTeam?.name || '') + ' à ' + (match.time || '') + ' (Bientôt)');
      timeBadgeHtml = '<span class="vel-football-card__time-badge vel-football-card__time-badge--starting-soon">' +
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' +
        '<span>' + escapeHtml(match.time || '--:--') + '</span>' +
      '</span>';
    } else if (timeInfo.status === 'finished') {
      card.classList.add('is-finished');
      card.setAttribute('aria-label', (match.homeTeam?.name || '') + ' vs ' + (match.awayTeam?.name || '') + ' (Terminé)');
      timeBadgeHtml = '<span class="vel-football-card__time-badge vel-football-card__time-badge--finished">' +
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' +
        '<span>' + escapeHtml(match.time || '--:--') + '</span>' +
      '</span>';
    } else {
      card.setAttribute('aria-label', (match.homeTeam?.name || '') + ' vs ' + (match.awayTeam?.name || '') + ' à ' + (match.time || ''));
      timeBadgeHtml = '<span class="vel-football-card__time-badge">' +
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' +
        '<span>' + escapeHtml(match.time || '--:--') + '</span>' +
      '</span>';
    }

    var homeInitial = (match.homeTeam?.name || 'H').charAt(0).toUpperCase();
    var awayInitial = (match.awayTeam?.name || 'A').charAt(0).toUpperCase();

    card.innerHTML =
      '<div class="vel-football-card__top">' +
        '<span class="vel-football-card__comp">' + escapeHtml(match.competition || 'Football') + '</span>' +
        timeBadgeHtml +
      '</div>' +
      '<div class="vel-football-card__match">' +
        '<div class="vel-football-card__team">' +
          '<div class="vel-football-card__logo-wrap">' +
            '<img class="vel-football-card__logo" src="' + escapeHtml(match.homeTeam?.logoUrl || '') + '" alt="' + escapeHtml(match.homeTeam?.name || '') + '" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML=\'<span class=\\\'vel-football-card__fallback-logo\\\'>' + homeInitial + '</span>\'">' +
          '</div>' +
          '<span class="vel-football-card__team-name">' + escapeHtml(match.homeTeam?.name || '') + '</span>' +
        '</div>' +
        '<span class="vel-football-card__vs">VS</span>' +
        '<div class="vel-football-card__team">' +
          '<div class="vel-football-card__logo-wrap">' +
            '<img class="vel-football-card__logo" src="' + escapeHtml(match.awayTeam?.logoUrl || '') + '" alt="' + escapeHtml(match.awayTeam?.name || '') + '" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML=\'<span class=\\\'vel-football-card__fallback-logo\\\'>' + awayInitial + '</span>\'">' +
          '</div>' +
          '<span class="vel-football-card__team-name">' + escapeHtml(match.awayTeam?.name || '') + '</span>' +
        '</div>' +
      '</div>';

    function showMatchNoticeModal(matchObj, timeStatusInfo) {
      var existing = document.getElementById('vel-football-notice-modal');
      if (existing) existing.remove();

      if (!matchObj) return;
      timeStatusInfo = timeStatusInfo || getMatchTimeDetails(matchObj.time);

      var homeName = matchObj.homeTeam?.name || 'Équipe 1';
      var awayName = matchObj.awayTeam?.name || 'Équipe 2';
      var homeInitial = homeName.charAt(0).toUpperCase();
      var awayInitial = awayName.charAt(0).toUpperCase();

      var isFinished = timeStatusInfo.status === 'finished';
      var diffMinutes = Math.max(0, timeStatusInfo.diffMinutes);
      var hours = Math.floor(diffMinutes / 60);
      var mins = diffMinutes % 60;
      var timeRemainingStr = hours > 0
        ? (hours + 'h' + (mins > 0 ? (mins < 10 ? '0' : '') + mins : ''))
        : (mins + ' min');

      var channels = Array.isArray(matchObj.tvChannels) && matchObj.tvChannels.length > 0
        ? matchObj.tvChannels
        : ['Chaîne à confirmer'];

      var channelsHtml = channels.map(function (ch) {
        return '<span class="vel-match-modal-ch-pill">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>' +
          '<span>' + escapeHtml(ch) + '</span>' +
        '</span>';
      }).join('');

      var modal = document.createElement('div');
      modal.id = 'vel-football-notice-modal';
      modal.className = 'vel-football-notice-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');

      var noticeText = isFinished
        ? 'Ce match est <strong>déjà terminé</strong> (coup d\'envoi était à ' + escapeHtml(matchObj.time || '') + ').'
        : 'Ce match <strong>n\'a pas encore commencé</strong>.<br>Coup d\'envoi prévu à <strong>' + escapeHtml(matchObj.time || '--:--') + '</strong> (dans <strong>' + timeRemainingStr + '</strong>).';

      var noticeIcon = isFinished ? '🏁' : '⏳';

      modal.innerHTML =
        '<div class="vel-football-modal-backdrop"></div>' +
        '<div class="vel-football-modal-box">' +
          '<button type="button" class="vel-football-modal-close" aria-label="Fermer">✕</button>' +
          '<div class="vel-football-modal-header">' +
            '<span class="vel-football-modal-comp">' + escapeHtml(matchObj.competition || 'Football') + '</span>' +
            '<span class="vel-football-modal-time">' + escapeHtml(matchObj.time || '--:--') + '</span>' +
          '</div>' +
          '<div class="vel-football-modal-teams">' +
            '<div class="vel-football-modal-team">' +
              '<div class="vel-football-modal-logo-wrap">' +
                '<img class="vel-football-modal-logo" src="' + escapeHtml(matchObj.homeTeam?.logoUrl || '') + '" alt="' + escapeHtml(homeName) + '" onerror="this.onerror=null; this.parentElement.innerHTML=\'<span class=\\\'vel-football-modal-fallback-logo\\\'>' + homeInitial + '</span>\'">' +
              '</div>' +
              '<span class="vel-football-modal-team-name">' + escapeHtml(homeName) + '</span>' +
            '</div>' +
            '<span class="vel-football-modal-vs">VS</span>' +
            '<div class="vel-football-modal-team">' +
              '<div class="vel-football-modal-logo-wrap">' +
                '<img class="vel-football-modal-logo" src="' + escapeHtml(matchObj.awayTeam?.logoUrl || '') + '" alt="' + escapeHtml(awayName) + '" onerror="this.onerror=null; this.parentElement.innerHTML=\'<span class=\\\'vel-football-modal-fallback-logo\\\'>' + awayInitial + '</span>\'">' +
              '</div>' +
              '<span class="vel-football-modal-team-name">' + escapeHtml(awayName) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="vel-football-modal-notice ' + (isFinished ? 'is-finished' : '') + '">' +
            '<span class="vel-football-modal-notice-icon">' + noticeIcon + '</span>' +
            '<div class="vel-football-modal-notice-text">' + noticeText + '</div>' +
          '</div>' +
          '<div class="vel-football-modal-channels-section">' +
            '<div class="vel-football-modal-channels-title">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>' +
              '<span>Diffusion TV prévue :</span>' +
            '</div>' +
            '<div class="vel-football-modal-channels-grid">' +
              channelsHtml +
            '</div>' +
          '</div>' +
        '</div>';

      function closeModal() {
        modal.classList.add('is-closing');
        setTimeout(function () {
          modal.remove();
        }, 200);
      }

      var closeBtn = modal.querySelector('.vel-football-modal-close');
      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      var backdrop = modal.querySelector('.vel-football-modal-backdrop');
      if (backdrop) backdrop.addEventListener('click', closeModal);

      document.body.appendChild(modal);
    }

    function handleCardAction(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      var tInfo = getMatchTimeDetails(match.time);
      if (tInfo.status === 'upcoming' || tInfo.status === 'finished') {
        showMatchNoticeModal(match, tInfo);
      } else {
        if (typeof window.veloraOpenMatchChannels === 'function') {
          window.veloraOpenMatchChannels(match);
        } else {
          window.location.href = '/foot';
        }
      }
    }

    card.addEventListener('click', handleCardAction);
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        handleCardAction(e);
      }
    });

    return card;
  }

  function renderFootballSection(matches, country) {
    if (!Array.isArray(matches) || matches.length === 0) return null;

    var sortedMatches = sortFootballMatches(matches);

    var block = document.createElement('div');
    block.className = 'UI3iHJ vel-home-section vel-home-section--football vel-home-section--horizontal vel-home-section--compact';
    block.dataset.testid = 'navigation-carousel-wrapper';
    block.dataset.sectionId = 'velora-home-football-matches';
    block.dataset.footballCountry = country;

    var railWrap = document.createElement('div');
    railWrap.className = 'vJYTdI LiEb2X UEOrk2 CHGlLt OH_E2I vel-home-section__rail-wrap';
    var rail = document.createElement('div');
    rail.className = 'lw1NJZ vel-home-section__rail';
    rail.dataset.testid = 'card-container-list';

    // Suivi tactile pour éviter les re-renders pendant le scroll mobile
    rail.addEventListener('touchstart', function () {
      isUserTouching = true;
      if (touchEndTimer) clearTimeout(touchEndTimer);
    }, { passive: true });

    rail.addEventListener('touchend', function () {
      if (touchEndTimer) clearTimeout(touchEndTimer);
      touchEndTimer = setTimeout(function () {
        isUserTouching = false;
      }, 1000);
    }, { passive: true });

    rail.addEventListener('touchcancel', function () {
      isUserTouching = false;
    }, { passive: true });

    sortedMatches.forEach(function (m) {
      var card = createFootballMatchCard(m);
      rail.appendChild(card);
    });

    railWrap.appendChild(rail);
    block.appendChild(railWrap);

    return block;
  }

  function cleanupDuplicateFootballs(root) {
    if (!root) return;
    var all = Array.from(root.querySelectorAll('.vel-home-section--football'));
    while (all.length > 1) {
      var extra = all.pop();
      extra.remove();
    }
  }

  async function injectFootballSectionDirectly(hintCountry) {
    if (isUserTouching) {
      scheduleInjection(400, hintCountry);
      return;
    }

    var root = document.getElementById('vel-home-sections');
    if (!root) return;

    cleanupDuplicateFootballs(root);

    var country = detectActiveCountry(hintCountry);
    var existingFootball = root.querySelector('.vel-home-section--football');

    // Si la section existe déjà avec le BON pays et du contenu, vérifier uniquement sa position
    if (existingFootball && existingFootball.dataset.footballCountry === country && existingFootball.querySelectorAll('.vel-football-card').length > 0) {
      var resumeSec = root.querySelector('.vel-home-section--resume');
      if (resumeSec && resumeSec.parentNode === root && existingFootball.previousElementSibling !== resumeSec) {
        resumeSec.insertAdjacentElement('afterend', existingFootball);
      }
      lastInjectedCountry = country;
      return;
    }

    var matches = await fetchTodayMatches(country);
    if (!matches || matches.length === 0) {
      if (existingFootball) existingFootball.remove();
      return;
    }

    var block = renderFootballSection(matches, country);
    if (!block) return;

    // Supprimer tous les éventuels doublons avant d'insérer l'unique rail
    var currentFootballs = Array.from(root.querySelectorAll('.vel-home-section--football'));
    if (currentFootballs.length > 0) {
      var first = currentFootballs[0];
      for (var i = 1; i < currentFootballs.length; i++) {
        currentFootballs[i].remove();
      }
      var oldRail = first.querySelector('.vel-home-section__rail');
      var oldScroll = (oldRail && Number.isFinite(oldRail.scrollLeft)) ? oldRail.scrollLeft : 0;
      first.replaceWith(block);
      if (oldScroll > 0) {
        var newRail = block.querySelector('.vel-home-section__rail');
        if (newRail) newRail.scrollLeft = oldScroll;
      }
    } else {
      var resumeSection = root.querySelector('.vel-home-section--resume');
      if (resumeSection && resumeSection.parentNode === root) {
        resumeSection.insertAdjacentElement('afterend', block);
      } else {
        root.prepend(block);
      }
    }

    lastInjectedCountry = country;
  }

  function scheduleInjection(delay, hintCountry) {
    if (injectDebounceTimer) clearTimeout(injectDebounceTimer);
    injectDebounceTimer = setTimeout(function () {
      injectFootballSectionDirectly(hintCountry);
    }, delay || 50);
  }

  window.veloraRenderFootballSectionDirect = function (hintCountry) {
    var country = detectActiveCountry(hintCountry);
    if (cachedMatchesByCountry.has(country)) {
      var entry = cachedMatchesByCountry.get(country);
      if (entry && Array.isArray(entry.matches) && entry.matches.length > 0) {
        lastInjectedCountry = country;
        return renderFootballSection(entry.matches, country);
      }
    }
    // Lance le fetch en tâche de fond pour l'injection suivante
    fetchTodayMatches(country).then(function (matches) {
      if (matches && matches.length > 0) {
        scheduleInjection(20, country);
      }
    });
    return null;
  };

  window.veloraInjectFootballSection = function (hintCountry) {
    scheduleInjection(20, hintCountry);
  };

  function attachRootObserver() {
    if (observerAttached) return;
    var root = document.getElementById('vel-home-sections');
    if (!root) return;

    observerAttached = true;
    var observer = new MutationObserver(function () {
      cleanupDuplicateFootballs(root);
      if (root.children.length > 0 && !root.querySelector('.vel-home-section--football')) {
        scheduleInjection(80);
      }
    });

    observer.observe(root, { childList: true });
  }

  function handleCountrySwitchEvent(e) {
    var hint = e?.detail?.countryId || e?.detail?.countryName || e?.detail?.country || (e?.target && e.target.value);
    scheduleInjection(40, hint);
  }

  function injectFootballToastStyles() {
    if (document.getElementById('vel-football-toast-styles')) return;
    var st = document.createElement('style');
    st.id = 'vel-football-toast-styles';
    st.textContent = [
      '.vel-football-toast {',
      '  position: fixed;',
      '  bottom: 2rem;',
      '  left: 50%;',
      '  transform: translateX(-50%) translateY(30px);',
      '  background: rgba(15, 23, 42, 0.94);',
      '  backdrop-filter: blur(16px);',
      '  -webkit-backdrop-filter: blur(16px);',
      '  border: 1px solid rgba(59, 130, 246, 0.4);',
      '  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7), 0 0 20px rgba(59, 130, 246, 0.25);',
      '  color: #ffffff;',
      '  padding: 0.75rem 1.4rem;',
      '  border-radius: 9999px;',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 0.75rem;',
      '  font-size: 0.92rem;',
      '  font-weight: 500;',
      '  z-index: 2147483647;',
      '  opacity: 0;',
      '  pointer-events: none;',
      '  transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);',
      '  max-width: 90vw;',
      '  text-align: center;',
      '}',
      '.vel-football-toast--visible {',
      '  opacity: 1;',
      '  pointer-events: auto;',
      '  transform: translateX(-50%) translateY(0);',
      '}',
      '.vel-football-toast--warning {',
      '  border-color: rgba(245, 158, 11, 0.55);',
      '  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7), 0 0 20px rgba(245, 158, 11, 0.25);',
      '}',
      '.vel-football-toast--error {',
      '  border-color: rgba(239, 68, 68, 0.55);',
      '  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7), 0 0 20px rgba(239, 68, 68, 0.25);',
      '}',
      '.vel-football-toast__spinner {',
      '  width: 16px;',
      '  height: 16px;',
      '  border: 2px solid rgba(255, 255, 255, 0.2);',
      '  border-top-color: #38bdf8;',
      '  border-radius: 50%;',
      '  animation: velFootSpin 0.7s linear infinite;',
      '}',
      '@keyframes velFootSpin {',
      '  to { transform: rotate(360deg); }',
      '}',
      '/* Live & Starting Soon Badges */',
      '.vel-football-card__time-badge--starting-soon {',
      '  color: #4ade80 !important;',
      '  background: rgba(34, 197, 94, 0.18) !important;',
      '  border: 1px solid rgba(34, 197, 94, 0.48) !important;',
      '  box-shadow: 0 0 10px rgba(34, 197, 94, 0.28), 0 2px 6px rgba(0, 0, 0, 0.3) !important;',
      '}',
      '.vel-football-card__time-badge--starting-soon svg {',
      '  stroke: #4ade80 !important;',
      '}',
      '.vel-football-card__time-badge--live {',
      '  color: #ffffff !important;',
      '  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;',
      '  border: 1px solid rgba(255, 120, 120, 0.6) !important;',
      '  box-shadow: 0 0 14px rgba(239, 68, 68, 0.55), 0 2px 6px rgba(0, 0, 0, 0.4) !important;',
      '  font-weight: 800 !important;',
      '  letter-spacing: 0.05em !important;',
      '}',
      '.vel-football-card__live-dot {',
      '  width: 6px;',
      '  height: 6px;',
      '  border-radius: 50%;',
      '  background: #ffffff;',
      '  box-shadow: 0 0 6px #ffffff;',
      '  display: inline-block;',
      '  animation: velFootLivePulse 1.1s ease-in-out infinite alternate;',
      '}',
      '@keyframes velFootLivePulse {',
      '  0% { opacity: 0.45; transform: scale(0.85); }',
      '  100% { opacity: 1; transform: scale(1.25); box-shadow: 0 0 10px #ffffff; }',
      '}',
      '.vel-football-card.is-live {',
      '  border-color: rgba(239, 68, 68, 0.45) !important;',
      '  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5), 0 0 15px rgba(239, 68, 68, 0.18) !important;',
      '}',
      '.vel-football-card.is-starting-soon {',
      '  border-color: rgba(34, 197, 94, 0.35) !important;',
      '  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5), 0 0 12px rgba(34, 197, 94, 0.12) !important;',
      '}',
      '.vel-football-card__time-badge--finished {',
      '  color: #94a3b8 !important;',
      '  background: rgba(148, 163, 184, 0.1) !important;',
      '  border: 1px solid rgba(148, 163, 184, 0.2) !important;',
      '  box-shadow: none !important;',
      '  opacity: 0.8;',
      '}',
      '/* Live Match Header Banner Under Player */',
      '.vel-live-match-banner {',
      '  width: 100%;',
      '  max-width: 640px;',
      '  margin: 0.65rem auto 1rem auto;',
      '  padding: 0.85rem 1.4rem;',
      '  border-radius: 16px;',
      '  background: linear-gradient(135deg, rgba(15, 23, 42, 0.92) 0%, rgba(13, 12, 20, 0.96) 100%);',
      '  border: 1px solid rgba(255, 255, 255, 0.12);',
      '  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1);',
      '  backdrop-filter: blur(16px);',
      '  -webkit-backdrop-filter: blur(16px);',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  gap: 0.6rem;',
      '  box-sizing: border-box;',
      '  animation: velMatchBannerFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);',
      '}',
      '@keyframes velMatchBannerFadeIn {',
      '  from { opacity: 0; transform: translateY(-8px) scale(0.98); }',
      '  to { opacity: 1; transform: translateY(0) scale(1); }',
      '}',
      '.vel-match-banner-comp-wrap {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  gap: 0.65rem;',
      '  width: 100%;',
      '}',
      '.vel-match-banner-comp {',
      '  font-size: 0.74rem;',
      '  font-weight: 800;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.06em;',
      '  color: #93c5fd;',
      '  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);',
      '}',
      '.vel-match-banner-teams {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: space-between;',
      '  width: 100%;',
      '  gap: 0.8rem;',
      '}',
      '.vel-match-banner-team {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  flex: 1;',
      '  min-width: 0;',
      '  gap: 0.35rem;',
      '  text-align: center;',
      '}',
      '.vel-match-banner-logo-wrap {',
      '  width: 58px;',
      '  height: 58px;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '}',
      '.vel-match-banner-logo {',
      '  max-width: 100%;',
      '  max-height: 100%;',
      '  width: auto;',
      '  height: 54px;',
      '  object-fit: contain;',
      '  filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.85));',
      '}',
      '.vel-match-banner-fallback-logo {',
      '  width: 46px;',
      '  height: 46px;',
      '  border-radius: 12px;',
      '  background: rgba(59, 130, 246, 0.18);',
      '  border: 1px solid rgba(59, 130, 246, 0.4);',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  font-size: 1.3rem;',
      '  font-weight: 800;',
      '  color: #60a5fa;',
      '}',
      '.vel-match-banner-team-name {',
      '  font-size: 0.88rem;',
      '  font-weight: 700;',
      '  color: #ffffff;',
      '  white-space: nowrap;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '  width: 100%;',
      '  line-height: 1.2;',
      '  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);',
      '}',
      '.vel-match-banner-vs-wrap {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  justify-content: center;',
      '  flex-shrink: 0;',
      '}',
      '.vel-match-banner-vs {',
      '  font-size: 0.8rem;',
      '  font-weight: 900;',
      '  color: #94a3b8;',
      '  padding: 0.25rem 0.6rem;',
      '  border-radius: 7px;',
      '  background: rgba(255, 255, 255, 0.08);',
      '  border: 1px solid rgba(255, 255, 255, 0.14);',
      '  line-height: 1;',
      '  letter-spacing: 0.08em;',
      '  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);',
      '}',
      '@media (max-width: 600px) {',
      '  .vel-live-match-banner { padding: 0.6rem 0.75rem; margin: 0.4rem auto 0.65rem auto; }',
      '  .vel-match-banner-logo-wrap { width: 44px; height: 44px; }',
      '  .vel-match-banner-logo { height: 40px; }',
      '  .vel-match-banner-team-name { font-size: 0.76rem; }',
      '}',
      '/* Football Upcoming Notice Modal */',
      '.vel-football-notice-modal {',
      '  position: fixed;',
      '  inset: 0;',
      '  z-index: 2147483647;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  padding: 1.2rem;',
      '  box-sizing: border-box;',
      '}',
      '.vel-football-modal-backdrop {',
      '  position: absolute;',
      '  inset: 0;',
      '  background: rgba(0, 0, 0, 0.78);',
      '  backdrop-filter: blur(12px);',
      '  -webkit-backdrop-filter: blur(12px);',
      '  animation: velFootFadeIn 0.25s ease-out;',
      '}',
      '.vel-football-modal-box {',
      '  position: relative;',
      '  width: 100%;',
      '  max-width: 460px;',
      '  background: linear-gradient(145deg, #131722 0%, #0d0f17 100%);',
      '  border: 1px solid rgba(255, 255, 255, 0.15);',
      '  border-radius: 20px;',
      '  padding: 1.5rem 1.5rem 1.3rem 1.5rem;',
      '  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.85), 0 0 30px rgba(59, 130, 246, 0.15);',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 1.1rem;',
      '  z-index: 1;',
      '  box-sizing: border-box;',
      '  animation: velFootZoomIn 0.28s cubic-bezier(0.16, 1, 0.3, 1);',
      '}',
      '.vel-football-notice-modal.is-closing .vel-football-modal-box {',
      '  animation: velFootZoomOut 0.2s ease-in forwards;',
      '}',
      '.vel-football-notice-modal.is-closing .vel-football-modal-backdrop {',
      '  animation: velFootFadeOut 0.2s ease-in forwards;',
      '}',
      '@keyframes velFootFadeIn { from { opacity: 0; } to { opacity: 1; } }',
      '@keyframes velFootFadeOut { from { opacity: 1; } to { opacity: 0; } }',
      '@keyframes velFootZoomIn { from { opacity: 0; transform: scale(0.92) translateY(12px); } to { opacity: 1; transform: scale(1) translateY(0); } }',
      '@keyframes velFootZoomOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.92) translateY(12px); } }',
      '.vel-football-modal-close {',
      '  position: absolute;',
      '  top: 1rem;',
      '  right: 1rem;',
      '  width: 32px;',
      '  height: 32px;',
      '  border-radius: 50%;',
      '  border: 1px solid rgba(255, 255, 255, 0.12);',
      '  background: rgba(255, 255, 255, 0.06);',
      '  color: #94a3b8;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  cursor: pointer;',
      '  font-size: 0.95rem;',
      '  transition: all 0.2s ease;',
      '}',
      '.vel-football-modal-close:hover {',
      '  background: rgba(239, 68, 68, 0.2);',
      '  border-color: rgba(239, 68, 68, 0.5);',
      '  color: #ffffff;',
      '  transform: scale(1.08);',
      '}',
      '.vel-football-modal-header {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: space-between;',
      '  padding-right: 2.2rem;',
      '}',
      '.vel-football-modal-comp {',
      '  font-size: 0.85rem;',
      '  font-weight: 800;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.05em;',
      '  color: #60a5fa;',
      '}',
      '.vel-football-modal-time {',
      '  font-size: 0.85rem;',
      '  font-weight: 700;',
      '  color: #38bdf8;',
      '  background: rgba(56, 189, 248, 0.14);',
      '  border: 1px solid rgba(56, 189, 248, 0.35);',
      '  padding: 0.2rem 0.6rem;',
      '  border-radius: 9999px;',
      '}',
      '.vel-football-modal-teams {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: space-between;',
      '  gap: 0.8rem;',
      '  padding: 0.2rem 0;',
      '}',
      '.vel-football-modal-team {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  text-align: center;',
      '  flex: 1;',
      '  min-width: 0;',
      '  gap: 0.45rem;',
      '}',
      '.vel-football-modal-logo-wrap {',
      '  width: 64px;',
      '  height: 64px;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '}',
      '.vel-football-modal-logo {',
      '  max-width: 100%;',
      '  max-height: 100%;',
      '  width: auto;',
      '  height: 60px;',
      '  object-fit: contain;',
      '  filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.8));',
      '}',
      '.vel-football-modal-fallback-logo {',
      '  width: 50px;',
      '  height: 50px;',
      '  border-radius: 14px;',
      '  background: rgba(59, 130, 246, 0.16);',
      '  border: 1px solid rgba(59, 130, 246, 0.35);',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  font-size: 1.35rem;',
      '  font-weight: 800;',
      '  color: #60a5fa;',
      '}',
      '.vel-football-modal-team-name {',
      '  font-size: 0.92rem;',
      '  font-weight: 700;',
      '  color: #ffffff;',
      '  white-space: nowrap;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '  max-width: 100%;',
      '}',
      '.vel-football-modal-vs {',
      '  font-size: 0.78rem;',
      '  font-weight: 900;',
      '  color: #94a3b8;',
      '  padding: 0.22rem 0.52rem;',
      '  border-radius: 6px;',
      '  background: rgba(255, 255, 255, 0.08);',
      '  border: 1px solid rgba(255, 255, 255, 0.12);',
      '}',
      '.vel-football-modal-notice {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 0.8rem;',
      '  padding: 0.8rem 1rem;',
      '  border-radius: 12px;',
      '  background: rgba(56, 189, 248, 0.1);',
      '  border: 1px solid rgba(56, 189, 248, 0.28);',
      '  color: #e2e8f0;',
      '  font-size: 0.86rem;',
      '  line-height: 1.45;',
      '}',
      '.vel-football-modal-notice.is-finished {',
      '  background: rgba(148, 163, 184, 0.1);',
      '  border-color: rgba(148, 163, 184, 0.25);',
      '}',
      '.vel-football-modal-notice strong {',
      '  color: #38bdf8;',
      '}',
      '.vel-football-modal-notice.is-finished strong {',
      '  color: #e2e8f0;',
      '}',
      '.vel-football-modal-notice-icon {',
      '  font-size: 1.35rem;',
      '  flex-shrink: 0;',
      '}',
      '.vel-football-modal-channels-section {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 0.5rem;',
      '}',
      '.vel-football-modal-channels-title {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 0.4rem;',
      '  font-size: 0.78rem;',
      '  font-weight: 700;',
      '  color: #94a3b8;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.04em;',
      '}',
      '.vel-football-modal-channels-grid {',
      '  display: flex;',
      '  flex-wrap: wrap;',
      '  gap: 0.45rem;',
      '}',
      '.vel-match-modal-ch-pill {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 0.35rem;',
      '  font-size: 0.78rem;',
      '  font-weight: 700;',
      '  color: #cbd5e1;',
      '  background: rgba(255, 255, 255, 0.06);',
      '  border: 1px solid rgba(255, 255, 255, 0.12);',
      '  padding: 0.28rem 0.65rem;',
      '  border-radius: 8px;',
      '}',
      '.vel-football-modal-actions {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 0.75rem;',
      '  margin-top: 0.2rem;',
      '}',
      '.vel-football-modal-btn {',
      '  flex: 1;',
      '  padding: 0.75rem 1rem;',
      '  border-radius: 12px;',
      '  font-size: 0.9rem;',
      '  font-weight: 700;',
      '  cursor: pointer;',
      '  transition: all 0.2s ease;',
      '  text-align: center;',
      '  border: none;',
      '}',
      '.vel-football-modal-btn--primary {',
      '  background: #3b82f6;',
      '  color: #ffffff;',
      '  box-shadow: 0 4px 15px rgba(59, 130, 246, 0.35);',
      '}',
      '.vel-football-modal-btn--primary:hover {',
      '  background: #2563eb;',
      '  transform: translateY(-2px);',
      '}',
      '.vel-football-modal-btn--secondary {',
      '  background: rgba(255, 255, 255, 0.08);',
      '  color: #cbd5e1;',
      '  border: 1px solid rgba(255, 255, 255, 0.15);',
      '}',
      '.vel-football-modal-btn--secondary:hover {',
      '  background: rgba(255, 255, 255, 0.14);',
      '  color: #ffffff;',
      '}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function checkPendingMatchFromSession() {
    try {
      var raw = sessionStorage.getItem('velora_pending_match');
      if (!raw) return;
      sessionStorage.removeItem('velora_pending_match');
      var matchObj = JSON.parse(raw);
      if (matchObj && typeof window.veloraOpenMatchChannels === 'function') {
        setTimeout(function () {
          window.veloraOpenMatchChannels(matchObj, matchObj.priorityChannel);
        }, 300);
      }
    } catch (_) {}
  }

  // Initialisation
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      injectFootballToastStyles();
      attachRootObserver();
      scheduleInjection(100);
      checkPendingMatchFromSession();
    });
  } else {
    injectFootballToastStyles();
    attachRootObserver();
    scheduleInjection(100);
    checkPendingMatchFromSession();
  }

  // Actualisation périodique toutes les minutes pour basculer automatiquement en DIRECT / Bientôt
  setInterval(function () {
    if (document.visibilityState === 'visible') {
      scheduleInjection(50);
    }
  }, 60000);

  // Écouteurs de changement de pays et navigation
  document.addEventListener('velora-country-switch-start', handleCountrySwitchEvent);
  document.addEventListener('velora-country-change', handleCountrySwitchEvent);
  document.addEventListener('velora-country-changed', handleCountrySwitchEvent);
  document.addEventListener('velora-country-switch', handleCountrySwitchEvent);
  document.addEventListener('velora-home-country-rendered', handleCountrySwitchEvent);
  document.addEventListener('velora-home-cache-ready', function (e) {
    handleCountrySwitchEvent(e);
    checkPendingMatchFromSession();
  });
  document.addEventListener('velora-app-ready', checkPendingMatchFromSession);
  document.addEventListener('velora-countries-ready', handleCountrySwitchEvent);
  document.addEventListener('velora-return-home', function () {
    removeMatchBanner();
    scheduleInjection(100);
  });
  document.addEventListener('velora-show-home', function () {
    removeMatchBanner();
    scheduleInjection(100);
  });
  document.addEventListener('velora-home-tab', removeMatchBanner);
  document.addEventListener('velora-countries-ready', handleCountrySwitchEvent);
  document.addEventListener('velora-return-home', function () { scheduleInjection(100); });
  document.addEventListener('velora-show-home', function () { scheduleInjection(100); });

  window.addEventListener('velora-country-change', handleCountrySwitchEvent);
  window.addEventListener('velora-country-changed', handleCountrySwitchEvent);
  window.addEventListener('velora-countries-ready', handleCountrySwitchEvent);

  document.addEventListener('change', function (e) {
    if (e.target && (e.target.id === 'country-select' || e.target.id === 'home-country-select')) {
      handleCountrySwitchEvent(e);
    }
  }, true);

  document.addEventListener('click', function (e) {
    var opt = e.target && e.target.closest && e.target.closest('.vel-home-country-picker__option, [data-country-id]');
    if (opt) {
      var cid = opt.dataset?.countryId || opt.textContent;
      scheduleInjection(80, cid);
    }
  }, true);

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      scheduleInjection(100);
    }
  });

})();

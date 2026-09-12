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
          if (ok) return;
        }
        if (typeof window.veloraPlayLiveChannel === 'function') {
          window.veloraPlayLiveChannel(matchingChannels[0]);
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

  function createFootballMatchCard(match) {
    var card = document.createElement('div');
    card.className = 'vel-football-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', (match.homeTeam?.name || '') + ' vs ' + (match.awayTeam?.name || '') + ' à ' + (match.time || ''));

    var homeInitial = (match.homeTeam?.name || 'H').charAt(0).toUpperCase();
    var awayInitial = (match.awayTeam?.name || 'A').charAt(0).toUpperCase();

    card.innerHTML =
      '<div class="vel-football-card__top">' +
        '<span class="vel-football-card__comp">' + escapeHtml(match.competition || 'Football') + '</span>' +
        '<span class="vel-football-card__time-badge">' +
          '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' +
          '<span>' + escapeHtml(match.time || '--:--') + '</span>' +
        '</span>' +
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

    function handleCardAction(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (typeof window.veloraOpenMatchChannels === 'function') {
        window.veloraOpenMatchChannels(match);
      } else {
        window.location.href = '/foot';
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

    matches.forEach(function (m) {
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

  // Écouteurs de changement de pays
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

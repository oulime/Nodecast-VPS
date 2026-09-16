/**
 * Contrôleur Frontend pour la page /foot (Tous les matchs de football télévisés aujourd'hui)
 */

(function () {
    'use strict';

    class FootPageApp {
        constructor() {
            this.matches = [];
            this.filteredMatches = [];
            this.selectedCompetition = 'all';
            this.searchQuery = '';
            this.isLoading = true;
            this.hasError = false;
            this.errorMessage = '';
            this.country = this.detectInitialCountry();

            // Éléments DOM
            this.matchesGrid = document.getElementById('matches-grid');
            this.searchInput = document.getElementById('search-input');
            this.chipsContainer = document.getElementById('chips-container');
            this.refreshBtn = document.getElementById('btn-refresh');
            this.badgeCount = document.getElementById('badge-count');
            this.countryPicker = document.getElementById('country-picker');

            this.init();
        }

        detectInitialCountry() {
            try {
                // 1. URL search params (?country=...)
                const params = new URLSearchParams(window.location.search);
                const queryCountry = params.get('country');
                if (queryCountry) {
                    return this.normalizeCountry(queryCountry);
                }

                // 2. localStorage lumina_selected_country_id (VeloraVIP active country)
                const savedId = localStorage.getItem('lumina_selected_country_id') || sessionStorage.getItem('lumina_selected_country_id');
                if (savedId) {
                    return this.normalizeCountry(savedId);
                }

                // 3. localStorage velora_selected_country_name_v1
                const savedName = localStorage.getItem('velora_selected_country_name_v1') || sessionStorage.getItem('velora_selected_country_name_v1');
                if (savedName) {
                    return this.normalizeCountry(savedName);
                }
            } catch (_) {}

            return 'france'; // Par défaut France
        }

        normalizeCountry(c) {
            if (!c) return 'france';
            const s = String(c)
                .normalize('NFKD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/^country_/, '')
                .replace(/[^\p{L}\p{N}]+/gu, '_')
                .replace(/^_+|_+$/g, '')
                .trim();

            if (/[\u0600-\u06FF]/.test(s) || /^(arabe|arabic|arab|mena|oriental)$/i.test(s)) {
                return 'arabe';
            }
            return s || 'france';
        }

        init() {
            if (this.countryPicker) {
                this.countryPicker.value = this.country;
            }
            this.updateHeaderLabels(this.country);
            this.setupEventListeners();
            this.loadMatches();

            // Actualisation automatique des statuts horaires toutes les 30 secondes
            setInterval(() => {
                if (!this.isLoading && !this.hasError && this.matches.length > 0) {
                    this.filterAndRender();
                }
            }, 30000);

            // Actualisation silencieuse des scores en direct toutes les 45 secondes
            setInterval(() => {
                if (!this.hasError && this.matches.length > 0) {
                    this.loadMatches(true, true);
                }
            }, 45000);
        }

        setupEventListeners() {
            if (this.searchInput) {
                this.searchInput.addEventListener('input', (e) => {
                    this.searchQuery = e.target.value.toLowerCase().trim();
                    this.filterAndRender();
                });
            }

            if (this.countryPicker) {
                this.countryPicker.addEventListener('change', (e) => {
                    this.country = this.normalizeCountry(e.target.value);
                    try {
                        localStorage.setItem('lumina_selected_country_id', `country_${this.country}`);
                    } catch (_) {}
                    this.updateHeaderLabels(this.country);
                    this.loadMatches(false);
                });
            }

            if (this.refreshBtn) {
                this.refreshBtn.addEventListener('click', () => {
                    this.refreshBtn.classList.add('spinning');
                    this.loadMatches(true).finally(() => {
                        setTimeout(() => this.refreshBtn.classList.remove('spinning'), 600);
                    });
                });
            }
        }

        updateHeaderLabels(country) {
            const labels = {
                france: { name: 'France', flag: '🇫🇷', subtitle: 'Diffusion en direct • Chaînes TV françaises 🇫🇷' },
                uk: { name: 'UK', flag: '🇬🇧', subtitle: 'Diffusion en direct • Chaînes TV UK 🇬🇧 (Sky, TNT Sports)' },
                spain: { name: 'Espagne', flag: '🇪🇸', subtitle: 'Diffusion en direct • Chaînes TV 🇪🇸 (Movistar+, DAZN)' },
                usa: { name: 'USA', flag: '🇺🇸', subtitle: 'Diffusion en direct • Chaînes TV 🇺🇸 (NBC, Paramount+, ESPN)' },
                italy: { name: 'Italie', flag: '🇮🇹', subtitle: 'Diffusion en direct • Chaînes TV 🇮🇹 (Sky Sport, DAZN)' },
                germany: { name: 'Allemagne', flag: '🇩🇪', subtitle: 'Diffusion en direct • Chaînes TV 🇩🇪 (Sky Sport, DAZN)' },
                mena: { name: 'Monde Arabe', flag: '🌍', subtitle: 'بث مباشر • القنوات العربية (beIN Sports, SSC, Abu Dhabi Sports) 🌍' },
                portugal: { name: 'Portugal', flag: '🇵🇹', subtitle: 'Diffusion en direct • Chaînes TV 🇵🇹 (Sport TV, DAZN)' }
            };

            const info = labels[country] || labels.france;
            const subtitleEl = document.getElementById('foot-subtitle-text');
            if (subtitleEl) {
                subtitleEl.textContent = info.subtitle;
            }

            if (this.countryPicker && this.countryPicker.value !== country) {
                this.countryPicker.value = country;
            }
        }

        getMatchTimeDetails(matchTimeStr, matchObj) {
            if (matchObj) {
                if (matchObj.isLive || (matchObj.score && matchObj.status === 'live')) {
                    return { diffMinutes: 0, status: 'live', formattedTime: matchTimeStr };
                }
                if (matchObj.status === 'finished') {
                    return { diffMinutes: -120, status: 'finished', formattedTime: matchTimeStr };
                }
            }

            if (!matchTimeStr) return { diffMinutes: 9999, status: 'upcoming', formattedTime: '--:--' };

            const cleaned = String(matchTimeStr).trim().replace(/[hH.]/, ':');
            const parts = cleaned.match(/(\d{1,2})\s*:\s*(\d{2})/);
            if (!parts) return { diffMinutes: 9999, status: 'upcoming', formattedTime: matchTimeStr };

            const hours = parseInt(parts[1], 10);
            const minutes = parseInt(parts[2], 10);

            const now = new Date();
            const matchDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);

            const diffMs = matchDate.getTime() - now.getTime();
            const diffMinutes = Math.round(diffMs / 60000);

            if (diffMinutes < -115) {
                return { diffMinutes, status: 'finished', formattedTime: matchTimeStr };
            } else if (diffMinutes <= 0) {
                return { diffMinutes, status: 'live', formattedTime: matchTimeStr };
            } else if (diffMinutes <= 30) {
                return { diffMinutes, status: 'starting_soon', formattedTime: matchTimeStr };
            } else {
                return { diffMinutes, status: 'upcoming', formattedTime: matchTimeStr };
            }
        }

        async loadMatches(forceRefresh = false, isSilent = false) {
            if (!isSilent) {
                this.isLoading = true;
                this.hasError = false;
                this.renderLoadingSkeletons();
            }

            try {
                const queryParts = ['all=true'];
                if (forceRefresh) queryParts.push('refresh=true');
                if (this.country) queryParts.push(`country=${encodeURIComponent(this.country)}`);
                const queryString = `?${queryParts.join('&')}`;

                const url = `/api/matches/today${queryString}`;
                const response = await fetch(url, {
                    headers: { 'Accept': 'application/json' }
                });

                if (!response.ok) {
                    throw new Error(`Erreur serveur (${response.status})`);
                }

                const isEnabled = response.headers.get('X-Football-Enabled') !== 'false';
                const data = await response.json();
                this.matches = Array.isArray(data) ? data : [];
                this.isFootballEnabled = isEnabled;
                this.isLoading = false;
                this.hasError = false;
            } catch (err) {
                console.error('[Foot] Erreur de chargement:', err);
                if (!isSilent) {
                    this.isLoading = false;
                    this.hasError = true;
                    this.errorMessage = err.message || 'Impossible de récupérer les matchs';
                }
            }

            this.renderChips();
            this.updateBadgeCount();
            this.filterAndRender();
        }

        renderChips() {
            if (!this.chipsContainer) return;
            if (!this.matches || this.matches.length === 0) {
                this.chipsContainer.innerHTML = '';
                return;
            }

            // Calcul des compétitions uniques et de leur nombre
            const compCounts = new Map();
            this.matches.forEach(m => {
                const comp = m.competition || 'Autre';
                compCounts.set(comp, (compCounts.get(comp) || 0) + 1);
            });

            // Tri par nombre de matchs décroissant
            const sortedComps = Array.from(compCounts.entries()).sort((a, b) => b[1] - a[1]);

            let html = `
                <button type="button" class="foot-chip ${this.selectedCompetition === 'all' ? 'active' : ''}" data-comp="all">
                    <span>Tous</span>
                    <span class="foot-chip-count">${this.matches.length}</span>
                </button>
            `;

            sortedComps.forEach(([comp, count]) => {
                const isActive = this.selectedCompetition === comp;
                html += `
                    <button type="button" class="foot-chip ${isActive ? 'active' : ''}" data-comp="${this.escapeHtml(comp)}">
                        <span>${this.escapeHtml(comp)}</span>
                        <span class="foot-chip-count">${count}</span>
                    </button>
                `;
            });

            this.chipsContainer.innerHTML = html;

            this.chipsContainer.querySelectorAll('.foot-chip').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.selectedCompetition = btn.getAttribute('data-comp') || 'all';
                    this.chipsContainer.querySelectorAll('.foot-chip').forEach(c => c.classList.remove('active'));
                    btn.classList.add('active');
                    this.filterAndRender();
                });
            });
        }

        updateBadgeCount() {
            if (!this.badgeCount) return;
            const total = this.matches.length;
            const liveCount = this.matches.filter(m => this.getMatchTimeDetails(m.time).status === 'live').length;

            if (liveCount > 0) {
                this.badgeCount.innerHTML = `<span>${total} matchs</span> • <strong style="color: #ef4444;">🔴 ${liveCount} en direct</strong>`;
            } else {
                this.badgeCount.textContent = total > 1
                    ? `${total} matchs programmés`
                    : total === 1
                        ? `1 match programmé`
                        : `0 match`;
            }
        }

        filterAndRender() {
            let list = [...this.matches];

            // 1. Filtrage par compétition
            if (this.selectedCompetition && this.selectedCompetition !== 'all') {
                list = list.filter(m => (m.competition || '') === this.selectedCompetition);
            }

            // 2. Filtrage par terme de recherche
            if (this.searchQuery) {
                const q = this.searchQuery;
                list = list.filter(m => {
                    const home = (m.homeTeam?.name || '').toLowerCase();
                    const away = (m.awayTeam?.name || '').toLowerCase();
                    const comp = (m.competition || '').toLowerCase();
                    const channels = (m.tvChannels || []).join(' ').toLowerCase();
                    return home.includes(q) || away.includes(q) || comp.includes(q) || channels.includes(q);
                });
            }

            // 3. Tri moderne et intuitif : EN DIRECT d'abord -> Bientôt -> À venir (par heure) -> Terminés
            const rankOrder = { live: 0, starting_soon: 1, upcoming: 2, finished: 3 };

            list.sort((a, b) => {
                const infoA = this.getMatchTimeDetails(a.time);
                const infoB = this.getMatchTimeDetails(b.time);

                const rankA = rankOrder[infoA.status] ?? 2;
                const rankB = rankOrder[infoB.status] ?? 2;

                if (rankA !== rankB) {
                    return rankA - rankB;
                }

                return String(a.time || '').localeCompare(String(b.time || ''));
            });

            this.filteredMatches = list;
            this.render();
        }

        render() {
            if (!this.matchesGrid) return;

            if (this.isLoading) {
                this.renderLoadingSkeletons();
                return;
            }

            if (this.hasError) {
                this.renderErrorState();
                return;
            }

            if (this.filteredMatches.length === 0) {
                this.renderEmptyState();
                return;
            }

            this.matchesGrid.innerHTML = '';

            this.filteredMatches.forEach(match => {
                const card = this.createMatchCard(match);
                this.matchesGrid.appendChild(card);
            });
        }

        createMatchCard(match) {
            const card = document.createElement('div');
            card.className = 'foot-card';

            const timeInfo = this.getMatchTimeDetails(match.time, match);
            let timeBadgeHtml = '';

            const isLive = timeInfo.status === 'live' || match.isLive || (match.score && match.status === 'live');
            const isFinished = timeInfo.status === 'finished' || match.status === 'finished';

            if (isLive) {
                card.classList.add('is-live');
                const liveMinute = match.minute ? ` • ${this.escapeHtml(match.minute)}` : (match.time ? ` • ${this.escapeHtml(match.time)}` : '');
                timeBadgeHtml = `
                    <span class="foot-status-badge status-live">
                        <span class="foot-live-dot"></span>
                        <span>EN DIRECT${liveMinute}</span>
                    </span>
                `;
            } else if (timeInfo.status === 'starting_soon') {
                timeBadgeHtml = `
                    <span class="foot-status-badge status-ns" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border-color: rgba(245, 158, 11, 0.3);">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span>Bientôt (${this.escapeHtml(match.time || '--:--')})</span>
                    </span>
                `;
            } else if (isFinished) {
                timeBadgeHtml = `
                    <span class="foot-status-badge status-ft">
                        <span>Terminé</span>
                    </span>
                `;
            } else {
                timeBadgeHtml = `
                    <span class="foot-status-badge status-ns">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span>${this.escapeHtml(match.time || '--:--')}</span>
                    </span>
                `;
            }

            let middleScoreHtml = '';
            if (isLive) {
                const scoreText = match.score ? `${match.score.home} - ${match.score.away}` : '0 - 0';
                const minText = match.minute ? `🔴 ${this.escapeHtml(match.minute)}` : '🔴 DIRECT';
                middleScoreHtml = `
                    <div class="foot-score-box is-live">
                        <span class="foot-score-digits">${scoreText}</span>
                        <span class="foot-score-live-badge">${minText}</span>
                    </div>
                `;
            } else if (isFinished) {
                const scoreText = match.score ? `${match.score.home} - ${match.score.away}` : '0 - 0';
                middleScoreHtml = `
                    <div class="foot-score-box is-finished">
                        <span class="foot-score-digits">${scoreText}</span>
                        <span class="foot-score-ft-badge">Score final</span>
                    </div>
                `;
            } else {
                middleScoreHtml = `
                    <div class="foot-vs-wrap">
                        <span class="foot-vs-text">VS</span>
                    </div>
                `;
            }

            const homeInitial = (match.homeTeam?.name || 'H').charAt(0).toUpperCase();
            const awayInitial = (match.awayTeam?.name || 'A').charAt(0).toUpperCase();

            // Badges TV
            const channels = Array.isArray(match.tvChannels) && match.tvChannels.length > 0
                ? match.tvChannels
                : ['Chaîne à confirmer'];

            const tvBadgesHtml = channels.map(channel => {
                const slug = String(channel).toLowerCase().replace(/[^a-z0-9]/g, '');
                return `
                    <span class="foot-broadcaster-badge" data-channel="${slug}" data-channel-name="${this.escapeHtml(channel)}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
                            <polyline points="17 2 12 7 7 2"></polyline>
                        </svg>
                        <span>${this.escapeHtml(channel)}</span>
                    </span>
                `;
            }).join('');

            card.innerHTML = `
                <!-- Header: Competition name and Kickoff Time -->
                <div class="foot-card-header">
                    <span class="foot-card-comp-name">${this.escapeHtml(match.competition || 'Football')}</span>
                    ${timeBadgeHtml}
                </div>

                <!-- Body: Home Team VS Away Team & Score -->
                <div class="foot-card-body">
                    <div class="foot-team foot-team-home">
                        <div class="foot-team-logo-wrap">
                            <img class="foot-team-logo" 
                                 src="${this.escapeHtml(match.homeTeam?.logoUrl || '')}" 
                                 alt="${this.escapeHtml(match.homeTeam?.name || 'Équipe domicile')}"
                                 loading="lazy"
                                 onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'foot-team-logo-fallback\\'>${homeInitial}</span>'">
                        </div>
                        <span class="foot-team-name">${this.escapeHtml(match.homeTeam?.name || 'Équipe 1')}</span>
                    </div>

                    ${middleScoreHtml}

                    <div class="foot-team foot-team-away">
                        <div class="foot-team-logo-wrap">
                            <img class="foot-team-logo" 
                                 src="${this.escapeHtml(match.awayTeam?.logoUrl || '')}" 
                                 alt="${this.escapeHtml(match.awayTeam?.name || 'Équipe extérieur')}"
                                 loading="lazy"
                                 onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'foot-team-logo-fallback\\'>${awayInitial}</span>'">
                        </div>
                        <span class="foot-team-name">${this.escapeHtml(match.awayTeam?.name || 'Équipe 2')}</span>
                    </div>
                </div>

                <!-- Footer: Section Diffusion TV -->
                <div class="foot-card-tv">
                    <div class="foot-tv-header">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                        <span>Diffusion TV</span>
                    </div>
                    <div class="foot-tv-badges">
                        ${tvBadgesHtml}
                    </div>
                </div>
            `;

            const handleCardClick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const badge = e.target && e.target.closest && e.target.closest('.foot-broadcaster-badge');
                let priorityChannel = badge ? badge.getAttribute('data-channel-name') : null;
                if (priorityChannel) {
                    priorityChannel = priorityChannel.replace(/\s*\([^)]*\)/g, ' ').replace(/\s*\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
                }
                const cleanChannels = Array.isArray(match.tvChannels)
                    ? match.tvChannels.map(c => typeof c === 'string' ? c.replace(/\s*\([^)]*\)/g, ' ').replace(/\s*\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim() : c).filter(Boolean)
                    : [];
                const payload = Object.assign({}, match, {
                    tvChannels: cleanChannels.length > 0 ? cleanChannels : match.tvChannels,
                    priorityChannel: priorityChannel
                });
                try {
                    sessionStorage.setItem('velora_pending_match', JSON.stringify(payload));
                } catch (_) {}
                window.location.href = '/';
            };

            card.setAttribute('tabindex', '0');
            card.setAttribute('role', 'button');
            card.addEventListener('click', handleCardClick);
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    handleCardClick(e);
                }
            });

            return card;
        }

        renderLoadingSkeletons() {
            if (!this.matchesGrid) return;
            this.matchesGrid.innerHTML = Array(6).fill(0).map(() => `
                <div class="foot-skeleton-card">
                    <div class="skeleton-header">
                        <div class="skeleton-shimmer skeleton-comp"></div>
                        <div class="skeleton-shimmer skeleton-badge"></div>
                    </div>
                    <div class="skeleton-teams">
                        <div class="skeleton-team">
                            <div class="skeleton-shimmer skeleton-logo"></div>
                            <div class="skeleton-shimmer skeleton-text"></div>
                        </div>
                        <div class="skeleton-shimmer skeleton-vs"></div>
                        <div class="skeleton-team">
                            <div class="skeleton-shimmer skeleton-logo"></div>
                            <div class="skeleton-shimmer skeleton-text"></div>
                        </div>
                    </div>
                    <div class="skeleton-shimmer skeleton-tv"></div>
                </div>
            `).join('');
        }

        renderEmptyState() {
            if (!this.matchesGrid) return;
            const isOff = this.isFootballEnabled === false;
            this.matchesGrid.innerHTML = `
                <div class="foot-empty-state" style="grid-column: 1 / -1;">
                    <div class="foot-state-icon">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path>
                            <path d="M2 12h20"></path>
                        </svg>
                    </div>
                    <h3 class="foot-state-title">${isOff ? 'Module Football désactivé' : 'Aucun match trouvé'}</h3>
                    <p class="foot-state-desc">
                        ${isOff ? 'La fonctionnalité Football est actuellement désactivée pour ce pays dans les paramètres administrateur.' : 'Aucun match ne correspond à vos critères de recherche pour le moment.'}
                    </p>
                </div>
            `;
        }

        renderErrorState() {
            if (!this.matchesGrid) return;
            this.matchesGrid.innerHTML = `
                <div class="foot-error-state" style="grid-column: 1 / -1;">
                    <div class="foot-state-icon">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                    </div>
                    <h3 class="foot-state-title">Erreur de chargement</h3>
                    <p class="foot-state-desc">${this.escapeHtml(this.errorMessage || 'Impossible de récupérer les programmes TV')}</p>
                    <button type="button" class="foot-btn-action" id="btn-retry">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                        </svg>
                        <span>Réessayer</span>
                    </button>
                </div>
            `;

            const retryBtn = document.getElementById('btn-retry');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    this.loadMatches(true);
                });
            }
        }

        escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        window.footPageApp = new FootPageApp();
    });
})();


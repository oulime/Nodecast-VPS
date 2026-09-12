/**
 * Contrôleur Frontend pour la page /foot (Matchs de football télévisés aujourd'hui)
 */

(function () {
    'use strict';

    class FootPageApp {
        constructor() {
            this.matches = [];
            this.filteredMatches = [];
            this.searchQuery = '';
            this.isLoading = true;
            this.hasError = false;
            this.errorMessage = '';
            this.country = this.detectInitialCountry();

            // Éléments DOM
            this.matchesGrid = document.getElementById('matches-grid');
            this.searchInput = document.getElementById('search-input');
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
            const s = String(c).toLowerCase().replace(/^country_/, '').replace(/[_\-\s]+/g, ' ').trim();

            // 1. Pays Arabes / Monde Arabe (MENA)
            if (/(arabe|arabic|arab|mena|oriental|maghreb|maroc|morocco|algerie|algeria|tunisie|tunisia|egypt|egypte|saudi|saoudite|qatar|emirats|uae|kuwait|koweit|bahrain|oman|iraq|irak|jordan|jordanie|lebanon|liban|libya|libye|sudan|soudan|yemen|syria|syrie|palestine|\b(ar|dz|ma|tn|eg|sa|ae|qa|kw|om|bh|iq|jo|lb|ly|sd|ye|sy)\b)/i.test(s)) {
                return 'mena';
            }

            // 2. Royaume-Uni / UK
            if (/(uk|gb|gbr|england|angleterre|united kingdom|great britain|royaume uni|royaume-uni|\b(uk|gb)\b)/i.test(s)) {
                return 'uk';
            }

            // 3. Espagne
            if (/(spain|espagne|espana|spanish|\b(es|esp)\b)/i.test(s)) {
                return 'spain';
            }

            // 4. États-Unis / USA
            if (/(usa|us|united states|etats unis|etats-unis|america|amerique|\b(us|usa)\b)/i.test(s)) {
                return 'usa';
            }

            // 5. Italie
            if (/(italy|italie|italia|italian|\b(it|ita)\b)/i.test(s)) {
                return 'italy';
            }

            // 6. Allemagne
            if (/(germany|allemagne|deutschland|german|\b(de|deu|ger)\b)/i.test(s)) {
                return 'germany';
            }

            // 7. Portugal
            if (/(portugal|portugais|portuguese|\b(pt|prt)\b)/i.test(s)) {
                return 'portugal';
            }

            // 8. France
            if (/(france|francais|french|\b(fr|fra)\b)/i.test(s)) {
                return 'france';
            }

            return 'france';
        }

        init() {
            if (this.countryPicker) {
                this.countryPicker.value = this.country;
            }
            this.updateHeaderLabels(this.country);
            this.setupEventListeners();
            this.loadMatches();
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
                france: { name: 'France', flag: '🇫🇷', subtitle: 'Diffusion en direct • Chaînes TV françaises 🇫🇷', tv: 'Diffusion TV' },
                uk: { name: 'UK', flag: '🇬🇧', subtitle: 'Diffusion en direct • Chaînes TV UK 🇬🇧 (Sky, TNT Sports)', tv: 'Diffusion TV (UK)' },
                spain: { name: 'Espagne', flag: '🇪🇸', subtitle: 'Diffusion en direct • Chaînes TV 🇪🇸 (Movistar+, DAZN)', tv: 'Diffusion TV (Espagne)' },
                usa: { name: 'USA', flag: '🇺🇸', subtitle: 'Diffusion en direct • Chaînes TV 🇺🇸 (NBC, Paramount+, ESPN)', tv: 'Diffusion TV (USA)' },
                italy: { name: 'Italie', flag: '🇮🇹', subtitle: 'Diffusion en direct • Chaînes TV 🇮🇹 (Sky Sport, DAZN)', tv: 'Diffusion TV (Italie)' },
                germany: { name: 'Allemagne', flag: '🇩🇪', subtitle: 'Diffusion en direct • Chaînes TV 🇩🇪 (Sky Sport, DAZN)', tv: 'Diffusion TV (Allemagne)' },
                mena: { name: 'Monde Arabe', flag: '🌍', subtitle: 'بث مباشر • القنوات العربية (beIN Sports, SSC, Abu Dhabi Sports) 🌍', tv: 'القنوات الناقلة (Diffusion TV)' },
                portugal: { name: 'Portugal', flag: '🇵🇹', subtitle: 'Diffusion en direct • Chaînes TV 🇵🇹 (Sport TV, DAZN)', tv: 'Diffusion TV (Portugal)' }
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

        async loadMatches(forceRefresh = false) {
            this.isLoading = true;
            this.hasError = false;
            this.renderLoadingSkeletons();

            try {
                const queryParts = [];
                if (forceRefresh) queryParts.push('refresh=true');
                if (this.country) queryParts.push(`country=${encodeURIComponent(this.country)}`);
                const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

                const url = `/api/matches/today${queryString}`;
                const response = await fetch(url, {
                    headers: { 'Accept': 'application/json' }
                });

                if (!response.ok) {
                    throw new Error(`Erreur serveur (${response.status})`);
                }

                const data = await response.json();
                this.matches = Array.isArray(data) ? data : [];
                this.isLoading = false;
                this.hasError = false;
            } catch (err) {
                console.error('[Foot] Erreur de chargement:', err);
                this.isLoading = false;
                this.hasError = true;
                this.errorMessage = err.message || 'Impossible de récupérer les matchs';
            }

            this.updateBadgeCount();
            this.filterAndRender();
        }

        updateBadgeCount() {
            if (!this.badgeCount) return;
            const count = this.matches.length;
            this.badgeCount.textContent = count > 1
                ? `${count} matchs diffusés`
                : count === 1
                    ? `1 match diffusé`
                    : `0 match`;
        }

        filterAndRender() {
            if (this.searchQuery) {
                const q = this.searchQuery;
                this.filteredMatches = this.matches.filter(m => {
                    const home = (m.homeTeam?.name || '').toLowerCase();
                    const away = (m.awayTeam?.name || '').toLowerCase();
                    const comp = (m.competition || '').toLowerCase();
                    const channels = (m.tvChannels || []).join(' ').toLowerCase();
                    return home.includes(q) || away.includes(q) || comp.includes(q) || channels.includes(q);
                });
            } else {
                this.filteredMatches = [...this.matches];
            }

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
                    <span class="foot-status-badge status-ns">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span>${this.escapeHtml(match.time || '--:--')}</span>
                    </span>
                </div>

                <!-- Body: Home Team VS Away Team (Centered & Balanced) -->
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

                    <div class="foot-vs-wrap">
                        <span class="foot-vs-text">VS</span>
                    </div>

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
                const priorityChannel = badge ? badge.getAttribute('data-channel-name') : null;
                const payload = Object.assign({}, match, { priorityChannel: priorityChannel });
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
            this.matchesGrid.innerHTML = `
                <div class="foot-empty-state" style="grid-column: 1 / -1;">
                    <div class="foot-state-icon">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path>
                            <path d="M2 12h20"></path>
                        </svg>
                    </div>
                    <h3 class="foot-state-title">Aucun match télévisé trouvé pour le moment</h3>
                    <p class="foot-state-desc">
                        Aucune diffusion de grand match n'est programmée pour l'instant ou les diffusions du jour sont terminées.
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

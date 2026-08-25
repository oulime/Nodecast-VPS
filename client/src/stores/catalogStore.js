import { defineStore } from 'pinia';
import { api } from '../api/index.js';

export function cleanItemName(rawName, prefixes = []) {
  if (!rawName) return '';
  let name = String(rawName).trim();

  // Strip leading and trailing symbols (###, ---, ===, |||)
  name = name.replace(/^[#\*\-=\|~_\s:]+/, '').trim();
  name = name.replace(/[#\*\-=\|~_\s:]+$/, '').trim();

  // 1. Dynamic Admin-configured Prefixes (e.g. "FR -", "SRS -", "FR|", "####", etc.)
  if (Array.isArray(prefixes) && prefixes.length > 0) {
    for (let pass = 0; pass < 8; pass++) {
      const before = name;
      for (const prefix of prefixes) {
        const p = String(prefix || '').trim();
        if (p && name.toLowerCase().startsWith(p.toLowerCase())) {
          name = name.slice(p.length).trim();
          name = name.replace(/^[#\*\-=\|~_\s:]+/, '').trim();
          name = name.replace(/[#\*\-=\|~_\s:]+$/, '').trim();
        }
      }
      if (name === before) break;
    }
  }

  // 2. Common country & quality prefix tags (e.g. |FR|, FR:, AR:, BE:, VIP:, etc.)
  const prefixRegex = /^(\[|\(|\/|\|)?\s*(FR|AR|BE|CH|ES|IT|DE|PT|UK|GB|EN|US|USA|CA|EU|TR|NL|PL|RO|RU|MA|DZ|TN|VIP|RAW|SRS|HEVC|FHD|UHD|4K|HD|SD)\s*(\]|\)|\/|\||:|-|_|\s)+\s*/i;

  for (let pass = 0; pass < 8; pass++) {
    const before = name;
    name = name.replace(prefixRegex, '').trim();
    name = name.replace(/^[#\*\-=\|~_\s:]+/, '').trim();
    name = name.replace(/[#\*\-=\|~_\s:]+$/, '').trim();
    if (name === before) break;
  }

  // Strip trailing superscript badges like ᴴᴰ, ᴿᴬᵂ, ⁴ᴷ, ᶠᴴᴰ
  name = name.replace(/\s*(ᴴᴰ|ᴿᴬᵂ|⁴ᴷ|ᶠᴴᴰ)\s*$/i, '').trim();

  return name || String(rawName).trim();
}

export const DEFAULT_CHANNEL_HIDDEN_FILTERS = ['hevc', 'h265', 'h.265', 'h 265', 'x265'];

export function isItemHiddenByAdmin(rawName, hiddenFilters = []) {
  if (!rawName) return false;
  const name = String(rawName).normalize('NFKC').trim().toLowerCase();
  const filters = Array.isArray(hiddenFilters) && hiddenFilters.length > 0 ? hiddenFilters : DEFAULT_CHANNEL_HIDDEN_FILTERS;
  return filters.some(filter => {
    const f = String(filter).normalize('NFKC').trim().toLowerCase();
    if (!f) return false;
    if (f.startsWith('suffix:')) {
      return name.endsWith(f.slice(7).trim());
    }
    if (f.startsWith('prefix:')) {
      return name.startsWith(f.slice(7).trim());
    }
    return name.includes(f);
  });
}

function normalizeKey(str) {
  return String(str || '').toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim();
}

function getPackageKind(pkg) {
  const k = String(pkg.kind || pkg.media_type || pkg.type || '').toLowerCase();
  if (k === 'vod' || k === 'movie' || k === 'movies') return 'vod';
  if (k === 'series' || k === 'tvshow') return 'series';
  return 'live';
}

const NON_COUNTRIES = new Set(['adult', 'adulte', 'xxx', 'for adult', 'adultes']);

export const useCatalogStore = defineStore('catalog', {
  state: () => ({
    countries: [],
    allPackages: [],
    homeSections: [],
    channelPrefixes: [],
    hiddenFilters: [...DEFAULT_CHANNEL_HIDDEN_FILTERS],
    selectedCountry: null,
    activeParentPackage: null,
    activePackage: null,
    channels: [],
    loading: false,
    loadingStatus: 'Chargement du catalogue…',
    loadingAccent: null,
    loadingChannels: false
  }),
  getters: {
    // Current country home sections from homeCache
    currentHomeSections: (state) => {
      if (!state.homeSections || state.homeSections.length === 0) return [];
      if (!state.selectedCountry) return state.homeSections.filter(s => s.published !== false);
      const countryId = state.selectedCountry.id;
      
      const specific = state.homeSections.filter(s => s.country_id === countryId && s.published !== false);
      if (specific.length > 0) return specific;

      const defaultSecs = state.homeSections.filter(s => (!s.country_id || s.country_id === 'default') && s.published !== false);
      if (defaultSecs.length > 0) return defaultSecs;

      return state.homeSections.filter(s => s.published !== false);
    },

    // Packages for active country filtered by KIND
    livePackagesForCountry: (state) => {
      if (!state.selectedCountry) return [];
      const cId = state.selectedCountry.id;
      return state.allPackages
        .filter(p => p.country_id === cId && !p.is_hidden && getPackageKind(p) === 'live')
        .map(p => ({
          ...p,
          display_name: cleanItemName(p.name, state.channelPrefixes)
        }));
    },
    vodPackagesForCountry: (state) => {
      if (!state.selectedCountry) return [];
      const cId = state.selectedCountry.id;
      return state.allPackages
        .filter(p => p.country_id === cId && !p.is_hidden && getPackageKind(p) === 'vod')
        .map(p => ({
          ...p,
          display_name: cleanItemName(p.name, state.channelPrefixes)
        }));
    },
    seriesPackagesForCountry: (state) => {
      if (!state.selectedCountry) return [];
      const cId = state.selectedCountry.id;
      return state.allPackages
        .filter(p => p.country_id === cId && !p.is_hidden && getPackageKind(p) === 'series')
        .map(p => ({
          ...p,
          display_name: cleanItemName(p.name, state.channelPrefixes)
        }));
    },

    // Visible Live TV packages
    visibleLivePackages: (state) => {
      const countryLivePkgs = state.livePackagesForCountry;

      if (state.activeParentPackage) {
        const childIds = new Set(
          Array.isArray(state.activeParentPackage.child_package_ids)
            ? state.activeParentPackage.child_package_ids.map(String)
            : []
        );
        return state.allPackages
          .filter(p => childIds.has(String(p.id)) && getPackageKind(p) === 'live')
          .map(p => ({
            ...p,
            display_name: cleanItemName(p.name, state.channelPrefixes)
          }));
      }

      const allChildIds = new Set();
      countryLivePkgs.forEach(p => {
        const isParent = p.is_parent === true || p.is_parent === 'true' || (Array.isArray(p.child_package_ids) && p.child_package_ids.length > 0);
        if (isParent && Array.isArray(p.child_package_ids)) {
          p.child_package_ids.forEach(cid => allChildIds.add(String(cid)));
        }
      });

      return countryLivePkgs
        .filter(p => !allChildIds.has(String(p.id)) && !p.parent_package_id)
        .map(p => {
          const isParent = p.is_parent === true || p.is_parent === 'true' || (Array.isArray(p.child_package_ids) && p.child_package_ids.length > 0);
          return {
            ...p,
            is_parent: isParent,
            display_name: cleanItemName(p.name, state.channelPrefixes)
          };
        });
    }
  },
  actions: {
    async loadCatalog() {
      this.loading = true;
      try {
        const [cache, homeCacheData, coversData, hiddenData] = await Promise.all([
          api.getCountryPackageCache(),
          api.getHomeCache().catch(() => ({ sections: [] })),
          api.getPackageCoversAll().catch(() => ({ covers: {} })),
          api.getHiddenFilters().catch(() => ({ filters: [] }))
        ]);

        if (cache?.prefixes && Array.isArray(cache.prefixes)) {
          this.channelPrefixes = cache.prefixes;
        } else if (hiddenData?.prefixes && Array.isArray(hiddenData.prefixes)) {
          this.channelPrefixes = hiddenData.prefixes;
        }

        if (cache?.hiddenFilters && Array.isArray(cache.hiddenFilters)) {
          this.hiddenFilters = [...new Set([...DEFAULT_CHANNEL_HIDDEN_FILTERS, ...cache.hiddenFilters])];
        } else if (hiddenData?.filters && Array.isArray(hiddenData.filters)) {
          this.hiddenFilters = [...new Set([...DEFAULT_CHANNEL_HIDDEN_FILTERS, ...hiddenData.filters])];
        }

        const rawCountries = cache.countries || [];
        const rawPackages = cache.packages || [];
        const coversMap = coversData?.covers || {};

        this.allPackages = rawPackages.map(p => {
          const pkgId = String(p.id);
          const explicitCover = coversMap[pkgId] || p.cover_url || null;
          return {
            ...p,
            cover_url: explicitCover
          };
        });

        // For parent packages without covers, inherit first available child cover
        for (const p of this.allPackages) {
          if (p.is_parent && !p.cover_url && Array.isArray(p.child_package_ids)) {
            const firstChild = this.allPackages.find(c => p.child_package_ids.includes(c.id) && c.cover_url);
            if (firstChild?.cover_url) {
              p.cover_url = firstChild.cover_url;
            }
          }
        }

        this.homeSections = homeCacheData.sections || [];
        
        const canonical = cache.canonicalCountries || [];
        const visibleKeys = new Set(
          canonical
            .filter(x => String(x.match_key || '').startsWith('__visible__:'))
            .map(x => normalizeKey(x.display_name || x.match_key.replace('__visible__:', '')))
        );

        const countryIdsWithPkgs = new Set(
          this.allPackages.filter(p => !p.is_hidden).map(p => p.country_id)
        );

        let filtered = rawCountries.filter(c => {
          const normName = normalizeKey(c.name);
          if (NON_COUNTRIES.has(normName)) return false;
          if (visibleKeys.size > 0 && visibleKeys.has(normName)) return true;
          return countryIdsWithPkgs.has(c.id);
        });

        filtered.sort((a, b) => {
          const na = normalizeKey(a.name);
          const nb = normalizeKey(b.name);
          if (na === 'france') return -1;
          if (nb === 'france') return 1;
          if (na === 'arabe' || na === 'pays arabes') return -1;
          if (nb === 'arabe' || nb === 'pays arabes') return 1;
          return a.name.localeCompare(b.name, 'fr');
        });

        this.countries = filtered;

        const savedCountryId = localStorage.getItem('velora_country_id');
        let initial = null;
        if (savedCountryId) {
          initial = this.countries.find(c => c.id === savedCountryId);
        }
        if (!initial && this.countries.length > 0) {
          initial = this.countries.find(c => normalizeKey(c.name) === 'france') || this.countries[0];
        }
        if (initial) {
          this.selectedCountry = initial;
        }
        this.loadingStatus = 'Chargement du catalogue…';
      } catch (err) {
        console.error('Failed to load catalog', err);
      } finally {
        this.loading = false;
      }
    },
    async selectCountry(country) {
      if (!country) return;
      this.loading = true;
      this.loadingStatus = `Chargement de ${country.name || 'ce pays'}…`;
      this.selectedCountry = country;
      localStorage.setItem('velora_country_id', country.id);
      this.activeParentPackage = null;
      this.activePackage = null;
      this.channels = [];
      // Replicate the 300ms minimum smooth transition from country-switch-loader
      await new Promise(resolve => setTimeout(resolve, 320));
      this.loading = false;
    },
    openParentPackage(pkg) {
      this.activeParentPackage = pkg;
      this.activePackage = null;
      this.channels = [];
    },
    closeParentPackage() {
      this.activeParentPackage = null;
      this.activePackage = null;
      this.channels = [];
    },
    async openPackage(pkg) {
      this.activePackage = pkg;
      this.loadingChannels = true;
      this.channels = [];
      try {
        const sourceId = pkg.source_id || 1;
        const catId = pkg.category_id || pkg.id;
        const rawChannels = await api.getLiveStreams(catId, sourceId);
        const list = Array.isArray(rawChannels) ? rawChannels : [];
        this.channels = list
          .filter(ch => !isItemHiddenByAdmin(ch.name, this.hiddenFilters))
          .map(ch => ({
            ...ch,
            stream_id: ch.raw_stream_id || ch.stream_id,
            clean_name: cleanItemName(ch.name)
          }));

        // Auto-discover and save package cover from first channel icon
        const firstWithIcon = this.channels.find(c => (c.stream_icon && typeof c.stream_icon === 'string' && c.stream_icon.trim()) || (c.logo && typeof c.logo === 'string' && c.logo.trim()));
        const iconUrl = firstWithIcon ? (firstWithIcon.stream_icon || firstWithIcon.logo).trim() : null;

        if (iconUrl) {
          if (!pkg.cover_url) {
            pkg.cover_url = iconUrl;
            const found = this.allPackages.find(p => String(p.id) === String(pkg.id));
            if (found) found.cover_url = iconUrl;
            api.autoBackfillPackageCover(pkg.id, iconUrl);
          }

          if (this.activeParentPackage && !this.activeParentPackage.cover_url) {
            this.activeParentPackage.cover_url = iconUrl;
            const foundParent = this.allPackages.find(p => String(p.id) === String(this.activeParentPackage.id));
            if (foundParent) foundParent.cover_url = iconUrl;
            api.autoBackfillPackageCover(this.activeParentPackage.id, iconUrl);
          }
        }
      } catch (err) {
        console.error('Failed to load channels', err);
        this.channels = [];
      } finally {
        this.loadingChannels = false;
      }
    },
    closePackage() {
      this.activePackage = null;
      this.channels = [];
    }
  }
});

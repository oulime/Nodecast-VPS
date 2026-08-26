// Unified API client for Nodecast VPS backend
async function request(endpoint, options = {}) {
  const token = localStorage.getItem('authToken');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  };

  const res = await fetch(endpoint, { ...options, headers });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || errorBody.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Auth
  login: (username, password) => request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  }),
  getMe: () => request('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),

  // Compiled Country & Package Cache
  getCountryPackageCache: () => request('/api/velora-db/country-package-cache'),
  
  // Home Sections & Rails Cache
  getHomeCache: () => request(`/api/velora-db/home-cache?t=${Date.now()}`),

  // Package Media Items (VOD Movies & Series)
  getPackageMediaItems: async (countryId, packageId, kind, sourceId = null, categoryId = null) => {
    const k = (kind === 'movies' || kind === 'vod') ? 'vod' : 'series';
    let cleanSourceId = sourceId;
    let cleanCatId = categoryId;

    // Parse compound IDs like "11:movie:126" or "11:126"
    const rawPkg = String(packageId || '').trim();
    if (!cleanCatId && rawPkg.includes(':')) {
      const parts = rawPkg.split(':');
      cleanCatId = parts[parts.length - 1];
      if (!cleanSourceId && parts.length >= 2) {
        cleanSourceId = parts[0];
      }
    } else if (!cleanCatId) {
      cleanCatId = rawPkg;
    }

    // 1. Try curated package media items first
    try {
      const res = await request(`/api/velora-db/admin/package-media-items?countryId=${encodeURIComponent(countryId)}&packageId=${encodeURIComponent(packageId)}&kind=${k}`);
      if (res && Array.isArray(res.items) && res.items.length > 0) {
        return res;
      }
    } catch (e) {}

    // 2. Direct Xtream Proxy endpoints for Movies & Series
    try {
      const endpoint = k === 'vod' ? 'vod_streams' : 'series';
      let rawItems = [];
      if (cleanSourceId) {
        try {
          rawItems = await request(`/api/proxy/xtream/${encodeURIComponent(cleanSourceId)}/${endpoint}?category_id=${encodeURIComponent(cleanCatId)}`);
        } catch (e) {}
      }
      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        rawItems = await request(`/api/proxy/xtream/all/${endpoint}?category_id=${encodeURIComponent(cleanCatId)}`);
      }

      const list = Array.isArray(rawItems) ? rawItems : (rawItems?.items || rawItems?.data || rawItems?.series || []);
      return {
        items: list.map(item => ({
          ...item,
          stream_id: item.stream_id || item.series_id || item.id,
          source_id: item.source_id || cleanSourceId || 10,
          container_extension: item.container_extension || 'mkv'
        }))
      };
    } catch (err) {
      console.warn(`[API] Proxy media fetch failed for ${k} (pkg: ${packageId})`, err);
      return { items: [] };
    }
  },

  // Channels for Live Package (Streams)
  getLiveStreams: async (categoryId, sourceId) => {
    if (sourceId && categoryId) {
      return request(`/api/proxy/xtream/${encodeURIComponent(sourceId)}/live_streams?category_id=${encodeURIComponent(categoryId)}`);
    }
    return request(`/api/proxy/xtream/all/live_streams?category_id=${encodeURIComponent(categoryId)}`);
  },
  
  // Favorites
  getFavorites: () => request('/api/favorites'),
  addFavorite: (data) => request('/api/favorites', { method: 'POST', body: JSON.stringify(data) }),
  removeFavorite: (data) => request('/api/favorites', { method: 'DELETE', body: JSON.stringify(data) }),

  // Package Covers & Crowd-sourced Auto-backfill
  getPackageCoversAll: () => request('/api/package-covers/all').catch(() => ({ covers: {} })),
  autoBackfillPackageCover: (packageId, coverUrl) => request('/api/package-covers/auto-backfill', {
    method: 'POST',
    body: JSON.stringify({ packageId, coverUrl })
  }).catch(() => {}),

  // Search
  search: (query) => request(`/api/search?q=${encodeURIComponent(query)}`),

  // Admin Hidden Filters & Needles
  getHiddenFilters: () => request('/api/velora-db/hidden-filters').catch(() => ({ filters: ['hevc', 'h265', 'h.265', 'h 265', 'x265'] }))
};

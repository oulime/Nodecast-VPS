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
  getPackageMediaItems: (countryId, packageId, kind) => {
    const k = kind === 'movies' ? 'vod' : kind;
    return request(`/api/velora-db/admin/package-media-items?countryId=${encodeURIComponent(countryId)}&packageId=${encodeURIComponent(packageId)}&kind=${k}`);
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

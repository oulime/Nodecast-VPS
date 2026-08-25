import { defineStore } from 'pinia';
import { api } from '../api/index.js';

export function makeFavoriteKey(sourceId, itemId, itemType) {
  return `${sourceId || 1}_${itemId}_${itemType || 'channel'}`;
}

export const useFavoritesStore = defineStore('favorites', {
  state: () => ({
    items: JSON.parse(localStorage.getItem('velora_favorites_items') || '[]'),
    loading: false,
    toastMessage: null,
    toastIsError: false,
    toastTimer: null
  }),

  getters: {
    favoriteKeys: (state) => {
      const keys = new Set();
      for (const item of state.items) {
        const key = makeFavoriteKey(item.source_id || item.sourceId, item.item_id || item.itemId || item.stream_id || item.id, item.item_type || item.itemType);
        keys.add(key);
        // Also add plain ID for backward compatibility
        keys.add(String(item.item_id || item.itemId || item.stream_id || item.id));
      }
      return keys;
    },

    channels: (state) => state.items.filter(i => (i.item_type || i.itemType) === 'channel'),
    movies: (state) => state.items.filter(i => (i.item_type || i.itemType) === 'movie'),
    series: (state) => state.items.filter(i => (i.item_type || i.itemType) === 'series'),

    channelCount: (state) => state.items.filter(i => (i.item_type || i.itemType) === 'channel').length,
    movieCount: (state) => state.items.filter(i => (i.item_type || i.itemType) === 'movie').length,
    seriesCount: (state) => state.items.filter(i => (i.item_type || i.itemType) === 'series').length,
    totalCount: (state) => state.items.length
  },

  actions: {
    async loadFavorites() {
      this.loading = true;
      try {
        const data = await api.getFavorites();
        if (Array.isArray(data)) {
          this.items = data.map(item => ({
            id: item.id,
            source_id: String(item.source_id ?? item.sourceId ?? '1'),
            item_id: String(item.item_id ?? item.itemId ?? item.stream_id ?? item.id ?? ''),
            item_type: String(item.item_type ?? item.itemType ?? 'channel'),
            name: String(item.name || ''),
            thumb_url: String(item.thumb_url ?? item.thumbUrl ?? item.stream_icon ?? ''),
            package_id: String(item.package_id ?? item.packageId ?? ''),
            global_stream_id: String(item.global_stream_id ?? item.globalStreamId ?? ''),
            container_extension: String(item.container_extension ?? item.containerExtension ?? 'mp4'),
            created_at: item.created_at || new Date().toISOString()
          }));
          localStorage.setItem('velora_favorites_items', JSON.stringify(this.items));
        }
      } catch (err) {
        console.warn('Failed to load favorites from server, using local storage:', err.message);
      } finally {
        this.loading = false;
      }
    },

    isFavorite(itemOrId, type) {
      if (!itemOrId) return false;
      if (typeof itemOrId === 'object') {
        const id = String(itemOrId.item_id || itemOrId.stream_id || itemOrId.id || '');
        const itemType = type || itemOrId.item_type || itemOrId.itemType || (itemOrId.stream_type === 'movie' ? 'movie' : itemOrId.stream_type === 'series' ? 'series' : 'channel');
        const sourceId = String(itemOrId.source_id || itemOrId.sourceId || '1');
        return this.favoriteKeys.has(makeFavoriteKey(sourceId, id, itemType)) || this.favoriteKeys.has(id);
      }
      return this.favoriteKeys.has(String(itemOrId));
    },

    async toggleFavorite(item, explicitType = null) {
      if (!item) return;

      const sourceId = String(item.source_id || item.sourceId || '1');
      const itemId = String(item.item_id || item.stream_id || item.id || '');
      if (!itemId) return;

      let itemType = explicitType || item.item_type || item.itemType;
      if (!itemType) {
        if (item.stream_type === 'movie' || item.container_extension) itemType = 'movie';
        else if (item.stream_type === 'series' || item.series_id) itemType = 'series';
        else itemType = 'channel';
      }

      const name = String(item.name || item.title || item.clean_name || '');
      const thumbUrl = String(item.thumb_url || item.thumbUrl || item.stream_icon || item.logo || item.cover || '');
      const packageId = String(item.package_id || item.packageId || item.category_id || '');
      const globalStreamId = String(item.global_stream_id || item.globalStreamId || '');
      const containerExtension = String(item.container_extension || item.containerExtension || 'mp4');

      const existingIndex = this.items.findIndex(i => {
        const iId = String(i.item_id || i.itemId || i.stream_id || i.id);
        const iType = String(i.item_type || i.itemType);
        return iId === itemId && iType === itemType;
      });

      const removing = existingIndex !== -1;

      if (removing) {
        this.items.splice(existingIndex, 1);
        this.showToast('Retiré des favoris');
      } else {
        const newFav = {
          source_id: sourceId,
          item_id: itemId,
          item_type: itemType,
          name,
          thumb_url: thumbUrl,
          package_id: packageId,
          global_stream_id: globalStreamId,
          container_extension: containerExtension,
          created_at: new Date().toISOString()
        };
        this.items.unshift(newFav);
        this.showToast('Ajouté aux favoris');
      }

      localStorage.setItem('velora_favorites_items', JSON.stringify(this.items));

      // Synchronize with backend API
      try {
        if (removing) {
          await api.removeFavorite({ sourceId, itemId, itemType });
        } else {
          await api.addFavorite({
            sourceId,
            itemId,
            itemType,
            name,
            thumbUrl,
            packageId,
            globalStreamId,
            containerExtension
          });
        }
      } catch (err) {
        console.error('Favorites server sync error:', err.message);
      }
    },

    showToast(message, isError = false) {
      this.toastMessage = message;
      this.toastIsError = isError;
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        this.toastMessage = null;
      }, 2400);
    }
  }
});

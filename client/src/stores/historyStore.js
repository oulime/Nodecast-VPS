import { defineStore } from 'pinia';
import { useAuthStore } from './authStore.js';

function sanitizeImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return '';
}

export const useHistoryStore = defineStore('history', {
  state: () => ({
    resumeItems: [],
    loading: false
  }),
  actions: {
    async loadAll() {
      this.loading = true;
      const auth = useAuthStore();
      const rawList = [];

      // 1. Fetch from Database (/api/history)
      try {
        const headers = {};
        if (auth.token) {
          headers['Authorization'] = `Bearer ${auth.token}`;
        }
        const res = await fetch('/api/history', { headers });
        if (res.ok) {
          const rows = await res.json();
          if (Array.isArray(rows)) {
            for (const r of rows) {
              const d = r.data || {};
              const progress = Number(r.progress || 0);
              const duration = Number(r.duration || 0);
              const percent = duration > 0 ? Math.min(100, Math.max(0, (progress / duration) * 100)) : 15;
              const imgUrl = sanitizeImageUrl(d.cover || d.stream_icon || d.poster || d.thumb_url || d.image || d.movie_image || d.cover_big);

              rawList.push({
                id: String(r.item_id || r.id),
                stream_id: String(r.item_id || r.id),
                item_id: String(r.item_id || r.id),
                type: r.item_type || (d.seasonNumber ? 'series' : 'movie'),
                name: d.name || d.title || 'Titre inconnu',
                title: d.title || d.name,
                thumb_url: imgUrl,
                cover: imgUrl,
                stream_icon: imgUrl,
                last_position: progress,
                progress: progress,
                duration: duration,
                percent: percent,
                source_id: r.source_id || d.source_id || 10,
                series_id: r.parent_id || d.series_id || null,
                season_number: d.seasonNumber || d.season_number,
                episode_number: d.episodeNumber || d.episode_number,
                updated_at: r.updated_at || Date.now()
              });
            }
          }
        }
      } catch (err) {
        console.warn('[History] Failed to load history from database', err);
      }

      // 2. Scan LocalStorage for any local cached entries
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('velora_resume_') || key.startsWith('velora_watch_history_'))) {
            try {
              const val = JSON.parse(localStorage.getItem(key));
              if (val && (val.stream_id || val.id)) {
                const streamId = String(val.stream_id || val.id);
                if (!rawList.some(x => String(x.stream_id) === streamId)) {
                  const progress = Number(val.last_position || val.progress || 0);
                  const duration = Number(val.duration || 0);
                  const percent = duration > 0 ? Math.min(100, Math.max(0, (progress / duration) * 100)) : 15;
                  const imgUrl = sanitizeImageUrl(val.thumb_url || val.cover || val.stream_icon || val.poster || val.image || val.movie_image);

                  rawList.push({
                    id: streamId,
                    stream_id: streamId,
                    item_id: streamId,
                    type: val.type || (val.season_number ? 'series' : 'movie'),
                    name: val.name || val.title || 'Titre',
                    thumb_url: imgUrl,
                    cover: imgUrl,
                    stream_icon: imgUrl,
                    last_position: progress,
                    progress: progress,
                    duration: duration,
                    percent: percent,
                    source_id: val.source_id || 10,
                    series_id: val.series_id || null,
                    season_number: val.season_number,
                    episode_number: val.episode_number,
                    updated_at: val.updated_at || Date.now()
                  });
                }
              }
            } catch (e) {}
          }
        }
      } catch (e) {}

      // 3. Deduplicate multiple episodes from the same series (Keep only the latest episode watched!)
      const seriesMap = new Map();
      const dedupedList = [];

      // Sort by newest first
      rawList.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));

      for (const item of rawList) {
        if (item.type === 'series' || item.series_id) {
          const seriesKey = String(item.series_id || item.name.split('—')[0].split('Saison')[0].trim().toLowerCase());
          if (!seriesMap.has(seriesKey)) {
            seriesMap.set(seriesKey, true);
            dedupedList.push(item);
          }
        } else {
          dedupedList.push(item);
        }
      }

      this.resumeItems = dedupedList;
      this.loading = false;

      // 4. Proactively enrich any missing posters in the background
      for (const item of this.resumeItems) {
        if (!item.thumb_url) {
          this.enrichPoster(item);
        }
      }
    },

    async enrichPoster(item) {
      const sourceId = item.source_id || 10;
      const targetId = item.series_id || item.stream_id || item.item_id;
      if (!targetId) return;

      try {
        const endpoint = (item.type === 'series' || item.series_id)
          ? `/api/proxy/xtream/${encodeURIComponent(sourceId)}/series_info?series_id=${encodeURIComponent(targetId)}`
          : `/api/proxy/xtream/${encodeURIComponent(sourceId)}/vod_info?vod_id=${encodeURIComponent(targetId)}`;
        const res = await fetch(endpoint);
        if (res.ok) {
          const data = await res.json();
          const info = data.info || data.movie_data || {};
          const poster = sanitizeImageUrl(info.movie_image || info.cover_big || info.cover || info.stream_icon || info.poster);
          if (poster) {
            item.thumb_url = poster;
            item.cover = poster;
            item.stream_icon = poster;
            // Update cache
            try {
              const localKey = `velora_resume_${item.stream_id}`;
              const localVal = JSON.parse(localStorage.getItem(localKey) || '{}');
              localVal.thumb_url = poster;
              localVal.cover = poster;
              localVal.stream_icon = poster;
              localStorage.setItem(localKey, JSON.stringify(localVal));
            } catch (e) {}
          }
        }
      } catch (e) {}
    },

    async saveProgress(stream, progress, duration) {
      if (!stream || !progress) return;
      const rawId = String(stream.stream_id || stream.item_id || stream.id || '');
      if (!rawId) return;

      const isSeries = !!(stream.season_number || stream.seasonNumber || stream.type === 'series');
      const itemType = isSeries ? 'series' : 'movie';
      const sourceId = stream.source_id || 10;
      const parentId = stream.series_id || (isSeries ? stream.parent_id : null);
      const auth = useAuthStore();

      const posterImg = sanitizeImageUrl(stream.stream_icon || stream.cover || stream.thumb_url || stream.poster || stream.image || stream.movie_image);
      const payloadData = {
        name: stream.clean_name || stream.name || stream.title,
        title: stream.title || stream.clean_name || stream.name,
        cover: posterImg,
        seasonNumber: stream.season_number || stream.seasonNumber,
        episodeNumber: stream.episode_number || stream.episodeNumber,
        source_id: sourceId
      };

      // 1. Save to Database via POST /api/history
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (auth.token) {
          headers['Authorization'] = `Bearer ${auth.token}`;
        }
        await fetch('/api/history', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            id: rawId,
            type: itemType,
            parentId: parentId || null,
            progress: Math.floor(progress),
            duration: Math.floor(duration || 0),
            sourceId: sourceId,
            data: payloadData
          })
        });
      } catch (err) {
        console.warn('[History] Failed to save to database', err);
      }

      // 2. Save to LocalStorage cache
      try {
        const storagePayload = {
          stream_id: rawId,
          type: itemType,
          name: payloadData.name,
          thumb_url: posterImg,
          cover: posterImg,
          stream_icon: posterImg,
          last_position: Math.floor(progress),
          progress: Math.floor(progress),
          duration: Math.floor(duration || 0),
          source_id: sourceId,
          series_id: parentId,
          updated_at: Date.now()
        };
        localStorage.setItem(`velora_resume_${rawId}`, JSON.stringify(storagePayload));
      } catch (e) {}

      // 3. Update in-memory state with single-series deduplication
      const percent = duration > 0 ? Math.min(100, Math.max(0, (progress / duration) * 100)) : 15;
      const updatedItem = {
        id: rawId,
        stream_id: rawId,
        item_id: rawId,
        type: itemType,
        name: payloadData.name,
        thumb_url: posterImg,
        cover: posterImg,
        stream_icon: posterImg,
        last_position: Math.floor(progress),
        progress: Math.floor(progress),
        duration: Math.floor(duration || 0),
        percent: percent,
        source_id: sourceId,
        series_id: parentId,
        updated_at: Date.now()
      };

      // Remove any previous episode of this series or this item
      this.resumeItems = this.resumeItems.filter(x => {
        if (String(x.stream_id) === rawId) return false;
        if (parentId && String(x.series_id) === String(parentId)) return false;
        return true;
      });

      this.resumeItems.unshift(updatedItem);

      if (!posterImg) {
        this.enrichPoster(updatedItem);
      }
    },

    async removeResumeItem(itemId) {
      const rawId = String(itemId);
      const auth = useAuthStore();

      // 1. Delete from Database
      try {
        const headers = {};
        if (auth.token) {
          headers['Authorization'] = `Bearer ${auth.token}`;
        }
        await fetch(`/api/history/${encodeURIComponent(rawId)}`, {
          method: 'DELETE',
          headers
        });
      } catch (err) {
        console.warn('[History] Failed to delete from database', err);
      }

      // 2. Delete from LocalStorage
      try {
        localStorage.removeItem(`velora_resume_${rawId}`);
        localStorage.removeItem(`velora_watch_history_${rawId}`);
      } catch (e) {}

      // 3. Remove from in-memory state
      this.resumeItems = this.resumeItems.filter(x => String(x.stream_id || x.item_id || x.id) !== rawId);
    }
  }
});

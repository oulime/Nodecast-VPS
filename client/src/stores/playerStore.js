import { defineStore } from 'pinia';

function toBase64Url(str) {
  try {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return str;
  }
}

export const usePlayerStore = defineStore('player', {
  state: () => ({
    currentStream: null,
    streamUrl: '',
    sourceUrl: '',
    sessionId: null,
    startAt: 0,
    totalDurationSeconds: 0,
    isPlaying: false,
    isBuffering: true,
    isMuted: false,
    isStretched: false,
    error: null,
    // Series Episodes Queue
    playlist: [],
    currentIndex: -1
  }),
  getters: {
    isSeries: (state) => !!(state.currentStream?.season_number || state.currentStream?.seasonNumber || state.currentStream?.type === 'series'),
    hasNextEpisode: (state) => state.currentIndex >= 0 && state.currentIndex < state.playlist.length - 1,
    hasPrevEpisode: (state) => state.currentIndex > 0
  },
  actions: {
    async playStream(stream, options = {}) {
      if (!stream) return;
      this.currentStream = stream;
      this.isBuffering = true;
      this.error = null;
      this.startAt = options.startAt || stream.last_position || 0;
      
      // Calculate total duration in seconds from movie/episode metadata
      let durSecs = options.durationSeconds || stream.durationSeconds || 0;
      if (!durSecs && stream.info?.duration_secs) {
        durSecs = Number(stream.info.duration_secs);
      }
      if (!durSecs && stream.info?.duration) {
        durSecs = Number(stream.info.duration) * 60;
      }
      if (!durSecs && stream.duration && stream.duration > 0) {
        durSecs = Number(stream.duration);
      }
      this.totalDurationSeconds = durSecs;

      try {
        const rawId = String(stream.stream_id || stream.item_id || stream.id || '');
        const sourceId = String(stream.source_id || stream.nodecast_source_id || stream.sourceId || '');
        const ext = String(stream.container_extension || (stream.kind === 'vod' || stream.stream_type === 'movie' ? 'mkv' : 'm3u8')).toLowerCase();
        const isSeries = !!(stream.season_number || stream.seasonNumber || stream.type === 'series');
        const streamKind = isSeries ? 'series' : (stream.container_extension || stream.kind === 'vod' || stream.stream_type === 'movie' ? 'movie' : 'live');

        // 1. Resolve raw upstream stream URL
        let resolvedUpstreamUrl = '';
        if (sourceId && sourceId !== 'all') {
          try {
            const res = await fetch(`/api/proxy/xtream/${encodeURIComponent(sourceId)}/stream/${encodeURIComponent(rawId)}/${streamKind}?container=${ext}`);
            if (res.ok) {
              const data = await res.json();
              resolvedUpstreamUrl = data.url;
            }
          } catch (e) {}
        }

        if (!resolvedUpstreamUrl) {
          try {
            const res = await fetch(`/api/proxy/xtream/all/stream/${encodeURIComponent(rawId)}/${streamKind}?container=${ext}`);
            if (res.ok) {
              const data = await res.json();
              resolvedUpstreamUrl = data.url;
            }
          } catch (e) {}
        }

        if (!resolvedUpstreamUrl && sourceId) {
          const globalId = toBase64Url(`${sourceId}:${rawId}`);
          try {
            const res = await fetch(`/api/proxy/xtream/stream/${encodeURIComponent(globalId)}/${streamKind}?container=${ext}`);
            if (res.ok) {
              const data = await res.json();
              resolvedUpstreamUrl = data.url;
            }
          } catch (e) {}
        }

        if (resolvedUpstreamUrl) {
          this.sourceUrl = resolvedUpstreamUrl;
          const lower = resolvedUpstreamUrl.toLowerCase();
          
          if (streamKind === 'movie' || streamKind === 'series' || lower.includes('.mkv') || lower.includes('.avi') || lower.includes('.webm') || lower.includes('.mov') || lower.includes('.flv')) {
            // Start transcoding session with startAt for instant seek & full duration
            try {
              const transcodeRes = await fetch('/api/transcode/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  url: resolvedUpstreamUrl,
                  mode: 'vod',
                  startAt: this.startAt
                })
              });
              if (transcodeRes.ok) {
                const transcodeData = await transcodeRes.json();
                this.sessionId = transcodeData.sessionId;
                if (transcodeData.durationSeconds && !this.totalDurationSeconds) {
                  this.totalDurationSeconds = transcodeData.durationSeconds;
                }
                if (transcodeData.playlistUrl) {
                  this.streamUrl = transcodeData.playlistUrl;
                  return;
                }
              }
            } catch (err) {
              console.warn('[Player] VOD transcode session error, falling back', err);
            }

            // Fallback
            if (lower.includes('.mkv') || lower.includes('.avi')) {
              this.streamUrl = `/api/remux?url=${encodeURIComponent(resolvedUpstreamUrl)}`;
            } else {
              this.streamUrl = `/api/proxy/stream?url=${encodeURIComponent(resolvedUpstreamUrl)}`;
            }
          } else {
            // Live or direct MP4/HLS
            this.streamUrl = `/api/proxy/stream?url=${encodeURIComponent(resolvedUpstreamUrl)}`;
          }
        } else {
          this.streamUrl = `/api/proxy/stream?url=${encodeURIComponent(`http://localhost:3000/live/${rawId}.m3u8`)}`;
        }
      } catch (err) {
        console.error('[Player] Failed to prepare stream', err);
        this.error = err.message || 'Erreur de flux';
      }
    },
    async transcodeLive() {
      if (!this.sourceUrl) return;
      try {
        const transcodeRes = await fetch('/api/transcode/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: this.sourceUrl,
            mode: 'live'
          })
        });
        if (transcodeRes.ok) {
          const transcodeData = await transcodeRes.json();
          this.sessionId = transcodeData.sessionId;
          if (transcodeData.playlistUrl) {
            this.streamUrl = transcodeData.playlistUrl;
          }
        }
      } catch (err) {
        console.warn('[Player] Live transcode error', err);
      }
    },
    async seekToTime(targetSeconds) {
      if (!this.sourceUrl) return;
      this.isBuffering = true;
      this.startAt = Math.max(0, Math.floor(targetSeconds));
      
      // If we have a transcode session, restart session at target offset
      try {
        const transcodeRes = await fetch('/api/transcode/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: this.sourceUrl,
            mode: 'vod',
            startAt: this.startAt
          })
        });
        if (transcodeRes.ok) {
          const transcodeData = await transcodeRes.json();
          this.sessionId = transcodeData.sessionId;
          if (transcodeData.playlistUrl) {
            this.streamUrl = transcodeData.playlistUrl + '?t=' + Date.now();
          }
        }
      } catch (err) {
        console.warn('[Player] Seek transcode session error', err);
      }
    },
    playSeriesEpisode(episode, episodeList = [], seriesObj = {}) {
      this.playlist = episodeList || [];
      this.currentIndex = this.playlist.findIndex(e => String(e.id || e.stream_id) === String(episode.id || episode.stream_id));
      
      let durSecs = 0;
      if (episode.info?.duration_secs) durSecs = Number(episode.info.duration_secs);
      else if (episode.info?.duration) durSecs = Number(episode.info.duration) * 60;

      const payload = {
        ...episode,
        stream_id: episode.id || episode.stream_id,
        source_id: seriesObj.source_id || 10,
        container_extension: episode.container_extension || 'mkv',
        clean_name: `${seriesObj.clean_name || seriesObj.name} — S${episode.season_number || episode.seasonNumber || 1}E${episode.episode_num || episode.episodeNum}`,
        season_number: episode.season_number || episode.seasonNumber || 1,
        episode_number: episode.episode_num || episode.episodeNum,
        type: 'series',
        series_id: seriesObj.stream_id || seriesObj.id,
        stream_icon: seriesObj.stream_icon
      };

      this.playStream(payload, { durationSeconds: durSecs });
    },
    playNextEpisode() {
      if (this.hasNextEpisode) {
        const next = this.playlist[this.currentIndex + 1];
        if (next) {
          this.playSeriesEpisode(next, this.playlist, this.currentStream);
        }
      }
    },
    playPrevEpisode() {
      if (this.hasPrevEpisode) {
        const prev = this.playlist[this.currentIndex - 1];
        if (prev) {
          this.playSeriesEpisode(prev, this.playlist, this.currentStream);
        }
      }
    },
    stop() {
      if (this.sessionId) {
        try {
          fetch(`/api/transcode/session/${encodeURIComponent(this.sessionId)}`, { method: 'DELETE' }).catch(() => {});
        } catch {}
      }
      this.currentStream = null;
      this.streamUrl = '';
      this.sourceUrl = '';
      this.sessionId = null;
      this.startAt = 0;
      this.totalDurationSeconds = 0;
      this.isPlaying = false;
      this.isBuffering = false;
      this.error = null;
      this.playlist = [];
      this.currentIndex = -1;
    }
  }
});

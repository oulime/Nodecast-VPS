<template>
  <div id="player-container" class="player-container relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl group select-none">
    <div class="video-wrapper w-full h-full relative">
      <!-- Video Element -->
      <video
        ref="videoRef"
        id="video"
        playsinline
        webkit-playsinline
        x5-playsinline="true"
        x5-video-player-type="h5-page"
        x5-video-player-fullscreen="false"
        x5-video-orientation="landscape"
        controlslist="nofullscreen nodownload noplaybackrate"
        disablepictureinpicture
        preload="auto"
        crossorigin="anonymous"
        :class="['w-full h-full', player.isStretched ? 'object-fill' : 'object-contain']"
        @playing="onPlaying"
        @waiting="onWaiting"
        @canplay="onCanPlay"
        @timeupdate="onTimeUpdate"
        @error="onError"
      ></video>

      <!-- Buffering Overlay -->
      <div
        v-if="player.isBuffering"
        id="player-buffering"
        class="player-buffering absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-20 pointer-events-none"
        role="status"
        aria-live="polite"
      >
        <div class="player-buffering__spinner w-10 h-10 border-3 rounded-full animate-spin"></div>
        <span class="player-buffering__label text-xs font-bold text-white mt-3 tracking-wide">Chargement…</span>
      </div>

      <!-- Channel / Stream Title Badge Overlay -->
      <div
        v-if="player.currentStream"
        class="player-title-badge absolute top-3 left-3 z-30 flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-black/80 backdrop-blur-md text-white shadow-lg pointer-events-none transition-opacity duration-300"
      >
        <span class="player-title-dot w-2 h-2 rounded-full animate-pulse"></span>
        <span class="text-xs font-bold truncate max-w-[240px]">{{ player.currentStream.clean_name || player.currentStream.name }}</span>
      </div>

      <!-- Live Controls Overlay -->
      <div
        id="live-controls-overlay"
        class="live-controls-overlay absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-30 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200"
      >
        <div class="live-controls-row flex items-center gap-3 w-full justify-between">
          <!-- Left: Play/Pause & Mute & Live Badge -->
          <div class="flex items-center gap-3">
            <!-- Play / Pause Button -->
            <button
              id="live-ctl-play"
              @click="togglePlay"
              type="button"
              class="live-ctl-btn w-9 h-9 flex items-center justify-center rounded-xl text-white transition-all active:scale-95"
              aria-label="Play/Pause"
            >
              <svg v-if="!player.isPlaying" class="w-4 h-4 fill-current" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <svg v-else class="w-4 h-4 fill-current" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            </button>

            <!-- Mute Button -->
            <button
              id="live-ctl-mute"
              @click="toggleMute"
              type="button"
              class="live-ctl-btn w-9 h-9 flex items-center justify-center rounded-xl text-white transition-all active:scale-95"
              aria-label="Mute"
            >
              <svg v-if="!player.isMuted" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              <svg v-else class="w-4 h-4 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
            </button>

            <!-- Live Status Indicator -->
            <span class="live-ctl-status flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-white px-2.5 py-1 rounded-md">
              <span class="live-ctl-status__dot w-1.5 h-1.5 rounded-full animate-ping"></span>
              LIVE
            </span>
          </div>

          <!-- Right: Aspect Ratio & Fullscreen -->
          <div class="flex items-center gap-2.5">
            <!-- Format / Aspect Ratio Button -->
            <button
              id="live-ctl-format"
              @click="toggleFormat"
              type="button"
              :class="[
                'px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 live-ctl-format-btn',
                player.isStretched ? 'is-active' : ''
              ]"
              title="Changer le format d'image"
            >
              <span>{{ player.isStretched ? '16:9 Rempli' : 'Original' }}</span>
            </button>

            <!-- Fullscreen Button -->
            <button
              id="live-ctl-fullscreen"
              @click="toggleFullscreen"
              type="button"
              class="live-ctl-btn w-9 h-9 flex items-center justify-center rounded-xl text-white transition-all active:scale-95"
              aria-label="Plein écran"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import Hls from 'hls.js';
import { usePlayerStore } from '../stores/playerStore.js';
import { useHistoryStore } from '../stores/historyStore.js';

const player = usePlayerStore();
const history = useHistoryStore();
const videoRef = ref(null);
let hls = null;
let lastProgressSave = 0;

function loadStream(url) {
  if (!url || !videoRef.value) return;
  
  player.isBuffering = true;
  const video = videoRef.value;

  if (hls) {
    hls.destroy();
    hls = null;
  }

  if (Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      maxBufferLength: 60,
      maxMaxBufferLength: 120,
      maxBufferSize: 60 * 1000 * 1000,
      maxBufferHole: 0.5,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      liveDurationInfinity: true,
      highBufferWatchdogPeriod: 2,
      manifestLoadingMaxRetry: 6,
      fragLoadingMaxRetry: 8
    });

    hls.loadSource(url);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (player.currentStream?.last_position && Number.isFinite(player.currentStream.last_position)) {
        try {
          video.currentTime = player.currentStream.last_position;
        } catch {}
      }

      video.play().catch(err => {
        if (err.name !== 'AbortError') {
          console.warn('[Player] Autoplay prevented', err);
        }
      });
    });

    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.warn('[Player] HLS fatal error', data);
        if (data.details === Hls.ErrorDetails.BUFFER_ADD_CODEC_ERROR ||
            data.details === Hls.ErrorDetails.BUFFER_INCOMPATIBLE_CODECS_ERROR ||
            data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          console.info('[Player] Incompatible codec detected, falling back to server transcode');
          player.transcodeLive();
          return;
        }
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad();
            break;
          default:
            hls.destroy();
            break;
        }
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    video.play().catch(err => {
      if (err.name !== 'AbortError') console.warn('[Player] Native play failed', err);
    });
  }
}

function onPlaying() {
  player.isPlaying = true;
  player.isBuffering = false;
}

function onWaiting() {
  player.isBuffering = true;
}

function onCanPlay() {
  player.isBuffering = false;
}

function onTimeUpdate() {
  if (!videoRef.value || !player.currentStream) return;
  const current = videoRef.value.currentTime;
  const duration = videoRef.value.duration || 0;
  player.progress = current;
  player.duration = duration;

  const now = Date.now();
  if (now - lastProgressSave > 5000 && duration > 0) {
    lastProgressSave = now;
    history.saveProgress(player.currentStream, current, duration);
  }
}

function onError(e) {
  console.warn('[Player] Video element error', e);
  player.isBuffering = false;
}

function togglePlay() {
  if (!videoRef.value) return;
  if (player.isPlaying) {
    videoRef.value.pause();
    player.isPlaying = false;
  } else {
    videoRef.value.play().then(() => {
      player.isPlaying = true;
    }).catch(() => {});
  }
}

function toggleMute() {
  if (!videoRef.value) return;
  videoRef.value.muted = !videoRef.value.muted;
  player.isMuted = videoRef.value.muted;
}

function toggleFormat() {
  player.isStretched = !player.isStretched;
}

function toggleFullscreen() {
  const container = document.getElementById('player-container');
  if (!container) return;
  if (!document.fullscreenElement) {
    container.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

watch(() => player.streamUrl, (newUrl) => {
  if (newUrl) {
    loadStream(newUrl);
  } else if (hls) {
    hls.destroy();
    hls = null;
  }
});

onMounted(() => {
  if (player.streamUrl) {
    loadStream(player.streamUrl);
  }
});

onBeforeUnmount(() => {
  if (hls) {
    hls.destroy();
    hls = null;
  }
});
</script>

<style scoped>
.player-container {
  border: 1.5px solid var(--live-theme-border, rgba(168, 85, 247, 0.4));
  box-shadow: 0 10px 35px var(--live-theme-subtle, rgba(168, 85, 247, 0.2)), 0 0 30px rgba(0, 0, 0, 0.8);
  transition: border-color 0.4s ease, box-shadow 0.4s ease;
}

.player-buffering__spinner {
  border: 3px solid var(--live-theme-subtle, rgba(168, 85, 247, 0.2));
  border-top-color: var(--live-theme-primary, #a855f7);
  transition: border-color 0.4s ease;
}

.player-title-badge {
  border: 1px solid var(--live-theme-border, rgba(168, 85, 247, 0.4));
  box-shadow: 0 4px 16px var(--live-theme-subtle, rgba(168, 85, 247, 0.25));
  transition: border-color 0.4s ease, box-shadow 0.4s ease;
}

.player-title-dot {
  background-color: var(--live-theme-primary, #10b981);
  box-shadow: 0 0 8px var(--live-theme-glow, rgba(16, 185, 129, 0.8));
  transition: background-color 0.4s ease, box-shadow 0.4s ease;
}

.live-ctl-btn {
  background: var(--live-theme-subtle, rgba(147, 51, 234, 0.25));
  border: 1px solid var(--live-theme-border, rgba(168, 85, 247, 0.4));
  transition: all 0.2s ease;
}

.live-ctl-btn:hover {
  background: var(--live-theme-primary, #a855f7);
  border-color: #ffffff;
  box-shadow: 0 0 14px var(--live-theme-glow, rgba(168, 85, 247, 0.5));
}

.live-ctl-status {
  background: rgba(0, 0, 0, 0.75);
  border: 1px solid var(--live-theme-border, rgba(168, 85, 247, 0.4));
  transition: border-color 0.4s ease;
}

.live-ctl-status__dot {
  background-color: #ef4444 !important;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.9) !important;
}

.live-ctl-format-btn {
  background: rgba(0, 0, 0, 0.65);
  border: 1px solid var(--live-theme-border, rgba(168, 85, 247, 0.4));
  color: #fff;
  transition: all 0.2s ease;
}

.live-ctl-format-btn.is-active {
  background: var(--live-theme-primary, #9333ea);
  border-color: #ffffff;
  box-shadow: 0 0 12px var(--live-theme-glow, rgba(147, 51, 234, 0.5));
}
</style>

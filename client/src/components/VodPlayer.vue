<template>
  <div
    id="vod-player-container"
    :class="[
      'player-container player-container--vod relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl select-none group',
      player.isSeries ? 'player-container--series-episode' : '',
      isControlsVisible ? 'is-controls-active' : 'is-controls-idle'
    ]"
    @mousemove="handleUserActivity"
    @mouseenter="handleUserActivity"
    @touchstart="handleUserActivity"
  >
    <!-- Dismiss Close Button (Top-Right X) -->
    <button
      type="button"
      id="btn-close-vod-player"
      class="vel-player-dismiss-x"
      title="Fermer le lecteur VOD"
      aria-label="Fermer le lecteur VOD"
      tabindex="0"
      data-tv-focusable="true"
      @click.stop="player.stop()"
    >
      ×
    </button>

    <!-- Top Left: Now Playing Title Badge -->
    <div
      v-if="player.currentStream"
      id="now-playing-vod"
      class="player-now-playing vel-now-playing vel-now-playing--vod transition-opacity duration-200"
      :class="isControlsVisible ? 'opacity-100' : 'opacity-0'"
      role="status"
      aria-live="polite"
    >
      <span class="vel-now-playing__badge">
        <span class="vel-now-playing__pulse"></span>
        <span class="vel-now-playing__title truncate max-w-[240px] sm:max-w-[420px]">
          {{ player.currentStream.clean_name || player.currentStream.name }}
        </span>
      </span>
    </div>

    <div class="video-wrapper w-full h-full relative" @click="handleWrapperClick">
      <!-- Video Element -->
      <video
        ref="videoRef"
        id="video-vod"
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
        :class="['w-full h-full block bg-black', player.isStretched ? 'object-fill' : 'object-contain']"
        @playing="onPlaying"
        @pause="onPause"
        @waiting="onWaiting"
        @canplay="onCanPlay"
        @timeupdate="onTimeUpdate"
        @loadedmetadata="onLoadedMetadata"
        @ended="onEnded"
        @error="onError"
      ></video>

      <!-- Center Controls Overlay (Center Play + -10s + +10s + Buffering Spinner) -->
      <div
        id="vod-center-controls"
        class="vel-vod-center-controls"
        :class="{ 'vel-vod-center-controls--idle': !isControlsVisible && player.isPlaying && !player.isBuffering }"
        @click.stop
      >
        <!-- Center Skip Back -10s -->
        <button
          id="vod-ctl-back-10"
          type="button"
          class="vel-vod-center-btn vel-vod-skip-btn"
          aria-label="Reculer de 10 secondes"
          title="−10 secondes"
          tabindex="0"
          data-tv-focusable="true"
          @click.stop="skip(-10)"
        >
          <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <path class="vel-vod-skip-btn__arc" d="M10 13.5A17 17 0 1 1 7.5 30"></path>
            <path class="vel-vod-skip-btn__head" d="M14 5.5 4 12l10 6.5Z"></path>
            <text x="24" y="25">10</text>
          </svg>
        </button>

        <!-- Center Main Play / Pause Button / Buffering Spinner -->
        <button
          id="vod-center-play"
          type="button"
          class="vel-vod-center-btn vel-vod-center-btn--play"
          aria-label="Play"
          tabindex="0"
          data-tv-focusable="true"
          @click.stop="togglePlay"
        >
          <div v-if="player.isBuffering" class="vel-vod-center-spinner" aria-hidden="true"></div>
          <svg v-else-if="!player.isPlaying" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        </button>

        <!-- Center Skip Forward +10s -->
        <button
          id="vod-ctl-forward-10"
          type="button"
          class="vel-vod-center-btn vel-vod-skip-btn"
          aria-label="Avancer de 10 secondes"
          title="+10 secondes"
          tabindex="0"
          data-tv-focusable="true"
          @click.stop="skip(10)"
        >
          <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <path class="vel-vod-skip-btn__arc" d="M38 13.5A17 17 0 1 0 40.5 30"></path>
            <path class="vel-vod-skip-btn__head" d="M34 5.5 44 12l-10 6.5Z"></path>
            <text x="24" y="25">10</text>
          </svg>
        </button>
      </div>

      <!-- Bottom Controls Overlay -->
      <div
        id="vod-controls-overlay"
        class="vod-controls-overlay"
        :class="{ 'vod-controls-overlay--idle': !isControlsVisible && player.isPlaying }"
        @click.stop
      >
        <div class="vod-controls-row">
          <!-- Previous Episode (Series only) -->
          <button
            v-if="player.isSeries"
            id="vod-ctl-prev-episode"
            type="button"
            class="vod-ctl-btn vel-episode-nav-btn"
            aria-label="Épisode précédent"
            title="Épisode précédent"
            tabindex="0"
            data-tv-focusable="true"
            :disabled="!player.hasPrevEpisode"
            :class="{ 'opacity-30 pointer-events-none': !player.hasPrevEpisode }"
            @click.stop="player.playPrevEpisode()"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>

          <!-- Bottom Play / Pause Button -->
          <button
            id="vod-ctl-play"
            type="button"
            class="vod-ctl-btn"
            :aria-label="player.isPlaying ? 'Pause' : 'Play'"
            :title="player.isPlaying ? 'Pause (Espace / K)' : 'Lecture (Espace / K)'"
            tabindex="0"
            data-tv-focusable="true"
            @click.stop="togglePlay"
          >
            <svg v-if="!player.isPlaying" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
            <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>

          <!-- Next Episode (Series only) -->
          <button
            v-if="player.isSeries"
            id="vod-ctl-next-episode"
            type="button"
            class="vod-ctl-btn vel-episode-nav-btn"
            aria-label="Épisode suivant"
            title="Épisode suivant"
            tabindex="0"
            data-tv-focusable="true"
            :disabled="!player.hasNextEpisode"
            :class="{ 'opacity-30 pointer-events-none': !player.hasNextEpisode }"
            @click.stop="player.playNextEpisode()"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M16 6h2v12h-2zm-10.5 12l8.5-6-8.5-6z"/></svg>
          </button>

          <!-- Interactive Seek Track -->
          <div
            id="vod-ctl-seek-track"
            ref="seekTrackRef"
            class="vod-ctl-seek-track"
            role="slider"
            aria-label="Seek"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="progressPercent"
            tabindex="0"
            data-tv-focusable="true"
            @click.stop="onSeekClick"
            @mousemove="onSeekHover"
            @mouseleave="seekHoverTime = null"
          >
            <!-- Hover Time Preview Tooltip -->
            <div
              v-if="seekHoverTime !== null"
              class="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded-md bg-black/90 border border-purple-500/50 text-[10px] font-mono font-bold text-white pointer-events-none shadow-md z-30"
              :style="{ left: seekHoverPos + '%' }"
            >
              {{ formatTime(seekHoverTime) }}
            </div>

            <div id="vod-ctl-seek-fill" class="vod-ctl-seek-fill" :style="{ width: progressPercent + '%' }"></div>
            <div id="vod-ctl-seek-handle" class="vod-ctl-seek-handle" :style="{ left: progressPercent + '%' }"></div>
          </div>

          <!-- Duration Label -->
          <span id="vod-ctl-duration" class="vod-ctl-time">
            {{ formatTime(realCurrentTime) }} / {{ formatTime(effectiveDuration) }}
          </span>

          <!-- Format Button (Original / 16:9 Rempli) -->
          <button
            id="vod-ctl-format"
            type="button"
            class="vod-ctl-btn vel-format-btn"
            :class="player.isStretched ? 'is-fill' : 'is-original'"
            :aria-label="player.isStretched ? 'Format vidéo : 16:9 rempli' : 'Format vidéo : original'"
            :title="player.isStretched ? 'Format : 16:9 rempli' : 'Format : original'"
            tabindex="0"
            data-tv-focusable="true"
            @click.stop="toggleFormat"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2"></rect>
              <path v-if="!player.isStretched" class="vel-format-lines" d="M7 15h10M7 9h10"></path>
              <path v-else class="vel-format-lines" d="M3 5l18 14M21 5L3 19"></path>
            </svg>
          </button>

          <!-- Fullscreen Button -->
          <button
            id="vod-ctl-fullscreen"
            type="button"
            class="vod-ctl-btn"
            aria-label="Plein écran"
            title="Plein écran (F)"
            tabindex="0"
            data-tv-focusable="true"
            @click.stop="toggleFullscreen"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import Hls from 'hls.js';
import { usePlayerStore } from '../stores/playerStore.js';
import { useHistoryStore } from '../stores/historyStore.js';

const player = usePlayerStore();
const history = useHistoryStore();
const videoRef = ref(null);
const seekTrackRef = ref(null);
const videoCurrentTime = ref(0);
const videoDuration = ref(0);
const isControlsVisible = ref(true);
const seekHoverTime = ref(null);
const seekHoverPos = ref(0);

let hls = null;
let controlsTimer = null;
let lastProgressSave = 0;

const effectiveDuration = computed(() => {
  if (player.totalDurationSeconds && player.totalDurationSeconds > 0) {
    return player.totalDurationSeconds;
  }
  return videoDuration.value || 0;
});

const realCurrentTime = computed(() => {
  return (player.startAt || 0) + (videoCurrentTime.value || 0);
});

const progressPercent = computed(() => {
  const dur = effectiveDuration.value;
  if (!dur || dur <= 0) return 0;
  return Math.min(100, Math.max(0, (realCurrentTime.value / dur) * 100));
});

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n) => (n < 10 ? '0' : '') + n;
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${mins}:${pad(secs)}`;
}

function handleUserActivity() {
  isControlsVisible.value = true;
  if (controlsTimer) clearTimeout(controlsTimer);
  if (player.isPlaying) {
    controlsTimer = setTimeout(() => {
      if (player.isPlaying) {
        isControlsVisible.value = false;
      }
    }, 3500);
  }
}

function handleWrapperClick(e) {
  if (e.target.closest('#vod-controls-overlay') || e.target.closest('#vod-center-controls') || e.target.closest('#btn-close-vod-player') || e.target.closest('.vel-player-dismiss-x')) {
    return;
  }
  togglePlay();
  handleUserActivity();
}

function loadStream(url) {
  if (!url || !videoRef.value) return;
  
  player.isBuffering = true;
  const video = videoRef.value;

  if (hls) {
    hls.destroy();
    hls = null;
  }

  if (Hls.isSupported() && (url.includes('.m3u8') || url.includes('/api/transcode/'))) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      maxBufferLength: 60,
      maxMaxBufferLength: 120,
      maxBufferSize: 60 * 1000 * 1000,
      maxBufferHole: 0.5,
      manifestLoadingMaxRetry: 6,
      fragLoadingMaxRetry: 8
    });

    hls.loadSource(url);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });

    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            hls.destroy();
            break;
        }
      }
    });
  } else {
    video.src = url;
    video.play().catch(() => {});
  }
}

function onPlaying() {
  player.isBuffering = false;
  player.isPlaying = true;
  handleUserActivity();
}

function onPause() {
  player.isPlaying = false;
  isControlsVisible.value = true;
  if (controlsTimer) clearTimeout(controlsTimer);
}

function onWaiting() {
  player.isBuffering = true;
}

function onCanPlay() {
  player.isBuffering = false;
}

function onLoadedMetadata() {
  if (videoRef.value) {
    videoDuration.value = videoRef.value.duration || 0;
  }
}

function onEnded() {
  if (player.isSeries && player.hasNextEpisode) {
    player.playNextEpisode();
  }
}

function onTimeUpdate() {
  if (!videoRef.value) return;
  videoCurrentTime.value = videoRef.value.currentTime;
  if (!videoDuration.value && videoRef.value.duration) {
    videoDuration.value = videoRef.value.duration;
  }

  const now = Date.now();
  if (now - lastProgressSave > 5000) {
    lastProgressSave = now;
    const dur = effectiveDuration.value;
    if (dur > 30) {
      history.saveProgress(player.currentStream, realCurrentTime.value, dur);
    }
  }
}

function onError(e) {
  console.warn('[VodPlayer] Video error', e);
  player.isBuffering = false;
}

function togglePlay() {
  if (!videoRef.value) return;
  if (videoRef.value.paused) {
    videoRef.value.play().catch(() => {});
    player.isPlaying = true;
  } else {
    videoRef.value.pause();
    player.isPlaying = false;
  }
  handleUserActivity();
}

function skip(seconds) {
  const dur = effectiveDuration.value || 999999;
  const target = Math.max(0, Math.min(dur, realCurrentTime.value + seconds));
  
  if (player.sessionId) {
    player.seekToTime(target);
  } else if (videoRef.value) {
    const directTarget = Math.max(0, Math.min(videoRef.value.duration || dur, videoRef.value.currentTime + seconds));
    videoRef.value.currentTime = directTarget;
    videoCurrentTime.value = directTarget;
  }
  handleUserActivity();
}

function onSeekClick(e) {
  if (!seekTrackRef.value) return;
  const rect = seekTrackRef.value.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, clickX / rect.width));
  const dur = effectiveDuration.value;
  if (dur > 0) {
    const target = ratio * dur;
    if (player.sessionId) {
      player.seekToTime(target);
    } else if (videoRef.value) {
      videoRef.value.currentTime = target;
      videoCurrentTime.value = target;
    }
  }
  handleUserActivity();
}

function onSeekHover(e) {
  if (!seekTrackRef.value) return;
  const rect = seekTrackRef.value.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, clickX / rect.width));
  const dur = effectiveDuration.value;
  if (dur > 0) {
    seekHoverTime.value = ratio * dur;
    seekHoverPos.value = ratio * 100;
  }
}

function toggleFormat() {
  player.isStretched = !player.isStretched;
}

function toggleFullscreen() {
  const container = document.getElementById('vod-player-container');
  if (!container) return;
  if (!document.fullscreenElement) {
    container.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

function onKeyDown(e) {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

  if (e.key === ' ' || e.code === 'Space' || e.key === 'k' || e.key === 'K') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
    e.preventDefault();
    skip(-10);
  } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
    e.preventDefault();
    skip(10);
  } else if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    toggleFullscreen();
  } else if ((e.key === 'n' || e.key === 'N') && player.isSeries && player.hasNextEpisode) {
    e.preventDefault();
    player.playNextEpisode();
  } else if ((e.key === 'p' || e.key === 'P') && player.isSeries && player.hasPrevEpisode) {
    e.preventDefault();
    player.playPrevEpisode();
  } else if (e.key === 'Escape') {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      player.stop();
    }
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
  window.addEventListener('keydown', onKeyDown);
  if (player.streamUrl) {
    loadStream(player.streamUrl);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  if (controlsTimer) clearTimeout(controlsTimer);
  if (hls) {
    hls.destroy();
    hls = null;
  }
});
</script>

<style scoped>
/* Exact Old Front Player Dismiss Button */
.player-container .vel-player-dismiss-x {
  position: absolute;
  top: 0.55rem;
  right: 0.55rem;
  z-index: 30;
  width: 2.1rem;
  height: 2.1rem;
  padding: 0;
  margin: 0;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  background: #08060eb8;
  color: #fffcfff2;
  font-size: 1.35rem;
  font-weight: 300;
  line-height: 1;
  font-family: system-ui, -apple-system, sans-serif;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.12s ease;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.player-container .vel-player-dismiss-x:hover {
  background: rgba(225, 29, 72, 0.85);
  border-color: rgba(253, 164, 175, 0.55);
  color: #fff;
  transform: scale(1.05);
}

/* Exact Old Front Now Playing Title Badge */
.player-now-playing.vel-now-playing--vod {
  position: absolute;
  top: 0.55rem;
  left: 0.65rem;
  z-index: 25;
  pointer-events: none;
}

.vel-now-playing__badge {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.28rem 0.65rem;
  border-radius: 999px;
  background: #08060eb8;
  border: 1px solid rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #fff;
  font-size: 0.76rem;
  font-weight: 700;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
}

.vel-now-playing__pulse {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.3), 0 0 8px #10b981;
  animation: velPulse 1.8s infinite;
}

@keyframes velPulse {
  0% { transform: scale(0.95); opacity: 0.8; }
  50% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(0.95); opacity: 0.8; }
}

/* Exact Old Front Center Controls */
.vel-vod-center-controls {
  position: absolute;
  inset: 0;
  z-index: 7;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(2.2rem, 12vw, 7rem);
  background: rgba(0, 0, 0, 0.2);
  pointer-events: none;
  opacity: 1;
  transition: opacity 0.2s ease;
}

.vel-vod-center-controls--idle {
  opacity: 0 !important;
  pointer-events: none !important;
}

.vel-vod-center-btn {
  width: clamp(3.3rem, 11vw, 5rem);
  height: clamp(3.3rem, 11vw, 5rem);
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border: 0;
  border-radius: 999px;
  color: #fff;
  background: transparent;
  box-shadow: none;
  cursor: pointer;
  pointer-events: auto;
  opacity: 0.76;
  transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.vel-vod-center-btn:hover,
.vel-vod-center-btn:focus-visible {
  outline: none;
  background: rgba(255, 255, 255, 0.14);
  opacity: 1;
  transform: scale(1.06);
}

.vel-vod-center-btn:active {
  transform: scale(0.94);
}

.vel-vod-center-btn--play {
  width: clamp(4rem, 13vw, 6rem);
  height: clamp(4rem, 13vw, 6rem);
  background: transparent;
}

.vel-vod-center-btn--play > svg {
  width: 58% !important;
  height: 58% !important;
  display: block;
  fill: currentColor;
}

.vel-vod-center-spinner {
  width: clamp(2.4rem, 7.5vw, 3.4rem);
  height: clamp(2.4rem, 7.5vw, 3.4rem);
  border-radius: 50%;
  border: 3.5px solid rgba(255, 255, 255, 0.22);
  border-top-color: #a855f7;
  animation: velVodCenterSpin 0.75s linear infinite;
  box-shadow: 0 0 24px rgba(168, 85, 247, 0.45);
  display: block;
}

@keyframes velVodCenterSpin {
  to { transform: rotate(360deg); }
}

.vel-vod-skip-btn svg {
  width: 76%;
  height: 76%;
  overflow: visible;
}

.vel-vod-skip-btn svg .vel-vod-skip-btn__arc {
  fill: none;
  stroke: currentColor;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.vel-vod-skip-btn svg .vel-vod-skip-btn__head {
  fill: currentColor;
  stroke: none;
}

.vel-vod-skip-btn svg text {
  fill: currentColor;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 13.5px;
  font-weight: 800;
  text-anchor: middle;
}

/* Exact Old Front Bottom Controls Overlay */
.vod-controls-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  padding: 0.9rem calc(0.9rem + env(safe-area-inset-right, 0px)) calc(0.85rem + env(safe-area-inset-bottom, 0px)) calc(0.9rem + env(safe-area-inset-left, 0px));
  background: linear-gradient(to top, #060811f5 2%, #080c18b8 44%, #070a1414);
  pointer-events: auto;
  opacity: 1;
  transition: opacity 0.22s ease, transform 0.2s ease;
}

.vod-controls-overlay--idle {
  opacity: 0 !important;
  transform: translateY(10px);
  pointer-events: none !important;
}

.vod-controls-row {
  display: flex !important;
  align-items: center !important;
  gap: 0.42rem !important;
  width: 100% !important;
}

/* Exact Old Front Button Styles */
.vod-ctl-btn {
  width: 2rem !important;
  height: 2rem !important;
  min-width: 2rem !important;
  min-height: 2rem !important;
  border-radius: 50% !important;
  background: rgba(255, 255, 255, 0.08) !important;
  border: 1px solid rgba(255, 255, 255, 0.18) !important;
  color: #f8fafc !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer !important;
  backdrop-filter: blur(8px) !important;
  -webkit-backdrop-filter: blur(8px) !important;
  transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;
  flex: 0 0 auto !important;
  padding: 0 !important;
}

.vod-ctl-btn svg {
  width: 0.95rem !important;
  height: 0.95rem !important;
  display: block !important;
}

.vod-ctl-btn:hover {
  background: rgba(255, 255, 255, 0.22) !important;
  border-color: rgba(255, 255, 255, 0.45) !important;
  transform: scale(1.08) !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4) !important;
}

.vod-ctl-btn:active {
  transform: scale(0.94) !important;
}

#vod-ctl-format {
  margin-left: auto !important;
  flex: 0 0 auto !important;
}

#vod-ctl-fullscreen {
  flex: 0 0 auto !important;
}

/* Exact Old Front Seek Bar */
.vod-ctl-seek-track {
  position: relative;
  flex: 1;
  min-width: 5rem;
  height: 0.3rem;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.52);
  cursor: pointer;
  touch-action: none;
}

.vod-ctl-seek-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0%;
  border-radius: inherit;
  background: linear-gradient(90deg, #4f46e5, #7c3aed 62%, #a78bfa);
  pointer-events: none;
}

.vod-ctl-seek-handle {
  position: absolute;
  top: 50%;
  left: 0%;
  width: 0.58rem;
  height: 0.58rem;
  border-radius: 50%;
  background: #f8fafc;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.35), 0 2px 8px rgba(15, 23, 42, 0.7);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.vod-ctl-time {
  font-size: 0.74rem;
  color: #f1f5f9f5;
  min-width: fit-content;
  padding: 0 0.25rem;
  white-space: nowrap;
  text-align: center;
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
</style>



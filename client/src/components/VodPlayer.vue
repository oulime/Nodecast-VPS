<template>
  <div
    id="vod-player-container"
    :class="[
      'player-container player-container--vod relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl border border-purple-900/40 select-none group',
      player.isSeries ? 'player-container--series-episode' : ''
    ]"
  >
    <!-- Dismiss button (Top Right ×) -->
    <button
      @click="player.stop()"
      type="button"
      id="btn-close-vod-player"
      class="vel-player-dismiss-x"
      title="Fermer le lecteur VOD"
      aria-label="Fermer le lecteur VOD"
    >
      ×
    </button>

    <div
      class="video-wrapper w-full h-full relative"
      @mousemove="onMouseMove"
      @mouseenter="onMouseMove"
      @touchstart="onMouseMove"
      @click="onWrapperClick"
    >
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
        controlslist="nofullscreen nodownload noremoteplayback"
        disablepictureinpicture
        disableremoteplayback
        preload="auto"
        crossorigin="anonymous"
        :class="['w-full h-full', player.isStretched ? 'vel-video-format-stretched object-fill' : 'vel-video-format-original object-contain']"
        @playing="onPlaying"
        @pause="onPause"
        @waiting="onWaiting"
        @canplay="onCanPlay"
        @timeupdate="onTimeUpdate"
        @loadedmetadata="onLoadedMetadata"
        @ended="onEnded"
        @error="onError"
      ></video>

      <!-- Buffering Overlay -->
      <div
        v-if="player.isBuffering"
        id="vod-player-buffering"
        class="player-buffering"
        role="status"
        aria-live="polite"
      >
        <div class="player-buffering__spinner" aria-hidden="true"></div>
        <span class="player-buffering__label">Chargement…</span>
      </div>

      <!-- Center Controls (-10s, Big Play, +10s) with Exact SVG and classes -->
      <div
        id="vod-center-controls"
        class="vel-vod-center-controls"
        :class="{ 'hidden': !showControls, 'vel-vod-center-controls--idle': !showControls }"
        :aria-hidden="!showControls"
      >
        <!-- -10s Button -->
        <button
          id="vod-ctl-back-10"
          @click.stop="skip(-10)"
          type="button"
          class="vel-vod-center-btn vel-vod-skip-btn"
          aria-label="Reculer de 10 secondes"
          title="−10 secondes"
        >
          <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <path class="vel-vod-skip-btn__arc" d="M10 13.5A17 17 0 1 1 7.5 30"></path>
            <path class="vel-vod-skip-btn__head" d="M14 5.5 4 12l10 6.5Z"></path>
            <text x="24" y="27">10</text>
          </svg>
        </button>

        <!-- Big Center Play / Pause -->
        <button
          id="vod-center-play"
          @click.stop="togglePlay"
          type="button"
          class="vel-vod-center-btn vel-vod-center-btn--play"
          :aria-label="player.isPlaying ? 'Pause' : 'Play'"
        >
          <svg v-if="!player.isPlaying" viewBox="0 0 24 24" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        </button>

        <!-- +10s Button -->
        <button
          id="vod-ctl-forward-10"
          @click.stop="skip(10)"
          type="button"
          class="vel-vod-center-btn vel-vod-skip-btn"
          aria-label="Avancer de 10 secondes"
          title="+10 secondes"
        >
          <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <path class="vel-vod-skip-btn__arc" d="M38 13.5A17 17 0 1 0 40.5 30"></path>
            <path class="vel-vod-skip-btn__head" d="M34 5.5 44 12l-10 6.5Z"></path>
            <text x="24" y="27">10</text>
          </svg>
        </button>
      </div>

      <!-- Bottom Controls Bar -->
      <div
        id="vod-controls-overlay"
        class="vod-controls-overlay"
        :class="{ 'vod-controls-overlay--idle': !showControls }"
      >
        <div class="vod-controls-row">
          <!-- Level 1: Full-Width Seek Track -->
          <div
            id="vod-ctl-seek-track"
            ref="seekTrackRef"
            class="vod-ctl-seek-track"
            @click.stop="onSeekClick"
            role="slider"
            aria-label="Seek"
            :aria-valuenow="progressPercent"
          >
            <div id="vod-ctl-seek-fill" class="vod-ctl-seek-fill" :style="{ width: progressPercent + '%' }"></div>
            <div id="vod-ctl-seek-handle" class="vod-ctl-seek-handle" :style="{ left: progressPercent + '%' }"></div>
          </div>

          <!-- Level 2 Left: Previous Episode (for series) -->
          <button
            v-if="player.isSeries"
            id="vod-ctl-prev-episode"
            @click.stop="player.playPrevEpisode()"
            :disabled="!player.hasPrevEpisode"
            type="button"
            class="vod-ctl-btn vel-episode-nav-btn"
            :class="{ 'opacity-30 pointer-events-none': !player.hasPrevEpisode }"
            aria-label="Épisode précédent"
            title="Épisode précédent"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>

          <!-- Level 2 Left: Play / Pause -->
          <button
            id="vod-ctl-play"
            @click.stop="togglePlay"
            type="button"
            class="vod-ctl-btn"
            :aria-label="player.isPlaying ? 'Pause' : 'Play'"
          >
            <svg v-if="!player.isPlaying" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
            <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          </button>

          <!-- Level 2 Left: Next Episode (for series) -->
          <button
            v-if="player.isSeries"
            id="vod-ctl-next-episode"
            @click.stop="player.playNextEpisode()"
            :disabled="!player.hasNextEpisode"
            type="button"
            class="vod-ctl-btn vel-episode-nav-btn"
            :class="{ 'opacity-30 pointer-events-none': !player.hasNextEpisode }"
            aria-label="Épisode suivant"
            title="Épisode suivant"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M16 6h2v12h-2zm-10.5 12l8.5-6-8.5-6z"/></svg>
          </button>

          <!-- Level 2 Left: Duration Clock (00:00 / 01:54:20) -->
          <span id="vod-ctl-duration" class="vod-ctl-time">
            {{ formatTime(realCurrentTime) }} / {{ formatTime(effectiveDuration) }}
          </span>

          <!-- Level 2 Right: Aspect Ratio Toggle -->
          <button
            id="vod-ctl-format"
            @click.stop="toggleFormat"
            type="button"
            class="vod-ctl-btn vel-format-btn"
            :class="player.isStretched ? 'is-stretched' : 'is-original'"
            title="Changer le format d'image"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2"></rect>
              <path class="vel-format-btn__original" d="M7 8h10v8H7z" fill="currentColor" stroke="none"></path>
              <path class="vel-format-btn__stretch" d="M4.5 8h15v8h-15z" fill="currentColor" stroke="none"></path>
            </svg>
          </button>

          <!-- Level 2 Right: Fullscreen Button -->
          <button
            id="vod-ctl-fullscreen"
            @click.stop="toggleFullscreen"
            type="button"
            class="vod-ctl-btn"
            aria-label="Plein écran"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
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
const showControls = ref(true);

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
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  if (hrs > 0) {
    return pad(hrs) + ':' + pad(mins) + ':' + pad(secs);
  }
  return pad(mins) + ':' + pad(secs);
}

function onMouseMove() {
  showControls.value = true;
  if (controlsTimer) clearTimeout(controlsTimer);
  controlsTimer = setTimeout(() => {
    if (player.isPlaying) showControls.value = false;
  }, 4000);
}

function onWrapperClick() {
  showControls.value = !showControls.value;
}

function loadStream(url) {
  if (!url || !videoRef.value) return;
  
  player.isBuffering = true;
  const video = videoRef.value;

  if (hls) {
    hls.destroy();
    hls = null;
  }

  if (Hls.isSupported() && url.includes('.m3u8')) {
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
}

function onPause() {
  player.isPlaying = false;
  showControls.value = true;
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
    videoRef.value.play();
  } else {
    videoRef.value.pause();
  }
}

function skip(seconds) {
  const target = Math.max(0, Math.min(effectiveDuration.value || 999999, realCurrentTime.value + seconds));
  player.seekToTime(target);
}

function onSeekClick(e) {
  if (!seekTrackRef.value) return;
  const rect = seekTrackRef.value.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, clickX / rect.width));
  const dur = effectiveDuration.value;
  if (dur > 0) {
    const target = ratio * dur;
    player.seekToTime(target);
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
  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    skip(-10);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    skip(10);
  } else if (e.key === 'f' || e.key === 'F') {
    toggleFullscreen();
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
.vel-vod-center-controls {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(2.2rem, 12vw, 7rem);
  background: rgba(0, 0, 0, 0.25);
  pointer-events: none;
  opacity: 1;
  transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.vel-vod-center-controls.hidden,
.vel-vod-center-controls.vel-vod-center-controls--idle {
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

.vel-vod-center-btn {
  width: clamp(3.5rem, 11vw, 5.2rem);
  height: clamp(3.5rem, 11vw, 5.2rem);
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border: 1.5px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  color: #fff;
  background: rgba(15, 10, 30, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(168, 85, 247, 0.25);
  cursor: pointer;
  pointer-events: auto;
  opacity: 0.9;
  transition: transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), background 0.18s ease, border-color 0.18s ease, opacity 0.18s ease, box-shadow 0.18s ease;
}

.vel-vod-center-btn:hover,
.vel-vod-center-btn:focus-visible {
  outline: none;
  background: rgba(168, 85, 247, 0.85);
  border-color: rgba(255, 255, 255, 0.8);
  opacity: 1;
  transform: scale(1.12);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.7), 0 0 28px rgba(168, 85, 247, 0.6);
}

.vel-vod-center-btn:active {
  transform: scale(0.92);
}

.vel-vod-center-btn--play {
  width: clamp(4.5rem, 14vw, 6.5rem);
  height: clamp(4.5rem, 14vw, 6.5rem);
  background: rgba(168, 85, 247, 0.4);
  border-color: rgba(168, 85, 247, 0.7);
}

.vel-vod-center-btn--play > svg {
  width: 50% !important;
  height: 50% !important;
  display: block;
  fill: currentColor;
}

.vel-vod-skip-btn svg {
  width: 68%;
  height: 68%;
  overflow: visible;
}

.vel-vod-skip-btn svg path.vel-vod-skip-btn__arc {
  fill: none;
  stroke: currentColor;
  stroke-width: 3.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.vel-vod-skip-btn svg path.vel-vod-skip-btn__head {
  fill: currentColor;
  stroke: none;
}

.vel-vod-skip-btn svg text {
  fill: currentColor;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 13.5px;
  font-weight: 800;
  text-anchor: middle;
  dominant-baseline: middle;
}

.vod-controls-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 25;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 1.2rem calc(1.2rem + env(safe-area-inset-right, 0px)) calc(1rem + env(safe-area-inset-bottom, 0px)) calc(1.2rem + env(safe-area-inset-left, 0px));
  background: linear-gradient(0deg, rgba(6, 8, 17, 0.98) 0%, rgba(6, 8, 17, 0.75) 60%, transparent 100%);
  pointer-events: auto;
  transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.vod-controls-overlay.vod-controls-overlay--idle {
  opacity: 0 !important;
  pointer-events: none !important;
}

.vod-controls-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  width: 100%;
  gap: 0.45rem 0.6rem;
}

.vod-ctl-seek-track {
  order: 1;
  width: 100%;
  flex: 0 0 100%;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.25);
  cursor: pointer;
  margin-bottom: 0.35rem;
  position: relative;
  transition: height 0.16s ease;
  touch-action: none;
}

.vod-ctl-seek-track:hover {
  height: 9px;
  background: rgba(255, 255, 255, 0.35);
}

.vod-ctl-seek-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  border-radius: inherit;
  background: linear-gradient(90deg, #8a2be2 0%, #a855f7 60%, #e50914 100%);
  box-shadow: 0 0 12px rgba(229, 9, 20, 0.75);
}

.vod-ctl-seek-handle {
  position: absolute;
  top: 50%;
  width: 15px;
  height: 15px;
  margin-top: -7.5px;
  margin-left: -7.5px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.8), 0 0 10px rgba(168, 85, 247, 0.9);
  transform: scale(0.9);
  transition: transform 0.15s ease;
}

.vod-ctl-seek-track:hover .vod-ctl-seek-handle {
  transform: scale(1.3);
}

.vod-ctl-btn {
  order: 2;
  width: 2.2rem;
  height: 2.2rem;
  min-width: 2.2rem;
  min-height: 2.2rem;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #f8fafc;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: all 0.18s ease;
}

.vod-ctl-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.5);
  transform: scale(1.08);
}

.vod-ctl-time {
  order: 2;
  margin-left: 0.35rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: rgba(248, 250, 252, 0.95);
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

#vod-ctl-format {
  order: 3;
  margin-left: auto;
}

#vod-ctl-fullscreen {
  order: 4;
}
</style>

<template>
  <div
    id="vod-player-container"
    :class="[
      'player-container player-container--vod relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl border border-purple-900/40 select-none group',
      player.isSeries ? 'player-container--series-episode' : ''
    ]"
    @mousemove="onMouseMove"
    @mouseenter="onMouseMove"
    @touchstart="onMouseMove"
  >
    <div class="video-wrapper w-full h-full relative" @click="onWrapperClick">
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
        :class="['w-full h-full', player.isStretched ? 'object-fill' : 'object-contain']"
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
        class="player-buffering absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-20 pointer-events-none"
        role="status"
        aria-live="polite"
      >
        <div class="player-buffering__spinner w-10 h-10 border-3 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
        <span class="player-buffering__label text-xs font-bold text-purple-200 mt-3 tracking-wide">Chargement…</span>
      </div>

      <!-- Top Overlay Header: Title Badge & Close Button -->
      <div
        class="absolute top-3 inset-x-3 z-30 flex items-center justify-between pointer-events-none transition-opacity duration-300"
        :class="showControls ? 'opacity-100' : 'opacity-0'"
      >
        <!-- Title Badge -->
        <div
          v-if="player.currentStream"
          class="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-black/80 backdrop-blur-md border border-purple-800/40 text-white shadow-lg pointer-events-auto"
        >
          <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/80 animate-pulse"></span>
          <span class="text-xs font-bold truncate max-w-[260px] md:max-w-[460px]">
            {{ player.currentStream.clean_name || player.currentStream.name }}
          </span>
        </div>
        <div v-else></div>

        <!-- Sleek Close X Button -->
        <button
          @click.stop="player.stop()"
          type="button"
          id="btn-close-vod-player"
          class="vel-player-dismiss-x w-8 h-8 rounded-full bg-black/80 hover:bg-rose-600/80 border border-white/20 hover:border-rose-400 text-slate-200 hover:text-white flex items-center justify-center transition-all cursor-pointer backdrop-blur-md shadow-lg pointer-events-auto active:scale-95"
          title="Fermer le lecteur (Échap)"
          aria-label="Fermer le lecteur"
        >
          <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <!-- Center Quick Play/Pause Feedback Flash -->
      <div
        v-if="flashCenterIcon"
        class="absolute inset-0 flex items-center justify-center z-25 pointer-events-none animate-ping-once"
      >
        <div class="w-14 h-14 rounded-full bg-purple-900/80 backdrop-blur-md border border-purple-400/50 flex items-center justify-center text-white shadow-2xl">
          <svg v-if="player.isPlaying" class="w-6 h-6 fill-current" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <svg v-else class="w-6 h-6 fill-current" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        </div>
      </div>

      <!-- Bottom Controls Overlay -->
      <div
        id="vod-controls-overlay"
        class="absolute bottom-0 inset-x-0 p-3 pt-6 bg-gradient-to-t from-black/95 via-black/60 to-transparent z-30 flex flex-col gap-2.5 transition-opacity duration-200"
        :class="showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
        @click.stop
      >
        <!-- 1. Full-Width Interactive Seek Progress Bar with Hover Tooltip -->
        <div
          ref="seekTrackRef"
          class="vod-ctl-seek-track group/track relative w-full h-1.5 hover:h-2.5 bg-white/20 hover:bg-white/30 rounded-full cursor-pointer transition-all duration-150"
          @click.stop="onSeekClick"
          @mousemove="onSeekHover"
          @mouseleave="seekHoverTime = null"
          role="slider"
          aria-label="Seek timeline"
          :aria-valuenow="progressPercent"
        >
          <!-- Hover Time Tooltip Preview -->
          <div
            v-if="seekHoverTime !== null"
            class="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded-md bg-black/90 border border-purple-500/40 text-[10px] font-mono font-bold text-white pointer-events-none shadow-md"
            :style="{ left: seekHoverPos + '%' }"
          >
            {{ formatTime(seekHoverTime) }}
          </div>

          <!-- Progress Fill -->
          <div
            class="vod-ctl-seek-fill h-full rounded-full bg-gradient-to-r from-purple-600 via-purple-500 to-pink-500 shadow-sm shadow-pink-500/50"
            :style="{ width: progressPercent + '%' }"
          ></div>
          <!-- Seek Handle Thumb -->
          <div
            class="vod-ctl-seek-handle absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white border border-purple-400 shadow-md shadow-purple-500/60 transition-transform group-hover/track:scale-125"
            :style="{ left: progressPercent + '%' }"
          ></div>
        </div>

        <!-- 2. Controls Action Row -->
        <div class="flex items-center justify-between gap-3 w-full">
          <!-- Left: Playback, Episodes, Rewind/Forward, Mute & Time -->
          <div class="flex items-center gap-1.5 sm:gap-2.5">
            <!-- Previous Episode (Series only) -->
            <button
              v-if="player.isSeries"
              id="vod-ctl-prev-episode"
              @click.stop="player.playPrevEpisode()"
              :disabled="!player.hasPrevEpisode"
              type="button"
              class="vod-ctl-btn w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-purple-950/70 hover:bg-purple-800/80 border border-purple-800/50 text-purple-200 hover:text-white transition-all active:scale-95 cursor-pointer"
              :class="{ 'opacity-30 pointer-events-none': !player.hasPrevEpisode }"
              title="Épisode précédent (P)"
              aria-label="Épisode précédent"
            >
              <svg viewBox="0 0 24 24" class="w-4 h-4 fill-current"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>

            <!-- Rewind -10s Button -->
            <button
              id="vod-ctl-back-10"
              @click.stop="skip(-10)"
              type="button"
              class="vod-ctl-btn w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-purple-950/70 hover:bg-purple-800/80 border border-purple-800/50 text-purple-200 hover:text-white transition-all active:scale-95 cursor-pointer"
              title="Reculer de 10 secondes (← / J)"
              aria-label="Reculer de 10 secondes"
            >
              <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                <path d="M3 3v5h5"></path>
                <text x="12" y="15.5" font-size="7.5" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">10</text>
              </svg>
            </button>

            <!-- Play / Pause Main Button -->
            <button
              id="vod-ctl-play"
              @click.stop="togglePlay"
              type="button"
              class="vod-ctl-btn w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 border border-purple-400 text-white transition-all active:scale-95 cursor-pointer shadow-lg shadow-purple-950/60"
              :title="player.isPlaying ? 'Pause (Espace / K)' : 'Lecture (Espace / K)'"
              :aria-label="player.isPlaying ? 'Pause' : 'Play'"
            >
              <svg v-if="!player.isPlaying" class="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <svg v-else class="w-4 h-4 fill-current" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            </button>

            <!-- Forward +10s Button -->
            <button
              id="vod-ctl-forward-10"
              @click.stop="skip(10)"
              type="button"
              class="vod-ctl-btn w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-purple-950/70 hover:bg-purple-800/80 border border-purple-800/50 text-purple-200 hover:text-white transition-all active:scale-95 cursor-pointer"
              title="Avancer de 10 secondes (→ / L)"
              aria-label="Avancer de 10 secondes"
            >
              <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                <path d="M21 3v5h-5"></path>
                <text x="12" y="15.5" font-size="7.5" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">10</text>
              </svg>
            </button>

            <!-- Next Episode (Series only) -->
            <button
              v-if="player.isSeries"
              id="vod-ctl-next-episode"
              @click.stop="player.playNextEpisode()"
              :disabled="!player.hasNextEpisode"
              type="button"
              class="vod-ctl-btn w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-purple-950/70 hover:bg-purple-800/80 border border-purple-800/50 text-purple-200 hover:text-white transition-all active:scale-95 cursor-pointer"
              :class="{ 'opacity-30 pointer-events-none': !player.hasNextEpisode }"
              title="Épisode suivant (N)"
              aria-label="Épisode suivant"
            >
              <svg viewBox="0 0 24 24" class="w-4 h-4 fill-current"><path d="M16 6h2v12h-2zm-10.5 12l8.5-6-8.5-6z"/></svg>
            </button>

            <!-- Mute / Volume Button -->
            <button
              id="vod-ctl-mute"
              @click.stop="toggleMute"
              type="button"
              class="vod-ctl-btn w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-purple-950/70 hover:bg-purple-800/80 border border-purple-800/50 text-purple-200 hover:text-white transition-all active:scale-95 cursor-pointer ml-1"
              :title="player.isMuted ? 'Réactiver le son (M)' : 'Couper le son (M)'"
              aria-label="Volume / Muet"
            >
              <svg v-if="!player.isMuted" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              <svg v-else class="w-4 h-4 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
            </button>

            <!-- Duration Time Display -->
            <span id="vod-ctl-duration" class="vod-ctl-time text-[11px] sm:text-xs font-bold text-slate-300 font-mono tracking-wide ml-1.5 whitespace-nowrap">
              {{ formatTime(realCurrentTime) }} / {{ formatTime(effectiveDuration) }}
            </span>
          </div>

          <!-- Right: Format & Fullscreen -->
          <div class="flex items-center gap-2">
            <!-- Aspect Ratio Format Button -->
            <button
              id="vod-ctl-format"
              @click.stop="toggleFormat"
              type="button"
              :class="[
                'vod-ctl-btn px-2.5 py-1 rounded-xl border text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer h-8 sm:h-9',
                player.isStretched ? 'bg-purple-600 border-purple-400 text-white' : 'bg-purple-950/70 border-purple-800/50 text-purple-300 hover:text-white'
              ]"
              title="Changer le format d'image"
            >
              <span>{{ player.isStretched ? '16:9 Rempli' : 'Original' }}</span>
            </button>

            <!-- Fullscreen Button -->
            <button
              id="vod-ctl-fullscreen"
              @click.stop="toggleFullscreen"
              type="button"
              class="vod-ctl-btn w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-purple-950/70 hover:bg-purple-800/80 border border-purple-800/50 text-white transition-all active:scale-95 cursor-pointer"
              title="Plein écran (F)"
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
const flashCenterIcon = ref(false);
const seekHoverTime = ref(null);
const seekHoverPos = ref(0);

let hls = null;
let controlsTimer = null;
let flashTimer = null;
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
  const pad = (n) => (n < 10 ? '0' : '') + n;
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

function onMouseMove() {
  showControls.value = true;
  if (controlsTimer) clearTimeout(controlsTimer);
  controlsTimer = setTimeout(() => {
    if (player.isPlaying) showControls.value = false;
  }, 3500);
}

function onWrapperClick(e) {
  if (e.target.closest('#vod-controls-overlay') || e.target.closest('#btn-close-vod-player') || e.target.closest('.vel-player-dismiss-x')) return;
  togglePlay();
  triggerFlashIcon();
}

function triggerFlashIcon() {
  flashCenterIcon.value = true;
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flashCenterIcon.value = false;
  }, 450);
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
  onMouseMove();
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
    videoRef.value.play().catch(() => {});
    player.isPlaying = true;
  } else {
    videoRef.value.pause();
    player.isPlaying = false;
  }
  onMouseMove();
}

function toggleMute() {
  if (!videoRef.value) return;
  videoRef.value.muted = !videoRef.value.muted;
  player.isMuted = videoRef.value.muted;
  onMouseMove();
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
  onMouseMove();
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
  onMouseMove();
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
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (videoRef.value) {
      videoRef.value.volume = Math.min(1, videoRef.value.volume + 0.1);
      videoRef.value.muted = false;
      player.isMuted = false;
    }
    onMouseMove();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (videoRef.value) {
      videoRef.value.volume = Math.max(0, videoRef.value.volume - 0.1);
    }
    onMouseMove();
  } else if (e.key === 'm' || e.key === 'M') {
    e.preventDefault();
    toggleMute();
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
  if (flashTimer) clearTimeout(flashTimer);
  if (hls) {
    hls.destroy();
    hls = null;
  }
});
</script>

<style scoped>
@keyframes pingOnce {
  0% { transform: scale(0.8); opacity: 0; }
  50% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1.25); opacity: 0; }
}

.animate-ping-once {
  animation: pingOnce 0.45s cubic-bezier(0, 0, 0.2, 1) forwards;
}

.vod-ctl-btn {
  transition: all 0.18s ease;
}

.vod-ctl-btn:hover {
  border-color: rgba(192, 132, 252, 0.7);
  box-shadow: 0 0 12px rgba(168, 85, 247, 0.4);
}
</style>


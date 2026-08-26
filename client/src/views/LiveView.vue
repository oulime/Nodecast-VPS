<template>
  <div
    class="vel-live-container w-full mx-auto px-2 sm:px-4 py-1 space-y-2"
    :style="liveThemeStyle"
  >
    <!-- Video Player (If Stream Playing) -->
    <VideoPlayer v-if="player.currentStream" />

    <!-- Modern Skeleton Packages Loading State -->
    <div v-if="catalog.loadingPackages" class="grid vel-packages">
      <div
        v-for="i in 16"
        :key="'skeleton-pkg-' + i"
        class="vel-skeleton-package-card"
      >
        <div class="vel-skeleton-pkg-logo"></div>
        <div class="vel-skeleton-line w-2/3 mx-auto mt-2"></div>
      </div>
    </div>

    <!-- 3D HTML5 Wheel View for Live Packages -->
    <LiveWheelView
      v-else-if="catalog.visibleLivePackages.length > 0"
      :packages="catalog.visibleLivePackages"
      @select-package="handlePackageClick"
      @theme-change="handleThemeChange"
    />

    <!-- Modern HTML5 Empty State for Live Packages -->
    <EmptyState
      v-else-if="!catalog.loadingPackages && catalog.visibleLivePackages.length === 0"
      icon="live"
      title="Aucun bouquet TV"
      message="Aucun bouquet de chaînes en direct n'est disponible pour ce pays. Choisissez un autre pays dans le menu en haut."
      action-text="Changer de pays"
      @action="openCountryPicker"
    />

    <!-- Channels List of the Selected Package (Directly Below the Picked Package) -->
    <div v-if="catalog.activePackage" class="vel-channels-section mt-2 w-full" id="content-view">
      <button type="button" id="btn-back-home" class="vel-vod-detail-back hidden" aria-label="Précédent" title="Précédent" data-tv-focusable="true" data-analytics-playback-end-bound="1">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.41 11H20a1 1 0 1 1 0 2h-9.59l4.3 4.3a1 1 0 0 1-1.42 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.42 0Z"></path>
        </svg>
      </button>
      <div id="cat-pills-wrap" class="cat-pills-wrap vel-cat-pills-wrap hidden">
        <div id="cat-pills" class="vel-pills" role="tablist" aria-label="Filtres"></div>
      </div>

      <!-- Channels List Container -->
      <div
        class="item-list item-list--media-ready"
        :class="{ 'item-list--media-loading-live': catalog.loadingChannels }"
        id="dynamic-list"
        data-show-more-ready="true"
      >
        <!-- Category Heading with Accent Line -->
        <header
          v-if="!catalog.loadingChannels && filteredChannels.length > 0"
          class="vel-category-heading vel-category-heading--sport vel-category-heading--live-accent"
        >
          <h2 class="vel-category-heading__title">{{ activePackageDisplayName }}</h2>
          <span class="vel-category-heading__accent-line" aria-hidden="true"></span>
        </header>

        <!-- Live Channels Loading Animation -->
        <div v-if="catalog.loadingChannels" class="item-list item-list--media-loading item-list--media-loading-live col-span-full">
          <div class="vel-channel-loader">
            <div class="vel-channel-loader__visual">
              <div class="vel-channel-loader__halo"></div>
              <div class="vel-channel-loader__spinner"></div>
              <div class="vel-channel-loader__icon">
                <span class="vel-channel-loader__bar"></span>
                <span class="vel-channel-loader__bar"></span>
                <span class="vel-channel-loader__bar"></span>
              </div>
            </div>
            <div class="vel-channel-loader__copy">
              <span class="vel-channel-loader__eyebrow">Direct TV</span>
              <strong class="vel-channel-loader__title">Chargement des flux</strong>
              <span class="vel-channel-loader__meta">
                Synchronisation de la grille
                <span class="vel-channel-loader__dots"><i></i><i></i><i></i></span>
              </span>
            </div>
            <div class="vel-channel-skeleton-list">
              <div v-for="n in 6" :key="'skel-' + n" class="vel-channel-skeleton-row">
                <div class="vel-channel-skeleton-thumb"></div>
                <div class="vel-channel-skeleton-info">
                  <div class="vel-channel-skeleton-line vel-channel-skeleton-line--title"></div>
                  <div class="vel-channel-skeleton-line vel-channel-skeleton-line--sub"></div>
                </div>
                <div class="vel-channel-skeleton-pill"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Channels List Rows -->
        <template v-else-if="filteredChannels.length > 0">
          <div
            v-for="(ch, chIdx) in filteredChannels"
            :key="ch.stream_id || ch.id"
            :class="[
              'vel-media-item-row vel-channel-card-enter',
              player.currentStream?.stream_id === (ch.stream_id || ch.id) ? 'vel-media-item-row--active' : ''
            ]"
            :style="{ animationDelay: `${Math.min(chIdx * 0.02, 0.35)}s` }"
            :data-stream-id="ch.stream_id || ch.id"
            data-favorite-decorated="true"
          >
            <button
              type="button"
              :class="[
                'media-item media-item__main',
                player.currentStream?.stream_id === (ch.stream_id || ch.id) ? 'selected' : ''
              ]"
              :aria-current="player.currentStream?.stream_id === (ch.stream_id || ch.id) ? 'true' : undefined"
              @click="playChannel(ch)"
            >
              <div class="media-item__thumb vel-image-loaded-host">
                <img
                  v-if="ch.stream_icon || ch.logo"
                  alt=""
                  :class="[
                    'vel-image-loaded vel-image-fade',
                    loadedLogos.has(ch.stream_id || ch.id) ? 'is-ready' : ''
                  ]"
                  :loading="chIdx < 8 ? 'eager' : 'lazy'"
                  decoding="async"
                  :fetchpriority="chIdx < 4 ? 'high' : 'auto'"
                  referrerpolicy="no-referrer"
                  crossorigin="anonymous"
                  :src="resolveImageUrl(ch.stream_icon || ch.logo)"
                  @load="loadedLogos.add(ch.stream_id || ch.id)"
                />
                <span v-else class="text-sm">📺</span>
              </div>

              <div class="media-info">
                <h4 :title="ch.name">{{ ch.clean_name || ch.name }}</h4>
                <span
                  :class="[
                    'vel-channel-playing-badge',
                    player.currentStream?.stream_id === (ch.stream_id || ch.id) ? '' : 'hidden'
                  ]"
                >
                  <span class="vel-live-eq-wave">
                    <span class="vel-live-eq-bar"></span>
                    <span class="vel-live-eq-bar"></span>
                    <span class="vel-live-eq-bar"></span>
                  </span>
                  <span>EN DIRECT</span>
                </span>
              </div>
            </button>

            <button
              type="button"
              :class="[
                'vel-favorite-heart',
                favs.isFavorite(ch, 'channel') ? 'is-active' : ''
              ]"
              :data-favorite-key="(ch.stream_id || ch.id) + 'channel'"
              :aria-pressed="favs.isFavorite(ch, 'channel')"
              :aria-label="favs.isFavorite(ch, 'channel') ? 'Dans vos favoris (cliquer pour retirer)' : 'Ajouter aux favoris'"
              :title="favs.isFavorite(ch, 'channel') ? 'Dans vos favoris (cliquer pour retirer)' : 'Ajouter aux favoris'"
              @click.stop="favs.toggleFavorite(ch, 'channel')"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s-8.5-4.8-8.5-11.2A4.8 4.8 0 0 1 12 6.7a4.8 4.8 0 0 1 8.5 3.1C20.5 16.2 12 21 12 21Z"></path>
              </svg>
            </button>
          </div>
        </template>

        <div v-else class="col-span-full text-center py-10 text-xs text-slate-500">
          Aucune chaîne trouvée dans ce bouquet.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useCatalogStore, cleanItemName } from '../stores/catalogStore.js';
import { usePlayerStore } from '../stores/playerStore.js';
import { useFavoritesStore } from '../stores/favoritesStore.js';
import VideoPlayer from '../components/VideoPlayer.vue';
import LiveWheelView from '../components/LiveWheelView.vue';
import EmptyState from '../components/EmptyState.vue';
import { resolveImageUrl } from '../utils/image.js';

const catalog = useCatalogStore();

const activePackageDisplayName = computed(() => {
  if (!catalog.activePackage) return '';
  return catalog.activePackage.display_name || cleanItemName(catalog.activePackage.name, catalog.channelPrefixes);
});

function openCountryPicker() {
  document.getElementById('btn-header-country')?.click();
}
const player = usePlayerStore();
const favs = useFavoritesStore();
const channelSearch = ref('');
const loadedLogos = reactive(new Set());

// Dynamic Brand Adaptive Theme
const currentTheme = ref({
  primary: '#c084fc',
  glow: 'rgba(168, 85, 247, 0.55)',
  subtle: 'rgba(168, 85, 247, 0.15)',
  border: 'rgba(168, 85, 247, 0.35)',
  arenaBg: 'radial-gradient(circle at 50% 35%, rgba(55, 25, 95, 0.55) 0%, rgba(10, 8, 22, 0.98) 75%)'
});

function handleThemeChange(t) {
  if (!t) return;
  currentTheme.value = t;
}

const liveThemeStyle = computed(() => ({
  '--vel-primary': currentTheme.value.primary,
  '--vel-accent-glow': currentTheme.value.glow,
  '--live-theme-primary': currentTheme.value.primary,
  '--live-theme-glow': currentTheme.value.glow,
  '--live-theme-subtle': currentTheme.value.subtle || 'rgba(168, 85, 247, 0.15)',
  '--live-theme-border': currentTheme.value.border,
  '--live-theme-arena-bg': currentTheme.value.arenaBg
}));

onMounted(async () => {
  if (catalog.allPackages.length === 0) {
    await catalog.loadCatalog();
  }
});

const filteredChannels = computed(() => {
  const q = channelSearch.value.trim().toLowerCase();
  if (!q) return catalog.channels;
  return catalog.channels.filter(c => (c.clean_name || c.name).toLowerCase().includes(q));
});

async function handlePackageClick(pkg) {
  if (!pkg) return;
  if (catalog.activePackage && String(catalog.activePackage.id) === String(pkg.id)) {
    return;
  }
  channelSearch.value = '';
  await catalog.openPackage(pkg);
}

function playChannel(ch) {
  const streamId = ch.raw_stream_id || ch.stream_id;
  const url = `/proxy/live/${streamId}.m3u8`;
  player.playStream(ch, url);
}

// Auto-load channels for the active package if none is selected yet
watch(
  () => catalog.visibleLivePackages,
  (pkgs) => {
    if (pkgs && pkgs.length > 0 && !catalog.activePackage) {
      const first = pkgs[0];
      if (first.is_parent && Array.isArray(first.child_package_ids) && first.child_package_ids.length > 0) {
        const child = catalog.allPackages.find(p => String(p.id) === String(first.child_package_ids[0]));
        if (child) handlePackageClick(child);
      } else {
        handlePackageClick(first);
      }
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.vel-live-container {
  transition: all 0.35s ease;
}

.vel-channels-section {
  animation: vel-section-reveal 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.vel-channel-card-enter {
  opacity: 0;
  animation: vel-channel-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
  will-change: transform, opacity;
}

@keyframes vel-section-reveal {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes vel-channel-slide-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.vel-image-fade {
  opacity: 0;
  transition: opacity 0.25s ease;
}

.vel-image-fade.is-ready {
  opacity: 1;
}

/* Base Rest State for Media Items in Live View with Theme Tint */
:deep(.media-item),
.media-item {
  border: 1px solid var(--live-theme-border, rgba(168, 85, 247, 0.25)) !important;
  background: linear-gradient(135deg, var(--live-theme-subtle, rgba(168, 85, 247, 0.08)), rgba(10, 8, 18, 0.8) 48%, rgba(18, 12, 28, 0.9)) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28), inset 0 1px rgba(255, 255, 255, 0.08) !important;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
  border-radius: 14px !important;
}

:deep(.media-item__thumb),
.media-item__thumb {
  border: 1px solid var(--live-theme-border, rgba(255, 255, 255, 0.12)) !important;
  background: rgba(0, 0, 0, 0.5) !important;
  border-radius: 10px !important;
  transition: all 0.2s ease !important;
}

:deep(.media-info h4),
.media-info h4 {
  color: #f1ecff !important;
  transition: color 0.2s ease, text-shadow 0.2s ease !important;
}

/* Hover State */
:deep(.vel-media-item-row),
.vel-media-item-row {
  position: relative;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  border-radius: 14px;
}

:deep(.vel-media-item-row:hover),
.vel-media-item-row:hover {
  transform: translateX(4px) scale(1.008);
}

:deep(.vel-media-item-row:hover .media-item),
.vel-media-item-row:hover .media-item {
  border-color: var(--live-theme-primary, #a855f7) !important;
  background: linear-gradient(135deg, var(--live-theme-subtle, rgba(168, 85, 247, 0.22)), rgba(14, 8, 20, 0.85) 48%, rgba(26, 14, 38, 0.95)) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 20px var(--live-theme-glow, rgba(168, 85, 247, 0.4)) !important;
}

:deep(.vel-media-item-row:hover .media-info h4),
.vel-media-item-row:hover .media-info h4 {
  color: #ffffff !important;
  text-shadow: 0 0 10px var(--live-theme-glow, rgba(168, 85, 247, 0.5)) !important;
}

/* Active / Playing Channel State */
:deep(.vel-media-item-row--active .media-item),
.vel-media-item-row--active .media-item,
:deep(.media-item.selected),
.media-item.selected {
  border-color: var(--live-theme-primary, #a855f7) !important;
  background: linear-gradient(135deg, var(--live-theme-subtle, rgba(168, 85, 247, 0.35)), rgba(16, 8, 24, 0.9) 48%, rgba(30, 14, 46, 0.98)) !important;
  box-shadow: inset 4px 0 var(--live-theme-primary, #a855f7), 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 28px var(--live-theme-glow, rgba(168, 85, 247, 0.6)) !important;
}

:deep(.vel-media-item-row--active .media-item__thumb),
.vel-media-item-row--active .media-item__thumb {
  border-color: var(--live-theme-primary, #a855f7) !important;
  box-shadow: 0 0 14px var(--live-theme-glow, rgba(168, 85, 247, 0.7)) !important;
}

:deep(.vel-media-item-row--active .media-info h4),
.vel-media-item-row--active .media-info h4 {
  color: #ffffff !important;
  font-weight: 800 !important;
  text-shadow: 0 0 12px var(--live-theme-glow, rgba(168, 85, 247, 0.7)) !important;
}

:deep(.vel-channel-playing-badge),
.vel-channel-playing-badge {
  background: var(--live-theme-primary, #a855f7) !important;
  border: 1px solid rgba(255, 255, 255, 0.9) !important;
  color: #ffffff !important;
  box-shadow: 0 0 14px var(--live-theme-glow, rgba(168, 85, 247, 0.8)) !important;
  transition: background 0.35s ease, box-shadow 0.35s ease !important;
}

:deep(.vel-live-eq-bar),
.vel-live-eq-bar {
  background: #ffffff !important;
  box-shadow: 0 0 6px #ffffff !important;
}

:deep(.vel-favorite-heart.is-active),
.vel-favorite-heart.is-active {
  color: var(--live-theme-primary, #ec4899) !important;
  filter: drop-shadow(0 0 6px var(--live-theme-glow, rgba(236, 72, 153, 0.8))) !important;
}
</style>

<template>
  <div class="vel-live-container max-w-[1720px] w-full mx-auto px-3 py-2 md:px-6 xl:px-10">
    <!-- Channel View inside Package (Clean & Optimized Replica) -->
    <div v-if="catalog.activePackage" id="content-view">
      <!-- Video Player (If Stream Playing) -->
      <VideoPlayer v-if="player.currentStream" />

      <!-- Channels List Container -->
      <div class="item-list item-list--media-ready" id="dynamic-list" data-show-more-ready="true">

        <!-- Exact Old Front Live Channels Loading Animation -->
        <div v-if="catalog.loadingChannels" class="item-list item-list--media-loading item-list--media-loading-live col-span-full">
          <div class="vel-channel-loader">
            <div class="vel-channel-loader__visual">
              <div class="vel-channel-loader__halo"></div>
              <div class="vel-channel-loader__spinner"></div>
              <div class="vel-channel-loader__icon">
                <span class="vel-channel-loader__bar"></span>
                <span class="vel-channel-loader__bar"></span>
                <span class="vel-channel-loader__bar"></span>
                <span class="vel-channel-loader__bar"></span>
                <span class="vel-channel-loader__bar"></span>
              </div>
            </div>
            <div class="vel-channel-loader__text-wrap">
              <span class="vel-channel-loader__pill">
                <span class="vel-channel-loader__pulse-dot"></span>
                <span>Synchronisation</span>
              </span>
              <span class="vel-channel-loader__label">
                <span>Chargement des chaînes</span>
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
            v-for="ch in filteredChannels"
            :key="ch.stream_id || ch.id"
            :class="[
              'vel-media-item-row',
              player.currentStream?.stream_id === (ch.stream_id || ch.id) ? 'vel-media-item-row--active' : ''
            ]"
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
                  class="vel-image-loaded"
                  loading="lazy"
                  decoding="async"
                  referrerpolicy="no-referrer"
                  crossorigin="anonymous"
                  :src="resolveImageUrl(ch.stream_icon || ch.logo)"
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
              :aria-pressed="favs.isFavorite(ch, 'channel')"
              :aria-label="favs.isFavorite(ch, 'channel') ? 'Retirer des favoris' : 'Ajouter aux favoris'"
              :title="favs.isFavorite(ch, 'channel') ? 'Retirer des favoris' : 'Ajouter aux favoris'"
              @click.stop="favs.toggleFavorite(ch, 'channel')"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s-8.5-4.8-8.5-11.2A4.8 4.8 0 0 1 12 6.7a4.8 4.8 0 0 1 8.5 3.1C20.5 16.2 12 21 12 21Z"></path>
              </svg>
            </button>
          </div>
        </template>

        <div v-else class="col-span-full text-center py-12 text-xs text-slate-500">
          Aucune chaîne disponible dans ce bouquet.
        </div>
      </div>
    </div>

    <!-- Bouquets Grid View -->
    <div v-else class="space-y-4">
      <!-- Parent Package Header Bar -->
      <div v-if="catalog.activeParentPackage" class="vel-parent-package-bar flex items-center justify-between p-3.5 rounded-2xl bg-purple-950/60 border border-purple-700/40">
        <div class="flex items-center gap-3">
          <button
            @click="catalog.closeParentPackage()"
            type="button"
            class="vel-parent-package-bar__back px-3 py-1.5 rounded-xl bg-purple-900/40 border border-purple-500/30 text-xs font-bold text-purple-200 hover:bg-purple-800/50 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 18l-6-6 6-6"/></svg>
            <span>Retour</span>
          </button>
          <h2 class="text-sm md:text-base font-extrabold text-white">{{ catalog.activeParentPackage.display_name || catalog.activeParentPackage.name }}</h2>
        </div>
        <span class="vel-parent-package-bar__badge text-[10px] font-bold uppercase tracking-wider text-purple-300 px-2.5 py-1 rounded-full bg-purple-950 border border-purple-500/30">
          {{ (catalog.activeParentPackage.child_package_ids || []).length }} bouquets
        </span>
      </div>

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

      <!-- 3D HTML5 Casino Wheel View for Live Packages -->
      <LiveWheelView
        v-else-if="catalog.visibleLivePackages.length > 0"
        :packages="catalog.visibleLivePackages"
        @select-package="handlePackageClick"
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
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useCatalogStore } from '../stores/catalogStore.js';
import { usePlayerStore } from '../stores/playerStore.js';
import { useFavoritesStore } from '../stores/favoritesStore.js';
import VideoPlayer from '../components/VideoPlayer.vue';
import LiveWheelView from '../components/LiveWheelView.vue';
import EmptyState from '../components/EmptyState.vue';
import { resolveImageUrl } from '../utils/image.js';

const catalog = useCatalogStore();

function openCountryPicker() {
  document.getElementById('btn-header-country')?.click();
}
const player = usePlayerStore();
const favs = useFavoritesStore();
const channelSearch = ref('');

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
  if (pkg.is_parent) {
    catalog.openParentPackage(pkg);
  } else {
    channelSearch.value = '';
    await catalog.openPackage(pkg);
    if (catalog.channels.length > 0) {
      playChannel(catalog.channels[0]);
    }
  }
}

function playChannel(ch) {
  const streamId = ch.raw_stream_id || ch.stream_id;
  const url = `/proxy/live/${streamId}.m3u8`;
  player.playStream(ch, url);
}
</script>

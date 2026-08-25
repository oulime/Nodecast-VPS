<template>
  <div class="p-3 md:p-6 xl:px-10 max-w-[1720px] mx-auto space-y-4 w-full min-w-0 overflow-x-hidden">
    <!-- === 1. DEDICATED SERIES DETAIL PAGE === -->
    <div v-if="vod.selectedSeries" class="animate-fadeIn space-y-6">
      <!-- Active Video Player mounted immediately on click -->
      <div v-if="player.currentStream" class="vel-player-sticky-wrap space-y-3" id="series-player-section">
        <VodPlayer />
      </div>

      <!-- Series Article Detail -->
      <article class="vel-vod-detail vel-vod-detail--series vel-vod-detail--art-themed">
        <!-- Floating Favorite Heart on Detail Page -->
        <button
          type="button"
          :class="['vel-favorite-detail-button', favs.isFavorite(vod.selectedSeries, 'series') ? 'is-active' : '']"
          title="Favoris"
          aria-label="Favoris"
          @click.stop="favs.toggleFavorite(vod.selectedSeries, 'series')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21s-8.5-4.8-8.5-11.2A4.8 4.8 0 0 1 12 6.7a4.8 4.8 0 0 1 8.5 3.1C20.5 16.2 12 21 12 21Z"></path>
          </svg>
        </button>

        <!-- Background Banner with Parallax / Fade -->
        <div
          class="vel-vod-detail__bg vel-vod-detail__bg--series vel-vod-detail__bg--entered"
          :style="{
            backgroundImage: 'url(' + vod.selectedSeries.stream_icon + ')',
            '--vel-vod-hero-url': 'url(' + vod.selectedSeries.stream_icon + ')'
          }"
        ></div>

        <!-- Inner Content -->
        <div class="vel-vod-detail__inner">
          <div class="vel-vod-detail__details-panel">
            <!-- Title -->
            <h1 class="vel-vod-detail__title">
              {{ vod.selectedSeries.clean_name || vod.selectedSeries.name }}
            </h1>

            <!-- Meta Badges (Rating, Year, Genre) -->
            <div class="vel-vod-detail__meta">
              <span v-if="vod.seriesDetail?.info?.rating" class="vel-vod-detail__rating">
                ★ {{ vod.seriesDetail.info.rating }}
              </span>
              <span v-if="vod.seriesDetail?.info?.releaseDate" class="vel-vod-detail__genre">
                {{ vod.seriesDetail.info.releaseDate.slice(0, 4) }}
              </span>
              <span v-if="vod.seriesDetail?.info?.genre" class="vel-vod-detail__genre">
                {{ vod.seriesDetail.info.genre }}
              </span>
            </div>

            <!-- Synopsis Section -->
            <div class="vel-vod-detail__section">
              <h2 class="vel-vod-detail__section-title">Description</h2>
              <p class="vel-vod-detail__plot">
                {{ vod.seriesDetail?.info?.plot || 'Aucune description disponible pour cette série.' }}
              </p>
            </div>

            <!-- Cast / Actors Section -->
            <div v-if="castList.length > 0" class="vel-vod-detail__section">
              <h2 class="vel-vod-detail__section-title">Distribution</h2>
              <div class="vel-vod-detail__cast-grid flex flex-wrap gap-2.5 pt-1">
                <div
                  v-for="actor in castList"
                  :key="actor.name"
                  class="vel-vod-actor-card flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 border border-purple-800/30 text-xs font-semibold text-slate-200"
                >
                  <div class="vel-vod-actor-avatar-wrap w-6 h-6 rounded-full bg-purple-900/60 border border-purple-500/40 flex items-center justify-center text-[10px] font-bold text-purple-200 flex-shrink-0">
                    <span>{{ actor.initials }}</span>
                  </div>
                  <span class="vel-vod-actor-name truncate max-w-[140px]">{{ actor.name }}</span>
                </div>
              </div>
            </div>

            <!-- Seasons Selector Bar -->
            <div v-if="seasonsList.length > 0" class="vel-vod-detail__section pt-2">
              <div class="vel-vod-detail__season-toolbar">
                <div v-drag-scroll class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none touch-pan-x">
                  <button
                    v-for="sNum in seasonsList"
                    :key="sNum"
                    @click="vod.selectedSeason = sNum"
                    type="button"
                    :class="[
                      'px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer',
                      vod.selectedSeason === sNum
                        ? 'bg-purple-600 text-white shadow-lg border border-purple-400'
                        : 'bg-black/50 text-slate-400 hover:text-white border border-purple-900/30'
                    ]"
                  >
                    Saison {{ sNum }}
                  </button>
                </div>
              </div>

              <!-- Episodes Grid -->
              <div class="vel-vod-detail__episodes grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[480px] overflow-y-auto pr-1">
                <button
                  v-for="ep in currentSeasonEpisodes"
                  :key="ep.id"
                  @click="playEpisode(ep)"
                  type="button"
                  class="vel-vod-detail__episode flex items-center justify-between p-3.5 rounded-xl bg-black/40 hover:bg-purple-900/30 border border-purple-900/20 hover:border-purple-500/40 cursor-pointer transition-all group text-left"
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <span class="vel-vod-detail__episode-badge text-xs font-extrabold text-purple-400">
                      S{{ vod.selectedSeason }}E{{ ep.episode_num }}
                    </span>
                    <span class="vel-vod-detail__episode-body truncate">
                      <span class="vel-vod-detail__episode-title block text-xs font-bold text-white group-hover:text-purple-300 truncate">
                        {{ ep.title }}
                      </span>
                      <span v-if="ep.info?.duration_secs" class="vel-vod-detail__episode-meta block text-[10px] text-slate-400">
                        {{ Math.floor(ep.info.duration_secs / 60) }} min
                      </span>
                    </span>
                  </div>

                  <span class="vel-vod-detail__episode-play-wrap w-7 h-7 rounded-full bg-purple-950/80 border border-purple-500/30 flex items-center justify-center text-purple-300 group-hover:bg-purple-600 group-hover:text-white transition-all flex-shrink-0">
                    ▶
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>

    <!-- === 2. SERIES CATALOG GRID VIEW === -->
    <div v-else class="space-y-4 w-full min-w-0">
      <!-- Series Category / Package Pills -->
      <div v-drag-scroll class="vel-horizontal-category-rail flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none touch-pan-x">
        <button
          v-for="pkg in catalog.seriesPackagesForCountry"
          :key="pkg.id"
          @click="vod.selectSeriesPackage(pkg)"
          type="button"
          :class="[
            'px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 flex-shrink-0 cursor-pointer',
            vod.selectedSeriesPackage?.id === pkg.id
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/60 border border-purple-400'
              : 'glass-panel text-slate-300 hover:text-white hover:bg-purple-900/30'
          ]"
        >
          <span>{{ pkg.display_name || pkg.name }}</span>
        </button>
      </div>

      <!-- Search / Filter Bar -->
      <div v-if="vod.seriesList.length > 0" class="max-w-md">
        <input
          v-model="seriesFilter"
          type="text"
          placeholder="Filtrer les séries de cette catégorie..."
          class="w-full px-3.5 py-2 rounded-xl bg-black/50 border border-purple-900/30 text-white text-xs placeholder:text-slate-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
        />
      </div>

      <!-- Exact Old Front Series Media Loading Animation -->
      <div v-if="vod.loadingSeries" class="space-y-4">
        <div class="item-list item-list--media-loading py-6">
          <div class="vel-media-package-loader vel-media-package-loader--series">
            <span class="vel-media-package-loader__text">Chargement des séries</span>
            <span class="vel-media-package-loader__dots"><i></i><i></i><i></i></span>
          </div>
        </div>
        <div class="vel-vod-grid" aria-busy="true" aria-label="Chargement des séries">
          <div
            v-for="i in 18"
            :key="'skeleton-series-' + i"
            class="vel-skeleton-vod-card"
          >
            <div class="vel-skeleton-vod-poster"></div>
            <div class="vel-skeleton-vod-body">
              <div class="vel-skeleton-line w-3/4"></div>
              <div class="vel-skeleton-line w-1/2 opacity-60"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Series Posters Grid -->
      <div v-else-if="filteredSeries.length > 0" class="vel-vod-grid">
        <article
          v-for="s in filteredSeries"
          :key="s.stream_id"
          @click="vod.openSeriesDetail(s)"
          class="vel-vod-movie-card group"
        >
          <div class="vel-vod-movie-card__media">
            <img
              v-if="s.stream_icon"
              :src="resolveImageUrl(s.stream_icon)"
              :alt="s.name"
              class="w-full h-full object-cover group-hover:scale-104 transition-transform duration-300"
              loading="lazy"
              decoding="async"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-slate-600 text-xs font-bold p-2 text-center">
              {{ s.clean_name || s.name }}
            </div>

            <!-- Favorite Heart Button on Card -->
            <button
              type="button"
              :class="['vel-favorite-heart', favs.isFavorite(s, 'series') ? 'is-active' : '']"
              title="Favoris"
              aria-label="Favoris"
              @click.stop="favs.toggleFavorite(s, 'series')"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s-8.5-4.8-8.5-11.2A4.8 4.8 0 0 1 12 6.7a4.8 4.8 0 0 1 8.5 3.1C20.5 16.2 12 21 12 21Z"></path>
              </svg>
            </button>
          </div>
          <div class="vel-vod-movie-card__body">
            <h3 class="vel-vod-movie-card__title">{{ s.clean_name || s.name }}</h3>
          </div>
        </article>
      </div>

      <!-- Modern HTML5 Empty State -->
      <template v-else>
        <EmptyState
          v-if="catalog.seriesPackagesForCountry.length === 0"
          icon="series"
          title="Aucune série disponible"
          message="Ce pays ne propose pas de catalogue de séries. Sélectionnez un autre pays pour explorer les séries disponibles."
          action-text="Changer de pays"
          @action="openCountryPicker"
        />
        <EmptyState
          v-else-if="seriesFilter.trim()"
          icon="search"
          title="Aucune série trouvée"
          :message="'Aucun résultat correspondant à « ' + seriesFilter + ' » dans ce bouquet.'"
        />
        <EmptyState
          v-else
          icon="series"
          title="Sélectionnez un bouquet"
          message="Choisissez une catégorie ci-dessus pour parcourir les séries."
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useCatalogStore } from '../stores/catalogStore.js';
import { useVodStore } from '../stores/vodStore.js';
import { usePlayerStore } from '../stores/playerStore.js';
import { useFavoritesStore } from '../stores/favoritesStore.js';
import VodPlayer from '../components/VodPlayer.vue';
import EmptyState from '../components/EmptyState.vue';
import { resolveImageUrl } from '../utils/image.js';

const catalog = useCatalogStore();
const vod = useVodStore();
const player = usePlayerStore();
const favs = useFavoritesStore();
const seriesFilter = ref('');

function openCountryPicker() {
  document.getElementById('btn-header-country')?.click();
}

const seasonsList = computed(() => {
  if (!vod.seriesDetail?.episodes) return [];
  return Object.keys(vod.seriesDetail.episodes).map(Number).sort((a, b) => a - b);
});

const currentSeasonEpisodes = computed(() => {
  if (!vod.seriesDetail?.episodes) return [];
  return vod.seriesDetail.episodes[String(vod.selectedSeason)] || [];
});

const filteredSeries = computed(() => {
  const q = seriesFilter.value.trim().toLowerCase();
  if (!q) return vod.seriesList;
  return vod.seriesList.filter(s => (s.clean_name || s.name).toLowerCase().includes(q));
});

const castList = computed(() => {
  const raw = String(vod.seriesDetail?.info?.cast || '');
  if (!raw) return [];
  return raw
    .split(/[,;|•]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length < 65)
    .slice(0, 15)
    .map(name => {
      const initials = name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
      return { name, initials };
    });
});

function playEpisode(ep) {
  player.playSeriesEpisode(ep, currentSeasonEpisodes.value, vod.selectedSeries);
  nextTick(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

watch(() => catalog.seriesPackagesForCountry, (pkgs) => {
  if (pkgs.length > 0 && !vod.selectedSeriesPackage) {
    vod.selectSeriesPackage(pkgs[0]);
  }
}, { immediate: true });

onMounted(async () => {
  if (catalog.allPackages.length === 0) {
    await catalog.loadCatalog();
  }
  if (catalog.seriesPackagesForCountry.length > 0 && !vod.selectedSeriesPackage) {
    vod.selectSeriesPackage(catalog.seriesPackagesForCountry[0]);
  }
});
</script>

<template>
  <div class="p-3 md:p-6 xl:px-10 max-w-[1720px] mx-auto space-y-4 w-full min-w-0 overflow-x-hidden">
    <!-- === 1. DEDICATED MOVIE DETAIL PAGE === -->
    <div v-if="vod.selectedMovie" class="animate-fadeIn space-y-6">
      <!-- Active Video Player mounted immediately on click -->
      <div v-if="player.currentStream" class="vel-player-sticky-wrap space-y-3" id="movie-player-section">
        <VodPlayer />
      </div>

      <!-- Movie Article Detail -->
      <article class="vel-vod-detail vel-vod-detail--movie vel-vod-detail--art-themed">
        <!-- Floating Favorite Heart on Detail Page -->
        <button
          type="button"
          :class="['vel-favorite-detail-button', favs.isFavorite(vod.selectedMovie, 'movie') ? 'is-active' : '']"
          title="Favoris"
          aria-label="Favoris"
          @click.stop="favs.toggleFavorite(vod.selectedMovie, 'movie')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21s-8.5-4.8-8.5-11.2A4.8 4.8 0 0 1 12 6.7a4.8 4.8 0 0 1 8.5 3.1C20.5 16.2 12 21 12 21Z"></path>
          </svg>
        </button>

        <!-- Background Banner with Parallax / Fade -->
        <div
          class="vel-vod-detail__bg vel-vod-detail__bg--entered"
          :style="{
            backgroundImage: 'url(' + vod.selectedMovie.stream_icon + ')',
            '--vel-vod-hero-url': 'url(' + vod.selectedMovie.stream_icon + ')'
          }"
        ></div>

        <!-- Inner Content -->
        <div class="vel-vod-detail__inner">
          <div class="vel-vod-detail__details-panel">
            <!-- Title -->
            <h1 class="vel-vod-detail__title">
              {{ vod.selectedMovie.clean_name || vod.selectedMovie.name }}
            </h1>

            <!-- Meta Badges (Rating, Year, Duration, Genre) -->
            <div class="vel-vod-detail__meta">
              <span v-if="vod.movieDetail?.info?.rating" class="vel-vod-detail__rating">
                ★ {{ vod.movieDetail.info.rating }}
              </span>
              <span v-if="vod.movieDetail?.info?.releasedate" class="vel-vod-detail__genre">
                {{ vod.movieDetail.info.releasedate.slice(0, 4) }}
              </span>
              <span v-if="vod.movieDetail?.info?.duration_secs" class="vel-vod-detail__genre">
                {{ Math.floor(vod.movieDetail.info.duration_secs / 60) }} min
              </span>
              <span v-if="vod.movieDetail?.info?.genre" class="vel-vod-detail__genre">
                {{ vod.movieDetail.info.genre }}
              </span>
            </div>

            <!-- Watch / Play Button -->
            <div class="my-4">
              <button
                @click="playMovie(vod.selectedMovie)"
                type="button"
                class="vel-vod-detail__watch vel-vod-detail__watch--film primary velora-tv-focus cursor-pointer"
              >
                <span class="vel-vod-detail__watch-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" class="w-5 h-5 fill-current"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </span>
                <span class="vel-vod-detail__watch-text">{{ player.isPlaying ? 'En cours de lecture' : 'Regarder maintenant' }}</span>
              </button>
            </div>

            <!-- Synopsis Section -->
            <div class="vel-vod-detail__section">
              <h2 class="vel-vod-detail__section-title">Description</h2>
              <p class="vel-vod-detail__plot">
                {{ vod.movieDetail?.info?.plot || vod.movieDetail?.info?.description || 'Aucune description disponible pour ce titre.' }}
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

            <!-- Director Section -->
            <div v-if="vod.movieDetail?.info?.director" class="vel-vod-detail__section">
              <h2 class="vel-vod-detail__section-title">Réalisateur</h2>
              <p class="vel-vod-detail__director">{{ vod.movieDetail.info.director }}</p>
            </div>
          </div>
        </div>
      </article>
    </div>

    <!-- === 2. MOVIES CATALOG GRID VIEW === -->
    <div v-else class="space-y-4 w-full min-w-0">
      <!-- Movie Category / Package Pills -->
      <div class="vel-horizontal-category-rail flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none touch-pan-x">
        <button
          v-for="pkg in catalog.vodPackagesForCountry"
          :key="pkg.id"
          @click.stop="vod.selectMoviePackage(pkg)"
          type="button"
          :class="[
            'px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 flex-shrink-0 cursor-pointer select-none',
            String(vod.selectedMoviePackage?.id) === String(pkg.id)
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/60 border border-purple-400'
              : 'glass-panel text-slate-300 hover:text-white hover:bg-purple-900/30'
          ]"
        >
          <span>{{ pkg.display_name || pkg.name }}</span>
        </button>
      </div>

      <!-- Search / Filter Bar -->
      <div v-if="vod.movies.length > 0" class="max-w-md">
        <input
          v-model="movieFilter"
          type="text"
          placeholder="Filtrer les films de cette catégorie..."
          class="w-full px-3.5 py-2 rounded-xl bg-black/50 border border-purple-900/30 text-white text-xs placeholder:text-slate-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
        />
      </div>

      <!-- Exact Old Front Movie Media Loading Animation -->
      <div v-if="vod.loadingMovies" class="space-y-4">
        <div class="item-list item-list--media-loading py-6">
          <div class="vel-media-package-loader">
            <span class="vel-media-package-loader__text">Chargement des films</span>
            <span class="vel-media-package-loader__dots"><i></i><i></i><i></i></span>
          </div>
        </div>
        <div class="vel-vod-grid" aria-busy="true" aria-label="Chargement des films">
          <div
            v-for="i in 18"
            :key="'skeleton-movie-' + i"
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

      <!-- Movies Posters Grid -->
      <div v-else-if="filteredMovies.length > 0" class="vel-vod-grid">
        <article
          v-for="m in filteredMovies"
          :key="m.stream_id"
          @click="vod.openMovieDetail(m)"
          class="vel-vod-movie-card group"
        >
          <div class="vel-vod-movie-card__media">
            <img
              v-if="m.stream_icon"
              :src="resolveImageUrl(m.stream_icon)"
              :alt="m.name"
              class="w-full h-full object-cover group-hover:scale-104 transition-transform duration-300"
              loading="lazy"
              decoding="async"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-slate-600 text-xs font-bold p-2 text-center">
              {{ m.clean_name || m.name }}
            </div>

            <!-- Favorite Heart Button on Card -->
            <button
              type="button"
              :class="['vel-favorite-heart', favs.isFavorite(m, 'movie') ? 'is-active' : '']"
              title="Favoris"
              aria-label="Favoris"
              @click.stop="favs.toggleFavorite(m, 'movie')"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s-8.5-4.8-8.5-11.2A4.8 4.8 0 0 1 12 6.7a4.8 4.8 0 0 1 8.5 3.1C20.5 16.2 12 21 12 21Z"></path>
              </svg>
            </button>
          </div>
          <div class="vel-vod-movie-card__body">
            <h3 class="vel-vod-movie-card__title">{{ m.clean_name || m.name }}</h3>
          </div>
        </article>
      </div>

      <!-- Modern HTML5 Empty State -->
      <template v-else>
        <EmptyState
          v-if="catalog.vodPackagesForCountry.length === 0"
          icon="movie"
          title="Aucun film disponible"
          message="Ce pays ne propose pas de catalogue de films. Sélectionnez un autre pays pour explorer les films disponibles."
          action-text="Changer de pays"
          @action="openCountryPicker"
        />
        <EmptyState
          v-else-if="movieFilter.trim()"
          icon="search"
          title="Aucun film trouvé"
          :message="'Aucun résultat correspondant à « ' + movieFilter + ' » dans ce bouquet.'"
        />
        <EmptyState
          v-else
          icon="movie"
          title="Sélectionnez un bouquet"
          message="Choisissez une catégorie ci-dessus pour parcourir les films."
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
const movieFilter = ref('');

function openCountryPicker() {
  document.getElementById('btn-header-country')?.click();
}

const filteredMovies = computed(() => {
  const q = movieFilter.value.trim().toLowerCase();
  if (!q) return vod.movies;
  return vod.movies.filter(m => (m.clean_name || m.name).toLowerCase().includes(q));
});

const castList = computed(() => {
  const raw = String(vod.movieDetail?.info?.cast || '');
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

function playMovie(movie) {
  let durSecs = 0;
  if (vod.movieDetail?.info?.duration_secs) durSecs = Number(vod.movieDetail.info.duration_secs);
  else if (vod.movieDetail?.info?.duration) durSecs = Number(vod.movieDetail.info.duration) * 60;

  player.playStream(movie, { durationSeconds: durSecs });
  nextTick(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

watch(() => catalog.vodPackagesForCountry, (pkgs) => {
  if (pkgs.length > 0) {
    const exists = vod.selectedMoviePackage && pkgs.some(p => String(p.id) === String(vod.selectedMoviePackage.id));
    if (!exists || (vod.movies.length === 0 && !vod.loadingMovies)) {
      vod.selectMoviePackage(exists ? vod.selectedMoviePackage : pkgs[0]);
    }
  }
}, { immediate: true });

onMounted(async () => {
  if (catalog.allPackages.length === 0) {
    await catalog.loadCatalog();
  }
  const pkgs = catalog.vodPackagesForCountry;
  if (pkgs.length > 0) {
    const exists = vod.selectedMoviePackage && pkgs.some(p => String(p.id) === String(vod.selectedMoviePackage.id));
    if (!exists || (vod.movies.length === 0 && !vod.loadingMovies)) {
      vod.selectMoviePackage(exists ? vod.selectedMoviePackage : pkgs[0]);
    }
  }
});
</script>

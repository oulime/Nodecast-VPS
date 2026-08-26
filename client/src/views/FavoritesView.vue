<template>
  <div class="w-full min-w-0 p-4 md:p-8 xl:px-12 max-w-[1720px] mx-auto space-y-6 box-border">
    <header class="vel-favorites-page__header flex items-center justify-between w-full">
      <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">Mes favoris</h1>
      <span class="text-xs font-bold text-purple-300 px-3 py-1 rounded-full bg-purple-950/60 border border-purple-800/40">
        {{ favs.totalCount }} au total
      </span>
    </header>

    <!-- Sticky Video Player (if a favorite channel/movie is playing) -->
    <div v-if="player.currentStream" class="vel-player-sticky-wrap mb-4 w-full">
      <VideoPlayer v-if="player.currentStream.stream_type === 'live' || activeType === 'channel'" />
      <VodPlayer v-else />
    </div>

    <!-- Category Tabs -->
    <nav class="vel-favorites-tabs w-full" role="tablist" aria-label="Catégories de favoris">
      <button
        type="button"
        @click="activeType = 'channel'"
        :class="['vel-favorites-tab', activeType === 'channel' ? 'is-active' : '']"
        role="tab"
        :aria-selected="activeType === 'channel'"
      >
        <span>Chaînes</span>
        <small>{{ favs.channelCount }}</small>
      </button>

      <button
        type="button"
        @click="activeType = 'movie'"
        :class="['vel-favorites-tab', activeType === 'movie' ? 'is-active' : '']"
        role="tab"
        :aria-selected="activeType === 'movie'"
      >
        <span>Films</span>
        <small>{{ favs.movieCount }}</small>
      </button>

      <button
        type="button"
        @click="activeType = 'series'"
        :class="['vel-favorites-tab', activeType === 'series' ? 'is-active' : '']"
        role="tab"
        :aria-selected="activeType === 'series'"
      >
        <span>Séries</span>
        <small>{{ favs.seriesCount }}</small>
      </button>
    </nav>

    <!-- Main Content Panel -->
    <main class="vel-favorites-page__content w-full min-w-0">
      <!-- 1. CHANNELS TAB -->
      <section v-if="activeType === 'channel'" class="vel-favorites-group vel-favorites-group--channel w-full min-w-0">
        <div v-if="favs.channels.length > 0" class="vel-favorites-grid w-full">
          <article
            v-for="item in favs.channels"
            :key="item.item_id || item.stream_id"
            class="vel-favorites-card vel-favorites-card--channel group"
          >
            <button
              type="button"
              class="vel-favorites-card__open"
              @click="playChannel(item)"
            >
              <span class="vel-favorites-card__art">
                <img
                  v-if="item.thumb_url"
                  :src="resolveImageUrl(item.thumb_url)"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerpolicy="no-referrer"
                  crossorigin="anonymous"
                />
                <span v-else class="text-sm font-bold text-purple-400">TV</span>
              </span>
              <span class="vel-favorites-card__name">
                {{ item.name }}
              </span>
            </button>

            <!-- Remove from Favorites Heart -->
            <button
              type="button"
              class="vel-favorite-heart vel-favorite-heart--page is-active"
              title="Retirer des favoris"
              aria-label="Retirer des favoris"
              @click.stop="favs.toggleFavorite(item, 'channel')"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s-8.5-4.8-8.5-11.2A4.8 4.8 0 0 1 12 6.7a4.8 4.8 0 0 1 8.5 3.1C20.5 16.2 12 21 12 21Z"></path>
              </svg>
            </button>
          </article>
        </div>

        <EmptyState
          v-else
          icon="live"
          title="Aucune chaîne favorite"
          message="Vous n'avez pas encore ajouté de chaîne à vos favoris. Cliquez sur le cœur d'une chaîne pour la retrouver ici !"
        />
      </section>

      <!-- 2. MOVIES TAB -->
      <section v-else-if="activeType === 'movie'" class="vel-favorites-group vel-favorites-group--movie w-full min-w-0">
        <div v-if="favs.movies.length > 0" class="vel-favorites-grid w-full">
          <article
            v-for="item in favs.movies"
            :key="item.item_id || item.stream_id"
            class="vel-favorites-card vel-favorites-card--movie group"
          >
            <button
              type="button"
              class="vel-favorites-card__open"
              @click="openMovie(item)"
            >
              <span class="vel-favorites-card__art">
                <img
                  v-if="item.thumb_url"
                  :src="resolveImageUrl(item.thumb_url)"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerpolicy="no-referrer"
                  crossorigin="anonymous"
                />
                <span v-else class="text-2xl font-bold text-purple-400">F</span>
              </span>
              <span class="vel-favorites-card__name">
                {{ item.name }}
              </span>
            </button>

            <!-- Remove from Favorites Heart -->
            <button
              type="button"
              class="vel-favorite-heart vel-favorite-heart--page is-active"
              title="Retirer des favoris"
              aria-label="Retirer des favoris"
              @click.stop="favs.toggleFavorite(item, 'movie')"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s-8.5-4.8-8.5-11.2A4.8 4.8 0 0 1 12 6.7a4.8 4.8 0 0 1 8.5 3.1C20.5 16.2 12 21 12 21Z"></path>
              </svg>
            </button>
          </article>
        </div>

        <EmptyState
          v-else
          icon="movie"
          title="Aucun film favori"
          message="Vous n'avez pas encore ajouté de film à vos favoris. Cliquez sur le cœur d'un film pour le retrouver ici !"
        />
      </section>

      <!-- 3. SERIES TAB -->
      <section v-else-if="activeType === 'series'" class="vel-favorites-group vel-favorites-group--series w-full min-w-0">
        <div v-if="favs.series.length > 0" class="vel-favorites-grid w-full">
          <article
            v-for="item in favs.series"
            :key="item.item_id || item.stream_id"
            class="vel-favorites-card vel-favorites-card--series group"
          >
            <button
              type="button"
              class="vel-favorites-card__open"
              @click="openSeries(item)"
            >
              <span class="vel-favorites-card__art">
                <img
                  v-if="item.thumb_url"
                  :src="resolveImageUrl(item.thumb_url)"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerpolicy="no-referrer"
                  crossorigin="anonymous"
                />
                <span v-else class="text-2xl font-bold text-purple-400">S</span>
              </span>
              <span class="vel-favorites-card__name">
                {{ item.name }}
              </span>
            </button>

            <!-- Remove from Favorites Heart -->
            <button
              type="button"
              class="vel-favorite-heart vel-favorite-heart--page is-active"
              title="Retirer des favoris"
              aria-label="Retirer des favoris"
              @click.stop="favs.toggleFavorite(item, 'series')"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s-8.5-4.8-8.5-11.2A4.8 4.8 0 0 1 12 6.7a4.8 4.8 0 0 1 8.5 3.1C20.5 16.2 12 21 12 21Z"></path>
              </svg>
            </button>
          </article>
        </div>

        <EmptyState
          v-else
          icon="series"
          title="Aucune série favorite"
          message="Vous n'avez pas encore ajouté de série à vos favoris. Cliquez sur le cœur d'une série pour la retrouver ici !"
        />
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useFavoritesStore } from '../stores/favoritesStore.js';
import { usePlayerStore } from '../stores/playerStore.js';
import { useVodStore } from '../stores/vodStore.js';
import { useNavStore } from '../stores/navStore.js';
import { resolveImageUrl } from '../utils/image.js';
import VideoPlayer from '../components/VideoPlayer.vue';
import VodPlayer from '../components/VodPlayer.vue';
import EmptyState from '../components/EmptyState.vue';

const favs = useFavoritesStore();
const player = usePlayerStore();
const vod = useVodStore();
const nav = useNavStore();

const activeType = ref('channel');

onMounted(() => {
  favs.loadFavorites();
});

function playChannel(item) {
  const streamId = item.item_id || item.stream_id || item.id;
  const url = `/proxy/live/${streamId}.m3u8`;
  player.playStream({
    name: item.name,
    stream_id: streamId,
    stream_type: 'live'
  }, { directUrl: url });
}

function openMovie(item) {
  vod.openMovieDetail({
    stream_id: item.item_id || item.stream_id || item.id,
    name: item.name,
    stream_icon: item.thumb_url,
    container_extension: item.container_extension || 'mp4',
    source_id: item.source_id || 1
  });
  nav.setTab('movies');
}

function openSeries(item) {
  vod.openSeriesDetail({
    stream_id: item.item_id || item.stream_id || item.id,
    name: item.name,
    stream_icon: item.thumb_url,
    source_id: item.source_id || 1
  });
  nav.setTab('series');
}
</script>

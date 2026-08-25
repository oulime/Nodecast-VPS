<template>
  <div class="p-4 md:p-8 xl:px-12 max-w-[1720px] w-full mx-auto space-y-8">
    <!-- Dynamic Content Sections & Rails -->
    <div id="vel-home-sections" class="space-y-8">
      <!-- === 1. CONTINUER DE REGARDER === -->
      <section
        v-if="history.resumeItems.length > 0 && !catalog.loading"
        class="vel-home-section vel-home-section--resume has-scroll-controls"
      >
        <h3 class="vel-home-section__heading">Continuer de regarder</h3>

        <!-- Resume Horizontal Rail -->
        <div
          class="vel-home-section__rail"
          data-drag-scroll-bound="true"
          :ref="el => setRailRef(el, 'resume')"
        >
          <button
            v-for="item in history.resumeItems"
            :key="item.stream_id || item.item_id"
            @click="resumePlayback(item)"
            type="button"
            :class="[
              'vel-home-section__card vel-home-section__card--resume',
              item.type === 'series' || item.series_id ? 'vel-home-section__card--series' : 'vel-home-section__card--movies',
              isImageLoaded(item.stream_id || item.item_id) ? 'is-poster-ready' : 'is-poster-loading'
            ]"
            :aria-label="'Continuer de regarder ' + item.name"
          >
            <!-- Media Poster Image -->
            <img
              v-if="item.thumb_url || item.cover || item.stream_icon"
              :src="resolveImageUrl(item.thumb_url || item.cover || item.stream_icon)"
              alt=""
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              crossorigin="anonymous"
              :class="['vel-home-section__media', isImageLoaded(item.stream_id || item.item_id) ? 'is-loaded' : '']"
              @load="onImageLoad(item.stream_id || item.item_id)"
            />
            <div v-else class="vel-home-section__media vel-home-section__fallback">
              🎬
            </div>

            <!-- Center Play Icon -->
            <span class="vel-resume-play-center" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"></path></svg>
            </span>

            <!-- Season:Episode Badge for Series -->
            <span
              v-if="(item.type === 'series' || item.series_id) && item.season_number && item.episode_number"
              class="vel-resume-badge"
            >
              S{{ item.season_number }}:E{{ item.episode_number }}
            </span>

            <!-- Top-Right Remove Button -->
            <button
              @click.stop="history.removeResumeItem(item.stream_id || item.item_id)"
              type="button"
              class="vel-resume-remove-btn"
              aria-label="Supprimer de Continuer de regarder"
              title="Supprimer"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>

            <!-- Name Title & Episode Subtitle -->
            <span class="vel-home-section__name">
              <strong>{{ getCleanSeriesName(item) }}</strong>
              <small v-if="getEpisodeSubtitle(item)">{{ getEpisodeSubtitle(item) }}</small>
            </span>

            <!-- Progress Bar -->
            <div class="vel-resume-progress-bar">
              <div
                class="vel-resume-progress-fill"
                :style="{ width: Math.max(6, Math.min(100, item.percent || 15)) + '%' }"
              ></div>
            </div>
          </button>
        </div>

        <!-- Scroll Prev / Next Buttons -->
        <button
          type="button"
          class="vel-home-section__scroll-btn vel-home-section__scroll-btn--prev"
          aria-label="Faire défiler vers la gauche"
          @click="scrollRail('resume', -1)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg>
        </button>
        <button
          type="button"
          class="vel-home-section__scroll-btn vel-home-section__scroll-btn--next"
          aria-label="Faire défiler vers la droite"
          @click="scrollRail('resume', 1)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" style="transform: rotate(180deg);"><path d="M15 5l-7 7 7 7"></path></svg>
        </button>
      </section>

      <!-- Modern HTML5 Skeleton Home Rails Loading State -->
      <template v-if="catalog.loadingCatalog && catalog.currentHomeSections.length === 0">
        <section v-for="s in 3" :key="'skeleton-rail-' + s" class="vel-home-section space-y-4">
          <div class="vel-skeleton-line w-44 h-5 mb-3"></div>
          <div class="flex items-center gap-4 overflow-x-hidden pb-4">
            <div
              v-for="c in 8"
              :key="'skeleton-card-' + s + '-' + c"
              class="vel-skeleton-vod-card w-[145px] flex-shrink-0"
            >
              <div class="vel-skeleton-vod-poster"></div>
              <div class="vel-skeleton-vod-body">
                <div class="vel-skeleton-line w-3/4"></div>
              </div>
            </div>
          </div>
        </section>
      </template>

      <!-- === 2. COUNTRY CURATED CONTENT SECTIONS (EXACT REQUESTED STRUCTURE) === -->
      <section
        v-for="section in catalog.currentHomeSections"
        :key="section.id || section.title"
        class="vel-home-section has-scroll-controls"
      >
        <h3 class="vel-home-section__heading">{{ section.title }}</h3>
        
        <div
          class="vel-home-section__rail"
          data-drag-scroll-bound="true"
          :ref="el => setRailRef(el, section.id || section.title)"
        >
          <button
            v-for="entry in section.entries"
            :key="entry.id || entry.streamId || entry.name"
            @click="handleEntryClick(section, entry)"
            type="button"
            :class="[
              'vel-home-section__card',
              section.content_type === 'live' ? 'vel-home-section__card--live' : (section.content_type === 'series' ? 'vel-home-section__card--series' : 'vel-home-section__card--movies'),
              isImageLoaded(entry.id || entry.streamId || entry.name) ? 'is-poster-ready' : 'is-poster-loading'
            ]"
            :aria-label="entry.name"
            :data-package-id="section.package_id || entry.packageId"
            :data-package-name="section.title"
            :data-content-type="section.content_type || 'movies'"
            :data-media-id="entry.id || entry.streamId"
          >
            <img
              v-if="entry.thumbUrl"
              :src="resolveImageUrl(entry.thumbUrl)"
              alt=""
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              crossorigin="anonymous"
              :class="['vel-home-section__media', isImageLoaded(entry.id || entry.streamId || entry.name) ? 'is-loaded' : '']"
              @load="onImageLoad(entry.id || entry.streamId || entry.name)"
            />
            <div v-else class="vel-home-section__media vel-home-section__fallback">
              {{ section.content_type === 'live' ? '📺' : '🎬' }}
            </div>
            <span class="vel-home-section__name">{{ entry.name }}</span>
          </button>

          <!-- Voir tout le package Button Link -->
          <button
            v-if="section.package_id"
            @click="openSectionPackage(section)"
            type="button"
            :class="[
              'vel-home-section__card vel-home-section__package-link',
              section.content_type === 'live' ? 'vel-home-section__package-link--live' : (section.content_type === 'series' ? 'vel-home-section__package-link--series' : 'vel-home-section__package-link--movies')
            ]"
            :data-package-id="section.package_id"
            :data-content-type="section.content_type || 'movies'"
            aria-label="Voir tout le package"
          >
            <span class="vel-home-section__package-link-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" focusable="false">
                <circle cx="24" cy="24" r="19"></circle>
                <path d="M15.5 24h16.2m-6.4-6.4 6.4 6.4-6.4 6.4"></path>
              </svg>
            </span>
            <span class="vel-home-section__package-link-label">Voir tout le package</span>
          </button>
        </div>

        <!-- Scroll Prev / Next Buttons -->
        <button
          type="button"
          class="vel-home-section__scroll-btn vel-home-section__scroll-btn--prev"
          aria-label="Faire défiler vers la gauche"
          @click="scrollRail(section.id || section.title, -1)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg>
        </button>
        <button
          type="button"
          class="vel-home-section__scroll-btn vel-home-section__scroll-btn--next"
          aria-label="Faire défiler vers la droite"
          @click="scrollRail(section.id || section.title, 1)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" style="transform: rotate(180deg);"><path d="M15 5l-7 7 7 7"></path></svg>
        </button>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useNavStore } from '../stores/navStore.js';
import { useCatalogStore } from '../stores/catalogStore.js';
import { usePlayerStore } from '../stores/playerStore.js';
import { useVodStore } from '../stores/vodStore.js';
import { useHistoryStore } from '../stores/historyStore.js';
import { resolveImageUrl } from '../utils/image.js';

const nav = useNavStore();
const catalog = useCatalogStore();
const player = usePlayerStore();
const vod = useVodStore();
const history = useHistoryStore();

const loadedImages = ref(new Set());

function onImageLoad(id) {
  if (id) loadedImages.value.add(String(id));
}

function isImageLoaded(id) {
  return id ? loadedImages.value.has(String(id)) : false;
}

onMounted(async () => {
  history.loadAll();
  if (catalog.allPackages.length === 0) {
    await catalog.loadCatalog();
  }
});

function getCleanSeriesName(item) {
  if (item.series_name) return item.series_name;
  if (!item.name) return 'Titre';
  if (item.type === 'series' || item.series_id) {
    return item.name.split('—')[0].split(' - S0')[0].split(' S0')[0].trim();
  }
  return item.name;
}

function getEpisodeSubtitle(item) {
  if (item.episode_title) return item.episode_title;
  if (item.type === 'series' || item.series_id) {
    if (item.season_number && item.episode_number) {
      return `Saison ${item.season_number} • Épisode ${item.episode_number}`;
    }
    if (item.name.includes('—')) {
      return item.name.split('—').slice(1).join('—').trim();
    }
  }
  return '';
}

function resumePlayback(item) {
  const poster = item.thumb_url || item.cover || item.stream_icon || '';
  if (item.type === 'series' || item.series_id) {
    vod.openSeriesDetail({
      stream_id: item.series_id || item.stream_id,
      name: item.name,
      stream_icon: poster,
      cover: poster
    });
    nav.setTab('series');
    player.playStream(item);
  } else {
    vod.openMovieDetail({
      stream_id: item.stream_id,
      name: item.name,
      stream_icon: poster,
      cover: poster,
      container_extension: item.container_extension || 'mp4'
    });
    nav.setTab('movies');
    player.playStream(item);
  }
}

function handleEntryClick(section, entry) {
  if (section.content_type === 'live') {
    nav.setTab('live');
    const url = `/proxy/live/${entry.streamId || entry.id}.m3u8`;
    player.playStream({ name: entry.name, stream_id: entry.streamId || entry.id }, { directUrl: url });
  } else if (section.content_type === 'movies') {
    vod.openMovieDetail({
      stream_id: entry.streamId || entry.id,
      name: entry.name,
      stream_icon: entry.thumbUrl,
      container_extension: entry.containerExtension || 'mp4',
      source_id: entry.sourceId || 1
    });
    nav.setTab('movies');
  } else if (section.content_type === 'series') {
    vod.openSeriesDetail({
      stream_id: entry.streamId || entry.id,
      name: entry.name,
      stream_icon: entry.thumbUrl,
      source_id: entry.sourceId || 1
    });
    nav.setTab('series');
  }
}

const railRefs = ref({});

function setRailRef(el, key) {
  if (el) railRefs.value[key] = el;
}

function scrollRail(key, direction) {
  const rail = railRefs.value[key];
  if (rail) {
    const scrollAmount = rail.clientWidth * 0.75 * direction;
    rail.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  }
}

function openSectionPackage(section) {
  const pkgId = String(section.package_id || '');
  const pkg = catalog.allPackages.find(p => String(p.id) === pkgId);
  if (!pkg) return;

  if (section.content_type === 'live') {
    catalog.openPackage(pkg);
    nav.setTab('live');
  } else if (section.content_type === 'movies') {
    vod.openMoviePackage(pkg);
    nav.setTab('movies');
  } else if (section.content_type === 'series') {
    vod.openSeriesPackage(pkg);
    nav.setTab('series');
  }
}
</script>

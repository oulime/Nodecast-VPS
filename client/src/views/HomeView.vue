<template>
  <div class="p-4 md:p-8 xl:px-12 max-w-[1720px] w-full mx-auto space-y-8">
    <!-- Dynamic Content Sections & Rails -->
    <div id="vel-home-sections" class="space-y-8">
      <!-- === 1. CONTINUER DE REGARDER (EXACT 1:1 OLD APP DOM & CSS) === -->
      <section v-if="history.resumeItems.length > 0" class="vel-home-section vel-home-section--resume space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="vel-home-section__heading text-lg md:text-xl font-extrabold text-white flex items-center gap-2.5">
            <span class="w-3 h-3 rounded-full bg-[#e50914] shadow-md shadow-red-500/80 animate-pulse"></span>
            <span>Continuer de regarder</span>
          </h3>
        </div>

        <!-- Resume Horizontal Rail -->
        <div v-drag-scroll class="vel-home-section__rail flex items-center gap-4 overflow-x-auto pb-4 pt-1 scroll-smooth scrollbar-none">
          <div
            v-for="item in history.resumeItems"
            :key="item.stream_id || item.item_id"
            @click="resumePlayback(item)"
            role="button"
            :class="[
              'vel-home-section__card vel-home-section__card--resume',
              item.type === 'series' || item.series_id ? 'vel-home-section__card--series' : 'vel-home-section__card--movie'
            ]"
            tabindex="0"
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
              class="vel-home-section__media"
            />
            <div v-else class="vel-home-section__media-fallback flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br from-purple-950 via-slate-900 to-black text-purple-300 text-xs font-bold w-full h-full">
              <span class="text-3xl mb-1 opacity-80">🎬</span>
              <span class="line-clamp-2 px-1 text-slate-200">{{ item.name }}</span>
            </div>

            <!-- Center Play Icon -->
            <span class="vel-resume-play-center">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"></path></svg>
            </span>

            <!-- Season:Episode Badge (e.g. S1:E4) for Series -->
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
              title="Supprimer de Continuer de regarder"
              data-prevent-card-open="true"
            >
              <svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>

            <!-- Name Title & Episode Subtitle -->
            <span class="vel-home-section__name">
              <strong>{{ getCleanSeriesName(item) }}</strong>
              <small v-if="getEpisodeSubtitle(item)">{{ getEpisodeSubtitle(item) }}</small>
            </span>

            <!-- Red Progress Bar -->
            <div class="vel-resume-progress-bar">
              <div
                class="vel-resume-progress-fill"
                :style="{ width: Math.max(6, Math.min(100, item.percent || 15)) + '%' }"
              ></div>
            </div>
          </div>
        </div>
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
              section.content_type === 'live' ? 'vel-home-section__card--live' : (section.content_type === 'series' ? 'vel-home-section__card--series' : 'vel-home-section__card--movies')
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
              referrerpolicy="no-referrer"
              crossorigin="anonymous"
              class="vel-home-section__media"
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

<style scoped>
.vel-home-section__card--resume {
  position: relative;
  display: flex;
  flex-direction: column;
  width: clamp(140px, 14vw, 195px);
  aspect-ratio: 2 / 3;
  border-radius: 14px;
  overflow: hidden;
  background: #121218;
  border: 1px solid rgba(168, 85, 247, 0.22);
  cursor: pointer;
  flex-shrink: 0;
  text-align: left;
  padding: 0;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
  transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.22s ease, box-shadow 0.22s ease;
}

.vel-home-section__card--resume:hover,
.vel-home-section__card--resume:focus-visible {
  transform: scale(1.05) translateY(-2px);
  border-color: rgba(229, 9, 20, 0.85);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.8), 0 0 24px rgba(229, 9, 20, 0.4);
  outline: none;
}

.vel-home-section__media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.3s ease;
}

.vel-home-section__card--resume:hover .vel-home-section__media {
  transform: scale(1.06);
}

.vel-resume-play-center {
  position: absolute;
  top: 42%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.85);
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(229, 9, 20, 0.92);
  border: 2px solid rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  opacity: 0;
  pointer-events: none;
  z-index: 5;
  box-shadow: 0 4px 20px rgba(229, 9, 20, 0.7);
  transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.vel-resume-play-center svg {
  width: 22px;
  height: 22px;
  margin-left: 2px;
}

.vel-home-section__card--resume:hover .vel-resume-play-center {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1.08);
}

.vel-resume-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 6;
  background: rgba(6, 8, 17, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: #f8fafc;
  font-size: 0.72rem;
  font-weight: 850;
  letter-spacing: 0.04em;
  padding: 2px 7px;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}

.vel-resume-remove-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 7;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(6, 8, 17, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: opacity 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.vel-home-section__card--resume:hover .vel-resume-remove-btn {
  opacity: 1;
}

.vel-resume-remove-btn:hover {
  background: #e50914;
  border-color: #ff4d58;
  transform: scale(1.15);
}

.vel-home-section__name {
  position: absolute;
  bottom: 4.5px;
  left: 0;
  right: 0;
  z-index: 6;
  padding: 24px 10px 8px 10px;
  background: linear-gradient(0deg, rgba(6, 8, 17, 0.98) 0%, rgba(6, 8, 17, 0.82) 55%, transparent 100%);
  display: flex;
  flex-direction: column;
  gap: 2px;
  pointer-events: none;
}

.vel-home-section__name strong {
  color: #ffffff;
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vel-home-section__name small {
  color: #cbd5e1;
  font-size: 0.68rem;
  font-weight: 600;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.9;
}

.vel-resume-progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 4.5px;
  background: rgba(0, 0, 0, 0.85);
  z-index: 8;
  overflow: hidden;
}

.vel-resume-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #b91c1c 0%, #e50914 60%, #ff4d58 100%);
  box-shadow: 0 0 10px rgba(229, 9, 20, 0.95);
  border-radius: 0 2px 2px 0;
}
</style>

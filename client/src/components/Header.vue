<template>
  <header id="app-header" class="vel-header">
    <!-- Left: Back Button & Logo -->
    <div class="vel-header__left flex items-center gap-3">
      <button
        v-if="showBack"
        @click="nav.goBack()"
        type="button"
        id="btn-header-back"
        class="vel-header-back-btn"
        title="Retour"
        aria-label="Retour"
      >
        <svg viewBox="0 0 24 24" class="vel-header-back-icon" fill="none" stroke="currentColor" stroke-width="2.3">
          <path d="M19 12H5M12 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <!-- App Brand Logo (Only on Home Page) -->
      <div v-if="nav.activeTab === 'home'" class="cursor-pointer" @click="nav.setTab('home')">
        <div class="vel-home-brand" aria-label="VeloraVIP">
          <img class="vel-home-brand__icon" src="/logos/android-chrome-192x192.png" alt="" width="52" height="52" />
          <span class="vel-home-brand__name">Velora<span>VIP</span></span>
        </div>
      </div>
    </div>

    <!-- Center: Context Title (With exact accent line, only when there is a title and not on Home) -->
    <div
      v-if="contextTitle && nav.activeTab !== 'home'"
      id="vel-header-context-title"
      class="vel-header-context-title vel-category-heading vel-category-heading--neutral is-visible"
      aria-live="polite"
    >
      <h2 id="vel-header-context-title-text" class="vel-category-heading__title">{{ contextTitle }}</h2>
      <span class="vel-category-heading__accent-line" aria-hidden="true"></span>
    </div>
    <div v-else class="flex-1"></div>

    <!-- Right: Search & Country Dropdown -->
    <div class="vel-header__right flex items-center gap-2.5">
      <!-- Search Button -->
      <button
        @click="nav.isSearchOpen = true"
        type="button"
        id="btn-header-search"
        class="vel-header-search-btn"
        title="Recherche"
        aria-label="Recherche"
      >
        <svg viewBox="0 0 24 24" class="vel-header-search-icon" fill="none" stroke="currentColor" stroke-width="2.3">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </button>

      <!-- Country Trigger with Glued Dropdown -->
      <div class="relative">
        <button
          @click.stop="isHeaderCountryOpen = !isHeaderCountryOpen"
          type="button"
          id="btn-header-country"
          class="vel-header-country-btn"
          :title="catalog.selectedCountry?.name || 'Choisir un pays'"
          aria-label="Choisir un pays"
        >
          <img
            v-if="countryFlag"
            :src="countryFlag"
            :alt="catalog.selectedCountry?.name"
            class="vel-header-country-flag"
          />
          <span v-else class="text-sm">🌍</span>
        </button>

        <CountryDropdown
          :is-open="isHeaderCountryOpen"
          @close="isHeaderCountryOpen = false"
        />
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useNavStore } from '../stores/navStore.js';
import { useCatalogStore } from '../stores/catalogStore.js';
import { usePlayerStore } from '../stores/playerStore.js';
import { useVodStore } from '../stores/vodStore.js';
import CountryDropdown from './CountryDropdown.vue';

const nav = useNavStore();
const catalog = useCatalogStore();
const player = usePlayerStore();
const vod = useVodStore();
const isHeaderCountryOpen = ref(false);

function closeHeaderDropdown() {
  isHeaderCountryOpen.value = false;
}

onMounted(() => {
  window.addEventListener('click', closeHeaderDropdown);
});

onBeforeUnmount(() => {
  window.removeEventListener('click', closeHeaderDropdown);
});

const showBack = computed(() => {
  return nav.activeTab !== 'home' ||
         vod.selectedMovie !== null ||
         vod.selectedSeries !== null ||
         catalog.activePackage !== null ||
         catalog.activeParentPackage !== null;
});

const contextTitle = computed(() => {
  if (vod.selectedMovie) return vod.selectedMovie.clean_name || vod.selectedMovie.name;
  if (vod.selectedSeries) return vod.selectedSeries.clean_name || vod.selectedSeries.name;
  if (player.currentStream) return player.currentStream.name;
  if (catalog.activePackage) return catalog.activePackage.name;
  if (catalog.activeParentPackage) return catalog.activeParentPackage.name;
  if (nav.activeTab === 'favorites') return 'MES FAVORIS';
  if (nav.activeTab === 'live') return 'TV EN DIRECT';
  if (nav.activeTab === 'movies') return 'FILMS';
  if (nav.activeTab === 'series') return 'SÉRIES';
  return '';
});

const flagMap = {
  france: "fr", belgique: "be", suisse: "ch", espagne: "es", italie: "it",
  allemagne: "de", portugal: "pt", royaume_uni: "gb", "royaume-uni": "gb", angleterre: "gb", usa: "us", "etats-unis": "us", etats_unis: "us", canada: "ca",
  maroc: "ma", algerie: "dz", tunisie: "tn", egypte: "eg", turquie: "tr", pays_bas: "nl",
  pays_arabes: "sa", "pays-arabes": "sa", arabe: "sa", arabie_saoudite: "sa"
};

const countryFlag = computed(() => {
  if (!catalog.selectedCountry) return null;
  const key = catalog.selectedCountry.name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_");
  const code = flagMap[key] || "fr";
  return `https://flagcdn.com/w40/${code}.png`;
});
</script>

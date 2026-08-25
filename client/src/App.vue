<template>
  <LoginView v-if="!auth.isAuthenticated" />

  <main
    v-else
    :class="[
      'main main--velora',
      isInPackage ? 'main--velora-in-package main--velora-live-package' : ''
    ]"
    id="main"
  >
    <div class="vel-dashboard text-slate-100 pb-20 md:pb-16">
      <div class="vel-sticky-top">
        <Header />
      </div>

      <HomeView v-if="nav.activeTab === 'home'" />
      <LiveView v-else-if="nav.activeTab === 'live'" />
      <MoviesView v-else-if="nav.activeTab === 'movies'" />
      <SeriesView v-else-if="nav.activeTab === 'series'" />
      <FavoritesView v-else-if="nav.activeTab === 'favorites'" />
      <ProfileView v-else-if="nav.activeTab === 'profile'" />

      <!-- Favorites Toast Notification -->
      <div
        v-if="favs.toastMessage"
        id="vel-favorites-toast"
        class="vel-favorites-toast is-visible"
        :class="{ 'is-error': favs.toastIsError }"
        role="status"
      >
        {{ favs.toastMessage }}
      </div>

      <BottomNav />
      <SearchModal />
    </div>

    <!-- Exact Old Front Fullscreen Catalog & Page Loading Overlay -->
    <CatalogLoadingOverlay
      :show="catalog.loading"
      :status="catalog.loadingStatus"
      :accent="catalog.loadingAccent"
    />
  </main>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useAuthStore } from './stores/authStore.js';
import { useNavStore } from './stores/navStore.js';
import { useCatalogStore } from './stores/catalogStore.js';
import { useVodStore } from './stores/vodStore.js';
import { useFavoritesStore } from './stores/favoritesStore.js';
import LoginView from './views/LoginView.vue';
import Header from './components/Header.vue';
import BottomNav from './components/BottomNav.vue';
import SearchModal from './components/SearchModal.vue';
import CatalogLoadingOverlay from './components/CatalogLoadingOverlay.vue';
import HomeView from './views/HomeView.vue';
import LiveView from './views/LiveView.vue';
import MoviesView from './views/MoviesView.vue';
import SeriesView from './views/SeriesView.vue';
import FavoritesView from './views/FavoritesView.vue';
import ProfileView from './views/ProfileView.vue';

const auth = useAuthStore();
const nav = useNavStore();
const catalog = useCatalogStore();
const vod = useVodStore();
const favs = useFavoritesStore();

const isInPackage = computed(() => {
  return Boolean(
    catalog.activePackage ||
    catalog.activeParentPackage ||
    vod.selectedMovie ||
    vod.selectedSeries ||
    vod.activeMoviePackage ||
    vod.activeSeriesPackage
  );
});

function handleKeydown(event) {
  const isBack = event.key === 'Escape' ||
                 event.key === 'Backspace' ||
                 event.key === 'BrowserBack' ||
                 event.key === 'GoBack' ||
                 event.keyCode === 8 ||
                 event.keyCode === 27 ||
                 event.keyCode === 461 ||
                 event.keyCode === 10009;

  if (isBack) {
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      if (event.key === 'Backspace' || event.keyCode === 8) return;
    }
    event.preventDefault();
    nav.goBack();
  }
}

function handlePopState() {
  nav.goBack();
}

watch(() => auth.isAuthenticated, async (isAuth) => {
  if (isAuth) {
    await catalog.loadCatalog();
    await favs.loadFavorites();
  }
});

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown, true);
  window.addEventListener('popstate', handlePopState);
  if (auth.isAuthenticated) {
    await catalog.loadCatalog();
    await favs.loadFavorites();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown, true);
  window.removeEventListener('popstate', handlePopState);
});
</script>

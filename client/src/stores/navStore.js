import { defineStore } from 'pinia';
import { useCatalogStore } from './catalogStore.js';
import { usePlayerStore } from './playerStore.js';
import { useVodStore } from './vodStore.js';

export const useNavStore = defineStore('nav', {
  state: () => ({
    activeTab: 'home', // 'home' | 'live' | 'movies' | 'series' | 'profile'
    isCountryModalOpen: false,
    isSearchOpen: false
  }),
  actions: {
    setTab(tab) {
      if (this.activeTab === tab) return;
      const catalog = useCatalogStore();
      const player = usePlayerStore();
      const vod = useVodStore();
      
      this.activeTab = tab;
      this.isCountryModalOpen = false;
      this.isSearchOpen = false;
      
      // Stop playback immediately on any tab / page change
      player.stop();

      if (tab === 'home') {
        catalog.closePackage();
        catalog.closeParentPackage();
        vod.closeMovieDetail();
        vod.closeSeriesDetail();
      }
      
      window.history.pushState({ tab }, '', window.location.href);
    },
    openCountryModal() {
      const catalog = useCatalogStore();
      if (catalog.countries.length === 0) {
        catalog.loadCatalog();
      }
      this.isCountryModalOpen = true;
    },
    closeCountryModal() {
      this.isCountryModalOpen = false;
    },
    toggleCountryModal() {
      if (this.isCountryModalOpen) this.closeCountryModal();
      else this.openCountryModal();
    },
    // The Universal Back Handler (used by Header Back button, Remote Control, Keyboard, and Browser Popstate)
    goBack() {
      const catalog = useCatalogStore();
      const player = usePlayerStore();
      const vod = useVodStore();

      // 1. Close open search modal
      if (this.isSearchOpen) {
        this.isSearchOpen = false;
        return;
      }

      // 2. Close open country picker
      if (this.isCountryModalOpen) {
        this.isCountryModalOpen = false;
        return;
      }

      // 3. Movie Detail page -> back to Movies catalog
      if (vod.selectedMovie) {
        player.stop();
        vod.closeMovieDetail();
        return;
      }

      // 4. Series Detail page -> back to Series catalog
      if (vod.selectedSeries) {
        player.stop();
        vod.closeSeriesDetail();
        return;
      }

      // 5. Live Package channels view -> back to Packages
      if (catalog.activePackage) {
        player.stop();
        catalog.closePackage();
        return;
      }

      // 6. Parent Bouquet view -> back to main Live bouquets
      if (catalog.activeParentPackage) {
        catalog.closeParentPackage();
        return;
      }

      // 7. Any other tab (live, movies, series, profile) -> back to Home
      if (this.activeTab !== 'home') {
        this.activeTab = 'home';
        player.stop();
        catalog.closePackage();
        catalog.closeParentPackage();
        vod.closeMovieDetail();
        vod.closeSeriesDetail();
        return;
      }

      // 8. On Home -> browser back if possible
      if (window.history.length > 1) {
        window.history.back();
      }
    }
  }
});

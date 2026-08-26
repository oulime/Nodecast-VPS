import { defineStore } from 'pinia';
import { api } from '../api/index.js';
import { useCatalogStore, cleanItemName, isItemHiddenByAdmin } from './catalogStore.js';
import { usePlayerStore } from './playerStore.js';

export const useVodStore = defineStore('vod', {
  state: () => ({
    selectedMoviePackage: null,
    movies: [],
    selectedMovie: null,
    movieDetail: null,
    selectedSeriesPackage: null,
    seriesList: [],
    selectedSeries: null,
    seriesDetail: null,
    selectedSeason: 1,
    loadingMovies: false,
    loadingSeries: false,
    detailLoading: false
  }),
  actions: {
    // === MOVIES (VOD) ===
    async selectMoviePackage(pkg) {
      if (!pkg) return;
      const catalog = useCatalogStore();
      const player = usePlayerStore();
      player.stop();
      const countryId = catalog.selectedCountry?.id || 'country_france';
      this.selectedMoviePackage = pkg;
      this.selectedMovie = null;
      this.loadingMovies = true;
      this.movies = [];
      try {
        const catId = pkg.category_id || pkg.id;
        const sourceId = pkg.source_id || null;
        const res = await api.getPackageMediaItems(countryId, pkg.id, 'vod', sourceId, catId);
        const rawItems = res.items || [];
        this.movies = rawItems
          .filter(m => !isItemHiddenByAdmin(m.name, catalog.hiddenFilters))
          .map(m => ({
            ...m,
            clean_name: cleanItemName(m.name, catalog.channelPrefixes)
          }));
      } catch (err) {
        console.error('Failed to load movie items', err);
        this.movies = [];
      } finally {
        this.loadingMovies = false;
      }
    },
    async openMovieDetail(movie) {
      const player = usePlayerStore();
      player.stop();
      this.selectedMovie = movie;
      this.movieDetail = null;
      this.detailLoading = true;
      window.history.pushState({ view: 'movie-detail', id: movie.stream_id }, '', window.location.href);
      
      const sourceId = movie.source_id || 1;
      try {
        const res = await fetch(`/api/proxy/xtream/${sourceId}/vod_info?vod_id=${movie.stream_id}`);
        this.movieDetail = await res.json();
      } catch (e) {
        console.error('Failed to load movie detail', e);
      } finally {
        this.detailLoading = false;
      }
    },
    closeMovieDetail() {
      const player = usePlayerStore();
      player.stop();
      this.selectedMovie = null;
      this.movieDetail = null;
    },

    // === SERIES ===
    async selectSeriesPackage(pkg) {
      if (!pkg) return;
      const catalog = useCatalogStore();
      const player = usePlayerStore();
      player.stop();
      const countryId = catalog.selectedCountry?.id || 'country_france';
      this.selectedSeriesPackage = pkg;
      this.selectedSeries = null;
      this.loadingSeries = true;
      this.seriesList = [];
      try {
        const catId = pkg.category_id || pkg.id;
        const sourceId = pkg.source_id || null;
        const res = await api.getPackageMediaItems(countryId, pkg.id, 'series', sourceId, catId);
        const rawItems = res.items || [];
        this.seriesList = rawItems
          .filter(s => !isItemHiddenByAdmin(s.name, catalog.hiddenFilters))
          .map(s => ({
            ...s,
            clean_name: cleanItemName(s.name, catalog.channelPrefixes)
          }));
      } catch (err) {
        console.error('Failed to load series items', err);
        this.seriesList = [];
      } finally {
        this.loadingSeries = false;
      }
    },
    async openSeriesDetail(series) {
      const player = usePlayerStore();
      player.stop();
      this.selectedSeries = series;
      this.seriesDetail = null;
      this.selectedSeason = 1;
      this.detailLoading = true;
      window.history.pushState({ view: 'series-detail', id: series.stream_id || series.series_id }, '', window.location.href);

      const sourceId = series.source_id || 1;
      try {
        const res = await fetch(`/api/proxy/xtream/${sourceId}/series_info?series_id=${series.stream_id || series.series_id}`);
        this.seriesDetail = await res.json();
      } catch (e) {
        console.error('Failed to load series detail', e);
      } finally {
        this.detailLoading = false;
      }
    },
    closeSeriesDetail() {
      const player = usePlayerStore();
      player.stop();
      this.selectedSeries = null;
      this.seriesDetail = null;
    }
  }
});

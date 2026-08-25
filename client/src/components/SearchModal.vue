<template>
  <div v-if="nav.isSearchOpen" class="fixed inset-0 z-50 flex items-start justify-center p-4 md:pt-16 bg-black/85 backdrop-blur-md">
    <div class="glass-panel w-full max-w-2xl rounded-3xl p-6 space-y-4 max-h-[80vh] flex flex-col border border-purple-800/40 shadow-2xl">
      <!-- Search Bar -->
      <div class="flex items-center gap-3">
        <div class="relative flex-1">
          <input
            v-model="query"
            ref="inputRef"
            type="text"
            placeholder="Rechercher une chaîne, un film ou une série..."
            class="w-full px-4 py-3 pl-11 rounded-2xl bg-black/60 border border-purple-800/40 text-white text-sm placeholder:text-slate-500 focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 transition-all"
            @input="handleInput"
          />
          <svg class="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <button @click="nav.isSearchOpen = false" class="p-2.5 rounded-xl bg-purple-950 border border-purple-800/30 text-slate-400 hover:text-white">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Results Area -->
      <div class="flex-1 overflow-y-auto space-y-2 pr-1">
        <div v-if="loading" class="p-8 text-center text-xs text-purple-300">Recherche en cours...</div>
        <div v-else-if="results.length > 0" class="space-y-1.5">
          <div
            v-for="item in results"
            :key="item.id || item.stream_id"
            @click="selectResult(item)"
            class="flex items-center justify-between p-3 rounded-xl hover:bg-purple-900/30 border border-transparent hover:border-purple-500/30 cursor-pointer transition-all"
          >
            <div class="flex items-center gap-3 min-w-0">
              <img v-if="item.stream_icon || item.cover" :src="item.stream_icon || item.cover" class="w-8 h-8 object-contain rounded bg-black/40 p-0.5 flex-shrink-0" alt="" />
              <div class="truncate">
                <span class="text-xs font-semibold text-white">{{ item.name || item.title }}</span>
                <span class="text-[10px] text-slate-400 block">{{ item.category_name || item.type }}</span>
              </div>
            </div>
            <span class="text-[10px] font-bold uppercase tracking-wider text-purple-300 bg-purple-950 px-2 py-0.5 rounded border border-purple-500/30">
              {{ item.stream_type === 'live' ? 'Live' : (item.stream_type === 'movie' ? 'Film' : 'Série') }}
            </span>
          </div>
        </div>
        <div v-else-if="query.trim()" class="p-8 text-center text-xs text-slate-500">
          Aucun résultat pour "{{ query }}"
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { useNavStore } from '../stores/navStore.js';
import { usePlayerStore } from '../stores/playerStore.js';
import { useCatalogStore, isItemHiddenByAdmin } from '../stores/catalogStore.js';

const nav = useNavStore();
const player = usePlayerStore();
const catalog = useCatalogStore();
const query = ref('');
const results = ref([]);
const loading = ref(false);
const inputRef = ref(null);
let timeout = null;

function handleInput() {
  clearTimeout(timeout);
  if (!query.value.trim()) {
    results.value = [];
    return;
  }
  loading.value = true;
  timeout = setTimeout(async () => {
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query.value.trim())}`);
      const data = await res.json();
      const raw = data.results || data || [];
      results.value = raw
        .filter(item => !isItemHiddenByAdmin(item.name || item.title, catalog.hiddenFilters))
        .slice(0, 30);
    } catch (e) {
      console.error(e);
    } finally {
      loading.value = false;
    }
  }, 250);
}

function selectResult(item) {
  nav.isSearchOpen = false;
  const url = `/proxy/live/${item.stream_id}.m3u8`;
  player.playStream(item, url);
}

watch(() => nav.isSearchOpen, (open) => {
  if (open) {
    setTimeout(() => inputRef.value?.focus(), 100);
  } else {
    query.value = '';
    results.value = [];
  }
});
</script>

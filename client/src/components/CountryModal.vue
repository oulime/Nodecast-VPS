<template>
  <div
    v-if="nav.isCountryModalOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
    @click.self="nav.closeCountryModal()"
  >
    <div class="glass-panel w-full max-w-lg rounded-3xl p-6 space-y-4 max-h-[85vh] flex flex-col border border-purple-800/40 shadow-2xl">
      <!-- Modal Header -->
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-base font-bold text-white">Sélectionner un pays</h3>
          <p class="text-xs text-slate-400">{{ catalog.countries.length }} pays disponibles</p>
        </div>
        <button @click="nav.closeCountryModal()" class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-purple-900/30">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Search Input -->
      <div class="relative">
        <input
          v-model="searchQuery"
          ref="searchInput"
          type="text"
          placeholder="Rechercher un pays (ex: France, Arabe, Espagne...)"
          class="w-full px-4 py-2.5 pl-10 rounded-xl bg-black/60 border border-purple-900/40 text-white text-xs placeholder:text-slate-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
        />
        <svg class="w-4 h-4 text-slate-400 absolute left-3.5 top-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>

      <!-- Countries List -->
      <div class="flex-1 overflow-y-auto space-y-1.5 pr-1">
        <button
          v-for="c in filteredCountries"
          :key="c.id"
          @click="select(c)"
          type="button"
          :class="[
            'w-full flex items-center justify-between p-3 rounded-xl transition-all text-left',
            catalog.selectedCountry?.id === c.id
              ? 'bg-purple-600/30 border border-purple-500/50 text-white font-semibold shadow-lg shadow-purple-950/40'
              : 'hover:bg-purple-900/20 text-slate-300 hover:text-white'
          ]"
        >
          <div class="flex items-center gap-3">
            <img :src="getFlag(c.name)" class="w-6 h-4 object-cover rounded shadow-sm flex-shrink-0" alt="" />
            <span class="text-xs font-medium">{{ c.name }}</span>
          </div>
          <span v-if="catalog.selectedCountry?.id === c.id" class="text-purple-400 text-xs font-bold">✓ Actif</span>
        </button>

        <div v-if="filteredCountries.length === 0" class="p-6 text-center text-xs text-slate-500">
          Aucun pays trouvé pour "{{ searchQuery }}"
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { useNavStore } from '../stores/navStore.js';
import { useCatalogStore } from '../stores/catalogStore.js';

const nav = useNavStore();
const catalog = useCatalogStore();
const searchQuery = ref('');
const searchInput = ref(null);

const flagMap = {
  france: "fr", belgique: "be", suisse: "ch", espagne: "es", italie: "it",
  allemagne: "de", portugal: "pt", royaume_uni: "gb", "royaume-uni": "gb", angleterre: "gb", usa: "us", "etats-unis": "us", etats_unis: "us", canada: "ca",
  maroc: "ma", algerie: "dz", tunisie: "tn", egypte: "eg", turquie: "tr", pays_bas: "nl",
  pays_arabes: "sa", "pays-arabes": "sa", arabe: "sa", arabie_saoudite: "sa", pologne: "pl", roumanie: "ro",
  russie: "ru", ukraine: "ua", bresil: "br", senegal: "sn", mali: "ml", somalie: "so", albanie: "al",
  bulgarie: "bg", chine: "cn", grece: "gr", inde: "in", armenie: "am", bangladesh: "bd"
};

function getFlag(name) {
  const key = String(name || '').toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_");
  const code = flagMap[key] || "fr";
  return `https://flagcdn.com/w40/${code}.png`;
}

const filteredCountries = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return catalog.countries;
  return catalog.countries.filter(c => c.name.toLowerCase().includes(q));
});

function select(country) {
  catalog.selectCountry(country);
  nav.closeCountryModal();
}

watch(() => nav.isCountryModalOpen, (open) => {
  if (open) {
    nextTick(() => searchInput.value?.focus());
  } else {
    searchQuery.value = '';
  }
});
</script>

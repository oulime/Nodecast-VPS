<template>
  <div
    v-if="isOpen"
    id="vel-bottom-country-menu"
    class="vel-bottom-country-menu"
    role="listbox"
    aria-label="Choisir un pays"
    @click.stop
  >
    <div class="vel-bottom-country-menu__title">Choisir un pays</div>

    <!-- Options List -->
    <div
      id="vel-bottom-country-options"
      class="vel-bottom-country-options"
    >
      <button
        v-for="c in catalog.countries"
        :key="c.id"
        type="button"
        :class="[
          'vel-bottom-country-menu__option',
          catalog.selectedCountry?.id === c.id ? 'is-selected' : ''
        ]"
        :data-country-id="c.id"
        role="option"
        :aria-selected="catalog.selectedCountry?.id === c.id ? 'true' : 'false'"
        @click="selectCountry(c)"
      >
        <img class="vel-app-country-option__logo" alt="" decoding="async" :src="getFlag(c.name)" />
        <span class="vel-app-country-option__name">{{ c.name }}</span>
        <span v-if="catalog.selectedCountry?.id === c.id" class="vel-bottom-country-menu__check" aria-hidden="true">✓</span>
      </button>

      <div v-if="catalog.countries.length === 0" class="p-4 text-center text-xs text-slate-500">
        Aucun pays disponible
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useCatalogStore } from '../stores/catalogStore.js';

const props = defineProps({
  isOpen: Boolean
});

const emit = defineEmits(['close', 'select']);
const catalog = useCatalogStore();

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

function selectCountry(c) {
  catalog.selectCountry(c);
  emit('select', c);
  emit('close');
}
</script>

<style scoped>
.vel-bottom-country-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 2500;
  width: min(290px, calc(100vw - 32px));
  max-height: min(60vh, 420px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 6px;
  border: 1px solid rgba(151, 135, 255, 0.35);
  border-radius: 18px;
  background: linear-gradient(145deg, rgba(27, 23, 55, 0.98), rgba(7, 11, 27, 0.98));
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7), 0 0 24px rgba(109, 77, 255, 0.2);
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
}

.vel-bottom-country-options {
  flex: 1 1 auto;
  min-height: 0;
  max-height: 280px;
  overflow-y: auto !important;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  padding: 4px;
  scrollbar-width: thin;
  scrollbar-color: rgba(168, 85, 247, 0.4) transparent;
}

.vel-bottom-country-options::-webkit-scrollbar {
  width: 5px;
}

.vel-bottom-country-options::-webkit-scrollbar-thumb {
  background: rgba(168, 85, 247, 0.4);
  border-radius: 999px;
}

.vel-bottom-country-menu__title {
  padding: 8px 10px 6px;
  color: rgba(238, 237, 255, 0.72);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.vel-bottom-country-menu__option {
  width: 100%;
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 8px 11px;
  border: 0;
  border-radius: 11px;
  color: rgba(238, 237, 255, 0.78);
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.vel-bottom-country-menu__option:hover,
.vel-bottom-country-menu__option:focus-visible {
  color: #fff;
  background: rgba(125, 92, 255, 0.18);
  outline: none;
}

.vel-bottom-country-menu__option.is-selected {
  color: #fff;
  background: linear-gradient(135deg, rgba(126, 87, 255, 0.35), rgba(52, 197, 255, 0.15));
  font-weight: 750;
}

.vel-app-country-option__logo {
  width: 28px;
  height: 20px;
  flex: 0 0 28px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.06);
  object-fit: cover;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.32);
}

.vel-app-country-option__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vel-bottom-country-menu__check {
  color: #6dd5ff;
  font-size: 17px;
  line-height: 1;
  margin-left: auto;
  font-weight: 900;
}
</style>

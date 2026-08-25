<template>
  <div class="vel-casino-wheel-wrapper w-full max-w-4xl mx-auto select-none" ref="wheelWrapperRef">
    <!-- 1. Casino Header Bar -->
    <div class="vel-casino-header flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl mb-3">
      <div class="flex items-center gap-2.5">
        <div class="vel-casino-badge">
          <span class="vel-casino-led animate-pulse"></span>
          <span>ROULETTE LIVE TV</span>
        </div>
        <span class="text-xs text-purple-300/80 font-bold hidden sm:inline">
          {{ packages.length }} bouquets
        </span>
      </div>

      <!-- Spin Action Button -->
      <button
        @click="spinWheelRandom()"
        type="button"
        :disabled="isSpinning"
        class="vel-casino-spin-btn cursor-pointer active:scale-95"
        title="Faire tourner la roulette"
      >
        <span class="vel-casino-spin-btn__icon" :class="{ 'animate-spin': isSpinning }">🎰</span>
        <span>SPIN !</span>
      </button>
    </div>

    <!-- 2. 3D Casino Roulette / Coverflow Arena -->
    <div class="vel-wheel-arena relative overflow-hidden rounded-3xl p-3 md:p-6 flex flex-col items-center justify-center">
      <!-- Ambient Lighting Glow -->
      <div class="vel-casino-ambient-glow" aria-hidden="true"></div>

      <!-- Center Ticker Pointer Indicator -->
      <div class="vel-wheel-pointer" :class="{ 'is-ticking': isTicking }" aria-hidden="true">
        <div class="vel-wheel-pointer__triangle"></div>
      </div>

      <!-- 3D Stage -->
      <div
        class="vel-coverflow-stage"
        @mousedown="startDrag"
        @touchstart.passive="startTouch"
        @wheel.prevent="handleWheelScroll"
      >
        <div
          v-for="(pkg, idx) in visibleCards"
          :key="pkg.id"
          @click="selectCard(pkg._origIndex)"
          :class="[
            'vel-coverflow-card',
            pkg._isCenter ? 'is-center-card' : '',
            pkg.is_parent ? 'is-parent-card' : ''
          ]"
          :style="pkg._style"
          :data-package-id="pkg.id"
        >
          <div class="vel-coverflow-card__inner">
            <!-- Multi Badge for Parent -->
            <span v-if="pkg.is_parent" class="vel-coverflow-card__parent-badge">
              📂 MULTI
            </span>

            <!-- Cover Logo -->
            <div class="vel-coverflow-card__logo-wrap">
              <img
                v-if="pkg.cover_url"
                :src="resolveImageUrl(pkg.cover_url)"
                alt=""
                loading="lazy"
                class="vel-coverflow-card__logo"
                @error="pkg._imgError = true"
              />
              <span v-else class="text-3xl">📺</span>
            </div>

            <!-- Title -->
            <h4 class="vel-coverflow-card__title">
              {{ pkg.display_name || pkg.name }}
            </h4>

            <!-- Footer Badge -->
            <div class="vel-coverflow-card__footer">
              <span v-if="pkg.is_parent" class="text-[10.5px] text-amber-300 font-black">
                {{ (pkg.child_package_ids || []).length }} sous-bouquets
              </span>
              <span v-else class="text-[10.5px] text-purple-300 font-bold">
                Direct TV
              </span>
            </div>
          </div>
        </div>

        <!-- Navigation Arrows (Anchored firmly inside the fixed 220px card stage) -->
        <button
          @click.stop="stepCard(-1)"
          type="button"
          class="vel-wheel-nav-arrow vel-wheel-nav-arrow--prev"
          aria-label="Précédent"
          title="Précédent"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.6" fill="none">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <button
          @click.stop="stepCard(1)"
          type="button"
          class="vel-wheel-nav-arrow vel-wheel-nav-arrow--next"
          aria-label="Suivant"
          title="Suivant"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.6" fill="none">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 3. Action Deck (Strictly Separated Below the Arena) -->
    <div class="vel-action-deck mt-3">
      <Transition name="vel-sub-pop" mode="out-in">
        <!-- CASE 1: PARENT PACKAGE -> SHOW SUB-BOUQUETS IN CLEAN CARDS -->
        <div
          v-if="activePackage && activePackage.is_parent"
          :key="'parent-' + activePackage.id"
          class="vel-sub-tray p-4 sm:p-5 rounded-2xl"
        >
          <div class="flex items-center justify-between gap-2 mb-3">
            <h4 class="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
              <span>📂</span>
              <span>Sous-bouquets de {{ activePackage.display_name || activePackage.name }} :</span>
            </h4>
            <span class="text-[11px] font-bold text-slate-400">
              {{ childPackages.length }} choix
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            <button
              v-for="(child, cIdx) in childPackages"
              :key="child.id"
              @click="$emit('select-package', child)"
              type="button"
              class="vel-sub-card group cursor-pointer active:scale-95"
              :style="{ animationDelay: `${cIdx * 0.04}s` }"
            >
              <div class="vel-sub-card__thumb">
                <img
                  v-if="child.cover_url"
                  :src="resolveImageUrl(child.cover_url)"
                  alt=""
                  class="w-full h-full object-contain p-1"
                />
                <span v-else class="text-sm">📺</span>
              </div>
              <span class="vel-sub-card__name">
                {{ child.display_name || child.name }}
              </span>
              <span class="vel-sub-card__arrow">▶</span>
            </button>
          </div>
        </div>

        <!-- CASE 2: SINGLE DIRECT PACKAGE -> SHOW BIG OPEN BUTTON -->
        <div
          v-else-if="activePackage"
          :key="'single-' + activePackage.id"
          class="vel-single-tray p-4 sm:p-5 rounded-2xl flex flex-col items-center justify-center gap-2"
        >
          <button
            @click="$emit('select-package', activePackage)"
            type="button"
            class="vel-btn-open-package cursor-pointer active:scale-95"
          >
            <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span>Ouvrir {{ activePackage.display_name || activePackage.name }}</span>
          </button>
          <span class="text-xs text-purple-200/80 font-medium">
            Cliquez pour lancer les chaînes de ce bouquet
          </span>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useCatalogStore, cleanItemName } from '../stores/catalogStore.js';
import { resolveImageUrl } from '../utils/image.js';

const props = defineProps({
  packages: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['select-package']);
const catalog = useCatalogStore();

const currentIndex = ref(0);
const animatedIndex = ref(0);
const isDragging = ref(false);
const isSpinning = ref(false);
const isTicking = ref(false);
const wheelWrapperRef = ref(null);

let startX = 0;
let dragStartIndex = 0;
let animFrameId = null;

const totalItems = computed(() => Math.max(1, props.packages.length));

const activePackage = computed(() => {
  if (props.packages.length === 0) return null;
  const idx = ((Math.round(animatedIndex.value) % totalItems.value) + totalItems.value) % totalItems.value;
  return props.packages[idx] || props.packages[0];
});

const childPackages = computed(() => {
  if (!activePackage.value || !activePackage.value.is_parent) return [];
  const childIds = new Set(
    Array.isArray(activePackage.value.child_package_ids)
      ? activePackage.value.child_package_ids.map(String)
      : []
  );
  return catalog.allPackages
    .filter(p => childIds.has(String(p.id)) && (!p.kind || p.kind === 'live'))
    .map(p => ({
      ...p,
      display_name: cleanItemName(p.name, catalog.channelPrefixes)
    }));
});

// Calculate non-intersecting 3D Coverflow layout for each card
const visibleCards = computed(() => {
  const total = totalItems.value;
  if (total === 0) return [];

  const current = animatedIndex.value;
  const result = [];

  for (let i = 0; i < total; i++) {
    // Relative shortest offset distance
    let diff = (i - current) % total;
    if (diff > total / 2) diff -= total;
    if (diff < -total / 2) diff += total;

    const absDist = Math.abs(diff);

    // Only render cards within visual horizon to eliminate clutter
    if (absDist > 2.8) continue;

    // Spacing constants (Strictly horizontal glide with big cards)
    const spacingX = window.innerWidth < 640 ? 128 : 155;
    const tx = diff * spacingX;
    const opacity = Math.max(0, 1 - absDist * 0.42);
    const zIndex = Math.round(100 - absDist * 10);
    const isCenter = absDist < 0.45;

    result.push({
      ...props.packages[i],
      _origIndex: i,
      _isCenter: isCenter,
      _style: {
        transform: `translate3d(calc(-50% + ${tx}px), -50%, 0px)`,
        opacity: opacity,
        zIndex: zIndex,
        pointerEvents: absDist < 2.2 ? 'auto' : 'none'
      }
    });
  }

  return result;
});

function triggerTick() {
  isTicking.value = true;
  window.setTimeout(() => {
    isTicking.value = false;
  }, 80);
}

function smoothAnimateToIndex(targetIdx, duration = 380, easing = (t) => 1 - Math.pow(1 - t, 3)) {
  if (animFrameId) cancelAnimationFrame(animFrameId);

  const startVal = animatedIndex.value;
  const total = totalItems.value;

  // Shortest angular path
  let diff = (targetIdx - startVal) % total;
  if (diff > total / 2) diff -= total;
  if (diff < -total / 2) diff += total;

  const targetVal = startVal + diff;
  const startTime = performance.now();
  let lastRounded = Math.round(startVal);

  function loop(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    const eased = easing(progress);

    animatedIndex.value = startVal + diff * eased;

    const currentRounded = Math.round(animatedIndex.value);
    if (currentRounded !== lastRounded) {
      lastRounded = currentRounded;
      triggerTick();
    }

    if (progress < 1) {
      animFrameId = requestAnimationFrame(loop);
    } else {
      animatedIndex.value = ((targetVal % total) + total) % total;
      currentIndex.value = Math.round(animatedIndex.value);
      isSpinning.value = false;
    }
  }

  animFrameId = requestAnimationFrame(loop);
}

function selectCard(idx) {
  if (isSpinning.value) return;
  smoothAnimateToIndex(idx, 340);
}

function stepCard(dir) {
  if (isSpinning.value) return;
  const target = (currentIndex.value + dir + totalItems.value) % totalItems.value;
  smoothAnimateToIndex(target, 320);
}

function spinWheelRandom() {
  if (isSpinning.value || totalItems.value <= 1) return;
  isSpinning.value = true;

  const turns = 4 + Math.floor(Math.random() * 4);
  const randomTarget = Math.floor(Math.random() * totalItems.value);
  const totalSteps = (turns * totalItems.value) + randomTarget;

  smoothAnimateToIndex(
    animatedIndex.value + totalSteps,
    3100,
    (t) => 1 - Math.pow(1 - t, 4) // Casino deceleration curve
  );
}

// Drag & Touch Handling
function startDrag(e) {
  if (isSpinning.value) return;
  if (animFrameId) cancelAnimationFrame(animFrameId);
  isDragging.value = true;
  startX = e.clientX;
  dragStartIndex = animatedIndex.value;

  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', endDrag);
}

function onDragMove(e) {
  if (!isDragging.value) return;
  const dx = e.clientX - startX;
  const sensitivity = window.innerWidth < 640 ? 0.0085 : 0.0065;
  animatedIndex.value = dragStartIndex - dx * sensitivity;
}

function endDrag() {
  if (!isDragging.value) return;
  isDragging.value = false;
  window.removeEventListener('mousemove', onDragMove);
  window.removeEventListener('mouseup', endDrag);

  const snapped = Math.round(animatedIndex.value);
  smoothAnimateToIndex(snapped, 260);
}

function startTouch(e) {
  if (isSpinning.value || !e.touches[0]) return;
  if (animFrameId) cancelAnimationFrame(animFrameId);
  isDragging.value = true;
  startX = e.touches[0].clientX;
  dragStartIndex = animatedIndex.value;

  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('touchend', endTouch);
}

function onTouchMove(e) {
  if (!isDragging.value || !e.touches[0]) return;
  const dx = e.touches[0].clientX - startX;
  animatedIndex.value = dragStartIndex - dx * 0.009;
}

function endTouch() {
  if (!isDragging.value) return;
  isDragging.value = false;
  window.removeEventListener('touchmove', onTouchMove);
  window.removeEventListener('touchend', endTouch);

  const snapped = Math.round(animatedIndex.value);
  smoothAnimateToIndex(snapped, 260);
}

function handleWheelScroll(e) {
  if (isSpinning.value) return;
  const delta = Math.sign(e.deltaY || e.deltaX);
  stepCard(delta);
}

function handleKeydown(e) {
  if (e.key === 'ArrowLeft') {
    stepCard(-1);
  } else if (e.key === 'ArrowRight') {
    stepCard(1);
  } else if (e.key === 'Enter') {
    if (activePackage.value && !activePackage.value.is_parent) {
      emit('select-package', activePackage.value);
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  if (props.packages.length > 0) {
    currentIndex.value = 0;
    animatedIndex.value = 0;
  }
});

onBeforeUnmount(() => {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('mousemove', onDragMove);
  window.removeEventListener('mouseup', endDrag);
  window.removeEventListener('touchmove', onTouchMove);
  window.removeEventListener('touchend', endTouch);
});

watch(() => props.packages, (pkgs) => {
  if (pkgs && pkgs.length > 0) {
    currentIndex.value = 0;
    animatedIndex.value = 0;
  }
});
</script>

<style scoped>
.vel-casino-wheel-wrapper {
  perspective: 1200px;
}

/* 1. Header */
.vel-casino-header {
  background: linear-gradient(135deg, rgba(35, 18, 68, 0.95), rgba(14, 10, 28, 0.98));
  border: 1px solid rgba(168, 85, 247, 0.35);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.vel-casino-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.3rem 0.8rem;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(236, 72, 153, 0.25), rgba(168, 85, 247, 0.3));
  border: 1px solid rgba(236, 72, 153, 0.6);
  color: #fff;
  font-size: 0.74rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.vel-casino-led {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f43f5e;
  box-shadow: 0 0 8px #f43f5e;
}

.vel-casino-spin-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 1.15rem;
  border-radius: 999px;
  background: linear-gradient(135deg, #f59e0b 0%, #ec4899 50%, #8b5cf6 100%);
  border: 1px solid rgba(255, 255, 255, 0.7);
  color: #ffffff;
  font-size: 0.82rem;
  font-weight: 950;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  box-shadow: 0 4px 18px rgba(236, 72, 153, 0.45);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.vel-casino-spin-btn:hover {
  transform: translateY(-2px) scale(1.04);
  box-shadow: 0 8px 24px rgba(236, 72, 153, 0.7);
}

/* 2. Coverflow Arena */
.vel-wheel-arena {
  height: 250px;
  background: radial-gradient(circle at 50% 40%, rgba(55, 25, 95, 0.55) 0%, rgba(10, 8, 22, 0.98) 75%);
  border: 1.5px solid rgba(168, 85, 247, 0.3);
  box-shadow: inset 0 0 50px rgba(138, 43, 226, 0.18), 0 16px 45px rgba(0, 0, 0, 0.7);
}

.vel-casino-ambient-glow {
  position: absolute;
  top: 10%;
  left: 50%;
  transform: translateX(-50%);
  width: 320px;
  height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(168, 85, 247, 0.3) 0%, rgba(236, 72, 153, 0.1) 50%, transparent 75%);
  filter: blur(35px);
  pointer-events: none;
}

/* Ticker Pointer */
.vel-wheel-pointer {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  filter: drop-shadow(0 2px 8px rgba(245, 158, 11, 0.95));
  transition: transform 0.08s cubic-bezier(0.18, 0.89, 0.32, 1.28);
}

.vel-wheel-pointer.is-ticking {
  transform: translateX(-50%) translateY(-3px) scale(1.15);
}

.vel-wheel-pointer__triangle {
  width: 0;
  height: 0;
  border-left: 11px solid transparent;
  border-right: 11px solid transparent;
  border-top: 16px solid #f59e0b;
}

/* 3D Coverflow Stage */
.vel-coverflow-stage {
  position: relative;
  width: 100%;
  height: 210px;
  perspective: 1000px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  touch-action: pan-y;
}

.vel-coverflow-stage:active {
  cursor: grabbing;
}

/* Coverflow Card */
.vel-coverflow-card {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 125px;
  height: 175px;
  border-radius: 18px;
  cursor: pointer;
  will-change: transform, opacity;
  transition: box-shadow 0.25s ease;
}

.vel-coverflow-card__inner {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  text-align: center;
  background: linear-gradient(145deg, rgba(32, 18, 60, 0.95), rgba(12, 10, 24, 0.96));
  border: 1.5px solid rgba(168, 85, 247, 0.35);
  border-radius: 18px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.65);
}

.vel-coverflow-card.is-center-card .vel-coverflow-card__inner {
  border-color: #f59e0b;
  background: linear-gradient(145deg, rgba(65, 25, 100, 0.98), rgba(20, 10, 40, 0.98));
  box-shadow: 0 0 30px rgba(245, 158, 11, 0.55), 0 0 15px rgba(168, 85, 247, 0.45);
}

.vel-coverflow-card.is-parent-card .vel-coverflow-card__inner {
  border-color: rgba(251, 191, 36, 0.6);
}

.vel-coverflow-card__parent-badge {
  position: absolute;
  top: 5px;
  right: 5px;
  padding: 1.5px 5px;
  border-radius: 5px;
  background: rgba(245, 158, 11, 0.92);
  color: #000;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.vel-coverflow-card__logo-wrap {
  width: 60px;
  height: 60px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  margin-top: 4px;
}

.vel-coverflow-card__logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 4px;
}

.vel-coverflow-card__title {
  color: #fff;
  font-size: 0.76rem;
  font-weight: 850;
  line-height: 1.15;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
}

.vel-coverflow-card__footer {
  width: 100%;
  padding-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

/* Nav Arrows (Rock Solid Fixed Positioning & Styling) */
.vel-wheel-nav-arrow {
  position: absolute !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  z-index: 70 !important;
  width: 40px !important;
  height: 40px !important;
  border-radius: 50% !important;
  background: rgba(20, 14, 38, 0.94) !important;
  border: 1.5px solid rgba(168, 85, 247, 0.5) !important;
  color: #ffffff !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer !important;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.75) !important;
  backdrop-filter: blur(10px) !important;
  -webkit-backdrop-filter: blur(10px) !important;
  transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease !important;
  user-select: none !important;
  -webkit-tap-highlight-color: transparent !important;
}

.vel-wheel-nav-arrow--prev {
  left: 10px !important;
  right: auto !important;
}

.vel-wheel-nav-arrow--next {
  right: 10px !important;
  left: auto !important;
}

@media (hover: hover) {
  .vel-wheel-nav-arrow:hover {
    background: linear-gradient(135deg, #9333ea, #c026d3) !important;
    border-color: #ffffff !important;
    transform: translateY(-50%) scale(1.08) !important;
    box-shadow: 0 8px 24px rgba(192, 38, 211, 0.6) !important;
  }
}

.vel-wheel-nav-arrow:active {
  transform: translateY(-50%) scale(0.92) !important;
  background: linear-gradient(135deg, #9333ea, #c026d3) !important;
}

/* 3. Action Deck */
.vel-sub-tray, .vel-single-tray {
  background: linear-gradient(145deg, rgba(28, 16, 52, 0.95), rgba(12, 9, 24, 0.98));
  border: 1.5px solid rgba(168, 85, 247, 0.35);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
}

.vel-sub-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.95rem;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(40, 22, 70, 0.9), rgba(18, 12, 34, 0.95));
  border: 1.2px solid rgba(245, 158, 11, 0.35);
  color: #fff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  animation: vel-chip-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.vel-sub-card:hover {
  transform: translateY(-2px) scale(1.02);
  border-color: #fbbf24;
  background: linear-gradient(135deg, rgba(75, 32, 115, 0.95), rgba(28, 16, 50, 0.98));
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.35);
}

.vel-sub-card__thumb {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.vel-sub-card__name {
  flex: 1;
  text-align: left;
  font-size: 0.82rem;
  font-weight: 850;
  line-height: 1.2;
}

.vel-sub-card__arrow {
  font-size: 10px;
  color: #f59e0b;
}

.vel-btn-open-package {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 1.6rem;
  border-radius: 16px;
  background: linear-gradient(135deg, #9333ea 0%, #c026d3 100%);
  border: 1px solid rgba(255, 255, 255, 0.35);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  box-shadow: 0 8px 24px rgba(192, 38, 211, 0.45);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.vel-btn-open-package:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 12px 32px rgba(192, 38, 211, 0.65);
}

@keyframes vel-chip-in {
  from { opacity: 0; transform: translateY(8px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.vel-sub-pop-enter-active,
.vel-sub-pop-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.vel-sub-pop-enter-from,
.vel-sub-pop-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 640px) {
  .vel-coverflow-card {
    width: 110px;
    height: 160px;
  }
  .vel-coverflow-card__logo-wrap {
    width: 52px;
    height: 52px;
  }
}
</style>

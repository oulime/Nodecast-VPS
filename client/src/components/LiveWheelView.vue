<template>
  <div
    class="vel-casino-wheel-wrapper w-full max-w-4xl mx-auto select-none"
    ref="wheelWrapperRef"
    :style="themeStyle"
  >
    <!-- Single Wheel Arena: Snug, Compact, Zero Wasted Space -->
    <div class="vel-wheel-arena relative overflow-hidden rounded-2xl">
      <!-- Dynamic Brand Ambient Lighting -->
      <div class="vel-wheel-ambient-glow" aria-hidden="true"></div>

      <!-- Center Ticker Pointer Indicator -->
      <div class="vel-wheel-pointer" :class="{ 'is-ticking': isTicking }" aria-hidden="true">
        <div class="vel-wheel-pointer__triangle"></div>
      </div>

      <!-- 1. Main 3D Circular Arc Track -->
      <div
        class="vel-coverflow-stage"
        @mousedown="startDrag"
        @touchstart.passive="startTouch"
        @wheel.prevent="handleWheelScroll"
      >
        <div
          v-for="pkg in visibleCards"
          :key="pkg.id"
          @click="selectCard(pkg._origIndex)"
          :class="[
            'vel-coverflow-card',
            pkg._isCenter ? 'is-center-card' : ''
          ]"
          :style="pkg._style"
          :data-package-id="pkg.id"
        >
          <div class="vel-coverflow-card__inner">
            <!-- Cover Logo Box -->
            <div class="vel-coverflow-card__logo-wrap">
              <img
                v-if="pkg.cover_url"
                :src="resolveImageUrl(pkg.cover_url)"
                alt=""
                loading="lazy"
                class="vel-coverflow-card__logo"
                @error="pkg._imgError = true"
              />
              <span v-else class="text-xl">📺</span>
            </div>

            <!-- Title -->
            <span class="vel-coverflow-card__title">
              {{ pkg.display_name || pkg.name }}
            </span>
          </div>
        </div>
      </div>

      <!-- 2. Intersecting Sub-Wheel: Snug along the bottom arc with zero empty floor space -->
      <Transition name="vel-sub-intersect" mode="out-in">
        <div
          v-if="activePackage && activePackage.is_parent && childPackages.length > 0"
          :key="'sub-intersect-' + activePackage.id"
          class="vel-sub-intersect-tier absolute bottom-0 left-0 right-0 z-30 flex items-center justify-center pointer-events-none"
        >
          <div
            class="vel-sub-stage-intersect pointer-events-auto"
            @mousedown="startSubDrag"
            @touchstart.passive="startSubTouch"
            @wheel.prevent="handleSubWheelScroll"
          >
            <div
              v-for="child in visibleSubCards"
              :key="child.id"
              @click="selectSubCard(child._origIndex)"
              :class="[
                'vel-sub-card-3d',
                child._isCenter ? 'is-sub-center' : ''
              ]"
              :style="child._style"
            >
              <div class="vel-sub-card-3d__inner">
                <div class="vel-sub-card-3d__logo-wrap">
                  <img
                    v-if="child.cover_url"
                    :src="resolveImageUrl(child.cover_url)"
                    alt=""
                    loading="lazy"
                    class="vel-sub-card-3d__logo"
                  />
                  <span v-else class="text-xs">📺</span>
                </div>
                <span class="vel-sub-card-3d__title">
                  {{ child.display_name || child.name }}
                </span>
              </div>
            </div>
          </div>
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

const emit = defineEmits(['select-package', 'theme-change']);
const catalog = useCatalogStore();

// Main Wheel State
const currentIndex = ref(0);
const animatedIndex = ref(0);
const isDragging = ref(false);
const isSpinning = ref(false);
const isTicking = ref(false);
const wheelWrapperRef = ref(null);

let startX = 0;
let dragStartIndex = 0;
let animFrameId = null;

// Sub-Wheel State
const subCurrentIndex = ref(0);
const subAnimatedIndex = ref(0);
const isSubDragging = ref(false);
let subStartX = 0;
let subDragStartIndex = 0;
let subAnimFrameId = null;

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

const totalSubItems = computed(() => Math.max(1, childPackages.value.length));

const activeSubPackage = computed(() => {
  if (!activePackage.value || !activePackage.value.is_parent || childPackages.value.length === 0) return null;
  const subIdx = ((Math.round(subAnimatedIndex.value) % totalSubItems.value) + totalSubItems.value) % totalSubItems.value;
  return childPackages.value[subIdx] || childPackages.value[0];
});

const currentSelectedPackage = computed(() => {
  if (!activePackage.value) return null;
  if (activePackage.value.is_parent) {
    return activeSubPackage.value;
  }
  return activePackage.value;
});

// Dynamic Brand Adaptive Theming
const extractedColor = ref(null);
const colorCache = new Map();

function getBrandThemeByName(name = '') {
  const n = name.toLowerCase();
  if (n.includes('netflix')) {
    return {
      primary: '#E50914',
      glow: 'rgba(229, 9, 20, 0.55)',
      subtle: 'rgba(229, 9, 20, 0.16)',
      border: 'rgba(229, 9, 20, 0.45)',
      arenaBg: 'radial-gradient(circle at 50% 35%, rgba(160, 10, 20, 0.48) 0%, rgba(14, 5, 8, 0.98) 75%)'
    };
  }
  if (n.includes('prime') || n.includes('amazon')) {
    return {
      primary: '#00A8E1',
      glow: 'rgba(0, 168, 225, 0.55)',
      subtle: 'rgba(0, 168, 225, 0.16)',
      border: 'rgba(0, 168, 225, 0.45)',
      arenaBg: 'radial-gradient(circle at 50% 35%, rgba(0, 110, 180, 0.45) 0%, rgba(4, 10, 22, 0.98) 75%)'
    };
  }
  if (n.includes('disney') || n.includes('marvel') || n.includes('star wars')) {
    return {
      primary: '#00D6FE',
      glow: 'rgba(0, 214, 254, 0.55)',
      subtle: 'rgba(0, 214, 254, 0.16)',
      border: 'rgba(0, 214, 254, 0.45)',
      arenaBg: 'radial-gradient(circle at 50% 35%, rgba(10, 60, 180, 0.45) 0%, rgba(4, 8, 24, 0.98) 75%)'
    };
  }
  if (n.includes('max') || n.includes('hbo') || n.includes('warner')) {
    return {
      primary: '#9d4edd',
      glow: 'rgba(157, 78, 221, 0.55)',
      subtle: 'rgba(157, 78, 221, 0.16)',
      border: 'rgba(157, 78, 221, 0.45)',
      arenaBg: 'radial-gradient(circle at 50% 35%, rgba(90, 25, 140, 0.48) 0%, rgba(14, 6, 26, 0.98) 75%)'
    };
  }
  if (n.includes('canal') || n.includes('c+')) {
    return {
      primary: '#FFE600',
      glow: 'rgba(255, 230, 0, 0.45)',
      subtle: 'rgba(255, 230, 0, 0.14)',
      border: 'rgba(255, 230, 0, 0.35)',
      arenaBg: 'radial-gradient(circle at 50% 35%, rgba(120, 100, 10, 0.42) 0%, rgba(12, 10, 6, 0.98) 75%)'
    };
  }
  if (n.includes('apple') || n.includes('apple tv')) {
    return {
      primary: '#38bdf8',
      glow: 'rgba(56, 189, 248, 0.5)',
      subtle: 'rgba(56, 189, 248, 0.15)',
      border: 'rgba(56, 189, 248, 0.4)',
      arenaBg: 'radial-gradient(circle at 50% 35%, rgba(30, 70, 100, 0.45) 0%, rgba(8, 12, 18, 0.98) 75%)'
    };
  }
  if (n.includes('paramount')) {
    return {
      primary: '#0064FF',
      glow: 'rgba(0, 100, 255, 0.55)',
      subtle: 'rgba(0, 100, 255, 0.16)',
      border: 'rgba(0, 100, 255, 0.45)',
      arenaBg: 'radial-gradient(circle at 50% 35%, rgba(0, 60, 160, 0.45) 0%, rgba(4, 8, 22, 0.98) 75%)'
    };
  }
  if (n.includes('bein')) {
    return {
      primary: '#c026d3',
      glow: 'rgba(192, 38, 211, 0.55)',
      subtle: 'rgba(192, 38, 211, 0.16)',
      border: 'rgba(192, 38, 211, 0.45)',
      arenaBg: 'radial-gradient(circle at 50% 35%, rgba(100, 15, 120, 0.48) 0%, rgba(18, 6, 22, 0.98) 75%)'
    };
  }
  if (n.includes('dazn')) {
    return {
      primary: '#E2FF00',
      glow: 'rgba(226, 255, 0, 0.5)',
      subtle: 'rgba(226, 255, 0, 0.14)',
      border: 'rgba(226, 255, 0, 0.35)',
      arenaBg: 'radial-gradient(circle at 50% 35%, rgba(90, 100, 10, 0.4) 0%, rgba(10, 12, 6, 0.98) 75%)'
    };
  }
  if (n.includes('eurosport') || n.includes('rmc') || n.includes('tf1')) {
    return {
      primary: '#0284c7',
      glow: 'rgba(2, 132, 199, 0.55)',
      subtle: 'rgba(2, 132, 199, 0.15)',
      border: 'rgba(2, 132, 199, 0.45)',
      arenaBg: 'radial-gradient(circle at 50% 35%, rgba(10, 60, 120, 0.45) 0%, rgba(6, 10, 20, 0.98) 75%)'
    };
  }
  return null;
}

function extractColorFromImage(imageUrl) {
  if (!imageUrl) return;
  if (colorCache.has(imageUrl)) {
    extractedColor.value = colorCache.get(imageUrl);
    return;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = resolveImageUrl(imageUrl);

  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      canvas.width = 30;
      canvas.height = 30;
      ctx.drawImage(img, 0, 0, 30, 30);
      const data = ctx.getImageData(0, 0, 30, 30).data;

      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 120) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max - min > 24 && max > 45 && max < 240) {
          rSum += r;
          gSum += g;
          bSum += b;
          count++;
        }
      }

      if (count > 0) {
        const r = Math.round(rSum / count);
        const g = Math.round(gSum / count);
        const b = Math.round(bSum / count);
        const hex = `rgb(${r}, ${g}, ${b})`;
        const theme = {
          primary: hex,
          glow: `rgba(${r}, ${g}, ${b}, 0.55)`,
          subtle: `rgba(${r}, ${g}, ${b}, 0.15)`,
          border: `rgba(${r}, ${g}, ${b}, 0.45)`,
          arenaBg: `radial-gradient(circle at 50% 35%, rgba(${Math.round(r * 0.5)}, ${Math.round(g * 0.5)}, ${Math.round(b * 0.5)}, 0.45) 0%, rgba(10, 8, 22, 0.98) 75%)`
        };
        colorCache.set(imageUrl, theme);
        extractedColor.value = theme;
      }
    } catch {}
  };
}

const rawTheme = computed(() => {
  const pkg = activePackage.value;
  const name = pkg ? (pkg.display_name || pkg.name || '') : '';
  const brand = getBrandThemeByName(name);

  return brand || extractedColor.value || {
    primary: '#c084fc',
    glow: 'rgba(168, 85, 247, 0.55)',
    subtle: 'rgba(168, 85, 247, 0.15)',
    border: 'rgba(168, 85, 247, 0.35)',
    arenaBg: 'radial-gradient(circle at 50% 35%, rgba(55, 25, 95, 0.55) 0%, rgba(10, 8, 22, 0.98) 75%)'
  };
});

const themeStyle = computed(() => {
  const theme = rawTheme.value;
  return {
    '--theme-primary': theme.primary,
    '--theme-glow': theme.glow,
    '--theme-border': theme.border,
    '--theme-arena-bg': theme.arenaBg
  };
});

watch(rawTheme, (t) => {
  emit('theme-change', t);
}, { immediate: true });

let notifyTimer = null;
watch(currentSelectedPackage, (pkg) => {
  if (!pkg) return;
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    emit('select-package', pkg);
  }, 120);
}, { immediate: true });

watch(activePackage, (pkg) => {
  extractedColor.value = null;
  if (pkg && pkg.cover_url) {
    extractColorFromImage(pkg.cover_url);
  }
}, { immediate: true });

// Main Wheel 3D Arc
const visibleCards = computed(() => {
  const total = totalItems.value;
  if (total === 0) return [];

  const current = animatedIndex.value;
  const result = [];
  const radius = window.innerWidth < 640 ? 230 : 280;
  const angleStep = window.innerWidth < 640 ? 20 : 17.5;

  for (let i = 0; i < total; i++) {
    let diff = (i - current) % total;
    if (diff > total / 2) diff -= total;
    if (diff < -total / 2) diff += total;

    const absDist = Math.abs(diff);
    if (absDist > 3.6) continue;

    const angleDeg = diff * angleStep;
    const angleRad = (angleDeg * Math.PI) / 180;

    const tx = Math.sin(angleRad) * radius;
    const tz = -(1 - Math.cos(angleRad)) * radius;
    const rotY = -angleDeg;

    const opacity = Math.max(0, 1 - absDist * 0.28);
    const zIndex = Math.round(100 - absDist * 10);
    const isCenter = absDist < 0.45;

    result.push({
      ...props.packages[i],
      _origIndex: i,
      _isCenter: isCenter,
      _style: {
        transform: `translate3d(calc(-50% + ${tx}px), -50%, ${tz}px) rotateY(${rotY}deg)`,
        opacity: opacity,
        zIndex: zIndex,
        pointerEvents: absDist < 2.5 ? 'auto' : 'none'
      }
    });
  }

  return result;
});

// Intersecting Sub-Wheel 3D Arc
const visibleSubCards = computed(() => {
  const list = childPackages.value;
  const total = list.length;
  if (total === 0) return [];

  const current = subAnimatedIndex.value;
  const result = [];
  const radius = window.innerWidth < 640 ? 170 : 210;
  const angleStep = window.innerWidth < 640 ? 22 : 18.5;

  for (let i = 0; i < total; i++) {
    let diff = (i - current) % total;
    if (diff > total / 2) diff -= total;
    if (diff < -total / 2) diff += total;

    const absDist = Math.abs(diff);
    if (absDist > 3.2) continue;

    const angleDeg = diff * angleStep;
    const angleRad = (angleDeg * Math.PI) / 180;

    const tx = Math.sin(angleRad) * radius;
    const tz = -(1 - Math.cos(angleRad)) * radius;
    const rotY = -angleDeg;

    const opacity = Math.max(0, 1 - absDist * 0.3);
    const zIndex = Math.round(150 - absDist * 10);
    const isCenter = absDist < 0.45;

    result.push({
      ...list[i],
      _origIndex: i,
      _isCenter: isCenter,
      _style: {
        transform: `translate3d(calc(-50% + ${tx}px), -50%, ${tz}px) rotateY(${rotY}deg)`,
        opacity: opacity,
        zIndex: zIndex,
        pointerEvents: 'auto'
      }
    });
  }

  return result;
});

function triggerTick() {
  isTicking.value = true;
  window.setTimeout(() => {
    isTicking.value = false;
  }, 75);
}

function smoothAnimateToIndex(targetIdx, duration = 340, easing = (t) => 1 - Math.pow(1 - t, 3)) {
  if (animFrameId) cancelAnimationFrame(animFrameId);

  const startVal = animatedIndex.value;
  const total = totalItems.value;

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
  smoothAnimateToIndex(idx, 300);
}

// Sub-Wheel Animation & Drag Handlers
function smoothAnimateSubToIndex(targetIdx, duration = 300) {
  if (subAnimFrameId) cancelAnimationFrame(subAnimFrameId);

  const startVal = subAnimatedIndex.value;
  const total = totalSubItems.value;
  if (total <= 1) {
    subAnimatedIndex.value = 0;
    subCurrentIndex.value = 0;
    return;
  }

  let diff = (targetIdx - startVal) % total;
  if (diff > total / 2) diff -= total;
  if (diff < -total / 2) diff += total;

  const targetVal = startVal + diff;
  const startTime = performance.now();
  let lastRounded = Math.round(startVal);

  function loop(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    const eased = 1 - Math.pow(1 - progress, 3);

    subAnimatedIndex.value = startVal + diff * eased;

    const currentRounded = Math.round(subAnimatedIndex.value);
    if (currentRounded !== lastRounded) {
      lastRounded = currentRounded;
      triggerTick();
    }

    if (progress < 1) {
      subAnimFrameId = requestAnimationFrame(loop);
    } else {
      subAnimatedIndex.value = ((targetVal % total) + total) % total;
      subCurrentIndex.value = Math.round(subAnimatedIndex.value);
    }
  }

  subAnimFrameId = requestAnimationFrame(loop);
}

function selectSubCard(idx) {
  smoothAnimateSubToIndex(idx, 300);
}

function startSubDrag(e) {
  if (subAnimFrameId) cancelAnimationFrame(subAnimFrameId);
  isSubDragging.value = true;
  subStartX = e.clientX;
  subDragStartIndex = subAnimatedIndex.value;

  window.addEventListener('mousemove', onSubDragMove);
  window.addEventListener('mouseup', endSubDrag);
}

function onSubDragMove(e) {
  if (!isSubDragging.value) return;
  const dx = e.clientX - subStartX;
  const sensitivity = window.innerWidth < 640 ? 0.01 : 0.008;
  subAnimatedIndex.value = subDragStartIndex - dx * sensitivity;
}

function endSubDrag() {
  if (!isSubDragging.value) return;
  isSubDragging.value = false;
  window.removeEventListener('mousemove', onSubDragMove);
  window.removeEventListener('mouseup', endSubDrag);

  const snapped = Math.round(subAnimatedIndex.value);
  smoothAnimateSubToIndex(snapped, 220);
}

function startSubTouch(e) {
  if (!e.touches[0]) return;
  if (subAnimFrameId) cancelAnimationFrame(subAnimFrameId);
  isSubDragging.value = true;
  subStartX = e.touches[0].clientX;
  subDragStartIndex = subAnimatedIndex.value;

  window.addEventListener('touchmove', onSubTouchMove, { passive: true });
  window.addEventListener('touchend', endSubTouch);
}

function onSubTouchMove(e) {
  if (!isSubDragging.value || !e.touches[0]) return;
  const dx = e.touches[0].clientX - subStartX;
  subAnimatedIndex.value = subDragStartIndex - dx * 0.01;
}

function endSubTouch() {
  if (!isSubDragging.value) return;
  isSubDragging.value = false;
  window.removeEventListener('touchmove', onSubTouchMove);
  window.removeEventListener('touchend', endSubTouch);

  const snapped = Math.round(subAnimatedIndex.value);
  smoothAnimateSubToIndex(snapped, 220);
}

function handleSubWheelScroll(e) {
  const delta = Math.sign(e.deltaY || e.deltaX);
  const target = (subCurrentIndex.value + delta + totalSubItems.value) % totalSubItems.value;
  smoothAnimateSubToIndex(target, 240);
}

// Main Wheel Drag
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
  const sensitivity = window.innerWidth < 640 ? 0.009 : 0.007;
  animatedIndex.value = dragStartIndex - dx * sensitivity;
}

function endDrag() {
  if (!isDragging.value) return;
  isDragging.value = false;
  window.removeEventListener('mousemove', onDragMove);
  window.removeEventListener('mouseup', endDrag);

  const snapped = Math.round(animatedIndex.value);
  smoothAnimateToIndex(snapped, 250);
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
  animatedIndex.value = dragStartIndex - dx * 0.0095;
}

function endTouch() {
  if (!isDragging.value) return;
  isDragging.value = false;
  window.removeEventListener('touchmove', onTouchMove);
  window.removeEventListener('touchend', endTouch);

  const snapped = Math.round(animatedIndex.value);
  smoothAnimateToIndex(snapped, 250);
}

function handleWheelScroll(e) {
  if (isSpinning.value) return;
  const delta = Math.sign(e.deltaY || e.deltaX);
  const target = (currentIndex.value + delta + totalItems.value) % totalItems.value;
  smoothAnimateToIndex(target, 280);
}

function handleKeydown(e) {
  if (e.key === 'ArrowLeft') {
    const target = (currentIndex.value - 1 + totalItems.value) % totalItems.value;
    smoothAnimateToIndex(target, 280);
  } else if (e.key === 'ArrowRight') {
    const target = (currentIndex.value + 1 + totalItems.value) % totalItems.value;
    smoothAnimateToIndex(target, 280);
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
  if (subAnimFrameId) cancelAnimationFrame(subAnimFrameId);
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('mousemove', onDragMove);
  window.removeEventListener('mouseup', endDrag);
  window.removeEventListener('touchmove', onTouchMove);
  window.removeEventListener('touchend', endTouch);
  window.removeEventListener('mousemove', onSubDragMove);
  window.removeEventListener('mouseup', endSubDrag);
  window.removeEventListener('touchmove', onSubTouchMove);
  window.removeEventListener('touchend', endSubTouch);
});

watch(() => props.packages, (pkgs) => {
  if (pkgs && pkgs.length > 0) {
    currentIndex.value = 0;
    animatedIndex.value = 0;
  }
});

watch(activePackage, () => {
  subCurrentIndex.value = 0;
  subAnimatedIndex.value = 0;
});
</script>

<style scoped>
.vel-casino-wheel-wrapper {
  perspective: 1200px;
}

/* Compact Snug Arena: Zero wasted vertical or bottom space */
.vel-wheel-arena {
  position: relative;
  width: 100%;
  height: 128px;
  background: var(--theme-arena-bg, radial-gradient(circle at 50% 35%, rgba(55, 25, 95, 0.55) 0%, rgba(10, 8, 22, 0.98) 75%));
  border: 1.5px solid var(--theme-border, rgba(168, 85, 247, 0.35));
  box-shadow: inset 0 0 35px var(--theme-glow, rgba(138, 43, 226, 0.16)), 0 10px 30px rgba(0, 0, 0, 0.65);
  transition: background 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease;
  overflow: hidden;
}

.vel-wheel-ambient-glow {
  position: absolute;
  top: 10%;
  left: 50%;
  transform: translateX(-50%);
  width: 280px;
  height: 90px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--theme-glow, rgba(168, 85, 247, 0.28)) 0%, transparent 70%);
  filter: blur(22px);
  pointer-events: none;
  transition: background 0.4s ease;
}

/* Center Pointer Ticker */
.vel-wheel-pointer {
  position: absolute;
  top: 2px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  filter: drop-shadow(0 2px 6px var(--theme-glow, rgba(192, 132, 252, 0.9)));
  transition: transform 0.08s cubic-bezier(0.18, 0.89, 0.32, 1.28), filter 0.4s ease;
}

.vel-wheel-pointer.is-ticking {
  transform: translateX(-50%) translateY(-2px) scale(1.12);
}

.vel-wheel-pointer__triangle {
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-top: 10px solid var(--theme-primary, #c084fc);
  transition: border-top-color 0.4s ease;
}

/* Main 3D Arc Stage: Pinned absolutely with zero layout impact */
.vel-coverflow-stage {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  perspective: 1000px;
  cursor: grab;
  touch-action: pan-y;
}

.vel-coverflow-stage:active {
  cursor: grabbing;
}

/* Main Cards: Centered cleanly inside 128px arena with zero bottom gap */
.vel-coverflow-card {
  position: absolute;
  left: 50%;
  top: 48%;
  width: 86px;
  height: 98px;
  border-radius: 14px;
  cursor: pointer;
  will-change: transform, opacity;
  transition: box-shadow 0.22s ease, border-color 0.22s ease;
}

.vel-coverflow-card__inner {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 4px 3px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  text-align: center;
  background: linear-gradient(145deg, rgba(30, 18, 56, 0.94), rgba(12, 10, 24, 0.96));
  border: 1.5px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(8px);
  transition: border-color 0.35s ease, box-shadow 0.35s ease;
}

.vel-coverflow-card.is-center-card .vel-coverflow-card__inner {
  border-color: var(--theme-primary, #c084fc);
  background: linear-gradient(145deg, rgba(45, 20, 80, 0.98), rgba(14, 10, 28, 0.98));
  box-shadow: 0 0 22px var(--theme-glow, rgba(168, 85, 247, 0.6)), 0 6px 18px rgba(0, 0, 0, 0.7);
}

.vel-coverflow-card__logo-wrap {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.vel-coverflow-card__logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 2.5px;
}

.vel-coverflow-card__title {
  color: #ffffff;
  font-size: 0.67rem;
  font-weight: 850;
  line-height: 1.1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  padding: 0 1px;
}

/* 2. Intersecting Sub-Wheel Tier: Sitting snugly at the bottom */
.vel-sub-intersect-tier {
  width: 100%;
  height: 40px;
}

.vel-sub-stage-intersect {
  position: relative;
  width: 100%;
  height: 40px;
  perspective: 750px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  touch-action: pan-y;
}

.vel-sub-stage-intersect:active {
  cursor: grabbing;
}

/* Intersecting Sub-Cards: Compact horizontal badges */
.vel-sub-card-3d {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 72px;
  height: 34px;
  border-radius: 10px;
  cursor: pointer;
  will-change: transform, opacity;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.vel-sub-card-3d__inner {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 2px 4px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
  text-align: left;
  background: linear-gradient(135deg, rgba(22, 12, 38, 0.94), rgba(10, 8, 20, 0.96));
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
  transition: border-color 0.3s ease, box-shadow 0.3s ease, transform 0.2s ease;
}

.vel-sub-card-3d.is-sub-center .vel-sub-card-3d__inner {
  border-color: var(--theme-primary, #c084fc);
  background: linear-gradient(135deg, rgba(46, 18, 76, 0.98), rgba(16, 10, 30, 0.98));
  box-shadow: 0 0 14px var(--theme-glow, rgba(168, 85, 247, 0.65)), 0 3px 10px rgba(0, 0, 0, 0.7);
  transform: scale(1.05);
}

.vel-sub-card-3d__logo-wrap {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.vel-sub-card-3d__logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 1px;
}

.vel-sub-card-3d__title {
  color: #ffffff;
  font-size: 0.54rem;
  font-weight: 800;
  line-height: 1.05;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  min-width: 0;
  flex: 1;
}

/* Intersect Transition */
.vel-sub-intersect-enter-active,
.vel-sub-intersect-leave-active {
  transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.vel-sub-intersect-enter-from,
.vel-sub-intersect-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.95);
}

@media (max-width: 640px) {
  .vel-wheel-arena {
    height: 118px;
  }
  .vel-coverflow-card {
    width: 78px;
    height: 88px;
  }
  .vel-coverflow-card__logo-wrap {
    width: 38px;
    height: 38px;
  }
  .vel-coverflow-card__title {
    font-size: 0.62rem;
  }

  .vel-sub-intersect-tier {
    height: 34px;
  }
  .vel-sub-stage-intersect {
    height: 34px;
  }
  .vel-sub-card-3d {
    width: 64px;
    height: 30px;
  }
  .vel-sub-card-3d__logo-wrap {
    width: 18px;
    height: 18px;
  }
  .vel-sub-card-3d__title {
    font-size: 0.5rem;
  }
}
</style>

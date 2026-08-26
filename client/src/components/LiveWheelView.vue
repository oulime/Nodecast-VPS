<template>
  <div class="vel-casino-wheel-wrapper w-full max-w-4xl mx-auto select-none" ref="wheelWrapperRef">
    <!-- 1. Main Wheel Stage -->
    <div class="vel-wheel-arena relative overflow-hidden rounded-3xl p-3 md:p-5 flex flex-col items-center justify-center">
      <!-- Ambient Radial Lighting -->
      <div class="vel-wheel-ambient-glow" aria-hidden="true"></div>
      <div class="vel-wheel-radial-track" aria-hidden="true"></div>

      <!-- Center Ticker Pointer Indicator -->
      <div class="vel-wheel-pointer" :class="{ 'is-ticking': isTicking }" aria-hidden="true">
        <div class="vel-wheel-pointer__triangle"></div>
      </div>

      <!-- 3D Circular Arc Track -->
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
              <span v-else class="text-3xl">📺</span>
            </div>

            <!-- Title -->
            <span class="vel-coverflow-card__title">
              {{ pkg.display_name || pkg.name }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. Sub-Packages Area: Smaller Round Wheel for Parent Packages OR Play Button for Direct -->
    <div class="vel-action-deck mt-3">
      <Transition name="vel-sub-pop" mode="out-in">
        <!-- SUB-WHEEL FOR PARENT PACKAGES -->
        <div
          v-if="activePackage && activePackage.is_parent && childPackages.length > 0"
          :key="'sub-wheel-' + activePackage.id"
          class="vel-sub-wheel-arena relative overflow-hidden rounded-2xl p-2.5 flex flex-col items-center justify-center"
        >
          <!-- Sub-Wheel Ambient Glow -->
          <div class="vel-sub-ambient-glow" aria-hidden="true"></div>

          <!-- Sub Pointer -->
          <div class="vel-sub-pointer" aria-hidden="true">
            <div class="vel-sub-pointer__needle"></div>
          </div>

          <!-- Sub 3D Arc Track -->
          <div
            class="vel-sub-stage"
            @mousedown="startSubDrag"
            @touchstart.passive="startSubTouch"
            @wheel.prevent="handleSubWheelScroll"
          >
            <div
              v-for="child in visibleSubCards"
              :key="child.id"
              @click="handleSubCardClick(child)"
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
                  <span v-else class="text-xl">📺</span>
                </div>
                <span class="vel-sub-card-3d__title">
                  {{ child.display_name || child.name }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- DIRECT SINGLE PACKAGE: CLEAN PLAY BUTTON -->
        <div
          v-else-if="activePackage"
          :key="'single-' + activePackage.id"
          class="flex justify-center py-1"
        >
          <button
            @click="$emit('select-package', activePackage)"
            type="button"
            class="vel-btn-open-package cursor-pointer active:scale-95"
          >
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span>Regarder {{ activePackage.display_name || activePackage.name }}</span>
          </button>
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

// Main Wheel 3D Arc
const visibleCards = computed(() => {
  const total = totalItems.value;
  if (total === 0) return [];

  const current = animatedIndex.value;
  const result = [];
  const radius = window.innerWidth < 640 ? 300 : 360;
  const angleStep = window.innerWidth < 640 ? 17.5 : 15.5;

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

// Sub-Wheel 3D Arc (Smaller Round Wheel)
const visibleSubCards = computed(() => {
  const list = childPackages.value;
  const total = list.length;
  if (total === 0) return [];

  const current = subAnimatedIndex.value;
  const result = [];
  const radius = window.innerWidth < 640 ? 220 : 260;
  const angleStep = window.innerWidth < 640 ? 21 : 18.5;

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
    const zIndex = Math.round(100 - absDist * 10);
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
function smoothAnimateSubToIndex(targetIdx, duration = 280) {
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

  function loop(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    const eased = 1 - Math.pow(1 - progress, 3);

    subAnimatedIndex.value = startVal + diff * eased;

    if (progress < 1) {
      subAnimFrameId = requestAnimationFrame(loop);
    } else {
      subAnimatedIndex.value = ((targetVal % total) + total) % total;
      subCurrentIndex.value = Math.round(subAnimatedIndex.value);
    }
  }

  subAnimFrameId = requestAnimationFrame(loop);
}

function handleSubCardClick(child) {
  emit('select-package', child);
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

/* 1. Main Wheel Arena */
.vel-wheel-arena {
  height: 200px;
  background: radial-gradient(circle at 50% 35%, rgba(55, 25, 95, 0.5) 0%, rgba(10, 8, 22, 0.98) 75%);
  border: 1.5px solid rgba(168, 85, 247, 0.3);
  box-shadow: inset 0 0 45px rgba(138, 43, 226, 0.16), 0 14px 40px rgba(0, 0, 0, 0.7);
}

.vel-wheel-ambient-glow {
  position: absolute;
  top: 10%;
  left: 50%;
  transform: translateX(-50%);
  width: 320px;
  height: 140px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(168, 85, 247, 0.3) 0%, transparent 70%);
  filter: blur(30px);
  pointer-events: none;
}

.vel-wheel-radial-track {
  position: absolute;
  bottom: -45px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  height: 110px;
  border-radius: 50%;
  border: 2px solid rgba(168, 85, 247, 0.3);
  box-shadow: 0 0 25px rgba(168, 85, 247, 0.2), inset 0 0 25px rgba(168, 85, 247, 0.1);
  pointer-events: none;
}

/* Center Pointer Ticker */
.vel-wheel-pointer {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  filter: drop-shadow(0 2px 8px rgba(192, 132, 252, 0.9));
  transition: transform 0.08s cubic-bezier(0.18, 0.89, 0.32, 1.28);
}

.vel-wheel-pointer.is-ticking {
  transform: translateX(-50%) translateY(-3px) scale(1.15);
}

.vel-wheel-pointer__triangle {
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-top: 15px solid #c084fc;
}

/* 3D Arc Stage */
.vel-coverflow-stage {
  position: relative;
  width: 100%;
  height: 170px;
  perspective: 1100px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  touch-action: pan-y;
}

.vel-coverflow-stage:active {
  cursor: grabbing;
}

/* Main Cards */
.vel-coverflow-card {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 112px;
  height: 142px;
  border-radius: 18px;
  cursor: pointer;
  will-change: transform, opacity;
  transition: box-shadow 0.22s ease, border-color 0.22s ease;
}

.vel-coverflow-card__inner {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
  background: linear-gradient(145deg, rgba(30, 18, 56, 0.94), rgba(12, 10, 24, 0.96));
  border: 1.5px solid rgba(168, 85, 247, 0.3);
  border-radius: 18px;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
}

.vel-coverflow-card.is-center-card .vel-coverflow-card__inner {
  border-color: #c084fc;
  background: linear-gradient(145deg, rgba(60, 22, 105, 0.98), rgba(20, 12, 40, 0.98));
  box-shadow: 0 0 28px rgba(168, 85, 247, 0.55), 0 10px 25px rgba(0, 0, 0, 0.7);
}

.vel-coverflow-card__logo-wrap {
  width: 64px;
  height: 64px;
  border-radius: 14px;
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
  padding: 4px;
}

.vel-coverflow-card__title {
  color: #ffffff;
  font-size: 0.76rem;
  font-weight: 850;
  line-height: 1.15;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  padding: 0 2px;
}

/* 2. Sub-Wheel Arena (Smaller Round 3D Wheel for Parent Packages) */
.vel-sub-wheel-arena {
  height: 155px;
  background: radial-gradient(circle at 50% 35%, rgba(45, 18, 75, 0.4) 0%, rgba(8, 6, 18, 0.95) 80%);
  border: 1px solid rgba(168, 85, 247, 0.25);
  box-shadow: inset 0 0 30px rgba(138, 43, 226, 0.1), 0 8px 24px rgba(0, 0, 0, 0.5);
}

.vel-sub-ambient-glow {
  position: absolute;
  top: 10%;
  left: 50%;
  transform: translateX(-50%);
  width: 240px;
  height: 90px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(168, 85, 247, 0.2) 0%, transparent 70%);
  filter: blur(25px);
  pointer-events: none;
}

.vel-sub-pointer {
  position: absolute;
  top: 5px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  pointer-events: none;
}

.vel-sub-pointer__needle {
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-top: 10px solid #a855f7;
  filter: drop-shadow(0 1px 4px rgba(168, 85, 247, 0.9));
}

.vel-sub-stage {
  position: relative;
  width: 100%;
  height: 130px;
  perspective: 900px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  touch-action: pan-y;
}

.vel-sub-stage:active {
  cursor: grabbing;
}

/* Sub-Cards */
.vel-sub-card-3d {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 92px;
  height: 118px;
  border-radius: 14px;
  cursor: pointer;
  will-change: transform, opacity;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.vel-sub-card-3d__inner {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 6px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  text-align: center;
  background: linear-gradient(145deg, rgba(26, 16, 48, 0.92), rgba(10, 8, 20, 0.95));
  border: 1px solid rgba(168, 85, 247, 0.25);
  border-radius: 14px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
}

.vel-sub-card-3d.is-sub-center .vel-sub-card-3d__inner {
  border-color: #c084fc;
  background: linear-gradient(145deg, rgba(55, 20, 95, 0.96), rgba(18, 10, 36, 0.98));
  box-shadow: 0 0 20px rgba(168, 85, 247, 0.5), 0 8px 18px rgba(0, 0, 0, 0.6);
}

.vel-sub-card-3d__logo-wrap {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
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
  padding: 3px;
}

.vel-sub-card-3d__title {
  color: #ffffff;
  font-size: 0.7rem;
  font-weight: 800;
  line-height: 1.15;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  padding: 0 2px;
}

/* Direct Play Button */
.vel-btn-open-package {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.65rem 1.4rem;
  border-radius: 14px;
  background: linear-gradient(135deg, #9333ea, #a855f7);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  font-size: 0.88rem;
  font-weight: 850;
  box-shadow: 0 6px 20px rgba(147, 51, 234, 0.45);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.vel-btn-open-package:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 10px 25px rgba(147, 51, 234, 0.65);
}

@media (max-width: 640px) {
  .vel-wheel-arena {
    height: 180px;
  }
  .vel-coverflow-stage {
    height: 155px;
  }
  .vel-coverflow-card {
    width: 100px;
    height: 130px;
  }
  .vel-coverflow-card__logo-wrap {
    width: 56px;
    height: 56px;
  }

  .vel-sub-wheel-arena {
    height: 140px;
  }
  .vel-sub-stage {
    height: 118px;
  }
  .vel-sub-card-3d {
    width: 82px;
    height: 105px;
  }
  .vel-sub-card-3d__logo-wrap {
    width: 40px;
    height: 40px;
  }
}
</style>

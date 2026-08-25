<template>
  <Teleport to="body">
    <Transition name="vel-overlay-fade">
      <div
        v-if="show"
        id="catalog-loading-overlay"
        class="catalog-loading-overlay"
        :data-cat-load-accent="accent"
        role="status"
        aria-live="polite"
        :aria-label="status || 'Chargement du catalogue'"
      >
        <div class="catalog-loading-overlay__aurora" aria-hidden="true"></div>
        <div class="catalog-loading-overlay__grid" aria-hidden="true"></div>
        <div class="catalog-loading-overlay__vignette" aria-hidden="true"></div>
        <div class="catalog-loading-overlay__inner">
          <div class="catalog-loading-overlay__spinner" aria-hidden="true">
            <div class="catalog-loading-overlay__spinner-ring"></div>
            <div class="catalog-loading-overlay__play-wrap">
              <span class="catalog-loading-overlay__play">▶</span>
            </div>
          </div>
          <p class="catalog-loading-overlay__brand">
            Velora<span class="vel-brand-vip"
              ><span class="vel-brand-vip__v">V</span><span class="vel-brand-vip__i">I</span
              ><span class="vel-brand-vip__p">P</span></span
            >
          </p>
          <p id="catalog-loading-status" class="catalog-loading-overlay__status">
            {{ status || 'Chargement du catalogue…' }}
          </p>
          <div class="catalog-loading-overlay__eq" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
defineProps({
  show: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    default: 'Chargement du catalogue…'
  },
  accent: {
    type: String,
    default: null
  }
});
</script>

<style scoped>
.catalog-loading-overlay {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  height: 100dvh !important;
  z-index: 2147483647 !important;
  background: #06050a !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  overflow: hidden !important;
  pointer-events: all !important;
}

.vel-overlay-fade-enter-active,
.vel-overlay-fade-leave-active {
  transition: opacity 0.25s ease;
}

.vel-overlay-fade-enter-from,
.vel-overlay-fade-leave-to {
  opacity: 0;
}
</style>

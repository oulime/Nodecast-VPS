<template>
  <div class="vel-empty-card animate-fadeIn flex flex-col items-center justify-center text-center p-8 sm:p-14 my-8 rounded-3xl bg-gradient-to-b from-purple-950/40 via-black/60 to-black/80 border border-purple-800/40 backdrop-blur-2xl shadow-[0_10px_40px_rgba(0,0,0,0.7)] max-w-md mx-auto space-y-4">
    <!-- Glowing Animated HTML5 Orb & Icon -->
    <div class="vel-empty-orb relative flex items-center justify-center w-20 h-20 rounded-2xl bg-purple-900/40 border border-purple-500/50 shadow-[0_0_35px_rgba(168,85,247,0.45)]">
      <div class="absolute inset-0 rounded-2xl bg-gradient-to-tr from-purple-600/30 via-pink-500/20 to-transparent blur-md"></div>
      
      <!-- Film Icon -->
      <svg v-if="icon === 'movie'" class="w-10 h-10 text-purple-300 relative z-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
        <line x1="7" y1="2" x2="7" y2="22"/>
        <line x1="17" y1="2" x2="17" y2="22"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <line x1="2" y1="7" x2="7" y2="7"/>
        <line x1="2" y1="17" x2="7" y2="17"/>
        <line x1="17" y1="17" x2="22" y2="17"/>
        <line x1="17" y1="7" x2="22" y2="7"/>
      </svg>

      <!-- Series Icon -->
      <svg v-else-if="icon === 'series'" class="w-10 h-10 text-purple-300 relative z-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="7" width="20" height="15" rx="2" ry="2"/>
        <polyline points="17 2 12 7 7 2"/>
      </svg>

      <!-- Live TV Icon -->
      <svg v-else-if="icon === 'live'" class="w-10 h-10 text-purple-300 relative z-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 8.5h16a1 1 0 0 1 1 1V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5a1 1 0 0 1 1-1Z"/>
        <path d="M8.3 2.7 12 6.4l3.7-3.7"/>
      </svg>

      <!-- Favorites Icon -->
      <svg v-else-if="icon === 'favorites'" class="w-10 h-10 text-pink-400 relative z-10" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>

      <!-- Search / Filter Icon -->
      <svg v-else class="w-10 h-10 text-purple-300 relative z-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    </div>

    <!-- Title & Description -->
    <div class="space-y-1.5">
      <h3 class="text-base sm:text-lg font-black tracking-wider text-white uppercase bg-gradient-to-r from-purple-200 via-white to-purple-300 bg-clip-text text-transparent">
        {{ title }}
      </h3>
      <p class="text-xs sm:text-sm text-purple-200/75 max-w-xs sm:max-w-sm leading-relaxed mx-auto">
        {{ message }}
      </p>
    </div>

    <!-- Interactive Call-To-Action Button -->
    <div v-if="actionText" class="pt-2">
      <button
        type="button"
        @click="$emit('action')"
        class="px-5 py-2.5 rounded-full bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-purple-900/60 border border-purple-400/40 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 cursor-pointer mx-auto"
      >
        <span>{{ actionText }}</span>
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  icon: {
    type: String,
    default: 'movie'
  },
  title: {
    type: String,
    default: 'Aucun contenu'
  },
  message: {
    type: String,
    default: 'Aucun élément disponible pour le moment.'
  },
  actionText: {
    type: String,
    default: ''
  }
});

defineEmits(['action']);
</script>

<style scoped>
@keyframes vel-empty-pulse {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 0 25px rgba(168, 85, 247, 0.4);
  }
  50% {
    transform: scale(1.04);
    box-shadow: 0 0 40px rgba(192, 132, 252, 0.7);
  }
}

.vel-empty-orb {
  animation: vel-empty-pulse 3s ease-in-out infinite;
}
</style>

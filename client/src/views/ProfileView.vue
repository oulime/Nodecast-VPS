<template>
  <div class="p-6 max-w-lg mx-auto space-y-6">
    <div class="glass-panel p-6 rounded-3xl space-y-6 border border-purple-900/30">
      <div class="flex items-center gap-4">
        <div class="w-14 h-14 rounded-2xl bg-purple-900/40 border border-purple-500/40 flex items-center justify-center text-purple-300 font-bold text-xl">
          {{ (auth.user?.username || 'U')[0].toUpperCase() }}
        </div>
        <div>
          <h2 class="text-lg font-bold text-white">{{ auth.user?.username }}</h2>
          <span class="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-950 text-purple-400 border border-purple-500/30">
            {{ auth.user?.role || 'Abonné' }}
          </span>
        </div>
      </div>

      <div class="space-y-3 pt-4 border-t border-purple-900/20 text-xs">
        <div class="flex justify-between text-slate-400">
          <span>Statut de l'abonnement</span>
          <span class="text-emerald-400 font-semibold uppercase">{{ auth.user?.subscriptionStatus || 'Actif' }}</span>
        </div>
        <div v-if="auth.user?.subscriptionEnd" class="flex justify-between text-slate-400">
          <span>Date d'expiration</span>
          <span class="text-slate-200">{{ new Date(auth.user.subscriptionEnd).toLocaleDateString('fr-FR') }}</span>
        </div>
      </div>

      <div class="pt-2 space-y-2">
        <button
          @click="nav.setTab('favorites')"
          type="button"
          class="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-purple-950/40 border border-purple-800/40 hover:bg-purple-900/50 hover:border-purple-500/50 text-white transition-all text-xs font-bold cursor-pointer group"
        >
          <div class="flex items-center gap-3">
            <span class="w-8 h-8 rounded-xl bg-pink-950/60 border border-pink-500/30 flex items-center justify-center text-pink-400 group-hover:scale-105 transition-transform">
              <svg viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor">
                <path d="M12 21s-8.5-4.8-8.5-11.2A4.8 4.8 0 0 1 12 6.7a4.8 4.8 0 0 1 8.5 3.1C20.5 16.2 12 21 12 21Z"/>
              </svg>
            </span>
            <span>Mes favoris</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-pink-950/80 text-pink-300 border border-pink-500/30">
              {{ favs.totalCount }}
            </span>
            <span class="text-slate-400 text-xs">›</span>
          </div>
        </button>

        <button
          @click="auth.logout()"
          type="button"
          class="w-full py-3.5 rounded-2xl bg-rose-950/30 border border-rose-500/20 text-rose-300 hover:bg-rose-900/40 hover:border-rose-500/40 transition-all font-bold text-xs cursor-pointer"
        >
          Déconnexion
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useAuthStore } from '../stores/authStore.js';
import { useNavStore } from '../stores/navStore.js';
import { useFavoritesStore } from '../stores/favoritesStore.js';

const auth = useAuthStore();
const nav = useNavStore();
const favs = useFavoritesStore();
</script>

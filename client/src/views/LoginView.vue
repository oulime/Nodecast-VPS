<template>
  <div class="min-h-screen w-full flex items-center justify-center p-4 bg-radial from-purple-950/40 via-black to-black">
    <div class="glass-panel w-full max-w-md p-8 rounded-3xl space-y-6 shadow-2xl border border-purple-900/40">
      <!-- Logo -->
      <div class="text-center space-y-2">
        <h1 class="text-3xl font-black tracking-wider bg-gradient-to-r from-purple-400 via-pink-400 to-purple-200 bg-clip-text text-transparent">
          VELORA<span class="text-purple-400 font-normal text-sm ml-1.5 px-2 py-0.5 rounded-lg bg-purple-950/80 border border-purple-500/30">VIP</span>
        </h1>
        <p class="text-xs text-slate-400">Connectez-vous pour accéder à vos flux</p>
      </div>

      <!-- Error Alert -->
      <div v-if="auth.error" class="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-400 text-xs flex items-center gap-2">
        <svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>{{ auth.error }}</span>
      </div>

      <!-- Login Form -->
      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-purple-300">Identifiant</label>
          <input
            v-model="username"
            type="text"
            required
            placeholder="Nom d'utilisateur"
            class="w-full px-4 py-3 rounded-xl bg-black/50 border border-purple-900/40 text-white text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all placeholder:text-slate-600"
          />
        </div>

        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-purple-300">Mot de passe</label>
          <input
            v-model="password"
            type="password"
            required
            placeholder="••••••••"
            class="w-full px-4 py-3 rounded-xl bg-black/50 border border-purple-900/40 text-white text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all placeholder:text-slate-600"
          />
        </div>

        <button
          :disabled="auth.loading"
          type="submit"
          class="w-full py-3.5 mt-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-purple-950/60 active:scale-98 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <div v-if="auth.loading" class="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
          <span>{{ auth.loading ? 'Connexion en cours...' : 'Se connecter' }}</span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useAuthStore } from '../stores/authStore.js';

const auth = useAuthStore();
const username = ref('');
const password = ref('');

async function handleSubmit() {
  if (!username.value.trim() || !password.value) return;
  await auth.login(username.value.trim(), password.value);
}
</script>

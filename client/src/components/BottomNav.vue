<template>
  <div>
    <!-- Floating Pill Navigation Bar (Exact Old Front Replica) -->
    <nav id="vel-bottom-nav" class="vel-bottom-nav" aria-label="Navigation principale">
      <!-- 1. Accueil -->
      <button
        type="button"
        :class="['vel-bottom-nav__button', nav.activeTab === 'home' ? 'is-active' : '']"
        data-bottom-nav="home"
        aria-label="Accueil"
        :aria-current="nav.activeTab === 'home' ? 'page' : undefined"
        @click="handleNav('home')"
      >
        <svg class="vel-bottom-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 10.7 12 3l9 7.7v9.1a1.2 1.2 0 0 1-1.2 1.2h-5.3v-6.2h-5V21H4.2A1.2 1.2 0 0 1 3 19.8v-9.1Z"></path>
        </svg>
        <span class="vel-bottom-nav__label">Accueil</span>
      </button>

      <!-- 2. TV en direct -->
      <button
        type="button"
        :class="['vel-bottom-nav__button', nav.activeTab === 'live' ? 'is-active' : '']"
        data-bottom-nav="live"
        aria-label="TV en direct"
        :aria-current="nav.activeTab === 'live' ? 'page' : undefined"
        @click="handleNav('live')"
      >
        <svg class="vel-bottom-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8.3 2.7 12 6.4l3.7-3.7 1.4 1.4L13.2 8H19a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h5.8L6.9 4.1l1.4-1.4ZM5.5 10.5V18h11v-7.5h-11Zm12.8 1.1a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm0 3.2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"></path>
        </svg>
        <span class="vel-bottom-nav__label">TV</span>
      </button>

      <!-- 3. Films -->
      <button
        type="button"
        :class="['vel-bottom-nav__button', nav.activeTab === 'movies' ? 'is-active' : '']"
        data-bottom-nav="movies"
        aria-label="Films"
        :aria-current="nav.activeTab === 'movies' ? 'page' : undefined"
        @click="handleNav('movies')"
      >
        <svg class="vel-bottom-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 8.5h16a1 1 0 0 1 1 1V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5a1 1 0 0 1 1-1Z"></path>
          <path d="m4 8.5 1-4.1a1.8 1.8 0 0 1 2.2-1.3L20 6.4l-.55 2.1M3 12h18M8 3.35l2.15 5.15m2.75-3.95 1.65 3.95m2.95-2.65 1.05 2.65M8 16.5h8"></path>
        </svg>
        <span class="vel-bottom-nav__label">Films</span>
      </button>

      <!-- 4. Séries -->
      <button
        type="button"
        :class="['vel-bottom-nav__button', nav.activeTab === 'series' ? 'is-active' : '']"
        data-bottom-nav="series"
        aria-label="Séries"
        :aria-current="nav.activeTab === 'series' ? 'page' : undefined"
        @click="handleNav('series')"
      >
        <svg class="vel-bottom-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 2h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Zm3.2 4.5v7l6-3.5-6-3.5ZM2 6h1v10a4 4 0 0 0 4 4h11v2H7a6 6 0 0 1-6-6V7a1 1 0 0 1 1-1Z"></path>
        </svg>
        <span class="vel-bottom-nav__label">Séries</span>
      </button>

      <!-- 5. Favoris -->
      <button
        type="button"
        :class="['vel-bottom-nav__button', nav.activeTab === 'favorites' ? 'is-active' : '']"
        data-bottom-nav="favorites"
        aria-label="Favoris"
        :aria-current="nav.activeTab === 'favorites' ? 'page' : undefined"
        @click="handleNav('favorites')"
      >
        <svg class="vel-bottom-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path>
        </svg>
        <span class="vel-bottom-nav__label">Favoris</span>
      </button>

      <!-- 6. Profil -->
      <button
        type="button"
        :class="['vel-bottom-nav__button', nav.activeTab === 'profile' ? 'is-active' : '']"
        data-bottom-nav="profile"
        aria-label="Profil"
        :aria-current="nav.activeTab === 'profile' ? 'page' : undefined"
        @click="handleNav('profile')"
      >
        <svg class="vel-bottom-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5c0-3-4-5.5-9-5.5Z"></path>
        </svg>
        <span class="vel-bottom-nav__label">Profil</span>
      </button>
    </nav>
  </div>
</template>

<script setup>
import { useNavStore } from '../stores/navStore.js';

const nav = useNavStore();

function handleNav(id) {
  nav.setTab(id);
}
</script>

<style scoped>
.vel-bottom-nav {
  position: fixed;
  z-index: 2400;
  left: 50%;
  bottom: max(10px, env(safe-area-inset-bottom, 0px));
  width: min(760px, calc(100% - 24px));
  min-height: 66px;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 3px;
  padding: 7px;
  border: 1px solid rgba(151, 135, 255, 0.28);
  border-radius: 22px;
  background: linear-gradient(135deg, rgba(28, 24, 56, 0.93), rgba(8, 12, 29, 0.96));
  box-shadow:
    0 20px 55px rgba(0, 0, 0, 0.48),
    0 0 28px rgba(109, 77, 255, 0.13),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  -webkit-backdrop-filter: blur(22px) saturate(145%);
  backdrop-filter: blur(22px) saturate(145%);
  transform: translateX(-50%);
  transition: opacity 180ms ease, transform 180ms ease, visibility 180ms ease;
}

.vel-bottom-nav__button {
  position: relative;
  min-width: 0;
  height: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 4px 2px;
  border: 0;
  border-radius: 15px;
  color: rgba(222, 222, 244, 0.66);
  background: transparent;
  font: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: color 160ms ease, background 160ms ease, transform 160ms ease;
}

.vel-bottom-nav__button::before {
  content: "";
  position: absolute;
  top: 2px;
  width: 24px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, #f59e0b, #fde68a);
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.8);
  opacity: 0;
  transform: scaleX(0.4);
  transition: opacity 160ms ease, transform 160ms ease;
}

.vel-bottom-nav__button:hover,
.vel-bottom-nav__button:focus-visible {
  color: #fff;
  background: rgba(125, 92, 255, 0.12);
  outline: none;
}

.vel-bottom-nav__button:active {
  transform: scale(0.94);
}

.vel-bottom-nav__button.is-active {
  color: #fff7ed;
  background: linear-gradient(145deg, rgba(245, 158, 11, 0.34), rgba(251, 191, 36, 0.16));
  box-shadow: inset 0 0 0 1px rgba(253, 230, 138, 0.18), 0 5px 15px rgba(120, 53, 15, 0.2);
}

.vel-bottom-nav__button.is-active::before {
  opacity: 1;
  transform: scaleX(1);
}

.vel-bottom-nav__button.is-active .vel-bottom-nav__icon,
.vel-bottom-nav__button.is-active .vel-bottom-nav__icon-frame {
  filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.58));
}

.vel-bottom-nav__icon {
  width: 22px;
  height: 22px;
  display: block;
  fill: currentColor;
  filter: drop-shadow(0 0 7px rgba(117, 99, 255, 0.25));
}

.vel-bottom-nav__button[data-bottom-nav="live"] .vel-bottom-nav__icon {
  width: 26px;
  height: 26px;
}

.vel-bottom-nav__button[data-bottom-nav="movies"] .vel-bottom-nav__icon {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.vel-bottom-nav__flag {
  width: 25px;
  height: 18px;
  display: block;
  border-radius: 4px;
  object-fit: cover;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.3),
    0 3px 9px rgba(0, 0, 0, 0.42);
}

.vel-bottom-nav__icon-frame {
  width: 28px;
  height: 22px;
  flex: 0 0 22px;
  display: grid;
  place-items: center;
  margin-inline: auto;
  color: inherit;
  filter: drop-shadow(0 0 7px rgba(117, 99, 255, 0.25));
}

.vel-bottom-nav__label {
  max-width: 100%;
  overflow: hidden;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vel-bottom-country-menu {
  position: fixed;
  z-index: 2500;
  left: 50%;
  bottom: calc(86px + env(safe-area-inset-bottom, 0px));
  width: min(330px, calc(100% - 24px));
  max-height: min(55vh, 430px);
  overflow: auto;
  padding: 8px;
  border: 1px solid rgba(151, 135, 255, 0.3);
  border-radius: 18px;
  background: linear-gradient(145deg, rgba(27, 23, 55, 0.98), rgba(7, 11, 27, 0.98));
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.58), 0 0 30px rgba(109, 77, 255, 0.16);
  -webkit-backdrop-filter: blur(24px) saturate(145%);
  backdrop-filter: blur(24px) saturate(145%);
  transform: translateX(-50%);
}

.vel-bottom-country-menu__title {
  padding: 6px 8px 4px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #a78bfa;
}

@media (max-width: 640px) {
  .vel-bottom-nav {
    bottom: 0;
    width: 100%;
    min-height: 64px;
    padding: 5px 3px calc(5px + env(safe-area-inset-bottom, 0px));
    border-width: 1px 0 0;
    border-radius: 18px 18px 0 0;
  }

  .vel-bottom-nav__button {
    height: 51px;
    border-radius: 13px;
  }

  .vel-bottom-nav__icon {
    width: 21px;
    height: 21px;
  }

  .vel-bottom-nav__button[data-bottom-nav="live"] .vel-bottom-nav__icon {
    width: 24px;
    height: 24px;
  }

  .vel-bottom-nav__label {
    font-size: 9px;
  }

  .vel-bottom-country-menu {
    bottom: calc(70px + env(safe-area-inset-bottom, 0px));
  }
}
</style>

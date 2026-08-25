import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { vDragScroll } from './directives/dragScroll.js';

// Import exact original stylesheets
import './styles/main-pspufkkb.css';
import './styles/live-package-text-cards.css';
import './styles/parent-packages.css';
import './styles/velora-home-sections.css';
import './styles/velora-bigscreen-performance.css';
import './styles/velora-favorites.css';
import './styles/main.css';

const app = createApp(App);
app.use(createPinia());
app.directive('drag-scroll', vDragScroll);
app.mount('#app');

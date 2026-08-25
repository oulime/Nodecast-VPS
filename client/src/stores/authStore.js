import { defineStore } from 'pinia';
import { api } from '../api/index.js';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: JSON.parse(localStorage.getItem('authUser') || 'null'),
    token: localStorage.getItem('authToken') || null,
    isAuthenticated: !!localStorage.getItem('authToken'),
    loading: false,
    error: null
  }),
  actions: {
    async login(username, password) {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.login(username, password);
        if (res.token) {
          this.token = res.token;
          this.user = res.user;
          this.isAuthenticated = true;
          localStorage.setItem('authToken', res.token);
          localStorage.setItem('authUser', JSON.stringify(res.user));
          return true;
        }
        return false;
      } catch (err) {
        this.error = err.message || 'Identifiants incorrects';
        return false;
      } finally {
        this.loading = false;
      }
    },
    async checkAuth() {
      if (!this.token) {
        this.logout();
        return false;
      }
      try {
        const user = await api.getMe();
        this.user = user;
        this.isAuthenticated = true;
        localStorage.setItem('authUser', JSON.stringify(user));
        return true;
      } catch (err) {
        this.logout();
        return false;
      }
    },
    logout() {
      this.user = null;
      this.token = null;
      this.isAuthenticated = false;
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
    }
  }
});

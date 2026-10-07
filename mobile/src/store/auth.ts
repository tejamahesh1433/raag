import { create } from "zustand";
import { api, clearSession, getBaseUrl, setBaseUrl } from "../api";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (serverUrl: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: false,
  error: null,

  login: async (serverUrl, username, password) => {
    set({ loading: true, error: null });
    try {
      await setBaseUrl(serverUrl);
      let user: User;
      try {
        user = await api.login(username, password);
      } catch (e) {
        // If server is in open-access mode (AUTH_REQUIRED=0), fallback to api.me()
        user = await api.me();
      }
      set({ user, loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Connection failed", loading: false });
    }
  },

  logout: async () => {
    try {
      await api.logout();
    } catch {}
    await clearSession();
    set({ user: null, error: null });
  },

  restore: async () => {
    set({ loading: true });
    try {
      if (!api.me || !getBaseUrl()) {
        set({ user: null, loading: false });
        return;
      }
      const user = await api.me();
      set({ user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },
}));

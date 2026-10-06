import { create } from "zustand";
import { api } from "../api";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  loading: boolean;
  setupRequired: boolean;
  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  setup: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setupRequired: false,

  init: async () => {
    try {
      const { required } = await api.setupRequired();
      if (required) {
        set({ setupRequired: true, loading: false });
        return;
      }
      const user = await api.me();
      set({ user, setupRequired: false, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  login: async (username, password) => {
    const user = await api.login(username, password);
    set({ user, setupRequired: false });
  },

  setup: async (username, password) => {
    const user = await api.setup(username, password);
    set({ user, setupRequired: false });
  },

  logout: async () => {
    try {
      await api.logout();
    } finally {
      set({ user: null });
    }
  },
}));

// Global handler: any 401 from the API drops us back to login.
window.addEventListener("auth:unauthorized", () => {
  useAuth.setState({ user: null });
});

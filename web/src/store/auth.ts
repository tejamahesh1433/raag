import { create } from "zustand";
import { api } from "../api";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  loading: boolean;
  setupRequired: boolean;
  serverReachable: boolean;
  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  setup: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setupRequired: false,
  serverReachable: true,

  init: async () => {
    try {
      const status = await api.setupRequired();
      if (status.required) {
        set({ setupRequired: true, serverReachable: true, loading: false, user: null });
        return;
      }
      try {
        const user = await api.me();
        set({ user, setupRequired: false, serverReachable: true, loading: false });
      } catch {
        // Auth required and no session — show login, not "server down".
        set({ user: null, setupRequired: false, serverReachable: true, loading: false });
      }
    } catch {
      set({ user: null, serverReachable: false, loading: false });
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

window.addEventListener("auth:unauthorized", () => {
  useAuth.setState({ user: null });
});

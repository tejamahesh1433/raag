import { create } from "zustand";
import { api, clearSession, DEFAULT_BASE_URL, getBaseUrl, setBaseUrl } from "../api";
import type { User } from "../types";

export const DEFAULT_USER: User = {
  id: 2,
  username: "guest",
  is_admin: true,
};

interface AuthState {
  user: User | null;
  loading: boolean;
  restoring: boolean;
  error: string | null;
  login: (serverUrl: string, username: string, password: string) => Promise<void>;
  loginDirectly: (serverUrl?: string) => Promise<void>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: false,
  restoring: true,
  error: null,

  loginDirectly: async (serverUrl?: string) => {
    set({ loading: true, error: null });
    try {
      const url = (serverUrl || getBaseUrl() || DEFAULT_BASE_URL).replace(/\/$/, "");
      await setBaseUrl(url);
      let user: User;
      try {
        user = await api.me();
      } catch {
        try {
          user = await api.login("guest", "");
        } catch {
          user = DEFAULT_USER;
        }
      }
      set({ user, loading: false });
    } catch {
      set({ user: DEFAULT_USER, loading: false });
    }
  },

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
    // Re-authenticate directly as guest so the user is never stranded on a login screen
    try {
      const guest = await api.me();
      set({ user: guest, error: null });
    } catch {
      set({ user: DEFAULT_USER, error: null });
    }
  },

  restore: async () => {
    try {
      const url = getBaseUrl() || DEFAULT_BASE_URL;
      await setBaseUrl(url);

      let user: User | null = null;
      try {
        user = await api.me();
      } catch {
        try {
          user = await api.login("guest", "");
        } catch {
          // If offline or initial launch, fallback to default guest user
          user = DEFAULT_USER;
        }
      }
      set({ user: user ?? DEFAULT_USER, restoring: false });
    } catch {
      set({ user: DEFAULT_USER, restoring: false });
    }
  },
}));

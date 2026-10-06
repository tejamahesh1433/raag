import { create } from "zustand";
import { api } from "../api";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  loading: boolean;
  init: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,

  init: async () => {
    try {
      const user = await api.me();
      set({ user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },
}));


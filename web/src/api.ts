import type {
  Album,
  Artist,
  Job,
  Playlist,
  SearchResults,
  Settings,
  Track,
  User,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers:
      init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json", ...(init.headers ?? {}) }
        : (init.headers as Record<string, string>),
    ...init,
  });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    throw new ApiError(401, "Not authenticated");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* keep statusText */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

export const api = {
  // auth
  setupRequired: () => request<{ required: boolean }>("/api/auth/setup-required"),
  setup: (username: string, password: string) =>
    request<User>("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<User>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ message: string }>("/api/auth/logout", { method: "POST" }),
  me: () => request<User>("/api/auth/me"),

  // library
  tracks: (params: { offset?: number; limit?: number; order?: string } = {}) => {
    const qs = new URLSearchParams({
      offset: String(params.offset ?? 0),
      limit: String(params.limit ?? 200),
      order: params.order ?? "title",
    });
    return request<Page<Track>>(`/api/library/tracks?${qs}`);
  },
  artists: () => request<Artist[]>("/api/library/artists"),
  albums: (artistId?: number) =>
    request<Album[]>(
      artistId ? `/api/library/albums?artist_id=${artistId}` : "/api/library/albums",
    ),
  albumTracks: (albumId: number) =>
    request<Track[]>(`/api/library/albums/${albumId}/tracks`),
  artist: (artistId: number) => request<Artist>(`/api/library/artists/${artistId}`),
  genres: () => request<{ genre: string; count: number }[]>("/api/library/genres"),
  search: (q: string) => request<SearchResults>(`/api/library/search?q=${encodeURIComponent(q)}`),
  track: (id: number) => request<Track>(`/api/tracks/${id}`),

  // playback
  streamUrl: (id: number) => `/api/tracks/${id}/stream`,
  artworkUrl: (id: number) => `/api/artwork/${id}`,
  recordPlayed: (id: number) =>
    request<{ message: string }>(`/api/tracks/${id}/played`, { method: "POST" }),
  favorite: (id: number) =>
    request<Track>(`/api/tracks/${id}/favorite`, { method: "POST" }),
  unfavorite: (id: number) =>
    request<Track>(`/api/tracks/${id}/favorite`, { method: "DELETE" }),
  favorites: () => request<Track[]>("/api/me/favorites"),
  history: () => request<Track[]>("/api/me/history"),

  // playlists
  playlists: () => request<Playlist[]>("/api/playlists"),
  playlist: (id: number) => request<Playlist>(`/api/playlists/${id}`),
  playlistTracks: (id: number) => request<Track[]>(`/api/playlists/${id}/tracks`),
  createPlaylist: (payload: {
    name: string;
    description?: string;
    kind?: string;
    rules?: unknown;
  }) =>
    request<Playlist>("/api/playlists", { method: "POST", body: JSON.stringify(payload) }),
  updatePlaylist: (id: number, payload: Partial<{ name: string; description: string; rules: unknown }>) =>
    request<Playlist>(`/api/playlists/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deletePlaylist: (id: number) =>
    request<{ message: string }>(`/api/playlists/${id}`, { method: "DELETE" }),
  addToPlaylist: (id: number, trackIds: number[]) =>
    request<Playlist>(`/api/playlists/${id}/tracks`, {
      method: "POST",
      body: JSON.stringify({ track_ids: trackIds }),
    }),
  removeFromPlaylist: (id: number, trackId: number) =>
    request<Playlist>(`/api/playlists/${id}/tracks/${trackId}`, { method: "DELETE" }),
  reorderPlaylist: (id: number, trackIds: number[]) =>
    request<Playlist>(`/api/playlists/${id}/tracks/order`, {
      method: "PUT",
      body: JSON.stringify({ track_ids: trackIds }),
    }),

  // system
  scan: () => request<{ job_id: number; status: string }>("/api/library/scan", { method: "POST" }),
  job: (id: number) => request<Job>(`/api/jobs/${id}`),
  health: () =>
    request<{ status: string; version: string; tracks: number }>("/api/health"),
  healthDetail: () =>
    request<{
      storage: { free_bytes: number; total_bytes: number };
      last_scan: Job | null;
      ai: { provider: string; base_url: string; reachable: boolean; models: string[] };
      library_roots: string[];
    }>("/api/health/detail"),
  settings: () => request<Settings>("/api/settings"),
  saveSettings: (payload: Partial<Settings>) =>
    request<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(payload) }),
  backup: () =>
    request<{ message: string }>("/api/settings/backup", { method: "POST" }),
};

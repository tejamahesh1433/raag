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
import { createSSEParser, type SSEEvent } from "./lib/sse";

export interface ChatMessageOut {
  id: number;
  role: "user" | "assistant";
  content: string;
  actions: Array<Record<string, unknown>>;
  created_at: string;
}

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
  setupRequired: () =>
    request<{ required: boolean; auth_required: boolean }>("/api/auth/setup-required"),
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
  listUsers: () => request<User[]>("/api/auth/users"),
  createUser: (payload: { username: string; password: string; is_admin?: boolean }) =>
    request<User>("/api/auth/users", { method: "POST", body: JSON.stringify(payload) }),
  deleteUser: (id: number) =>
    request<{ message: string }>(`/api/auth/users/${id}`, { method: "DELETE" }),


  // library
  tracks: (params: {
    offset?: number;
    limit?: number;
    order?: string;
    genre?: string;
    folder?: string;
  } = {}) => {
    const qs = new URLSearchParams({
      offset: String(params.offset ?? 0),
      limit: String(params.limit ?? 200),
      order: params.order ?? "title",
    });
    if (params.genre) qs.set("genre", params.genre);
    if (params.folder) qs.set("folder", params.folder);
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
  folders: () => request<{ folder: string; count: number }[]>("/api/library/folders"),
  search: (q: string) => request<SearchResults>(`/api/library/search?q=${encodeURIComponent(q)}`),
  track: (id: number) => request<Track>(`/api/tracks/${id}`),

  // playback
  streamUrl: (id: number, quality?: string) => {
    const q = quality ?? (typeof localStorage !== "undefined"
      ? localStorage.getItem("raag-stream-quality") || "original"
      : "original");
    if (!q || q === "original") return `/api/tracks/${id}/stream`;
    return `/api/tracks/${id}/stream?quality=${encodeURIComponent(q)}`;
  },
  artworkUrl: (id: number) => `/api/artwork/${id}`,
  recordPlayed: (id: number) =>
    request<{ message: string }>(`/api/tracks/${id}/played`, { method: "POST" }),
  lastfmAuth: (payload: {
    username: string;
    password: string;
    api_key: string;
    api_secret: string;
  }) =>
    request<{ session_key: string; message: string }>("/api/scrobble/lastfm-auth", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
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
  generateAiPlaylist: (payload: { description: string; name?: string; limit?: number }) =>
    request<Playlist>("/api/playlists/ai/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
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

  importM3u: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Playlist>("/api/playlists/import", { method: "POST", body: form });
  },

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
      scan_interval_hours?: number;
      transcode_enabled?: boolean;
      ffmpeg_available?: boolean;
    }>("/api/health/detail"),
  settings: () => request<Settings>("/api/settings"),
  saveSettings: (payload: Partial<Settings>) =>
    request<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(payload) }),
  backup: () =>
    request<{ message: string }>("/api/settings/backup", { method: "POST" }),
  restore: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ message: string }>("/api/settings/restore", { method: "POST", body: form });
  },

  // discovery (M4)
  discoveryStatus: () =>
    request<{ indexed: number; total: number; model: string; ready: boolean }>(
      "/api/discovery/status",
    ),
  startEmbed: () =>
    request<{ job_id: number; status: string }>("/api/discovery/embed", { method: "POST" }),
  similarTracks: (trackId: number, limit = 12) =>
    request<Array<{ track: Track; score: number }>>(
      `/api/discovery/similar/${trackId}?limit=${limit}`,
    ),
  semanticSearch: (q: string, limit = 20) =>
    request<Array<{ track: Track; score: number }>>(
      `/api/discovery/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    ),
  lyrics: (trackId: number) =>
    request<{ plain: string; synced: Array<{ t: number; text: string }>; source: string }>(
      `/api/tracks/${trackId}/lyrics`,
    ),
  fetchLyrics: (trackId: number) =>
    request<{ plain: string; synced: Array<{ t: number; text: string }>; source: string }>(
      `/api/tracks/${trackId}/lyrics`,
      { method: "POST" },
    ),
  generateRadio: (trackId: number, limit = 25) =>
    request<Track[]>(`/api/discovery/radio/${trackId}?limit=${limit}`, { method: "POST" }),
  listeningStats: () =>
    request<{
      total_tracks: number;
      total_duration_seconds: number;
      top_artists: Array<{ artist: string; count: number }>;
      top_genres: Array<{ genre: string; count: number }>;
    }>("/api/discovery/stats"),


  // organization (M4/M5)
  setupStatus: () =>
    request<{
      has_library_roots: boolean;
      library_roots: string[];
      track_count: number;
      ai_reachable: boolean;
      embeddings_ready: boolean;
      pending_tag_suggestions: number;
      online_enrichment: boolean;
      is_admin: boolean;
      wizard_complete: boolean;
    }>("/api/organization/setup-status"),
  tagSuggestions: (status = "pending") =>
    request<
      Array<{
        id: number;
        track_id: number;
        status: string;
        proposed: Record<string, unknown>;
        original: Record<string, unknown>;
        rationale: string;
        created_at: string;
        track: Track | null;
      }>
    >(`/api/organization/suggestions?status=${status}`),
  scanTags: (useLlm = false) =>
    request<{ job_id: number; status: string }>("/api/organization/scan-tags", {
      method: "POST",
      body: JSON.stringify({ use_llm: useLlm }),
    }),
  approveSuggestion: (id: number) =>
    request<{ id: number; status: string }>(`/api/organization/suggestions/${id}/approve`, {
      method: "POST",
    }),
  rejectSuggestion: (id: number) =>
    request<{ id: number; status: string }>(`/api/organization/suggestions/${id}/reject`, {
      method: "POST",
    }),
  duplicates: () =>
    request<{
      groups: Array<{
        fingerprint: string;
        count: number;
        tracks: Array<{
          id: number;
          title: string;
          artist: string;
          album: string;
          path: string;
          duration: number;
        }>;
      }>;
    }>("/api/organization/duplicates"),
  startEnrich: () =>
    request<{ job_id: number; status: string }>("/api/organization/enrich", { method: "POST" }),
  artistEnrichment: (artistId: number) =>
    request<Record<string, unknown>>(`/api/organization/enrichment/artist/${artistId}`),
  albumEnrichment: (albumId: number) =>
    request<Record<string, unknown>>(`/api/organization/enrichment/album/${albumId}`),
  acoustidStatus: () =>
    request<{ fpcalc_available: boolean }>("/api/organization/acoustid/status"),
  acoustidIdentify: (trackId: number) =>
    request<{
      ok: boolean;
      matches: Array<{ score: number; title: string; artist: string; album: string }>;
      best?: { score: number; title: string; artist: string; album: string };
      suggestion_id?: number;
      error?: string;
    }>(`/api/organization/acoustid/identify/${trackId}`, { method: "POST" }),
  acoustidScan: (limit = 25) =>
    request<{ job_id: number; status: string }>(
      `/api/organization/acoustid/scan?limit=${limit}`,
      { method: "POST" },
    ),
  sessions: () =>
    request<Array<{ token: string; created_at: string; expires_at: string }>>("/api/auth/sessions"),
  revokeSession: (token: string) =>
    request<{ message: string }>(`/api/auth/sessions/${encodeURIComponent(token)}`, {
      method: "DELETE",
    }),

  // AI chat
  chatHistory: () => request<ChatMessageOut[]>("/api/chat/history"),
  clearChat: () =>
    request<{ message: string }>("/api/chat/history", { method: "DELETE" }),
  /** POST /api/chat and pump the SSE stream through `onEvent`. */
  streamChat: async (
    message: string,
    nowPlaying: { title: string; artist: string } | null,
    onEvent: (ev: SSEEvent) => void,
  ): Promise<void> => {
    const res = await fetch("/api/chat", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, now_playing: nowPlaying }),
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
    if (!res.body) throw new ApiError(500, "Streaming not supported");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parser = createSSEParser(onEvent);
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.flush();
    } finally {
      reader.releaseLock();
    }
  },
};

/**
 * Raag REST API client for React Native.
 * Handles cookie-based session auth by storing the Set-Cookie header manually.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Album, Artist, ChatMessage, Playlist, SearchResults, Track, User } from "./types";

const BASE_URL_KEY = "raag_base_url";
const COOKIE_KEY = "raag_session_cookie";
const QUALITY_KEY = "raag_stream_quality";

export type StreamQuality = "original" | "high" | "medium" | "low";

let _baseUrl = "";
let _cookie = "";
let _streamQuality: StreamQuality = "original";

export async function initApi(): Promise<void> {
  const [baseUrl, cookie, quality] = await Promise.all([
    AsyncStorage.getItem(BASE_URL_KEY),
    AsyncStorage.getItem(COOKIE_KEY),
    AsyncStorage.getItem(QUALITY_KEY),
  ]);
  _baseUrl = baseUrl ?? "";
  _cookie = cookie ?? "";
  if (quality === "original" || quality === "high" || quality === "medium" || quality === "low") {
    _streamQuality = quality;
  }
}

export async function setBaseUrl(url: string): Promise<void> {
  _baseUrl = url.replace(/\/$/, "");
  await AsyncStorage.setItem(BASE_URL_KEY, _baseUrl);
}

export function getBaseUrl(): string {
  return _baseUrl;
}

export function getStreamQuality(): StreamQuality {
  return _streamQuality;
}

export async function setStreamQuality(quality: StreamQuality): Promise<void> {
  _streamQuality = quality;
  await AsyncStorage.setItem(QUALITY_KEY, quality);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
    ...((_cookie ? { Cookie: _cookie } : {}) as Record<string, string>),
    ...(init.headers as Record<string, string>),
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${_baseUrl}${path}`, { ...init, headers, signal: controller.signal });
    clearTimeout(timeout);
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const match = setCookie.match(/([^;]+)/);
      if (match) {
        _cookie = match[1];
        await AsyncStorage.setItem(COOKIE_KEY, _cookie);
      }
    }
    if (res.status === 401) throw new ApiError(401, "Not authenticated");
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      } catch {}
      throw new ApiError(res.status, detail);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

export async function clearSession(): Promise<void> {
  _cookie = "";
  await AsyncStorage.removeItem(COOKIE_KEY);
}

interface Page<T> { items: T[]; total: number; offset: number; limit: number; }

export const api = {
  // auth
  login: (username: string, password: string) =>
    request<User>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ message: string }>("/api/auth/logout", { method: "POST" }),
  me: () => request<User>("/api/auth/me"),

  // library
  tracks: (params: { offset?: number; limit?: number; order?: string; genre?: string } = {}) => {
    const qs = new URLSearchParams({
      offset: String(params.offset ?? 0),
      limit: String(params.limit ?? 200),
      order: params.order ?? "title",
    });
    if (params.genre) qs.set("genre", params.genre);
    return request<Page<Track>>(`/api/library/tracks?${qs}`);
  },
  artists: () => request<Artist[]>("/api/library/artists"),
  albums: (artistId?: number) =>
    request<Album[]>(artistId ? `/api/library/albums?artist_id=${artistId}` : "/api/library/albums"),
  albumTracks: (albumId: number) => request<Track[]>(`/api/library/albums/${albumId}/tracks`),
  search: (q: string) =>
    request<SearchResults>(`/api/library/search?q=${encodeURIComponent(q)}`),
  genres: () => request<{ genre: string; count: number }[]>("/api/library/genres"),
  recentlyAdded: () =>
    request<Page<Track>>("/api/library/tracks?order=added_desc&limit=20"),
  recentlyPlayed: () => request<Track[]>("/api/me/history"),
  favorites: () => request<Track[]>("/api/me/favorites"),

  // playback
  streamUrl: (id: number, quality = "original") =>
    `${_baseUrl}/api/tracks/${id}/stream?quality=${quality}`,
  streamSource: (id: number) => ({
    uri: `${_baseUrl}/api/tracks/${id}/stream?quality=${_streamQuality}`,
    headers: _cookie ? { Cookie: _cookie } : undefined,
  }),
  artworkUrl: (id: number | null) => (id ? `${_baseUrl}/api/artwork/${id}` : null),
  mediaHeaders: () => (_cookie ? { Cookie: _cookie } : undefined),
  recordPlayed: (id: number) =>
    request<{ message: string }>(`/api/tracks/${id}/played`, { method: "POST" }),
  favorite: (id: number) => request<Track>(`/api/tracks/${id}/favorite`, { method: "POST" }),
  unfavorite: (id: number) => request<Track>(`/api/tracks/${id}/favorite`, { method: "DELETE" }),

  // playlists
  playlists: () => request<Playlist[]>("/api/playlists"),
  playlistTracks: (id: number) => request<Track[]>(`/api/playlists/${id}/tracks`),
  createPlaylist: (name: string) =>
    request<Playlist>("/api/playlists", {
      method: "POST",
      body: JSON.stringify({ name, kind: "manual" }),
    }),
  addToPlaylist: (id: number, trackIds: number[]) =>
    request<Playlist>(`/api/playlists/${id}/tracks`, {
      method: "POST",
      body: JSON.stringify({ track_ids: trackIds }),
    }),

  // chat
  chatHistory: () => request<ChatMessage[]>("/api/chat/history"),
  chat: (message: string, nowPlaying?: { title: string; artist: string }) =>
    request<ChatMessage>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message, now_playing: nowPlaying }),
    }),

  // health
  health: () => request<{ status: string; version: string; tracks: number }>("/api/health"),
};

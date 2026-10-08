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

function _reasonPhrase(status: number, text: string): string {
  try {
    const body = JSON.parse(text);
    if (typeof body.detail === "string") return body.detail;
    return JSON.stringify(body.detail);
  } catch {
    return text.trim().slice(0, 200) || `HTTP ${status}`;
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

export interface SSEChatEvent {
  event: "token" | "tool" | "action" | "done" | "error";
  data: Record<string, unknown>;
}

interface Page<T> { items: T[]; total: number; offset: number; limit: number; }
/**
 * Incremental SSE (text/event-stream) parser. Feed decoded string chunks;
 * complete events are delivered via the callback as soon as their
 * terminating blank line arrives. Handles frames split across chunks.
 */
export function createSSEParser(onEvent: (ev: SSEChatEvent) => void) {
  let buffer = "";

  const processBlock = (block: string) => {
    if (!block.trim()) return;
    let event = "message";
    let dataStr = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
    }
    if (!dataStr) return;
    try {
      onEvent({ event: event as SSEChatEvent["event"], data: JSON.parse(dataStr) });
    } catch {
      /* ignore malformed frames */
    }
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      let idx: number;
      // eslint-disable-next-line no-cond-assign
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        processBlock(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 2);
      }
    },
    flush() {
      if (buffer.trim()) {
        processBlock(buffer);
        buffer = "";
      }
    },
  };
}

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
  artworkUrl: (id: number | null | undefined) => (id ? `${_baseUrl}/api/artwork/${id}` : null),
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

  // chat (server streams Server-Sent Events; never JSON)
  chatHistory: () => request<ChatMessage[]>("/api/chat/history"),
  /**
   * POST /api/chat and pump the SSE stream through `onEvent`.
   * Raises ApiError(503) with the provider detail when no local AI is up.
   * Works with global fetch, React Native XHR, and node-fetch (tests).
   */
  streamChat: async (
    message: string,
    nowPlaying: { title: string; artist: string } | undefined,
    onEvent: (ev: SSEChatEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> => {
    const url = `${_baseUrl}/api/chat`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(_cookie ? { Cookie: _cookie } : {}),
    };
    const body = JSON.stringify({ message, now_playing: nowPlaying ?? null });

    if (typeof XMLHttpRequest !== "undefined") {
      // React Native: fetch does not stream, so parse progress incrementally.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
        const timer = setTimeout(() => {
          try { xhr.abort(); } catch {}
          reject(new ApiError(0, "Chat request timed out"));
        }, 180000);
        let seen = 0;
        const parser = createSSEParser(onEvent);
        xhr.onprogress = () => {
          const text: string = xhr.responseText ?? "";
          if (text.length > seen) {
            parser.push(text.slice(seen));
            seen = text.length;
          }
        };
        xhr.onload = () => {
          clearTimeout(timer);
          const status: number = xhr.status ?? 0;
          const text: string = xhr.responseText ?? "";
          if (status === 401) {
            reject(new ApiError(401, "Not authenticated"));
            return;
          }
          if (status === 204 || !text) {
            parser.flush();
            resolve();
            return;
          }
          if (status === 200) {
            // SSE bodies sometimes arrive only in full at onload (Hermes/JSC).
            if (text.length > seen) parser.push(text.slice(seen));
            parser.flush();
            resolve();
            return;
          }
          reject(new ApiError(status, _reasonPhrase(status, text)));
        };
        xhr.onerror = () => {
          clearTimeout(timer);
          reject(new ApiError(0, "Network error"));
        };
        xhr.ontimeout = () => {
          clearTimeout(timer);
          reject(new ApiError(0, "Chat request timed out"));
        };
        if (signal) {
          const onAbort = () => { try { xhr.abort(); } catch {} };
          if (signal.aborted) { onAbort(); return; }
          signal.addEventListener("abort", onAbort, { once: true });
        }
        xhr.send(body);
      });
      return;
    }

    // Non-RN (tests / older runtimes): text fallback.
    const res = await fetch(url, { method: "POST", headers, body, signal });
    if (res.status === 401) throw new ApiError(401, "Not authenticated");
    const text = await res.text().catch(() => "");
    if (!res.ok) throw new ApiError(res.status, _reasonPhrase(res.status, text));
    const parser = createSSEParser(onEvent);
    parser.push(text);
    parser.flush();
  },

  // health
  health: () => request<{ status: string; version: string; tracks: number }>("/api/health"),
};

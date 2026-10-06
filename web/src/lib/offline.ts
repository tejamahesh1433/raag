/** Offline track downloads via Cache API + IndexedDB metadata. */

import type { Track } from "../types";
import { api } from "../api";

const CACHE = "raag-offline-audio-v1";
const DB_NAME = "raag-offline";
const STORE = "tracks";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function streamPath(trackId: number): string {
  return `/api/tracks/${trackId}/stream`;
}

export async function listOfflineTracks(): Promise<Track[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as Track[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function isOffline(trackId: number): Promise<boolean> {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(streamPath(trackId));
  return Boolean(hit);
}

export async function downloadTrack(track: Track): Promise<void> {
  const url = api.streamUrl(track.id);
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const cache = await caches.open(CACHE);
  // Store under path without query so playback/SW can match.
  await cache.put(streamPath(track.id), res);

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...track });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function downloadTracks(tracks: Track[], onProgress?: (n: number, total: number) => void): Promise<void> {
  let done = 0;
  for (const t of tracks) {
    await downloadTrack(t);
    done += 1;
    onProgress?.(done, tracks.length);
  }
}

export async function removeOfflineTrack(trackId: number): Promise<void> {
  const cache = await caches.open(CACHE);
  await cache.delete(streamPath(trackId));
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(trackId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

#!/usr/bin/env python3
"""
Spotify audio-features mood tagger for Raag.

Uses Spotify's audio analysis (energy, valence, danceability, acousticness)
to classify each song into: romantic / devotional / energetic / sad / happy / chill

Usage:
  python scripts/spotify_mood_lookup.py \
    --client-id CLIENT_ID --client-secret CLIENT_SECRET \
    --server http://192.168.4.43:8765
"""

import argparse
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

import requests

# ── Devotional keywords (Spotify has no "devotional" feature, use text) ───────
DEVOTIONAL_KEYWORDS = [
    "krishna", "rama", "shiva", "vishnu", "hanuman", "ganesha",
    "lakshmi", "devi", "bhakti", "prayer", "mantra",
    "sai", "venkata", "balaji", "tirupati", "saraswati", "durga",
    "jai", "namo", "swamy", "ayyappa", "subrahmanya",
    "ammoru", "venkateswara", "govinda", "narayana", "amba",
    "anjaneya", "mahakali", "kanakadurga", "suprabhatam",
    "bhajan", "aarti", "stotram", "keertana",
]

DEVOTIONAL_ARTIST_GENRES = {
    "devotional", "devotional & spiritual", "bhakti", "carnatic",
    "hindustani classical", "indian classical", "sufi",
}


def is_devotional_by_text(title: str, artist: str, album: str) -> bool:
    t = (title + " " + artist + " " + album).lower()
    hits = sum(1 for kw in DEVOTIONAL_KEYWORDS if kw in t)
    return hits >= 2


def clean_title(title: str) -> str:
    t = re.sub(r'\s*[-–:]\s*(www\.\S+|SenSongsMp3\S*|SenSongsPk\S*)', '', title, flags=re.IGNORECASE)
    t = re.sub(r'::\s*\S*\.Com', '', t, flags=re.IGNORECASE)
    t = re.sub(r'^\d+\s*[-–]\s*', '', t)
    t = re.sub(r'\(From "[^"]+"\)', '', t)
    t = re.sub(r'\(From \'[^\']+\'\)', '', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


# ── Spotify auth ───────────────────────────────────────────────────────────────

def get_token(client_id: str, client_secret: str) -> str:
    r = requests.post(
        "https://accounts.spotify.com/api/token",
        data={"grant_type": "client_credentials"},
        auth=(client_id, client_secret),
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["access_token"]


# ── Spotify search ─────────────────────────────────────────────────────────────

def search_track(session: requests.Session, title: str, artist: str) -> tuple[str, str] | None:
    """Return (track_id, artist_id) or None."""
    clean = clean_title(title)
    # Try title+artist first, then just title
    for query in [f"track:{clean} artist:{artist}", clean]:
        try:
            r = session.get(
                "https://api.spotify.com/v1/search",
                params={"q": query, "type": "track", "limit": 3, "market": "IN"},
                timeout=8,
            )
            if r.status_code == 429:
                time.sleep(float(r.headers.get("Retry-After", 5)))
                continue
            if r.status_code != 200:
                continue
            items = r.json().get("tracks", {}).get("items", [])
            if items:
                t = items[0]
                artist_id = t["artists"][0]["id"] if t.get("artists") else None
                return t["id"], artist_id
        except Exception:
            pass
    return None


def batch_audio_features(session: requests.Session, track_ids: list[str]) -> dict[str, dict]:
    """Fetch audio features for up to 100 tracks at once. Returns {track_id: features}."""
    result = {}
    for i in range(0, len(track_ids), 100):
        chunk = track_ids[i:i+100]
        try:
            r = session.get(
                "https://api.spotify.com/v1/audio-features",
                params={"ids": ",".join(chunk)},
                timeout=15,
            )
            if r.status_code == 429:
                time.sleep(float(r.headers.get("Retry-After", 5)))
                continue
            if r.status_code != 200:
                continue
            for feat in r.json().get("audio_features", []):
                if feat:
                    result[feat["id"]] = feat
        except Exception:
            pass
    return result


def get_artist_genres(session: requests.Session, artist_ids: list[str]) -> dict[str, set[str]]:
    """Fetch genres for up to 50 artists at once. Returns {artist_id: {genre,...}}."""
    result = {}
    for i in range(0, len(artist_ids), 50):
        chunk = artist_ids[i:i+50]
        try:
            r = session.get(
                "https://api.spotify.com/v1/artists",
                params={"ids": ",".join(chunk)},
                timeout=15,
            )
            if r.status_code != 200:
                continue
            for artist in r.json().get("artists", []):
                if artist:
                    result[artist["id"]] = {g.lower() for g in artist.get("genres", [])}
        except Exception:
            pass
    return result


# ── Mood from audio features ───────────────────────────────────────────────────

def features_to_mood(feat: dict, artist_genres: set[str], title: str, artist: str, album: str) -> str:
    energy = feat.get("energy", 0.5)
    valence = feat.get("valence", 0.5)
    danceability = feat.get("danceability", 0.5)
    acousticness = feat.get("acousticness", 0.5)
    instrumentalness = feat.get("instrumentalness", 0.0)
    tempo = feat.get("tempo", 100)

    # 1. Devotional: text keywords override everything
    if is_devotional_by_text(title, artist, album):
        return "devotional"
    if artist_genres & DEVOTIONAL_ARTIST_GENRES:
        return "devotional"

    # 2. Energetic: high energy + danceable
    if energy > 0.72 and danceability > 0.55:
        return "energetic"
    if danceability > 0.78 and tempo > 115:
        return "energetic"

    # 3. Sad: low valence, low energy
    if valence < 0.28 and energy < 0.50:
        return "sad"

    # 4. Happy: high valence, moderate+ energy
    if valence > 0.68 and energy > 0.42:
        return "happy"

    # 5. Chill: low energy, acoustic/instrumental
    if energy < 0.38 and (acousticness > 0.45 or instrumentalness > 0.25):
        return "chill"
    if energy < 0.30:
        return "chill"

    # 6. Romantic: everything else (typical Telugu film ballad)
    return "romantic"


# ── Main ───────────────────────────────────────────────────────────────────────

def fetch_tracks(server: str) -> list[dict]:
    all_tracks: list[dict] = []
    offset = 0
    while True:
        r = requests.get(
            f"{server}/api/library/tracks",
            params={"offset": offset, "limit": 200, "order": "title"},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        all_tracks.extend(data["items"])
        if len(all_tracks) >= data["total"]:
            break
        offset += 200
    return all_tracks


def upload_moods(server: str, mood_map: dict[int, str]) -> None:
    r = requests.put(
        f"{server}/api/ai/mood-tags",
        json={"moods": {str(k): v for k, v in mood_map.items()}},
        timeout=30,
    )
    r.raise_for_status()
    print(f"  Server: {r.json()}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--client-secret", required=True)
    parser.add_argument("--server", default="http://192.168.4.43:8765")
    parser.add_argument("--no-upload", action="store_true")
    parser.add_argument("--delay", type=float, default=0.15)
    args = parser.parse_args()

    print("Authenticating with Spotify...")
    token = get_token(args.client_id, args.client_secret)
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {token}"})
    print("  OK\n")

    print(f"Fetching tracks from {args.server}...")
    tracks = fetch_tracks(args.server)
    print(f"  -> {len(tracks)} tracks\n")

    # Phase 1: Search all tracks on Spotify
    print("Phase 1/3: Searching Spotify for each track...")
    track_spotify: dict[int, tuple[str, str]] = {}  # raag_id -> (spotify_id, artist_id)
    not_found = 0
    for i, t in enumerate(tracks):
        result = search_track(session, t.get("title", ""), t.get("artist", ""))
        if result:
            track_spotify[t["id"]] = result
        else:
            not_found += 1
        time.sleep(args.delay)
        if (i + 1) % 50 == 0 or i == len(tracks) - 1:
            print(f"  [{i+1}/{len(tracks)}] found:{len(track_spotify)} not_found:{not_found}")

    print(f"\n  Spotify match rate: {len(track_spotify)}/{len(tracks)} ({100*len(track_spotify)//len(tracks)}%)")

    # Phase 2: Batch audio features
    print("\nPhase 2/3: Fetching audio features (batched)...")
    spotify_ids = [sid for sid, _ in track_spotify.values()]
    audio_features = batch_audio_features(session, spotify_ids)
    print(f"  Got features for {len(audio_features)} tracks")

    # Phase 3: Batch artist genres
    print("\nPhase 3/3: Fetching artist genres (batched)...")
    artist_ids = list({aid for _, aid in track_spotify.values() if aid})
    artist_genres_map = get_artist_genres(session, artist_ids)
    print(f"  Got genres for {len(artist_genres_map)} artists\n")

    # Classify
    mood_map: dict[int, str] = {}
    spotify_classified = keyword_fallback = 0

    for t in tracks:
        title = t.get("title", "")
        artist = t.get("artist", "")
        album = t.get("album", "")
        track_id = t["id"]

        if track_id in track_spotify:
            spotify_id, artist_id = track_spotify[track_id]
            feat = audio_features.get(spotify_id)
            genres = artist_genres_map.get(artist_id, set()) if artist_id else set()
            if feat:
                mood = features_to_mood(feat, genres, title, artist, album)
                mood_map[track_id] = mood
                spotify_classified += 1
                continue

        # Fallback: devotional keyword or romantic
        if is_devotional_by_text(title, artist, album):
            mood_map[track_id] = "devotional"
        else:
            mood_map[track_id] = "romantic"
        keyword_fallback += 1

    dist = Counter(mood_map.values())
    print(f"Mood distribution: {dict(dist)}")
    print(f"  Spotify classified: {spotify_classified}")
    print(f"  Keyword fallback:  {keyword_fallback}")

    # Save results
    out = Path("mood_model/spotify_moods.json")
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({
        "moods": {str(k): v for k, v in mood_map.items()},
        "stats": {"spotify": spotify_classified, "fallback": keyword_fallback,
                  "match_rate": f"{len(track_spotify)}/{len(tracks)}"}
    }, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nSaved -> {out}")

    if not args.no_upload:
        print("\nUploading to server...")
        upload_moods(args.server, mood_map)
        print("Done! Retrain the classifier to learn from these improved labels:")
        print("  python scripts/train_mood_classifier.py --server", args.server)
    else:
        print("\n--no-upload set. Review mood_model/spotify_moods.json then re-run without it.")


if __name__ == "__main__":
    main()

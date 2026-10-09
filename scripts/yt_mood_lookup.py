#!/usr/bin/env python3
"""
yt-dlp YouTube metadata mood tagger for Raag.
Uses YouTube search to get tags/language for each song, then maps to mood.

Usage:
  python scripts/yt_mood_lookup.py --server http://192.168.4.43:8765
  python scripts/yt_mood_lookup.py --server http://192.168.4.43:8765 --workers 4
"""

import argparse
import json
import re
import subprocess
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

MOOD_TAG_KEYWORDS: dict[str, list[str]] = {
    # Strong devotional-specific phrases only (avoids false positives from names)
    "devotional": [
        "devotional songs", "devotional", "bhajan", "bhajans", "mantra",
        "prayer", "aarti", "stotram", "keertana", "bhakti", "spiritual songs",
        "hanuman songs", "krishna songs", "vishnu songs", "shiva songs",
        "suprabhatam", "anjaneya", "venkateswara songs", "govinda songs",
        "narayana songs", "temple songs", "god songs", "worship songs",
        "pooja songs", "sai baba", "ayyappa songs", "saraswati songs",
        "durga songs", "ganapathi songs", "tirupati songs",
    ],
    "energetic": [
        "dance songs", "dj", "remix", "party songs", "mass songs", "item songs",
        "power songs", "fight songs", "action songs", "beat songs",
        "energetic songs", "high energy", "gym songs", "workout songs",
        "folk dance", "folk songs", "item song", "mass", "mass telugu",
        "roar", "pakka local",
    ],
    "sad": [
        "sad songs", "heartbreak songs", "emotional songs", "love failure",
        "breakup songs", "sad telugu", "sorrow", "loss", "tragedy",
        "emotional telugu",
    ],
    "happy": [
        "happy songs", "fun songs", "comedy songs", "celebration songs",
        "festival songs", "wedding songs", "birthday songs",
        "kids songs", "children songs",
    ],
    "chill": [
        "melody songs", "soft songs", "slow songs", "acoustic songs",
        "lullaby", "soothing songs", "peaceful", "instrumental",
        "background music", "ambient", "night songs", "sleep songs",
    ],
    "romantic": [
        "love songs", "romantic songs", "lovers", "romance",
        "love telugu", "romantic telugu",
    ],
}

TITLE_KEYWORDS: dict[str, list[str]] = {
    "devotional": [
        "krishna", "rama", "shiva", "vishnu", "hanuman", "ganesha",
        "lakshmi", "devi", "sai", "venkata", "balaji", "tirupati",
        "saraswati", "durga", "jai", "swamy", "ayyappa", "suprabhatam",
        "anjaneya", "venkateswara", "govinda", "narayana", "ammoru",
        "mahakali", "kanakadurga", "bhajan", "aarti", "stotram",
    ],
    "energetic": [
        "mass", "power", "fight", "action", "dance", "beat", "item",
        "fire", "hero", "boss", "king", "rock", "boom", "thunder",
        "swag", "dhoom", "winner", "rowdy", "thug", "dj", "remix",
        "pakka", "roar", "akhanda",
    ],
    "sad": [
        "sad", "cry", "tears", "pain", "alone", "broken", "hurt",
        "miss", "gone", "poyindi", "vellipoyindi", "door", "yedhuta",
    ],
    "happy": [
        "happy", "joy", "fun", "enjoy", "smile", "laugh", "party",
        "celebrate", "festival", "wedding", "pelliki", "birthday",
    ],
    "chill": [
        "soft", "slow", "melody", "peaceful", "calm", "gentle",
        "night", "moon", "star", "sleep", "lullaby", "soothing",
    ],
}


def clean_title(title: str) -> str:
    t = re.sub(r'\s*[-–:]\s*(www\.\S+|SenSongsMp3\S*|SenSongsPk\S*)', '', title, flags=re.IGNORECASE)
    t = re.sub(r'::\s*\S*\.Com', '', t, flags=re.IGNORECASE)
    t = re.sub(r'^\d+\s*[-–]\s*', '', t)
    t = re.sub(r'\(From "[^"]+"\)', '', t)
    t = re.sub(r'\(From \'[^\']+\'\)', '', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def title_keyword_mood(title: str, artist: str, album: str) -> str | None:
    text = " " + (title + " " + artist + " " + album).lower() + " "
    # Use word-boundary matching to avoid "balakrishna" matching "krishna"
    def wm(kw: str) -> bool:
        return bool(re.search(r'(?<!\w)' + re.escape(kw) + r'(?!\w)', text))
    scores = {m: sum(1 for kw in kws if wm(kw)) for m, kws in TITLE_KEYWORDS.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else None


def tags_to_mood(tags: list[str], language: str | None) -> str | None:
    tags_text = " " + " ".join(t.lower() for t in (tags or [])) + " "

    scores: dict[str, int] = {}
    for mood, keywords in MOOD_TAG_KEYWORDS.items():
        scores[mood] = sum(1 for kw in keywords if kw in tags_text)

    # "devotional songs" or "bhajan" alone is decisive
    decisive = {"devotional songs", "bhajan", "bhajans", "stotram", "keertana", "suprabhatam", "pooja songs"}
    if any(kw in tags_text for kw in decisive):
        return "devotional"
    # For softer devotional keywords, require 2+ hits
    if scores.get("devotional", 0) >= 2:
        return "devotional"

    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else None


def yt_search_metadata(title: str, artist: str) -> dict | None:
    query = f"{clean_title(title)} {artist}"
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "-j",
        "--skip-download",
        "--no-playlist",
        "--quiet",
        "--no-warnings",
        f"ytsearch1:{query}",
    ]
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, encoding="utf-8",
            timeout=20, errors="replace",
        )
        if result.returncode == 0 and result.stdout.strip():
            data = json.loads(result.stdout.strip())
            return {
                "title": data.get("title"),
                "language": data.get("language"),
                "tags": data.get("tags") or [],
                "categories": data.get("categories") or [],
                "uploader": data.get("uploader"),
            }
    except (subprocess.TimeoutExpired, json.JSONDecodeError, Exception):
        pass
    return None


def classify_track(t: dict) -> tuple[int, str, str]:
    """Returns (track_id, mood, method)."""
    track_id = t["id"]
    title = t.get("title", "")
    artist = t.get("artist", "")
    album = t.get("album", "")

    meta = yt_search_metadata(title, artist)

    if meta:
        tags = meta.get("tags", [])
        language = meta.get("language")
        mood = tags_to_mood(tags, language)
        if mood:
            return track_id, mood, "yt"
        # If no tag mood, still try title keywords
        mood = title_keyword_mood(title, artist, album)
        if mood:
            return track_id, mood, "title"
        return track_id, "romantic", "default"
    else:
        mood = title_keyword_mood(title, artist, album)
        if mood:
            return track_id, mood, "title"
        return track_id, "romantic", "default"


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
    print(f"  Server response: {r.json()}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", default="http://192.168.4.43:8765")
    parser.add_argument("--workers", type=int, default=3,
                        help="Parallel yt-dlp workers (default 3)")
    parser.add_argument("--no-upload", action="store_true")
    parser.add_argument("--limit", type=int, default=0,
                        help="Only process first N tracks (for testing)")
    args = parser.parse_args()

    print(f"Fetching tracks from {args.server}...")
    tracks = fetch_tracks(args.server)
    if args.limit:
        tracks = tracks[:args.limit]
    print(f"  -> {len(tracks)} tracks\n")

    mood_map: dict[int, str] = {}
    yt_hit = title_hit = default_hit = 0
    total = len(tracks)

    print(f"Looking up moods via YouTube (yt-dlp) with {args.workers} workers...")
    print("This may take a few minutes...\n")

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(classify_track, t): t for t in tracks}
        done = 0
        for future in as_completed(futures):
            track_id, mood, method = future.result()
            mood_map[track_id] = mood
            if method == "yt":
                yt_hit += 1
            elif method == "title":
                title_hit += 1
            else:
                default_hit += 1
            done += 1
            if done % 25 == 0 or done == total:
                dist = Counter(mood_map.values())
                print(f"  [{done}/{total}] yt:{yt_hit} title:{title_hit} default:{default_hit} | {dict(dist)}")

    dist = Counter(mood_map.values())
    print(f"\nFinal mood distribution: {dict(dist)}")
    print(f"  YouTube tagged: {yt_hit}/{total} ({100*yt_hit//total}%)")
    print(f"  Title keyword:  {title_hit}")
    print(f"  Default:        {default_hit}")

    out = Path("mood_model/yt_moods.json")
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({
        "moods": {str(k): v for k, v in mood_map.items()},
        "stats": {"yt": yt_hit, "title": title_hit, "default": default_hit,
                  "total": total}
    }, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nSaved -> {out}")

    if not args.no_upload:
        print("\nUploading to server...")
        upload_moods(args.server, mood_map)
        print("Done! Retrain the classifier:")
        print("  python scripts/train_mood_classifier.py --server", args.server)
    else:
        print("\n--no-upload: inspect mood_model/yt_moods.json then re-run without it.")


if __name__ == "__main__":
    main()

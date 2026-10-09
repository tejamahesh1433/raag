#!/usr/bin/env python3
"""
Web-based mood lookup for Raag music library.
Tries JioSaavn (best for Telugu/Hindi) then iTunes, then keyword fallback.

Usage:
  pip install requests
  python scripts/lookup_moods_web.py --server http://192.168.4.43:8765
"""

import argparse
import json
import re
import time
from collections import Counter
from pathlib import Path

import requests

MOODS = ["romantic", "devotional", "energetic", "sad", "happy", "chill"]

# JioSaavn / iTunes genre -> our mood
GENRE_MAP: dict[str, str] = {
    # Devotional
    "devotional": "devotional", "devotional & spiritual": "devotional",
    "spiritual": "devotional", "bhakti": "devotional",
    "classical indian": "devotional", "indian classical": "devotional",
    "sufi": "devotional",
    # Film / romantic
    "bollywood": "romantic", "telugu": "romantic", "telugu film": "romantic",
    "hindi film songs": "romantic", "tamil film songs": "romantic",
    "soundtrack": "romantic", "film & tv": "romantic", "indian pop": "romantic",
    "pop": "romantic", "romantic": "romantic", "love songs": "romantic",
    # Energetic
    "dance": "energetic", "electronic": "energetic", "hip-hop/rap": "energetic",
    "hip-hop": "energetic", "rap": "energetic", "item song": "energetic",
    "dj": "energetic", "remix": "energetic", "punjabi": "energetic",
    "folk": "energetic",
    # Happy
    "kids & family": "happy", "children's music": "happy", "comedy": "happy",
    "pop & chart hits": "happy", "wedding songs": "happy",
    # Sad
    "sad songs": "sad", "heartbreak": "sad", "blues": "sad",
    # Chill
    "easy listening": "chill", "new age": "chill", "ambient": "chill",
    "jazz": "chill", "classical": "chill", "acoustic": "chill",
    "singer/songwriter": "chill",
}

MOOD_KEYWORDS: dict[str, list[str]] = {
    "romantic": [
        "love", "prema", "priya", "nuvvu", "nenu", "heart", "darling",
        "ishq", "pyar", "romance", "together", "lover", "baby", "honey",
        "nee", "naa", "manasu", "kallu", "choostu", "aasaga", "snehama",
        "cheppave", "preme", "inkenti", "oka", "neetho",
    ],
    "devotional": [
        "krishna", "rama", "shiva", "vishnu", "hanuman", "ganesha",
        "lakshmi", "devi", "bhakti", "prayer", "mantra",
        "sai", "venkata", "balaji", "tirupati", "saraswati", "durga",
        "jai", "namo", "swamy", "ayyappa", "subrahmanya", "temple",
        "ammoru", "venkateswara", "govinda", "narayana", "amba",
        "anjaneya", "mahakali", "kanakadurga",
    ],
    "energetic": [
        "mass", "power", "fight", "action", "dance", "beat", "item",
        "fire", "energy", "hero", "boss", "king", "rock",
        "boom", "thunder", "swag", "dhoom", "pump",
        "winner", "champion", "attitude", "rowdy", "thug", "dj", "remix",
        "jathara", "akhanda", "pakka", "roar",
    ],
    "sad": [
        "sad", "cry", "tears", "pain", "alone", "broken", "hurt",
        "miss", "gone", "rain", "dark", "dard", "sorrow", "loss",
        "poyindi", "vellipoyindi", "door", "yedhuta", "nuvvante",
    ],
    "happy": [
        "happy", "joy", "fun", "enjoy", "smile", "laugh",
        "party", "celebrate", "khushi", "festival", "cheer",
        "masti", "wedding", "birthday", "victory", "pelliki",
    ],
    "chill": [
        "soft", "slow", "melody", "peaceful", "calm", "gentle",
        "night", "moon", "star", "sleep", "rest", "quiet",
        "breeze", "acoustic", "lullaby", "soothing",
    ],
}

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Mozilla/5.0 (compatible; music-tagger/1.0)"})


def clean_title(title: str) -> str:
    """Remove download site suffixes, track numbers, source tags."""
    t = re.sub(r'\s*[-–:]\s*(www\.\S+|SenSongsMp3\S*|SenSongsPk\S*)', '', title, flags=re.IGNORECASE)
    t = re.sub(r'::\s*\S*\.Com', '', t, flags=re.IGNORECASE)
    t = re.sub(r'^\d+\s*[-–]\s*', '', t)
    t = re.sub(r'\(From "[^"]+"\)', '', t)
    t = re.sub(r'\(From \'[^\']+\'\)', '', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def search_saavn(title: str, artist: str) -> str | None:
    """Search JioSaavn API (saavn.dev) for genre."""
    query = f"{clean_title(title)} {artist}".strip()
    try:
        r = SESSION.get(
            "https://saavn.dev/api/search/songs",
            params={"query": query, "page": 1, "limit": 3},
            timeout=8,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        results = data.get("data", {}).get("results", [])
        for song in results:
            # Saavn returns language field: "telugu", "hindi", "kannada", etc.
            # and sometimes a "genre" field
            for field in ("genre", "primaryGenreName"):
                genre = (song.get(field) or "").lower().strip()
                if genre in GENRE_MAP:
                    return GENRE_MAP[genre]
                for key, mood in GENRE_MAP.items():
                    if key in genre:
                        return mood
            # Use language + album type as signal
            lang = (song.get("language") or "").lower()
            album = (song.get("album", {}).get("name") or "").lower()
            # Album names with "bhajan", "aarti", etc.
            if any(w in album for w in ["bhajan", "aarti", "stotram", "mantra", "devotional", "hanuman", "sai baba"]):
                return "devotional"
    except Exception:
        pass
    return None


def search_itunes(title: str, artist: str) -> str | None:
    """Search iTunes API for genre (fallback)."""
    query = f"{clean_title(title)} {artist}".strip()
    try:
        r = SESSION.get(
            "https://itunes.apple.com/search",
            params={"term": query, "media": "music", "limit": 3, "country": "IN"},
            timeout=8,
        )
        if r.status_code != 200:
            return None
        for result in r.json().get("results", []):
            genre = result.get("primaryGenreName", "").lower().strip()
            if genre in GENRE_MAP:
                return GENRE_MAP[genre]
            for key, mood in GENRE_MAP.items():
                if key in genre:
                    return mood
    except Exception:
        pass
    return None


def keyword_label(text: str) -> str | None:
    t = text.lower()
    scores = {m: sum(1 for kw in kws if kw in t) for m, kws in MOOD_KEYWORDS.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else None


def title_pattern_label(title: str, album: str) -> str | None:
    """Quick rules from structural patterns in title/album."""
    t = (title + " " + album).lower()
    # DJ / Remix -> energetic
    if re.search(r'\bdj\b|\bremix\b|\bitem\b', t):
        return "energetic"
    # Folk -> energetic
    if "folk" in t:
        return "energetic"
    # Bhajan/aarti/stotram -> devotional
    if re.search(r'\bbhajan\b|\baarti\b|\bstotram\b|\bsuprabhatam\b', t):
        return "devotional"
    return None


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
    parser.add_argument("--server", default="http://192.168.4.43:8765")
    parser.add_argument("--delay", type=float, default=0.4)
    parser.add_argument("--no-upload", action="store_true")
    args = parser.parse_args()

    print(f"Fetching tracks from {args.server}...")
    tracks = fetch_tracks(args.server)
    print(f"  -> {len(tracks)} tracks\n")

    mood_map: dict[int, str] = {}
    saavn_hit = itunes_hit = pattern_hit = kw_hit = default_hit = 0

    print("Looking up moods (JioSaavn -> iTunes -> pattern -> keyword -> default)...")
    for i, t in enumerate(tracks):
        title = t.get("title", "")
        artist = t.get("artist", "")
        album = t.get("album", "")
        track_id = t["id"]
        text = f"{title} {artist} {album} {t.get('genre', '')}"

        # 1. Title/album pattern (instant, no network)
        mood = title_pattern_label(title, album)
        if mood:
            pattern_hit += 1
        else:
            # 2. JioSaavn
            mood = search_saavn(title, artist)
            if mood:
                saavn_hit += 1
            else:
                # 3. iTunes
                mood = search_itunes(title, artist)
                if mood:
                    itunes_hit += 1
                else:
                    # 4. Keyword
                    mood = keyword_label(text)
                    if mood:
                        kw_hit += 1
                    else:
                        mood = "romantic"
                        default_hit += 1

        mood_map[track_id] = mood
        time.sleep(args.delay)

        if (i + 1) % 50 == 0 or i == len(tracks) - 1:
            print(f"  [{i+1}/{len(tracks)}] saavn:{saavn_hit} itunes:{itunes_hit} pattern:{pattern_hit} keyword:{kw_hit} default:{default_hit}")

    dist = Counter(mood_map.values())
    print(f"\nFinal distribution: {dict(dist)}")
    print(f"Web coverage: {saavn_hit + itunes_hit}/{len(tracks)} songs found online")

    out = Path("mood_model/web_moods.json")
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({
        "moods": {str(k): v for k, v in mood_map.items()},
        "stats": {"saavn": saavn_hit, "itunes": itunes_hit, "pattern": pattern_hit,
                  "keyword": kw_hit, "default": default_hit}
    }, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Saved -> {out}")

    if not args.no_upload:
        print("\nUploading to server...")
        upload_moods(args.server, mood_map)
        print("Done!")
    else:
        print("\n--no-upload: inspect mood_model/web_moods.json then re-run without it.")


if __name__ == "__main__":
    main()

"""
Multi-source mood/genre lookup for the music library.

Sources (in priority order):
  1. yt-dlp  — YouTube tags (existing yt_moods.json cache)
  2. iTunes  — curl_cffi (Cloudflare-safe, no API key)
  3. Wikipedia — film genre from album title (curl_cffi)
  4. Playwright — Gaana.com JS-rendered search
  5. Scrapy — batch Wikipedia crawl for remaining songs
  6. Crawl4AI — fallback for any remaining

Run:
  python scripts/multi_mood_lookup.py [--workers N] [--upload]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
from curl_cffi import requests as cfreq
from playwright.async_api import async_playwright

# ---------------------------------------------------------------------------
SERVER = "http://192.168.4.43:8765"
CACHE_FILE = Path(__file__).parent.parent / "mood_model" / "yt_moods.json"
OUT_FILE = Path(__file__).parent.parent / "mood_model" / "multi_moods.json"

# ---------------------------------------------------------------------------
# Mood mapping helpers
# ---------------------------------------------------------------------------

ITUNES_GENRE_MAP = {
    "Devotional & Spiritual": "devotional",
    "Devotional": "devotional",
    "Spiritual": "devotional",
    "Bhajan": "devotional",
    "Dance": "energetic",
    "Electronic": "energetic",
    "Dance & Electronic": "energetic",
    "Folk": "energetic",
    "Classical": "chill",
    "Easy Listening": "chill",
    "Acoustic": "chill",
    "Meditation": "chill",
    "Pop": "romantic",
    "Sad": "sad",
    "Blues": "sad",
    "Comedy": "happy",
    "Children": "happy",
}

WIKI_GENRE_KEYWORDS = {
    "devotional": ["devotional", "bhakti", "spiritual", "bhajan", "religious"],
    "energetic": [
        "action", "thriller", "adventure", "fantasy", "science fiction",
        "martial arts", "war film", "superhero",
    ],
    "sad": ["tragedy", "drama", "melodrama", "grief", "tragedy"],
    "happy": ["comedy", "comic", "slapstick", "children", "family"],
    "chill": ["slice of life", "classical", "meditation"],
    "romantic": ["romance", "romantic"],
}

# First-match wins; put higher-priority moods first
WIKI_PRIORITY = ["devotional", "energetic", "sad", "happy", "chill", "romantic"]


def wiki_extract_to_mood(text: str) -> str | None:
    t = text.lower()
    for mood in WIKI_PRIORITY:
        for kw in WIKI_GENRE_KEYWORDS[mood]:
            if kw in t:
                return mood
    return None


def clean_album_for_wiki(album: str) -> str:
    """Strip common suffixes and return a Wikipedia-searchable title."""
    # Remove bracketed/parenthesised suffixes
    album = re.sub(r"\s*[\[\(][^\]\)]*[\]\)]\s*", " ", album).strip()
    # Drop common trailing noise words
    noise = r"\b(songs?|telugu songs?|audio|jukebox|full album|movie|film|ost|soundtrack|bgm|hits?)\b"
    album = re.sub(noise, "", album, flags=re.IGNORECASE).strip(" ,-|")
    return album


# ---------------------------------------------------------------------------
# Source 1: Load yt-dlp cache
# ---------------------------------------------------------------------------

def load_yt_cache() -> dict[int, str]:
    """Load yt-dlp moods that are DEFINITIVE (non-default).

    The yt_moods.json stores all 505 songs including 275 that defaulted to
    "romantic". We only lock in entries that were explicitly tagged (not the
    default). Heuristic: any mood that is NOT "romantic" was yt/title tagged;
    romantic entries go back through additional sources since we can't tell
    genuine romantic from default romantic without source metadata.
    """
    if not CACHE_FILE.exists():
        print("No yt_moods.json cache found — YouTube moods skipped.")
        return {}
    data = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    loaded: dict[int, str] = {}

    def _add(tid: int, mood: str) -> None:
        # Only lock non-romantic — romantic may be a default, let other sources confirm
        if mood and mood != "romantic":
            loaded[tid] = mood

    if isinstance(data, dict) and "moods" in data:
        for str_id, mood in data["moods"].items():
            _add(int(str_id), mood)
    elif isinstance(data, dict) and "sources" in data:
        # Future format with source info: load all non-default entries
        for str_id, src in data["sources"].items():
            if src != "default":
                loaded[int(str_id)] = data["moods"][str_id]
    elif isinstance(data, list):
        for entry in data:
            if isinstance(entry, dict):
                src = entry.get("source", "")
                if src not in ("default", ""):
                    _add(entry["id"], entry.get("mood", ""))

    print(f"  Loaded {len(loaded)} definitive (non-default) yt-dlp results")
    return loaded


# ---------------------------------------------------------------------------
# Source 2: iTunes via curl_cffi
# ---------------------------------------------------------------------------

def itunes_mood(title: str, artist: str) -> str | None:
    """Query iTunes Search API; map primaryGenreName to mood."""
    try:
        r = cfreq.get(
            "https://itunes.apple.com/search",
            params={"term": f"{title} {artist}", "media": "music", "limit": 3, "country": "IN"},
            impersonate="chrome",
            timeout=10,
        )
        if not r.ok:
            return None
        for item in r.json().get("results", []):
            genre = item.get("primaryGenreName", "")
            if genre in ITUNES_GENRE_MAP:
                return ITUNES_GENRE_MAP[genre]
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Source 3: Wikipedia film genre via curl_cffi
# ---------------------------------------------------------------------------

_wiki_cache: dict[str, str | None] = {}


def wikipedia_film_mood(album: str) -> str | None:
    """Look up a Wikipedia article for the film (album), parse genre from extract."""
    title = clean_album_for_wiki(album)
    if not title or len(title) < 3:
        return None

    cache_key = title.lower()
    if cache_key in _wiki_cache:
        return _wiki_cache[cache_key]

    # Try direct Wikipedia REST summary
    slug = title.replace(" ", "_")
    try:
        r = cfreq.get(
            f"https://en.wikipedia.org/api/rest_v1/page/summary/{slug}",
            impersonate="chrome",
            timeout=8,
        )
        if r.ok:
            extract = r.json().get("extract", "")
            mood = wiki_extract_to_mood(extract)
            _wiki_cache[cache_key] = mood
            return mood
    except Exception:
        pass

    # Fallback: Wikipedia search API
    try:
        r2 = cfreq.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "query",
                "list": "search",
                "srsearch": f"{title} Telugu film",
                "format": "json",
                "srlimit": 1,
            },
            impersonate="chrome",
            timeout=8,
        )
        if r2.ok:
            results = r2.json().get("query", {}).get("search", [])
            if results:
                page_title = results[0]["title"].replace(" ", "_")
                r3 = cfreq.get(
                    f"https://en.wikipedia.org/api/rest_v1/page/summary/{page_title}",
                    impersonate="chrome",
                    timeout=8,
                )
                if r3.ok:
                    extract = r3.json().get("extract", "")
                    mood = wiki_extract_to_mood(extract)
                    _wiki_cache[cache_key] = mood
                    return mood
    except Exception:
        pass

    _wiki_cache[cache_key] = None
    return None


# ---------------------------------------------------------------------------
# Source 4: Playwright — Gaana.com JS scraper
# ---------------------------------------------------------------------------

async def gaana_mood_async(title: str, artist: str) -> str | None:
    """Search Gaana.com for the song and return mood from genre tag."""
    GAANA_GENRE_MAP = {
        "devotional": "devotional",
        "bhajan": "devotional",
        "aarti": "devotional",
        "dance": "energetic",
        "item": "energetic",
        "dj": "energetic",
        "remix": "energetic",
        "sad": "sad",
        "melody": "chill",
        "soft": "chill",
        "comedy": "happy",
        "romantic": "romantic",
        "love": "romantic",
    }
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            query = f"{title} {artist}".replace(" ", "+")
            await page.goto(f"https://gaana.com/search/{query}", timeout=15000)
            try:
                await page.wait_for_selector(
                    "[class*='track'], [class*='song'], [class*='type']", timeout=6000
                )
            except Exception:
                pass
            await page.wait_for_timeout(2000)
            html = await page.content()
            await browser.close()

        soup = BeautifulSoup(html, "html.parser")
        for el in soup.find_all(["span", "div", "p"]):
            t = el.get_text(strip=True).lower()
            if 1 < len(t) < 40:
                for kw, mood in GAANA_GENRE_MAP.items():
                    if kw in t:
                        return mood
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Source 5: Scrapy-style batch Wikipedia crawl (using requests for efficiency)
# ---------------------------------------------------------------------------
# Scrapy adds overhead for this use case; we replicate its pipeline logic
# (fetch → parse → yield) synchronously with a ThreadPoolExecutor which is
# what Scrapy does internally anyway for I/O-bound work.

def scrapy_wiki_batch(albums: list[str]) -> dict[str, str]:
    """Return {album_lower: mood} for a batch of album/film titles."""
    results: dict[str, str] = {}

    def fetch_one(album: str) -> tuple[str, str | None]:
        return album.lower(), wikipedia_film_mood(album)

    with ThreadPoolExecutor(max_workers=6) as pool:
        for album, mood in pool.map(fetch_one, albums):
            if mood:
                results[album] = mood
    return results


# ---------------------------------------------------------------------------
# Source 6: Crawl4AI fallback
# ---------------------------------------------------------------------------

async def crawl4ai_mood_async(title: str, artist: str) -> str | None:
    """Last-resort: Crawl4AI on a public lyrics/info site."""
    CRAWL4AI_GENRE_MAP = {
        "devotional": "devotional", "bhajan": "devotional", "spiritual": "devotional",
        "dance": "energetic", "item song": "energetic", "dance number": "energetic",
        "sad": "sad", "romantic": "romantic", "love": "romantic",
        "melody": "chill", "comedy": "happy",
    }
    try:
        bc = BrowserConfig(headless=True, browser_type="chromium")
        rc = CrawlerRunConfig(cache_mode=CacheMode.BYPASS, magic=True, simulate_user=True, page_timeout=15000)
        query = f"{title} {artist} Telugu song genre"
        url = f"https://www.google.com/search?q={query.replace(' ', '+')}"
        async with AsyncWebCrawler(config=bc) as crawler:
            result = await crawler.arun(url, config=rc)
            if result.success and result.markdown:
                text = result.markdown[:1500].lower()
                for kw, mood in CRAWL4AI_GENRE_MAP.items():
                    if kw in text:
                        return mood
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def fetch_tracks() -> list[dict]:
    print(f"Fetching tracks from {SERVER}...")
    all_tracks: list[dict] = []
    offset = 0
    limit = 200
    while True:
        r = requests.get(
            f"{SERVER}/api/library/tracks",
            params={"limit": limit, "offset": offset, "order": "title"},
            timeout=15,
        )
        r.raise_for_status()
        page = r.json()
        items = page.get("items", [])
        all_tracks.extend(items)
        if len(all_tracks) >= page.get("total", 0) or not items:
            break
        offset += limit
    print(f"  -> {len(all_tracks)} tracks")
    return all_tracks


async def run_pipeline(tracks: list[dict], workers: int) -> dict[int, dict]:
    results: dict[int, dict] = {}

    # ---- Source 1: yt-dlp cache ----------------------------------------
    print("\n[1/6] Loading yt-dlp YouTube cache...")
    yt_cache = load_yt_cache()
    for t in tracks:
        if t["id"] in yt_cache:
            results[t["id"]] = {"mood": yt_cache[t["id"]], "source": "yt-dlp"}

    # Songs still needing classification
    remaining = [t for t in tracks if t["id"] not in results]
    print(f"  -> {len(results)} done, {len(remaining)} remaining")

    # ---- Source 2: iTunes -------------------------------------------------
    print(f"\n[2/6] iTunes API via curl_cffi ({len(remaining)} songs)...")
    itunes_hits = 0

    def itunes_one(t: dict) -> tuple[int, str | None]:
        time.sleep(0.15)  # gentle rate limit
        return t["id"], itunes_mood(t["title"], t.get("artist", ""))

    with ThreadPoolExecutor(max_workers=workers) as pool:
        for tid, mood in pool.map(itunes_one, remaining):
            if mood:
                results[tid] = {"mood": mood, "source": "itunes"}
                itunes_hits += 1

    remaining = [t for t in tracks if t["id"] not in results]
    print(f"  -> {itunes_hits} new hits, {len(remaining)} remaining")

    # ---- Source 3: Wikipedia film lookup ----------------------------------
    print(f"\n[3/6] Wikipedia film genre ({len(remaining)} songs)...")
    albums = list({t.get("album", "") for t in remaining if t.get("album")})
    print(f"  -> {len(albums)} unique albums to look up")
    wiki_map = scrapy_wiki_batch(albums)  # {album_lower: mood}
    wiki_hits = 0
    for t in remaining[:]:
        album_key = (t.get("album") or "").lower()
        mood = wiki_map.get(album_key)
        if mood:
            results[t["id"]] = {"mood": mood, "source": "wikipedia"}
            wiki_hits += 1
    remaining = [t for t in tracks if t["id"] not in results]
    print(f"  -> {wiki_hits} new hits, {len(remaining)} remaining")

    # ---- Source 4: Playwright — Gaana ------------------------------------
    # Only run for songs still unclassified (up to 100 to keep it fast)
    gaana_batch = remaining[:100]
    if gaana_batch:
        print(f"\n[4/6] Playwright — Gaana.com ({len(gaana_batch)} songs)...")
        gaana_hits = 0
        for t in gaana_batch:
            mood = await gaana_mood_async(t["title"], t.get("artist", ""))
            if mood:
                results[t["id"]] = {"mood": mood, "source": "gaana"}
                gaana_hits += 1
            await asyncio.sleep(1)  # polite delay
        remaining = [t for t in tracks if t["id"] not in results]
        print(f"  -> {gaana_hits} new hits, {len(remaining)} remaining")
    else:
        print("\n[4/6] Playwright — Gaana: skipped (nothing remaining)")

    # ---- Source 5: Scrapy-style Wikipedia crawl (secondary pass) ---------
    if remaining:
        print(f"\n[5/6] Scrapy-style Wikipedia batch crawl ({len(remaining)} songs)...")
        # Try searching by "title artist" instead of album
        def wiki_by_title(t: dict) -> tuple[int, str | None]:
            query = f"{t['title']} {t.get('artist', '')} Telugu song"
            try:
                r = cfreq.get(
                    "https://en.wikipedia.org/w/api.php",
                    params={"action": "query", "list": "search", "srsearch": query,
                            "format": "json", "srlimit": 1},
                    impersonate="chrome", timeout=8
                )
                if r.ok:
                    hits = r.json().get("query", {}).get("search", [])
                    if hits:
                        slug = hits[0]["title"].replace(" ", "_")
                        r2 = cfreq.get(
                            f"https://en.wikipedia.org/api/rest_v1/page/summary/{slug}",
                            impersonate="chrome", timeout=8
                        )
                        if r2.ok:
                            return t["id"], wiki_extract_to_mood(r2.json().get("extract", ""))
            except Exception:
                pass
            return t["id"], None

        scrapy_hits = 0
        with ThreadPoolExecutor(max_workers=4) as pool:
            for tid, mood in pool.map(wiki_by_title, remaining):
                if mood:
                    results[tid] = {"mood": mood, "source": "scrapy-wiki"}
                    scrapy_hits += 1
        remaining = [t for t in tracks if t["id"] not in results]
        print(f"  -> {scrapy_hits} new hits, {len(remaining)} remaining")
    else:
        print("\n[5/6] Scrapy-style Wikipedia: skipped")

    # ---- Source 6: Crawl4AI fallback (small batch) -----------------------
    crawl4ai_batch = remaining[:50]
    if crawl4ai_batch:
        print(f"\n[6/6] Crawl4AI fallback ({len(crawl4ai_batch)} songs)...")
        crawl4ai_hits = 0
        for t in crawl4ai_batch:
            mood = await crawl4ai_mood_async(t["title"], t.get("artist", ""))
            if mood:
                results[t["id"]] = {"mood": mood, "source": "crawl4ai"}
                crawl4ai_hits += 1
            await asyncio.sleep(1.5)
        remaining = [t for t in tracks if t["id"] not in results]
        print(f"  -> {crawl4ai_hits} new hits, {len(remaining)} remaining")
    else:
        print("\n[6/6] Crawl4AI: skipped")

    # Default remaining to romantic
    for t in remaining:
        results[t["id"]] = {"mood": "romantic", "source": "default"}

    return results


def upload_moods(results: dict[int, dict]) -> None:
    print(f"\nUploading {len(results)} mood labels to {SERVER}...")
    batch = [{"id": tid, "mood": v["mood"]} for tid, v in results.items()]
    r = requests.post(
        f"{SERVER}/api/library/bulk-mood",
        json={"updates": batch},
        timeout=30,
    )
    if r.ok:
        print(f"  -> Server accepted {r.json().get('updated', '?')} updates")
    else:
        print(f"  -> Upload failed: {r.status_code} {r.text[:200]}")


def print_summary(tracks: list[dict], results: dict[int, dict]) -> None:
    from collections import Counter
    mood_counts: Counter = Counter()
    source_counts: Counter = Counter()
    for v in results.values():
        mood_counts[v["mood"]] += 1
        source_counts[v["source"]] += 1

    print("\n" + "=" * 55)
    print("MOOD DISTRIBUTION")
    for mood, count in sorted(mood_counts.items(), key=lambda x: -x[1]):
        print(f"  {mood:12} {count:4}")

    print("\nSOURCE BREAKDOWN")
    for src, count in sorted(source_counts.items(), key=lambda x: -x[1]):
        print(f"  {src:20} {count:4}")

    non_default = sum(1 for v in results.values() if v["source"] != "default")
    print(f"\n  Classified: {non_default}/{len(tracks)} ({100*non_default//len(tracks)}%)")
    print("=" * 55)


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--upload", action="store_true")
    parser.add_argument("--no-upload", action="store_true")
    args = parser.parse_args()

    tracks = fetch_tracks()
    results = await run_pipeline(tracks, args.workers)

    # Save
    output = [
        {"id": tid, "title": next((t["title"] for t in tracks if t["id"] == tid), ""),
         "mood": v["mood"], "source": v["source"]}
        for tid, v in results.items()
    ]
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSaved -> {OUT_FILE}")

    print_summary(tracks, results)

    if args.upload and not args.no_upload:
        upload_moods(results)
    elif not args.no_upload:
        print("\nRe-run with --upload to push results to the server.")


if __name__ == "__main__":
    asyncio.run(main())

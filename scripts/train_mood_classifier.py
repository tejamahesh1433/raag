#!/usr/bin/env python3
"""
Raag Mood Classifier
====================
Trains a mood/genre classifier on your music library using GPU-accelerated
sentence embeddings, then uploads mood tags to the server.

Steps:
  1. Fetch all tracks from server
  2. Auto-label using keyword rules (Telugu / Hindi / English)
  3. Embed with multilingual sentence-transformer on GPU
  4. Train + evaluate LogisticRegression classifier
  5. Run inference on every track
  6. Upload mood tags to server

Usage:
  pip install sentence-transformers scikit-learn torch requests
  python train_mood_classifier.py --server http://192.168.4.43:8765
"""

import argparse
import json
import pickle
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import requests
import torch
from sentence_transformers import SentenceTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.preprocessing import LabelEncoder

# ── Mood categories ────────────────────────────────────────────────────────────
MOODS = ["romantic", "devotional", "energetic", "sad", "happy", "chill"]

# Keywords for each mood (Telugu romanization + Hindi + English)
MOOD_KEYWORDS: dict[str, list[str]] = {
    "romantic": [
        "love", "prema", "priya", "nuvvu", "nenu", "heart", "darling",
        "sweetheart", "ishq", "pyar", "romance", "together", "forever",
        "kiss", "hug", "lover", "baby", "honey", "dear", "lovely",
        "nee", "naa", "manasu", "kallu", "choostu", "aasaga", "snehama",
    ],
    "devotional": [
        "krishna", "rama", "shiva", "vishnu", "hanuman", "ganesha",
        "lakshmi", "devi", "bhakti", "prayer", "god", "om", "mantra",
        "sai", "venkata", "balaji", "tirupati", "saraswati", "durga",
        "jai", "namo", "swamy", "ayyappa", "subrahmanya", "temple",
    ],
    "energetic": [
        "mass", "power", "fight", "action", "dance", "beat", "item",
        "fire", "energy", "hero", "boss", "king", "storm", "rock",
        "bang", "boom", "thunder", "wild", "swag", "dhoom", "pump",
        "winner", "champion", "attitude", "rowdy", "thug",
    ],
    "sad": [
        "sad", "cry", "tears", "pain", "alone", "broken", "hurt",
        "miss", "gone", "rain", "dark", "dard", "sorrow", "loss",
        "empty", "wish", "goodbye", "farewell", "heartbreak", "yearn",
        "nenu", "poyindi", "vellipoyindi", "door",
    ],
    "happy": [
        "happy", "joy", "fun", "enjoy", "smile", "laugh", "play",
        "party", "celebrate", "khushi", "festival", "cheer", "bright",
        "sunshine", "masti", "dance", "wedding", "birthday", "victory",
    ],
    "chill": [
        "soft", "slow", "melody", "peaceful", "calm", "gentle",
        "night", "moon", "star", "sleep", "rest", "quiet", "flow",
        "breeze", "acoustic", "lullaby", "soothing", "tender", "sweet",
    ],
}


def keyword_label(text: str) -> tuple[str, int]:
    """Return (best_mood, score). Score 0 means no match."""
    t = text.lower()
    scores = {m: sum(1 for kw in kws if kw in t) for m, kws in MOOD_KEYWORDS.items()}
    best = max(scores, key=scores.get)
    return best, scores[best]


def fetch_tracks(server: str) -> list[dict]:
    print("Fetching tracks from server…")
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
    print(f"  → {len(all_tracks)} tracks")
    return all_tracks


def track_text(t: dict) -> str:
    parts = [
        t.get("title") or "",
        t.get("artist_name") or "",
        t.get("album_title") or "",
        t.get("genre") or "",
    ]
    return " ".join(p for p in parts if p).strip()


def build_labels(tracks: list[dict]) -> tuple[list[str], list[str], list[int]]:
    """Return (texts, labels, track_ids)."""
    texts, labels, ids = [], [], []
    weak, weak_ids = [], []  # score-0 tracks need fallback

    for t in tracks:
        txt = track_text(t)
        mood, score = keyword_label(txt)
        texts.append(txt)
        ids.append(t["id"])
        if score > 0:
            labels.append(mood)
        else:
            labels.append("romantic")  # default — most Telugu songs are romantic
            weak.append(len(labels) - 1)

    dist = Counter(labels)
    print(f"  Keyword-labeled: {len(labels) - len(weak)} strong, {len(weak)} defaulted")
    print(f"  Distribution: {dict(dist)}")
    return texts, labels, ids


def embed(model: SentenceTransformer, texts: list[str], device: str) -> np.ndarray:
    print(f"  Embedding {len(texts)} texts on {device}…")
    return model.encode(
        texts,
        batch_size=128,
        show_progress_bar=True,
        device=device,
        convert_to_numpy=True,
    )


def train_classifier(
    X: np.ndarray, labels: list[str]
) -> tuple[LogisticRegression, LabelEncoder, float]:
    le = LabelEncoder()
    y = le.fit_transform(labels)

    clf = LogisticRegression(max_iter=1000, C=2.0, solver="lbfgs", multi_class="auto")

    # Cross-validate on available data
    n_splits = min(5, Counter(labels).most_common()[-1][1])  # at most as many folds as rarest class
    if n_splits >= 2:
        scores = cross_val_score(clf, X, y, cv=StratifiedKFold(n_splits=n_splits), scoring="accuracy")
        print(f"  CV accuracy: {scores.mean():.2%} ± {scores.std():.2%}")
    else:
        print("  Too few samples per class for CV, training on full set")

    clf.fit(X, y)
    return clf, le, float(scores.mean()) if n_splits >= 2 else 0.0


def predict_all(
    clf: LogisticRegression,
    le: LabelEncoder,
    X: np.ndarray,
    track_ids: list[int],
) -> dict[int, str]:
    preds = le.inverse_transform(clf.predict(X))
    return dict(zip(track_ids, preds))


def upload_moods(server: str, mood_map: dict[int, str]) -> None:
    print(f"Uploading {len(mood_map)} mood tags to server…")
    r = requests.put(
        f"{server}/api/ai/mood-tags",
        json={"moods": {str(k): v for k, v in mood_map.items()}},
        timeout=30,
    )
    r.raise_for_status()
    print(f"  Server response: {r.json()}")


def save_model(
    clf: LogisticRegression,
    le: LabelEncoder,
    embedding_model_name: str,
    output_dir: Path,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    with open(output_dir / "classifier.pkl", "wb") as f:
        pickle.dump({"classifier": clf, "label_encoder": le}, f)
    (output_dir / "config.json").write_text(
        json.dumps({"embedding_model": embedding_model_name, "moods": MOODS}, indent=2)
    )
    print(f"  Model saved → {output_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Raag mood classifier")
    parser.add_argument("--server", default="http://192.168.4.43:8765", help="Server URL")
    parser.add_argument("--output", default="mood_model", help="Output directory")
    parser.add_argument("--no-upload", action="store_true", help="Skip uploading to server")
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")
    if device == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    # 1. Fetch data
    tracks = fetch_tracks(args.server)
    if not tracks:
        sys.exit("No tracks found — is the server running?")

    # 2. Build training labels from keywords
    print("\nBuilding labels…")
    texts, labels, track_ids = build_labels(tracks)

    # 3. Load multilingual embedding model (handles Telugu/Hindi/English)
    model_name = "paraphrase-multilingual-MiniLM-L12-v2"
    print(f"\nLoading embedding model ({model_name})…")
    emb_model = SentenceTransformer(model_name, device=device)

    # 4. Generate embeddings (GPU-accelerated)
    print("\nGenerating embeddings…")
    X = embed(emb_model, texts, device)

    # 5. Train classifier
    print("\nTraining classifier…")
    clf, le, cv_acc = train_classifier(X, labels)
    print(f"  Classes: {list(le.classes_)}")

    # 6. Predict mood for every track
    print("\nPredicting moods for all tracks…")
    mood_map = predict_all(clf, le, X, track_ids)
    dist = Counter(mood_map.values())
    print(f"  Mood distribution: {dict(dist)}")

    # 7. Save model
    print("\nSaving model…")
    save_model(clf, le, model_name, Path(args.output))

    # 8. Upload to server
    if not args.no_upload:
        print()
        upload_moods(args.server, mood_map)

    print("\n✓ Done!")
    print(f"  Model: {args.output}/")
    print(f"  Songs tagged: {len(mood_map)}")


if __name__ == "__main__":
    main()

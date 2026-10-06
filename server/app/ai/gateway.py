"""OpenAI-compatible chat client — works with Ollama, LM Studio, or any
OpenAI-compatible local endpoint. Free/local only: no cloud calls, ever.

Provider is configured at runtime through the `ai` settings row:
    {"provider": "ollama"|"lm-studio"|"custom", "base_url": "...",
     "chat_model": "...", "embed_model": "...", "tag_model": "..."}
"""
from __future__ import annotations

import json
from typing import Any, Iterator

import httpx

from .. import config

DEFAULT_URLS = {
    "ollama": "http://127.0.0.1:11434/v1",
    "lm-studio": "http://127.0.0.1:1234/v1",
}

_CONNECT_TIMEOUT = 5.0
_READ_TIMEOUT = 180.0  # local CPU inference can be slow


class ProviderUnavailable(Exception):
    """The local AI provider could not be reached or returned an error."""


def resolve_base_url(ai_cfg: dict) -> str:
    custom = str(ai_cfg.get("base_url") or "").strip().rstrip("/")
    if custom:
        return custom
    provider = str(ai_cfg.get("provider") or "ollama")
    return DEFAULT_URLS.get(provider, DEFAULT_URLS["ollama"])


def resolve_model(ai_cfg: dict, task: str = "chat") -> str:
    key = {"chat": "chat_model", "embed": "embed_model", "tag": "tag_model"}.get(task, "chat_model")
    model = str(ai_cfg.get(key) or "").strip()
    if model:
        return model
    defaults = {
        "chat": config.AI_CHAT_MODEL,
        "embed": config.AI_EMBED_MODEL,
        "tag": config.AI_TAG_MODEL or config.AI_CHAT_MODEL,
    }
    return defaults.get(task, config.AI_CHAT_MODEL)


def _timeout() -> httpx.Timeout:
    return httpx.Timeout(
        connect=_CONNECT_TIMEOUT, read=_READ_TIMEOUT, write=30.0, pool=_CONNECT_TIMEOUT
    )


def check_reachable(ai_cfg: dict, timeout: float = 2.0) -> bool:
    """GET {base}/models — the standard OpenAI-compatible discovery endpoint."""
    url = f"{resolve_base_url(ai_cfg)}/models"
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(url)
            return resp.status_code == 200
    except httpx.HTTPError:
        return False


def list_models(ai_cfg: dict, timeout: float = 2.0) -> list[str]:
    url = f"{resolve_base_url(ai_cfg)}/models"
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(url)
            if resp.status_code != 200:
                return []
            return [m.get("id", "") for m in resp.json().get("data", []) if m.get("id")]
    except (httpx.HTTPError, ValueError):
        return []


def _payload(ai_cfg: dict, messages: list[dict], tools: list[dict] | None, stream: bool) -> dict:
    body: dict[str, Any] = {
        "model": resolve_model(ai_cfg),
        "messages": messages,
        "stream": stream,
        "temperature": 0.4,
    }
    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"
    return body


def chat_once(
    ai_cfg: dict,
    messages: list[dict],
    tools: list[dict] | None = None,
) -> dict:
    """Single non-streaming completion. Returns the provider JSON response.

    Raises ProviderUnavailable on connection problems or non-200 responses.
    """
    url = f"{resolve_base_url(ai_cfg)}/chat/completions"
    try:
        with httpx.Client(timeout=_timeout()) as client:
            resp = client.post(url, json=_payload(ai_cfg, messages, tools, stream=False))
    except httpx.HTTPError as exc:
        raise ProviderUnavailable(f"Cannot reach AI provider: {exc}") from exc
    if resp.status_code != 200:
        raise ProviderUnavailable(
            f"AI provider returned HTTP {resp.status_code}: {resp.text[:200]}"
        )
    try:
        return resp.json()
    except ValueError as exc:
        raise ProviderUnavailable("AI provider returned invalid JSON") from exc


def chat_stream(
    ai_cfg: dict,
    messages: list[dict],
    tools: list[dict] | None = None,
) -> Iterator[dict]:
    """Streaming completion. Yields raw provider chunks (OpenAI delta shape)."""
    url = f"{resolve_base_url(ai_cfg)}/chat/completions"
    try:
        with httpx.Client(timeout=_timeout()) as client:
            with client.stream(
                "POST", url, json=_payload(ai_cfg, messages, tools, stream=True)
            ) as resp:
                if resp.status_code != 200:
                    body = resp.read().decode("utf-8", "replace")[:200]
                    raise ProviderUnavailable(
                        f"AI provider returned HTTP {resp.status_code}: {body}"
                    )
                for line in resp.iter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[len("data:"):].strip()
                    if data == "[DONE]":
                        return
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    yield chunk
    except ProviderUnavailable:
        raise
    except httpx.HTTPError as exc:
        raise ProviderUnavailable(f"AI stream failed: {exc}") from exc


def extract_text(response: dict) -> str:
    """Pull assistant content out of a non-streaming response."""
    try:
        return response["choices"][0]["message"].get("content") or ""
    except (KeyError, IndexError, TypeError):
        return ""


def extract_tool_calls(response: dict) -> list[dict]:
    """Pull tool_calls out of a non-streaming response (normalized)."""
    try:
        message = response["choices"][0]["message"]
    except (KeyError, IndexError, TypeError):
        return []
    calls = message.get("tool_calls") or []
    normalized = []
    for call in calls:
        fn = call.get("function") or {}
        raw_args = fn.get("arguments") or "{}"
        try:
            args = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args)
        except json.JSONDecodeError:
            args = {}
        normalized.append(
            {
                "id": call.get("id") or fn.get("name") or "call",
                "name": fn.get("name") or "",
                "arguments": args,
            }
        )
    return [c for c in normalized if c["name"]]


def embed(ai_cfg: dict, texts: list[str]) -> list[list[float]]:
    """Embed texts via the OpenAI-compatible /embeddings endpoint.

    Tries a batched request first; some servers only support single inputs,
    so on a mismatched reply length it falls back to one request per text.
    Raises ProviderUnavailable on any failure.
    """
    if not texts:
        return []
    url = f"{resolve_base_url(ai_cfg)}/embeddings"
    model = resolve_model(ai_cfg, "embed")

    def _call(payload_input) -> list[list[float]]:
        try:
            with httpx.Client(
                timeout=httpx.Timeout(
                    connect=_CONNECT_TIMEOUT, read=120.0, write=30.0, pool=_CONNECT_TIMEOUT
                )
            ) as client:
                resp = client.post(url, json={"model": model, "input": payload_input})
        except httpx.HTTPError as exc:
            raise ProviderUnavailable(f"Cannot reach embeddings endpoint: {exc}") from exc
        if resp.status_code != 200:
            raise ProviderUnavailable(
                f"Embeddings endpoint HTTP {resp.status_code}: {resp.text[:200]}"
            )
        try:
            data = sorted(resp.json()["data"], key=lambda d: d.get("index", 0))
            return [list(map(float, row["embedding"])) for row in data]
        except (ValueError, KeyError, TypeError) as exc:
            raise ProviderUnavailable(f"Bad embeddings response: {exc}") from exc

    if len(texts) == 1:
        return _call(texts[0])

    vectors = _call(texts)
    if len(vectors) == len(texts):
        return vectors
    # Fallback: servers that ignore array input — one request per text.
    return [_call(t)[0] for t in texts]

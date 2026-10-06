"""Programmable fake OpenAI-compatible provider — the AI provider seam.

Tests script provider behavior step-by-step via `fake.script` (list of dicts):
    {"kind": "text", "text": "..."}                     -> plain assistant answer
    {"kind": "tool_call", "name": "...", "arguments": {}} -> tool_calls response
    {"kind": "error"}                                   -> HTTP 500
Every request body is recorded in `fake.requests` for assertions.
"""
from __future__ import annotations

import json
import socket
import threading
import time

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse


class FakeProvider:
    def __init__(self) -> None:
        self.script: list[dict] = []
        self.requests: list[dict] = []
        self.port: int | None = None
        self._server: uvicorn.Server | None = None
        self._thread: threading.Thread | None = None
        self.app = self._build_app()

    # -- lifecycle -----------------------------------------------------------
    def start(self) -> None:
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        self.port = sock.getsockname()[1]
        sock.close()
        config = uvicorn.Config(
            self.app, host="127.0.0.1", port=self.port, log_level="warning"
        )
        self._server = uvicorn.Server(config)
        self._thread = threading.Thread(target=self._server.run, daemon=True)
        self._thread.start()
        deadline = time.time() + 10
        while not self._server.started and time.time() < deadline:
            time.sleep(0.05)
        if not self._server.started:  # pragma: no cover
            raise RuntimeError("fake provider failed to start")

    def stop(self) -> None:
        if self._server is not None:
            self._server.should_exit = True
        if self._thread is not None:
            self._thread.join(timeout=5)

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}/v1"

    # -- app -----------------------------------------------------------------
    def _build_app(self) -> FastAPI:
        app = FastAPI()
        fake = self

        @app.get("/v1/models")
        def models():
            return {"data": [{"id": "fake-model"}]}

        @app.post("/v1/chat/completions")
        async def completions(request: Request):
            body = await request.json()
            fake.requests.append(body)
            step = (
                fake.script.pop(0)
                if fake.script
                else {"kind": "text", "text": "fallback answer"}
            )
            stream = bool(body.get("stream"))
            kind = step.get("kind")

            if kind == "error":
                return JSONResponse({"error": {"message": "boom"}}, status_code=500)

            if kind == "tool_call":
                message = {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": step.get("id", "call_1"),
                            "type": "function",
                            "function": {
                                "name": step["name"],
                                "arguments": json.dumps(step.get("arguments", {})),
                            },
                        }
                    ],
                }
                if stream:
                    chunks = [
                        {"choices": [{"delta": message, "finish_reason": None}]},
                        {"choices": [{"delta": {}, "finish_reason": "tool_calls"}]},
                    ]
                    payload = "".join(
                        f"data: {json.dumps(c)}\n\n" for c in chunks
                    ) + "data: [DONE]\n\n"
                    return StreamingResponse(
                        iter([payload]), media_type="text/event-stream"
                    )
                return {
                    "choices": [{"message": message, "finish_reason": "tool_calls"}]
                }

            # kind == "text"
            text = str(step.get("text", ""))
            if not stream:
                return {
                    "choices": [
                        {
                            "message": {"role": "assistant", "content": text},
                            "finish_reason": "stop",
                        }
                    ]
                }

            def gen():
                for word in text.split(" "):
                    chunk = {
                        "choices": [
                            {"delta": {"content": word + " "}, "finish_reason": None}
                        ]
                    }
                    yield f"data: {json.dumps(chunk)}\n\n"
                yield (
                    'data: {"choices": [{"delta": {}, "finish_reason": "stop"}]}\n\n'
                )
                yield "data: [DONE]\n\n"

            return StreamingResponse(gen(), media_type="text/event-stream")

        @app.post("/v1/embeddings")
        async def embeddings(request: Request):
            body = await request.json()
            fake.requests.append({"kind": "embeddings", **body})
            raw = body.get("input", "")
            texts = raw if isinstance(raw, list) else [raw]
            data = []
            for i, text in enumerate(texts):
                # Deterministic tiny vectors from character codes — good enough for tests.
                seed = sum(ord(c) for c in str(text)) or 1
                vec = [((seed * (j + 1)) % 97) / 97.0 for j in range(8)]
                data.append({"index": i, "embedding": vec})
            return {"data": data}

        return app

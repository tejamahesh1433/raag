"""WebSocket party sync — remote control + listen-together."""
from __future__ import annotations

import asyncio
import json
import secrets
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["sync"])


@dataclass
class PartyClient:
    ws: WebSocket
    name: str
    is_host: bool = False


@dataclass
class Party:
    code: str
    host_id: str
    clients: dict[str, PartyClient] = field(default_factory=dict)
    state: dict[str, Any] = field(default_factory=dict)
    updated_at: float = field(default_factory=time.time)


_parties: dict[str, Party] = {}
_lock = asyncio.Lock()


def _new_code() -> str:
    # Short join code, avoid ambiguous chars
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(6))


async def _broadcast(party: Party, payload: dict, *, skip: str | None = None) -> None:
    dead: list[str] = []
    raw = json.dumps(payload)
    for cid, client in party.clients.items():
        if skip and cid == skip:
            continue
        try:
            await client.ws.send_text(raw)
        except Exception:
            dead.append(cid)
    for cid in dead:
        party.clients.pop(cid, None)


@router.websocket("/api/ws/party")
async def party_ws(websocket: WebSocket):
    await websocket.accept()
    client_id = secrets.token_hex(8)
    name = "Listener"
    party: Party | None = None
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "error", "detail": "bad_json"}))
                continue
            mtype = msg.get("type")

            if mtype == "create":
                name = str(msg.get("name") or "Host")[:40]
                async with _lock:
                    code = _new_code()
                    while code in _parties:
                        code = _new_code()
                    party = Party(code=code, host_id=client_id)
                    party.clients[client_id] = PartyClient(ws=websocket, name=name, is_host=True)
                    _parties[code] = party
                await websocket.send_text(
                    json.dumps({"type": "created", "code": code, "client_id": client_id, "role": "host"})
                )

            elif mtype == "join":
                code = str(msg.get("code") or "").upper().strip()
                name = str(msg.get("name") or "Listener")[:40]
                async with _lock:
                    party = _parties.get(code)
                    if party is None:
                        await websocket.send_text(json.dumps({"type": "error", "detail": "not_found"}))
                        continue
                    party.clients[client_id] = PartyClient(ws=websocket, name=name, is_host=False)
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "joined",
                            "code": code,
                            "client_id": client_id,
                            "role": "listener",
                            "state": party.state,
                            "members": [
                                {"id": cid, "name": c.name, "host": c.is_host}
                                for cid, c in party.clients.items()
                            ],
                        }
                    )
                )
                await _broadcast(
                    party,
                    {
                        "type": "member",
                        "event": "join",
                        "members": [
                            {"id": cid, "name": c.name, "host": c.is_host}
                            for cid, c in party.clients.items()
                        ],
                    },
                    skip=client_id,
                )

            elif mtype == "state":
                if party is None or client_id != party.host_id:
                    continue
                party.state = msg.get("state") if isinstance(msg.get("state"), dict) else {}
                party.updated_at = time.time()
                await _broadcast(
                    party,
                    {"type": "state", "state": party.state, "from": client_id},
                    skip=client_id,
                )

            elif mtype == "cmd":
                if party is None:
                    continue
                # Remotes send commands to host; host may also echo
                await _broadcast(
                    party,
                    {
                        "type": "cmd",
                        "cmd": msg.get("cmd"),
                        "payload": msg.get("payload") or {},
                        "from": client_id,
                        "from_name": name,
                    },
                    skip=client_id,
                )

            elif mtype == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

    except WebSocketDisconnect:
        pass
    finally:
        if party is not None:
            async with _lock:
                party.clients.pop(client_id, None)
                if not party.clients:
                    _parties.pop(party.code, None)
                else:
                    if client_id == party.host_id:
                        # Promote first remaining client
                        new_host = next(iter(party.clients))
                        party.host_id = new_host
                        party.clients[new_host].is_host = True
                    await _broadcast(
                        party,
                        {
                            "type": "member",
                            "event": "leave",
                            "members": [
                                {"id": cid, "name": c.name, "host": c.is_host}
                                for cid, c in party.clients.items()
                            ],
                        },
                    )

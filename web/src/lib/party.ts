/** Listen-together / remote-control WebSocket client. */

export type PartyRole = "host" | "listener" | null;

export interface PartyState {
  trackId: number | null;
  title?: string;
  artist?: string;
  playing: boolean;
  position: number;
  queueIds?: number[];
  index?: number;
}

export interface PartyMember {
  id: string;
  name: string;
  host: boolean;
}

type Handler = (msg: Record<string, unknown>) => void;

let ws: WebSocket | null = null;
let handlers: Handler[] = [];
let role: PartyRole = null;
let code: string | null = null;
let clientId: string | null = null;

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws/party`;
}

function emit(msg: Record<string, unknown>) {
  for (const h of handlers) h(msg);
}

export function onPartyMessage(handler: Handler): () => void {
  handlers.push(handler);
  return () => {
    handlers = handlers.filter((h) => h !== handler);
  };
}

export function getPartyMeta() {
  return { role, code, clientId, connected: Boolean(ws && ws.readyState === WebSocket.OPEN) };
}

export function connectParty(): Promise<void> {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    ws = new WebSocket(wsUrl());
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("WebSocket failed"));
    ws.onclose = () => {
      ws = null;
      role = null;
      emit({ type: "closed" });
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
        if (msg.type === "created" || msg.type === "joined") {
          role = msg.role === "host" ? "host" : "listener";
          code = String(msg.code || "");
          clientId = String(msg.client_id || "");
        }
        emit(msg);
      } catch {
        /* ignore */
      }
    };
  });
}

function send(payload: Record<string, unknown>) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

export async function createParty(name: string): Promise<string> {
  await connectParty();
  return new Promise((resolve, reject) => {
    const off = onPartyMessage((msg) => {
      if (msg.type === "created") {
        off();
        resolve(String(msg.code));
      } else if (msg.type === "error") {
        off();
        reject(new Error(String(msg.detail || "create failed")));
      }
    });
    send({ type: "create", name });
  });
}

export async function joinParty(joinCode: string, name: string): Promise<void> {
  await connectParty();
  return new Promise((resolve, reject) => {
    const off = onPartyMessage((msg) => {
      if (msg.type === "joined") {
        off();
        resolve();
      } else if (msg.type === "error") {
        off();
        reject(new Error(String(msg.detail || "join failed")));
      }
    });
    send({ type: "join", code: joinCode, name });
  });
}

export function publishState(state: PartyState) {
  if (role !== "host") return;
  send({ type: "state", state });
}

export function sendCommand(cmd: string, payload: Record<string, unknown> = {}) {
  send({ type: "cmd", cmd, payload });
}

export function leaveParty() {
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  ws = null;
  role = null;
  code = null;
  clientId = null;
}

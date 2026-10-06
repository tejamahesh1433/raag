import { describe, expect, it } from "vitest";
import { createSSEParser, type SSEEvent } from "./sse";

describe("createSSEParser", () => {
  it("parses complete events", () => {
    const events: SSEEvent[] = [];
    const p = createSSEParser((e) => events.push(e));
    p.push('event: token\ndata: {"text":"hi"}\n\nevent: done\ndata: {"message_id":1}\n\n');
    expect(events).toEqual([
      { event: "token", data: { text: "hi" } },
      { event: "done", data: { message_id: 1 } },
    ]);
  });

  it("handles events split across chunks", () => {
    const events: SSEEvent[] = [];
    const p = createSSEParser((e) => events.push(e));
    p.push('event: to');
    p.push('ken\ndata: {"te');
    p.push('xt":"par"}\n');
    p.push('\nevent: done\ndata: {}\n\n');
    expect(events).toEqual([
      { event: "token", data: { text: "par" } },
      { event: "done", data: {} },
    ]);
  });

  it("defaults event name to message and ignores malformed JSON", () => {
    const events: SSEEvent[] = [];
    const p = createSSEParser((e) => events.push(e));
    p.push("data: not-json\n\n");
    p.push("data: {\"ok\":true}\n\n");
    expect(events).toEqual([{ event: "message", data: { ok: true } }]);
  });

  it("flush delivers a trailing unterminated frame", () => {
    const events: SSEEvent[] = [];
    const p = createSSEParser((e) => events.push(e));
    p.push('event: error\ndata: {"detail":"x"}');
    expect(events).toHaveLength(0);
    p.flush();
    expect(events).toEqual([{ event: "error", data: { detail: "x" } }]);
  });
});

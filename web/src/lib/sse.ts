/** Minimal SSE (text/event-stream) parser for fetch-based streaming. */

export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

/**
 * Incremental parser: feed decoded string chunks; complete events are
 * delivered via the callback as soon as their terminating blank line arrives.
 * Handles events split arbitrarily across network chunks.
 */
export function createSSEParser(onEvent: (ev: SSEEvent) => void) {
  let buffer = "";

  const processBlock = (block: string) => {
    if (!block.trim()) return;
    let event = "message";
    let dataStr = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
    }
    if (!dataStr) return;
    try {
      onEvent({ event, data: JSON.parse(dataStr) as Record<string, unknown> });
    } catch {
      /* ignore malformed frames */
    }
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        processBlock(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 2);
      }
    },
    flush() {
      if (buffer.trim()) {
        processBlock(buffer);
        buffer = "";
      }
    },
  };
}

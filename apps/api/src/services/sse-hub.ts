import type { LoopRun, LoopTraceEvent } from "@shirtai/shared";

export type LoopSseMessage =
  | { type: "snapshot"; loop: LoopRun }
  | { type: "trace"; event: LoopTraceEvent }
  | { type: "progress"; status: string; progress: number; message: string }
  | { type: "update"; loop: LoopRun };

type Listener = (msg: LoopSseMessage) => void;

class SseHub {
  private readonly listeners = new Map<string, Set<Listener>>();

  subscribe(loopId: string, listener: Listener): () => void {
    let set = this.listeners.get(loopId);
    if (!set) {
      set = new Set();
      this.listeners.set(loopId, set);
    }
    set.add(listener);
    return () => {
      const current = this.listeners.get(loopId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(loopId);
      }
    };
  }

  publish(loopId: string, msg: LoopSseMessage): void {
    const set = this.listeners.get(loopId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(msg);
      } catch {
        // Ignore broken client subscribers
      }
    }
  }
}

export const sseHub = new SseHub();

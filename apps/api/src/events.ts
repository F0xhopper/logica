import type { MapEvent } from "@logica/schema";

type Listener = (event: MapEvent) => void;

function isTerminal(event: MapEvent): boolean {
  return event.type === "done" || event.type === "error";
}

/**
 * Per-map event buffer. Every event is kept so a subscriber that connects mid-run (or
 * reconnects) gets the full history in order before live events (packages/schema api.ts).
 * Closes after `done` or `error`; later emits are ignored.
 */
export class MapEventHub {
  private readonly history: MapEvent[] = [];
  private readonly listeners = new Set<Listener>();
  private closedFlag = false;

  constructor(private readonly onClose?: () => void) {}

  get closed(): boolean {
    return this.closedFlag;
  }

  emit(event: MapEvent): void {
    if (this.closedFlag) return;
    this.history.push(event);
    for (const listener of this.listeners) listener(event);
    if (isTerminal(event)) {
      this.closedFlag = true;
      this.listeners.clear();
      this.onClose?.();
    }
  }

  /** Replays history synchronously, then forwards live events. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    for (const event of this.history) listener(event);
    if (!this.closedFlag) this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Async view of `subscribe` that ends after the terminal event or when `signal` aborts. */
  async *events(signal?: AbortSignal): AsyncGenerator<MapEvent> {
    const queue: MapEvent[] = [];
    let wake: (() => void) | null = null;
    const notify = () => {
      wake?.();
      wake = null;
    };
    const unsubscribe = this.subscribe((event) => {
      queue.push(event);
      notify();
    });
    signal?.addEventListener("abort", notify, { once: true });
    try {
      while (!signal?.aborted) {
        const event = queue.shift();
        if (event) {
          yield event;
          if (isTerminal(event)) return;
          continue;
        }
        await new Promise<void>((resolve) => (wake = resolve));
      }
    } finally {
      unsubscribe();
      signal?.removeEventListener("abort", notify);
    }
  }
}

/** Live hubs by map id. A hub is dropped once it closes; from then on the store is the source of truth. */
export class HubRegistry {
  private readonly hubs = new Map<string, MapEventHub>();

  open(id: string): MapEventHub {
    const hub = new MapEventHub(() => this.hubs.delete(id));
    this.hubs.set(id, hub);
    return hub;
  }

  get(id: string): MapEventHub | undefined {
    return this.hubs.get(id);
  }
}

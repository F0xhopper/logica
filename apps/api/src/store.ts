import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ArgMap } from "@logica/schema";

/**
 * Persistence for maps. Deliberately narrow (whole-document get/put) so a Postgres JSONB
 * store (PLAN.md §4) can replace the file store without touching the pipeline or routes.
 */
export interface MapStore {
  get(id: string): Promise<ArgMap | null>;
  put(map: ArgMap): Promise<void>;
}

/** Ids come from the URL, so anything outside this alphabet is treated as not found (no path traversal). */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isSafeId(id: string): boolean {
  return SAFE_ID.test(id);
}

/** One JSON file per map. Writes go to a temp file and are renamed into place so a crash never leaves half a document. */
export class FileMapStore implements MapStore {
  private ready: Promise<unknown> | null = null;

  constructor(private readonly dir: string) {}

  async get(id: string): Promise<ArgMap | null> {
    if (!isSafeId(id)) return null;
    let raw: string;
    try {
      raw = await readFile(this.path(id), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    return ArgMap.parse(JSON.parse(raw));
  }

  async put(map: ArgMap): Promise<void> {
    if (!isSafeId(map.id)) throw new Error(`Unsafe map id: ${map.id}`);
    this.ready ??= mkdir(this.dir, { recursive: true }).catch((err: unknown) => {
      this.ready = null;
      throw err;
    });
    await this.ready;
    const tmp = join(this.dir, `.${map.id}.${randomUUID()}.tmp`);
    await writeFile(tmp, JSON.stringify(map), "utf8");
    await rename(tmp, this.path(map.id));
  }

  private path(id: string): string {
    return join(this.dir, `${id}.json`);
  }
}

/** For tests. Stores copies so callers can't mutate stored state by accident. */
export class MemoryMapStore implements MapStore {
  private readonly maps = new Map<string, ArgMap>();

  async get(id: string): Promise<ArgMap | null> {
    const map = this.maps.get(id);
    return map ? structuredClone(map) : null;
  }

  async put(map: ArgMap): Promise<void> {
    this.maps.set(map.id, structuredClone(map));
  }
}

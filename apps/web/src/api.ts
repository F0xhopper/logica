import { ApiError, ArgMap, CreateMapResponse } from "@logica/schema";

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const parsed = ApiError.safeParse(await res.json());
    if (parsed.success) return parsed.data.error;
  } catch {
    // Non-JSON body (e.g. proxy error page); use the fallback.
  }
  return fallback;
}

export async function createMap(text: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/maps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    throw new Error("Couldn't reach the server. Try again in a moment.");
  }
  if (!res.ok) throw new Error(await errorMessage(res, `Something went wrong (${res.status}).`));
  return CreateMapResponse.parse(await res.json()).id;
}

export type GetMapResult = { kind: "found"; map: ArgMap } | { kind: "not_found" };

export async function getMap(id: string, signal?: AbortSignal): Promise<GetMapResult> {
  let res: Response;
  try {
    res = await fetch(`/api/maps/${encodeURIComponent(id)}`, { signal: signal ?? null });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error("Couldn't reach the server.");
  }
  if (res.status === 404) return { kind: "not_found" };
  if (!res.ok) throw new Error(await errorMessage(res, `Something went wrong (${res.status}).`));
  const parsed = ArgMap.safeParse(await res.json());
  if (!parsed.success) throw new Error("The server sent a map this page can't read.");
  return { kind: "found", map: parsed.data };
}

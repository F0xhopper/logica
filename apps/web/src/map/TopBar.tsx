import { STAGE_LABEL, titleFrom } from "@logica/schema";
import { Link } from "react-router";
import type { StreamState } from "./streamReducer.ts";

function Status({ state, onReplay }: { state: StreamState; onReplay: () => void }) {
  if (state.status === "error") return <span className="text-grey-4">Couldn't map this</span>;
  if (state.status === "done") {
    if (state.nodes.length === 0) return null;
    return (
      <button type="button" onClick={onReplay} className="rounded text-grey-4 underline underline-offset-2 hover:text-fg">
        Replay
      </button>
    );
  }
  if (state.status !== "loading" && state.status !== "streaming") return null;
  return (
    <span className="inline-flex items-center gap-2 text-grey-4" role="status">
      {state.stage && `${STAGE_LABEL[state.stage]}…`}
      <span aria-hidden="true" className="size-1.5 animate-pulse-dot rounded-full bg-fg" />
    </span>
  );
}

export function TopBar({ state, onReplay }: { state: StreamState; onReplay: () => void }) {
  const source = state.map?.source;
  const title = source ? source.title || titleFrom(source.text) : "";

  return (
    <header className="grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,3fr)_minmax(0,1fr)] items-center gap-4 border-b border-grey-2 bg-bg px-4">
      <Link to="/" className="justify-self-start rounded text-fg hover:underline">
        ← New
      </Link>
      <h1 className="truncate text-center font-serif text-[14px] font-normal text-grey-4" title={title}>
        {title}
      </h1>
      <div className="justify-self-end truncate text-[13px]">
        <Status state={state} onReplay={onReplay} />
      </div>
    </header>
  );
}

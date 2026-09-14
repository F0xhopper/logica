import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { Canvas } from "../map/Canvas.tsx";
import { QuotePanel } from "../map/QuotePanel.tsx";
import { TopBar } from "../map/TopBar.tsx";
import { useMapStream } from "../map/useMapStream.ts";
import { NotFound } from "./NotFound.tsx";

export function MapRoute() {
  const { id = "" } = useParams();
  return <MapScreen key={id} id={id} />;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="pointer-events-none absolute inset-x-0 top-6 z-[5] mx-auto w-fit max-w-[90%] bg-bg px-2 text-center text-[13px] text-grey-4">
      {children}
    </p>
  );
}

export function MapScreen({ id }: { id: string }) {
  const { state, replay } = useMapStream(id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Remounting the canvas on replay resets its layout, measurements and auto-fit.
  const [run, setRun] = useState(0);

  const onReplay = () => {
    setSelectedId(null);
    setRun((r) => r + 1);
    replay();
  };
  const selected = state.nodes.find((n) => n.id === selectedId) ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (state.status === "not_found") return <NotFound />;

  return (
    <div className="flex h-dvh flex-col">
      <TopBar state={state} onReplay={onReplay} />
      <main className="relative min-h-0 flex-1">
        <Canvas key={run} nodes={state.nodes} edges={state.edges} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
        {state.status === "error" && state.error && <Notice>{state.error}</Notice>}
        {state.status === "done" && state.nodes.length === 0 && <Notice>No argument found in this text.</Notice>}
      </main>
      {selected && <QuotePanel node={selected} sourceText={state.map?.source.text} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

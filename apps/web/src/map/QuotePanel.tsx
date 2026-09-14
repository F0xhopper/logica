import type { ArgNode } from "@logica/schema";
import { anchorLabel, displayQuote, kindLabel, modalityLabel } from "./labels.ts";

interface QuotePanelProps {
  node: ArgNode;
  /** The pasted source, used to show the exact span the anchor points at. */
  sourceText?: string;
  onClose: () => void;
}

/** DESIGN §7. Right-hand panel on wide screens, bottom sheet at 60% height below 640px. */
export function QuotePanel({ node, sourceText, onClose }: QuotePanelProps) {
  const anchor = anchorLabel(node);
  const modality = modalityLabel(node);
  const quote = displayQuote(node, sourceText);

  return (
    <aside
      aria-label="Quote"
      className="fixed inset-x-0 bottom-0 z-10 h-[60%] overflow-y-auto border-t border-grey-2 bg-bg p-5 sm:top-12 sm:left-auto sm:h-auto sm:w-[360px] sm:border-t-0 sm:border-l"
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <h2 className="pt-1 text-[11px] leading-[16px] font-normal tracking-[0.06em] text-grey-4 uppercase">
          {kindLabel(node)}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mt-1 -mr-2 rounded px-2 text-[20px] leading-[28px] text-grey-4 hover:text-fg"
        >
          ×
        </button>
      </div>

      <div className="mb-5">
        <p className={`text-[14px] leading-[1.4] text-fg ${node.assertedBy === "reported" ? "italic" : ""}`}>
          {node.text}
        </p>
        {modality && <p className="mt-1 font-mono text-[12px] text-grey-4">{modality}</p>}
      </div>

      {!node.explicit ? (
        <p className="mb-4 text-[13px] text-grey-4">Reconstructed by Logica — not in the source.</p>
      ) : quote ? (
        <>
          <blockquote className="mb-3 border-l-2 border-grey-4 pl-3 font-serif text-[15px] leading-[1.4] text-fg">
            {quote}
          </blockquote>
          {node.quoteVerified === false && (
            <p className="mb-3 text-[12px] text-grey-4">This quote couldn't be found in the source.</p>
          )}
        </>
      ) : null}

      {anchor && <p className="font-mono text-[12px] text-grey-4">{anchor}</p>}
    </aside>
  );
}

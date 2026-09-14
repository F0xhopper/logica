import type { ArgNode } from "@logica/schema";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { anchorLabel, kindLabel } from "./labels.ts";
import { NODE_WIDTH } from "./layout.ts";

export type ArgFlowNode = Node<{ node: ArgNode; selected: boolean }, "arg">;

/** DESIGN §5 encodings as class lists. Border widths are compensated in padding so every card has 12px of inner space. */
function cardClasses(node: ArgNode): string {
  const dashed = node.explicit ? "border-solid" : "border-dashed";
  switch (node.kind) {
    case "main_conclusion":
      return `bg-fg text-bg border p-[11px] ${node.explicit ? "border-fg" : "border-dashed border-grey-3"}`;
    case "intermediate_conclusion":
      return `bg-bg text-fg border-2 border-fg p-[10px] hover:bg-grey-1 ${dashed}`;
    case "background":
      return `bg-grey-1 text-grey-3 border p-[11px] ${node.explicit ? "border-grey-2" : "border-dashed border-grey-3"}`;
    default:
      return `bg-bg text-fg border p-[11px] hover:bg-grey-1 ${node.explicit ? "border-grey-2" : "border-dashed border-grey-3"}`;
  }
}

function ArgNodeCardImpl({ data }: NodeProps<ArgFlowNode>) {
  const { node, selected } = data;
  const inverted = node.kind === "main_conclusion";
  // grey-4 labels vanish on the inverted card; grey-3 is the closest token with contrast there.
  const meta = inverted ? "text-grey-3" : "text-grey-4";
  const anchor = anchorLabel(node);

  return (
    <div
      className={`animate-fade-in rounded cursor-pointer ${cardClasses(node)} ${
        selected ? "outline-2 outline-offset-2 outline-fg" : ""
      }`}
      style={{ width: NODE_WIDTH }}
    >
      {/* Edges run from supporter (below) up to what it supports, so sources leave the top. */}
      <Handle type="target" position={Position.Bottom} isConnectable={false} />
      <Handle type="source" position={Position.Top} isConnectable={false} />

      <div className={`mb-1 flex items-baseline justify-between gap-2 text-[11px] leading-[16px] tracking-[0.06em] ${meta}`}>
        <span className="truncate uppercase">{kindLabel(node)}</span>
        <span className="shrink-0 whitespace-nowrap">
          {node.quoteVerified === false && (
            <span className="mr-1.5 border-b border-dotted border-current" title="Quote not found in the source">
              unverified
            </span>
          )}
          {anchor}
        </span>
      </div>
      <p className={`line-clamp-4 text-[13px] leading-[1.4] ${node.assertedBy === "reported" ? "italic" : ""}`}>
        {node.text}
      </p>
    </div>
  );
}

export const ArgNodeCard = memo(ArgNodeCardImpl);

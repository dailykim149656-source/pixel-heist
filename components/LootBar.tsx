"use client";

import type { LootItem } from "@/lib/loot";
import { MAX_LOOT } from "@/lib/stage";

type Props = {
  loot: LootItem[];
  placedIds: Set<string>;
  selected: string | null;
  draggingId: string | null;
  onPointerDown: (id: string, e: React.PointerEvent) => void;
  onDiscard: (id: string) => void;
  disabled: boolean;
};

export function LootBar({ loot, placedIds, selected, draggingId, onPointerDown, onDiscard, disabled }: Props) {
  return (
    <footer className="lootbar">
      <span className="loot-title">
        My Loot <span className="muted">({loot.length}/{MAX_LOOT})</span>
      </span>
      <div className="slots">
        {Array.from({ length: MAX_LOOT }, (_, i) => {
          const item = loot[i];
          if (!item) return <div key={i} className="slot empty">+</div>;
          const cls = ["slot", selected === item.id && "selected", placedIds.has(item.id) && "placed", draggingId === item.id && "dragging"].filter(Boolean).join(" ");
          return (
            <div key={item.id} className={cls}>
              <button
                className="slot-grab"
                onPointerDown={(e) => onPointerDown(item.id, e)}
                disabled={disabled}
                title={placedIds.has(item.id) ? "Placed — drag it in the sketch to move it" : "Drag into the sketch"}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.thumbUrl} alt={`Loot ${i + 1}, ${item.shape.metrics.lengthPx}×${item.shape.metrics.thicknessPx}px`} draggable={false} />
              </button>
              <span className={item.origin === "LIVE_API" ? "slot-origin live" : "slot-origin"}>{item.origin === "LIVE_API" ? "LIVE" : "REC"}</span>
              <button className="slot-x" onClick={() => onDiscard(item.id)} aria-label="Discard" disabled={disabled}>×</button>
            </div>
          );
        })}
      </div>
      <span className="loot-tip muted">Extract objects from a photo and drag them into the sketch.</span>
    </footer>
  );
}

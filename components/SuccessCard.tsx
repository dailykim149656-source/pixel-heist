"use client";

import type { LootItem } from "@/lib/loot";
import type { Stage } from "@/lib/stages";

type Props = {
  seconds: number;
  extractions: number;
  used: LootItem[];
  stageName: string;
  nextStage: Stage | null;
  onNext: () => void;
  /** Set after the final stage: the ending comic. */
  onEnding: (() => void) | null;
  onRetry: () => void;
  onNewPhoto: () => void;
};

export function SuccessCard({ seconds, extractions, used, stageName, nextStage, onNext, onEnding, onRetry, onNewPhoto }: Props) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0"), ss = String(seconds % 60).padStart(2, "0");
  return (
    <div className="success-backdrop" role="dialog" aria-label="Escape success">
      <div className="success-card">
        <h2 className="success-title">ESCAPE SUCCESS!</h2>
        <p className="success-sub">{stageName} cleared. You stole reality and beat the sketch!</p>
        <div className="success-stats">
          <div>
            <span className="muted">Objects used</span>
            <div className="used">
              {used.map((u) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={u.id} src={u.thumbUrl} alt="" />
              ))}
            </div>
          </div>
          <div>
            <span className="muted">Total extractions</span> <strong className="hl">{extractions}</strong>
          </div>
          <div>
            <span className="muted">Time</span> <strong className="hl">{mm}:{ss}</strong>
          </div>
        </div>
        <div className="row">
          {nextStage && (
            <button className="btn btn-primary" onClick={onNext}>
              Next: {nextStage.name} →
            </button>
          )}
          {onEnding && (
            <button className="btn btn-primary" onClick={onEnding}>
              Watch the ending ▶
            </button>
          )}
          <button className="btn" onClick={onRetry}>Retry ↺</button>
          <button className="btn btn-pick" onClick={onNewPhoto}>Try your own photo</button>
        </div>
      </div>
    </div>
  );
}

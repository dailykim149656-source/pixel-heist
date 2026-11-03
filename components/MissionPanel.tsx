"use client";

import type { GameState } from "@/lib/heist";
import type { Judgement } from "@/lib/judge";
import { CAMERA } from "@/lib/stage";
import type { Inference } from "./Game";

type Props = {
  missions: { cameraBlocked: boolean; gapBridged: boolean; vaultReached: boolean };
  settled: Judgement;
  gameState: GameState;
  failure: string | null;
  hasLoot: boolean;
  hasPhoto: boolean;
  inference: Inference;
  photoKind: "sample" | "upload" | null;
};

export function MissionPanel({ missions, settled, gameState, failure, hasLoot, hasPhoto, inference, photoKind }: Props) {
  const hint = !hasPhoto
    ? "Load a photo, then click an object to steal it."
    : !hasLoot
      ? "Click an object in the photo, then Extract it."
      : !missions.cameraBlocked
        ? "Anything that crosses the red rays blocks the view."
        : !missions.gapBridged
          ? "Needs one unbroken span across both ledges — and thin enough to slip between the lasers."
          : "All set. Run the heist!";

  return (
    <aside className="panel mission">
      <h2 className="panel-title">Mission</h2>
      <ul className="checklist">
        <Check done={missions.cameraBlocked} label="Block the camera" detail={`${settled.camera.blockedCount}/${CAMERA.rayCount} rays blocked (need ${CAMERA.blockedNeeded})`} />
        <Check
          done={missions.gapBridged}
          label="Bridge the gap"
          detail={settled.gap.tripsLaser ? "Trips the lasers" : `Span ${settled.gap.span}/${settled.gap.spanNeeded}px`}
        />
        <Check done={missions.vaultReached} label="Reach the vault" />
      </ul>

      {failure && (
        <div className="notice notice-error" role="alert">
          <strong>{gameState === "CAUGHT" ? "Caught!" : "Fell!"}</strong> {failure}
          <p className="fineprint">Your loot stays put. Adjust it and try again.</p>
        </div>
      )}
      {!failure && settled.gap.reason && settled.gap.span > 0 && <p className="why">{settled.gap.reason}</p>}

      <div className="hint-note">
        <span className="hint-label">Hint</span>
        <p>{hint}</p>
      </div>

      <div className="api-status">
        <span className="muted">Sam (Meta SAM 3.1)</span>
        {inference === "LIVE_API" ? (
          <span className="badge badge-live">● Live — real API calls</span>
        ) : (
          <span className="badge badge-sample">◌ Recorded cuts — replayed</span>
        )}
        {photoKind === "sample" && <span className="fineprint">Sample desk is AI-generated</span>}
      </div>
    </aside>
  );
}

function Check({ done, label, detail }: { done: boolean; label: string; detail?: string }) {
  return (
    <li className={done ? "done" : ""}>
      <span className="box" aria-hidden>{done ? "✓" : ""}</span>
      <span>
        {label}
        {detail && <small>{detail}</small>}
      </span>
    </li>
  );
}

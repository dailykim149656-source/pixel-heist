"use client";

import type { GameState } from "@/lib/heist";
import { missionList, type Judgement, type Mission } from "@/lib/judge";
import type { Stage } from "@/lib/stages";
import type { Inference } from "./Game";
import { ROUTE_NAME, type Route } from "@/lib/routes";

type Props = {
  stage: Stage;
  missions: Mission[];
  vaultReached: boolean;
  settled: Judgement;
  boxJudged: Judgement | null;
  gameState: GameState;
  failure: string | null;
  hasLoot: boolean;
  hasPhoto: boolean;
  inference: Inference;
  photoKind: "sample" | "upload" | null;
  routes: { all: Route[]; found: Route[] };
};

const FAIL_TITLE: Partial<Record<GameState, string>> = { CAUGHT: "Caught!", FELL: "Fell!", STUCK: "Stuck!" };

export function MissionPanel({ stage, missions, vaultReached, settled, boxJudged, gameState, failure, hasLoot, hasPhoto, inference, photoKind, routes }: Props) {
  const next = missions.find((m) => !m.done);
  const hint = !hasPhoto
    ? "Load a photo, then click an object to steal it."
    : !hasLoot
      ? "Click an object in the photo, then Extract it."
      : next
        ? next.hint
        : "All set. Run the heist!";
  const gapReasons = settled.gaps.filter((g) => g.reason && (g.span > 0 || g.tripsLaser)).map((g) => g.reason!);

  return (
    <aside className="panel mission">
      <h2 className="panel-title">Mission</h2>
      <p className="stage-teaser">
        <b>Stage {stage.id}</b> · {stage.teaser}
      </p>
      <ul className="checklist">
        {missions.map((m) => (
          <Check key={m.id} done={m.done} label={m.label} detail={m.detail} />
        ))}
        <Check done={vaultReached} label="Reach the vault" />
      </ul>

      {routes.all.length > 0 && (
        <div className="routes" aria-label="Ways across found">
          <span className="routes-title">
            Ways across found <b>{routes.found.length}/{routes.all.length}</b>
          </span>
          <ul>
            {routes.all.map((r) => (
              <li key={r} className={routes.found.includes(r) ? "found" : ""}>
                {routes.found.includes(r) ? `✓ ${ROUTE_NAME[r]}` : "? ? ?"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {boxJudged && <XrayVerdict mask={missions} box={missionList(stage, boxJudged)} />}

      {failure && (
        <div className="notice notice-error" role="alert">
          <strong>{FAIL_TITLE[gameState] ?? "Stopped!"}</strong> {failure}
          <p className="fineprint">Your loot stays put. Adjust it and try again.</p>
        </div>
      )}
      {!failure && gapReasons.map((r) => (
        <p key={r} className="why">{r}</p>
      ))}

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
        {photoKind === "sample" && <span className="fineprint">Sample desks are AI-generated</span>}
      </div>
    </aside>
  );
}

const SHORT_LABEL: Record<string, string> = {
  "Block the camera": "Camera",
  "Bridge the gap": "Gap",
  "Weigh down the plate": "Plate",
  "Hang something on the hook": "Hook",
  "Keep the beam clear": "Beam",
  "Cross the gap": "Gap",
};

function XrayVerdict({ mask, box }: { mask: Mission[]; box: Mission[] }) {
  return (
    <div className="xray-card">
      <span className="xray-title">X-ray · same placement</span>
      <table>
        <thead>
          <tr><th /><th>SAM mask</th><th>Box only</th></tr>
        </thead>
        <tbody>
          {mask.map((m, i) => (
            <tr key={m.id}>
              <th>{SHORT_LABEL[m.label] ?? m.label}</th>
              <td>{m.done ? "✓" : "✗"} <small>{m.detail}</small></td>
              <td className={box[i].done !== m.done ? "diff" : ""}>{box[i].done ? "✓" : "✗"} <small>{box[i].detail}</small></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fineprint">Without a mask, every cut-out is just its bounding box: no thin bars, no holes.</p>
    </div>
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

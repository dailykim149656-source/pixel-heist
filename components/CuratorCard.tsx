"use client";

import type { Stage } from "@/lib/stages";

/** Progress of a Curator's Challenge: what Muse designed and what the engine ruled, step by step. */
export type CuratorState = {
  status: "designing" | "checking" | "ready" | "error";
  log: { who: "muse" | "engine"; text: string }[];
  room?: Stage;
  title?: string;
  line?: string;
};

export function CuratorCard({ state, onEnter, onClose }: { state: CuratorState; onEnter: () => void; onClose: () => void }) {
  const busy = state.status === "designing" || state.status === "checking";
  return (
    <div className="success-backdrop" role="dialog" aria-label="The Curator's Challenge">
      <div className="curator-card">
        <div className="muse-head">
          <span className="muse-avatar curator-avatar" aria-hidden>♜</span>
          <span>
            <b>The Curator&apos;s Challenge</b>
            <small>Room design: AI model · Meta Muse Spark (version in the log) · Fairness: the game engine</small>
          </span>
        </div>
        <ol className="curator-log">
          {state.log.map((l, i) => (
            <li key={i} className={`from-${l.who}`}>{l.text}</li>
          ))}
          {busy && (
            <li className="typing-dots" aria-label="Working">
              <span /><span /><span />
            </li>
          )}
        </ol>
        {state.status === "ready" && (
          <>
            <h2 className="curator-title">{state.title}</h2>
            {state.line && <p className="curator-line">“{state.line}”</p>}
          </>
        )}
        <div className="row">
          {state.status === "ready" && (
            <button className="btn btn-primary" onClick={onEnter} autoFocus>
              Enter the room ▶
            </button>
          )}
          <button className="btn" onClick={onClose} disabled={busy}>
            {state.status === "ready" ? "Not now" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}

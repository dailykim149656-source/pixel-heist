"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { drawPanel, PANEL } from "@/lib/comic";
import type { ComicPanel } from "@/lib/comic-scripts";

/** A pencil comic page that reveals one panel at a time (prologue and ending). */

const AUTO_MS = 4200;

type Props = { title: string; panels: ComicPanel[]; onDone: () => void; onSkip: () => void; doneLabel: string; ending?: boolean };

export function Comic({ title, panels: PANELS, onDone, onSkip, doneLabel, ending }: Props) {
  const [shown, setShown] = useState(1);
  const [auto, setAuto] = useState(true);
  const last = shown >= PANELS.length;
  const next = useCallback(() => setShown((n) => Math.min(PANELS.length, n + 1)), []);

  useEffect(() => {
    if (!auto || last) return;
    const id = setTimeout(next, AUTO_MS);
    return () => clearTimeout(id);
  }, [auto, last, shown, next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
      else if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (last) onDone();
        else {
          setAuto(false);
          next();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last, next, onDone, onSkip]);

  return (
    <main className={`prologue${ending ? " is-ending" : ""}`} aria-label={title}>
      <header className="prologue-head">
        <span className="logo">PIXEL HEIST</span>
        <span className="prologue-title">{title}</span>
        <button className="btn btn-small prologue-skip" onClick={onSkip}>Skip ⏭</button>
      </header>
      <ol className="comic">
        {PANELS.map((p, i) => (
          <li key={i} className={`comic-panel${i < shown ? " on" : ""}${i === shown - 1 ? " current" : ""}`} aria-hidden={i >= shown}>
            {i < shown && <PanelView panel={p} seed={i + 3} />}
          </li>
        ))}
      </ol>
      <footer className="prologue-foot">
        <span className="muted prologue-count">{shown} / {PANELS.length}</span>
        {last ? (
          <button className="btn btn-primary btn-big" onClick={onDone} autoFocus>{doneLabel}</button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => {
              setAuto(false);
              next();
            }}
          >
            Next ▸
          </button>
        )}
      </footer>
    </main>
  );
}

function PanelView({ panel, seed }: { panel: ComicPanel; seed: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current!;
    const paint = () => {
      const w = Math.round(c.clientWidth * devicePixelRatio);
      if (w === 0) return;
      c.width = w;
      c.height = Math.round((w * PANEL.height) / PANEL.width);
      drawPanel(c, panel.draw, seed);
    };
    const ro = new ResizeObserver(paint);
    ro.observe(c);
    paint();
    return () => ro.disconnect();
  }, [panel, seed]);

  return (
    <figure className="panel-figure">
      <canvas ref={canvas} aria-hidden />
      {panel.caption && <figcaption className="comic-caption">{panel.caption}</figcaption>}
      {panel.finale && <p className="comic-finale">{panel.finale}</p>}
      {panel.bubbles.map((b, i) => (
        <p
          key={i}
          className={`speech speech-${b.who}`}
          style={{ left: `${b.x}%`, top: `${b.y}%`, width: b.w ? `${b.w}%` : undefined, animationDelay: `${300 + i * 700}ms` }}
        >
          <span className="sr-only">{b.who === "sam" ? "Sam: " : "You: "}</span>
          {b.text}
        </p>
      ))}
    </figure>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { camera, diamond, drawPanel, lasers, maskVsBox, moon, museum, PANEL, phone, photoDesk, thief } from "@/lib/comic";

/**
 * The prologue: a six-panel pencil comic in which the thief calls Sam before the heist. Sam is
 * always shown as what it is, the Meta SAM 3.1 model on a phone screen, and only promises what
 * the game actually does with its masks.
 */
type Bubble = { who: "you" | "sam"; text: string; x: number; y: number; w?: number };
type Panel = { caption?: string; draw: Parameters<typeof drawPanel>[1]; bubbles: Bubble[] };

const PANELS: Panel[] = [
  {
    caption: "Midnight. The Sketch Museum.",
    draw: (p) => {
      moon(p, 400, 60);
      museum(p, 130, 70, 220, 230);
      diamond(p, 240, 220, 0.8);
    },
    bubbles: [{ who: "sam", text: "Everything in there is pencil. Even the diamond.", x: 3, y: 74, w: 44 }],
  },
  {
    draw: (p) => {
      thief(p, 120, 290, 2.6, "phone");
      phone(p, 300, 70, 120, 210);
    },
    bubbles: [
      { who: "you", text: "Sam? It's me. I'm going in tonight.", x: 3, y: 6, w: 46 },
      { who: "sam", text: "Pencil cameras, pencil lasers. They can't stop real things.", x: 50, y: 4, w: 46 },
    ],
  },
  {
    caption: "Step one: loot reality.",
    draw: (p) => {
      photoDesk(p, 40, 210, 230);
      thief(p, 360, 300, 2.2, "point");
    },
    bubbles: [
      { who: "sam", text: "Send me a photo and tap an object. I'll cut out its exact pixels.", x: 52, y: 16, w: 45 },
      { who: "you", text: "Any photo?", x: 6, y: 20, w: 22 },
    ],
  },
  {
    draw: (p) => maskVsBox(p, 300, 190),
    bubbles: [
      { who: "you", text: "Can't I just grab the box around it?", x: 3, y: 5, w: 40 },
      { who: "sam", text: "A box turns a ruler into a brick. I hand you the real shape.", x: 3, y: 62, w: 48 },
    ],
  },
  {
    caption: "Step two: break the sketch.",
    draw: (p) => {
      camera(p, 420, 60, 250, 250);
      lasers(p, 70, 220, 260);
      p.rc.line(10, 280, 470, 280, { stroke: "#3f3a34", roughness: 1.4, seed: 5 });
    },
    bubbles: [
      { who: "sam", text: "Chunky things block cameras. Thin things slip between lasers. Things with holes hang on hooks.", x: 3, y: 16, w: 58 },
      { who: "you", text: "Shape, not name. Got it.", x: 58, y: 70, w: 38 },
    ],
  },
  {
    caption: "Step three: escape the museum.",
    draw: (p) => {
      museum(p, 40, 60, 200, 240);
      thief(p, 330, 300, 2.4, "sneak");
      phone(p, 400, 150, 56, 96);
    },
    bubbles: [
      { who: "sam", text: "Ten rooms. I'll be on the line.", x: 50, y: 14, w: 46 },
      { who: "you", text: "Let's steal reality.", x: 58, y: 84, w: 38 },
    ],
  },
];

const AUTO_MS = 4200;

type Props = { onDone: () => void; onSkip: () => void; doneLabel: string };

export function Prologue({ onDone, onSkip, doneLabel }: Props) {
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
    <main className="prologue" aria-label="Prologue comic">
      <header className="prologue-head">
        <span className="logo">PIXEL HEIST</span>
        <span className="prologue-title">Prologue · The Call</span>
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

function PanelView({ panel, seed }: { panel: Panel; seed: number }) {
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

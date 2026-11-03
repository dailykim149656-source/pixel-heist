"use client";

import { useEffect, useRef } from "react";
import { boxToImagePixel, containRect } from "@/lib/coords";
import type { Photo } from "@/lib/loot";
import { SAM_LABEL, type ChatMessage } from "@/lib/sam-voice";
import type { Inference, SegmentState } from "./Game";

type Props = {
  photo: Photo | null;
  photoError: string | null;
  inference: Inference;
  onInference: (i: Inference) => void;
  seg: SegmentState;
  chat: ChatMessage[];
  onLoadFile: (f: File) => void;
  onTrySample: () => void;
  onClick: (pt: { x: number; y: number }, mod: "new" | "add" | "remove") => void;
  onRefine: () => void;
  onClearPending: () => void;
  onExtract: () => void;
  onRetry: () => void;
  lootFull: boolean;
};

export function PhotoPanel(props: Props) {
  const { photo, seg, inference } = props;
  const fileInput = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);

  // Mask overlay + prompt points, drawn in the same contain-rect as the <img>.
  useEffect(() => {
    const c = overlay.current, b = box.current;
    if (!c || !b || !photo) return;
    const draw = () => {
      const w = b.clientWidth, h = b.clientHeight;
      c.width = w * devicePixelRatio;
      c.height = h * devicePixelRatio;
      const ctx = c.getContext("2d")!;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const r = containRect({ width: w, height: h }, photo);
      const toBox = (p: { x: number; y: number }) => ({ x: r.left + (p.x + 0.5) * r.scale, y: r.top + (p.y + 0.5) * r.scale });
      if (seg.kind === "PREVIEW") {
        const { mask, seg: s } = seg.preview;
        const tint = document.createElement("canvas");
        tint.width = mask.width;
        tint.height = mask.height;
        const tctx = tint.getContext("2d")!;
        const img = tctx.createImageData(mask.width, mask.height);
        for (let i = 0; i < mask.data.length; i++) {
          if (!mask.data[i]) continue;
          // fill + a darker rim where a neighbour is empty
          const x = i % mask.width, y = (i / mask.width) | 0;
          const edge = x === 0 || y === 0 || x === mask.width - 1 || y === mask.height - 1 || !mask.data[i - 1] || !mask.data[i + 1] || !mask.data[i - mask.width] || !mask.data[i + mask.width];
          img.data.set(edge ? [112, 48, 230, 255] : [140, 82, 255, 95], i * 4);
        }
        tctx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tint, r.left + s.sourceBbox.x * r.scale, r.top + s.sourceBbox.y * r.scale, mask.width * r.scale, mask.height * r.scale);
      }
      const points = seg.kind === "PREVIEW" ? [...seg.preview.points, ...seg.pending] : seg.kind === "IDLE" ? [] : seg.points;
      for (const p of points) {
        const q = toBox(p);
        ctx.fillStyle = p.label === "positive" ? "#5fae3c" : "#d8372b";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(b);
    return () => ro.disconnect();
  }, [photo, seg]);

  const click = (e: React.MouseEvent) => {
    if (!photo || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const pt = boxToImagePixel({ x: e.clientX - r.left, y: e.clientY - r.top }, { width: r.width, height: r.height }, photo);
    if (!pt) return;
    props.onClick(pt, e.altKey ? "remove" : e.shiftKey ? "add" : "new");
  };

  const preview = seg.kind === "PREVIEW" ? seg.preview : null;
  const m = preview?.shape.metrics;

  return (
    <aside className="panel loot-src">
      <h2 className="panel-title">Real World Loot</h2>

      {!photo ? (
        <div className="dropzone">
          <button className="btn" onClick={() => fileInput.current?.click()}>⇪ Upload a photo</button>
          <span className="muted">or</span>
          <button className="btn btn-pick" onClick={props.onTrySample}>Try Sample Desk</button>
          <p className="fineprint">The sample desk is an AI-generated image, not a photo.</p>
          {props.photoError && <p className="error">{props.photoError}</p>}
        </div>
      ) : (
        <>
          <div className="photo-box" ref={box} onClick={click} data-busy={seg.kind === "LOADING"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={photo.kind === "sample" ? "Sample desk (AI-generated)" : "Your photo"} draggable={false} />
            <canvas ref={overlay} className="photo-overlay" />
            {seg.kind === "LOADING" && <div className="photo-busy">✂ Sam is cutting…</div>}
          </div>

          <div className="photo-tools">
            <div className="segmented" role="radiogroup" aria-label="Inference source">
              <button role="radio" aria-checked={inference === "LIVE_API"} className={inference === "LIVE_API" ? "on" : ""} onClick={() => props.onInference("LIVE_API")}>
                Live Sam
              </button>
              <button
                role="radio"
                aria-checked={inference === "PRECOMPUTED_SAMPLE"}
                className={inference === "PRECOMPUTED_SAMPLE" ? "on" : ""}
                onClick={() => props.onInference("PRECOMPUTED_SAMPLE")}
                disabled={photo.kind !== "sample"}
                title={photo.kind === "sample" ? "Replay Sam's real SAM 3.1 cuts recorded earlier for the sample desk" : "Recorded cuts exist only for the sample desk"}
              >
                Recorded
              </button>
            </div>
            <button className="link" onClick={() => fileInput.current?.click()}>New photo</button>
          </div>

          <SamThread chat={props.chat} typing={seg.kind === "LOADING"} />
          {seg.kind === "ERROR" && (
            <div className="row">
              <button className="btn btn-small" onClick={props.onRetry}>Ask again</button>
              {inference === "LIVE_API" && photo.kind === "sample" && (
                <button className="btn btn-small" onClick={() => props.onInference("PRECOMPUTED_SAMPLE")}>Use recorded cuts</button>
              )}
            </div>
          )}

          {preview && m && (
            <div className="geo-card">
              <div className="geo-head">
                <span className="geo-title">Cut-out geometry</span>
                <OriginBadge origin={preview.seg.origin} />
              </div>
              <dl className="geo-grid">
                <dt>Length</dt><dd>{m.lengthPx}px</dd>
                <dt>Thickness</dt><dd>{m.thicknessPx}px</dd>
                <dt>Solid</dt><dd>{Math.round(m.solidity * 100)}%</dd>
                <dt>Aspect</dt><dd>{m.aspect.toFixed(1)} : 1</dd>
                <dt>Longest run</dt><dd>{m.longestUnbrokenSpanPx}px</dd>
                <dt>Straightened</dt><dd>{preview.shape.deskewDeg ? `${Math.round(preview.shape.deskewDeg)}°` : "—"}</dd>
                <dt className="xray-dt">Box only</dt><dd className="xray-dd">{preview.box.grid.width}×{preview.box.grid.height}px, solid</dd>
              </dl>
              <p className="geo-meta">
                SAM confidence {preview.seg.confidence?.toFixed(2) ?? "n/a"} · {preview.seg.latencyMs}ms
                {preview.seg.origin === "PRECOMPUTED_SAMPLE" ? " (recorded)" : ""}
              </p>
              {inference === "LIVE_API" && (
                <p className="fineprint">
                  Wrong part? Shift+click to add, Alt+click to exclude, then Refine.
                  {seg.kind === "PREVIEW" && seg.pending.length > 0 && (
                    <>
                      {" "}
                      <button className="link" onClick={props.onRefine}>Refine ({seg.pending.length})</button>{" "}
                      <button className="link" onClick={props.onClearPending}>clear</button>
                    </>
                  )}
                </p>
              )}
              <button className="btn btn-primary btn-extract" onClick={props.onExtract} disabled={props.lootFull}>
                {props.lootFull ? "Loot bag full" : "Extract ✂"}
              </button>
            </div>
          )}
        </>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) props.onLoadFile(f);
          e.target.value = "";
        }}
      />
    </aside>
  );
}

function SamThread({ chat, typing }: { chat: ChatMessage[]; typing: boolean }) {
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [chat.length, typing]);
  return (
    <section className="sam" aria-label={`Chat with Sam, the ${SAM_LABEL} segmentation model`}>
      <header className="sam-head">
        <span className="sam-avatar" aria-hidden>✂</span>
        <span>
          <b>Sam</b> <span className="sam-role">cut-out specialist</span>
          <small>AI model · {SAM_LABEL}</small>
        </span>
      </header>
      <div className="sam-log" aria-live="polite" ref={log}>
        {chat.slice(-4).map((m) => (
          <p key={m.id} className={`bubble from-${m.from}${m.tone ? ` tone-${m.tone}` : ""}`}>{m.text}</p>
        ))}
        {typing && (
          <p className="bubble from-sam typing" aria-label="Sam is cutting">
            <span />
            <span />
            <span />
          </p>
        )}
      </div>
    </section>
  );
}

export function OriginBadge({ origin }: { origin: "LIVE_API" | "PRECOMPUTED_SAMPLE" }) {
  return origin === "LIVE_API" ? (
    <span className="badge badge-live" title="Cut just now by Sam (Meta SAM 3.1, live API call)">● LIVE</span>
  ) : (
    <span className="badge badge-sample" title="A real SAM 3.1 cut recorded earlier for this sample, replayed — not a live call">◌ RECORDED</span>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { drawScene, type Scene } from "@/lib/draw";
import type { Placement } from "@/lib/geometry";
import { planRun, runDurationMs, RUN_SPEED_PX_PER_S, thiefY } from "@/lib/heist";
import { judge } from "@/lib/judge";
import { buildPreview, extractLoot, normalizePhoto, segmentSample, type LootItem } from "@/lib/loot";
import { SAMPLES } from "@/lib/samples";
import { THIEF, WORLD } from "@/lib/stage";
import { stageById } from "@/lib/stages";

/**
 * The landing page's hero: the real game renderer playing stage 3 on its own, with the real
 * recorded SAM cuts from Desk A (mug blocks the camera, ruler bridges the gap). The placements
 * were found by the same solver the tests use, so the run genuinely passes the judge.
 */
const STAGE = stageById(3);
const SCRIPT: { point: { x: number; y: number }; at: Omit<Placement, "shape"> }[] = [
  { point: { x: 260, y: 410 }, at: { x: 440, y: 182, rotationDeg: 90 } }, // mug → camera
  { point: { x: 330, y: 790 }, at: { x: 495, y: 419, rotationDeg: 0 } }, // ruler → gap
];
const EMPTY_MS = 1400, DROP_MS = 1300, WON_MS = 2200;

export function HeroDemo() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0, cancelled = false;
    const c = canvas.current!;
    const fit = () => {
      const w = Math.round(c.clientWidth * devicePixelRatio);
      if (w > 0 && c.width !== w) {
        c.width = w;
        c.height = Math.round((w * WORLD.height) / WORLD.width);
      }
    };
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    fit();

    const empty = judge(STAGE, []);
    const idle = (): Scene => ({
      stage: STAGE, placed: [], candidate: null, live: empty, settled: empty, xray: null,
      thief: { x: THIEF.startX, y: thiefY(STAGE, [], THIEF.startX), pose: "idle", t: 0 },
    });
    drawScene(c, idle());

    (async () => {
      const blob = await (await fetch(`/sample/${SAMPLES.a.image}`)).blob();
      const photo = await normalizePhoto(blob, "sample", "a");
      const loot: LootItem[] = [];
      for (const s of SCRIPT) {
        const seg = await segmentSample("a", s.point);
        if (!seg.ok) return;
        loot.push(extractLoot(await buildPreview(photo, seg, [{ ...s.point, label: "positive" }])));
      }
      if (cancelled) return;
      const placements = loot.map((l, i) => ({ shape: l.shape, ...SCRIPT[i].at }));
      const settledAll = judge(STAGE, placements);
      const plan = planRun(STAGE, settledAll);
      const runMs = runDurationMs(plan);
      const total = EMPTY_MS + DROP_MS * loot.length + runMs + WON_MS;
      const start = performance.now();

      const tick = (now: number) => {
        const t = (now - start) % total;
        const shown = Math.max(0, Math.min(loot.length, Math.floor((t - EMPTY_MS) / DROP_MS) + 1));
        const visible = placements.slice(0, shown);
        const j = judge(STAGE, visible);
        const placed = visible.map((p, i) => {
          // Each cut-out drops in from a little above its spot.
          const since = t - EMPTY_MS - i * DROP_MS;
          const fall = Math.max(0, 1 - since / 380);
          return { placement: { ...p, y: p.y - 60 * fall * fall }, sprite: loot[i].sprite };
        });
        const runT = t - EMPTY_MS - DROP_MS * loot.length;
        let thief: Scene["thief"] = { x: THIEF.startX, y: thiefY(STAGE, visible, THIEF.startX), pose: "idle", t: 0 };
        if (runT > 0) {
          const x = Math.min(plan.stopX, THIEF.startX + (runT / 1000) * RUN_SPEED_PX_PER_S);
          const pose = runT < runMs ? "run" : plan.outcome === "WON" ? "won" : "caught";
          thief = { x, y: thiefY(STAGE, visible, x), pose, t: runT };
        }
        if (c.width > 0) drawScene(c, { stage: STAGE, placed, candidate: null, live: j, settled: j, xray: null, thief });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })().catch(() => {});

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="hero-demo">
      <canvas ref={canvas} className="world" aria-label="Autoplay: a cut-out mug blocks the camera, a cut-out ruler bridges the gap, and the thief runs to the vault" />
    </div>
  );
}

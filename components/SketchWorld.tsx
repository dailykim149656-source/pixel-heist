"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { drawScene, type Scene } from "@/lib/draw";
import { WORLD } from "@/lib/stage";

type Props = { scene: Scene; onPointerDown: (e: React.PointerEvent) => void; dragging: boolean };

export const SketchWorld = forwardRef<HTMLCanvasElement, Props>(function SketchWorld({ scene, onPointerDown, dragging }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useImperativeHandle(ref, () => canvas.current!);

  // Keep the backing store at device resolution for crisp pencil lines.
  useEffect(() => {
    const c = canvas.current!;
    const resize = () => {
      const w = Math.round(c.clientWidth * devicePixelRatio);
      if (c.width !== w) {
        c.width = w;
        c.height = Math.round((w * WORLD.height) / WORLD.width);
      }
      drawScene(c, sceneRef.current);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    resize();
    return () => ro.disconnect();
  }, []);

  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  useEffect(() => {
    if (canvas.current && canvas.current.width > 0) drawScene(canvas.current, scene);
  });

  return (
    <div className={`world-frame${dragging ? " is-dragging" : ""}`}>
      <canvas
        ref={canvas}
        className="world"
        onPointerDown={onPointerDown}
        aria-label="Sketch museum: camera on the right, a gap in the floor guarded by lasers, the vault beyond"
      />
    </div>
  );
});

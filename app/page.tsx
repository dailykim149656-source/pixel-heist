"use client";

import { useState } from "react";
import { Game } from "@/components/Game";

export default function Page() {
  const [screen, setScreen] = useState<"title" | "game">("title");
  const [how, setHow] = useState(false);

  return (
    <>
      <div className="small-screen">
        <p className="logo">PIXEL HEIST</p>
        <p>This heist needs a bigger desk. Open it on a desktop browser (1280×800 or larger).</p>
      </div>
      {screen === "game" ? (
        <Game onExit={() => setScreen("title")} />
      ) : (
        <main className="title-screen">
          <div className="title-card">
            <h1 className="logo logo-big">PIXEL HEIST</h1>
            <p className="tagline">Steal reality. Escape the sketch.</p>
            <div className="title-actions">
              <button className="btn btn-primary btn-big" onClick={() => setScreen("game")}>▶ Play</button>
              <button className="btn" onClick={() => setHow((h) => !h)}>How it works</button>
            </div>
            {how && (
              <ol className="how">
                <li>Click an object in a photo and ask <b>Sam</b>, your cut-out specialist. Sam is the <b>Meta SAM 3.1</b> model, and cuts out the object&apos;s exact pixels.</li>
                <li>Extract it and drag the real cut-out into the pencil-drawn museum.</li>
                <li>The game only looks at the cut-out&apos;s <b>shape</b> — length, thickness, holes — never its name.</li>
                <li>Block the camera&apos;s rays, bridge the laser gap, reach the vault.</li>
              </ol>
            )}
          </div>
        </main>
      )}
    </>
  );
}

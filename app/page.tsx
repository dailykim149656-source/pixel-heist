"use client";

import { useState } from "react";
import { Game } from "@/components/Game";
import { Landing } from "@/components/Landing";
import { Prologue } from "@/components/Prologue";

type Screen = "landing" | "prologue" | "replay" | "game";

export default function Page() {
  const [screen, setScreen] = useState<Screen>("landing");

  if (screen === "landing") return <Landing onPlay={() => setScreen("prologue")} onPrologue={() => setScreen("replay")} />;

  return (
    <>
      {screen === "game" && (
        <div className="small-screen">
          <p className="logo">PIXEL HEIST</p>
          <p>This heist needs a bigger desk. Open it on a desktop browser (1280×800 or larger).</p>
          <button className="btn" onClick={() => setScreen("landing")}>← Back</button>
        </div>
      )}
      {screen === "game" ? (
        <Game onExit={() => setScreen("landing")} />
      ) : (
        <Prologue
          doneLabel={screen === "replay" ? "▶ Play the Heist" : "▶ Start the heist"}
          onDone={() => setScreen("game")}
          onSkip={() => setScreen(screen === "replay" ? "landing" : "game")}
        />
      )}
    </>
  );
}

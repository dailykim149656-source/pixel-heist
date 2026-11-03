"use client";

import { useState } from "react";
import { Comic } from "@/components/Comic";
import { Game } from "@/components/Game";
import { Landing } from "@/components/Landing";
import { ENDING, PROLOGUE } from "@/lib/comic-scripts";

type Screen = "landing" | "prologue" | "replay" | "game" | "ending";

export default function Page() {
  const [screen, setScreen] = useState<Screen>("landing");

  if (screen === "landing") return <Landing onPlay={() => setScreen("prologue")} onPrologue={() => setScreen("replay")} />;
  if (screen === "ending")
    return (
      <Comic
        ending
        title="Ending · The Double Cross"
        panels={ENDING}
        doneLabel="Back to the start ↺"
        onDone={() => setScreen("landing")}
        onSkip={() => setScreen("landing")}
      />
    );

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
        <Game onExit={() => setScreen("landing")} onEnding={() => setScreen("ending")} />
      ) : (
        <Comic
          title="Prologue · The Call"
          panels={PROLOGUE}
          doneLabel={screen === "replay" ? "▶ Play the Heist" : "▶ Start the heist"}
          onDone={() => setScreen("game")}
          onSkip={() => setScreen(screen === "replay" ? "landing" : "game")}
        />
      )}
    </>
  );
}

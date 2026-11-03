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
        voices="end"
        music="ending"
        doneLabel="Back to the start ↺"
        onDone={() => setScreen("landing")}
        onSkip={() => setScreen("landing")}
      />
    );

  if (screen === "game") return <Game onExit={() => setScreen("landing")} onEnding={() => setScreen("ending")} />;
  return (
    <Comic
      title="Prologue · The Call"
      panels={PROLOGUE}
      voices="pro"
      music="bgm"
      doneLabel={screen === "replay" ? "▶ Play the Heist" : "▶ Start the heist"}
      onDone={() => setScreen("game")}
      onSkip={() => setScreen(screen === "replay" ? "landing" : "game")}
    />
  );
}

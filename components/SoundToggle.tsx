"use client";

import { useEffect, useState } from "react";
import { onSoundChange, setSound, soundOn } from "@/lib/audio";

export function SoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(soundOn());
    const off = onSoundChange(setOn);
    return () => void off();
  }, []);
  return (
    <button className="icon-btn" onClick={() => setSound(!on)} aria-pressed={on} title={on ? "Sound on (music, effects, voices by ElevenLabs)" : "Sound off"} aria-label={on ? "Mute sound" : "Unmute sound"}>
      {on ? "🔊" : "🔇"}
    </button>
  );
}

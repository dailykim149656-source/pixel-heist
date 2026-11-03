"use client";

/**
 * Sound for the game: ElevenLabs-generated music, effects and comic voices in public/audio.
 * Everything starts only after a click (browsers block autoplay) and one switch mutes it all.
 */
export type Sfx = "snip" | "drop" | "laser" | "alarm" | "fall" | "drawbridge" | "gate" | "win" | "panel" | "run";
export type Track = "bgm" | "ending";

const KEY = "pixel-heist.sound";
const listeners = new Set<(on: boolean) => void>();
let on = true;
let music: HTMLAudioElement | null = null;
let musicTrack: Track | null = null;
let voiceEl: HTMLAudioElement | null = null;
const cache = new Map<string, HTMLAudioElement>();
const VOLUME: Record<Track, number> = { bgm: 0.35, ending: 0.6 };

if (typeof window !== "undefined") {
  try {
    on = localStorage.getItem(KEY) !== "off";
  } catch {
    // storage unavailable: sound stays on
  }
}

export const soundOn = () => on;

/** When a page sets window.__audioLog (the demo recorder does), every sound is noted with its time. */
function note(kind: "sfx" | "voice" | "music" | "steps", name: string | null, volume = 1) {
  const log = (window as unknown as { __audioLog?: unknown[] }).__audioLog;
  log?.push({ kind, name, volume, t: Date.now() });
}

export function setSound(next: boolean) {
  on = next;
  try {
    localStorage.setItem(KEY, next ? "on" : "off");
  } catch {
    // not remembered
  }
  if (!next) {
    music?.pause();
    voiceEl?.pause();
    loop?.pause();
  } else if (musicTrack) void music?.play().catch(() => {});
  listeners.forEach((l) => l(next));
}

export function onSoundChange(l: (on: boolean) => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function el(src: string) {
  let a = cache.get(src);
  if (!a) {
    a = new Audio(src);
    a.preload = "auto";
    cache.set(src, a);
  }
  return a;
}

export function sfx(name: Sfx, volume = 0.8) {
  if (!on) return;
  note("sfx", name, volume);
  const a = el(`/audio/sfx/${name}.mp3`).cloneNode() as HTMLAudioElement;
  a.volume = volume;
  void a.play().catch(() => {});
}

let loop: HTMLAudioElement | null = null;
/** The thief's footsteps while running. */
export function footsteps(play: boolean) {
  if (!play) {
    if (loop) note("steps", null);
    loop?.pause();
    loop = null;
    return;
  }
  if (!on || loop) return;
  note("steps", "run", 0.5);
  loop = el("/audio/sfx/run.mp3").cloneNode() as HTMLAudioElement;
  loop.loop = true;
  loop.volume = 0.5;
  void loop.play().catch(() => {});
}

export function playMusic(track: Track | null) {
  if (track === musicTrack) return;
  music?.pause();
  musicTrack = track;
  note("music", track);
  if (!track) {
    music = null;
    return;
  }
  music = new Audio(`/audio/${track}.mp3`);
  music.loop = track === "bgm";
  music.volume = VOLUME[track];
  if (on) void music.play().catch(() => {});
}

/** Speak one comic line; resolves when it ends (or at once when muted or missing). */
export function voice(id: string): Promise<void> {
  voiceEl?.pause();
  if (!on) return Promise.resolve();
  note("voice", id);
  const a = new Audio(`/audio/vo/${id}.mp3`);
  voiceEl = a;
  if (music) music.volume = (musicTrack ? VOLUME[musicTrack] : 0.3) * 0.45; // duck under speech
  const restore = () => {
    if (music && musicTrack) music.volume = VOLUME[musicTrack];
  };
  return new Promise((resolve) => {
    a.onended = a.onerror = a.onpause = () => {
      restore();
      resolve();
    };
    a.play().catch(() => {
      restore();
      resolve();
    });
  });
}

export function stopVoice() {
  voiceEl?.pause();
  voiceEl = null;
}

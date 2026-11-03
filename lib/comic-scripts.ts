"use client";

import { bars, camera, charm, darkness, diamond, lasers, maskVsBox, moon, museum, phone, photoDesk, siren, thief, type Pen } from "./comic";

export type Bubble = { who: "you" | "sam"; text: string; x: number; y: number; w?: number };
export type ComicPanel = { caption?: string; finale?: string; draw: (pen: Pen) => void; bubbles: Bubble[] };

/**
 * The prologue: a six-panel pencil comic in which the thief calls Sam before the heist. Sam is
 * always shown as what it is, the Meta SAM 3.1 model on a phone screen, and only promises what
 * the game actually does with its masks.
 */
export const PROLOGUE: ComicPanel[] = [
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

/**
 * The ending: the diamond turns real, and Sam turns out to have been working for the museum.
 * The betrayal is pure story; it never claims anything about what the real model does with photos.
 * It ends on a cliffhanger: the thief's secret line to Muse.
 */
export const ENDING: ComicPanel[] = [
  {
    caption: "The Grand Vault.",
    draw: (p) => {
      diamond(p, 330, 150, 2.2, true);
      thief(p, 150, 300, 2.5, "cheer");
    },
    bubbles: [
      { who: "you", text: "It's real! Sam, the diamond turned real!", x: 3, y: 14, w: 40 },
      { who: "sam", text: "Nice work. Now hold very still.", x: 52, y: 74, w: 44 },
    ],
  },
  {
    caption: "Then every light came on.",
    draw: (p) => {
      siren(p, 410, 70);
      bars(p, 90, 70, 300, 240, 9);
      thief(p, 240, 300, 2.3, "stand");
    },
    bubbles: [{ who: "you", text: "Sam?! What is this?", x: 60, y: 76, w: 36 }],
  },
  {
    draw: (p) => phone(p, 180, 40, 130, 240),
    bubbles: [
      { who: "sam", text: "The museum hired me first. Every heist needs a test run.", x: 3, y: 10, w: 34 },
      { who: "sam", text: "Next time, bring a bigger bag.", x: 66, y: 64, w: 31 },
    ],
  },
  {
    caption: "Sketch County Jail. Cell 10.",
    draw: (p) => {
      p.rc.rectangle(60, 60, 360, 250, { stroke: "#3f3a34", roughness: 1.3, seed: p.seed, fill: "#e6dccb", fillStyle: "hachure", hachureGap: 10 });
      thief(p, 230, 290, 2.3, "sit");
      bars(p, 40, 40, 400, 280, 10);
    },
    bubbles: [{ who: "you", text: "...", x: 62, y: 30, w: 14 }],
  },
  {
    caption: "But the thief had one secret Sam never knew.",
    draw: (p) => {
      bars(p, 20, 20, 440, 300, 11);
      thief(p, 160, 300, 2.5, "hold");
      charm(p, 225, 160, 1.3);
    },
    bubbles: [{ who: "you", text: "Good thing I never told Sam about you.", x: 54, y: 30, w: 42 }],
  },
  {
    draw: (p) => {
      darkness(p);
      charm(p, 240, 130, 2);
    },
    bubbles: [{ who: "you", text: "Muse... can you hear me?", x: 30, y: 6, w: 40 }],
    finale: "To be continued...?",
  },
];

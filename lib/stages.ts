/**
 * Stage layouts (PRD §3, stage plan). Each stage is a set of devices; the judge, the drawing and
 * the heist run all read these same numbers. Every stage is solved by tests/stages.test.ts using
 * real SAM fixtures from the sample desks.
 */

/** A camera watches the thief's path between fromX and toX; `need` of its rays must be blocked. */
export type Camera = { id: string; x: number; y: number; fromX: number; toX: number; targetY: number; rays: number; need: number; forbiddenRadius: number };

/**
 * A gap between two ledges (heights may differ). A bridge must run unbroken along the walk line
 * from one support to the other and stay inside the laser slot around that line.
 */
export type Gap = { id: string; left: number; right: number; yLeft: number; yRight: number; support: number; slotAbove: number; slotBelow: number };

/** A pressure plate on the floor: `cover` of the strip just above it must be opaque. */
export type Plate = { id: string; x: number; width: number; y: number; cover: number; opens: string };

/** A hook on the wall: it holds an item only if the point falls inside a hole in the item's mask. */
export type Hook = { id: string; x: number; y: number; opens: string };

/** A door across the path, shut until its plate or hook is satisfied. */
export type Door = { id: string; x: number };

export type Floor = { x0: number; x1: number; y: number };

export type Stage = {
  id: number;
  name: string;
  /** One line that introduces the stage's new idea. */
  teaser: string;
  floors: Floor[];
  cameras: Camera[];
  gaps: Gap[];
  plates: Plate[];
  hooks: Hook[];
  doors: Door[];
  vaultX: number;
};

const FLOOR = 430;
const fullFloor: Floor[] = [{ x0: -10, x1: 970, y: FLOOR }];
const camera = (over: Partial<Camera> & Pick<Camera, "id" | "x" | "fromX" | "toX">): Camera => ({
  y: 92,
  targetY: FLOOR - 46,
  rays: 7,
  need: 5,
  forbiddenRadius: 80,
  ...over,
});
const gap = (over: Partial<Gap> & Pick<Gap, "id" | "left" | "right">): Gap => ({
  yLeft: FLOOR,
  yRight: FLOOR,
  support: 12,
  slotAbove: 40,
  slotBelow: 8,
  ...over,
});

export const STAGES: Stage[] = [
  {
    id: 1,
    name: "The Lobby",
    teaser: "A camera watches the hall. Anything that crosses its red rays blocks the view.",
    floors: fullFloor,
    cameras: [camera({ id: "cam", x: 600, fromX: 150, toX: 390 })],
    gaps: [],
    plates: [],
    hooks: [],
    doors: [],
    vaultX: 830,
  },
  {
    id: 2,
    name: "The Broken Corridor",
    teaser: "The floor is gone. Lay something long across — thin enough to slip between the lasers.",
    floors: [{ x0: -10, x1: 430, y: FLOOR }, { x0: 560, x1: 970, y: FLOOR }],
    cameras: [],
    gaps: [gap({ id: "gap", left: 430, right: 560 })],
    plates: [],
    hooks: [],
    doors: [],
    vaultX: 830,
  },
  {
    id: 3,
    name: "The Gallery",
    teaser: "Camera and gap together. One object can't do both jobs.",
    floors: [{ x0: -10, x1: 430, y: FLOOR }, { x0: 560, x1: 970, y: FLOOR }],
    cameras: [camera({ id: "cam", x: 600, fromX: 150, toX: 390 })],
    gaps: [gap({ id: "gap", left: 430, right: 560 })],
    plates: [],
    hooks: [],
    doors: [],
    vaultX: 830,
  },
  {
    id: 4,
    name: "The Weigh Station",
    teaser: "The door only opens while the plate is weighed down. Thin or hollow things won't do — it needs something chunky.",
    floors: fullFloor,
    cameras: [camera({ id: "cam", x: 760, fromX: 520, toX: 700, need: 5 })],
    gaps: [],
    plates: [{ id: "plate", x: 190, width: 130, y: FLOOR, cover: 0.7, opens: "door" }],
    hooks: [],
    doors: [{ id: "door", x: 450 }],
    vaultX: 860,
  },
  {
    id: 5,
    name: "The Hook Hall",
    teaser: "Hang something on the hook to lift the gate. Only an object with a real hole can hang.",
    floors: [{ x0: -10, x1: 520, y: FLOOR }, { x0: 650, x1: 970, y: FLOOR }],
    cameras: [],
    gaps: [gap({ id: "gap", left: 520, right: 650 })],
    plates: [],
    hooks: [{ id: "hook", x: 260, y: 170, opens: "gate" }],
    doors: [{ id: "gate", x: 420 }],
    vaultX: 850,
  },
];

export function stageById(id: number): Stage {
  return STAGES.find((s) => s.id === id) ?? STAGES[0];
}

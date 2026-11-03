# PIXEL HEIST

**Steal reality. Escape the sketch.** A browser puzzle game for the Meta Global AI Developer Hackathon 2026.
Play it at **https://pixel-heist.vercel.app** (desktop or phone).

Take a photo of anything, tap an object, and **Sam** cuts it out. Sam is the
[Meta SAM 3.1](https://dev.meta.ai/models/sam-3-1) segmentation model, not a person. You drag the real cut-out into a
museum drawn in pencil, where the game judges only its **shape** (length, thickness, solidity, holes) and never
its name. Block cameras, bridge laser gaps, weigh down plates, hang things on hooks, reach the diamond.

Two Meta models, two jobs:

- **SAM 3.1 steals objects from reality.** One tap is a point prompt; the mask it returns is the object's collider.
- **Muse Spark builds a world that fights back.** As the *Curator* it designs a room for the loot you brought,
  and as the voice in your charm it gives hints. In both roles the game engine checks every claim: Muse never
  decides what is solvable or what you've done.

## Run it

```bash
npm install
cp .env.example .env.local   # then set MODEL_API_KEY (server-only; used for SAM 3.1 and Muse Spark)
npm run dev                  # http://localhost:3000
npm test                     # geometry, judging, solver, Curator rooms, API routes
npm run e2e                  # Playwright, against a production build
```

Without a key, choose **Recorded** in the photo panel to replay real SAM 3.1 results for the two sample desks.

## How it works

- **Segmentation** (`app/api/segment`): the tap goes to `POST https://api.meta.ai/v1/responses` with
  `model: "sam-3.1"`, streamed and parsed with `@meta-sam/parser`. A stream cut off mid-way is retried once.
- **Shape** (`lib/geometry.ts`): long masks are straightened, the longest side is scaled to 180 game px, and holes
  are found by flood fill. That occupancy grid is the only thing the game knows about an object.
- **Judging** (`lib/judge.ts`): camera rays, the laser slot over a gap, how much of a plate is covered, whether
  a hook falls inside a real hole, sensor beams nothing may touch. A deterministic run (`lib/heist.ts`) decides
  caught, fell, stuck or escaped.
- **X-ray, mask vs box**: one toggle re-judges your exact placement with bounding boxes, the colliders you'd get
  without a mask. The ruler's box trips the lasers and the mug's box has no handle hole; `tests/xray.test.ts`
  checks it on the real masks.
- **Solver** (`lib/solver.ts`, in a Web Worker): finds what each of your cut-outs can do and a plan that the judge
  and the run accept. The tests use it to prove every stage is solvable; hints and the Curator use it so they're
  never guesses.

## More than one answer

Stage 3's gap has **three ways across**: a thin bar laid over it, something heavy on the far plate, or something
with a hole on the far hook (both lower a drawbridge). Desk A's two objects alone solve it three ways, by swapping
jobs. The mission never names the answer; the game records the ways you've found ("Ways across 1/3").

## Muse

- **Ask Muse** (`app/api/hint`): Nudge, Clue or Solution. The engine works out what's done, what's left and which
  of your cut-outs would work; Muse only words it, at `minimal` reasoning effort (about 3–6 s). Muse sees "the 2nd
  cut-out in your bag" and its shape, never what it is. The engine's own sentence shows first and stays if Muse
  can't answer.
- **The Curator's Challenge** (`app/api/curator`, `lib/curator.ts`): Muse designs a room for your loot inside the
  parameters the engine supports (camera and how many rays, sensor beams, a gap with rise and drawbridge controls,
  a door). The browser compiles it, then the solver rules: it must be beatable with your exact cut-outs, and by
  more than one of them. A rejected design goes back with the engine's reason for one redraw; after that you get
  the hardest built-in room your loot can beat. Different loot, different rooms.
- Muse Spark 1.3 is asked first. When it is overloaded (it returned 504s on 2026-11-03) the routes fall back to
  1.2, and the UI names the model that answered.

## Stages

Each stage adds one idea. `tests/stages.test.ts` solves each with the real SAM cuts and checks the wrong shapes fail.

| # | Stage | New idea | Desk A | Desk B |
|---|---|---|---|---|
| 1 | The Lobby | Block a camera's rays | mug | calculator / sticky note |
| 2 | The Broken Corridor | Bridge a gap, thin enough for the lasers | ruler | pen |
| 3 | The Gallery | Three ways across one gap | mug + ruler, three ways | calculator + pen / sticky / scissors |
| 4 | The Weigh Station | A plate that needs bulk (thin bars and loops fail) | mug + ruler | sticky note + calculator |
| 5 | The Hook Hall | A hook that only catches a real hole in the mask | mug handle + ruler | scissor loop + pen |
| 6 | The Split Level | Sloped gap: the bridge must be turned to climb | mug + ruler (rotated) | calculator + pen (rotated) |
| 7 | The Twin Watch | Two cameras + gap — more loot than one desk | mug + calculator + ruler | calculator + sticky + pen |
| 8 | The Tripwire | Sensor beams: only thin bars fit between them | ruler + pen (both desks) | — |
| 9 | The Counterweight | Plate + steeper climb + camera | mug + calculator + pen | sticky + calculator + pen |
| 10 | The Grand Vault | Hook + two cameras + steep climb, then the ending | mug + ruler + calculator + pen | scissors + calculator + sticky + pen |

Progress and found routes are remembered in the browser. A prologue and an ending comic frame the story.

## Honesty notes

- **LIVE** means a real SAM 3.1 call made just now. **RECORDED** replays real SAM 3.1 responses captured on
  2026-11-03 (`fixtures/sam/`, with provenance). No mask is hand-made.
- Both sample desk images are **AI-generated** (ChatGPT image generation), not photographs.
- Sam and Muse are always labelled as AI models. Their roles in the story (Sam's betrayal, Muse in the charm) are
  fiction and say nothing about what the real models do with images.
- No user image is stored. The servers keep in-memory caches only.

## Sound

Music, sound effects and the comic voices (the thief, Sam) were generated with ElevenLabs (`public/audio`).
The 🔊 button mutes everything; nothing plays before the first click.

## Demo video

`npx playwright test -c demo.config.ts` records the desktop footage (real game, recorded cuts, live Muse) and logs
every sound it plays; `node scripts/make-demo.mjs <phone-recording>` cuts it with a phone screen recording and mixes
the sounds back in at the same moments.

## Known limitations

- Object size is normalized; nothing claims real-world size or weight.
- Muse calls can take several seconds, longer when the API is busy.
- "PIXEL HEIST" is a working title used by other games.

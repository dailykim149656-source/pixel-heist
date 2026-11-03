# PIXEL HEIST — submission write-up

Meta Global AI Developer Hackathon 2026. Paste each section into the matching form field.

- **Play:** https://pixel-heist.vercel.app (desktop or phone, no install, no sign-in)
- **Code:** https://github.com/dailykim149656-source/pixel-heist (MIT)
- **Demo video:** _[add link after upload]_ (2:59)

---

## Tagline

Steal reality. Escape the sketch. A puzzle game where the solution is the exact shape SAM 3.1 cuts out of your photos.

## Inspiration

Every segmentation demo ends the same way: a colored overlay, and then nothing. We wanted a place where the mask itself *does* something, where the difference between a pixel-accurate mask and a bounding box decides whether you win or lose.

So we built a museum drawn entirely in pencil. Its cameras and lasers are sketches, and sketches can't stop something real. To break in, you cut real objects out of real photos and smuggle them into the drawing.

## What it does

1. **Take a photo** of anything. Use your phone camera, your photo library, or one of two sample desks.
2. **Tap an object.** Sam (Meta SAM 3.1) cuts out its exact pixels.
3. **Drag the cut-out into the sketch.** The game judges only its **shape**: length, thickness, solidity, and holes. It never knows the object's name. It doesn't know a mug is a mug; it knows something chunky with a hole in it.
4. **Use the shape to solve the room.**
   - Something chunky blocks a camera's rays.
   - A long, thin bar bridges a gap without touching the lasers above it.
   - Something solid weighs down a pressure plate.
   - Anything with a real hole hangs on a hook.
   - Only the thinnest bar slips between sensor beams.
5. **Run the heist.** A deterministic run decides whether the thief is caught, falls, gets stuck, or escapes.

**Ten handmade rooms.** Each one adds a single new rule. Several rooms can be solved more than one way. Stage 3's gap has three: a bar across it, weight on the far plate, or a hole on the far hook (both of the last two lower a drawbridge). The game records which ways you've found.

**X-ray: mask vs box.** One toggle re-judges your exact placement using bounding boxes, the colliders you'd get from a plain object detector. The ruler's box becomes a slab that trips the lasers, and the mug's box has no handle hole to hang by. Only the real mask works. This is the clearest case for segmentation we could find, and it plays as a game mechanic.

**Muse, the voice in your charm.** Ask for a Nudge, a Clue, or a Solution. Muse Spark puts the hint into words.

**The Curator's Challenge.** Muse Spark designs a new room for the loot you're carrying. It picks the sections and their order, the museum wing (classic, Egyptian, space, dinosaur, modern art), the prize, and a taunt about your loot's shapes. Different loot gives different rooms.

**A story around it.** A comic prologue introduces Sam as your cut-out specialist. The comic ending has a twist and a cliffhanger. Music, effects and character voices were made with ElevenLabs.

## How we used Meta's models

There are two models, and each has one job. **The game engine checks everything both of them do.**

**SAM 3.1 steals objects from reality.**
- A tap becomes a point prompt to `sam-3.1` on `https://api.meta.ai/v1/responses`.
- The streamed response is parsed with `@meta-sam/parser`.
- The returned mask *is* the object's collider. It is straightened, scaled to a fixed size, and turned into an occupancy grid, and holes are found by flood fill. Nothing hand-made is layered on top.
- SAM's confidence and latency are shown on screen next to every cut.

**Muse Spark builds a world that fights back.** We gave it two roles, and in both it never decides what is true.
- **Hints:**
  - The engine works out what's done, what's left, and which of your cut-outs would work.
  - Muse only rewords those facts in character, at `minimal` reasoning effort, in about 3–6 s.
  - Muse sees "the 2nd cut-out in your bag" and its shape, never what the object is, so it can't leak an answer the engine didn't compute.
- **The Curator:**
  - Muse returns a room design as JSON within the parameters the engine supports.
  - The browser compiles the design, and a solver checks that *this exact loot* can beat it, using more than one cut-out.
  - A rejected design goes back to Muse with the engine's reason, for one redraw.
  - If that redraw also fails, you get the hardest built-in room your loot can beat. A generated room is never impossible.
- **Fallback:** Muse Spark 1.3 is asked first. If it's overloaded, the request falls back to 1.2, and the UI names the model that answered.

## How we built it

- **Stack:** Next.js 16 (App Router) and React 19 in TypeScript, deployed on Vercel. The sketch look comes from Canvas and Rough.js.
- **Geometry and judging** (`lib/geometry.ts`, `lib/judge.ts`):
  - camera rays against the mask's occupancy;
  - the laser slot over each gap;
  - plate coverage;
  - whether a hook point lands inside a real hole;
  - sensor beams that nothing may touch.
- **Solver** (`lib/solver.ts`, runs in a Web Worker):
  - It works out what each cut-out can do, then searches for a plan that both the judge and the heist run accept.
  - The tests use it to prove every stage is solvable with real SAM cuts.
  - Hints and the Curator use it so they never guess.
  - Every built-in stage plans in under a second.
- **Server routes** call the Meta APIs, so the key never reaches the browser:
  - `/api/segment`: retries once on transient stream errors.
  - `/api/hint` and `/api/curator`: fall back between model versions.
  - All three are rate-limited per IP.
- **Tests:**
  - 64 unit tests (Vitest) cover geometry, judging, every stage solved with the recorded masks, X-ray, the Curator compiler, and the API routes.
  - 15 end-to-end tests (Playwright) run against a production build.
- **Mobile:** the photo panel can open the camera or the photo library, and every interaction works with touch.

## Challenges we ran into

- **A mask is not a hitbox.**
  - Raw masks come at any angle and size, so long objects are straightened and scaled first.
  - Even then, phone players placed bridges a few pixels off. We added snapping, but only for bridge-shaped items. Our first, broader snap pulled a mug meant to block a camera onto the gap.
- **Making the AI fair.**
  - Early Curator rooms looked plausible but sometimes couldn't be beaten.
  - The fix was structural: Muse proposes, the solver decides.
  - Then the solver had to be fast enough to run in the browser while the player waits. Prefilters and a coarse search cut the worst case from about 8 seconds to under 1.
- **Latency.**
  - Strict JSON-schema output from Muse took more than 30 seconds.
  - JSON-object mode at minimal effort, with the engine clamping values into valid ranges, usually answers in 5–10 seconds.
- **Variety.** Left alone, Muse kept choosing the same layout and theme. Ordered sections, five wings, four prizes, and a random suggestion in each request made rooms genuinely different.
- **"One answer per stage."** Feedback told us that a puzzle with one solution has no replay value. That led to drawbridges, multiple ways across a gap, and a record of the ways you've found.

## Accomplishments that we're proud of

- The X-ray toggle turns "masks beat boxes" from a claim into something you can watch fail and succeed on the same placement.
- No AI output is trusted blindly. Every hint and every generated room is backed by the deterministic engine, and the tests prove it on real SAM output.
- It works on a phone: photograph your own desk, cut out your own mug, and use it in the heist.

## What we learned

- Segmentation becomes much more interesting when the shape has consequences.
- An LLM is an excellent level designer and narrator when a deterministic system checks its work, and a poor one when nothing does.
- Asking the model for less (minimal reasoning, loose JSON, then clamping) was faster *and* more reliable than asking it for more.

## What's next

- More rules built on shape: balance, rotation puzzles, and objects that must fit through openings.
- Shareable Curator rooms, so a friend has to beat your loot.
- A daily challenge photo that everyone cuts from.
- Season two of the story. (Someone in the cell still has a charm.)

## Built with

Meta SAM 3.1 · Meta Muse Spark 1.3 / 1.2 · Next.js · React · TypeScript · Canvas · Rough.js · Web Workers · Vitest · Playwright · Vercel · ElevenLabs (music, sound effects, voices)

## Honesty notes

- **LIVE** in the game means a real SAM 3.1 call made just now. **RECORDED** replays real SAM 3.1 responses captured on 2026-11-03. No mask is hand-made.
- Both sample desk images are AI-generated, not photographs. The phone footage in the demo is a real camera photo.
- Sam and Muse are always labelled as AI models. Their roles in the story, including Sam's betrayal, are fiction and say nothing about what the real models do with images.
- No user image is stored. Servers keep in-memory caches only.
- Object size is normalized. The game makes no claims about real-world size or weight.

# PIXEL HEIST

**Steal reality. Escape the sketch.** A browser puzzle game for the Meta Global AI Developer Hackathon 2026.

Click an object in a photo and ask **Sam**, the in-game cut-out specialist. Sam is the
[Meta SAM 3.1](https://dev.meta.ai/models/sam-3-1) segmentation model, not a person. Sam returns a pixel mask.
You drag the real cut-out into a pencil-drawn museum, where the game judges only its **shape**
(length, thickness, holes) and never its name. Block the camera's rays, bridge the laser gap, reach the vault.

> Working title. "PIXEL HEIST" is used by other games; the public name is still to be decided.

## Run it

```bash
npm install
cp .env.example .env.local   # then set MODEL_API_KEY (server-only)
npm run dev                  # http://localhost:3000
npm test                     # geometry, judging, coordinates, Sam's lines
```

Without a key, choose **Recorded** in the photo panel to replay the sample desk's recorded SAM results.

## How it works

- `app/api/segment` sends the click as a SAM point prompt to `POST https://api.meta.ai/v1/responses`
  (`model: "sam-3.1"`, streamed). The response is parsed with `@meta-sam/parser`, and the mask comes back cropped to its box.
- `lib/geometry.ts` straightens elongated masks, scales the longest side to 180 game px and builds an occupancy grid.
- `lib/judge.ts` decides everything from that grid: 7 camera rays (5 must be blocked), and a gap that needs one
  unbroken 154px span thin enough (≤ 48px) to pass between the lasers. The mug can block the camera
  but can never bridge. The ruler can do either. See `tests/judge.test.ts`, which runs on real SAM masks.
- `lib/stage.ts` holds the numbers that both the drawing and the judge use.
- **X-ray (mask vs box):** a toggle re-judges the same placements as plain bounding boxes, the colliders you'd
  get without a segmentation mask. The diagonal ruler's box is a slab that trips the lasers. With boxes the level is
  unsolvable, and `tests/xray.test.ts` checks that claim on the real SAM masks.

## Honesty notes

- **LIVE** means a real SAM 3.1 call made just now. **RECORDED** replays real SAM 3.1 responses captured on 2026-11-03
  (`fixtures/sam/`, with provenance). No mask is hand-made.
- The sample desk image is **AI-generated** (ChatGPT image generation), not a photograph.
- No user image is stored. The server keeps an in-memory cache only.

## Known limitations

- Desktop Chrome, 1280×800 or larger. Small screens get a notice.
- One stage.
- Object size is normalized and never claims real-world size or weight.

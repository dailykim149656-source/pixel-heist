# SAM 3.1 fixtures

Real `sam-3.1` responses captured with `scripts/smoke-sam.ts` on 2026-11-03.
Shipped as `PRECOMPUTED_SAMPLE`; never hand-edited. Each folder holds `fixture.json`
(provenance, prompt, bbox, confidence), `mask.png` (bbox-cropped), `cutout.png`,
`overlay.png`, `source.jpg` and `raw-output.txt`.

Source images are AI-generated desk scenes (`samples/`), not photographs.

| fixture | image | click | result | use |
|---|---|---|---|---|
| `mug` | desk.png (sample 1) | 260,410 | full mug, handle hole intact, conf 0.98 | **sample path** |
| `ruler` | desk.png (sample 1) | 330,790 | full diagonal ruler, conf 0.94 | **sample path** |
| `mug-coaster` | sample 3 | 1040,250 | mug + cork coaster merged, conf 0.96 | test: imperfect mask |
| `ruler-digit` | sample 3 | 1160,615 | one printed digit only (8×8), conf 0.52 | test: refine flow (FR-11) |
| `ruler-flat` | sample 3 | 1100,624 | full ruler after re-click, conf 0.96 | test: refine flow (FR-11) |

Geometry: `npm run measure:fixtures`.

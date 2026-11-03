/**
 * SAM 3.1 API smoke test (PRD §10 day-1 gate).
 *
 *   npm run smoke:sam -- --image samples/desk.jpg --point 640,420 --name mug
 *
 * photo → point → Meta Responses API → parser → decoded mask → cropped alpha PNG + cutout.
 * Writes everything to fixtures/sam/<name>/ with provenance metadata so the result can be
 * reused as a PRECOMPUTED_SAMPLE fixture. Requires MODEL_API_KEY (.env.local or env).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import {
  buildObjectPrompt,
  decodeMaskToRaster,
  parseImageStream,
  recordsOfKind,
  type ResponsesEvent,
} from "@meta-sam/parser";

const ENDPOINT = process.env.SAM_ENDPOINT ?? "https://api.meta.ai/v1/responses"; // override only for offline mock runs
const MODEL = "sam-3.1";
const MAX_SIDE = 2048; // PRD §7.3: normalized longest side
const TIMEOUT_MS = 30_000;
const OBJECT_ID = 1;

type SmokeErrorCode =
  | "INVALID_IMAGE"
  | "NO_OBJECT"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "MASK_PARSE_ERROR"
  | "AUTH"
  | "HTTP_ERROR";

class SmokeError extends Error {
  constructor(
    readonly code: SmokeErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const { values } = parseArgs({
  options: {
    image: { type: "string" },
    point: { type: "string" },
    name: { type: "string" },
    out: { type: "string", default: "fixtures/sam" },
  },
});

async function main() {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) throw new SmokeError("AUTH", "MODEL_API_KEY is not set (.env.local or environment)");
  if (!values.image || !values.point || !values.name) {
    throw new Error("usage: --image <path> --point <x>,<y> --name <fixture-name> [--out dir]");
  }
  const [px, py] = values.point.split(",").map((v) => Number.parseInt(v, 10));

  // Normalize like the browser will (§7.2 step 0): EXIF rotate → longest side ≤ 2048 → JPEG.
  // --point is given in the coordinates of the original file as displayed (after EXIF rotation).
  const original = sharp(await readFile(values.image)).rotate();
  const origMeta = await original.metadata();
  const origW = origMeta.autoOrient?.width ?? origMeta.width;
  const origH = origMeta.autoOrient?.height ?? origMeta.height;
  if (!origW || !origH) throw new SmokeError("INVALID_IMAGE", "could not read image dimensions");

  const scale = Math.min(1, MAX_SIDE / Math.max(origW, origH));
  const jpeg = await original
    .resize({ width: Math.round(origW * scale), height: Math.round(origH * scale), fit: "fill" })
    .jpeg({ quality: 90 })
    .toBuffer();
  const { width, height } = await sharp(jpeg).metadata();
  if (!width || !height) throw new SmokeError("INVALID_IMAGE", "normalization failed");

  const point = {
    x: clamp(Math.floor(px * (width / origW)), 0, width - 1),
    y: clamp(Math.floor(py * (height / origH)), 0, height - 1),
  };
  const promptText = buildObjectPrompt({
    size: { width, height },
    objects: [{ id: OBJECT_ID, prompts: [{ points: [point] }] }],
  });

  console.log(`image   ${values.image} ${origW}×${origH} → ${width}×${height} (${kb(jpeg.length)})`);
  console.log(`point   (${px},${py}) → (${point.x},${point.y})`);
  console.log(`prompt  ${promptText}`);

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: MODEL,
        input: [
          {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: promptText },
              { type: "input_image", image_url: `data:image/jpeg;base64,${jpeg.toString("base64")}` },
            ],
          },
        ],
        stream: true,
        metadata: { include_confidence: "true" },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new SmokeError("TIMEOUT", `no response within ${TIMEOUT_MS}ms`);
    }
    throw err;
  }

  if (!response.ok || !response.body) {
    const body = (await response.text()).slice(0, 500);
    const code: SmokeErrorCode =
      response.status === 429
        ? "RATE_LIMIT"
        : response.status === 401 || response.status === 403
          ? "AUTH"
          : "HTTP_ERROR";
    throw new SmokeError(code, `HTTP ${response.status}: ${body}`);
  }

  const result = await parseImageStream(sseEvents(response.body)).finalResult;
  const latencyMs = Date.now() - startedAt;

  for (const d of result.diagnostics) console.warn(`diag    ${d.severity} ${d.code} line ${d.line}: ${d.message}`);
  if (result.outcome.status !== "completed") console.warn(`outcome ${JSON.stringify(result.outcome)}`);

  const masks = recordsOfKind(result.records, "mask");
  console.log(`latency ${latencyMs}ms · records ${result.records.length} · masks ${masks.length}`);
  if (masks.length === 0) {
    if (result.diagnostics.some((d) => d.severity === "error")) {
      throw new SmokeError("MASK_PARSE_ERROR", "mask lines were dropped by the parser");
    }
    throw new SmokeError("NO_OBJECT", "API returned no object for this point");
  }
  if (masks.length > 1) console.log(`note    ${masks.length} mask records returned; using the first`);

  const rec = masks[0];
  const raster = decodeMaskToRaster(rec.mask);
  const { left, top, right, bottom } = rec.bounds;
  const bw = right - left;
  const bh = bottom - top;

  // Assumptions the PRD relies on — fail loudly if the API disagrees.
  const checks = {
    rasterMatchesMaskSize: raster.length === rec.mask.width * rec.mask.height,
    maskCoversBounds: rec.mask.width === bw && rec.mask.height === bh,
    boundsInsideImage: left >= 0 && top >= 0 && right <= width && bottom <= height,
    clickedPixelInMask:
      point.x >= left && point.x < right && point.y >= top && point.y < bottom
        ? raster[(point.y - top) * rec.mask.width + (point.x - left)] === 1
        : false,
  };
  let opaque = 0;
  for (const v of raster) opaque += v;
  const fill = opaque / raster.length;
  console.log(`mask    ${rec.mask.width}×${rec.mask.height} (${rec.mask.encoding}) at bounds ${JSON.stringify(rec.bounds)}`);
  console.log(`fill    ${(fill * 100).toFixed(1)}% · confidence ${rec.confidence ?? "n/a"}`);
  console.log(`checks  ${JSON.stringify(checks)}`);
  if (!checks.rasterMatchesMaskSize || !checks.maskCoversBounds) {
    throw new SmokeError("MASK_PARSE_ERROR", "mask raster does not match its bounds; revisit §7 assumptions");
  }

  // Outputs: cropped alpha mask, RGBA cutout, full-image overlay preview.
  const outDir = path.join(values.out!, values.name);
  await mkdir(outDir, { recursive: true });

  const alpha = Buffer.from(raster.map((v) => v * 255));
  const maskPng = await sharp(alpha, { raw: { width: bw, height: bh, channels: 1 } }).png().toBuffer();
  const crop = await sharp(jpeg).extract({ left, top, width: bw, height: bh }).removeAlpha().raw().toBuffer();
  const cutoutPng = await sharp(crop, { raw: { width: bw, height: bh, channels: 3 } })
    .joinChannel(alpha, { raw: { width: bw, height: bh, channels: 1 } })
    .png()
    .toBuffer();
  const tint = Buffer.alloc(bw * bh * 4);
  for (let i = 0; i < raster.length; i++) {
    tint.set([140, 82, 255, raster[i] ? 110 : 0], i * 4);
  }
  const overlayPng = await sharp(jpeg)
    .composite([{ input: tint, raw: { width: bw, height: bh, channels: 4 }, left, top }])
    .png()
    .toBuffer();

  const fixture = {
    origin: "PRECOMPUTED_SAMPLE",
    provenance: {
      model: MODEL,
      endpoint: ENDPOINT,
      capturedAt: new Date().toISOString(),
      sourceFile: path.basename(values.image),
      latencyMs,
      outcome: result.outcome,
      diagnostics: result.diagnostics.length,
    },
    prompt: { text: promptText, point },
    sourceDimensions: { width, height },
    sourceBbox: { x: left, y: top, width: bw, height: bh },
    confidence: rec.confidence ?? null,
    maskEncoding: rec.mask.encoding,
    fill,
    checks,
  };

  await Promise.all([
    writeFile(path.join(outDir, "source.jpg"), jpeg),
    writeFile(path.join(outDir, "mask.png"), maskPng),
    writeFile(path.join(outDir, "cutout.png"), cutoutPng),
    writeFile(path.join(outDir, "overlay.png"), overlayPng),
    writeFile(path.join(outDir, "raw-output.txt"), result.rawOutput),
    writeFile(path.join(outDir, "fixture.json"), JSON.stringify(fixture, null, 2) + "\n"),
  ]);
  console.log(`saved   ${outDir}/ (fixture.json, mask.png, cutout.png, overlay.png, source.jpg, raw-output.txt)`);
}

/** Minimal SSE reader: yields the JSON payload of each `data:` event. */
async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncIterable<ResponsesEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let sep: number;
    while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, "");
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data || data === "[DONE]") continue;
      yield JSON.parse(data) as ResponsesEvent;
    }
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function kb(bytes: number) {
  return `${Math.round(bytes / 1024)}KB`;
}

main().catch((err) => {
  if (err instanceof SmokeError) {
    console.error(`FAIL ${err.code}: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

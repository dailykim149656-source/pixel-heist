import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import {
  buildObjectPrompt,
  decodeMaskToRaster,
  parseImageStream,
  recordsOfKind,
  type ResponsesEvent,
} from "@meta-sam/parser";
import type { PromptPoint, SegmentErrorCode, SegmentResponse } from "@/lib/segment-types";

export const runtime = "nodejs";
export const maxDuration = 30;

const ENDPOINT = "https://api.meta.ai/v1/responses";
const MODEL = "sam-3.1";
const TIMEOUT_MS = 25_000;
/** Retry a transient failure only if it came back this fast; the function has 30s in all. */
const RETRY_BEFORE_MS = 12_000;
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_SIDE = 2048;
const MAX_POINTS = 8;
const CALLS_PER_HOUR = 40;

// Best-effort, per-instance memory only (PRD §7.3: no persistent storage of user images).
const cache = new Map<string, SegmentResponse>();
const callLog = new Map<string, number[]>();

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) return fail("NO_API_KEY", "MODEL_API_KEY is not set", 503);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("INVALID_IMAGE", "expected multipart/form-data", 400);
  }
  const image = form.get("image");
  const width = Number(form.get("imageWidth"));
  const height = Number(form.get("imageHeight"));
  let points: PromptPoint[];
  try {
    points = JSON.parse(String(form.get("points")));
  } catch {
    return fail("INVALID_IMAGE", "points must be JSON", 400);
  }
  if (!(image instanceof Blob) || !/^image\/(jpeg|png|webp)$/.test(image.type) || image.size > MAX_BYTES) {
    return fail("INVALID_IMAGE", "image must be JPEG/PNG/WebP under 4MB", 400);
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || Math.max(width, height) > MAX_SIDE) {
    return fail("INVALID_IMAGE", "bad image dimensions", 400);
  }
  if (
    !Array.isArray(points) ||
    points.length === 0 ||
    points.length > MAX_POINTS ||
    !points.some((p) => p.label === "positive") ||
    !points.every((p) => Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < width && p.y < height)
  ) {
    return fail("INVALID_IMAGE", "points must be integer pixels inside the image, with at least one positive", 400);
  }

  const bytes = Buffer.from(await image.arrayBuffer());
  const key = createHash("sha256").update(bytes).update(JSON.stringify(points)).digest("hex");
  const cached = cache.get(key);
  if (cached) return Response.json(cached);

  const client = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const recent = (callLog.get(client) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= CALLS_PER_HOUR) return fail("RATE_LIMIT", "hourly call limit reached", 429);
  callLog.set(client, [...recent, now]);

  const promptText = buildObjectPrompt({
    size: { width, height },
    objects: [{ id: 1, prompts: [{ points: points.map(({ x, y, label }) => ({ x, y, label })) }] }],
  });

  const startedAt = Date.now();
  const request = JSON.stringify({
    model: MODEL,
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: promptText },
          { type: "input_image", image_url: `data:${image.type};base64,${bytes.toString("base64")}` },
        ],
      },
    ],
    stream: true,
    metadata: { include_confidence: "true" },
  });

  // SAM's answer is deterministic, so a failure that isn't about the image (a stream cut off
  // mid-way, an upstream 5xx) is worth one quiet retry while there's time left.
  let attempt = await askSam(apiKey, request, TIMEOUT_MS);
  if (!attempt.ok && attempt.transient && Date.now() - startedAt < RETRY_BEFORE_MS) {
    console.warn("segment retry", attempt.code, attempt.message);
    attempt = await askSam(apiKey, request, TIMEOUT_MS - (Date.now() - startedAt));
  }
  if (!attempt.ok) {
    console.error("segment failed", attempt.code, attempt.message); // reason only: never log images or keys
    return fail(attempt.code, attempt.message, attempt.status);
  }
  const rec = attempt.rec;

  const raster = decodeMaskToRaster(rec.mask);
  const { left, top, right, bottom } = rec.bounds;
  const bw = right - left, bh = bottom - top;
  if (raster.length !== bw * bh || rec.mask.width !== bw) return fail("MASK_PARSE_ERROR", "mask does not match its box", 502);

  const png = new PNG({ width: bw, height: bh, colorType: 0, inputColorType: 0, inputHasAlpha: false });
  for (let i = 0; i < raster.length; i++) png.data[i] = raster[i] ? 255 : 0;
  const body: SegmentResponse = {
    ok: true,
    origin: "LIVE_API",
    latencyMs: Date.now() - startedAt,
    sourceDimensions: { width, height },
    sourceBbox: { x: left, y: top, width: bw, height: bh },
    confidence: rec.confidence ?? null,
    maskAlphaPngDataUrl: `data:image/png;base64,${PNG.sync.write(png, { colorType: 0, inputColorType: 0, inputHasAlpha: false }).toString("base64")}`,
  };
  cache.set(key, body);
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return Response.json(body);
}

type MaskRecord = ReturnType<typeof recordsOfKind<"mask">>[number];
type Attempt =
  | { ok: true; rec: MaskRecord }
  | { ok: false; code: SegmentErrorCode; message: string; status: number; transient: boolean };

/** One SAM call: request, read the stream, pick the mask record. */
async function askSam(apiKey: string, body: string, timeoutMs: number): Promise<Attempt> {
  const no = (code: SegmentErrorCode, message: string, status: number, transient = false): Attempt => ({ ok: false, code, message, status, transient });
  let upstream: Response;
  try {
    upstream = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "text/event-stream" },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (isTimeout(err)) return no("TIMEOUT", "SAM did not answer in time", 504);
    return no("UPSTREAM", `could not reach SAM: ${errorText(err)}`, 502, true);
  }
  if (upstream.status === 429) return no("RATE_LIMIT", "SAM rate limit", 429);
  if (!upstream.ok || !upstream.body) return no("UPSTREAM", `SAM returned ${upstream.status}`, 502, upstream.status >= 500);

  let result;
  try {
    result = await parseImageStream(sseEvents(upstream.body)).finalResult;
  } catch (err) {
    if (isTimeout(err)) return no("TIMEOUT", "SAM stream timed out", 504);
    return no("MASK_PARSE_ERROR", `could not read SAM stream: ${errorText(err)}`, 502, true);
  }
  const rec = recordsOfKind(result.records, "mask")[0];
  if (!rec) {
    const dropped = result.diagnostics.filter((d) => d.severity === "error");
    if (dropped.length) return no("MASK_PARSE_ERROR", `mask lines were dropped: ${dropped.map((d) => d.code).join(",")}`, 502, true);
    if (result.outcome.status !== "completed") return no("MASK_PARSE_ERROR", `stream ended ${result.outcome.status}`, 502, true);
    return no("NO_OBJECT", "no object at that point", 200);
  }
  const bw = rec.bounds.right - rec.bounds.left;
  if (rec.mask.width !== bw) return no("MASK_PARSE_ERROR", "mask does not match its box", 502);
  return { ok: true, rec };
}

const isTimeout = (err: unknown) => err instanceof DOMException && err.name === "TimeoutError";
/** The error and its causes (the parser wraps transport errors), for the log and the message. */
function errorText(err: unknown) {
  const parts: string[] = [];
  for (let e = err, depth = 0; e && depth < 4; e = e instanceof Error ? e.cause : null, depth++)
    parts.push(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  return parts.join(" ← ").slice(0, 300);
}

function fail(code: SegmentErrorCode, message: string, status: number) {
  return Response.json({ ok: false, code, message } satisfies SegmentResponse, { status });
}

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
      if (data && data !== "[DONE]") yield JSON.parse(data) as ResponsesEvent;
    }
  }
}

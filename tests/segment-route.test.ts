import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/segment/route";

/**
 * The live route against a recorded SAM 3.1 stream (fixtures/sam/mug/stream.sse). SAM's answer is
 * deterministic, so a stream that dies half-way is a transport failure and gets one quiet retry.
 */
const SSE = readFileSync("fixtures/sam/mug/stream.sse");

function sseResponse(cutAt?: number) {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      if (cutAt === undefined) {
        c.enqueue(SSE);
        c.close();
      } else {
        c.enqueue(SSE.subarray(0, cutAt));
        c.error(new TypeError("terminated"));
      }
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

let call = 0;
function request(x: number) {
  const form = new FormData();
  form.set("image", new Blob([new Uint8Array([0xff, 0xd8, 0xff, call++])], { type: "image/jpeg" }));
  form.set("imageWidth", "1448");
  form.set("imageHeight", "1086");
  form.set("points", JSON.stringify([{ x, y: 410, label: "positive" }]));
  return new Request("http://localhost/api/segment", { method: "POST", body: form });
}

describe("/api/segment", () => {
  beforeEach(() => {
    vi.stubEnv("MODEL_API_KEY", "test-key");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the mask from a complete stream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse()));
    const res = await POST(request(260));
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, origin: "LIVE_API", sourceBbox: { x: 51, y: 232 } });
  });

  it("retries once when the stream is cut off mid-way, and the user never sees it", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(sseResponse(SSE.length / 2)).mockResolvedValueOnce(sseResponse());
    vi.stubGlobal("fetch", fetch);
    const res = await POST(request(261));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("gives up after the retry and says why", async () => {
    const fetch = vi.fn(async () => sseResponse(1000));
    vi.stubGlobal("fetch", fetch);
    const res = await POST(request(262));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, code: "MASK_PARSE_ERROR", message: expect.stringMatching(/terminated/) });
  });

  it("doesn't retry a clean answer of 'no object'", async () => {
    // The same real stream with SAM's text emptied: a completed response that found nothing.
    const blank = (v: unknown): unknown =>
      Array.isArray(v) ? v.map(blank) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "delta" || k === "text" ? "" : blank(x)])) : v;
    const empty = SSE.toString().replace(/^data: (\{.*\})$/gm, (_, json) => `data: ${JSON.stringify(blank(JSON.parse(json)))}`);
    const fetch = vi.fn(async () => new Response(empty, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const res = await POST(request(263));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await res.json()).toMatchObject({ ok: false, code: "NO_OBJECT" });
  });
});

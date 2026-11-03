import { describe, expect, it } from "vitest";
import { samError, samReply, yourRequest } from "@/lib/sam-voice";
import type { SegmentSuccess } from "@/lib/segment-types";

const metrics = { lengthPx: 180, thicknessPx: 24, solidity: 0.85, aspect: 7.5, longestUnbrokenSpanPx: 179 };
const seg = (over: Partial<SegmentSuccess>): SegmentSuccess => ({
  ok: true, origin: "LIVE_API", latencyMs: 2373, confidence: 0.97,
  sourceDimensions: { width: 1448, height: 1086 }, sourceBbox: { x: 0, y: 0, width: 10, height: 10 }, maskAlphaPngDataUrl: "", ...over,
});

describe("Sam only reports what the API returned", () => {
  it("quotes live confidence, size and latency", () => {
    expect(samReply(seg({}), metrics, false).text).toBe("Got it, clean cut. 180×24px, confidence 0.97, 2.4s.");
  });

  it("says recorded cuts are recorded, never live", () => {
    const r = samReply(seg({ origin: "PRECOMPUTED_SAMPLE" }), metrics, false).text;
    expect(r).toMatch(/recorded/);
    expect(r).not.toMatch(/clean cut/);
  });

  it("flags low confidence and points to refine (the 0.52 digit-only ruler)", () => {
    const r = samReply(seg({ confidence: 0.52 }), metrics, false);
    expect(r.tone).toBe("warn");
    expect(r.text).toMatch(/0\.52.*Refine/);
  });

  it("offers recorded cuts on failure only when they exist", () => {
    expect(samError("TIMEOUT", true).text).toMatch(/recorded/);
    expect(samError("TIMEOUT", false).text).not.toMatch(/recorded/);
  });

  it("describes refine requests from the points", () => {
    expect(yourRequest([{ x: 1, y: 1, label: "positive" }, { x: 2, y: 2, label: "positive" }, { x: 3, y: 3, label: "negative" }], true)).toBe(
      "Close — include 1 more spot and skip 1 spot?",
    );
  });
});

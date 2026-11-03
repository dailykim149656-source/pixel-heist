/** Shared contract for POST /api/segment (PRD §7.3). */
export type PromptPoint = { x: number; y: number; label: "positive" | "negative" };

export type SegmentErrorCode = "INVALID_IMAGE" | "NO_OBJECT" | "RATE_LIMIT" | "TIMEOUT" | "MASK_PARSE_ERROR" | "NO_API_KEY" | "UPSTREAM";

export type SegmentSuccess = {
  ok: true;
  origin: "LIVE_API" | "PRECOMPUTED_SAMPLE";
  latencyMs: number;
  sourceDimensions: { width: number; height: number };
  sourceBbox: { x: number; y: number; width: number; height: number };
  confidence: number | null;
  maskAlphaPngDataUrl: string;
};

export type SegmentFailure = { ok: false; code: SegmentErrorCode; message: string };

export type SegmentResponse = SegmentSuccess | SegmentFailure;

export const SEGMENT_ERROR_TEXT: Record<SegmentErrorCode, string> = {
  INVALID_IMAGE: "That image couldn't be read. Try a JPG, PNG or WebP.",
  NO_OBJECT: "Nothing found there. Try clicking a plain part of an object.",
  RATE_LIMIT: "Too many requests right now. Wait a moment and click again.",
  TIMEOUT: "SAM took too long to answer. Click again to retry.",
  MASK_PARSE_ERROR: "The mask came back garbled. Click again to retry.",
  NO_API_KEY: "Live SAM isn't configured on this server.",
  UPSTREAM: "The SAM API returned an error. Click again to retry.",
};

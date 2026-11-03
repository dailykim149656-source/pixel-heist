import type { ShapeMetrics } from "./geometry";
import type { PromptPoint, SegmentErrorCode, SegmentSuccess } from "./segment-types";

/**
 * "Sam" is the in-game face of Meta SAM 3.1 — a cut-out specialist you message.
 * Every line reports what the model actually returned; Sam never claims more than the API said,
 * and the UI always labels Sam as the SAM 3.1 model.
 */
export type ChatMessage = { id: number; from: "you" | "sam"; text: string; tone?: "ok" | "warn" | "error" };

export const SAM_LABEL = "Meta SAM 3.1";
const LOW_CONFIDENCE = 0.7;

export function samGreeting(photoKind: "sample" | "upload"): string {
  return photoKind === "sample"
    ? "Sam here. Point at something on that desk and I'll cut it out for you. Plain spots work best."
    : "Got your photo. Click whatever you want stolen and I'll cut it out.";
}

export function yourRequest(points: PromptPoint[], refining: boolean): string {
  if (!refining) return "Can you cut out this one?";
  const add = points.filter((p) => p.label === "positive").length - 1;
  const skip = points.filter((p) => p.label === "negative").length;
  const parts = [add > 0 && `include ${add} more spot${add > 1 ? "s" : ""}`, skip > 0 && `skip ${skip} spot${skip > 1 ? "s" : ""}`].filter(Boolean);
  return `Close — ${parts.join(" and ")}?`;
}

export function samReply(seg: SegmentSuccess, metrics: ShapeMetrics, refining: boolean): Omit<ChatMessage, "id" | "from"> {
  const conf = seg.confidence;
  const size = `${metrics.lengthPx}×${metrics.thicknessPx}px`;
  if (seg.origin === "PRECOMPUTED_SAMPLE") {
    return {
      text: `Here's the cut I made for this desk earlier (recorded, ${seg.latencyMs}ms, confidence ${fmt(conf)}). ${size} once flattened.`,
      tone: "ok",
    };
  }
  if (conf !== null && conf < LOW_CONFIDENCE) {
    return {
      text: `Not sure about this one — confidence ${fmt(conf)}. Shift+click more of the object, or Alt+click what to leave out, then Refine.`,
      tone: "warn",
    };
  }
  return {
    text: `${refining ? "Adjusted." : "Got it, clean cut."} ${size}, confidence ${fmt(conf)}, ${(seg.latencyMs / 1000).toFixed(1)}s.`,
    tone: "ok",
  };
}

export function samError(code: SegmentErrorCode, recordedAvailable: boolean): Omit<ChatMessage, "id" | "from"> {
  const fallback = recordedAvailable ? " You can switch to my recorded cuts meanwhile." : "";
  const text: Record<SegmentErrorCode, string> = {
    NO_OBJECT: "Couldn't find anything there. Try a plain part of the object.",
    TIMEOUT: `That took me too long and I gave up. Ping me again?${fallback}`,
    RATE_LIMIT: `Too many requests in a row — give me a moment.${fallback}`,
    MASK_PARSE_ERROR: "My mask came back garbled. Ask again and I'll redo it.",
    NO_API_KEY: `I'm not connected on this server, so I can't cut live.${fallback}`,
    UPSTREAM: `Something broke on my end. Try again in a sec.${fallback}`,
    INVALID_IMAGE: "I can't read that image. JPG, PNG or WebP please.",
  };
  return { text: text[code], tone: code === "NO_OBJECT" ? "warn" : "error" };
}

export function samRecordedMiss(): Omit<ChatMessage, "id" | "from"> {
  return { text: "I only have recorded cuts for the mug and the ruler. Switch me to LIVE to try that spot.", tone: "warn" };
}

export function samBagged(lootCount: number): string {
  return lootCount === 1 ? "Bagged. Drag it into the sketch — I only cut, the shape does the rest." : "Bagged. That's in your loot too.";
}

function fmt(c: number | null) {
  return c === null ? "n/a" : c.toFixed(2);
}

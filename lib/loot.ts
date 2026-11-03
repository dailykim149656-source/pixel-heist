"use client";

import { fitWithin } from "./coords";
import { boxShape, maskFromAlpha, normalizeShape, type Mask, type Shape } from "./geometry";
import type { PromptPoint, SegmentResponse, SegmentSuccess } from "./segment-types";
import { SAMPLES, type SampleId } from "./samples";
import { MAX_LOOT } from "./stage";

/** Item in the player's inventory (PRD §6.2). Placement lives in the game state, not here. */
export type LootItem = {
  id: string;
  origin: SegmentSuccess["origin"];
  shape: Shape;
  /** Bounding box of the same pixels, for the X-ray comparison. */
  box: Shape;
  /** Cutout pre-rendered at 2× game resolution in the deskewed frame. */
  sprite: HTMLCanvasElement;
  thumbUrl: string;
  confidence: number | null;
  latencyMs: number;
};

export type Photo = {
  url: string;
  blob: Blob;
  width: number;
  height: number;
  image: HTMLImageElement;
  kind: "sample" | "upload";
  sampleId?: SampleId;
};

export const SPRITE_RES = 2;
const MAX_SIDE = 2048;
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024; // phone camera originals; downscaled before upload

/** EXIF-rotate, cap at 2048px and re-encode as JPEG (PRD §7.2 step 0). */
export async function normalizePhoto(file: Blob, kind: Photo["kind"], sampleId?: SampleId): Promise<Photo> {
  // Phone cameras hand over HEIC or an empty type; anything the browser can decode is fine,
  // since it's re-encoded as JPEG below before it goes anywhere.
  if (file.type && !file.type.startsWith("image/")) throw new Error("That file isn't an image.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`Image is over ${MAX_UPLOAD_BYTES >> 20}MB.`);
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => {
    throw new Error("This browser can't open that image. Try a JPG or PNG.");
  });
  const size = fitWithin(bitmap, MAX_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.9),
  );
  const url = URL.createObjectURL(blob);
  return { url, blob, width: size.width, height: size.height, image: await loadImage(url), kind, sampleId };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

export async function readMask(maskUrl: string): Promise<{ mask: Mask; image: HTMLImageElement }> {
  const image = await loadImage(maskUrl);
  const c = document.createElement("canvas");
  c.width = image.naturalWidth;
  c.height = image.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  return { mask: maskFromAlpha(c.width, c.height, data), image };
}

/** A segmentation result ready for preview: mask, normalized shape and the bbox cutout. */
export type Preview = {
  seg: SegmentSuccess;
  mask: Mask;
  shape: Shape;
  box: Shape;
  cutout: HTMLCanvasElement; // bbox-sized RGBA, original pixels
  points: PromptPoint[];
};

export async function buildPreview(photo: Photo, seg: SegmentSuccess, points: PromptPoint[]): Promise<Preview> {
  const { mask } = await readMask(seg.maskAlphaPngDataUrl);
  const { x, y, width, height } = seg.sourceBbox;
  const cutout = document.createElement("canvas");
  cutout.width = width;
  cutout.height = height;
  const ctx = cutout.getContext("2d")!;
  ctx.drawImage(photo.image, x, y, width, height, 0, 0, width, height);
  const img = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < mask.data.length; i++) img.data[i * 4 + 3] = mask.data[i] ? 255 : 0;
  ctx.putImageData(img, 0, 0);
  const shape = normalizeShape(mask);
  return { seg, mask, shape, box: boxShape(mask, shape.toSource.scale), cutout, points };
}

let nextId = 1;

export function extractLoot(preview: Preview): LootItem {
  const { shape, cutout } = preview;
  const t = shape.toSource;
  const sprite = document.createElement("canvas");
  sprite.width = shape.grid.width * SPRITE_RES;
  sprite.height = shape.grid.height * SPRITE_RES;
  const ctx = sprite.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  // grid = scale · (R(θ)(mask − centroid) − min); see normalizeShape.
  ctx.scale(SPRITE_RES * t.scale, SPRITE_RES * t.scale);
  ctx.translate(-t.minX, -t.minY);
  ctx.rotate(t.thetaRad);
  ctx.translate(-t.cx, -t.cy);
  ctx.drawImage(cutout, 0, 0);
  return {
    id: `loot_${nextId++}`,
    origin: preview.seg.origin,
    shape,
    box: preview.box,
    sprite,
    thumbUrl: sprite.toDataURL("image/png"),
    confidence: preview.seg.confidence,
    latencyMs: preview.seg.latencyMs,
  };
}

export async function segmentLive(photo: Photo, points: PromptPoint[]): Promise<SegmentResponse> {
  const form = new FormData();
  form.set("image", photo.blob, "photo.jpg");
  form.set("imageWidth", String(photo.width));
  form.set("imageHeight", String(photo.height));
  form.set("points", JSON.stringify(points));
  try {
    const res = await fetch("/api/segment", { method: "POST", body: form, signal: AbortSignal.timeout(35_000) });
    return (await res.json()) as SegmentResponse;
  } catch (err) {
    const timeout = err instanceof DOMException && err.name === "TimeoutError";
    return { ok: false, code: timeout ? "TIMEOUT" : "UPSTREAM", message: String(err) };
  }
}

type SampleFixture = {
  sourceDimensions: SegmentSuccess["sourceDimensions"];
  sourceBbox: SegmentSuccess["sourceBbox"];
  confidence: number | null;
  provenance: { latencyMs: number; capturedAt: string; model: string };
  mask: Mask;
  maskUrl: string;
};

const sampleFixtures = new Map<SampleId, Promise<SampleFixture[]>>();

function loadSampleFixtures(id: SampleId) {
  if (!sampleFixtures.has(id))
    sampleFixtures.set(
      id,
      Promise.all(
        SAMPLES[id].fixtures.map(async (name) => {
      const meta = await (await fetch(`/sample/${name}/fixture.json`)).json();
      const maskUrl = `/sample/${name}/mask.png`;
          return { ...meta, maskUrl, mask: (await readMask(maskUrl)).mask } as SampleFixture;
        }),
      ),
    );
  return sampleFixtures.get(id)!;
}

/** Precomputed path: return the recorded SAM result whose mask contains the click (PRD FR-10). */
export async function segmentSample(id: SampleId, point: { x: number; y: number }): Promise<SegmentResponse> {
  for (const f of await loadSampleFixtures(id)) {
    const lx = point.x - f.sourceBbox.x, ly = point.y - f.sourceBbox.y;
    if (lx >= 0 && ly >= 0 && lx < f.mask.width && ly < f.mask.height && f.mask.data[ly * f.mask.width + lx]) {
      const blob = await (await fetch(f.maskUrl)).blob();
      return {
        ok: true,
        origin: "PRECOMPUTED_SAMPLE",
        latencyMs: f.provenance.latencyMs,
        sourceDimensions: f.sourceDimensions,
        sourceBbox: f.sourceBbox,
        confidence: f.confidence,
        maskAlphaPngDataUrl: await blobToDataUrl(blob),
      };
    }
  }
  return { ok: false, code: "NO_OBJECT", message: "No recorded SAM result here. Switch to LIVE to segment this spot." };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(blob);
  });
}

export { MAX_LOOT };

import { describe, expect, it } from "vitest";
import { boxToImagePixel, containRect, fitWithin } from "@/lib/coords";

describe("click → image pixel (PRD §7.2, T01)", () => {
  const img = { width: 1448, height: 1086 };

  it("maps through pillarbox letterboxing", () => {
    const box = { width: 400, height: 200 }; // image is shown 266.7×200, 66.7px bars each side
    const r = containRect(box, img);
    expect(r.top).toBe(0);
    expect(r.left).toBeCloseTo(66.67, 1);
    expect(boxToImagePixel({ x: r.left, y: 0 }, box, img)).toEqual({ x: 0, y: 0 });
    expect(boxToImagePixel({ x: r.left + r.width - 0.01, y: 199.99 }, box, img)).toEqual({ x: 1447, y: 1085 });
  });

  it("maps through letterboxing on top and bottom", () => {
    const box = { width: 300, height: 400 };
    const r = containRect(box, img);
    expect(r.left).toBe(0);
    const center = boxToImagePixel({ x: 150, y: 200 }, box, img);
    expect(center).toEqual({ x: 724, y: 543 });
  });

  it("ignores clicks on the bars", () => {
    const box = { width: 400, height: 200 };
    expect(boxToImagePixel({ x: 10, y: 100 }, box, img)).toBeNull();
    expect(boxToImagePixel({ x: 395, y: 100 }, box, img)).toBeNull();
  });

  it("round-trips the sample's mug click", () => {
    const box = { width: 320, height: 240 };
    const r = containRect(box, img);
    const shown = { x: r.left + 260 * r.scale + r.scale / 2, y: r.top + 410 * r.scale + r.scale / 2 };
    expect(boxToImagePixel(shown, box, img)).toEqual({ x: 260, y: 410 });
  });
});

describe("normalization size", () => {
  it("caps the longest side at 2048 and never upscales", () => {
    expect(fitWithin({ width: 4032, height: 3024 }, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin({ width: 1448, height: 1086 }, 2048)).toEqual({ width: 1448, height: 1086 });
  });
});

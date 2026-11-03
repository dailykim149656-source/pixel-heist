/** Where an image of `img` size actually sits inside a `box` with object-fit: contain (PRD §7.2). */
export function containRect(box: { width: number; height: number }, img: { width: number; height: number }) {
  const scale = Math.min(box.width / img.width, box.height / img.height);
  const width = img.width * scale, height = img.height * scale;
  return { left: (box.width - width) / 2, top: (box.height - height) / 2, width, height, scale };
}

/** Box-relative pointer position → integer image pixel, or null when the click is on the letterbox. */
export function boxToImagePixel(
  point: { x: number; y: number },
  box: { width: number; height: number },
  img: { width: number; height: number },
): { x: number; y: number } | null {
  const r = containRect(box, img);
  const rx = point.x - r.left, ry = point.y - r.top;
  if (rx < 0 || ry < 0 || rx >= r.width || ry >= r.height) return null;
  return {
    x: Math.min(img.width - 1, Math.floor(rx / r.scale)),
    y: Math.min(img.height - 1, Math.floor(ry / r.scale)),
  };
}

/** Scale to fit the longest side within maxSide (never upscales). */
export function fitWithin(size: { width: number; height: number }, maxSide: number) {
  const k = Math.min(1, maxSide / Math.max(size.width, size.height));
  return { width: Math.round(size.width * k), height: Math.round(size.height * k) };
}

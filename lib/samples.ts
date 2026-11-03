/** Built-in sample desks (AI-generated images) and the real SAM 3.1 cuts recorded for each. */
export type SampleId = "a" | "b";

export const SAMPLES: Record<SampleId, { label: string; image: string; fixtures: string[] }> = {
  a: { label: "Desk A", image: "desk.png", fixtures: ["mug", "ruler"] },
  b: { label: "Desk B", image: "desk-b.png", fixtures: ["d2-pen", "d2-calculator", "d2-sticky", "d2-scissors"] },
};

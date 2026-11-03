// Copies the shipped sample desks and their recorded SAM fixtures into public/ for the browser.
// Keep in sync with lib/samples.ts.
import { cp, mkdir } from "node:fs/promises";

const SAMPLES = {
  "desk.png": ["mug", "ruler"],
  "desk-b.png": ["d2-pen", "d2-calculator", "d2-sticky", "d2-scissors"],
};
await mkdir("public/sample", { recursive: true });
for (const [image, fixtures] of Object.entries(SAMPLES)) {
  await cp(`samples/${image}`, `public/sample/${image}`);
  for (const name of fixtures) {
    await mkdir(`public/sample/${name}`, { recursive: true });
    for (const file of ["fixture.json", "mask.png"]) await cp(`fixtures/sam/${name}/${file}`, `public/sample/${name}/${file}`);
  }
}
console.log(`synced ${Object.keys(SAMPLES).length} sample desks → public/sample`);

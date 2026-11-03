// Copies the shipped sample image and its SAM fixtures into public/ so the browser can load them.
import { cp, mkdir } from "node:fs/promises";

const SAMPLE_FIXTURES = ["mug", "ruler"];
await mkdir("public/sample", { recursive: true });
await cp("samples/desk.png", "public/sample/desk.png");
for (const name of SAMPLE_FIXTURES) {
  await mkdir(`public/sample/${name}`, { recursive: true });
  for (const file of ["fixture.json", "mask.png"]) {
    await cp(`fixtures/sam/${name}/${file}`, `public/sample/${name}/${file}`);
  }
}
console.log(`synced sample + ${SAMPLE_FIXTURES.join(", ")} → public/sample`);

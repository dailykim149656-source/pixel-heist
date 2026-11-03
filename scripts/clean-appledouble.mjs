// macOS writes "._*" metadata files on exFAT volumes; Turbopack's build cache chokes on them
// ("Loading persistence directory failed"). Remove them from build output before building.
import { readdir, rm } from "node:fs/promises";
import path from "node:path";

async function sweep(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let n = 0;
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.name.startsWith("._")) {
      await rm(p, { force: true, recursive: true });
      n++;
    } else if (e.isDirectory()) n += await sweep(p);
  }
  return n;
}

const removed = await sweep(".next");
if (removed) console.log(`removed ${removed} AppleDouble files from .next`);

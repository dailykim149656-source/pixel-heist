// Cuts the demo video from the phone screen recording and the desktop footage that
// `npx playwright test -c demo.config.ts` records into recordings/raw.
// Usage: node scripts/make-demo.mjs "<phone recording.mp4>"  →  recordings/pixel-heist-demo.mp4
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const phone = process.argv[2];
if (!phone) throw new Error("Pass the phone screen recording as the first argument.");
const OUT = "recordings", WORK = path.join(OUT, "work");
mkdirSync(WORK, { recursive: true });
const raw = (n) => {
  const dir = readdirSync(path.join(OUT, "raw")).find((d) => d.startsWith(`demo.rec.ts-${n}-`));
  return path.join(OUT, "raw", dir, "video.webm");
};

const W = 1920, H = 1080, PAPER = "#efe6d6", INK = "#3f3a34";
const FONT = "Chalkboard SE";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Top-centre caption pill for desktop footage. */
async function pill(text, file) {
  const w = Math.min(1500, 120 + text.length * 19);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="68"><rect width="${w}" height="68" rx="16" fill="${INK}" fill-opacity="0.92"/><text x="${w / 2}" y="45" font-family="${FONT}" font-size="32" fill="#fff7d6" text-anchor="middle">${esc(text)}</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

/** Left-hand caption card next to the phone. */
async function side(title, lines, file) {
  const body = lines.map((l, i) => `<text x="0" y="${150 + i * 54}" font-family="${FONT}" font-size="36" fill="${INK}">${esc(l)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${170 + lines.length * 54}"><rect x="0" y="22" width="${18 + title.length * 34}" height="62" fill="#ffe74c"/><text x="8" y="72" font-family="${FONT}" font-size="58" fill="${INK}">${esc(title)}</text>${body}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

async function card(lines, file) {
  const t = lines.map((l, i) => `<text x="${W / 2}" y="${430 + i * 90}" font-family="${FONT}" font-size="${i === 0 ? 110 : 44}" fill="${INK}" text-anchor="middle">${esc(l)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${PAPER}"/><rect x="${W / 2 - 430}" y="360" width="860" height="70" fill="#ffe74c"/>${t}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

const enc = ["-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-an"];
const ff = (args) => execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-y", ...args], { stdio: "inherit" });
const parts = [];

/** `inset` blows up part of the 1600×900 recording (e.g. Muse's reply) beside the action. */
async function desktop(name, src, from, to, speed, caption, inset) {
  const out = path.join(WORK, `${parts.length}-${name}.mp4`), cap = path.join(WORK, `${name}.png`);
  let chain = `[0:v]trim=${from}:${to},setpts=(PTS-STARTPTS)/${speed},fps=30`;
  if (inset) {
    const { x, y, w, h, k, at } = inset;
    chain += `,split[full][z];[z]crop=${w}:${h}:${x}:${y},scale=${Math.round(w * k)}:-2:flags=lanczos,pad=iw+8:ih+8:4:4:color=0x8c52ff[zz];[full]scale=${W}:${H}:flags=lanczos[bg];[bg][zz]overlay=${at[0]}:${at[1]}`;
  } else chain += `,scale=${W}:${H}:flags=lanczos`;
  if (caption) {
    await pill(caption, cap);
    ff(["-i", src, "-i", cap, "-filter_complex", `${chain}[v];[v][1:v]overlay=(W-w)/2:16`, ...enc, out]);
  } else ff(["-i", src, "-filter_complex", chain, ...enc, out]);
  parts.push(out);
}

async function phoneClip(name, from, to, title, lines) {
  const out = path.join(WORK, `${parts.length}-${name}.mp4`), cap = path.join(WORK, `${name}.png`);
  await side(title, lines, cap);
  const d = to - from;
  ff([
    "-i", phone, "-i", cap, "-f", "lavfi", "-i", `color=c=${PAPER}:s=${W}x${H}:d=${d}:r=30`,
    "-filter_complex",
    `[0:v]trim=${from}:${to},setpts=PTS-STARTPTS,scale=-2:${H - 60},fps=30[p];[2:v][p]overlay=1180:30[b];[b][1:v]overlay=110:(H-h)/2`,
    "-t", String(d), ...enc, out,
  ]);
  parts.push(out);
}

async function endCard(name, lines, seconds) {
  const out = path.join(WORK, `${parts.length}-${name}.mp4`), png = path.join(WORK, `${name}.png`);
  await card(lines, png);
  ff(["-loop", "1", "-t", String(seconds), "-i", png, "-vf", "fps=30", ...enc, out]);
  parts.push(out);
}

await desktop("landing", raw("01"), 0, 6, 1, "Steal reality. Escape the sketch.");
await desktop("prologue", raw("01"), 9, 29.3, 3, "Prologue: your partner Sam is Meta SAM 3.1");
await phoneClip("phone-photo", 27, 38, "LIVE on an iPhone", ["Snap any real object.", "Tap it, and Sam (Meta SAM 3.1)", "cuts out its exact pixels."]);
await phoneClip("phone-cut", 54, 74, "Real mask, real numbers", ["The game measures only the shape:", "length, thickness, solidity, holes.", "Confidence and latency are", "straight from the API.", "Drop it on the camera's rays: blocked."]);
await desktop("too-thick", raw("02"), 2, 16, 2.5, "Shape decides the job: the mug is too thick for the lasers");
await desktop("muse", raw("02"), 16, 33, 1.1, "Ask Muse (Meta Muse Spark): it words what the engine worked out", { x: 1240, y: 520, w: 330, h: 250, k: 2.2, at: [24, 330] });
await desktop("way1", raw("02"), 33, 42, 1.8, "Way 1: a thin bar across the gap");
await desktop("way2", raw("02"), 42, 60, 2.6, "Way 2: weight on the far plate lowers the drawbridge");
await desktop("way3", raw("02"), 60, 87.8, 3, "Way 3: a real hole on the hook. Same gap, three answers");
await desktop("xray", raw("02b"), 19.7, 25.7, 1, "X-ray: the same plan as bounding boxes fails");
// The Curator's Challenge, twice: different loot, different rooms, each checked by the engine.
await desktop("curatorA-steal", raw("06"), 3, 40, 6, "Curator's Challenge: Muse designs a room for this loot (mug + ruler)");
await desktop("curatorA-room", raw("06"), 40, 48, 1, "Muse drew it. The engine checked it's beatable with these exact cut-outs", { x: 505, y: 235, w: 660, h: 430, k: 1.5, at: [466, 150] });
await desktop("curatorA-play", raw("06"), 48, 76.6, 2.6, "Twin Cut Crossing: played and cleared");
await desktop("curatorB-steal", raw("07"), 0, 29, 5, "Different loot (pen + calculator + scissors)…");
await desktop("curatorB-room", raw("07"), 29, 36, 1, "…a different room", { x: 505, y: 235, w: 660, h: 430, k: 1.5, at: [466, 150] });
await desktop("curatorB-play", raw("07"), 36, 59.1, 2.6, "Scissors on the hook, calculator on the camera, pen across");
await desktop("stage8", raw("04"), 47, 85.8, 3, "Stage 8 of 10: sensor beams only a thin bar can slip between");
await desktop("ending", raw("05"), 49, 72, 1.2, null);
await endCard("end", ["PIXEL HEIST", "pixel-heist.vercel.app", "Built with Meta SAM 3.1 + Muse Spark 1.3 · sample desks are AI-generated"], 4);

const list = path.join(WORK, "list.txt");
writeFileSync(list, parts.map((p) => `file '${path.resolve(p)}'`).join("\n"));
ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", path.join(OUT, "pixel-heist-demo.mp4")]);
console.log("wrote recordings/pixel-heist-demo.mp4");

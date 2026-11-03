// Cuts the demo video from the phone screen recording and the desktop footage that
// `npx playwright test -c demo.config.ts` records into recordings/raw.
// Usage: node scripts/make-demo.mjs "<phone recording.mp4>"  →  recordings/pixel-heist-demo.mp4
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

// Sound: every scene's recording comes with audio.json (what the game played, and when). Events in a
// used stretch are moved onto the output timeline; voices are kept only where the video plays
// near real speed, so lines never pile up.
const events = []; // { file, at, volume, dur? }
const narration = []; // { file, at }: the narrator, mixed on top with the rest ducked under it
let outT = 0;
/** Starts narration line `n` (assets/narration/nNN.mp3) at the next segment, never over the last one. */
function say(n) {
  const file = `assets/narration/n${String(n).padStart(2, "0")}.mp3`;
  const prev = narration.at(-1);
  narration.push({ file, at: Math.max(outT + 0.3, prev ? prev.at + durationOf(prev.file) + 0.3 : 0) });
}
const durationOf = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
let endingAt = null;

function soundsFor(src, from, to, speed) {
  let audio;
  try {
    audio = JSON.parse(readFileSync(path.join(path.dirname(src), "audio.json"), "utf8"));
  } catch {
    return;
  }
  const at = (t) => outT + ((t - audio.t0) / 1000 - from) / speed;
  const inside = (t) => (t - audio.t0) / 1000 >= from && (t - audio.t0) / 1000 < to;
  let stepsFrom = null;
  for (const e of audio.log) {
    if (e.kind === "music") {
      if (e.name === "ending" && inside(e.t)) endingAt = at(e.t);
      continue;
    }
    if (e.kind === "steps") {
      if (e.name) stepsFrom = e.t;
      else if (stepsFrom !== null && inside(stepsFrom) && speed <= 3.5) events.push({ file: "public/audio/sfx/run.mp3", at: at(stepsFrom), volume: 0.45, dur: (e.t - stepsFrom) / 1000 / speed, loop: true });
      continue;
    }
    if (!inside(e.t)) continue;
    if (e.kind === "voice" && speed <= 1.3) events.push({ file: `public/audio/vo/${e.name}.mp3`, at: at(e.t), volume: 1 });
    if (e.kind === "sfx" && speed <= 3.5 && (e.name !== "panel" || speed <= 1.3)) events.push({ file: `public/audio/sfx/${e.name}.mp3`, at: at(e.t), volume: e.volume ?? 0.8 });
  }
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
  soundsFor(src, from, to, speed);
  parts.push(out);
  outT += durationOf(out);
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
  outT += durationOf(out);
}

async function endCard(name, lines, seconds) {
  const out = path.join(WORK, `${parts.length}-${name}.mp4`), png = path.join(WORK, `${name}.png`);
  await card(lines, png);
  ff(["-loop", "1", "-t", String(seconds), "-i", png, "-vf", "fps=30", ...enc, out]);
  parts.push(out);
  outT += durationOf(out);
}

say(1);
await desktop("landing", raw("01"), 0, 6, 1, "Steal reality. Escape the sketch.");
await desktop("prologue", raw("01"), 9, 29.5, 3, "Prologue: your partner Sam is Meta SAM 3.1");
say(2);
await desktop("map", raw("01"), 29.8, 37.8, 1, "The museum map: ten rooms, one new rule each");
say(3);
await phoneClip("phone-photo", 27, 38, "LIVE on an iPhone", ["Snap any real object.", "Tap it, and Sam (Meta SAM 3.1)", "cuts out its exact pixels."]);
say(4);
await phoneClip("phone-cut", 54, 74, "Real mask, real numbers", ["The game measures only the shape:", "length, thickness, solidity, holes.", "Confidence and latency are", "straight from the API.", "Drop it on the camera's rays: blocked."]);
say(5);
await desktop("too-thick", raw("02"), 2, 16, 2.5, "Shape decides the job: the mug is too thick for the lasers");
await desktop("muse", raw("02"), 16, 31, 1.1, "Ask Muse (Meta Muse Spark): it words what the engine worked out", { x: 1240, y: 520, w: 330, h: 250, k: 2.2, at: [24, 330] });
say(6);
await desktop("way1", raw("02"), 31, 39, 1.8, "Way 1: a thin bar across the gap");
await desktop("way2", raw("02"), 39, 60.5, 2.6, "Way 2: weight on the far plate lowers the drawbridge");
await desktop("way3", raw("02"), 60.5, 86, 3, "Way 3: a real hole on the hook. Same gap, three answers");
say(7);
await desktop("xray", raw("02b"), 17.3, 23.3, 1, "X-ray: the same plan as bounding boxes fails");
// The Curator's Challenge, twice: different loot, different rooms, each checked by the engine.
const curatorCard = { x: 515, y: 245, w: 570, h: 410, k: 1.6, at: [504, 170] };
say(8);
await desktop("curatorA-steal", raw("06"), 3, 38.3, 6, "Curator's Challenge: Muse designs a room for this loot (mug + ruler)");
await desktop("curatorA-room", raw("06"), 38.3, 44, 1, "Muse drew it. The engine checked it's beatable with these exact cut-outs", curatorCard);
await desktop("curatorA-play", raw("06"), 44, 61.4, 2.4, "Played and cleared");
say(9);
await desktop("curatorB-steal", raw("07"), 0, 23.5, 6, "Different loot (pen + calculator + scissors)…");
await desktop("curatorB-room", raw("07"), 23.5, 29.4, 1, "…a different wing, a different room", curatorCard);
await desktop("curatorB-play", raw("07"), 29.4, 55.7, 2.6, "Scissors on the hook, calculator on the camera, pen across");
say(10);
await desktop("stage8", raw("04"), 61.5, 90.7, 3, "Stage 8 of 10: sensor beams only a thin bar can slip between");
await desktop("ending", raw("05"), 50, 84.7, 1.2, "Ending · voices, music and effects generated with ElevenLabs");
say(11);
await endCard("end", ["PIXEL HEIST", "pixel-heist.vercel.app", "Built with Meta SAM 3.1 + Muse Spark 1.3 · sample desks are AI-generated"], 4);

const list = path.join(WORK, "list.txt");
writeFileSync(list, parts.map((p) => `file '${path.resolve(p)}'`).join("\n"));
const silent = path.join(WORK, "silent.mp4");
ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", silent]);

// Mix: the heist loop under everything, the ending theme from the ending comic on, then the
// game's own sounds at their moments.
const total = outT, switchAt = endingAt ?? total;
const inputs = ["-i", silent, "-stream_loop", "-1", "-i", "public/audio/bgm.mp3", "-i", "public/audio/ending.mp3"];
const graph = [
  `[1:a]atrim=0:${switchAt.toFixed(3)},afade=t=out:st=${Math.max(0, switchAt - 1.5).toFixed(3)}:d=1.5,volume=0.55[bed]`,
  `[2:a]adelay=${Math.round(switchAt * 1000)}|${Math.round(switchAt * 1000)},volume=0.9[theme]`,
];
const labels = ["[bed]", "[theme]"];
events.forEach((e, i) => {
  inputs.push(...(e.loop ? ["-stream_loop", "-1"] : []), "-i", e.file);
  const ms = Math.max(0, Math.round(e.at * 1000));
  graph.push(`[${i + 3}:a]${e.dur ? `atrim=0:${e.dur.toFixed(3)},` : ""}volume=${e.volume},adelay=${ms}|${ms}[e${i}]`);
  labels.push(`[e${i}]`);
});
graph.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=longest[game]`);
// The narrator rides on top; the game's music and sounds duck under each line.
const nLabels = narration.map((n, i) => {
  const k = events.length + 3 + i, ms = Math.round(n.at * 1000);
  inputs.push("-i", n.file);
  graph.push(`[${k}:a]volume=1.6,adelay=${ms}|${ms}[n${i}]`);
  return `[n${i}]`;
});
graph.push(`${nLabels.join("")}amix=inputs=${nLabels.length}:normalize=0:duration=longest,asplit[voice][key]`);
graph.push(`[game][key]sidechaincompress=threshold=0.02:ratio=8:attack=40:release=500[ducked]`);
graph.push(`[ducked][voice]amix=inputs=2:normalize=0:duration=longest,apad,atrim=0:${total.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11[mix]`);
const script = path.join(WORK, "mix.txt");
writeFileSync(script, graph.join(";\n"));
ff([...inputs, "-filter_complex_script", script, "-map", "0:v", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", path.join(OUT, "pixel-heist-demo.mp4")]);
console.log(`mixed ${events.length} sounds and ${narration.length} narration lines; ending theme at ${switchAt.toFixed(1)}s of ${total.toFixed(1)}s`);
console.log("wrote recordings/pixel-heist-demo.mp4");

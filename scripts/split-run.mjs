#!/usr/bin/env node
// Cuts the "run-take" clip (she stands facing you, turns, runs on the spot,
// stops and turns back; see art/clips.json) into the three pieces the app
// plays around a run:
//
//   run-start  a beat of standing, the turn, the first strides
//   run        one gait cycle that loops seamlessly while she crosses the screen
//   run-stop   the last strides, slowing down, turning back, a beat of standing
//
// The loop is the one-cycle stretch whose last frame best matches its first,
// and run-stop starts on a frame that matches the loop's first frame, so the
// app can drop into it at the same point in her stride.
//
//   npm run clips -- run-take && node scripts/split-run.mjs

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIPS = path.join(
  path.resolve(root, process.env.WIFEY_ART || 'art/private'),
  'clips',
);
const RAW = path.join(CLIPS, 'raw', 'run-take.mp4');
// npm run clips writes the keyed take here; after a split it lives in raw/.
const KEYED = [
  path.join(CLIPS, 'run-take.webm'),
  path.join(CLIPS, 'raw', 'run-take.webm'),
].find((f) => fs.existsSync(f));
const FPS = 24;
const S = 96; // analysis size
// Seconds of standing kept before the turn.
const LEAD_IN = 0.5;
// Frame-to-frame change (0-255) above which she's moving rather than standing.
const STILL = 0.5;
const RUNNING = 4;
// How much bigger than a normal running frame step the jump from run-start
// into the loop may be.
const JOIN_SLACK = 1.25;

if (!fs.existsSync(RAW) || !KEYED) {
  console.error('run-take not found; run `npm run clips -- run-take` first');
  process.exit(1);
}

const gray = execFileSync(
  'ffmpeg',
  [
    '-v',
    'error',
    '-i',
    RAW,
    '-vf',
    `scale=${S}:${S},format=gray`,
    '-f',
    'rawvideo',
    '-',
  ],
  { maxBuffer: 1 << 28 },
);
const N = S * S;
const n = gray.length / N;
const frame = (i) => gray.subarray(i * N, (i + 1) * N);
const diff = (a, b) => {
  const A = frame(a);
  const B = frame(b);
  let s = 0;
  for (let k = 0; k < N; k++) s += Math.abs(A[k] - B[k]);
  return s / N;
};

// Motion per frame, smoothed over 4 frames.
const motion = [0];
for (let i = 1; i < n; i++) motion.push(diff(i, i - 1));
const smooth = motion.map((_, i) => {
  const w = motion.slice(Math.max(1, i - 3), i + 1);
  return w.reduce((a, b) => a + b, 0) / Math.max(1, w.length);
});
const firstMove = smooth.findIndex((m) => m > STILL);
const runFrom = smooth.findIndex((m) => m > RUNNING);
const runTo = smooth.findLastIndex((m) => m > RUNNING);
if (firstMove < 0 || runFrom < 0 || runTo - runFrom < 48) {
  console.error('could not find a few seconds of running in run-take');
  process.exit(1);
}

// Loop [i, i+len): early in the run so she isn't standing about before moving.
// Stop entry k: late in the run, matching frame i.
let best = null;
for (let i = runFrom + 4; i < runFrom + 32; i++) {
  for (let len = 14; len <= 20; len++) {
    for (let k = runTo - 24; k < runTo - 2; k++) {
      const score = diff(i, i + len) + diff(i, k);
      if (!best || score < best.score) best = { i, len, k, score };
    }
  }
}
const start = Math.max(0, firstMove - Math.round(LEAD_IN * FPS));
const { i, len, k } = best;

// run-start ends as soon as she's into her stride, not where the loop happens
// to begin, or she runs on the spot before the stage moves her. It ends on the
// earliest frame whose successor looks like the loop's first frame (an earlier
// point in the same stride), so the jump is no bigger than a normal frame step.
let step = 0;
for (let f = i + 1; f < i + len; f++) step += diff(f, f - 1);
step /= len - 1;
let end = i - 1;
for (let e = runFrom - 2; e < i - 1; e++) {
  if (diff(e + 1, i) <= step * JOIN_SLACK) {
    end = e;
    break;
  }
}
console.log(
  `turn starts ~${firstMove}, running ${runFrom}-${runTo} of ${n} frames; ` +
    `loop ${i}-${i + len - 1} (${len}f, seam ${diff(i, i + len).toFixed(2)}), ` +
    `stop from ${k} (match ${diff(i, k).toFixed(2)}), ` +
    `set off after ${end} (join ${diff(end + 1, i).toFixed(2)} vs step ${step.toFixed(2)})`,
);

function cut(name, from, to) {
  const out = path.join(CLIPS, `${name}.webm`);
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-c:v',
    'libvpx-vp9', // keeps the alpha plane
    '-i',
    KEYED,
    '-vf',
    `select='between(n,${from},${to})',setpts=N/(${FPS}*TB)`,
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-pix_fmt',
    'yuva420p',
    '-b:v',
    '0',
    '-crf',
    '30',
    '-row-mt',
    '1',
    '-auto-alt-ref',
    '0',
    out,
  ]);
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(
    `  ${name.padEnd(9)} frames ${from}-${to} (${((to - from + 1) / FPS).toFixed(2)}s, ${kb} KB)`,
  );
}

cut('run-start', start, end);
cut('run', i, i + len - 1);
cut('run-stop', k, n - 1);

// The full take isn't played by the app; keep it out of the clips folder.
if (path.dirname(KEYED) === CLIPS) {
  fs.renameSync(KEYED, path.join(CLIPS, 'raw', 'run-take.webm'));
}

#!/usr/bin/env node
// Measures how far her feet carry her in the run clips, for src/renderer/gait.ts.
// She runs on the spot in the clips, so the foot on the ground slides
// backwards at exactly the speed she should cross the screen. For each pair
// of frames this finds the sideways shift that best lines up the strip of
// silhouette under her feet, in the clips' own px.
//
//   node scripts/gait.mjs                      (art/private, or WIFEY_ART)
//
// Run after `node scripts/split-run.mjs`, then copy the numbers it prints
// into src/renderer/gait.ts. They're a smoothed estimate: watch her run a few
// times and nudge LOOP_PX_PER_FRAME if her feet still slide.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIPS = path.join(
  path.resolve(root, process.env.WIFEY_ART || 'art/private'),
  'clips',
);
// Bottom share of the frame that counts as "under her feet".
const STRIP = 0.07;
const MAX_SHIFT = 40;

function size(file) {
  const out = execFileSync('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0',
    file,
  ])
    .toString()
    .trim();
  const [w, h] = out.split(',').map(Number);
  return { w, h };
}

/** Per-frame px her planted foot slides, frame n to n+1. */
function steps(name) {
  const file = path.join(CLIPS, `${name}.webm`);
  const { w, h } = size(file);
  // The alpha plane is her silhouette; libvpx-vp9 keeps it when decoding.
  const raw = execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-c:v',
      'libvpx-vp9',
      '-i',
      file,
      '-vf',
      'alphaextract,format=gray',
      '-f',
      'rawvideo',
      '-',
    ],
    { maxBuffer: 1 << 30 },
  );
  const N = w * h;
  const n = raw.length / N;
  const rows = Math.max(4, Math.round(h * STRIP));
  // The feet in the strip, as [left, right] column spans of silhouette.
  const feet = (i) => {
    const f = raw.subarray(i * N, (i + 1) * N);
    const spans = [];
    let from = -1;
    for (let x = 0; x <= w; x++) {
      let on = false;
      if (x < w)
        for (let y = h - rows; y < h && !on; y++) on = f[y * w + x] > 128;
      if (on && from < 0) from = x;
      if (!on && from >= 0) {
        if (x - from > 3) spans.push([from, x - 1]);
        from = -1;
      }
    }
    return spans;
  };
  const all = Array.from({ length: n }, (_, i) => feet(i));
  // A foot on the ground slides backwards (left: the clips face right); a
  // foot in the air swings forwards. Per pair of frames, take the foot that
  // went furthest backwards, matched to its nearest span in the next frame.
  const out = [];
  for (let i = 0; i + 1 < n; i++) {
    let back = 0;
    for (const [l, r] of all[i]) {
      const near = all[i + 1]
        .map(([l2, r2]) => ({ dl: l2 - l, dr: r2 - r }))
        .sort((a, b) => Math.abs(a.dl + a.dr) - Math.abs(b.dl + b.dr))[0];
      if (!near || Math.abs(near.dl + near.dr) / 2 > MAX_SHIFT) continue;
      // The back edge (heel) of a planted foot is the steadiest edge.
      back = Math.min(back, near.dl);
    }
    out.push(-back);
  }
  return { w, steps: out };
}

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const ramp = (from, to, frames) =>
  Array.from({ length: frames }, (_, k) =>
    Math.round(from + ((to - from) * (k + 1)) / (frames + 1)),
  );
// Ramps last about a quarter second.
const RAMP = 6;

const loop = steps('run');
const start = steps('run-start');
const stop = steps('run-stop');
// Frames with both feet in the air measure 0; the speed is what the planted
// foot shows the rest of the time.
const speed = median(loop.steps.filter((v) => v > 0));
// run-start: still until she really sets off, then up to speed.
const off = start.steps.findIndex((v, k) => v >= 3 && start.steps[k + 1] >= 3);
const startPx = [
  ...Array(Math.max(0, off)).fill(0),
  ...ramp(0, speed, RAMP),
].slice(0, start.steps.length);
while (startPx.length < start.steps.length) startPx.push(speed);
// run-stop: at speed until her last few moving frames, then down to a stop.
const last = stop.steps.findLastIndex((v) => v > 0);
const stopPx = [
  ...Array(Math.max(0, last + 1 - RAMP)).fill(speed),
  ...ramp(speed, 0, RAMP),
];

console.log(`clip width: ${loop.w}px (CLIP_PX)`);
console.log('measured, px per frame (0 = both feet in the air):');
console.log(`  run        ${loop.steps.join(', ')}`);
console.log(`  run-start  ${start.steps.join(', ')}`);
console.log(`  run-stop   ${stop.steps.join(', ')}`);
console.log('for src/renderer/gait.ts:');
console.log(`const LOOP_PX_PER_FRAME = ${speed};`);
console.log(`const START_PX = [${startPx.join(', ')}];`);
console.log(`const STOP_PX = [${stopPx.join(', ')}];`);

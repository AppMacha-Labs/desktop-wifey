#!/usr/bin/env node
// Estimates how many steps per second a run clip takes, from how the
// silhouette of her legs repeats over time. Used to calibrate how fast she
// should travel across the screen so her feet don't slide.
//
//   node scripts/cadence.mjs art/private/clips/run.webm [more.webm...]

import { execFileSync } from 'node:child_process';

const SIZE = 48; // downscaled mask is SIZE x SIZE/2 (bottom half of the frame)

function legMasks(file) {
  const fps = Number(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=r_frame_rate',
      '-of',
      'csv=p=0',
      file,
    ])
      .toString()
      .trim()
      .split('/')
      .reduce((a, b) => a / b),
  );
  // libvpx-vp9 so the alpha plane survives decoding; keep only the legs.
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
      `alphaextract,crop=iw:ih/2:0:ih/2,scale=${SIZE}:${SIZE / 2},format=gray`,
      '-f',
      'rawvideo',
      '-',
    ],
    { maxBuffer: 1 << 28 },
  );
  const frameLen = SIZE * (SIZE / 2);
  const frames = [];
  for (let i = 0; i + frameLen <= raw.length; i += frameLen) {
    frames.push(
      Float64Array.from(raw.subarray(i, i + frameLen), (v) => v / 255),
    );
  }
  return { fps, frames };
}

/** Mean absolute difference between frames `lag` apart: low when the pose repeats. */
function dissimilarity(frames, lag) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i + lag < frames.length; i++) {
    const a = frames[i];
    const b = frames[i + lag];
    let d = 0;
    for (let k = 0; k < a.length; k++) d += Math.abs(a[k] - b[k]);
    sum += d / a.length;
    n += 1;
  }
  return sum / n;
}

for (const file of process.argv.slice(2)) {
  const { fps, frames } = legMasks(file);
  // A full gait cycle (left + right step) is the first strong dip after lag 0.
  // Search 0.4s..2.5s; one step is half a cycle.
  const minLag = Math.round(fps * 0.4);
  const maxLag = Math.min(Math.round(fps * 2.5), frames.length - 5);
  let best = { lag: 0, d: Infinity };
  for (let lag = minLag; lag <= maxLag; lag++) {
    const d = dissimilarity(frames, lag);
    if (d < best.d) best = { lag, d };
  }
  const cycle = best.lag / fps;
  console.log(
    `${file}: gait cycle ${cycle.toFixed(2)}s -> ${(2 / cycle).toFixed(2)} steps/s ` +
      `(${frames.length} frames @ ${fps.toFixed(0)}fps, match ${best.d.toFixed(3)})`,
  );
}

#!/usr/bin/env node
// Turns her still poses into animated clips: MiniMax H3 (via fal.ai) animates
// each pose on a green screen, then ffmpeg keys out the green and writes a
// transparent WebM the app plays. Specs live in art/clips.json.
//
// Works on art/private (your own character) unless WIFEY_ART points somewhere
// else, e.g. WIFEY_ART=art/sample for the sample character.
//
//   npm run clips -- idle run wave      generate these clips
//   npm run clips -- --all              every clip in clips.json
//   npm run clips -- run --force        regenerate even if a raw video exists
//   npm run clips -- run --rekey        only redo the keying from the raw video
//   npm run clips -- --dry --all        show the plan and estimated cost
//
// Needs FAL_KEY in .env and ffmpeg on PATH. Raw videos are cached in
// <art>/clips/raw so re-keying never costs money.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });

const ART = path.resolve(root, process.env.WIFEY_ART || 'art/private');
const OUT = path.join(ART, 'clips');
const RAW = path.join(OUT, 'raw');
const TMP = path.join(OUT, '.tmp');
const MODEL = process.env.WIFEY_VIDEO_MODEL || 'minimax/h3/image-to-video';
// fal's default for H3 is 2K; 768P is plenty for a ~260px character and cheaper.
const RESOLUTION = process.env.WIFEY_VIDEO_RESOLUTION || '768P';
const PRICE_PER_SEC = 0.06; // H3 at 768P on fal; an estimate for --dry
const GREEN = '0x00ff00';
const HEIGHT = 540; // on-screen she's ~260px tall; 2x for retina, rounded up

// Appended to every prompt: the clip has to key cleanly and line up with her stills.
const RULES =
  'Locked-off static camera: no camera movement, no zoom, no cuts. ' +
  'The plain solid green background stays perfectly flat and uniform, with no floor, shadows or background objects. ' +
  'Same character, same face, same outfit and hairstyle throughout. ' +
  'Her whole body stays fully in frame, centred, feet on the same spot.';

const spec = JSON.parse(
  fs.readFileSync(path.join(root, 'art', 'clips.json'), 'utf8'),
).clips;

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const names = flags.has('--all')
  ? Object.keys(spec)
  : args.filter((a) => !a.startsWith('--'));

if (names.length === 0) {
  console.log(`usage: npm run clips -- <name...> | --all [--force] [--rekey] [--dry]
clips: ${Object.keys(spec).join(', ')}`);
  process.exit(1);
}
for (const n of names) {
  if (!spec[n]) {
    console.error(
      `unknown clip "${n}". Known: ${Object.keys(spec).join(', ')}`,
    );
    process.exit(1);
  }
}

const sh = (cmd, argv, opts = {}) =>
  execFileSync(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });

function probeSize(file) {
  const out = sh('ffprobe', [
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

/** Her transparent PNG flattened onto pure green, at the same size. */
function greenify(src) {
  const { w, h } = probeSize(src);
  const out = path.join(TMP, `${path.parse(src).name}.green.png`);
  sh('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=${GREEN}:s=${w}x${h}`,
    '-i',
    src,
    '-filter_complex',
    '[0:v][1:v]overlay=format=auto',
    '-frames:v',
    '1',
    out,
  ]);
  return out;
}

/** Average colour of the top-left corner of the first frame: the actual green the model produced. */
function sampleKeyColor(video) {
  const buf = sh('ffmpeg', [
    '-v',
    'error',
    '-i',
    video,
    '-vf',
    'crop=24:24:6:6,scale=1:1',
    '-frames:v',
    '1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ]);
  const hex = [...buf.subarray(0, 3)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `0x${hex}`;
}

/** Green screen -> transparent VP9 WebM, plus a preview sheet over magenta to eyeball the edges. */
function key(raw, name, similarity) {
  const color = sampleKeyColor(raw);
  const webm = path.join(OUT, `${name}.webm`);
  sh('ffmpeg', [
    '-y',
    '-i',
    raw,
    // Key the green, then pull the matte in by ~2px and soften it: edge pixels
    // that mixed with the green otherwise leave a thin grey outline on light desktops.
    '-filter_complex',
    `[0:v]chromakey=${color}:${similarity}:0.06,despill=type=green,format=yuva444p,split[rgb][a];` +
      `[a]alphaextract,erosion,erosion,gblur=sigma=0.7[m];` +
      `[rgb][m]alphamerge,scale=-2:${HEIGHT}`,
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
    webm,
  ]);
  const preview = path.join(OUT, `${name}.preview.png`);
  // libvpx-vp9 must decode it, the native decoder drops the alpha plane.
  sh('ffmpeg', [
    '-y',
    '-c:v',
    'libvpx-vp9',
    '-i',
    webm,
    '-f',
    'lavfi',
    '-i',
    `color=c=magenta:s=${HEIGHT}x${HEIGHT}`,
    '-filter_complex',
    // Every 19th frame: an odd step so it can't line up with a 1s gait cycle
    // and show the same pose in every tile.
    "[1:v][0:v]overlay=shortest=1,select='not(mod(n\\,19))',scale=270:-2,tile=4x2",
    '-frames:v',
    '1',
    '-fps_mode',
    'vfr',
    preview,
  ]);
  return { webm, preview, color };
}

async function generate(name, s, fal) {
  const from = path.join(ART, s.from);
  const to = s.loop ? from : s.to ? path.join(ART, s.to) : null;
  const upload = async (file) =>
    fal.storage.upload(
      new Blob([fs.readFileSync(greenify(file))], { type: 'image/png' }),
    );

  const input = {
    prompt: `${s.prompt} ${RULES}`,
    image_url: await upload(from),
    duration: s.duration ?? 5,
    resolution: RESOLUTION,
    // Our prompt already says exactly what to do; expansion tends to add
    // camera moves and backgrounds that break the green screen.
    prompt_expansion_mode: 'disabled',
  };
  if (to)
    input.end_image_url = to === from ? input.image_url : await upload(to);

  const started = Date.now();
  const result = await fal.subscribe(MODEL, {
    input,
    logs: true,
    onQueueUpdate: (u) => {
      if (u.status === 'IN_QUEUE')
        process.stdout.write(`  [${name}] queued...\r`);
      if (u.status === 'IN_PROGRESS')
        process.stdout.write(
          `  [${name}] generating ${Math.round((Date.now() - started) / 1000)}s...\r`,
        );
    },
  });
  const url = result.data?.video?.url;
  if (!url)
    throw new Error(
      `no video in response: ${JSON.stringify(result.data).slice(0, 300)}`,
    );
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const raw = path.join(RAW, `${name}.mp4`);
  fs.writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  console.log(
    `  [${name}] generated in ${Math.round((Date.now() - started) / 1000)}s (request ${result.requestId})`,
  );
  return raw;
}

async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  fs.mkdirSync(TMP, { recursive: true });

  const plan = names.map((name) => {
    const s = spec[name];
    const raw = path.join(RAW, `${name}.mp4`);
    const needsGen =
      flags.has('--force') || (!flags.has('--rekey') && !fs.existsSync(raw));
    const missing = [s.from, s.to]
      .filter(Boolean)
      .filter((f) => !fs.existsSync(path.join(ART, f)));
    return { name, s, raw, needsGen, missing };
  });

  const cost = plan
    .filter((p) => p.needsGen && p.missing.length === 0)
    .reduce((sum, p) => sum + (p.s.duration ?? 5) * PRICE_PER_SEC, 0);
  for (const p of plan) {
    const what = p.missing.length
      ? `SKIP, missing ${p.missing.join(', ')}`
      : p.needsGen
        ? `generate ${p.s.duration ?? 5}s from ${p.s.from}${p.s.loop ? ' (loop)' : ''}`
        : 're-key cached video';
    console.log(`${p.name.padEnd(9)} ${what}`);
  }
  console.log(`estimated cost: ~$${cost.toFixed(2)} (model ${MODEL})`);
  if (flags.has('--dry')) return;

  let fal = null;
  if (plan.some((p) => p.needsGen && p.missing.length === 0)) {
    if (!process.env.FAL_KEY) {
      console.error('FAL_KEY is not set in .env');
      process.exit(1);
    }
    ({ fal } = await import('@fal-ai/client'));
    fal.config({ credentials: process.env.FAL_KEY });
  }

  const similarity = Number(process.env.KEY_SIMILARITY || 0.14);
  let failed = 0;
  // Generate in parallel (each takes minutes), key as each one lands.
  await Promise.all(
    plan.map(async (p) => {
      if (p.missing.length) return;
      try {
        if (p.needsGen) await generate(p.name, p.s, fal);
        else if (!fs.existsSync(p.raw))
          throw new Error('no cached raw video to re-key');
        const { webm, preview, color } = key(p.raw, p.name, similarity);
        const kb = Math.round(fs.statSync(webm).size / 1024);
        console.log(
          `  [${p.name}] keyed ${color} -> ${path.relative(root, webm)} (${kb} KB), preview ${path.relative(root, preview)}`,
        );
      } catch (err) {
        failed += 1;
        // fal puts the reason (a bad duration, say) in the error body.
        const detail = err.body
          ? ` ${JSON.stringify(err.body).slice(0, 300)}`
          : '';
        console.error(`  [${p.name}] FAILED: ${err.message ?? err}${detail}`);
      }
    }),
  );
  fs.rmSync(TMP, { recursive: true, force: true });
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

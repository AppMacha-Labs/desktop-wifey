#!/usr/bin/env node
// Makes a new still pose of her from an existing one with an image-edit model
// on fal (keeps her face and outfit, changes the pose). Output is on a flat
// green background, ready to be a clip's start frame in art/clips.json.
//
//   npm run pose -- --from side.png --out run.png --n 3 "side profile, mid-run..."
//
// With --n above 1 it writes run-1.png, run-2.png... so you can pick one.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });
const ART = path.resolve(root, process.env.WIFEY_ART || 'art/private');
const MODEL = process.env.WIFEY_IMAGE_MODEL || 'fal-ai/nano-banana-2/edit';

const RULES =
  'Keep exactly the same person: same face, same hairstyle, same outfit, same rendering style and lighting. ' +
  'Square image, whole body in frame and centred, same camera distance and scale as the reference, feet near the bottom. ' +
  'Background: a single flat pure green (#00FF00) colour, no floor, no shadow, no props.';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const from = opt('from', 'idle.png');
const out = opt('out', null);
const n = Number(opt('n', 1));
const prompt = args.join(' ').trim();

if (!out || !prompt) {
  console.log(
    'usage: npm run pose -- --from side.png --out run.png [--n 3] "<pose description>"',
  );
  process.exit(1);
}
if (!process.env.FAL_KEY) {
  console.error('FAL_KEY is not set in .env');
  process.exit(1);
}

const { fal } = await import('@fal-ai/client');
fal.config({ credentials: process.env.FAL_KEY });

const ref = await fal.storage.upload(
  new Blob([fs.readFileSync(path.join(ART, from))], { type: 'image/png' }),
);
const result = await fal.subscribe(MODEL, {
  input: {
    prompt: `${prompt} ${RULES}`,
    image_urls: [ref],
    num_images: n,
    aspect_ratio: '1:1',
    output_format: 'png',
  },
});

const images = result.data?.images ?? [];
if (!images.length)
  throw new Error(
    `no images returned: ${JSON.stringify(result.data).slice(0, 300)}`,
  );
const { name, ext } = path.parse(out);
for (const [i, img] of images.entries()) {
  const file = path.join(
    ART,
    images.length > 1 ? `${name}-${i + 1}${ext}` : out,
  );
  const res = await fetch(img.url);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`wrote ${path.relative(root, file)}`);
}

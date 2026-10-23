import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { POSES } from '../shared/types';
import type { ArtManifest, ClipManifest } from '../shared/types';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
};

/**
 * Folders that can hold her art, first one with an idle pose wins: your own
 * character (userData/art, or art/private in a dev checkout, both outside
 * git), then the sample character that ships with the repo.
 */
function artDirs(): string[] {
  return [
    path.join(app.getPath('userData'), 'art'),
    path.join(app.getAppPath(), 'art', 'private'),
    app.isPackaged
      ? path.join(process.resourcesPath, 'sample')
      : path.join(app.getAppPath(), 'art', 'sample'),
  ];
}

/** The pose file for `pose` in `dir`, whatever its image type. */
function poseFile(dir: string, pose: string): string | null {
  for (const ext of Object.keys(MIME)) {
    const file = path.join(dir, `${pose}${ext}`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

let chosen: string | null | undefined;

/**
 * The one folder her art comes from. Characters are never mixed: a pose
 * missing from your own folder falls back to the placeholder, not to the
 * sample character.
 */
export function characterDir(): string | null {
  if (chosen === undefined) {
    chosen = artDirs().find((dir) => poseFile(dir, 'idle')) ?? null;
  }
  return chosen;
}

/**
 * Finds `<pose>.png|webp|svg|gif` for each pose and returns them as data URLs.
 * Poses without a file are left out; the renderer draws its placeholder instead.
 */
export function loadArtManifest(): ArtManifest {
  const manifest: ArtManifest = {};
  const dir = characterDir();
  if (!dir) return manifest;
  for (const pose of POSES) {
    const file = poseFile(dir, pose);
    if (!file) continue;
    const data = fs.readFileSync(file).toString('base64');
    manifest[pose] = `data:${MIME[path.extname(file)]};base64,${data}`;
  }
  return manifest;
}

/** Transparent WebM clips from `npm run clips`, keyed by file name (idle, run, wave...). */
export function loadClips(): ClipManifest {
  const clips: ClipManifest = {};
  const dir = characterDir();
  const clipDir = dir && path.join(dir, 'clips');
  if (!clipDir || !fs.existsSync(clipDir)) return clips;
  for (const f of fs.readdirSync(clipDir)) {
    const { name, ext } = path.parse(f);
    if (ext.toLowerCase() !== '.webm') continue;
    clips[name] = new Uint8Array(fs.readFileSync(path.join(clipDir, f)));
  }
  return clips;
}

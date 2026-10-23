import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { Settings, SettingsPatch } from '../shared/types';

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

const clamp = (n: unknown, lo: number, hi: number, fallback: number) => {
  const v = Number(n);
  return Number.isFinite(v)
    ? Math.min(hi, Math.max(lo, Math.round(v)))
    : fallback;
};
const time = (t: unknown, fallback: string) =>
  typeof t === 'string' && HHMM.test(t.trim())
    ? t.trim().padStart(5, '0')
    : fallback;
const text = (t: unknown, fallback: string, max = 40) =>
  typeof t === 'string' ? t.trim().slice(0, max) || fallback : fallback;
const bool = (b: unknown, fallback: boolean) =>
  typeof b === 'boolean' ? b : fallback;

/** Merges a patch onto the current settings, keeping every value in range. */
function merge(cur: Settings, p: SettingsPatch): Settings {
  const meals = p.meals?.times
    ? [...new Set(p.meals.times.map((t) => time(t, '')).filter(Boolean))]
        .sort()
        .slice(0, 6)
    : cur.meals.times;
  return {
    wifeName: text(p.wifeName, cur.wifeName),
    userName: text(p.userName, cur.userName),
    petName:
      typeof p.petName === 'string'
        ? p.petName.trim().slice(0, 40)
        : cur.petName,
    water: {
      enabled: bool(p.water?.enabled, cur.water.enabled),
      intervalMin: clamp(p.water?.intervalMin, 10, 240, cur.water.intervalMin),
    },
    meals: { enabled: bool(p.meals?.enabled, cur.meals.enabled), times: meals },
    bedtime: {
      enabled: bool(p.bedtime?.enabled, cur.bedtime.enabled),
      time: time(p.bedtime?.time, cur.bedtime.time),
    },
    nagAfterMin: clamp(p.nagAfterMin, 1, 120, cur.nagAfterMin),
    snoozeMin: clamp(p.snoozeMin, 1, 120, cur.snoozeMin),
    maxNags: clamp(p.maxNags, 1, 10, cur.maxNags),
    alwaysVisible: bool(p.alwaysVisible, cur.alwaysVisible),
    lingerSec: clamp(p.lingerSec, 2, 60, cur.lingerSec),
    charSize: clamp(p.charSize, 160, 420, cur.charSize),
    summonShortcut: text(p.summonShortcut, cur.summonShortcut, 60),
    quietHours: {
      enabled: bool(p.quietHours?.enabled, cur.quietHours.enabled),
      start: time(p.quietHours?.start, cur.quietHours.start),
      end: time(p.quietHours?.end, cur.quietHours.end),
    },
    pauseDuringCalls: bool(p.pauseDuringCalls, cur.pauseDuringCalls),
    launchAtLogin: bool(p.launchAtLogin, cur.launchAtLogin),
    voice: {
      enabled: bool(p.voice?.enabled, cur.voice.enabled),
      volume: clamp(p.voice?.volume, 0, 100, cur.voice.volume),
    },
  };
}

/**
 * Settings he edits from the window, saved to settings.json in userData.
 * `current` is one live object that the rest of the app reads at use time, so
 * a change applies immediately without restarting anything.
 */
export class SettingsStore {
  readonly current: Settings;
  private readonly file: string;
  private readonly listeners: ((prev: Settings) => void)[] = [];

  constructor(defaults: Settings) {
    this.file = path.join(app.getPath('userData'), 'settings.json');
    let saved: SettingsPatch = {};
    try {
      saved = JSON.parse(fs.readFileSync(this.file, 'utf8')) as SettingsPatch;
    } catch {
      /* first run: start from the .env defaults */
    }
    this.current = merge(defaults, saved);
    this.save();
  }

  onChange(cb: (prev: Settings) => void): void {
    this.listeners.push(cb);
  }

  update(patch: SettingsPatch): Settings {
    const prev = structuredClone(this.current);
    Object.assign(this.current, merge(this.current, patch));
    this.save();
    for (const cb of this.listeners) cb(prev);
    return this.current;
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.current, null, 2));
  }
}

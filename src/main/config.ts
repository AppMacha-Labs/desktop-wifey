import { app } from 'electron';
import path from 'node:path';
import dotenv from 'dotenv';
import type { Settings } from '../shared/types';

/** What only ever comes from .env: secrets and plumbing. */
export interface EnvConfig {
  apiKey: string | undefined;
  model: string;
  /** ElevenLabs, for her voice. No key: she stays silent. */
  voice: { apiKey: string | undefined; voiceId: string; model: string };
  /** First-run defaults for settings.json; the window owns them after that. */
  defaults: Settings;
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const HHMM = /^\d{1,2}:\d{2}$/;

export function loadEnv(): EnvConfig {
  // In dev the .env sits next to package.json; packaged apps read it from userData
  // so the user never has to open the .app bundle.
  dotenv.config({
    path: [
      path.join(app.getAppPath(), '.env'),
      path.join(app.getPath('userData'), '.env'),
    ],
    quiet: true,
  });

  const env = process.env;
  return {
    apiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
    model: env.WIFEY_MODEL?.trim() || 'claude-opus-5-5',
    voice: {
      apiKey: env.ELEVENLABS_API_KEY?.trim() || undefined,
      // A stock ElevenLabs voice until he picks one.
      voiceId: env.ELEVENLABS_VOICE_ID?.trim() || '21m00Tcm4TlvDq8ikWAM',
      model: env.ELEVENLABS_MODEL?.trim() || 'eleven_v4_turbo',
    },
    defaults: {
      wifeName: env.WIFE_NAME?.trim() || 'Wifey',
      userName: env.USER_NAME?.trim() || 'babe',
      petName: env.PET_NAME?.trim() || '',
      water: {
        enabled: true,
        intervalMin: num(env.WATER_INTERVAL_MIN, 60),
      },
      meals: {
        enabled: true,
        times: (env.MEAL_TIMES || '13:00,20:00')
          .split(',')
          .map((t) => t.trim())
          .filter((t) => HHMM.test(t)),
      },
      bedtime: {
        enabled: true,
        time: HHMM.test(env.BEDTIME || '') ? env.BEDTIME!.trim() : '23:30',
      },
      nagAfterMin: num(env.NAG_AFTER_MIN, 10),
      snoozeMin: num(env.SNOOZE_MIN, 15),
      maxNags: num(env.MAX_NAGS, 3),
      alwaysVisible: /^(1|true|yes)$/i.test(env.ALWAYS_VISIBLE || ''),
      lingerSec: num(env.LINGER_SEC, 6),
      charSize: 260,
      summonShortcut: env.SUMMON_SHORTCUT?.trim() || 'Alt+Control+W',
      quietHours: { enabled: false, start: '00:30', end: '08:00' },
      pauseDuringCalls: true,
      launchAtLogin: false,
      voice: { enabled: true, volume: 80 },
    },
  };
}

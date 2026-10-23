// Her voice, via ElevenLabs text-to-speech. Plain fetch, no SDK: one endpoint,
// MP3 back. Lines repeat now and then (canned ones especially), so the last few
// are kept in memory.

import type { Mood } from '../shared/types';
import { startsWithTag, stripAudioTags } from './audio-tags';

const API = 'https://api.elevenlabs.io/v1/text-to-speech';

// Models that act on audio tags; any other model would read them out, so
// they're stripped before it sees the line.
const TAG_MODELS = /^eleven_v[34]/;

/** How each mood sounds: a delivery tag in front of the line. */
const MOOD_TAG: Record<Mood, string> = {
  loving: '[warmly]',
  content: '',
  playful: '[mischievously]',
  worried: '[concerned]',
  pouty: '[sulking]',
  furious: '[annoyed]',
  sleepy: '[sleepily]',
};

/** Lower stability lets the voice swing further; the big moods get more room. */
const STABILITY: Partial<Record<Mood, number>> = {
  playful: 0.35,
  pouty: 0.35,
  furious: 0.3,
  sleepy: 0.5,
};
// A professional voice can take several seconds on its first request after
// a while (cold start); warm ones answer in under a second. Past this she just
// says it in text.
const TIMEOUT_MS = 8000;
const CACHE_SIZE = 40;

export interface VoiceConfig {
  apiKey: string | undefined;
  voiceId: string;
  model: string;
}

export type Speech = { audio: Uint8Array<ArrayBuffer> | null; error?: string };

export class Voice {
  private readonly cache = new Map<string, Uint8Array<ArrayBuffer>>();

  constructor(
    private readonly cfg: VoiceConfig,
    private readonly log: (msg: string) => void,
  ) {}

  /** Which voice and model she speaks with: a take made with others is stale. */
  get sound(): string {
    return `${this.cfg.model}/${this.cfg.voiceId}`;
  }

  /** A key is configured. */
  get available(): boolean {
    return Boolean(this.cfg.apiKey);
  }

  /** Wake the voice up so her first real line doesn't pay the cold start. */
  warm(): void {
    if (!this.available) return;
    const t0 = Date.now();
    void this.say('Hm.').then(({ audio }) => {
      if (audio) this.log(`voice ready (${Date.now() - t0}ms)`);
    });
  }

  /**
   * The line as MP3 in her current mood, or null (with why) if she can't say
   * it. Never throws.
   */
  async say(text: string, mood: Mood = 'content'): Promise<Speech> {
    if (!this.cfg.apiKey) return { audio: null, error: 'no ElevenLabs key' };
    let line = speakable(text);
    if (TAG_MODELS.test(this.cfg.model)) {
      if (MOOD_TAG[mood] && !startsWithTag(line))
        line = `${MOOD_TAG[mood]} ${line}`;
    } else {
      line = stripAudioTags(line);
    }
    if (!stripAudioTags(line)) return { audio: null, error: 'nothing to say' };
    const stability = STABILITY[mood] ?? 0.45;
    const key = `${stability}|${line}`;
    const hit = this.cache.get(key);
    if (hit) {
      // Refresh its place so the cache keeps what she says most.
      this.cache.delete(key);
      this.cache.set(key, hit);
      return { audio: hit };
    }

    try {
      const res = await fetch(
        `${API}/${encodeURIComponent(this.cfg.voiceId)}?output_format=mp3_44100_64`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': this.cfg.apiKey,
            'content-type': 'application/json',
            accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text: line,
            model_id: this.cfg.model,
            // A little livelier than the defaults: she's chatty, not a narrator.
            voice_settings: {
              stability,
              similarity_boost: 0.8,
              style: 0.2,
              use_speaker_boost: true,
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (!res.ok) {
        const error = `ElevenLabs ${res.status}: ${describe(await res.text())}`;
        this.log(`voice failed: ${error}`);
        return { audio: null, error };
      }
      const audio = new Uint8Array(await res.arrayBuffer());
      this.cache.set(key, audio);
      if (this.cache.size > CACHE_SIZE) {
        this.cache.delete(this.cache.keys().next().value!);
      }
      return { audio };
    } catch (err) {
      const error =
        (err as Error).name === 'TimeoutError'
          ? 'ElevenLabs took too long'
          : (err as Error).message;
      this.log(`voice failed: ${error}`);
      return { audio: null, error };
    }
  }
}

/** What she actually says: no emoji, no "(+2 more in the app)". */
function speakable(text: string): string {
  return text
    .replace(/\(\+\d+ more in the app\)/g, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ElevenLabs errors come as JSON with a detail message; keep it short. */
function describe(body: string): string {
  try {
    const j = JSON.parse(body) as {
      detail?: { message?: string; status?: string } | string;
    };
    const d = j.detail;
    if (typeof d === 'string') return d.slice(0, 160);
    return (d?.message ?? d?.status ?? body).slice(0, 160);
  } catch {
    return body.slice(0, 160);
  }
}

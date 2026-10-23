import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { Mood } from '../shared/types';

interface PersistedState {
  mood: Mood;
  lastWaterAt: number | null;
  lastMealAt: number | null;
  petCount: number;
  recentLines: string[];
  /** Manual "do not disturb" until this time. */
  pausedUntil: number | null;
}

const DEFAULTS: PersistedState = {
  mood: 'content',
  lastWaterAt: null,
  lastMealAt: null,
  petCount: 0,
  recentLines: [],
  pausedUntil: null,
};

/** Tiny JSON-on-disk store. Everything she remembers between launches lives here. */
export class StateStore {
  private data: PersistedState;
  private readonly file: string;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.file = path.join(app.getPath('userData'), 'state.json');
    this.data = { ...DEFAULTS, ...this.read() };
  }

  private read(): Partial<PersistedState> {
    try {
      return JSON.parse(
        fs.readFileSync(this.file, 'utf8'),
      ) as Partial<PersistedState>;
    } catch {
      return {};
    }
  }

  private save(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    }, 250);
  }

  get mood(): Mood {
    return this.data.mood;
  }
  set mood(mood: Mood) {
    this.data.mood = mood;
    this.save();
  }

  get lastWaterAt(): number | null {
    return this.data.lastWaterAt;
  }
  set lastWaterAt(at: number | null) {
    this.data.lastWaterAt = at;
    this.save();
  }

  get lastMealAt(): number | null {
    return this.data.lastMealAt;
  }
  set lastMealAt(at: number | null) {
    this.data.lastMealAt = at;
    this.save();
  }

  get pausedUntil(): number | null {
    return this.data.pausedUntil;
  }
  set pausedUntil(at: number | null) {
    this.data.pausedUntil = at;
    this.save();
  }

  get petCount(): number {
    return this.data.petCount;
  }
  bumpPets(): number {
    this.data.petCount += 1;
    this.save();
    return this.data.petCount;
  }

  get recentLines(): string[] {
    return this.data.recentLines;
  }
  pushLine(line: string): void {
    this.data.recentLines = [...this.data.recentLines, line].slice(-8);
    this.save();
  }
}

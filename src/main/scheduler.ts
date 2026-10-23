import type { ReminderKind, Settings } from '../shared/types';
import type { StateStore } from './state';

export interface SchedulerEvents {
  /** `snoozes`: how many times he's said "Not yet" to this one so far. */
  onReminder(kind: ReminderKind, snoozes: number): void;
  onIgnored(kind: ReminderKind, count: number): void;
  onGaveUp(kind: ReminderKind): void;
}

interface Pending {
  kind: ReminderKind;
  since: number;
  lastNagAt: number;
  nags: number;
}

const MINUTE = 60_000;

/** Parses "HH:MM" into today's timestamp. */
function todayAt(hhmm: string, now = new Date()): number {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Decides when she should speak up. Runs a cheap tick every 30s and holds at most
 * one pending reminder at a time so she never stacks three bubbles on you.
 * Reads settings at tick time, so changes from the window apply immediately.
 */
export class Scheduler {
  private pending: Pending | null = null;
  private snoozedUntil: Partial<Record<ReminderKind, number>> = {};
  /** "Not yet"s in a row per reminder, until he finally does it. */
  private snoozes: Partial<Record<ReminderKind, number>> = {};
  private firedToday = new Set<string>();
  private today = dayKey();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly cfg: Settings,
    private readonly state: StateStore,
    private readonly events: SchedulerEvents,
    /** Do Not Disturb: hold new reminders and freeze nagging while true. */
    private readonly isQuiet: () => boolean,
  ) {
    // Treat launch as a fresh start so she doesn't open with a nag.
    if (this.state.lastWaterAt === null) this.state.lastWaterAt = Date.now();
  }

  start(): void {
    this.timer = setInterval(() => this.tick(), 30_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get pendingKind(): ReminderKind | null {
    return this.pending?.kind ?? null;
  }

  get ignoredCount(): number {
    return this.pending?.nags ?? 0;
  }

  /** The user did the thing. */
  complied(kind: ReminderKind): number {
    const nags = this.pending?.kind === kind ? this.pending.nags : 0;
    if (kind === 'water') this.state.lastWaterAt = Date.now();
    if (kind === 'meal') this.state.lastMealAt = Date.now();
    if (this.pending?.kind === kind) this.pending = null;
    this.snoozes[kind] = 0;
    return nags;
  }

  /** "Not yet" — she'll ask again after the snooze. */
  snoozed(kind: ReminderKind): void {
    this.pending = null;
    this.snoozedUntil[kind] = Date.now() + this.cfg.snoozeMin * MINUTE;
    this.snoozes[kind] = (this.snoozes[kind] ?? 0) + 1;
    // Let meals and bedtime re-fire after the snooze instead of once a day.
    const stale = [...this.firedToday].filter((k) => k.startsWith(`${kind}:`));
    for (const key of stale) this.firedToday.delete(key);
  }

  /** Force a reminder right now (demo and "try it" buttons). */
  trigger(kind: ReminderKind): void {
    this.fire(kind);
  }

  tick(now = Date.now()): void {
    const key = dayKey(new Date(now));
    if (key !== this.today) {
      this.today = key;
      this.firedToday.clear();
    }

    if (this.isQuiet()) {
      // Freeze the nag clock so she doesn't pile up "ignored" while you're busy.
      if (this.pending) this.pending.lastNagAt = now;
      return;
    }

    if (this.pending) {
      if (now - this.pending.lastNagAt >= this.cfg.nagAfterMin * MINUTE) {
        this.pending.nags += 1;
        this.pending.lastNagAt = now;
        if (this.pending.nags > this.cfg.maxNags) {
          const kind = this.pending.kind;
          this.pending = null;
          this.events.onGaveUp(kind);
        } else {
          this.events.onIgnored(this.pending.kind, this.pending.nags);
        }
      }
      return;
    }

    const snoozed = (kind: ReminderKind) =>
      (this.snoozedUntil[kind] ?? 0) > now;

    // Bedtime wins over everything else late at night.
    if (this.cfg.bedtime.enabled) {
      const bedtimeAt = todayAt(this.cfg.bedtime.time, new Date(now));
      if (
        now >= bedtimeAt &&
        !this.firedToday.has('bedtime:0') &&
        !snoozed('bedtime')
      ) {
        this.firedToday.add('bedtime:0');
        this.fire('bedtime');
        return;
      }
    }

    // Meals: fire within a 3-hour window after each configured time, unless you
    // already logged a meal after that time.
    if (this.cfg.meals.enabled) {
      for (const t of this.cfg.meals.times) {
        const at = todayAt(t, new Date(now));
        const inWindow = now >= at && now < at + 3 * 60 * MINUTE;
        const alreadyAte = (this.state.lastMealAt ?? 0) >= at;
        const mealKey = `meal:${t}`;
        if (
          inWindow &&
          !alreadyAte &&
          !this.firedToday.has(mealKey) &&
          !snoozed('meal')
        ) {
          this.firedToday.add(mealKey);
          this.fire('meal');
          return;
        }
      }
    }

    if (this.cfg.water.enabled) {
      const sinceWater = now - (this.state.lastWaterAt ?? 0);
      if (
        sinceWater >= this.cfg.water.intervalMin * MINUTE &&
        !snoozed('water')
      ) {
        this.fire('water');
      }
    }
  }

  private fire(kind: ReminderKind): void {
    const now = Date.now();
    this.pending = { kind, since: now, lastNagAt: now, nags: 0 };
    this.events.onReminder(kind, this.snoozes[kind] ?? 0);
  }
}

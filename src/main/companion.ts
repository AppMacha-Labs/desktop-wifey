import { BrowserWindow } from 'electron';
import { randomBytes } from 'node:crypto';
import { IPC, PROP_POSES, holdPoseFor, idlePoseFor } from '../shared/types';
import type {
  BrainContext,
  BubbleAction,
  CompanionEvent,
  DndStatus,
  HomeState,
  Mood,
  Pose,
  ReminderKind,
  Settings,
  ShowPayload,
  Snapshot,
} from '../shared/types';
import type { Brain } from './brain';
import { GAVE_UP } from './brain/canned';
import { Scheduler } from './scheduler';
import type { StateStore } from './state';
import type { Speech, Voice } from './voice';

const REMINDER_ACTIONS: Record<ReminderKind, BubbleAction[]> = {
  water: [
    { id: 'done', label: 'Drank it 💧', primary: true },
    { id: 'later', label: 'Not yet' },
  ],
  meal: [
    { id: 'done', label: 'I ate 🍛', primary: true },
    { id: 'later', label: 'Not yet' },
  ],
  bedtime: [
    { id: 'done', label: 'Going 😴', primary: true },
    { id: 'later', label: '15 more min' },
  ],
};

/** What she brings along for a reminder: a bottle for water, a plate for meals. */
const REMINDER_POSE: Partial<Record<ReminderKind, Pose>> = {
  water: 'water',
  meal: 'meal',
};

const MINUTE = 60_000;

/** Moods in which she glares or pouts rather than holding something out. */
const ANNOYED: ReadonlySet<Mood> = new Set<Mood>(['pouty', 'furious']);

/** How long a bubble waits for her voice before going up without it. */
const VOICE_WAIT_MS = 2500;

export interface CompanionDeps {
  settings: Settings;
  state: StateStore;
  brain: Brain;
  getWindow: () => BrowserWindow | null;
  /** Current Do Not Disturb status. */
  dnd: () => DndStatus;
  /** Something the window shows changed. */
  onChange: () => void;
  /** Her voice (silent without an ElevenLabs key). */
  voice: Voice;
  log: (msg: string) => void;
}

/**
 * Ties everything together: scheduler events come in, brain reactions and
 * bubbles go out to the overlay, state goes to the window.
 */
export class Companion {
  readonly scheduler: Scheduler;
  /** Which reminder each open bubble is about. */
  private readonly bubbleKind = new Map<string, ReminderKind>();
  private petStreak = 0;
  private petStreakTimer: NodeJS.Timeout | null = null;
  private spontaneousTimer: NodeJS.Timeout | null = null;
  private readonly cfg: Settings;
  private readonly state: StateStore;
  private readonly brain: Brain;

  constructor(private readonly deps: CompanionDeps) {
    this.cfg = deps.settings;
    this.state = deps.state;
    this.brain = deps.brain;
    this.scheduler = new Scheduler(
      this.cfg,
      this.state,
      {
        onReminder: (kind, snoozes) => {
          // Asking nicely, she brings the bottle or plate. Put off already (or
          // in a mood), she comes in pouting or glaring instead.
          const annoyed = snoozes > 0 || ANNOYED.has(this.state.mood);
          void this.react(
            { type: 'reminder', kind, ignoredCount: 0, snoozes },
            {
              actions: REMINDER_ACTIONS[kind],
              kind,
              pose: annoyed ? undefined : REMINDER_POSE[kind],
            },
          );
        },
        onIgnored: (kind, count) => {
          void this.react(
            { type: 'ignored', kind, ignoredCount: count },
            { actions: REMINDER_ACTIONS[kind], kind },
          );
        },
        onGaveUp: () => {
          const r = GAVE_UP[0];
          this.state.mood = r.mood;
          this.send(IPC.incoming);
          void this.show({
            line: r.line,
            pose: r.pose,
            mood: r.mood,
            actions: [],
            ttlMs: 12_000,
          });
          this.changed();
        },
      },
      () => this.quiet,
    );
  }

  start(): void {
    this.scheduler.start();
    setTimeout(() => {
      if (!this.quiet) void this.react({ type: 'greeting' }, { ttlMs: 10_000 });
    }, 1500);
    this.scheduleSpontaneous();
  }

  stop(): void {
    this.scheduler.stop();
    if (this.spontaneousTimer) clearTimeout(this.spontaneousTimer);
  }

  private get quiet(): boolean {
    return this.deps.dnd().quiet;
  }

  snapshot(): Snapshot {
    return {
      wifeName: this.cfg.wifeName,
      userName: this.cfg.userName,
      mood: this.state.mood,
      lastWaterAt: this.state.lastWaterAt,
      lastMealAt: this.state.lastMealAt,
      pendingReminder: this.scheduler.pendingKind,
      ignoredCount: this.scheduler.ignoredCount,
      petCount: this.state.petCount,
      brain: this.brain.kind,
      alwaysVisible: this.cfg.alwaysVisible,
      lingerMs: this.cfg.lingerSec * 1000,
      charSize: this.cfg.charSize,
      voiceVolume: this.cfg.voice.volume / 100,
      dnd: this.deps.dnd(),
    };
  }

  homeState(packaged: boolean): HomeState {
    return {
      settings: this.cfg,
      snapshot: this.snapshot(),
      dnd: this.deps.dnd(),
      packaged,
      voiceAvailable: this.deps.voice.available,
    };
  }

  /** Settings changed: push the parts the overlay cares about. */
  settingsChanged(): void {
    this.sendQuietly(IPC.snapshot, this.snapshot());
    this.changed();
  }

  /** Do Not Disturb started or ended. */
  dndChanged(status: DndStatus): void {
    const win = this.deps.getWindow();
    if (status.quiet) {
      // Get her off the screen: no popping up mid-call.
      this.sendQuietly(IPC.dismiss);
      this.sendQuietly(IPC.snapshot, this.snapshot());
      if (win && !win.isDestroyed()) setTimeout(() => win.hide(), 1500);
    } else {
      if (win && !win.isDestroyed()) win.showInactive();
      this.sendQuietly(IPC.snapshot, this.snapshot());
    }
    this.changed();
  }

  /** Shortcut, tray or window: call her over. Works even during Do Not Disturb. */
  summon(): void {
    const win = this.deps.getWindow();
    if (win && !win.isDestroyed() && !win.isVisible()) win.showInactive();
    void this.react({ type: 'summoned' }, { ttlMs: 9000 }, true);
  }

  /** Send her off-screen. */
  dismiss(): void {
    this.sendQuietly(IPC.dismiss);
  }

  /** The user clicked a bubble button. */
  async handleAction(bubbleId: string, actionId: string): Promise<void> {
    const kind = this.bubbleKind.get(bubbleId) ?? this.scheduler.pendingKind;
    this.bubbleKind.delete(bubbleId);
    if (!kind) return;

    if (actionId === 'done') {
      const ignored = this.scheduler.complied(kind);
      this.changed();
      await this.react(
        { type: 'complied', kind, ignoredCount: ignored },
        { ttlMs: 9000 },
      );
    } else if (actionId === 'later') {
      this.scheduler.snoozed(kind);
      await this.react({ type: 'snoozed', kind }, { ttlMs: 7000 });
    }
  }

  /** Head pats on the desktop. Streak resets after 30s of peace. */
  async pet(): Promise<void> {
    this.petStreak += 1;
    this.state.bumpPets();
    this.changed();
    if (this.petStreakTimer) clearTimeout(this.petStreakTimer);
    this.petStreakTimer = setTimeout(() => (this.petStreak = 0), 30_000);
    // Only talk on the first pat and every few after, otherwise just the hearts.
    if (this.petStreak === 1 || this.petStreak % 4 === 0) {
      await this.react(
        { type: 'petted', streak: this.petStreak },
        { ttlMs: 5000 },
      );
    } else {
      this.send(IPC.pose, 'love' satisfies Pose);
    }
  }

  /** Head pats in the window: counted, but she doesn't pop up on the desktop. */
  petInWindow(): void {
    this.state.bumpPets();
    this.changed();
  }

  /** Fire a reminder right now (tray demo, window "try it"). */
  demo(kind: ReminderKind): void {
    const win = this.deps.getWindow();
    if (win && !win.isDestroyed() && !win.isVisible()) win.showInactive();
    this.scheduler.trigger(kind);
  }

  private async react(
    event: CompanionEvent,
    opts: {
      actions?: BubbleAction[];
      kind?: ReminderKind;
      ttlMs?: number;
      /** Overrides the brain's pose (e.g. she brings water for a water reminder). */
      pose?: Pose;
    },
    force = false,
  ): Promise<void> {
    if (this.quiet && !force) return;
    // Tell the renderer first so she can drop in while the brain thinks. She
    // looks thoughtful meanwhile, unless she's bringing something or sulking,
    // which she shows from the start.
    const waitPose: Pose =
      (opts.pose && holdPoseFor(opts.pose, this.state.mood)) ??
      holdPoseFor('thinking', this.state.mood) ??
      'thinking';
    // The pose goes first so she drops in already holding it.
    this.send(IPC.pose, waitPose, force);
    // Called over: she comes to whichever screen he's on, even if she's
    // already standing on another one.
    this.send(IPC.incoming, { toCursor: event.type === 'summoned' }, force);
    let reaction;
    try {
      reaction = await this.brain.react(event, this.context());
    } catch (err) {
      this.deps.log(`react failed: ${(err as Error).message}`);
      return;
    }
    // The bottle or plate goes with asking nicely; annoyed, she pouts or
    // glares instead, whoever picked the prop.
    let pose = opts.pose ?? reaction.pose;
    if (PROP_POSES.has(pose) && ANNOYED.has(reaction.mood)) {
      pose = idlePoseFor(reaction.mood);
    }
    reaction = { ...reaction, pose };
    this.state.mood = reaction.mood;
    this.state.pushLine(reaction.line);
    const { spoken, ...shown } = reaction;
    const id = await this.show(
      { ...shown, actions: opts.actions ?? [], ttlMs: opts.ttlMs },
      force,
      spoken,
    );
    if (opts.kind) this.bubbleKind.set(id, opts.kind);
    this.changed();
  }

  private context(): BrainContext {
    const since = (at: number | null) =>
      at ? Math.round((Date.now() - at) / MINUTE) : null;
    return {
      localTime: new Date().toLocaleString('en-GB', {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
      minutesSinceWater: since(this.state.lastWaterAt),
      minutesSinceMeal: since(this.state.lastMealAt),
      currentMood: this.state.mood,
      recentLines: this.state.recentLines,
    };
  }

  /**
   * Put a bubble up, with her voice saying it when voice is on. The voice gets
   * a short head start so they arrive together; if it's slower than that (a
   * cold start), the bubble goes up anyway and the voice follows when ready.
   */
  private async show(
    payload: Omit<ShowPayload, 'id'>,
    force = false,
    /** The line as she says it, with audio tags, when it differs from the bubble. */
    spoken?: string,
  ): Promise<string> {
    const id = randomBytes(4).toString('hex');
    const speech = this.speak(spoken ?? payload.line, payload.mood);
    const audio = await Promise.race([
      speech,
      new Promise<'late'>((r) => setTimeout(() => r('late'), VOICE_WAIT_MS)),
    ]);
    if (audio === 'late') {
      void speech.then((late) => {
        if (late) this.send(IPC.voice, { id, audio: late }, force);
      });
    }
    this.send(
      IPC.show,
      { id, ...payload, audio: audio === 'late' ? undefined : audio },
      force,
    );
    return id;
  }

  /** Her voice for a line, unless voice is off or it's a quiet time. */
  private async speak(
    line: string,
    mood: Mood,
  ): Promise<Uint8Array<ArrayBuffer> | undefined> {
    const { voice } = this.deps;
    if (!this.cfg.voice.enabled || this.quiet || !voice.available) return;
    return (await voice.say(line, mood)).audio ?? undefined;
  }

  /** From the window's "Try it": a sample line, whatever the on/off switch says. */
  tryVoice(): Promise<Speech> {
    const name = this.cfg.petName || this.cfg.userName;
    return this.deps.voice.say(
      `Hi ${name}, can you hear me? Drink some water, okay?`,
    );
  }

  /** Message the overlay, bringing it back on screen unless it's quiet time. */
  private send(channel: string, payload?: unknown, force = false): void {
    const win = this.deps.getWindow();
    if (!win || win.isDestroyed()) return;
    if (!win.isVisible() && (force || !this.quiet)) win.showInactive();
    win.webContents.send(channel, payload);
  }

  /** Message the overlay without changing its visibility. */
  private sendQuietly(channel: string, payload?: unknown): void {
    const win = this.deps.getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  private changed(): void {
    this.deps.onChange();
  }

  private scheduleSpontaneous(): void {
    // Somewhere between 90 and 150 minutes, as long as she isn't mid-nag.
    const delay = (90 + Math.random() * 60) * MINUTE;
    this.spontaneousTimer = setTimeout(async () => {
      if (!this.scheduler.pendingKind)
        await this.react({ type: 'spontaneous' }, { ttlMs: 9000 });
      this.scheduleSpontaneous();
    }, delay);
  }
}

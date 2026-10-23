// Types shared between the main process, the preload bridge and the renderers.

export const POSES = [
  'idle',
  'blink',
  'wave',
  'talk',
  'happy',
  'love',
  'pout',
  'angry',
  'sleepy',
  'thinking',
  'point',
  'water',
  'meal',
] as const;
export type Pose = (typeof POSES)[number];

/** The poses her brain can choose from. */
export const BRAIN_POSES = POSES as unknown as [Pose, ...Pose[]];

/** Poses where she's holding something out to him; she keeps holding it while she talks. */
export const PROP_POSES: ReadonlySet<Pose> = new Set<Pose>(['water', 'meal']);

export const MOODS = [
  'loving',
  'content',
  'playful',
  'worried',
  'pouty',
  'furious',
  'sleepy',
] as const;
export type Mood = (typeof MOODS)[number];

export type ReminderKind = 'water' | 'meal' | 'bedtime';

/** Something that happened that she should react to. */
export type CompanionEvent =
  | { type: 'greeting' }
  | { type: 'summoned' }
  /** `snoozes`: how many times he's already said "Not yet" to this one. */
  | {
      type: 'reminder';
      kind: ReminderKind;
      ignoredCount: number;
      snoozes: number;
    }
  | { type: 'ignored'; kind: ReminderKind; ignoredCount: number }
  | { type: 'complied'; kind: ReminderKind; ignoredCount: number }
  | { type: 'snoozed'; kind: ReminderKind }
  | { type: 'petted'; streak: number }
  | { type: 'spontaneous' };

/** What the brain decides she does in response to an event. */
export interface Reaction {
  mood: Mood;
  pose: Pose;
  line: string;
  /** The line as she says it out loud, with ElevenLabs audio tags ("[sighs]"). */
  spoken?: string;
}

/** Extra facts the brain gets alongside the event. */
export interface BrainContext {
  localTime: string;
  minutesSinceWater: number | null;
  minutesSinceMeal: number | null;
  currentMood: Mood;
  recentLines: string[];
}

export interface BubbleAction {
  id: string;
  label: string;
  primary?: boolean;
}

/** A speech bubble to show in the renderer. */
export interface ShowPayload {
  id: string;
  line: string;
  pose: Pose;
  mood: Mood;
  actions: BubbleAction[];
  /** Auto-dismiss after this many ms. Omit to keep until the user acts. */
  ttlMs?: number;
  /** Her voice saying the line (MP3), when voice is on. */
  audio?: Uint8Array<ArrayBuffer>;
}

/** Everything he can change from the window. Saved to settings.json. */
export interface Settings {
  wifeName: string;
  userName: string;
  /** What she affectionately calls him; '' for none. */
  petName: string;
  water: { enabled: boolean; intervalMin: number };
  /** "HH:MM" local times. */
  meals: { enabled: boolean; times: string[] };
  bedtime: { enabled: boolean; time: string };
  /** Minutes before an unanswered reminder counts as ignored. */
  nagAfterMin: number;
  /** Minutes a "Not yet" buys. */
  snoozeMin: number;
  /** How many times she nags before she gives up and sulks. */
  maxNags: number;
  /** When false she runs off-screen between events. */
  alwaysVisible: boolean;
  /** Seconds she hangs around after a bubble closes. */
  lingerSec: number;
  /** How big she is on the desktop, in px. */
  charSize: number;
  /** Electron accelerator that summons her from anywhere. */
  summonShortcut: string;
  quietHours: { enabled: boolean; start: string; end: string };
  /** Hide and hold reminders while a call or screen share is running. */
  pauseDuringCalls: boolean;
  launchAtLogin: boolean;
  /** Speak her lines out loud (needs an ElevenLabs key). Volume is 0-100. */
  voice: { enabled: boolean; volume: number };
}

export type SettingsPatch = {
  [K in keyof Settings]?: Settings[K] extends object
    ? Partial<Settings[K]>
    : Settings[K];
};

/** What the overlay and the window know about the current state. */
export interface Snapshot {
  wifeName: string;
  userName: string;
  mood: Mood;
  lastWaterAt: number | null;
  lastMealAt: number | null;
  pendingReminder: ReminderKind | null;
  ignoredCount: number;
  petCount: number;
  brain: 'claude' | 'canned';
  alwaysVisible: boolean;
  lingerMs: number;
  charSize: number;
  /** How loud her voice plays, 0-1. */
  voiceVolume: number;
  /** In a call, quiet hours or paused: she stays out of the way. */
  dnd: DndStatus;
}

export type DndReason = 'quiet-hours' | 'paused' | 'call';

export interface DndStatus {
  quiet: boolean;
  reason: DndReason | null;
  /** When a manual pause ends. */
  pausedUntil: number | null;
}

/** Everything the window shows. */
export interface HomeState {
  settings: Settings;
  snapshot: Snapshot;
  dnd: DndStatus;
  /** Launch at login only really sticks in a packaged build. */
  packaged: boolean;
  /** An ElevenLabs key is configured, so she can speak. */
  voiceAvailable: boolean;
}

export type HomeAction =
  | 'summon'
  | 'dismiss'
  | 'remind-water'
  | 'remind-meal'
  | 'remind-bedtime';

export type ArtManifest = Partial<Record<Pose, string>>;

/** Animated clips from `npm run clips`: name -> transparent WebM bytes. */
export type ClipManifest = Record<string, Uint8Array<ArrayBuffer>>;

/** A screen her overlay can be on. Sizes are the work area, in px. */
export interface ScreenInfo {
  id: string;
  primary: boolean;
  width: number;
  height: number;
}

export const IPC = {
  // main -> overlay
  show: 'wifey:show',
  pose: 'wifey:pose',
  snapshot: 'wifey:snapshot',
  /** Something is about to be said: start running in now to hide the brain latency. */
  incoming: 'wifey:incoming',
  /** Send her off-screen. */
  dismiss: 'wifey:dismiss',
  /** Her voice for a bubble that went up before the audio was ready. */
  voice: 'wifey:voice',
  // overlay -> main
  action: 'wifey:action',
  pet: 'wifey:pet',
  dismissed: 'wifey:dismissed',
  ignoreMouse: 'wifey:ignore-mouse',
  getArt: 'wifey:get-art',
  getClips: 'wifey:get-clips',
  cursorScreen: 'wifey:cursor-screen',
  currentScreen: 'wifey:current-screen',
  moveToScreen: 'wifey:move-to-screen',
  /** The screen she's on went away; she's been moved to another. */
  screenChanged: 'wifey:screen-changed',
  getSnapshot: 'wifey:get-snapshot',
  openHome: 'wifey:open-home',
  // window <-> main
  homeState: 'home:state',
  homeChanged: 'home:changed',
  homeUpdateSettings: 'home:update-settings',
  homePause: 'home:pause',
  homeAction: 'home:action',
  homePet: 'home:pet',
  homeTryVoice: 'home:try-voice',
} as const;

/** The overlay's API, exposed by the preload script on `window.wifey`. */
export interface WifeyApi {
  onShow(cb: (payload: ShowPayload) => void): () => void;
  onPose(cb: (pose: Pose) => void): () => void;
  onSnapshot(cb: (snapshot: Snapshot) => void): () => void;
  /** Something's coming; `toCursor` when she's been called over to his screen. */
  onIncoming(cb: (o: { toCursor?: boolean } | undefined) => void): () => void;
  onScreenChanged(cb: (s: ScreenInfo) => void): () => void;
  /** The screen his mouse is on. */
  cursorScreen(): Promise<ScreenInfo>;
  /** The screen her overlay is on. */
  currentScreen(): Promise<ScreenInfo>;
  moveToScreen(id: string): Promise<ScreenInfo>;
  /** Off she goes. */
  onDismiss(cb: () => void): () => void;
  /** Late audio for a bubble already on screen. */
  onVoice(
    cb: (v: { id: string; audio: Uint8Array<ArrayBuffer> }) => void,
  ): () => void;
  action(bubbleId: string, actionId: string): void;
  pet(): void;
  dismissed(bubbleId: string): void;
  setIgnoreMouse(ignore: boolean): void;
  getArt(): Promise<ArtManifest>;
  getClips(): Promise<ClipManifest>;
  getSnapshot(): Promise<Snapshot>;
  openHome(): void;
}

/** The window's API, exposed by the preload script on `window.home`. */
export interface HomeApi {
  getState(): Promise<HomeState>;
  onChanged(cb: () => void): () => void;
  updateSettings(
    patch: SettingsPatch,
  ): Promise<{ settings: Settings; error?: string }>;
  /** Minutes to pause for, 'tomorrow' for until 8am, or null to resume. */
  pause(until: number | 'tomorrow' | null): Promise<void>;
  action(action: HomeAction): Promise<void>;
  pet(): void;
  /** A sample line in her voice (MP3), or null with the reason she can't. */
  tryVoice(): Promise<{
    audio: Uint8Array<ArrayBuffer> | null;
    error?: string;
  }>;
}

/** Poses that show a mood on their own: pouting, angry, sleepy. */
export const MOOD_POSES: ReadonlySet<Pose> = new Set<Pose>([
  'pout',
  'angry',
  'sleepy',
]);

/**
 * The pose she should hold instead of thinking or talking: a prop she's
 * holding out, or her mood's pose when she's pouty, furious or sleepy (the
 * cheerful think/talk clips would contradict it). Null when she can talk.
 */
export function holdPoseFor(pose: Pose, mood: Mood): Pose | null {
  if (PROP_POSES.has(pose)) return pose;
  const moodPose = idlePoseFor(mood);
  if (moodPose === 'idle') return null;
  return MOOD_POSES.has(pose) ? pose : moodPose;
}

/** The idle pose she settles into for a given mood. */
export function idlePoseFor(mood: Mood): Pose {
  switch (mood) {
    case 'pouty':
      return 'pout';
    case 'furious':
      return 'angry';
    case 'sleepy':
      return 'sleepy';
    default:
      return 'idle';
  }
}

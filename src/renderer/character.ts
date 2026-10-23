import type { ArtManifest, Mood, Pose } from '../shared/types';
import { idlePoseFor } from '../shared/types';
import { placeholderSvg } from './placeholder';

/**
 * How the stage is moving her right now. `dir` is screen direction (-1 left,
 * 1 right); `rate` is how fast to play the run loop (the stage moves her by how
 * far the clip has played, so a faster clip is a faster run).
 */
export type Motion = { kind: 'run'; dir: -1 | 0 | 1; rate: number } | null;

/** What the stage needs from her to run in step with the clips. */
export interface Runner {
  /** Turn and set off (run-start). False if there's no clip for it. */
  startRun(dir: -1 | 1): boolean;
  /** Slow down and turn to face him (run-stop), `at` seconds in. */
  stopRun(dir: -1 | 1, at: number): boolean;
  /** The clip on screen right now and how far into it she is, in seconds. */
  clock(): { name: string; t: number; duration: number } | null;
}

/** Clips that repeat until something else happens; the rest play once and return to idle. */
const LOOPING = new Set([
  'idle',
  'talk',
  'run',
  'pout',
  'angry',
  'sleepy',
  'thinking',
  'water',
  'meal',
]);

/**
 * Clips that end on her standing still: when the next pose comes in near the
 * end of a cycle, they play out (up to MAX_FINISH_WAIT seconds) before handing
 * over, so the next clip starts from the same frame.
 */
const FINISH_FIRST = new Set(['talk']);
const MAX_FINISH_WAIT = 2.5;

/** Which clip each pose plays, when it exists. */
const POSE_CLIP: Partial<Record<Pose, string>> = {
  idle: 'idle',
  talk: 'talk',
  wave: 'wave',
  happy: 'happy',
  love: 'love',
  point: 'point',
  pout: 'pout',
  angry: 'angry',
  sleepy: 'sleepy',
  thinking: 'thinking',
  water: 'water',
  meal: 'meal',
};

/**
 * Where to start a clip, in seconds, when the generated take stands still a
 * while before the action. Add an entry if one of your clips starts slow.
 */
const CLIP_START: Partial<Record<string, number>> = {};

/**
 * Clips cut to join frame for frame with the one before them: they're loaded
 * ahead of time and swapped in with a straight cut, never a crossfade (a fade
 * would show the last frame frozen under the next clip's first).
 */
const FOLLOWS: Record<string, string> = { 'run-start': 'run' };

/** The run (and its start and stop) is drawn facing right; flip it to run left. */
const CLIP_FACES = 1;

interface ClipChoice {
  name: string;
  mirror: boolean;
  rate: number;
  /** Where to start in the clip, in seconds. */
  at?: number;
}

/**
 * The sprite. Plays an animated clip for the current pose or motion when one
 * exists (see `npm run clips`), otherwise shows the still art, otherwise the
 * SVG placeholder. Two video elements swap so changing clips never flashes.
 */
export class Character implements Runner {
  private pose: Pose = 'idle';
  private mood: Mood = 'content';
  private motion: Motion = null;
  private art: ArtManifest = {};
  private clips: Record<string, string> = {};
  private blinkTimer: number | null = null;
  private returnTimer: number | null = null;

  private readonly still: HTMLElement;
  private readonly videos: [HTMLVideoElement, HTMLVideoElement];
  private front = 0;
  private playing: ClipChoice | null = null;
  /** The clip actually on screen (the front video), which `playing` leads. */
  private shown: ClipChoice | null = null;
  /** The clip to start once the current one finishes its cycle. */
  private handoff: ClipChoice | null = null;
  /** A clip loaded and paused on its first frame in the spare video, ready to cut to. */
  private preloaded: { name: string; mirror: boolean } | null = null;
  /**
   * A one-shot that wins over her pose until it ends: turning and setting off
   * before a run (run-start), slowing down and turning back after (run-stop).
   */
  private transition: ClipChoice | null = null;

  constructor(private readonly el: HTMLElement) {
    this.still = document.createElement('div');
    this.still.className = 'still';
    this.videos = [this.makeVideo(), this.makeVideo()];
    el.append(this.still, ...this.videos);
  }

  setArt(art: ArtManifest): void {
    this.art = art;
    this.render();
    this.scheduleBlink();
  }

  /** name -> object URL of a transparent WebM. */
  setClips(clips: Record<string, string>): void {
    this.clips = clips;
    this.render();
  }

  setMood(mood: Mood): void {
    this.mood = mood;
    this.el.dataset.mood = mood;
  }

  /** Show a pose; after `holdMs` she drifts back to her idle pose. */
  setPose(pose: Pose, holdMs?: number): void {
    this.pose = pose;
    this.render();
    if (this.returnTimer) window.clearTimeout(this.returnTimer);
    this.returnTimer = null;
    if (holdMs) {
      this.returnTimer = window.setTimeout(
        () => this.setPose(idlePoseFor(this.mood)),
        holdMs,
      );
    }
  }

  /** The pose she's showing (or, mid-clip, about to show). */
  get currentPose(): Pose {
    return this.pose;
  }

  /** Back to whatever she does when nothing is happening. */
  rest(): void {
    this.setPose(idlePoseFor(this.mood));
  }

  setMotion(motion: Motion): void {
    this.motion = motion;
    // Setting off plays out before the loop takes over; anything else ends it.
    const settingOff =
      motion?.kind === 'run' && this.transition?.name === 'run-start';
    if (motion && !settingOff) this.transition = null;
    this.render();
  }

  startRun(dir: -1 | 1): boolean {
    if (!this.clips['run-start']) return false;
    this.transition = {
      name: 'run-start',
      mirror: dir !== CLIP_FACES,
      rate: 1,
    };
    this.render();
    return true;
  }

  stopRun(dir: -1 | 1, at: number): boolean {
    this.motion = null;
    if (!this.clips['run-stop']) {
      this.render();
      return false;
    }
    this.transition = {
      name: 'run-stop',
      mirror: dir !== CLIP_FACES,
      rate: 1,
      at,
    };
    this.render();
    return true;
  }

  clock(): { name: string; t: number; duration: number } | null {
    if (!this.shown) return null;
    const v = this.videos[this.front];
    return { name: this.shown.name, t: v.currentTime, duration: v.duration };
  }

  private render(): void {
    const choice = this.pickClip();
    this.el.dataset.pose = this.pose;
    this.el.classList.toggle('live', choice !== null);
    if (choice) {
      this.playClip(choice);
      return;
    }
    this.stopClips();
    this.renderStill(this.pose);
  }

  private pickClip(): ClipChoice | null {
    const m = this.motion;
    if (this.transition?.name === 'run-start') return this.transition;
    if (m && m.kind === 'run') {
      if (!this.clips.run) return null;
      return {
        name: 'run',
        mirror: m.dir !== 0 && m.dir !== CLIP_FACES,
        rate: Math.min(2.5, Math.max(0.5, m.rate)),
      };
    }
    if (this.transition) return this.transition;
    const name = POSE_CLIP[this.pose];
    return name && this.clips[name]
      ? { name, mirror: false, rate: 1, at: CLIP_START[name] }
      : null;
  }

  private playClip(choice: ClipChoice): void {
    const cur = this.playing;
    const front = this.videos[this.front];
    if (cur && cur === choice) return; // this transition is already playing
    // The same one-off clip already playing carries on rather than starting
    // over: asked to wave again mid-wave, she still waves once.
    if (
      cur &&
      cur.name === choice.name &&
      cur.mirror === choice.mirror &&
      !LOOPING.has(choice.name) &&
      cur !== this.transition
    ) {
      return;
    }
    if (
      cur &&
      cur.name === choice.name &&
      cur.mirror === choice.mirror &&
      LOOPING.has(choice.name)
    ) {
      // Same loop, new speed. It may still be loading behind the clip on
      // screen; then it picks the rate up when it starts.
      cur.rate = choice.rate;
      if (this.shown === cur) front.playbackRate = choice.rate;
      if (this.handoff) {
        // Asked to keep going after all: back to looping.
        this.handoff = null;
        front.loop = true;
      }
      return;
    }

    // Talking ends on her standing still, so let a nearly-finished cycle play
    // out and hand over from that frame instead of cutting mid-gesture.
    if (
      cur &&
      FINISH_FIRST.has(cur.name) &&
      choice.name !== 'run' &&
      !this.motion
    ) {
      const remaining =
        (front.duration - front.currentTime) / (front.playbackRate || 1);
      if (Number.isFinite(remaining) && remaining <= MAX_FINISH_WAIT) {
        this.handoff = choice;
        front.loop = false;
        front.onended = () => {
          const next = this.handoff;
          this.handoff = null;
          if (next && this.playing === cur) this.startClip(next);
        };
        return;
      }
    }
    this.handoff = null;
    this.startClip(choice);
  }

  private startClip(choice: ClipChoice): void {
    const front = this.videos[this.front];
    this.playing = choice;
    const back = this.videos[1 - this.front];
    const ready =
      this.preloaded?.name === choice.name &&
      this.preloaded.mirror === choice.mirror &&
      back.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    this.preloaded = null;
    this.setEnded(back, choice);

    if (ready) {
      // Cut straight to it: it's already showing its first frame.
      back.playbackRate = choice.rate;
      this.shown = choice;
      this.el.classList.add('cut');
      front.classList.remove('front', 'leaving');
      back.classList.add('front');
      this.front = 1 - this.front;
      front.pause();
      void back.play().catch(() => {});
      // Let the cut paint before fades come back.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => this.el.classList.remove('cut')),
      );
      return;
    }

    back.src = this.clips[choice.name];
    back.loop = LOOPING.has(choice.name);
    back.style.transform = choice.mirror ? 'scaleX(-1)' : '';
    back.onplaying = () => {
      back.onplaying = null;
      if (this.playing !== choice) return;
      back.playbackRate = choice.rate;
      this.shown = choice;
      // The new clip fades in on top while the old one holds underneath, so
      // she never goes see-through mid-swap.
      front.classList.add('leaving');
      front.classList.remove('front');
      back.classList.add('front');
      this.front = 1 - this.front;
      window.setTimeout(() => {
        front.classList.remove('leaving');
        if (!front.classList.contains('front')) front.pause();
        // Get whatever follows this clip ready in the now-spare video.
        const next = FOLLOWS[choice.name];
        if (next && this.playing === choice) this.preload(next, choice.mirror);
      }, 240);
    };
    back.currentTime = choice.at ?? 0;
    void back.play().catch(() => {
      /* superseded by a newer clip before it started */
    });
  }

  /** Load a clip into the spare video, paused on its first frame. */
  private preload(name: string, mirror: boolean): void {
    if (!this.clips[name]) return;
    const v = this.videos[1 - this.front];
    v.onplaying = null;
    v.onended = null;
    v.src = this.clips[name];
    v.loop = LOOPING.has(name);
    v.style.transform = mirror ? 'scaleX(-1)' : '';
    v.currentTime = 0;
    v.pause();
    this.preloaded = { name, mirror };
  }

  private setEnded(video: HTMLVideoElement, choice: ClipChoice): void {
    video.onended = () => {
      if (this.playing !== choice) return; // something else took over
      if (choice === this.transition) {
        // Set off (the run loop takes over) or stopped (back to her pose).
        this.transition = null;
        this.render();
        return;
      }
      // A one-shot finished: back to standing.
      this.rest();
    };
  }

  private stopClips(): void {
    this.handoff = null;
    this.preloaded = null;
    if (!this.playing) return;
    this.playing = null;
    this.shown = null;
    for (const v of this.videos) {
      v.pause();
      v.classList.remove('front', 'leaving');
    }
  }

  private renderStill(pose: Pose): void {
    const src = this.art[pose];
    this.still.innerHTML = src
      ? `<img src="${src}" alt="${pose}" draggable="false">`
      : placeholderSvg(pose);
  }

  private makeVideo(): HTMLVideoElement {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    return v;
  }

  private scheduleBlink(): void {
    if (this.blinkTimer) window.clearTimeout(this.blinkTimer);
    this.blinkTimer = window.setTimeout(
      () => {
        // Only blink the still art (clips blink on their own), from poses where
        // her eyes are open and there's a blink frame to show.
        const canBlink =
          !this.playing &&
          (this.pose === 'idle' || this.pose === 'talk') &&
          (this.art.blink || !this.art.idle);
        if (canBlink) {
          const before = this.pose;
          this.renderStill('blink');
          window.setTimeout(() => {
            if (this.pose === before && !this.playing) this.renderStill(before);
          }, 140);
        }
        this.scheduleBlink();
      },
      2500 + Math.random() * 3500,
    );
  }
}

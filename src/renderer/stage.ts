import type { Motion, Runner } from './character';
import { Gait } from './gait';

export type Side = 'left' | 'right' | 'top';
export type StageState = 'offstage' | 'entering' | 'onstage' | 'leaving';

interface Point {
  x: number;
  y: number;
}

// She runs across the screen at about SPEED_PER_PX x her size, px per second;
// long crossings get faster (capped by MAX_MS) by playing the run loop faster.
// The loop eases between 1x and that speed over RAMP clip-seconds as she sets
// off and before she stops, so she speeds up and slows down instead of lurching.
const SPEED_PER_PX = 1.6;
const MAX_MS = 3500;
const MAX_RATE = 2.5;
const RAMP = 0.6;
// Give up on a run that stops making progress (a clip that never plays).
const STALL_MS = 1500;
const STORAGE_KEY = 'wifey:rest';
// Empty strip under her feet in the art and clips, as a fraction of their height.
const ART_FOOT_GAP = 0.015;
const tr = (p: Point) => `translate(${p.x}px, ${p.y}px)`;
const clampNum = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Moves the actor (her + bubble) around the full-screen overlay.
 * She rests at a "home" spot the user can drag, drops in from the top to get
 * there, and runs off to the nearest edge when done. Summoned while running
 * off, she runs straight back.
 */
export class Stage {
  state: StageState = 'offstage';
  onStateChange?: (state: StageState) => void;
  /** How she's moving, so the character can play the matching clip. */
  onMotion?: (motion: Motion) => void;
  /** Her run clips, whose playback drives her position while running. */
  runner?: Runner;

  private rest: Point;
  /** Which screen she's on; each one has its own home spot. */
  private screen: { id: string; primary: boolean } | null = null;
  private anim: Animation | null = null;
  private seq = 0;
  private pending: Promise<void> | null = null;
  private runFrame: number | null = null;

  constructor(
    private readonly actor: HTMLElement,
    private readonly char: HTMLElement,
    private size: { w: number; h: number },
    private charSize: number,
  ) {
    this.rest = this.loadRest();
    this.place(this.offstagePoint('right'));
    window.addEventListener('resize', () => {
      this.rest = this.clamp(this.rest);
      if (this.state === 'onstage') this.place(this.rest);
    });
  }

  /** Where she is right now, mid-animation included. */
  currentPoint(): Point {
    const m = new DOMMatrixReadOnly(getComputedStyle(this.actor).transform);
    return { x: m.m41, y: m.m42 };
  }

  /** Run or drop in to the home spot. Resolves when she's standing there. */
  enter(side?: Side): Promise<void> {
    if (this.state === 'onstage') return Promise.resolve();
    if (this.state === 'entering' && this.pending) return this.pending;

    const from =
      this.state === 'leaving'
        ? this.currentPoint()
        : this.offstagePoint(side ?? 'top');
    this.cancel();
    this.place(from);
    this.setState('entering');

    const token = ++this.seq;
    const falling = from.y < this.rest.y - 10;
    if (!falling) {
      const offscreen = this.state !== 'leaving';
      this.actor.classList.add('moving');
      this.pending = this.stride(from, this.rest.x, {
        stop: true,
        wholeStrides: offscreen,
      }).then((done) => {
        if (!done || token !== this.seq) return;
        this.actor.classList.remove('moving');
        this.setState('onstage');
      });
      return this.pending;
    }

    this.actor.classList.add('falling');
    this.pending = this.run(
      from,
      this.rest,
      800,
      'cubic-bezier(.4, 0, .9, .4)',
    ).then(async () => {
      if (token !== this.seq) return;
      this.actor.classList.remove('falling');
      this.onMotion?.(null);
      this.char.classList.add('landed');
      await wait(400);
      this.char.classList.remove('landed');
      if (token === this.seq) this.setState('onstage');
    });
    return this.pending;
  }

  /** Run off to whichever side edge is closer. */
  async leave(): Promise<void> {
    if (this.state === 'offstage' || this.state === 'leaving') return;
    const from = this.currentPoint();
    this.cancel();
    this.place(from);
    this.setState('leaving');

    const side: Side =
      from.x + this.size.w / 2 < window.innerWidth / 2 ? 'left' : 'right';
    const token = ++this.seq;
    this.actor.classList.remove('falling');
    this.actor.classList.add('moving');
    const done = await this.stride(from, this.offstagePoint(side).x, {
      start: true,
    });
    if (!done || token !== this.seq) return;
    this.actor.classList.remove('moving');
    this.onMotion?.(null);
    this.setState('offstage');
  }

  /**
   * Runs her horizontally from `from` to `toX`, optionally setting off from
   * standing (run-start) and stopping at the end (run-stop). Her position is
   * read off the clips as they play, using how far her feet carry her in each
   * (gait.ts), so they stay planted whatever the speed and however long a clip
   * takes to start. With `wholeStrides` she starts a little further off screen
   * so the loop ends exactly where the stop clip picks up. Resolves true when
   * she gets there, false if something else took over.
   */
  private stride(
    from: Point,
    toX: number,
    opts: { start?: boolean; stop?: boolean; wholeStrides?: boolean },
  ): Promise<boolean> {
    const gait = new Gait(this.charSize);
    const dir: -1 | 1 = toX >= from.x ? 1 : -1;
    const runner = this.runner;
    const loopDur = (runner && this.loopDuration()) || 17 / 24;

    const start = Boolean(opts.start && runner?.startRun(dir));
    const startDist = start ? gait.startTotal : 0;
    const stopDist = opts.stop ? gait.stopTotal : 0;
    let loopDist = Math.max(0, Math.abs(toX - from.x) - startDist - stopDist);
    // Whole strides of the loop, so it hands over to run-stop on the frame the
    // stop clip starts from. The extra distance is added off screen.
    let origin = from.x;
    if (opts.wholeStrides && opts.stop) {
      const cycle = gait.loopSpeed * loopDur;
      const whole = Math.max(1, Math.ceil(loopDist / cycle)) * cycle;
      origin -= dir * (whole - loopDist);
      loopDist = whole;
    }
    const loopSecs = loopDist / gait.loopSpeed; // clip-seconds of loop to play

    // Cruise rate: the clip-seconds to play over the wall time we want.
    const total = Math.abs(toX - origin);
    const wantSecs = clampNum(
      total / (SPEED_PER_PX * this.charSize),
      0.5,
      MAX_MS / 1000,
    );
    const cruise = clampNum(loopSecs / wantSecs, 1, MAX_RATE);

    let phase: 'start' | 'loop' | 'stop' = start ? 'start' : 'loop';
    let looped = 0; // clip-seconds of loop played so far
    let lastT: number | null = null;
    let rate = 1;
    let progressAt = performance.now();
    let last = progressAt;
    const y = from.y;
    const at = (d: number) => this.place({ x: origin + dir * d, y });
    at(0);
    this.onMotion?.({ kind: 'run', dir, rate: start ? 1 : cruise });

    this.cancelRun();
    return new Promise<boolean>((resolve) => {
      const step = (now: number) => {
        const dt = (now - last) / 1000;
        last = now;
        if (this.runFrame === null) return resolve(false); // cancelled
        const c = runner?.clock() ?? null;

        if (phase === 'start') {
          if (c?.name === 'run-start') at(gait.start(c.t));
          if (c?.name === 'run') {
            phase = 'loop';
            lastT = null;
          }
        }

        if (phase === 'loop') {
          // Follow the loop's clock (or a stand-in when there are no clips).
          if (c?.name === 'run') {
            if (lastT !== null) {
              let d = c.t - lastT;
              if (d < -loopDur / 2) d += c.duration || loopDur;
              if (d > 0) looped += d;
            }
            lastT = c.t;
          } else if (!runner?.clock()) {
            looped += dt * rate;
          }
          at(startDist + looped * gait.loopSpeed);

          // Ease up after setting off, ease down before stopping.
          let target = cruise;
          if (start)
            target = Math.min(target, 1 + (cruise - 1) * (looped / RAMP));
          if (opts.stop) {
            const left = loopSecs - looped;
            target = Math.min(
              target,
              1 + (cruise - 1) * Math.max(0, left / RAMP),
            );
          }
          target = clampNum(target, 1, cruise);
          if (Math.abs(target - rate) > 0.02) {
            rate = target;
            this.onMotion?.({ kind: 'run', dir, rate });
          }

          if (opts.stop && looped >= loopSecs) {
            phase = 'stop';
            if (!runner?.stopRun(dir, Math.max(0, looped - loopSecs))) {
              this.place({ x: toX, y });
              this.runFrame = null;
              return resolve(true);
            }
          } else if (!opts.stop && this.offscreenX()) {
            this.runFrame = null;
            return resolve(true);
          }
        }

        if (phase === 'stop') {
          const base = startDist + loopDist;
          if (c?.name === 'run-stop') {
            at(base + gait.stop(c.t));
            if (c.t >= gait.stopSettled) {
              this.place({ x: toX, y });
              this.runFrame = null;
              return resolve(true);
            }
          } else {
            at(base);
          }
        }

        // Track progress so a clip that never plays can't strand her.
        if (!c || c.t !== lastSeen) {
          lastSeen = c?.t ?? -1;
          progressAt = now;
        } else if (now - progressAt > STALL_MS) {
          this.place({ x: opts.stop ? toX : origin + dir * total, y });
          this.runFrame = null;
          return resolve(true);
        }
        this.runFrame = requestAnimationFrame(step);
      };
      let lastSeen = -1;
      this.runFrame = requestAnimationFrame(step);
    });
  }

  private cancelRun(): void {
    if (this.runFrame !== null) cancelAnimationFrame(this.runFrame);
    this.runFrame = null;
  }

  /** Length of the run loop clip, once the character has one on screen. */
  private loopDuration(): number | null {
    const c = this.runner?.clock();
    return c?.name === 'run' && Number.isFinite(c.duration) ? c.duration : null;
  }

  /** Running off: her whole body is past the left or right edge. */
  private offscreenX(): boolean {
    const r = this.char.getBoundingClientRect();
    return r.right < 0 || r.left > window.innerWidth;
  }

  /**
   * She got bigger or smaller (settings). Keep her feet where they were and her
   * horizontal centre, so resizing doesn't make her jump around.
   */
  resize(size: { w: number; h: number }, charSize: number): void {
    const feetY = this.rest.y + this.size.h - this.footInset();
    const centreX = this.rest.x + this.size.w / 2;
    this.size = size;
    this.charSize = charSize;
    this.rest = this.clamp({
      x: centreX - size.w / 2,
      y: feetY - size.h + this.footInset(),
    });
    if (this.state === 'onstage') this.place(this.rest);
  }

  /** Dragging: the user is moving her by hand, no animation. */
  beginDrag(): void {
    this.cancel();
  }
  dragTo(p: Point): void {
    this.place(p);
  }
  endDrag(): void {
    this.rest = this.clamp(this.currentPoint());
    this.place(this.rest);
    this.saveRest();
  }

  private run(
    from: Point,
    to: Point,
    duration: number,
    easing: string,
  ): Promise<void> {
    this.anim = this.actor.animate(
      [{ transform: tr(from) }, { transform: tr(to) }],
      {
        duration,
        easing,
        fill: 'forwards',
      },
    );
    const anim = this.anim;
    return anim.finished.then(
      () => {
        this.place(to);
        anim.cancel();
        if (this.anim === anim) this.anim = null;
      },
      () => {
        /* cancelled by a newer move; the caller checks its token */
      },
    );
  }

  private cancel(): void {
    this.anim?.cancel();
    this.anim = null;
    this.cancelRun();
  }

  /**
   * Saved as where her feet are (horizontal centre and floor line), not the box
   * corner, so it means the same spot whatever size she is when it's read back.
   */
  /**
   * The overlay has moved to (or started on) this screen: use its home spot,
   * or bottom-centre if she's never been there.
   */
  useScreen(id: string, primary: boolean): void {
    this.screen = { id, primary };
    this.rest = this.loadRest();
    if (this.state === 'offstage') this.place(this.offstagePoint('top'));
    else if (this.state === 'onstage') this.place(this.rest);
  }

  /** Where this screen's home spot is saved. */
  private get storageKey(): string {
    return this.screen ? `${STORAGE_KEY}:${this.screen.id}` : STORAGE_KEY;
  }

  private saveRest(): void {
    const spot = {
      cx: this.rest.x + this.size.w / 2,
      feet: this.rest.y + this.size.h - this.footInset(),
    };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(spot));
    } catch {
      /* private mode or blocked storage: she just forgets the spot */
    }
  }

  /** Bottom-centre of the screen, feet just above the Dock. */
  private homeSpot(): Point {
    return this.clamp({
      x: (window.innerWidth - this.size.w) / 2,
      y: window.innerHeight - this.size.h + this.footInset(),
    });
  }

  private place(p: Point): void {
    this.actor.style.transform = tr(p);
  }

  private setState(state: StageState): void {
    this.state = state;
    this.actor.dataset.state = state;
    this.onStateChange?.(state);
  }

  private offstagePoint(side: Side): Point {
    const { w, h } = this.size;
    if (side === 'left') return { x: -w - 20, y: this.rest.y };
    if (side === 'right') return { x: window.innerWidth + 20, y: this.rest.y };
    return { x: this.rest.x, y: -h - 20 };
  }

  /**
   * Distance from the bottom of the actor box to the soles of her feet: the
   * character's bottom offset plus the empty strip under her feet in the art.
   * The box may hang this far below the window so her feet can touch the Dock.
   */
  private footInset(): number {
    const bottom = parseFloat(getComputedStyle(this.char).bottom) || 0;
    return bottom + this.char.clientWidth * ART_FOOT_GAP;
  }

  private clamp(p: Point): Point {
    const maxY = window.innerHeight - this.size.h + this.footInset();
    return {
      x: clampNum(p.x, 0, Math.max(0, window.innerWidth - this.size.w)),
      y: clampNum(p.y, 0, Math.max(0, maxY)),
    };
  }

  private loadRest(): Point {
    const fallback = this.homeSpot();
    try {
      // Her main screen keeps the spot saved before she knew about screens.
      const raw =
        localStorage.getItem(this.storageKey) ??
        (this.screen?.primary !== false
          ? localStorage.getItem(STORAGE_KEY)
          : null);
      if (!raw) return fallback;
      const p = JSON.parse(raw) as Partial<
        Point & { cx: number; feet: number }
      >;
      if (typeof p.cx === 'number' && typeof p.feet === 'number') {
        return this.clamp({
          x: p.cx - this.size.w / 2,
          y: p.feet - this.size.h + this.footInset(),
        });
      }
      // Older saves stored the box corner.
      if (typeof p.x !== 'number' || typeof p.y !== 'number') return fallback;
      return this.clamp({ x: p.x, y: p.y });
    } catch {
      return fallback;
    }
  }
}

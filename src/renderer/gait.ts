// How far her feet carry her through the run clips, so the stage can move her
// in step with them: her position on screen comes from how far the clip has
// played, never from a timer, so her feet can't slide.
//
// Measured from the sample character's run take with scripts/gait.mjs (after
// scripts/split-run.mjs): px travelled per clip frame, in the clips' own
// 540px-wide frames. Your own character's run is a different take: run
// `node scripts/gait.mjs` and paste its numbers here.

const CLIP_PX = 540;
const FPS = 24;

/** Run loop: steady stride. */
const LOOP_PX_PER_FRAME = 29;

/**
 * run-start, frame by frame (frame n to n+1; the last one leads into the
 * loop): turning on the spot, then speeding up into her stride.
 */
const START_PX = [
  ...new Array<number>(11).fill(0),
  4,
  8,
  12,
  17,
  21,
  25,
  29,
  29,
  29,
  29,
  29,
];

/**
 * run-stop: the loop's stride for a few frames, then she slows to a stop and
 * the rest is turning on the spot.
 */
const STOP_PX = [29, 29, 29, 29, 29, 29, 29, 29, 25, 21, 17, 12, 8, 4];

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

/** Distance covered `t` seconds into a clip with these per-frame steps. */
function along(steps: number[], t: number): number {
  const f = Math.max(0, t * FPS);
  const whole = Math.min(steps.length, Math.floor(f));
  const part = whole < steps.length ? (f - whole) * steps[whole] : 0;
  return sum(steps.slice(0, whole)) + part;
}

/** Converts clip px to screen px for her current size. */
export class Gait {
  constructor(private readonly charSize: number) {}

  private get scale(): number {
    return this.charSize / CLIP_PX;
  }

  /** Screen px per second of the loop played at 1x. */
  get loopSpeed(): number {
    return LOOP_PX_PER_FRAME * FPS * this.scale;
  }

  /** Screen px from the start of run-start to `t` seconds in. */
  start(t: number): number {
    return along(START_PX, t) * this.scale;
  }

  get startTotal(): number {
    return sum(START_PX) * this.scale;
  }

  /** Screen px from the start of run-stop to `t` seconds in. */
  stop(t: number): number {
    return along(STOP_PX, t) * this.scale;
  }

  get stopTotal(): number {
    return sum(STOP_PX) * this.scale;
  }

  /** Seconds into run-stop at which she's stopped moving. */
  get stopSettled(): number {
    return STOP_PX.length / FPS;
  }
}

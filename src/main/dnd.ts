import { execFile } from 'node:child_process';
import type { DndReason, DndStatus, Settings } from '../shared/types';
import type { StateStore } from './state';

// Apps keep the display awake during calls and label why. Chrome/Meet says
// "WebRTC has active PeerConnections"; Zoom, Teams and FaceTime name the call
// or meeting. Plain video playback ("Video Wake Lock") is not a call.
const CALL =
  /webrtc|meeting|\bcall\b|conferenc|screen ?shar|facetime|zoom|teams|webex|huddle/i;
const NOT_CALL = /video wake lock|playing (video|audio)|media playback/i;

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** True when `now` falls in [start, end), wrapping past midnight. */
function inWindow(start: string, end: string, now = new Date()): boolean {
  const t = now.getHours() * 60 + now.getMinutes();
  const s = minutesOf(start);
  const e = minutesOf(end);
  return s <= e ? t >= s && t < e : t >= s || t < e;
}

function detectCall(): Promise<boolean> {
  if (process.platform !== 'darwin') return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile('pmset', ['-g', 'assertions'], { timeout: 4000 }, (err, out) => {
      if (err) return resolve(false);
      const names = [...out.matchAll(/named: "([^"]+)"/g)].map((m) => m[1]);
      resolve(names.some((n) => CALL.test(n) && !NOT_CALL.test(n)));
    });
  });
}

/**
 * Do Not Disturb. Quiet hours, a manual pause, and (optionally) any call or
 * screen share in progress all count. While quiet she stays hidden, reminders
 * wait, and her messages queue up until it's over.
 */
export class Dnd {
  private inCall = false;
  private last: DndStatus = { quiet: false, reason: null, pausedUntil: null };
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly cfg: Settings,
    private readonly state: StateStore,
    private readonly onChange: (status: DndStatus) => void,
  ) {}

  start(): void {
    void this.poll();
    this.timer = setInterval(() => void this.poll(), 15_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  get status(): DndStatus {
    return this.compute();
  }

  get quiet(): boolean {
    return this.compute().quiet;
  }

  /** Minutes, 'tomorrow' (8am next morning), or null to resume now. */
  pause(until: number | 'tomorrow' | null): void {
    if (until === null) {
      this.state.pausedUntil = null;
    } else if (until === 'tomorrow') {
      const d = new Date();
      d.setDate(d.getDate() + (d.getHours() < 8 ? 0 : 1));
      d.setHours(8, 0, 0, 0);
      this.state.pausedUntil = d.getTime();
    } else {
      this.state.pausedUntil = Date.now() + until * 60_000;
    }
    this.publish();
  }

  /** Re-evaluate now (settings changed, pause set, timer tick). */
  publish(): void {
    const next = this.compute();
    if (
      next.quiet !== this.last.quiet ||
      next.reason !== this.last.reason ||
      next.pausedUntil !== this.last.pausedUntil
    ) {
      this.last = next;
      this.onChange(next);
    }
  }

  private async poll(): Promise<void> {
    this.inCall = this.cfg.pauseDuringCalls ? await detectCall() : false;
    if (this.state.pausedUntil && this.state.pausedUntil <= Date.now()) {
      this.state.pausedUntil = null;
    }
    this.publish();
  }

  private compute(): DndStatus {
    const pausedUntil =
      this.state.pausedUntil && this.state.pausedUntil > Date.now()
        ? this.state.pausedUntil
        : null;
    let reason: DndReason | null = null;
    if (pausedUntil) reason = 'paused';
    else if (this.cfg.pauseDuringCalls && this.inCall) reason = 'call';
    else if (
      this.cfg.quietHours.enabled &&
      inWindow(this.cfg.quietHours.start, this.cfg.quietHours.end)
    )
      reason = 'quiet-hours';
    return { quiet: reason !== null, reason, pausedUntil };
  }
}

import { MOOD_POSES, PROP_POSES, holdPoseFor } from '../shared/types';
import type { Pose, ScreenInfo, Snapshot, WifeyApi } from '../shared/types';
import { Bubble } from './bubble';
import { Character } from './character';
import { Speaker } from './speaker';
import { burstHearts } from './hearts';
import { Stage } from './stage';

declare global {
  interface Window {
    wifey: WifeyApi;
  }
}

/** The box she lives in (her + bubble), from her size. Sets the CSS to match. */
function actorSize(charSize: number): { w: number; h: number } {
  return { w: Math.max(340, charSize + 80), h: charSize + 320 };
}

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};

export async function start(): Promise<void> {
  const { wifey } = window;
  const stageEl = $('#stage');
  const actorEl = $('#actor');
  const charEl = $('#char');
  const bubbleEl = $('#bubble');
  const heartsEl = $('#hearts');

  const character = new Character(charEl);
  // Real size arrives with the snapshot below; this just gets the stage going.
  const stage = new Stage(actorEl, charEl, actorSize(260), 260);
  stage.onMotion = (m) => character.setMotion(m);
  // Gone from his screen: put down whatever she was holding.
  stage.onStateChange = (state) => {
    if (state !== 'offstage') return;
    holding = null;
    bringing = null;
    character.rest();
  };
  stage.runner = character;

  let charSize = 0;
  const applySize = (px: number) => {
    if (px === charSize) return;
    charSize = px;
    const box = actorSize(px);
    stageEl.style.setProperty('--char-size', `${px}px`);
    stageEl.style.setProperty('--actor-w', `${box.w}px`);
    stageEl.style.setProperty('--actor-h', `${box.h}px`);
    stage.resize(box, px);
  };

  let alwaysVisible = false;
  let lingerMs = 6000;
  /**
   * A pose she keeps while her bubble types instead of talking: a bottle or
   * plate in her hands, or pouting/angry/sleepy.
   */
  let holding: Pose | null = null;
  /**
   * The pose she's been told to arrive in (holding out a bottle or plate, or
   * sulking): she drops in with it and keeps it until her bubble appears.
   */
  let bringing: Pose | null = null;
  let leaveTimer: number | null = null;
  /** Her voice. */
  const speaker = new Speaker();
  /** Bumps with every bubble, so a finished line can't settle a newer one. */
  let shown = 0;

  const cancelLeave = () => {
    if (leaveTimer) window.clearTimeout(leaveTimer);
    leaveTimer = null;
  };
  /** After a bubble closes she hangs around a bit, then runs off. */
  const scheduleLeave = () => {
    cancelLeave();
    if (alwaysVisible) return;
    leaveTimer = window.setTimeout(() => {
      leaveTimer = null;
      if (!bubble.isOpen && !alwaysVisible) void stage.leave();
    }, lingerMs);
  };
  /** The screen her overlay is on. */
  let screenId = '';
  const useScreen = (s: ScreenInfo) => {
    screenId = s.id;
    stage.useScreen(s.id, s.primary);
  };
  /** Move the overlay to another screen and wait for the window to resize. */
  const moveTo = async (target: ScreenInfo) => {
    const s = await wifey.moveToScreen(target.id);
    const since = performance.now();
    while (
      (window.innerWidth !== s.width || window.innerHeight !== s.height) &&
      performance.now() - since < 600
    ) {
      await new Promise((r) => requestAnimationFrame(r));
    }
    useScreen(s);
  };

  /**
   * Make sure she's on screen before saying anything: on whichever screen his
   * mouse is on. `toCursor` (he called her over) also brings her across from
   * another screen if she's already standing there.
   */
  let arriving: Promise<void> | null = null;
  const arrive = (toCursor = false): Promise<void> => {
    arriving ??= (async () => {
      cancelLeave();
      if (stage.state === 'onstage' && !toCursor) return;
      const target = await wifey.cursorScreen();
      if (stage.state === 'onstage') {
        if (target.id === screenId) return;
        // Run off this screen, then drop in on his.
        speaker.stop();
        bubble.close();
        await stage.leave();
      }
      if (stage.state === 'offstage' && target.id !== screenId) {
        await moveTo(target);
      }
      if (stage.state !== 'onstage') {
        character.setPose(bringing ?? 'idle');
        await stage.enter();
        if (!bringing) character.rest();
      }
    })().finally(() => (arriving = null));
    return arriving;
  };
  /** Shooed away from the tray's "Send her off". */
  const sendOff = () => {
    cancelLeave();
    bringing = null;
    speaker.stop();
    bubble.close();
    void stage.leave();
  };

  const bubble = new Bubble(bubbleEl, {
    onAction: (id, actionId) => {
      speaker.stop();
      wifey.action(id, actionId);
      character.rest();
      scheduleLeave();
    },
    onDismiss: (id) => {
      speaker.stop();
      wifey.dismissed(id);
      character.rest();
      scheduleLeave();
    },
    onTalking: (talking) => {
      if (talking && !holding) character.setPose('talk');
    },
  });

  const [art, clips, snapshot] = await Promise.all([
    wifey.getArt(),
    wifey.getClips(),
    wifey.getSnapshot(),
  ]);
  character.setMood(snapshot.mood);
  character.setArt(art);
  character.setClips(
    Object.fromEntries(
      Object.entries(clips).map(([name, bytes]) => [
        name,
        URL.createObjectURL(new Blob([bytes], { type: 'video/webm' })),
      ]),
    ),
  );
  if (Object.keys(clips).length) {
    console.log(`[wifey] clips: ${Object.keys(clips).join(', ')}`);
  }
  character.rest();
  applySize(snapshot.charSize);
  useScreen(await wifey.currentScreen());
  alwaysVisible = snapshot.alwaysVisible;
  lingerMs = snapshot.lingerMs;
  speaker.volume = snapshot.voiceVolume;
  stageEl.dataset.brain = snapshot.brain;
  if (alwaysVisible) void arrive();

  /** Settings changed in her window: size, keep-on-screen, linger. */
  const applySnapshot = (s: Snapshot) => {
    character.setMood(s.mood);
    applySize(s.charSize);
    lingerMs = s.lingerMs;
    speaker.volume = s.voiceVolume;
    if (s.alwaysVisible !== alwaysVisible) {
      alwaysVisible = s.alwaysVisible;
      if (alwaysVisible) void arrive();
      else if (!bubble.isOpen) scheduleLeave();
    }
  };

  wifey.onIncoming((o) => {
    void arrive(Boolean(o?.toCursor));
  });
  // Her screen was unplugged: main moved her to another one.
  wifey.onScreenChanged(useScreen);
  wifey.onShow(async (payload) => {
    await arrive();
    character.setMood(payload.mood);
    holding = holdPoseFor(payload.pose, payload.mood);
    bringing = null;
    if (holding) character.setPose(holding);
    bubble.show(payload);
    // Talk while the line types (and while she's saying it out loud), then
    // settle into the reaction pose.
    const seq = ++shown;
    const typing = new Promise((r) =>
      window.setTimeout(r, Math.min(2500, 30 + payload.line.length * 24)),
    );
    const speaking = payload.audio ? speaker.play(payload.audio) : null;
    await Promise.all([typing, speaking]);
    if (seq !== shown) return;
    character.setPose(
      holding ?? payload.pose,
      payload.actions.length ? undefined : 6000,
    );
  });
  wifey.onPose((pose) => {
    if (PROP_POSES.has(pose) || MOOD_POSES.has(pose)) bringing = pose;
    // She thinks once she's landed, not mid-drop.
    if (pose === 'thinking' && stage.state !== 'onstage') return;
    // Thinking, holding something out or sulking last until her line arrives;
    // anything else (a pet in her window) is a moment.
    const waiting =
      pose === 'thinking' || PROP_POSES.has(pose) || MOOD_POSES.has(pose);
    character.setPose(pose, waiting ? undefined : 2500);
  });
  // Her voice was slower than the bubble: say it now if it's still up.
  wifey.onVoice(({ id, audio }) => {
    if (bubble.currentId !== id) return;
    const seq = shown;
    if (!holding) character.setPose('talk');
    void speaker.play(audio).then(() => {
      if (seq === shown && bubble.currentId === id && !holding)
        character.rest();
    });
  });
  wifey.onSnapshot(applySnapshot);
  wifey.onDismiss(sendOff);

  // Click-through everywhere except her and her bubble. Forwarding keeps
  // mousemove flowing while ignored, so we can switch back.
  let ignoring = false;
  document.addEventListener('mousemove', (e) => {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    // Mid-drag she is always solid, so letting go never lands on the app below.
    const solid =
      Boolean(press?.dragging) || Boolean(target?.closest('#char, #bubble'));
    if (solid === ignoring) {
      ignoring = !solid;
      wifey.setIgnoreMouse(ignoring);
    }
  });

  // Press on her: drag to move her home spot, click to pet her, double-click
  // to open her window. The pet waits a beat so a double-click doesn't count.
  let petTimer: number | null = null;
  let press: {
    x: number;
    y: number;
    ox: number;
    oy: number;
    dragging: boolean;
  } | null = null;
  charEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || stage.state !== 'onstage') return;
    const p = stage.currentPoint();
    press = {
      x: e.clientX,
      y: e.clientY,
      ox: p.x,
      oy: p.y,
      dragging: false,
    };
  });
  window.addEventListener('mousemove', (e) => {
    if (!press) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (!press.dragging && Math.hypot(dx, dy) > 5) {
      press.dragging = true;
      stageEl.classList.add('dragging');
      cancelLeave();
      stage.beginDrag();
    }
    if (!press.dragging) return;
    stage.dragTo({ x: press.ox + dx, y: press.oy + dy });
  });
  window.addEventListener('mouseup', () => {
    if (!press) return;
    if (press.dragging) {
      stageEl.classList.remove('dragging');
      stage.endDrag();
      if (!bubble.isOpen) scheduleLeave();
    } else if (petTimer) {
      window.clearTimeout(petTimer);
      petTimer = null;
      wifey.openHome();
    } else {
      burstHearts(heartsEl);
      character.setPose('love', 1800);
      petTimer = window.setTimeout(() => {
        petTimer = null;
        wifey.pet();
      }, 260);
    }
    press = null;
  });
}

import './home.css';
import { POSES } from '../shared/types';
import type {
  HomeAction,
  HomeApi,
  HomeState,
  Mood,
  Pose,
  Settings,
  SettingsPatch,
  WifeyApi,
} from '../shared/types';
import { Character } from '../renderer/character';
import { Speaker } from '../renderer/speaker';
import { burstHearts } from '../renderer/hearts';

declare global {
  interface Window {
    home: HomeApi;
    wifey: WifeyApi;
  }
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
const $$ = <T extends HTMLElement = HTMLElement>(sel: string): T[] => [
  ...document.querySelectorAll<T>(sel),
];

/** Build an element with text content (never innerHTML for anything she or he typed). */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

const clock = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

const MOOD_TEXT: Record<Mood, string> = {
  loving: 'feeling loving',
  content: 'content',
  playful: 'feeling playful',
  worried: 'a little worried about you',
  pouty: 'pouting at you',
  furious: 'furious. drink water.',
  sleepy: 'sleepy',
};

const POSE_LABEL: Partial<Record<Pose, string>> = {
  idle: '🙂 idle',
  wave: '👋 wave',
  talk: '💬 talk',
  happy: '🎉 happy',
  love: '😘 love',
  point: '👉 point',
  thinking: '🤔 thinking',
  pout: '😤 pout',
  angry: '😠 angry',
  sleepy: '🥱 sleepy',
  water: '💧 water',
  meal: '🍛 meal',
};

// ---------------------------------------------------------------------

const { home, wifey } = window;
let state: HomeState;
const character = new Character($('#big-char'));

function toast(message: string, error = false): void {
  const t = $('#toast');
  t.textContent = message;
  t.classList.toggle('error', error);
  t.classList.add('show');
  window.clearTimeout(Number(t.dataset.timer));
  t.dataset.timer = String(
    window.setTimeout(() => t.classList.remove('show'), error ? 4200 : 1600),
  );
}

async function refresh(): Promise<void> {
  state = await home.getState();
  render();
}

function render(): void {
  renderPortrait();
  fillSettings();
}

// ---------------------------------------------------------------------
// portrait

function updateSky(): void {
  const h = new Date().getHours();
  $('#arch').dataset.sky =
    h >= 5 && h < 8
      ? 'dawn'
      : h >= 8 && h < 17
        ? 'day'
        : h >= 17 && h < 20
          ? 'dusk'
          : 'night';
}

function renderPortrait(): void {
  const { settings, snapshot, dnd } = state;
  $('#her-name').textContent = settings.wifeName;
  $('#mood-text').textContent = MOOD_TEXT[snapshot.mood];
  $('#mood-dot').dataset.mood = snapshot.mood;
  character.setMood(snapshot.mood);
  document.title = settings.wifeName;

  $('#brain-badge').textContent =
    snapshot.brain === 'claude'
      ? '✦ thinking with Claude'
      : 'canned lines · add an Anthropic key to .env';

  const chip = $<HTMLButtonElement>('#dnd-chip');
  chip.hidden = !dnd.quiet;
  if (dnd.reason === 'paused' && dnd.pausedUntil) {
    chip.textContent = `💤 Paused until ${clock.format(dnd.pausedUntil)} · resume`;
  } else if (dnd.reason === 'call') {
    chip.textContent = '📞 You’re on a call, she’s hiding';
  } else if (dnd.reason === 'quiet-hours') {
    chip.textContent = '🌙 Quiet hours';
  }
}

function petHer(): void {
  burstHearts($('#big-hearts'));
  character.setPose('love', 1800);
  home.pet();
}

// ---------------------------------------------------------------------
// preferences

function getPath(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (o, k) => (o as Record<string, unknown> | undefined)?.[k],
      obj,
    );
}

function patchFor(path: string, value: unknown): SettingsPatch {
  const [a, b] = path.split('.');
  return (b ? { [a]: { [b]: value } } : { [a]: value }) as SettingsPatch;
}

async function save(patch: SettingsPatch, quiet = false): Promise<void> {
  const r = await home.updateSettings(patch);
  state.settings = r.settings;
  fillSettings();
  renderPortrait();
  if (r.error) toast(r.error, true);
  else if (!quiet) toast('Saved');
}

const ACCEL_PRETTY: Record<string, string> = {
  Command: '⌘',
  CommandOrControl: '⌘',
  Control: '⌃',
  Ctrl: '⌃',
  Alt: '⌥',
  Option: '⌥',
  Shift: '⇧',
  Space: 'Space',
};
const prettyAccel = (a: string) =>
  a
    .split('+')
    .map((k) => ACCEL_PRETTY[k] ?? k)
    .join('');

function fillSettings(): void {
  const s = state.settings;
  const active = document.activeElement;

  for (const input of $$<HTMLInputElement>('input[data-setting]')) {
    if (input === active) continue;
    const v = getPath(s, input.dataset.setting!);
    if (input.type === 'checkbox') input.checked = Boolean(v);
    else input.value = String(v ?? '');
    if (input.type === 'range') paintRange(input);
  }

  for (const stepper of $$('.stepper')) {
    const out = stepper.querySelector('output');
    if (!out) continue;
    const v = getPath(s, stepper.dataset.setting!);
    out.replaceChildren(`${v} `, el('small', undefined, stepper.dataset.unit));
  }

  for (const row of $$('[data-requires]')) {
    row.classList.toggle('disabled', !getPath(s, row.dataset.requires!));
  }
  for (const row of $$('[data-requires-not]')) {
    row.classList.toggle(
      'disabled',
      Boolean(getPath(s, row.dataset.requiresNot!)),
    );
  }

  const meals = $('#meal-times');
  if (!meals.contains(active)) renderMeals(s);

  const sc = $('#shortcut');
  if (!sc.classList.contains('recording'))
    sc.textContent = prettyAccel(s.summonShortcut);

  $('#login-note').textContent = state.packaged
    ? ''
    : 'works fully in the installed app';
  $('#voice-note').textContent = state.voiceAvailable
    ? 'quiet during calls and Do Not Disturb'
    : 'add ELEVENLABS_API_KEY to .env, then restart her';
  $('#voice-group').classList.toggle('no-voice', !state.voiceAvailable);
  ($('[data-pause="resume"]') as HTMLButtonElement).hidden =
    state.dnd.reason !== 'paused';
}

function paintRange(input: HTMLInputElement): void {
  const min = Number(input.min);
  const max = Number(input.max);
  const v = Number(input.value);
  input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
  const out = document.querySelector(
    `output[data-for="${input.dataset.setting}"]`,
  );
  const unit: Record<string, string> = { lingerSec: 's', 'voice.volume': '%' };
  if (out) out.textContent = `${v}${unit[input.dataset.setting!] ?? 'px'}`;
}

function renderMeals(s: Settings): void {
  const box = $('#meal-times');
  box.replaceChildren();
  s.meals.times.forEach((t, i) => {
    const wrap = el('span', 'meal-time');
    const input = el('input');
    input.type = 'time';
    input.value = t;
    input.addEventListener('change', () => {
      const times = [...s.meals.times];
      times[i] = input.value;
      void save({ meals: { times } });
    });
    const remove = el('button', undefined, '×');
    remove.title = 'Remove';
    remove.onclick = () =>
      void save({ meals: { times: s.meals.times.filter((_, j) => j !== i) } });
    wrap.append(input, remove);
    box.append(wrap);
  });
  if (s.meals.times.length < 6) {
    const add = el('button', 'meal-add', '+ add');
    add.onclick = () => {
      const last = s.meals.times.at(-1) ?? '07:00';
      const h = (Number(last.split(':')[0]) + 3) % 24;
      void save({
        meals: {
          times: [...s.meals.times, `${String(h).padStart(2, '0')}:00`],
        },
      });
    };
    box.append(add);
  }
}

/** "Try it" next to her voice: a sample line, played in the window. */
const sampleSpeaker = new Speaker();
function setupVoiceTry(): void {
  const button = $<HTMLButtonElement>('#voice-try');
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const { audio, error } = await home.tryVoice();
      if (!audio) {
        toast(error ?? 'She can’t speak right now', true);
        return;
      }
      sampleSpeaker.volume = state.settings.voice.volume / 100;
      character.setPose('talk');
      await sampleSpeaker.play(audio);
      character.rest();
    } finally {
      button.disabled = false;
    }
  });
}

function setupSettings(): void {
  for (const input of $$<HTMLInputElement>('input[data-setting]')) {
    const path = input.dataset.setting!;
    if (input.type === 'range') {
      let timer = 0;
      input.addEventListener('input', () => {
        paintRange(input);
        window.clearTimeout(timer);
        // Live preview on the desktop while dragging, without spamming saves.
        timer = window.setTimeout(
          () => void save(patchFor(path, Number(input.value)), true),
          140,
        );
      });
      input.addEventListener('change', () => toast('Saved'));
      continue;
    }
    input.addEventListener('change', () => {
      const value = input.type === 'checkbox' ? input.checked : input.value;
      void save(patchFor(path, value));
    });
    if (input.type === 'text') {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
      });
    }
  }

  for (const stepper of $$('.stepper')) {
    const path = stepper.dataset.setting!;
    const step = Number(stepper.dataset.step);
    const min = Number(stepper.dataset.min);
    const max = Number(stepper.dataset.max);
    const minus = el('button', undefined, '−');
    const plus = el('button', undefined, '+');
    const bump = (dir: number) => {
      const cur = Number(getPath(state.settings, path));
      const next = Math.min(max, Math.max(min, cur + dir * step));
      if (next !== cur) void save(patchFor(path, next));
    };
    minus.type = plus.type = 'button';
    minus.onclick = () => bump(-1);
    plus.onclick = () => bump(1);
    stepper.append(minus, el('output'), plus);
  }

  // Shortcut recorder: click, press a combo with at least one modifier, Esc cancels.
  const sc = $<HTMLButtonElement>('#shortcut');
  sc.addEventListener('click', () => {
    sc.classList.add('recording');
    sc.textContent = 'Press keys…';
  });
  sc.addEventListener('blur', () => {
    sc.classList.remove('recording');
    fillSettings();
  });
  sc.addEventListener('keydown', (e) => {
    if (!sc.classList.contains('recording')) return;
    e.preventDefault();
    if (e.key === 'Escape') return sc.blur();
    const key = keyName(e);
    if (!key) return;
    const mods = [
      e.metaKey && 'Command',
      e.ctrlKey && 'Control',
      e.altKey && 'Alt',
      e.shiftKey && 'Shift',
    ].filter(Boolean) as string[];
    if (!mods.length && !/^F\d+$/.test(key)) {
      sc.textContent = 'Add ⌘ ⌃ ⌥ or ⇧';
      return;
    }
    sc.classList.remove('recording');
    void save({ summonShortcut: [...mods, key].join('+') });
    sc.blur();
  });

  for (const b of $$<HTMLButtonElement>('[data-pause]')) {
    b.addEventListener('click', async () => {
      const v = b.dataset.pause!;
      await home.pause(
        v === 'resume' ? null : v === 'tomorrow' ? 'tomorrow' : Number(v),
      );
      toast(v === 'resume' ? 'She’s back' : 'Paused. She’ll stay quiet.');
    });
  }

  const poses = $('#pose-chips');
  for (const pose of POSES) {
    const label = POSE_LABEL[pose];
    if (!label) continue;
    const b = el('button', 'chip', label);
    b.onclick = () => character.setPose(pose, 4000);
    poses.append(b);
  }
}

function keyName(e: KeyboardEvent): string | null {
  const c = e.code;
  if (/^Key[A-Z]$/.test(c)) return c.slice(3);
  if (/^Digit\d$/.test(c)) return c.slice(5);
  if (/^F\d{1,2}$/.test(c)) return c;
  const named: Record<string, string> = {
    Space: 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
  };
  return named[c] ?? null;
}

// ---------------------------------------------------------------------
// tabs, actions, boot
// actions, boot

const ACTION_TOAST: Partial<Record<HomeAction, string>> = {
  summon: 'She’s on her way',
  dismiss: 'Off she goes',
  'remind-water': 'Check your desktop',
  'remind-meal': 'Check your desktop',
  'remind-bedtime': 'Check your desktop',
};

async function boot(): Promise<void> {
  updateSky();
  window.setInterval(updateSky, 60_000);

  const [art, clips] = await Promise.all([wifey.getArt(), wifey.getClips()]);
  character.setArt(art);
  character.setClips(
    Object.fromEntries(
      Object.entries(clips).map(([name, bytes]) => [
        name,
        URL.createObjectURL(new Blob([bytes], { type: 'video/webm' })),
      ]),
    ),
  );
  character.rest();
  $('#big-char').addEventListener('click', petHer);

  setupSettings();
  setupVoiceTry();

  document.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!b) return;
    const action = b.dataset.action as HomeAction;
    void home.action(action);
    const msg = ACTION_TOAST[action];
    if (msg) toast(msg);
  });
  $('#dnd-chip').addEventListener('click', () => {
    if (state.dnd.reason === 'paused') void home.pause(null);
  });

  home.onChanged(() => void refresh());
  await refresh();
  console.log(
    `[wifey] window ready: ${Object.keys(clips).length} clips, brain ${state.snapshot.brain}`,
  );
}

boot().catch((err) => console.error('[wifey] home failed to start', err));

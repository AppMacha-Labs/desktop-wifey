# AGENTS.md

Guide for AI coding agents (and humans) working on desktop-wifey. The README is the friendly
version; this is the precise one.

## What this is

A macOS menu bar app (Electron + Vite + TypeScript). A transparent, click-through overlay window
covers the screen; a cartoon character drops into it to remind the user to drink water, eat and
go to bed. Her lines come from Claude (structured output) or from canned lines when there's no API
key. Her voice is optional ElevenLabs TTS. Her animation is either still PNGs or transparent WebM
clips made by the art scripts. No server, no network port, no phone app (that's on the roadmap).

## Commands

| Command                                | What it does                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `npm install`                          | Install dependencies                                                            |
| `npm start`                            | Run the app in dev (Electron Forge + Vite)                                      |
| `npm run typecheck`                    | `tsc --noEmit`, must pass                                                       |
| `npm run lint`                         | `oxlint` and `oxfmt --check`, must pass                                         |
| `npm run lint:fix`                     | Auto-fix lint and formatting                                                    |
| `npm run make`                         | Build a zipped, unsigned `.app` into `out/`                                     |
| `npm run clips -- --dry --all`         | Show the clip plan and estimated fal.ai cost, spends nothing                    |
| `npm run clips -- <name...>`           | Generate clips (spends money on fal.ai)                                         |
| `npm run clips -- <name> --rekey`      | Redo green-screen keying from the cached raw video (free)                       |
| `npm run pose -- --out x.png "<pose>"` | Make a new still pose from `idle.png` with an image-edit model on fal.ai        |
| `node scripts/split-run.mjs`           | Cut the `run-take` clip into `run-start`, `run`, `run-stop`                     |
| `node scripts/gait.mjs`                | Measure foot travel in the run clips; prints numbers for `src/renderer/gait.ts` |
| `node scripts/cadence.mjs <webm...>`   | Estimate steps per second of a run clip                                         |

Dev-only environment switches:

- `WIFEY_DEMO=water|meal|bedtime npm start` fires that reminder ~4 s after launch.
- `WIFEY_OPEN_HOME=1 npm start` opens her window on launch.
- `npm start -- -- --user-data-dir=/tmp/wifey-test` runs with a throwaway data folder (settings,
  state, saved home spot), so testing never touches a real install.
- `WIFEY_ART=art/sample` points the art scripts at another character folder (default
  `art/private`).

Before you finish a change: `npm run typecheck && npm run lint`.

## Architecture

```
main process (Node)                                  renderers (Chromium)
──────────────────                                   ────────────────────
Scheduler ──events──▶ Companion ──IPC show/pose──▶ overlay  (index.html → src/renderer/)
   ▲                    │  ▲                         Stage: where she is, enter/leave/drag
   │                    │  └─IPC action/pet──────── Character: still or clip for a pose
Settings / State        ▼                            Bubble: speech bubble + buttons
Dnd (quiet/calls)     Brain (Claude │ canned)        Speaker: plays her voice
                      Voice (ElevenLabs)
                                                     window   (home.html → src/home/)
                                     ◀──IPC home:*── Preferences + big portrait
```

- **One event in, one reaction out.** `Companion.react(event)` tells the overlay to bring her on
  screen (`incoming`) and show a "thinking" or prop pose, asks the brain for `{ mood, pose, line }`,
  fetches her voice in parallel (with a short head start), then sends `show`.
- **Settings are live.** `SettingsStore.current` is one object everyone reads at use time, so
  changes from the window apply without restarts. `settings.json` holds them; `.env` only seeds the
  first launch.
- **State** (`state.json`): mood, last water/meal time, pet count, recent lines (so she doesn't
  repeat herself), manual pause.
- **Do Not Disturb** (`dnd.ts`) polls `pmset -g assertions` for call/screen-share wake locks, plus
  quiet hours and manual pause. While quiet she's hidden and the scheduler freezes its nag clock.
- **Multiple screens.** The overlay covers one display's work area at a time. When she's summoned
  she moves to the display under the cursor; each display has its own saved home spot
  (localStorage in the overlay).
- **Art.** `src/main/art.ts` picks ONE character folder: `userData/art`, then `art/private`, then
  `art/sample` (first with an `idle.*`). Poses and clips come only from that folder. Missing poses
  fall back to the SVG placeholder in `src/renderer/placeholder.ts`.
- **Running.** She runs on and off screen with the `run-start` / `run` / `run-stop` clips; her
  position follows the clip's playback using per-frame foot travel in `src/renderer/gait.ts`, so
  her feet don't slide. Those numbers are measured per run take.

## File map

```
src/main.ts                 Electron entry: overlay window, tray menu, global shortcut, IPC wiring, screens
src/preload.ts              contextBridge: window.wifey (overlay) and window.home (window)
src/shared/types.ts         Poses, moods, events, settings, IPC channel names, shared helpers
src/main/companion.ts       Orchestrator: scheduler events → brain → bubbles; pets, summon, voice
src/main/scheduler.ts       When to remind, nag, escalate, give up (30 s tick, one pending reminder)
src/main/brain/index.ts     Picks Claude or canned; falls back to canned on any error
src/main/brain/claude.ts    One structured-output Claude call per event (zod schema)
src/main/brain/persona.ts   The system prompt (cached; keep it stable)
src/main/brain/canned.ts    Built-in lines for every event, used without a key or on failure
src/main/voice.ts           ElevenLabs TTS, mood → delivery tag, small cache
src/main/audio-tags.ts      Strip "[sighs]"-style tags from the text she shows
src/main/dnd.ts             Quiet hours, pause, call detection
src/main/settings.ts        settings.json: validation, clamping, live updates
src/main/config.ts          .env: keys, model, first-launch defaults
src/main/state.ts           state.json
src/main/art.ts             Finds her character folder; loads poses (data URLs) and clips (WebM bytes)
src/main/home.ts            Opens her window
src/renderer/app.ts         Overlay boot: arrive/leave, bubbles, petting, drag, click-through
src/renderer/stage.ts       Position, entrances from the top, running off to the nearest edge, drag
src/renderer/character.ts   Shows a pose as a clip (crossfaded) or a still; run clips; blink
src/renderer/gait.ts        Foot travel per frame of the run clips (re-measure per run take)
src/renderer/bubble.ts      Speech bubble with typewriter text and buttons
src/renderer/placeholder.ts SVG stand-in for any pose without art
src/renderer/speaker.ts     Plays MP3 bytes
src/renderer/hearts.ts      Floating hearts on a pet
src/home/main.ts            Her window: portrait, Preferences form, voice "Try it", pose chips
src/home/home.css           Her window's styles
src/index.css               Overlay styles (bubble moods, hearts, stage)
home.html / index.html      Window and overlay HTML
art/sample/                 The sample character: 13 poses + clips/ (committed)
art/private/                Your own character (gitignored, never commit)
art/clips.json              Clip specs: source pose, loop or not, duration, prompt
art/POSES.md                The art brief: every pose and when it shows
art/PROMPT.md               Copy-paste prompts for making a character with ChatGPT/Codex
scripts/clips.mjs           Poses → MiniMax H3 on fal.ai → keyed transparent WebM
scripts/pose.mjs            New still pose from an existing one (image edit on fal.ai)
scripts/split-run.mjs       Cut run-take into run-start / run / run-stop
scripts/gait.mjs            Foot travel per frame of the run clips, for src/renderer/gait.ts
scripts/cadence.mjs         Steps-per-second estimate for a run clip
docs/                       Screenshots used by the README
```

## Conventions

- TypeScript strict; `npm run typecheck` and `npm run lint` must pass. Formatting is `oxfmt`.
- Comments explain why, in plain sentences. Match the surrounding comment density.
- No new runtime dependencies without a good reason. Plain `fetch` over SDKs where it's one call.
- Main process owns all state and secrets. Renderers only get what's in `Snapshot`/`HomeState`
  and talk through `window.wifey` / `window.home` (see `src/preload.ts`). Keep
  `contextIsolation: true`, `nodeIntegration: false`.
- Her text must stay wholesome: short, sweet, cute, a little sassy. Never suggestive or physical,
  never mean about the user's body. The persona and the canned lines both follow this. Don't add
  real people's names or private details anywhere in the repo.
- Everything user-facing works without any API key (canned brain, silent voice, sample art).
- Spending money (fal.ai clips, image edits) only happens through explicit script runs. Always
  run `--dry` first.

## How to add a pose

1. Add the name to `POSES` in `src/shared/types.ts`. If it's a prop she holds out, add it to
   `PROP_POSES`; if it shows a mood on its own, to `MOOD_POSES`.
2. Give it a placeholder look in `LOOKS` in `src/renderer/placeholder.ts`.
3. Map it to a clip in `POSE_CLIP` in `src/renderer/character.ts`, and add it to `LOOPING` if the
   clip loops.
4. Add a chip label in `POSE_LABEL` in `src/home/main.ts`.
5. Tell the brain when to use it: the pose guide at the end of `src/main/brain/persona.ts`, and any
   canned lines in `src/main/brain/canned.ts` that should use it.
6. Draw it: `art/private/<pose>.png` (and `art/sample/<pose>.png` for the sample), then add a clip
   spec to `art/clips.json` and run `npm run clips -- --dry <pose>` before generating.
7. Document it in `art/POSES.md` and `art/PROMPT.md`.

## How to add a reminder

1. Add the kind to `ReminderKind` in `src/shared/types.ts`.
2. Add its settings to `Settings` (types), defaults in `src/main/config.ts`, validation in
   `merge()` in `src/main/settings.ts`, and controls in `home.html` (`data-setting="…"`).
3. Decide when it fires in `Scheduler.tick()` (`src/main/scheduler.ts`); call `this.fire(kind)`.
   If doing it should be remembered, update `complied()` and `src/main/state.ts`.
4. Give it bubble buttons in `REMINDER_ACTIONS` (and optionally a prop pose in `REMINDER_POSE`) in
   `src/main/companion.ts`. Button ids must stay `done` / `later`.
5. Add canned lines under the kind's name in `LINES` in `src/main/brain/canned.ts`, and mention it
   in the persona if it needs special handling.
6. Add a Demo entry in the tray menu (`buildTray()` in `src/main.ts`), a "Try it" chip in
   `home.html` with a matching `HomeAction`, and `WIFEY_DEMO` support in `src/main.ts`.

## What not to commit

- `.env` or any key. Only `.env.example`, with empty values.
- `art/private/` (someone's real face) and anything under `~/Library/Application Support/`.
- `art/sample/clips/raw/`, `art/sample/clips/.tmp/`, `*.preview.png` (pipeline leftovers,
  gitignored).
- `node_modules/`, `.vite/`, `out/`.
- Real people's names, messages or data in code, docs, prompts or tests.

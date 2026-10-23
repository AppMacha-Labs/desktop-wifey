import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
} from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { IPC } from './shared/types';
import type {
  HomeAction,
  ReminderKind,
  ScreenInfo,
  Settings,
  SettingsPatch,
} from './shared/types';
import { loadArtManifest, loadClips } from './main/art';
import { createBrain } from './main/brain';
import { Companion } from './main/companion';
import { loadEnv } from './main/config';
import { Dnd } from './main/dnd';
import { getHomeWindow, openHome } from './main/home';
import { SettingsStore } from './main/settings';
import { StateStore } from './main/state';
import { Voice } from './main/voice';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let companion: Companion | null = null;
let settings: SettingsStore | null = null;
let dnd: Dnd | null = null;
let voice: Voice | null = null;
let registeredShortcut: string | null = null;

const log = (msg: string) => console.log(`[wifey] ${msg}`);

/** The display her overlay is on; it moves to whichever screen she's called to. */
let overlayDisplayId: number | null = null;

function overlayDisplay(): Electron.Display {
  return (
    screen.getAllDisplays().find((d) => d.id === overlayDisplayId) ??
    screen.getPrimaryDisplay()
  );
}

function screenInfo(d: Electron.Display): ScreenInfo {
  return {
    id: String(d.id),
    primary: d.id === screen.getPrimaryDisplay().id,
    width: d.workArea.width,
    height: d.workArea.height,
  };
}

/** Put the overlay over a display's work area. */
function moveOverlay(win: BrowserWindow, d: Electron.Display): ScreenInfo {
  overlayDisplayId = d.id;
  win.setBounds(d.workArea);
  return screenInfo(d);
}

/**
 * One transparent, click-through window over the whole work area of one
 * screen. She can then drop in anywhere on it; the renderer turns mouse events
 * back on only over her.
 */
function createWindow(): BrowserWindow {
  const { workArea } = overlayDisplay();
  const win = new BrowserWindow({
    ...workArea,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // 'floating' keeps her above normal windows without fighting fullscreen apps.
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  win.setIgnoreMouseEvents(true, { forward: true });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
  win.once('ready-to-show', () => {
    if (!dnd?.quiet) win.showInactive();
  });
  win.on('closed', () => (mainWindow = null));

  // In dev, surface renderer console output in the terminal; there's no DevTools
  // window on a transparent overlay.
  if (!app.isPackaged) {
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error' || event.level === 'warning') {
        log(`[renderer ${event.level}] ${event.message}`);
      } else if (event.message.startsWith('[wifey]')) {
        log(`[renderer] ${event.message}`);
      }
    });
  }

  // Follow her screen if its resolution changes; if it's unplugged, move to
  // the main one and tell her, so she uses that screen's home spot.
  const refit = () => {
    if (win.isDestroyed()) return;
    const gone = !screen
      .getAllDisplays()
      .some((d) => d.id === overlayDisplayId);
    const info = moveOverlay(win, overlayDisplay());
    if (gone) win.webContents.send(IPC.screenChanged, info);
  };
  screen.on('display-metrics-changed', refit);
  screen.on('display-removed', refit);
  return win;
}

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  hour: 'numeric',
  minute: '2-digit',
});

/** The menu bar menu. Rebuilt whenever settings or Do Not Disturb change. */
function buildTray(): void {
  if (!settings || !companion || !dnd) return;
  if (!tray) {
    // An empty image plus a title gives a text-only menu bar item; no icon asset needed.
    tray = new Tray(nativeImage.createEmpty());
    tray.setToolTip('wifey');
  }
  const cfg = settings.current;
  const status = dnd.status;
  tray.setTitle(status.quiet ? '💤' : '💕');

  const pausedLabel =
    status.reason === 'paused' && status.pausedUntil
      ? `Paused until ${timeFmt.format(status.pausedUntil)}`
      : status.reason === 'call'
        ? 'Paused: you’re on a call'
        : status.reason === 'quiet-hours'
          ? 'Quiet hours'
          : null;
  const pause = (until: number | 'tomorrow' | null, label: string) => ({
    label,
    click: () => dnd?.pause(until),
  });
  const demo = (kind: ReminderKind, label: string) => ({
    label,
    click: () => companion?.demo(kind),
  });

  const template: MenuItemConstructorOptions[] = [
    { label: `Open ${cfg.wifeName}…`, click: () => openHome() },
    { type: 'separator' },
    {
      label: 'Summon her',
      accelerator: cfg.summonShortcut,
      click: () => companion?.summon(),
    },
    { label: 'Send her off', click: () => companion?.dismiss() },
    {
      label: 'Keep her on screen',
      type: 'checkbox',
      checked: cfg.alwaysVisible,
      click: (item) => settings?.update({ alwaysVisible: item.checked }),
    },
    {
      label: voice?.available
        ? 'Her voice'
        : 'Her voice (needs ElevenLabs key)',
      type: 'checkbox',
      enabled: Boolean(voice?.available),
      checked: Boolean(voice?.available) && cfg.voice.enabled,
      click: (item) =>
        settings?.update({ voice: { ...cfg.voice, enabled: item.checked } }),
    },
    {
      label: pausedLabel ? `Do not disturb · ${pausedLabel}` : 'Do not disturb',
      submenu: [
        pause(30, 'For 30 minutes'),
        pause(60, 'For 1 hour'),
        pause(120, 'For 2 hours'),
        pause('tomorrow', 'Until tomorrow morning'),
        { type: 'separator' },
        { ...pause(null, 'Resume now'), enabled: status.reason === 'paused' },
      ],
    },
    { type: 'separator' },
    {
      label: 'Demo',
      submenu: [
        demo('water', 'Water reminder now'),
        demo('meal', 'Meal reminder now'),
        demo('bedtime', 'Bedtime now'),
      ],
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

/** Point the global shortcut at `accel`. Returns false if macOS refused it. */
function registerShortcut(accel: string): boolean {
  if (registeredShortcut) globalShortcut.unregister(registeredShortcut);
  registeredShortcut = null;
  try {
    if (globalShortcut.register(accel, () => companion?.summon())) {
      registeredShortcut = accel;
      return true;
    }
  } catch {
    /* malformed accelerator */
  }
  return false;
}

/** Window changed something; push it everywhere it matters. */
let notifyTimer: NodeJS.Timeout | null = null;
function notifyHome(): void {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    getHomeWindow()?.webContents.send(IPC.homeChanged);
  }, 80);
}

function applySettings(prev: Settings): void {
  const cfg = settings!.current;
  if (cfg.launchAtLogin !== prev.launchAtLogin) {
    app.setLoginItemSettings({ openAtLogin: cfg.launchAtLogin });
  }
  if (
    cfg.quietHours.enabled !== prev.quietHours.enabled ||
    cfg.quietHours.start !== prev.quietHours.start ||
    cfg.quietHours.end !== prev.quietHours.end ||
    cfg.pauseDuringCalls !== prev.pauseDuringCalls
  ) {
    dnd?.publish();
  }
  companion?.settingsChanged();
  buildTray();
}

function registerIpc(): void {
  // ---- overlay ----
  ipcMain.on(IPC.action, (_e, bubbleId: string, actionId: string) => {
    void companion?.handleAction(bubbleId, actionId);
  });
  ipcMain.on(IPC.pet, () => void companion?.pet());
  ipcMain.on(IPC.ignoreMouse, (_e, ignore: boolean) => {
    mainWindow?.setIgnoreMouseEvents(ignore, { forward: true });
  });
  ipcMain.on(IPC.openHome, () => openHome());
  ipcMain.handle(IPC.getArt, () => loadArtManifest());
  ipcMain.handle(IPC.getClips, () => loadClips());
  ipcMain.handle(IPC.cursorScreen, () =>
    screenInfo(screen.getDisplayNearestPoint(screen.getCursorScreenPoint())),
  );
  ipcMain.handle(IPC.currentScreen, () => screenInfo(overlayDisplay()));
  ipcMain.handle(IPC.moveToScreen, (_e, id: string) => {
    const d = screen.getAllDisplays().find((x) => String(x.id) === id);
    if (!d || !mainWindow || mainWindow.isDestroyed()) {
      return screenInfo(overlayDisplay());
    }
    return moveOverlay(mainWindow, d);
  });
  ipcMain.handle(IPC.getSnapshot, () => companion?.snapshot());

  // ---- window ----
  ipcMain.handle(IPC.homeState, () => companion?.homeState(app.isPackaged));
  ipcMain.handle(IPC.homeUpdateSettings, (_e, patch: SettingsPatch) => {
    const store = settings!;
    let error: string | undefined;
    if (
      patch.summonShortcut &&
      patch.summonShortcut !== store.current.summonShortcut
    ) {
      if (!registerShortcut(patch.summonShortcut)) {
        registerShortcut(store.current.summonShortcut);
        error = `macOS wouldn't let wifey use ${patch.summonShortcut}; another app may own it.`;
        delete patch.summonShortcut;
      }
    }
    return { settings: store.update(patch), error };
  });
  ipcMain.handle(IPC.homePause, (_e, until: number | 'tomorrow' | null) =>
    dnd?.pause(until),
  );
  ipcMain.handle(IPC.homeAction, (_e, action: HomeAction) => {
    if (!companion) return;
    switch (action) {
      case 'summon':
        return companion.summon();
      case 'dismiss':
        return companion.dismiss();
      case 'remind-water':
        return companion.demo('water');
      case 'remind-meal':
        return companion.demo('meal');
      case 'remind-bedtime':
        return companion.demo('bedtime');
    }
  });
  ipcMain.on(IPC.homePet, () => companion?.petInWindow());
  ipcMain.handle(
    IPC.homeTryVoice,
    () => companion?.tryVoice() ?? { audio: null, error: 'not ready' },
  );
}

app.whenReady().then(() => {
  const env = loadEnv();
  const state = new StateStore();
  settings = new SettingsStore(env.defaults);
  const cfg = settings.current;
  const brain = createBrain(env, cfg, log);

  dnd = new Dnd(cfg, state, (status) => {
    companion?.dndChanged(status);
    buildTray();
  });

  mainWindow = createWindow();
  voice = new Voice(env.voice, log);
  if (!voice.available) log('no ELEVENLABS_API_KEY set, she stays silent');
  else if (settings.current.voice.enabled) voice.warm();
  companion = new Companion({
    settings: cfg,
    state,
    brain,
    getWindow: () => mainWindow,
    dnd: () => dnd!.status,
    onChange: notifyHome,
    voice,
    log,
  });

  settings.onChange(applySettings);

  registerIpc();
  if (!registerShortcut(cfg.summonShortcut)) {
    log(`could not register summon shortcut ${cfg.summonShortcut}`);
  }
  buildTray();
  dnd.start();
  companion.start();

  if (process.platform === 'darwin') app.dock?.hide();
  // Dev convenience: `WIFEY_OPEN_HOME=1 npm start` opens her window right away.
  if (!app.isPackaged && process.env.WIFEY_OPEN_HOME) openHome();
  // `WIFEY_DEMO=water npm start` (or meal, bedtime) fires that reminder a few
  // seconds after launch, for testing.
  const demoKind = process.env.WIFEY_DEMO;
  if (
    !app.isPackaged &&
    (demoKind === 'water' || demoKind === 'meal' || demoKind === 'bedtime')
  ) {
    setTimeout(() => companion?.demo(demoKind), 4000);
  }
  // Dock icon clicked while the window is open (or reopened).
  app.on('activate', () => openHome());
});

// She lives in the menu bar; closing the window must not quit the app.
app.on('window-all-closed', () => {
  /* keep running */
});

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('before-quit', () => {
  companion?.stop();
  dnd?.stop();
});

// Ctrl+C or kill from a terminal: quit properly so the overlay's saved home
// spot (localStorage) is flushed to disk instead of lost.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => app.quit());
}

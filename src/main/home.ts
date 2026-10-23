import { app, BrowserWindow, nativeTheme } from 'electron';
import path from 'node:path';

let homeWindow: BrowserWindow | null = null;

export function getHomeWindow(): BrowserWindow | null {
  return homeWindow && !homeWindow.isDestroyed() ? homeWindow : null;
}

/**
 * Her window: big character, chat, today's stats and preferences. One at a
 * time. The app shows in the Dock only while it's open, and goes back to being
 * a menu bar app when it closes.
 */
export function openHome(): BrowserWindow {
  const existing = getHomeWindow();
  if (existing) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return existing;
  }

  const win = new BrowserWindow({
    width: 1080,
    height: 740,
    minWidth: 920,
    minHeight: 640,
    title: 'wifey',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 22 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1d1517' : '#f8f1ea',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void win.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/home.html`);
  } else {
    void win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/home.html`),
    );
  }

  if (!app.isPackaged) {
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error' || event.level === 'warning') {
        console.log(`[wifey] [home ${event.level}] ${event.message}`);
      } else if (event.message.startsWith('[wifey]')) {
        console.log(`[wifey] [home] ${event.message}`);
      }
    });
  }

  win.once('ready-to-show', () => {
    if (process.platform === 'darwin') void app.dock?.show();
    win.show();
    win.focus();
  });
  win.on('closed', () => {
    homeWindow = null;
    if (process.platform === 'darwin') app.dock?.hide();
  });
  homeWindow = win;
  return win;
}

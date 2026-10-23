import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from './shared/types';
import type {
  ArtManifest,
  ClipManifest,
  HomeApi,
  HomeState,
  Pose,
  Settings,
  ScreenInfo,
  ShowPayload,
  Snapshot,
  WifeyApi,
} from './shared/types';

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, value: T) => cb(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// Both windows load this preload; each uses the API it needs.

const wifey: WifeyApi = {
  onShow: (cb) => subscribe<ShowPayload>(IPC.show, cb),
  onPose: (cb) => subscribe<Pose>(IPC.pose, cb),
  onVoice: (cb) =>
    subscribe<{ id: string; audio: Uint8Array<ArrayBuffer> }>(IPC.voice, cb),
  onSnapshot: (cb) => subscribe<Snapshot>(IPC.snapshot, cb),
  onIncoming: (cb) =>
    subscribe<{ toCursor?: boolean } | undefined>(IPC.incoming, cb),
  onScreenChanged: (cb) => subscribe<ScreenInfo>(IPC.screenChanged, cb),
  cursorScreen: () =>
    ipcRenderer.invoke(IPC.cursorScreen) as Promise<ScreenInfo>,
  currentScreen: () =>
    ipcRenderer.invoke(IPC.currentScreen) as Promise<ScreenInfo>,
  moveToScreen: (id) =>
    ipcRenderer.invoke(IPC.moveToScreen, id) as Promise<ScreenInfo>,
  onDismiss: (cb) => subscribe<void>(IPC.dismiss, cb),
  action: (bubbleId, actionId) =>
    ipcRenderer.send(IPC.action, bubbleId, actionId),
  pet: () => ipcRenderer.send(IPC.pet),
  dismissed: (bubbleId) => ipcRenderer.send(IPC.dismissed, bubbleId),
  setIgnoreMouse: (ignore) => ipcRenderer.send(IPC.ignoreMouse, ignore),
  getArt: () => ipcRenderer.invoke(IPC.getArt) as Promise<ArtManifest>,
  getClips: () => ipcRenderer.invoke(IPC.getClips) as Promise<ClipManifest>,
  getSnapshot: () => ipcRenderer.invoke(IPC.getSnapshot) as Promise<Snapshot>,
  openHome: () => ipcRenderer.send(IPC.openHome),
};

const home: HomeApi = {
  getState: () => ipcRenderer.invoke(IPC.homeState) as Promise<HomeState>,
  onChanged: (cb) => subscribe<void>(IPC.homeChanged, cb),
  updateSettings: (patch) =>
    ipcRenderer.invoke(IPC.homeUpdateSettings, patch) as Promise<{
      settings: Settings;
      error?: string;
    }>,
  pause: (until) => ipcRenderer.invoke(IPC.homePause, until) as Promise<void>,
  action: (action) =>
    ipcRenderer.invoke(IPC.homeAction, action) as Promise<void>,
  pet: () => ipcRenderer.send(IPC.homePet),
  tryVoice: () =>
    ipcRenderer.invoke(IPC.homeTryVoice) as ReturnType<HomeApi['tryVoice']>,
};

contextBridge.exposeInMainWorld('wifey', wifey);
contextBridge.exposeInMainWorld('home', home);

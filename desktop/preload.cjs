// Bridge between the desktop shell and the app. Only exposes what the app needs, nothing else.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("afterimageDesktop", {
  platform: process.platform,
  nowPlaying: {
    start: () => ipcRenderer.invoke("np:start"),
    stop: () => ipcRenderer.invoke("np:stop"),
    get: (haveArtId) => ipcRenderer.invoke("np:get", haveArtId),
  },
  // Opens System Settings at Privacy & Security → Screen & System Audio Recording (macOS).
  openAudioPermission: () => ipcRenderer.invoke("sys:audio-permission"),
});

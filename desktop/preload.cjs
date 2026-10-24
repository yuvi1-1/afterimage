// Bridge between the desktop shell and the app. Only exposes what the app needs, nothing else.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("afterimageDesktop", {
  platform: process.platform,
  nowPlaying: {
    start: () => ipcRenderer.invoke("np:start"),
    stop: () => ipcRenderer.invoke("np:stop"),
    get: () => ipcRenderer.invoke("np:get"),
  },
});

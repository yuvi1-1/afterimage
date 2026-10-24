// Afterimage desktop shell. Serves the same web build from a private app:// origin so
// workers, MIDI, camera, microphone and system-audio capture all behave like a secure site.
const { app, BrowserWindow, protocol, net, session, desktopCapturer, shell, Menu, ipcMain } = require("electron");
const nowPlaying = require("./nowplaying.cjs");
const path = require("path");
const { pathToFileURL } = require("url");

// System audio: Windows uses WASAPI loopback; macOS 14.2+ uses the CoreAudio tap (Electron 39+),
// which needs NSAudioCaptureUsageDescription in Info.plist (see package.json → build.mac.extendInfo).

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

const DIST = path.join(__dirname, "..", "dist");

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: "#08080a",
    title: "Afterimage",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 14, y: 14 },
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, preload: path.join(__dirname, "preload.cjs") },
  });
  win.loadURL("app://afterimage/index.html");
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (frameName === "afterimage-output" || url === "about:blank" || url === "") {
      return { action: "allow", overrideBrowserWindowOptions: { width: 1280, height: 720, backgroundColor: "#000", title: "Afterimage output", autoHideMenuBar: true } };
    }
    // Razorpay opens bank / UPI pages in a popup during checkout.
    if (/^https:\/\/([a-z0-9-]+\.)*razorpay\.com\//.test(url)) return { action: "allow", overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true } };
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  return win;
}

app.whenReady().then(() => {
  ipcMain.handle("np:start", () => { nowPlaying.start(); return nowPlaying.supported; });
  ipcMain.handle("np:stop", () => nowPlaying.stop());
  ipcMain.handle("np:get", (_e, haveArtId) => nowPlaying.get(haveArtId));
  ipcMain.handle("sys:audio-permission", async () => {
    if (process.platform !== "darwin") return false;
    // Sonoma and later: "Screen & System Audio Recording". The legacy URL still lands on the same pane.
    for (const u of ["x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ScreenCapture", "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"]) {
      try { await shell.openExternal(u); return true; } catch { /* try the next */ }
    }
    return false;
  });
  protocol.handle("app", (req) => {
    const u = new URL(req.url);
    let p = path.normalize(path.join(DIST, decodeURIComponent(u.pathname)));
    if (!p.startsWith(DIST)) return new Response("not found", { status: 404 });
    return net.fetch(pathToFileURL(p).toString());
  });
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(["media", "midi", "midiSysex", "fullscreen", "display-capture", "clipboard-read"].includes(perm)));
  ses.setPermissionCheckHandler((_wc, perm) => ["media", "midi", "midiSysex", "fullscreen", "clipboard-read"].includes(perm));
  // "Computer" source: capture the whole screen's audio without a picker.
  ses.setDisplayMediaRequestHandler((_req, cb) => {
    desktopCapturer.getSources({ types: ["screen"] }).then((sources) => cb({ video: sources[0], audio: "loopback" })).catch(() => cb({}));
  }, { useSystemPicker: false });

  if (process.platform === "darwin") {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: "appMenu" },
      { role: "editMenu" },
      { label: "View", submenu: [{ role: "togglefullscreen" }, { role: "reload" }, { role: "toggleDevTools" }] },
      { role: "windowMenu" },
    ]));
  } else Menu.setApplicationMenu(null);

  const win = createWindow();
  if (process.env.AFTERIMAGE_SMOKE) {
    // CI smoke test: render for a few seconds, save a frame, exit.
    win.webContents.on("console-message", (e, level, msg) => {
      const lv = e?.level ?? level, m = e?.message ?? msg;
      if (lv === "error" || lv === "warning" || lv >= 2) console.log("renderer:", m);
    });
    win.webContents.once("did-finish-load", () => setTimeout(async () => {
      console.log("bridge:", await win.webContents.executeJavaScript("JSON.stringify({ desktop: !!window.afterimageDesktop, platform: window.afterimageDesktop && window.afterimageDesktop.platform, scenes: document.title })"));
      const img = await win.webContents.capturePage();
      require("fs").writeFileSync(process.env.AFTERIMAGE_SMOKE, img.toPNG());
      app.quit();
    }, 6000));
  }
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => { nowPlaying.stop(); if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => nowPlaying.stop());

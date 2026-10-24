// "What's playing" on this computer: title, artist, album and cover art from the system's media players.
// macOS: Spotify and Apple Music through AppleScript (only queried when the app is already running).
// Windows: the system media controls (any app that shows up in the Windows media flyout).
const { execFile, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { net } = require("electron");

let latest = { playing: false };
let timer = null;
let winProc = null;
let artKey = "";
let artData = null;

const run = (cmd, args, timeout = 4000) =>
  new Promise((res) => execFile(cmd, args, { timeout, maxBuffer: 1 << 20 }, (err, out) => res(err ? "" : String(out).trim())));

const isRunning = async (name) => (await run("pgrep", ["-x", name], 1500)) !== "";

async function fetchAsDataUrl(url) {
  try {
    const r = await net.fetch(url);
    if (!r.ok) return null;
    const type = r.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await r.arrayBuffer());
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const SPOTIFY = `tell application "Spotify"
  if player state is playing then
    set t to current track
    return (name of t) & tab & (artist of t) & tab & (album of t) & tab & (artwork url of t)
  end if
end tell
return ""`;

const MUSIC = `tell application "Music"
  if player state is playing then
    set t to current track
    return (name of t) & tab & (artist of t) & tab & (album of t)
  end if
end tell
return ""`;

const musicArt = (file) => `tell application "Music"
  set t to current track
  if (count of artworks of t) > 0 then
    set d to raw data of artwork 1 of t
    set fh to open for access (POSIX file "${file}") with write permission
    set eof fh to 0
    write d to fh
    close access fh
    return "ok"
  end if
end tell
return ""`;

async function pollMac() {
  let found = null;
  if (await isRunning("Spotify")) {
    const out = await run("osascript", ["-e", SPOTIFY]);
    if (out) { const [title, artist, album, art] = out.split("\t"); found = { app: "Spotify", title, artist, album, artUrl: art }; }
  }
  if (!found && (await isRunning("Music"))) {
    const out = await run("osascript", ["-e", MUSIC]);
    if (out) { const [title, artist, album] = out.split("\t"); found = { app: "Apple Music", title, artist, album }; }
  }
  if (!found) { latest = { playing: false }; return; }
  const key = `${found.app}|${found.title}|${found.artist}`;
  if (key !== artKey) {
    artKey = key;
    artData = null;
    if (found.artUrl) artData = await fetchAsDataUrl(found.artUrl);
    else if (found.app === "Apple Music") {
      const file = path.join(os.tmpdir(), "afterimage-art");
      if ((await run("osascript", ["-e", musicArt(file)])) === "ok") {
        try {
          const b = fs.readFileSync(file);
          const png = b[0] === 0x89 && b[1] === 0x50;
          artData = `data:${png ? "image/png" : "image/jpeg"};base64,${b.toString("base64")}`;
        } catch { /* no art */ }
      }
    }
  }
  latest = { playing: true, app: found.app, title: found.title, artist: found.artist, album: found.album, key, art: artData };
}

const WIN_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$last = ''
while ($true) {
  $s = $mgr.GetCurrentSession()
  if ($s) {
    $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $playing = ($s.GetPlaybackInfo().PlaybackStatus -eq 'Playing')
    $key = "$($p.Title)|$($p.Artist)"
    $art = ''
    if ($key -ne $last) {
      $last = $key
      if ($p.Thumbnail) {
        $st = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
        $ns = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($st)
        $ms = New-Object System.IO.MemoryStream
        $ns.CopyTo($ms)
        $art = [Convert]::ToBase64String($ms.ToArray())
      }
    }
    $o = @{ app = $s.SourceAppUserModelId; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; playing = $playing; art = $art } | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($o)
  } else { [Console]::Out.WriteLine('{}') }
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 1500
}`;

function startWindows() {
  if (winProc) return;
  winProc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "-"], { windowsHide: true });
  winProc.stdin.end(WIN_SCRIPT);
  let buf = "";
  winProc.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      try {
        const j = JSON.parse(line);
        if (!j.title) { latest = { playing: false }; continue; }
        const key = `${j.app}|${j.title}|${j.artist}`;
        if (j.art) artData = `data:image/png;base64,${j.art}`;
        if (key !== artKey) { artKey = key; if (!j.art) artData = null; }
        const app = /spotify/i.test(j.app) ? "Spotify" : /zune|music/i.test(j.app) ? "Media Player" : /chrome|msedge|firefox/i.test(j.app) ? "Browser" : String(j.app || "").split("!")[0];
        latest = { playing: !!j.playing, app, title: j.title, artist: j.artist, album: j.album, key, art: artData };
      } catch { /* partial line */ }
    }
  });
  winProc.on("exit", () => { winProc = null; });
}

function start() {
  if (process.platform === "darwin") {
    if (timer) return;
    const tick = () => pollMac().catch(() => {}).finally(() => { timer = setTimeout(tick, 2000); });
    tick();
  } else if (process.platform === "win32") startWindows();
}

function stop() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (winProc) { winProc.kill(); winProc = null; }
}

module.exports = { start, stop, get: () => latest, supported: process.platform === "darwin" || process.platform === "win32" };

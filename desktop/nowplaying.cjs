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
let artId = 0; // bumps whenever artData changes, so the window only receives the picture once
let artTries = 0;
let artNextTry = 0;

const run = (cmd, args, timeout = 4000) =>
  new Promise((res) => execFile(cmd, args, { timeout, maxBuffer: 1 << 20 }, (err, out) => res(err ? "" : String(out).trim())));

const isRunning = async (name) => (await run("pgrep", ["-x", name], 1500)) !== "";

async function fetchBuffer(url, timeout = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await net.fetch(url, { signal: ac.signal });
    if (!r.ok) return null;
    return { type: r.headers.get("content-type") || "image/jpeg", buf: Buffer.from(await r.arrayBuffer()) };
  } catch {
    return null;
  } finally { clearTimeout(t); }
}

const toDataUrl = (type, buf) => `data:${type};base64,${buf.toString("base64")}`;
const sniffType = (b) => (b[0] === 0x89 && b[1] === 0x50 ? "image/png" : "image/jpeg");

/** Pixel size of a JPEG or PNG, without decoding it. */
function imageSize(b) {
  try {
    if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch { /* unknown */ }
  return { w: 0, h: 0 };
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/\s*[([].*?(remaster|deluxe|edition|version|explicit|feat|single|ep)\b.*?[)\]]/g, "")
  .replace(/\s+-\s+(single|ep)$/, "").replace(/[^a-z0-9]+/g, " ").trim();

/** The record's official cover from Apple's public catalogue, at full size (the same art Apple Music shows). */
async function catalogueArt(artist, album, title) {
  const A = norm(artist), B = norm(album), T = norm(title);
  if (!A || (!B && !T)) return null;
  const tries = [];
  // your own store first (regional releases), then the US store
  let cc = "";
  try { cc = String(require("electron").app.getLocaleCountryCode() || "").toUpperCase(); } catch { cc = ""; }
  for (const country of [...new Set([cc, "US"].filter((c) => /^[A-Z]{2}$/.test(c)))]) {
    if (B) tries.push(`https://itunes.apple.com/search?media=music&entity=album&limit=15&country=${country}&term=${encodeURIComponent(`${artist} ${album}`)}`);
    if (T) tries.push(`https://itunes.apple.com/search?media=music&entity=song&limit=15&country=${country}&term=${encodeURIComponent(`${artist} ${title}`)}`);
  }
  for (const url of tries) {
    const r = await fetchBuffer(url, 6000);
    if (!r) continue;
    let res;
    try { res = JSON.parse(r.buf.toString("utf8")).results || []; } catch { continue; }
    let best = null, bestScore = 0;
    for (const x of res) {
      if (!x.artworkUrl100) continue;
      const xa = norm(x.artistName), xb = norm(x.collectionName), xt = norm(x.trackName);
      let score = 0;
      if (xa === A) score += 4; else if (xa.includes(A) || A.includes(xa)) score += 2; else continue;
      if (B) { if (xb === B) score += 4; else if (xb && (xb.includes(B) || B.includes(xb))) score += 2; }
      if (T && xt) { if (xt === T) score += 2; else if (xt.includes(T) || T.includes(xt)) score += 1; }
      if (score > bestScore) { bestScore = score; best = x; }
    }
    // the artist must match, and the album (or the song) too
    if (!best || bestScore < 6) continue;
    const big = String(best.artworkUrl100).replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)$/i, "/1400x1400bb.jpg");
    const img = await fetchBuffer(big);
    if (img && img.buf.length > 2000) return toDataUrl(sniffType(img.buf), img.buf);
  }
  return null;
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
  if (key !== artKey) { artKey = key; artData = null; artId++; artTries = 0; artNextTry = 0; }
  // fetch the art for a new song, and retry a few times if it wasn't available yet
  if (!artData && artTries < 4 && Date.now() >= artNextTry) {
    artTries++;
    artNextTry = Date.now() + 8000;
    const art = await macArt(found);
    if (art && key === artKey) { artData = art; artId++; }
  }
  latest = { playing: true, app: found.app, title: found.title, artist: found.artist, album: found.album, key, art: artData, artId };
}

async function macArt(found) {
  if (found.artUrl) {
    const r = await fetchBuffer(found.artUrl);
    if (r) return toDataUrl(r.type, r.buf);
  }
  let local = null;
  if (found.app === "Apple Music") {
    // the artwork stored with the track (exact for your own files; often missing or small for streamed songs)
    const file = path.join(os.tmpdir(), `afterimage-art-${process.pid}`);
    if ((await run("osascript", ["-e", musicArt(file)])) === "ok") {
      try { local = fs.readFileSync(file); fs.unlinkSync(file); } catch { local = null; }
    }
    if (local && local.length > 2000 && imageSize(local).w >= 1000) return toDataUrl(sniffType(local), local);
  }
  const cat = await catalogueArt(found.artist, found.album, found.title);
  if (cat) return cat;
  return local && local.length > 2000 ? toDataUrl(sniffType(local), local) : null;
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

let artHiRes = false;
// Windows media thumbnails are usually 300 px: swap in the full-size catalogue cover when there is one.
function winUpgrade(key, j) {
  artHiRes = false;
  catalogueArt(j.artist, j.album, j.title).then((art) => {
    if (art && key === artKey) { artData = art; artHiRes = true; artId++; if (latest.key === key) latest = { ...latest, art, artId }; }
  }).catch(() => {});
}

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
        if (key !== artKey) { artKey = key; artData = null; artId++; winUpgrade(key, j); }
        if (j.art && !artHiRes) { const b = Buffer.from(j.art, "base64"); artData = toDataUrl(sniffType(b), b); artId++; }
        const app = /spotify/i.test(j.app) ? "Spotify" : /zune|music/i.test(j.app) ? "Media Player" : /chrome|msedge|firefox/i.test(j.app) ? "Browser" : String(j.app || "").split("!")[0];
        latest = { playing: !!j.playing, app, title: j.title, artist: j.artist, album: j.album, key, art: artData, artId };
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

// The picture is only sent when the window doesn't have this one yet (it can be a few hundred KB).
function get(haveArtId) {
  if (latest.playing && latest.artId != null && haveArtId === latest.artId) return { ...latest, art: undefined, artSame: true };
  return latest;
}

module.exports = { start, stop, get, supported: process.platform === "darwin" || process.platform === "win32" };

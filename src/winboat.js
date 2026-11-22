'use strict';
// Experimental: add local audio files to the user's Apple Music library (and so to their iPhone) through
// Apple Music for Windows running in a WinBoat VM. Apple offers no API for uploading your own files; only
// Apple's apps do it, with "Sync Library" on. The flow:
//   1. the chosen files are copied (FLAC/OGG/Opus converted with ffmpeg) to a job folder under ~ , which
//      WinBoat shares with Windows as \\host.lan\Data\...;
//   2. the WinBoat container is started if needed and we wait for its guest server (/health);
//   3. FreeRDP opens a RemoteApp session that runs a PowerShell job: it keeps one Apple Music running,
//      moves the files into Apple Music's "Automatically Add to Apple Music" folder and starts Apple Music,
//      whose window then shows on the Linux desktop; the job reports progress in status.json;
//   4. Apple Music imports the files and uploads them to iCloud by itself. The user closes its window when
//      the upload is done, and Windows can be shut down again.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { execFile, spawn } = require('child_process');

const CONTAINER = 'WinBoat';
const HOME = os.homedir();
const WB_DIR = path.join(HOME, '.winboat');
const JOBS = path.join(HOME, '.local', 'share', 'linux-apple-music-player', 'winboat-sync');
const DIRECT = new Set(['.mp3', '.m4a', '.aac', '.aif', '.aiff', '.aifc', '.wav']);
const CONVERT = new Set(['.flac', '.ogg', '.oga', '.opus', '.wma', '.ape', '.wv']);
const LOSSLESS = new Set(['.flac', '.ape', '.wv']);

const run = (cmd, args, opts) => new Promise((resolve) => {
  execFile(cmd, args, Object.assign({ timeout: 120000, maxBuffer: 4 << 20 }, opts), (err, stdout, stderr) =>
    resolve({ ok: !err, code: err ? (err.code ?? 1) : 0, out: String(stdout || '').trim(), err: String(stderr || '').trim() }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (bin) => run('sh', ['-c', `command -v ${bin}`]).then((r) => r.ok && !!r.out);

// Windows user and password WinBoat created; read from its compose file, never logged or put on a command line.
function credentials() {
  try {
    const y = fs.readFileSync(path.join(WB_DIR, 'docker-compose.yml'), 'utf8');
    const get = (k) => { const m = y.match(new RegExp(`^\\s+${k}:\\s*"?([^"\\n]*)"?\\s*$`, 'm')); return m ? m[1].trim() : ''; };
    const shared = /^\s+-\s*(\$\{HOME\}|~|\/home\/[^:]+):\/shared\s*$/m.test(y);
    return { user: get('USERNAME'), pass: get('PASSWORD'), shared };
  } catch (_) { return null; }
}

async function hostPort(guestPort) {
  const r = await run('docker', ['port', CONTAINER, `${guestPort}/tcp`]);
  const m = r.ok && r.out.match(/:(\d+)\s*$/m);
  return m ? +m[1] : 0;
}

function health(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 3000 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function getJSON(port, p, timeout) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: p, timeout: timeout || 15000 }, (res) => {
      let d = ''; res.setEncoding('utf8'); res.on('data', (c) => { d += c; });
      res.on('end', () => { try { resolve(res.statusCode === 200 ? JSON.parse(d.replace(/^﻿/, '')) : null); } catch (_) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}
const APPLE_MUSIC_STORE_ID = '9PFHDD62MXS1';      // Apple Music in the Microsoft Store (winget, msstore source)
const isAppleMusic = (a) => /AppleInc\.AppleMusicWin/i.test(String(a && (a.Args || a.Path) || '')) || /^Apple Music\b/i.test(String(a && a.Name || ''));
const userName = () => os.userInfo().username;
const inGroup = (g) => { try { return new RegExp(`^${g}:[^:]*:[^:]*:(.*,)?${userName()}(,|$)`, 'm').test(fs.readFileSync('/etc/group', 'utf8')); } catch (_) { return false; } };

// Setup state, one entry per step of the assistant, and the first problem in the order it has to be fixed:
//   pkgs  – docker, docker compose, FreeRDP 3, WinBoat installed
//   group – the user is in the docker group and this session already has it (else: restart)
//   vm    – WinBoat created its Windows machine and shares the home folder
//   apple – Apple Music installed in Windows (known only while Windows runs; null = unknown)
async function status() {
  const s = { ffmpeg: false, running: false, ready: false, problem: '',
    pkgs: { docker: false, compose: false, freerdp: false, winboat: false }, group: { listed: false, access: false },
    vm: { exists: false, shared: false }, apple: null };
  const [docker, freerdp, winboat, ffmpeg] = await Promise.all(['docker', 'xfreerdp3', 'winboat', 'ffmpeg'].map(has));
  Object.assign(s.pkgs, { docker, freerdp, winboat }); s.ffmpeg = ffmpeg;
  if (docker) s.pkgs.compose = (await run('docker', ['compose', 'version'])).ok;
  s.group.listed = inGroup('docker');
  if (docker) {
    const r = await run('docker', ['inspect', '-f', '{{.State.Running}}', CONTAINER]);
    const denied = /permission denied/i.test(r.err);
    s.group.access = !denied && (r.ok || /no such object|not found/i.test(r.err) || (await run('docker', ['info', '--format', '{{.ID}}'])).ok);
    s.vm.exists = r.ok;
    s.running = r.ok && r.out === 'true';
  }
  const c = credentials();
  s.vm.shared = !!(c && c.shared && c.user && c.pass);
  if (s.running) {
    const port = await hostPort(7148);
    const apps = port ? await getJSON(port, '/apps', 20000) : null;
    if (Array.isArray(apps)) s.apple = apps.some(isAppleMusic);
  }
  const p = s.pkgs;
  s.problem = !(p.docker && p.compose && p.freerdp && p.winboat) ? 'noPkgs'
    : !s.group.listed ? 'noGroup' : !s.group.access ? 'needReboot'
    : !s.vm.exists ? 'noWinboat' : !s.vm.shared ? 'noShare'
    : s.apple === false ? 'noAppleMusic' : '';
  s.ready = !s.problem;
  return s;
}

// Audio files under the given paths (folders are walked), sorted so an album keeps its order.
function collect(paths) {
  const out = [];
  const walk = (p, depth) => {
    let st; try { st = fs.statSync(p); } catch (_) { return; }
    if (st.isDirectory()) {
      if (depth > 6) return;
      let names = []; try { names = fs.readdirSync(p); } catch (_) {}
      names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).forEach((n) => { if (!n.startsWith('.')) walk(path.join(p, n), depth + 1); });
    } else if (st.isFile()) {
      const ext = path.extname(p).toLowerCase();
      if (DIRECT.has(ext) || CONVERT.has(ext)) out.push({ src: p, ext, size: st.size });
    }
  };
  (paths || []).forEach((p) => walk(p, 0));
  return out;
}

const winPath = (p) => '\\\\host.lan\\Data\\' + path.relative(HOME, p).split(path.sep).join('\\');
const psq = (s) => "'" + String(s).replace(/'/g, "''") + "'";

function jobScript(winJob) {
  return `$ErrorActionPreference = 'Continue'
$job = ${psq(winJob)}
function St($o) { try { ($o | ConvertTo-Json -Compress) | Set-Content -Encoding UTF8 -Path "$job\\status.json" } catch {} }
$me = (Get-Process -Id $PID).SessionId
$files = @(Get-ChildItem -LiteralPath "$job\\files" -File | Sort-Object Name)
$total = $files.Count
St @{ step = 'start'; done = 0; total = $total }
# one Apple Music on the library: close copies left in other sessions (e.g. a WinBoat window opened earlier)
$other = @(Get-Process AppleMusic, AMPLibraryAgent -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -ne $me })
if ($other.Count) {
  $other | ForEach-Object { try { $_.CloseMainWindow() | Out-Null } catch {} }
  Start-Sleep 5
  Get-Process AppleMusic, AMPLibraryAgent -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -ne $me } | Stop-Process -Force -ErrorAction SilentlyContinue
}
$auto = Join-Path ([Environment]::GetFolderPath('MyMusic')) 'Apple Music\\Media\\Automatically Add to Apple Music'
if (-not (Get-Process AppleMusic -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $me })) { Start-Process 'AppleMusic.exe' }
for ($i = 0; $i -lt 60 -and -not (Test-Path -LiteralPath $auto); $i++) { Start-Sleep 2 }
if (-not (Test-Path -LiteralPath $auto)) { St @{ step = 'error'; error = 'noAutoFolder'; done = 0; total = $total }; exit 1 }
# copy to a local staging folder first and then move, so Apple Music never sees a half-written file
$stage = Join-Path $env:TEMP 'lamp-sync'
New-Item -ItemType Directory -Force -Path $stage | Out-Null
$names = @()
$n = 0
foreach ($f in $files) {
  $t = Join-Path $stage $f.Name
  Copy-Item -LiteralPath $f.FullName -Destination $t -Force
  Move-Item -LiteralPath $t -Destination (Join-Path $auto $f.Name) -Force
  $names += $f.Name
  $n++
  St @{ step = 'copy'; done = 0; copied = $n; total = $total }
}
$limit = [Math]::Max(120, $total * 20)
for ($s = 0; $s -lt $limit; $s += 2) {
  $left = @(Get-ChildItem -LiteralPath $auto -File | Where-Object { $names -contains $_.Name }).Count
  St @{ step = 'import'; done = ($total - $left); total = $total }
  if ($left -eq 0) { break }
  Start-Sleep 2
}
$left = @(Get-ChildItem -LiteralPath $auto -File | Where-Object { $names -contains $_.Name }).Count
if ($left -gt 0) { St @{ step = 'error'; error = 'importTimeout'; done = ($total - $left); total = $total }; exit 1 }
St @{ step = 'uploading'; done = $total; total = $total }
`;
}

function readStatus(job) {
  try { return JSON.parse(fs.readFileSync(path.join(job, 'status.json'), 'utf8').replace(/^\uFEFF/, '')); } catch (_) { return null; }
}

// ---------- setup helpers ----------
const UA = { 'User-Agent': 'linux-apple-music-player', Accept: 'application/vnd.github+json' };
function httpsGet(url, opts, hops) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: UA, timeout: 30000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && (hops || 0) < 6) {
        res.resume(); return resolve(httpsGet(new URL(res.headers.location, url).toString(), opts, (hops || 0) + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      resolve(res);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}
async function latestWinboatDeb() {
  const res = await httpsGet('https://api.github.com/repos/winboat-org/winboat/releases/latest');
  let d = ''; res.setEncoding('utf8'); for await (const c of res) d += c;
  const rel = JSON.parse(d);
  const a = (rel.assets || []).find((x) => /^winboat-[\d.]+-amd64\.deb$/.test(x.name));
  if (!a || !/^https:\/\/github\.com\//.test(a.browser_download_url)) throw new Error('noWinboatDeb');
  return { url: a.browser_download_url, name: a.name, size: a.size, version: rel.tag_name };
}
async function download(url, file, size, onPct) {
  const res = await httpsGet(url);
  const tmp = file + '.part';
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp); let got = 0, last = -1;
    res.on('data', (c) => { got += c.length; const pct = size ? Math.floor(100 * got / size) : 0; if (pct !== last) { last = pct; onPct(pct); } });
    res.pipe(out); out.on('finish', resolve); res.on('error', reject); out.on('error', reject);
  });
  if (size && fs.statSync(tmp).size !== size) throw new Error('downloadSize');
  fs.renameSync(tmp, file);
}
const shq = (x) => "'" + String(x).replace(/'/g, "'\\''") + "'";

function createBridge({ onState, log }) {
  let busy = false, rdp = null, startedByUs = false, cancelled = false;
  const emit = (st) => { try { onState(st); } catch (_) {} };
  const say = (...a) => { try { log && log(...a); } catch (_) {} };

  async function prepare(list, job, ffmpeg) {
    const dir = path.join(job, 'files');
    fs.mkdirSync(dir, { recursive: true });
    const pad = String(list.length).length;
    let i = 0, skipped = 0;
    for (const f of list) {
      if (cancelled) throw new Error('cancelled');
      i++;
      emit({ step: 'prepare', done: i - 1, total: list.length, name: path.basename(f.src) });
      const base = String(i).padStart(Math.max(3, pad), '0') + ' ' + path.basename(f.src, path.extname(f.src)).replace(/[\\/:*?"<>|]/g, '_');
      if (DIRECT.has(f.ext)) { fs.copyFileSync(f.src, path.join(dir, base + f.ext)); continue; }
      if (!ffmpeg) { skipped++; continue; }
      // Apple Music has no FLAC/OGG: lossless → ALAC, lossy → AAC 256 kb/s, tags and cover kept
      const codec = LOSSLESS.has(f.ext) ? ['-c:a', 'alac'] : ['-c:a', 'aac', '-b:a', '256k'];
      const r = await run('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-i', f.src, '-map', '0:a:0', '-map', '0:v?', '-c:v', 'copy', '-disposition:v', 'attached_pic',
        ...codec, '-map_metadata', '0', path.join(dir, base + '.m4a')], { timeout: 600000 });
      if (!r.ok) {
        const r2 = await run('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-i', f.src, '-map', '0:a:0', ...codec, '-map_metadata', '0', path.join(dir, base + '.m4a')], { timeout: 600000 });
        if (!r2.ok) { skipped++; say('convert failed', f.src, r2.err); }
      }
    }
    return { count: fs.readdirSync(dir).length, skipped };
  }

  async function ensureWindows() {
    const insp = await run('docker', ['inspect', '-f', '{{.State.Running}}', CONTAINER]);
    if (insp.out !== 'true') {
      emit({ step: 'boot' });
      const r = await run('docker', ['start', CONTAINER]);
      if (!r.ok) throw new Error('dockerStart: ' + (r.err || r.code));
      startedByUs = true;
    }
    const port = await hostPort(7148);
    if (!port) throw new Error('noGuestPort');
    for (let t = 0; t < 150; t++) {          // up to 5 min for a cold boot
      if (cancelled) throw new Error('cancelled');
      if (await health(port)) return;
      emit({ step: 'boot' });
      await sleep(2000);
    }
    throw new Error('bootTimeout');
  }

  // Our FreeRDP window. A window that lost its session (another client took it) freezes on its last
  // frame and ignores SIGTERM, so it gets SIGKILL after a moment.
  function killRdp() {
    const p = rdp; rdp = null;
    if (!p || p.exitCode !== null) return;
    p.replaced = true;
    try { p.kill('SIGTERM'); } catch (_) {}
    setTimeout(() => { if (p.exitCode === null) { try { p.kill('SIGKILL'); } catch (_) {} } }, 2500);
  }

  // RemoteApp session running a PowerShell command; it stays open while Apple Music's window is open.
  async function openSession(psCommand) {
    const c = credentials();
    const port = await hostPort(3389);
    if (!c || !port) throw new Error('noRdp');
    killRdp();
    const cmd = `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "${psCommand}"`;
    const args = [`/v:127.0.0.1:${port}`, `/u:${c.user}`, '/from-stdin:force', '/cert:ignore', '-wallpaper', '+auto-reconnect',
      '/wm-class:winboat-apple-music', `/app:program:C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe,cmd:${cmd}`];
    const proc = spawn('xfreerdp3', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    rdp = proc;
    let errTail = '';
    proc.stderr.on('data', (d) => { errTail = (errTail + d).slice(-2000); });
    // /from-stdin:force with /u: given asks only for the password; it never shows up in the process list
    proc.stdin.write(c.pass + '\n');
    proc.stdin.end();
    proc.on('exit', (code) => { say('rdp exit', code, errTail); if (rdp === proc) rdp = null; });
    return proc;
  }
  const jobCommand = (job) => `Get-Content -Raw -LiteralPath '${winPath(job)}\\job.ps1' | Invoke-Expression`;

  // Bring Apple Music's window (back) to the desktop: reconnects to the same Windows session.
  async function showApple() {
    if (busy) return { error: 'busy' };
    try {
      const st = await status();
      if (!st.ready) throw new Error(st.problem);
      await ensureWindows();
      const proc = await openSession("Start-Process 'AppleMusic.exe'; Start-Sleep 10");
      proc.on('exit', () => { if (!proc.replaced) emit({ step: 'closed' }); });
      emit({ step: 'shown' });
      return { ok: true };
    } catch (e) { const m = String(e && e.message || e); emit({ step: 'error', error: m }); return { error: m }; }
  }

  async function add(paths) {
    if (busy) return { error: 'busy' };
    busy = true; cancelled = false;
    const job = path.join(JOBS, 'job-' + Date.now());
    try {
      const st = await status();
      if (!st.ready) throw new Error(st.problem);
      const list = collect(paths);
      if (!list.length) throw new Error('noAudio');
      fs.mkdirSync(job, { recursive: true });
      const prep = await prepare(list, job, st.ffmpeg);
      if (!prep.count) throw new Error('noAudio');
      fs.writeFileSync(path.join(job, 'job.ps1'), '\uFEFF' + jobScript(winPath(job)));
      await ensureWindows();
      emit({ step: 'connect', total: prep.count, skipped: prep.skipped });
      const proc = await openSession(jobCommand(job));
      let exited = false, finished = false;
      proc.on('exit', () => { exited = true; if (finished && !proc.replaced) emit({ step: 'closed' }); });
      // follow status.json written by Windows; the import ends when Apple Music took every file
      let last = null;
      for (let t = 0; ; t++) {
        if (cancelled) throw new Error('cancelled');
        const s = readStatus(job);
        if (s) { last = s; emit(Object.assign({ skipped: prep.skipped }, s)); }
        if (s && (s.step === 'uploading' || s.step === 'error')) break;
        if (exited && t > 2) throw new Error(s ? 'sessionClosed' : 'rdpFailed');
        if (t > 600) throw new Error('importTimeout');
        await sleep(1000);
      }
      if (last.step === 'error') throw new Error(last.error || 'import');
      finished = !exited;
      if (exited) emit({ step: 'closed' });
      return { ok: true, total: last.total, skipped: prep.skipped };
    } catch (e) {
      const m = String(e && e.message || e);
      emit({ step: 'error', error: m });
      return { error: m };
    } finally {
      busy = false;
      setTimeout(() => { try { fs.rmSync(job, { recursive: true, force: true }); } catch (_) {} }, 5000);
    }
  }

  // ---- setup assistant ----
  // One administrator prompt (pkexec, the system's own password dialog) installs what is missing:
  // Docker + Compose + FreeRDP 3 from Ubuntu, WinBoat's .deb from its GitHub releases; then adds the
  // user to the docker group and starts Docker. The user restarts the computer afterwards.
  async function installComponents() {
    if (busy) return { error: 'busy' };
    busy = true;
    try {
      const st = await status();
      const pk = [];
      if (!st.pkgs.docker) pk.push('docker.io');
      if (!st.pkgs.compose) pk.push('docker-compose-v2');
      if (!st.pkgs.freerdp) pk.push('freerdp3-x11');
      let deb = '';
      if (!st.pkgs.winboat) {
        emit({ step: 'setup', phase: 'find' });
        const rel = await latestWinboatDeb();
        const dir = path.join(HOME, '.cache', 'linux-apple-music-player', 'winboat');
        fs.mkdirSync(dir, { recursive: true });
        deb = path.join(dir, rel.name);
        if (!fs.existsSync(deb) || fs.statSync(deb).size !== rel.size) {
          await download(rel.url, deb, rel.size, (pct) => emit({ step: 'setup', phase: 'download', pct, name: rel.name }));
        }
        fs.chmodSync(deb, 0o644);
        pk.push(deb);
      }
      const user = userName();
      if (!/^[a-z_][a-z0-9_-]*\$?$/i.test(user)) throw new Error('badUser');
      const lines = ['set -e'];
      if (pk.length) lines.push(`apt-get install -y ${pk.map(shq).join(' ')} || { apt-get update && apt-get install -y ${pk.map(shq).join(' ')}; }`);
      lines.push(`usermod -aG docker ${shq(user)}`, 'systemctl enable --now docker');
      emit({ step: 'setup', phase: 'install' });
      const r = await run('pkexec', ['/bin/sh', '-c', lines.join('\n')], { timeout: 1800000 });
      if (!r.ok) throw new Error(r.code === 126 || r.code === 127 ? 'authCancelled' : 'installFailed');
      emit({ step: 'setup', phase: 'installed' });
      return { ok: true };
    } catch (e) { const m = String(e && e.message || e); emit({ step: 'error', error: m }); return { error: m }; }
    finally { busy = false; }
  }

  function openWinboat() {
    try { const p = spawn('winboat', [], { detached: true, stdio: 'ignore' }); p.on('error', () => {}); p.unref(); return { ok: true }; }
    catch (e) { return { error: String(e.message || e) }; }
  }
  function reboot() {
    // GNOME's own dialog asks the user to confirm
    const p = spawn('gnome-session-quit', ['--reboot'], { detached: true, stdio: 'ignore' }); p.on('error', () => {}); p.unref();
    return { ok: true };
  }

  // Installs Apple Music in Windows from the Microsoft Store (winget), then opens it for signing in.
  async function installAppleMusic() {
    if (busy) return { error: 'busy' };
    busy = true;
    try {
      const st = await status();
      if (['noPkgs', 'noGroup', 'needReboot', 'noWinboat', 'noShare'].includes(st.problem)) throw new Error(st.problem);
      await ensureWindows();
      emit({ step: 'setup', phase: 'amInstall' });
      fs.mkdirSync(JOBS, { recursive: true });
      const ps = path.join(JOBS, 'install-apple-music.ps1');
      fs.writeFileSync(ps, '﻿' + `winget install --id ${APPLE_MUSIC_STORE_ID} --source msstore --accept-package-agreements --accept-source-agreements --disable-interactivity --silent\nStart-Sleep 3\nStart-Process 'AppleMusic.exe'\nStart-Sleep 10\n`);
      const proc = await openSession(`Get-Content -Raw -LiteralPath '${winPath(ps)}' | Invoke-Expression`);
      const port = await hostPort(7148);
      for (let t = 0; t < 200; t++) {        // up to ~10 min for the Store download
        await sleep(3000);
        const apps = await getJSON(port, '/apps', 20000);
        if (Array.isArray(apps) && apps.some(isAppleMusic)) { emit({ step: 'setup', phase: 'amInstalled' }); return { ok: true }; }
        if (proc.exitCode !== null && t > 20) break;
      }
      throw new Error('amInstallFailed');
    } catch (e) { const m = String(e && e.message || e); emit({ step: 'error', error: m }); return { error: m }; }
    finally { busy = false; }
  }

  // Close the Apple Music window (ends the RemoteApp session; Apple Music keeps running in Windows).
  function closeWindow() { killRdp(); }
  async function stopWindows() {
    closeWindow();
    emit({ step: 'stopping' });
    const r = await run('docker', ['stop', '-t', '120', CONTAINER], { timeout: 180000 });
    startedByUs = false;
    emit({ step: r.ok ? 'stopped' : 'error', error: r.ok ? undefined : 'dockerStop' });
    return r.ok;
  }
  function cancel() { cancelled = true; closeWindow(); }

  return { status, add, showApple, installComponents, openWinboat, reboot, installAppleMusic, closeWindow, stopWindows, cancel, get busy() { return busy; }, get sessionOpen() { return !!rdp; }, get startedByUs() { return startedByUs; } };
}

module.exports = { createBridge, collect, DIRECT, CONVERT };

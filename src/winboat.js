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

// What is missing for the bridge, in the order the user has to fix it.
async function status() {
  const s = { docker: false, container: false, running: false, freerdp: false, shared: false, ffmpeg: false, ready: false, problem: '' };
  s.freerdp = await has('xfreerdp3');
  s.ffmpeg = await has('ffmpeg');
  if (await has('docker')) {
    const r = await run('docker', ['inspect', '-f', '{{.State.Running}}', CONTAINER]);
    s.docker = r.ok || !/permission denied/i.test(r.err);
    if (/permission denied/i.test(r.err)) s.problem = 'dockerPerm';
    s.container = r.ok;
    s.running = r.ok && r.out === 'true';
  }
  const c = credentials();
  s.shared = !!(c && c.shared && c.user && c.pass);
  if (!s.problem) s.problem = !s.docker ? 'noDocker' : !s.container ? 'noWinboat' : !s.shared ? 'noShare' : !s.freerdp ? 'noFreerdp' : '';
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

  // RemoteApp session running the job; it stays open while Apple Music's window is open on the desktop.
  async function openSession(job) {
    const c = credentials();
    const port = await hostPort(3389);
    if (!c || !port) throw new Error('noRdp');
    const winJob = winPath(job);
    const cmd = `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Get-Content -Raw -LiteralPath '${winJob}\\job.ps1' | Invoke-Expression"`;
    const args = [`/v:127.0.0.1:${port}`, `/u:${c.user}`, '/from-stdin:force', '/cert:ignore', '-wallpaper', '+auto-reconnect',
      '/wm-class:winboat-apple-music', `/app:program:C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe,cmd:${cmd}`];
    rdp = spawn('xfreerdp3', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let errTail = '';
    rdp.stderr.on('data', (d) => { errTail = (errTail + d).slice(-2000); });
    // /from-stdin:force with /u: given asks only for the password; it never shows up in the process list
    rdp.stdin.write(c.pass + '\n');
    rdp.stdin.end();
    const proc = rdp;
    proc.on('exit', (code) => { say('rdp exit', code, errTail.replace(/\/p:\S+/g, '')); if (rdp === proc) rdp = null; });
    return proc;
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
      const proc = await openSession(job);
      let exited = false; proc.on('exit', () => { exited = true; });
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

  // Close the Apple Music window (ends the RemoteApp session; Apple Music keeps running in Windows).
  function closeWindow() { if (rdp) { try { rdp.kill('SIGTERM'); } catch (_) {} rdp = null; } }
  async function stopWindows() {
    closeWindow();
    emit({ step: 'stopping' });
    const r = await run('docker', ['stop', '-t', '120', CONTAINER], { timeout: 180000 });
    startedByUs = false;
    emit({ step: r.ok ? 'stopped' : 'error', error: r.ok ? undefined : 'dockerStop' });
    return r.ok;
  }
  function cancel() { cancelled = true; closeWindow(); }

  return { status, add, closeWindow, stopWindows, cancel, get busy() { return busy; }, get sessionOpen() { return !!rdp; }, get startedByUs() { return startedByUs; } };
}

module.exports = { createBridge, collect, DIRECT, CONVERT };

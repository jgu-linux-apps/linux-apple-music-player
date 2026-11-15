'use strict';
/* Linux Apple Music Player — main process.
   Our own lightweight UI is served under https://music.apple.com/__lamp/ inside an isolated session,
   so it runs with the same origin as Apple's web player (MusicKit auth, API and Widevine work as-is),
   without loading Apple's heavy web app. */
const electron = require('electron');
const { app, BrowserWindow, Tray, Menu, nativeTheme, nativeImage, Notification, shell, ipcMain, session, dialog, protocol } = electron;
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { STR, detectLang } = require('./i18n');
const pkg = require('./package.json');

const APP_ID = 'linux-apple-music-player';
const APP_NAME = 'Linux Apple Music Player';
const ORIGIN = 'https://music.apple.com';
const UI_BASE = ORIGIN + '/__lamp/';
const UI_DIR = path.join(__dirname, 'ui');
const MOCK = !!process.env.LAMP_MOCK;
const PARTITION = 'persist:lamp';

app.setName(APP_ID);
app.setDesktopName(APP_ID + '.desktop');
app.commandLine.appendSwitch('disable-features', 'MediaSessionService,HardwareMediaKeyHandling');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const lang = detectLang(app.getLocale && app.getLocale());
const T = STR[lang];

// ---------- settings ----------
const cfgDir = path.join(app.getPath('appData'), APP_ID);
const cfgFile = path.join(cfgDir, 'settings.json');
const settings = Object.assign({ theme: 'system', layout: 'dock', notifications: false, closeToTray: true, startHidden: false, bounds: null, devToken: null, volume: 0.8 }, readJSON(cfgFile));
function readJSON(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return {}; } }
function saveSettings() { try { fs.mkdirSync(cfgDir, { recursive: true }); fs.writeFileSync(cfgFile, JSON.stringify(settings, null, 2)); } catch (_) {} }

const cacheDir = path.join(os.homedir(), '.cache', APP_ID);
try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (_) {}

// ---------- icons ----------
const A = (f) => path.join(__dirname, 'assets', f);
const dark = () => nativeTheme.shouldUseDarkColors;
const appIcon = () => nativeImage.createFromPath(A(dark() ? 'icon-dark-256.png' : 'icon-light-256.png'));
// Tray: the dock icon's record (black vinyl, red label, white note) with a white rim, one picture for dark and light
// panels. The name changes whenever the artwork changes (tray4, 0.3.9): GNOME Shell keeps themed icons by name for
// the whole session, so a new name makes it read the new file without logging out.
const TRAY = `${APP_ID}-tray4`;
const trayIcon = () => nativeImage.createFromPath(A(`tray/${TRAY}.png`));
// Same rule as packaging/icon-watch.sh (which also runs while the app is closed): dark = dark icon copied
// to ~/.local/share/icons (wins over /usr/share), light = copies removed, so the package's light icon is used.
function syncLauncherIcon() {
  const isDark = dark();
  const base = path.join(os.homedir(), '.local', 'share', 'icons', 'hicolor');
  const files = [[A('icon-dark.svg'), path.join(base, 'scalable', 'apps', APP_ID + '.svg')]]
    .concat([48, 64, 128, 256, 512].map((s) => [A(`icon-dark-${s}.png`), path.join(base, `${s}x${s}`, 'apps', APP_ID + '.png')]));
  let changed = false;
  for (const [src, dst] of files) {
    try {
      let b = null; try { b = fs.readFileSync(dst); } catch (_) {}
      if (!isDark) { if (b) { fs.unlinkSync(dst); changed = true; } continue; }
      const a = fs.readFileSync(src);
      if (!b || !a.equals(b)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, a); changed = true; }
    } catch (_) {}
  }
  if (changed) { execFile('gtk-update-icon-cache', ['-f', '-t', base], () => {}); execFile('touch', [base], () => {}); }
}

let ses = null, win = null, tray = null, mpris = null, quitting = false;
let player = { status: 'Stopped', meta: null, position: 0, duration: 0, volume: 1, shuffle: false, repeat: 0 };
let lastPosAt = Date.now(), lastNotifiedId = null;

function chromeUA() {
  const v = process.versions.chrome.split('.')[0];
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`;
}
function isAppleHost(u) {
  try { const h = new URL(u).hostname; return h === 'apple.com' || h.endsWith('.apple.com') || h.endsWith('.icloud.com') || h === 'icloud.com'; } catch (_) { return false; }
}

// ---------- UI server (same-origin with Apple's player) ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
// The handler is active only while our UI page loads; afterwards all traffic (API, artwork, audio,
// Apple ID sign-in) goes straight through Chromium's network stack without touching the main process.
let handled = false;
function setupProtocol() {
  if (handled) return;
  handled = true;
  ses.protocol.handle('https', async (req) => {
    if (req.url.startsWith(UI_BASE)) {
      let rel = decodeURIComponent(new URL(req.url).pathname.slice('/__lamp/'.length)) || 'index.html';
      let root = UI_DIR;
      if (rel.startsWith('assets/')) { root = path.join(__dirname, 'assets'); rel = rel.slice(7); }
      if (MOCK && rel.startsWith('mock/')) { root = process.env.LAMP_MOCK; rel = rel.slice(5); }
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(path.normalize(root))) return new Response('forbidden', { status: 403 });
      try {
        const buf = await fs.promises.readFile(file);
        return new Response(buf, { headers: { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'max-age=86400' } });
      } catch (_) { return new Response('not found', { status: 404 }); }
    }
    if (MOCK) return new Response('offline (mock)', { status: 503 });
    return ses.fetch(req, { bypassCustomProtocolHandlers: true });
  });
}
function releaseProtocol() {
  if (!handled || MOCK) return;
  try { ses.protocol.unhandle('https'); } catch (_) {}
  handled = false;
}
function loadUI() {
  if (!win || win.isDestroyed()) return;
  setupProtocol();
  win.loadURL(UI_BASE + 'index.html');
}

// ---------- developer token (taken from Apple's web player, like other clients do) ----------
function jwtPayload(t) {
  try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8')); } catch (_) { return null; }
}
function tokenOk(t) { const p = t && jwtPayload(t); return !!(p && p.iss && p.exp && p.exp * 1000 > Date.now() + 6 * 3600e3); }
async function fetchText(url) {
  const r = await ses.fetch(url, { bypassCustomProtocolHandlers: true, headers: { 'User-Agent': chromeUA() } });
  if (!r.ok) throw new Error(url + ' -> HTTP ' + r.status);
  return r.text();
}
let tokenPromise = null;
async function extractToken() {
  const JWT = /eyJ[\w-]{10,}\.eyJ[\w-]{20,}\.[\w-]{20,}/g;
  const html = await fetchText(ORIGIN + '/us/browse');
  const meta = /name="desktop-music-app\/config\/environment"\s+content="([^"]+)"/.exec(html);
  if (meta) for (const m of decodeURIComponent(meta[1]).matchAll(JWT)) if (tokenOk(m[0])) return m[0];
  for (const m of html.matchAll(JWT)) if (tokenOk(m[0])) return m[0];
  const queue = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+?\.js)"/g)].map((m) => m[1]);
  const seen = new Set();
  while (queue.length && seen.size < 60) {
    const s = queue.shift(); if (seen.has(s)) continue; seen.add(s);
    let js; try { js = await fetchText(ORIGIN + s); } catch (_) { continue; }
    for (const m of js.matchAll(JWT)) if (tokenOk(m[0])) return m[0];
    for (const m of js.matchAll(/["'`](?:\.\/|\/assets\/|assets\/)([\w~.@-]+\.js)["'`]/g)) { const p = '/assets/' + m[1]; if (!seen.has(p)) queue.push(p); }
  }
  throw new Error('developer token not found');
}
function getToken(force) {
  if (MOCK) return Promise.resolve('mock.token');
  if (!force && tokenOk(settings.devToken)) return Promise.resolve(settings.devToken);
  if (!tokenPromise) {
    tokenPromise = extractToken()
      .then((t) => { settings.devToken = t; saveSettings(); return t; })
      .finally(() => { setTimeout(() => { tokenPromise = null; }, 1000); });
  }
  return tokenPromise;
}

// ---------- window ----------
// Title bar: GNOME draws the system one and the app cannot colour it, so the window hides it and draws its
// own 34 px strip (ui: #titlebar) with Electron's window buttons on top. The strip and the buttons get the
// same colour: Aurora → lavender / navy, System → the sidebar colour, close to the original look.
const TB_H = 34;
function titleBarColors() {
  const d = dark();
  if (settings.theme === 'aurora') return d ? { color: '#0e1020', symbolColor: '#ecebff' } : { color: '#f1edff', symbolColor: '#1f1a3a' };
  return d ? { color: '#19191b', symbolColor: '#f5f5f7' } : { color: '#f3f3f5', symbolColor: '#1d1d1f' };
}
function applyTitleBar() {
  if (win && !win.isDestroyed() && win.setTitleBarOverlay) { try { win.setTitleBarOverlay(Object.assign({ height: TB_H }, titleBarColors())); } catch (_) {} }
}
// ---------- start-up splash (light / dark, follows the system) ----------
let splash = null, splashAt = 0;
const startsHidden = () => settings.startHidden && process.argv.includes('--hidden');
function showSplash() {
  if (startsHidden()) return;
  try {
    splash = new BrowserWindow({
      width: 720, height: 420, frame: false, transparent: true, resizable: false, movable: true, show: false,
      center: true, skipTaskbar: true, focusable: false, hasShadow: false, title: APP_NAME, icon: appIcon(),
      backgroundColor: '#00000000', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    });
    splash.setMenuBarVisibility(false);
    splash.loadFile(path.join(__dirname, 'ui', 'splash.html'), { query: { theme: dark() ? 'dark' : 'light' } });
    splash.once('ready-to-show', () => { if (splash) { splash.show(); splashAt = Date.now(); } });
    splash.on('closed', () => { splash = null; });
  } catch (e) { console.warn('splash', e); splash = null; }
}
let revealed = false;
function revealMain() {
  // the main window appears when the UI has loaded; the splash stays at least 1.4 s so it never just flashes
  if (revealed || !win || win.isDestroyed()) return;
  revealed = true;
  const wait = splash ? Math.max(0, 1400 - (Date.now() - (splashAt || Date.now()))) : 0;
  setTimeout(() => {
    if (!startsHidden() && win && !win.isDestroyed()) win.show();
    if (splash && !splash.isDestroyed()) splash.close();
  }, wait);
}

function createWindow() {
  showSplash();
  const b = settings.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1280, height: b.height || 820, x: b.x, y: b.y,
    minWidth: 820, minHeight: 560,
    title: APP_NAME, icon: appIcon(), show: false, autoHideMenuBar: true,
    titleBarStyle: 'hidden', titleBarOverlay: Object.assign({ height: TB_H }, titleBarColors()),
    backgroundColor: dark() ? '#1e1e20' : '#ffffff',
    webPreferences: {
      partition: PARTITION,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false
    }
  });
  win.setMenuBarVisibility(false);
  win.webContents.setUserAgent(chromeUA());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppleHost(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: appIcon(), width: 560, height: 740, title: APP_NAME, webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true } } };
    }
    shell.openExternal(url); return { action: 'deny' };
  });
  win.webContents.on('did-create-window', (child) => { child.setMenuBarVisibility(false); child.webContents.setUserAgent(chromeUA()); });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(UI_BASE)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });

  win.on('close', (e) => { if (!quitting && settings.closeToTray && hasTray()) { e.preventDefault(); win.hide(); } });
  const saveBounds = () => { if (win && !win.isMaximized() && !win.isMinimized() && win.isVisible()) { settings.bounds = win.getBounds(); saveSettings(); } };
  win.on('resize', debounce(saveBounds, 800));
  win.on('move', debounce(saveBounds, 800));
  win.on('show', rebuildTray); win.on('hide', rebuildTray);
  // hidden only when started with the system (autostart entry passes --hidden)
  win.webContents.on('did-finish-load', () => { if (win.webContents.getURL().startsWith(UI_BASE)) { releaseProtocol(); revealMain(); } });
  setTimeout(revealMain, 10000);   // safety: show the window even if the UI is slow or fails to load
  win.webContents.on('did-fail-load', (_e, code, _d, url, isMain) => { if (isMain && code !== -3) setTimeout(loadUI, 3000); });
  win.webContents.on('render-process-gone', () => setTimeout(loadUI, 500));
  loadUI();
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function showWindow() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function send(cmd, arg) { if (win && !win.isDestroyed()) win.webContents.send('lamp:cmd', cmd, arg === undefined ? null : arg); }
function handleCommand(cmd, arg) {
  switch (cmd) {
    case 'raise': showWindow(); break;
    case 'quit': quitting = true; app.quit(); break;
    case 'loop': send('repeat', arg === 'Track' ? 1 : arg === 'Playlist' ? 2 : 0); break;
    case 'seekBy': send('seekTo', Math.max(0, player.position + arg)); break;
    default: send(cmd, arg);
  }
}

// ---------- tray ----------
// Own StatusNotifierItem (sni.js) — icon sent as pixels + themed name, so GNOME never shows "⋯".
// Electron's Tray is only a fallback when no tray host is available.
let sni = null, coverPng = null;
const hasTray = () => !!(sni || tray);
function argbPixmaps(file) {
  const img = nativeImage.createFromPath(file);
  if (img.isEmpty()) return [];
  return [22, 32, 48, 64].map((sz) => {
    const bgra = img.resize({ width: sz, height: sz, quality: 'best' }).toBitmap();
    const argb = Buffer.alloc(bgra.length);
    for (let i = 0; i < bgra.length; i += 4) { argb[i] = bgra[i + 3]; argb[i + 1] = bgra[i + 2]; argb[i + 2] = bgra[i + 1]; argb[i + 3] = bgra[i]; }
    return { w: sz, h: sz, argb };
  });
}
function applyTrayIcon() {
  // full-colour icon, readable on dark and light top bars alike (the top bar does not follow the app theme)
  if (sni) sni.setIcon({ name: TRAY, themePath: A('tray'), pixmaps: argbPixmaps(A(`tray/${TRAY}.png`)) });
  else if (tray) tray.setImage(trayIcon());
}
function toggleSetting(k) { applySetting(k, !settings[k]); }
// One place for every setting change, so the tray menu and the in-app Settings panel always agree.
function applySetting(k, v) {
  settings[k] = v; saveSettings();
  if (k === 'startHidden') applyAutostart();
  if (k === 'theme') { send('theme', v); applyTitleBar(); }
  if (k === 'layout') send('layout', v);
  send('settings', publicSettings());
  rebuildTray();
}
const publicSettings = () => ({ theme: settings.theme || 'system', layout: settings.layout || 'dock',
  notifications: !!settings.notifications, closeToTray: !!settings.closeToTray, startHidden: !!settings.startHidden });

// ---------- system accent colour (GNOME 47+/Ubuntu: Settings → Appearance) ----------
// Read through the XDG portal (org.freedesktop.appearance accent-color, RGB 0..1); fall back to the GNOME
// accent name. The System theme uses it instead of a fixed pink.
const ACCENT_NAMES = { blue: '#3584e4', teal: '#2190a4', green: '#3a944a', yellow: '#c88800', orange: '#ed5b00',
  red: '#e62d42', pink: '#d56199', purple: '#9141ac', slate: '#6f8396' };
function readAccent() {
  const cp = require('child_process');
  try {
    const out = cp.execFileSync('gdbus', ['call', '--session', '--dest', 'org.freedesktop.portal.Desktop',
      '--object-path', '/org/freedesktop/portal/desktop', '--method', 'org.freedesktop.portal.Settings.ReadOne',
      'org.freedesktop.appearance', 'accent-color'], { timeout: 1500, encoding: 'utf8' });
    const n = (out.match(/-?\d+(\.\d+)?(e-?\d+)?/g) || []).map(Number);
    if (n.length >= 3 && n.slice(0, 3).every((x) => x >= 0 && x <= 1)) {
      return '#' + n.slice(0, 3).map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
    }
  } catch (_) {}
  try {
    const name = cp.execFileSync('gsettings', ['get', 'org.gnome.desktop.interface', 'accent-color'],
      { timeout: 1500, encoding: 'utf8' }).trim().replace(/'/g, '');
    if (ACCENT_NAMES[name]) return ACCENT_NAMES[name];
  } catch (_) {}
  return null;
}
let accent = null, accentWatch = null;
function watchAccent() {
  accent = readAccent();
  try {
    accentWatch = require('child_process').spawn('gsettings', ['monitor', 'org.gnome.desktop.interface', 'accent-color']);
    accentWatch.stdout.on('data', () => { accent = readAccent(); send('accent', accent); });
    accentWatch.on('error', () => { accentWatch = null; });
  } catch (_) { accentWatch = null; }
}
// "Start with the system (hidden in tray)": a login autostart entry that starts the player in the tray
function applyAutostart() {
  const dir = path.join(require('os').homedir(), '.config', 'autostart');
  const file = path.join(dir, 'linux-apple-music-player.desktop');
  try {
    if (!settings.startHidden) { fs.rmSync(file, { force: true }); return; }
    const entry = '[Desktop Entry]\nType=Application\nName=Linux Apple Music Player\nExec=/usr/bin/linux-apple-music-player --hidden\n'
      + 'Icon=linux-apple-music-player\nX-GNOME-Autostart-enabled=true\nNoDisplay=true\n';
    let cur = ''; try { cur = fs.readFileSync(file, 'utf8'); } catch (_) {}
    if (cur !== entry) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, entry); }
  } catch (e) { console.warn('autostart', e); }
}
function rebuildTray() {
  if (!hasTray()) return;
  const playing = player.status === 'Playing';
  const m = player.meta;
  const label = m ? `${m.title}${m.artist ? ' — ' + m.artist : ''}` : T.nothingPlaying;
  const short = label.length > 60 ? label.slice(0, 57) + '…' : label;
  const visible = win && win.isVisible();
  const tpl = [
    { label: short, enabled: !!m, icon: m ? coverPng : null, click: () => showWindow() },
    { type: 'separator' },
    { label: playing ? T.pause : T.play, click: () => send('toggle') },
    { label: T.next, click: () => send('next') },
    { label: T.previous, click: () => send('previous') },
    { type: 'separator' },
    { label: T.coverView, click: () => { showWindow(); send('cover', true); } },
    { label: visible ? T.hide : T.show, click: () => (visible ? win.hide() : showWindow()) },
    { type: 'separator' },
    { label: T.notifications, type: 'checkbox', checked: settings.notifications, click: () => toggleSetting('notifications') },
    { label: T.closeToTray, type: 'checkbox', checked: settings.closeToTray, click: () => toggleSetting('closeToTray') },
    { label: T.startHidden, type: 'checkbox', checked: settings.startHidden, click: () => toggleSetting('startHidden') },
    { type: 'separator' },
    // sni.js (our tray) draws a flat menu only — no submenus — so the theme choice is two radio items
    ...['system', 'aurora'].map((val) => ({
      label: `${T.theme}: ${val === 'aurora' ? T.themeAurora : T.themeSystem}`, type: 'radio',
      checked: (settings.theme || 'system') === val,
      click: () => { settings.theme = val; saveSettings(); send('theme', val); applyTitleBar(); rebuildTray(); } })),
    { type: 'separator' },
    // layout: Dock (default: bigger, large player at the bottom, collapsible menu) or Classic (the look before 0.3)
    ...['dock', 'classic'].map((val) => ({
      label: `${T.layout}: ${val === 'dock' ? T.layoutDock : T.layoutClassic}`, type: 'radio',
      checked: (settings.layout || 'dock') === val,
      click: () => { settings.layout = val; saveSettings(); send('layout', val); rebuildTray(); } })),
    { type: 'separator' },
    { label: T.reload, click: loadUI },
    { label: T.signOut, click: signOutAndClear },
    { type: 'separator' },
    { label: `${APP_NAME} ${pkg.version} (${pkg.releaseDate})`, enabled: false },
    { label: 'Created by: JGu', enabled: false },
    { label: 'Supported by Claude', enabled: false },
    { label: T.quit, click: () => { quitting = true; app.quit(); } }
  ];
  const tip = m ? `${playing ? '▶' : '❚❚'} ${label}` : APP_NAME;
  if (sni) { sni.setMenu(tpl); sni.setTooltip(tip); return; }
  tray.setContextMenu(Menu.buildFromTemplate(tpl.map((t) => {
    const o = Object.assign({}, t);
    if (o.icon) o.icon = nativeImage.createFromBuffer(o.icon).resize({ width: 32, height: 32 }); else delete o.icon;
    return o;
  })));
  tray.setToolTip(tip);
}
async function setupTray() {
  try {
    const { createSni } = require('./sni');
    const s = createSni({
      id: APP_ID, title: APP_NAME,
      onActivate: () => (win.isVisible() && win.isFocused() ? win.hide() : showWindow()),
      onScroll: (delta, orient) => { if (orient === 'vertical' || orient === 'Vertical') send('volume', Math.max(0, Math.min(1, player.volume + (delta < 0 ? 0.05 : -0.05)))); }
    });
    sni = s; applyTrayIcon(); rebuildTray(); // menu + icon ready before the panel sees us
    if (await s.start()) return;
    sni = null; s.stop();
  } catch (e) { console.warn('[tray] own tray unavailable:', e && e.message); }
  tray = new Tray(trayIcon());
  tray.setToolTip(APP_NAME);
  tray.on('click', () => (win.isVisible() && win.isFocused() ? win.hide() : showWindow()));
  rebuildTray();
}
async function signOutAndClear() {
  const r = await dialog.showMessageBox(win, { type: 'question', buttons: [T.cancel, T.ok], defaultId: 0, cancelId: 0, message: T.signOut, detail: T.signOutConfirm });
  if (r.response !== 1) return;
  send('signOut');
  setTimeout(async () => { await ses.clearStorageData(); await ses.clearCache(); loadUI(); }, 1000);
}

// ---------- artwork + notifications ----------
async function cacheArtwork(url, id) {
  if (!url || !/^https:/.test(url)) return null;
  const f = path.join(cacheDir, 'art-' + String(id || 'x').replace(/[^A-Za-z0-9_.-]/g, '_') + '.jpg');
  if (fs.existsSync(f)) return f;
  try {
    const res = await ses.fetch(url, { bypassCustomProtocolHandlers: !MOCK });
    if (!res.ok) return null;
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
    pruneCache(); return f;
  } catch (_) { return null; }
}
function pruneCache() {
  try {
    const files = fs.readdirSync(cacheDir).filter((n) => n.startsWith('art-')).map((n) => ({ n, t: fs.statSync(path.join(cacheDir, n)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const x of files.slice(60)) fs.unlinkSync(path.join(cacheDir, x.n));
  } catch (_) {}
}
let currentNotification = null;
function notifyTrack(m, artFile) {
  if (!settings.notifications || !Notification.isSupported()) return;
  if (win && win.isVisible() && win.isFocused()) return;
  try {
    if (currentNotification) currentNotification.close();
    currentNotification = new Notification({ title: m.title || T.nowPlaying, body: [m.artist, m.album].filter(Boolean).join(' — '), icon: artFile || A('icon-light-256.png'), silent: true, urgency: 'low' });
    currentNotification.on('click', showWindow);
    currentNotification.show();
  } catch (_) {}
}

// ---------- IPC ----------
ipcMain.handle('lamp:init', () => ({
  lang, version: pkg.version, date: pkg.releaseDate, name: APP_NAME, mock: MOCK,
  volume: settings.volume, theme: settings.theme, layout: settings.layout || 'dock',
  accent, settings: publicSettings(),
  T: { settings: T.settings, general: T.general, account: T.account, theme: T.theme, themeSystem: T.themeSystem,
    themeAurora: T.themeAurora, layout: T.layout, layoutDock: T.layoutDock, layoutClassic: T.layoutClassic,
    notifications: T.notifications, closeToTray: T.closeToTray, startHidden: T.startHidden, reload: T.reload,
    signOut: T.signOut, accentNote: T.accentNote }
}));
ipcMain.handle('lamp:token', async (_e, force) => {
  try { return { token: await getToken(!!force) }; } catch (e) { return { error: String(e && e.message || e) }; }
});
ipcMain.on('lamp:setting', (_e, k, v) => {
  if (k === 'volume') { settings[k] = v; saveSettings(); return; }
  if (k === 'theme' && ['system', 'aurora'].includes(v)) applySetting(k, v);
  else if (k === 'layout' && ['dock', 'classic'].includes(v)) applySetting(k, v);
  else if (['notifications', 'closeToTray', 'startHidden'].includes(k)) applySetting(k, !!v);
});
ipcMain.on('lamp:action', (_e, a) => { if (a === 'signOut') signOutAndClear(); });
ipcMain.on('lamp:reload', () => loadUI());
ipcMain.on('lamp:open-external', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
ipcMain.on('lamp:state', async (_e, s) => {
  if (!s || typeof s !== 'object') return;
  const now = Date.now(); const elapsed = (now - lastPosAt) / 1000; lastPosAt = now;
  const prevId = player.meta && player.meta.id, prevStatus = player.status;
  player = {
    status: s.status === 'playing' ? 'Playing' : s.status === 'paused' ? 'Paused' : 'Stopped',
    meta: s.meta || null, position: +s.position || 0, duration: +s.duration || 0,
    volume: typeof s.volume === 'number' ? s.volume : 1, shuffle: !!s.shuffle, repeat: s.repeat | 0
  };
  const m = player.meta;
  const artFile = m ? await cacheArtwork(m.artUrl, m.id) : null;
  if (m && m.id !== prevId) {
    coverPng = null;
    if (artFile) { const im = nativeImage.createFromPath(artFile); if (!im.isEmpty()) coverPng = im.resize({ width: 64, height: 64, quality: 'best' }).toPNG(); }
  }
  if (m && player.status === 'Playing' && lastNotifiedId !== m.id) { lastNotifiedId = m.id; notifyTrack(m, artFile); }
  if (mpris) {
    mpris.update({
      status: player.status,
      meta: m ? Object.assign({}, m, { artUrl: artFile ? 'file://' + artFile : undefined, durationMs: player.duration * 1000 || m.durationMs }) : null,
      volume: player.volume, shuffle: player.shuffle,
      loop: player.repeat === 1 ? 'Track' : player.repeat === 2 ? 'Playlist' : 'None',
      positionS: player.position, elapsedS: prevStatus === 'Playing' ? elapsed : 0
    });
  }
  if (win) win.setTitle(m ? `${m.title}${m.artist ? ' — ' + m.artist : ''} · ${APP_NAME}` : APP_NAME);
  if ((m && m.id) !== prevId || player.status !== prevStatus) rebuildTray();
});

// ---------- lifecycle ----------
app.on('second-instance', showWindow);
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (quitting || !settings.closeToTray) app.quit(); });
watchAccent();
app.on('will-quit', () => { if (accentWatch) accentWatch.kill(); });
nativeTheme.themeSource = 'system';
nativeTheme.on('updated', () => {
  applyTrayIcon();
  if (win) { win.setIcon(appIcon()); win.setBackgroundColor(dark() ? '#1e1e20' : '#ffffff'); }
  applyTitleBar();
  syncLauncherIcon();
});

app.whenReady().then(async () => {
  ses = session.fromPartition(PARTITION);
  ses.setUserAgent(chromeUA());
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(['media', 'mediaKeySystem', 'notifications', 'clipboard-sanitized-write', 'fullscreen', 'protected-media-identifier'].includes(perm)));
  let drmOk = true;
  try {
    if (electron.components && electron.components.whenReady) await electron.components.whenReady();
  } catch (e) { drmOk = false; console.warn('[drm] Widevine not ready:', e && e.message); }

  syncLauncherIcon();
  applyAutostart();
  createWindow();
  if (!drmOk && !MOCK) setTimeout(() => dialog.showMessageBox(win, { type: 'warning', message: 'Widevine', detail: T.drmFail }), 2500);

  await setupTray();

  try {
    const { createMpris } = require('./mpris');
    mpris = createMpris({ identity: APP_NAME, desktopEntry: APP_ID, onCommand: handleCommand });
    await mpris.start();
  } catch (e) { console.warn('[mpris] unavailable:', e && e.message); mpris = null; }

  if (!MOCK) getToken(false).catch((e) => console.warn('[token]', e.message));
});
app.on('will-quit', () => { if (mpris) mpris.stop(); if (sni) sni.stop(); });

// Developer self-test hook (only when LAMP_TEST_SHOT is set).
if (process.env.LAMP_TEST_SHOT) {
  const shot = async (name) => fs.writeFileSync(`${process.env.LAMP_TEST_SHOT}-${name}.png`, (await win.webContents.capturePage()).toPNG());
  const js = (c) => win.webContents.executeJavaScript(c, true);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  app.whenReady().then(async () => {
    await wait(5000);
    for (const step of (process.env.LAMP_TEST_STEPS || 'home').split(',')) {
      const [name, code] = step.split('=');
      if (code) { const r = await js(decodeURIComponent(code)); if (r !== undefined) console.log('[test]', name, JSON.stringify(r)); }
      await wait(1500);
      await shot(name);
    }
    console.log('[test] done');
  });
}

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
const settings = Object.assign({ notifications: false, closeToTray: true, startHidden: false, bounds: null, devToken: null, volume: 0.8 }, readJSON(cfgFile));
function readJSON(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return {}; } }
function saveSettings() { try { fs.mkdirSync(cfgDir, { recursive: true }); fs.writeFileSync(cfgFile, JSON.stringify(settings, null, 2)); } catch (_) {} }

const cacheDir = path.join(os.homedir(), '.cache', APP_ID);
try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (_) {}

// ---------- icons ----------
const A = (f) => path.join(__dirname, 'assets', f);
const dark = () => nativeTheme.shouldUseDarkColors;
const appIcon = () => nativeImage.createFromPath(A(dark() ? 'icon-dark-256.png' : 'icon-light-256.png'));
const trayIcon = () => nativeImage.createFromPath(A(`tray/${APP_ID}-tray-${dark() ? 'dark' : 'light'}.png`));
function syncLauncherIcon() {
  const variant = dark() ? 'dark' : 'light';
  const base = path.join(os.homedir(), '.local', 'share', 'icons', 'hicolor');
  let changed = false;
  for (const s of [48, 64, 128, 256, 512]) {
    const dst = path.join(base, `${s}x${s}`, 'apps', APP_ID + '.png');
    try {
      const a = fs.readFileSync(A(`icon-${variant}-${s}.png`));
      let b = null; try { b = fs.readFileSync(dst); } catch (_) {}
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
function createWindow() {
  const b = settings.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1280, height: b.height || 820, x: b.x, y: b.y,
    minWidth: 820, minHeight: 560,
    title: APP_NAME, icon: appIcon(), show: false, autoHideMenuBar: true,
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
  win.once('ready-to-show', () => { if (!settings.startHidden) win.show(); });
  win.webContents.on('did-finish-load', () => { if (win.webContents.getURL().startsWith(UI_BASE)) releaseProtocol(); });
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
  const v = dark() ? 'dark' : 'light';
  if (sni) sni.setIcon({ name: `${APP_ID}-tray-${v}`, themePath: A('tray'), pixmaps: argbPixmaps(A(`tray/${APP_ID}-tray-${v}.png`)) });
  else if (tray) tray.setImage(trayIcon());
}
function toggleSetting(k) { settings[k] = !settings[k]; saveSettings(); rebuildTray(); }
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
  volume: settings.volume
}));
ipcMain.handle('lamp:token', async (_e, force) => {
  try { return { token: await getToken(!!force) }; } catch (e) { return { error: String(e && e.message || e) }; }
});
ipcMain.on('lamp:setting', (_e, k, v) => { if (['volume'].includes(k)) { settings[k] = v; saveSettings(); } });
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
nativeTheme.themeSource = 'system';
nativeTheme.on('updated', () => {
  applyTrayIcon();
  if (win) { win.setIcon(appIcon()); win.setBackgroundColor(dark() ? '#1e1e20' : '#ffffff'); }
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

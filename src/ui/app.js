/* Linux Apple Music Player — fast UI on top of the Apple Music API + MusicKit (audio only). */
(async function () {
  'use strict';
  const cfg = await window.lamp.init();
  document.body.classList.toggle('aurora', cfg.theme === 'aurora');
  document.body.classList.toggle('dock', cfg.layout !== 'classic');  // Dock is the default; tray → Layout: Classic
  // System theme: the accent colour chosen in Ubuntu (Settings → Appearance), live; Apple pink only as a fallback
  function setAccent(hex) {
    const r = document.documentElement.style;
    if (hex && /^#[0-9a-f]{6}$/i.test(hex)) {
      r.setProperty('--accent', hex);
      r.setProperty('--accent2', `color-mix(in srgb, ${hex} 62%, white)`);
    } else { r.removeProperty('--accent'); r.removeProperty('--accent2'); }
  }
  setAccent(cfg.accent);
  const PL = cfg.lang === 'pl';
  const S = PL ? {
    search: 'Szukaj', appleMusic: 'Apple Music', home: 'Główna', library: 'Biblioteka', recent: 'Ostatnio dodane', artists: 'Wykonawcy',
    albums: 'Albumy', songs: 'Utwory', playlists: 'Playlisty', recentlyPlayed: 'Ostatnio odtwarzane', heavy: 'Często słuchane', madeForYou: 'Dla Ciebie',
    play: 'Odtwórz', shuffle: 'Losowo', playNext: 'Odtwórz jako następny', playLater: 'Odtwórz później', addLib: 'Dodaj do biblioteki',
    addPl: 'Dodaj do playlisty', goAlbum: 'Przejdź do albumu', goArtist: 'Przejdź do wykonawcy', copyLink: 'Kopiuj link', queue: 'Następne', history: 'Odtworzone',
    nothing: 'Nic nie gra', lyrics: 'Tekst', noLyrics: 'Brak tekstu dla tego utworu', loadingLyrics: 'Wczytywanie tekstu…', cover: 'Widok okładki',
    signInTitle: 'Witaj w Apple Music', signInText: 'Zaloguj się swoim Apple ID, aby słuchać muzyki z subskrypcji Apple Music.', signIn: 'Zaloguj się Apple ID',
    tokenErr: 'Nie udało się pobrać klucza Apple Music. Sprawdź połączenie z internetem.', retry: 'Spróbuj ponownie', loading: 'Wczytywanie…',
    empty: 'Brak elementów', noResults: 'Brak wyników', inLibrary: 'Twoja biblioteka', added: 'Dodano do biblioteki', addedTo: 'Dodano do: ', removePl: 'Usuń z playlisty', removedFrom: 'Usunięto z: ', queued: 'Dodano do kolejki',
    copied: 'Skopiowano link', songsN: (n) => n + (n === 1 ? ' utwór' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? ' utwory' : ' utworów'),
    min: ' min', title: 'Tytuł', artist: 'Wykonawca', album: 'Album', time: 'Czas', topSongs: 'Najpopularniejsze utwory', fullAlbums: 'Albumy', singles: 'Single i EP',
    sizer: 'Przeciągnij, aby zmienić szerokość · dwuklik lub Ctrl+B chowa i pokazuje pasek',
    playErr: 'Nie można odtworzyć utworu', error: 'Błąd: ', volume: 'Głośność', repeat: 'Powtarzaj', prev: 'Poprzedni', next: 'Następny', close: 'Zamknij (Esc)', stations: 'Stacje', radio: 'Radio', albumK: 'Album', playlistK: 'Playlista'
  } : {
    search: 'Search', appleMusic: 'Apple Music', home: 'Home', library: 'Library', recent: 'Recently Added', artists: 'Artists',
    albums: 'Albums', songs: 'Songs', playlists: 'Playlists', recentlyPlayed: 'Recently Played', heavy: 'Heavy Rotation', madeForYou: 'Made for You',
    play: 'Play', shuffle: 'Shuffle', playNext: 'Play Next', playLater: 'Play Later', addLib: 'Add to Library',
    addPl: 'Add to Playlist', goAlbum: 'Go to Album', goArtist: 'Go to Artist', copyLink: 'Copy Link', queue: 'Playing Next', history: 'History',
    nothing: 'Nothing playing', lyrics: 'Lyrics', noLyrics: 'No lyrics for this song', loadingLyrics: 'Loading lyrics…', cover: 'Cover view',
    signInTitle: 'Welcome to Apple Music', signInText: 'Sign in with your Apple ID to listen with your Apple Music subscription.', signIn: 'Sign in with Apple ID',
    tokenErr: 'Could not get the Apple Music key. Check your internet connection.', retry: 'Try again', loading: 'Loading…',
    empty: 'Nothing here', noResults: 'No results', inLibrary: 'Your Library', added: 'Added to Library', addedTo: 'Added to: ', removePl: 'Remove from Playlist', removedFrom: 'Removed from: ', queued: 'Added to queue',
    copied: 'Link copied', songsN: (n) => n + (n === 1 ? ' song' : ' songs'),
    min: ' min', title: 'Title', artist: 'Artist', album: 'Album', time: 'Time', topSongs: 'Top Songs', fullAlbums: 'Albums', singles: 'Singles & EPs',
    sizer: 'Drag to resize · double-click or Ctrl+B hides and shows the sidebar',
    playErr: 'Cannot play this song', error: 'Error: ', volume: 'Volume', repeat: 'Repeat', prev: 'Previous', next: 'Next', close: 'Close (Esc)', stations: 'Stations', radio: 'Radio', albumK: 'Album', playlistK: 'Playlist'
  };

  // ======================= helpers =======================
  const $ = (s, r) => (r || document).querySelector(s);
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'style') n.style.cssText = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return n;
  }
  const P = {
    play: 'M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z',
    pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
    next: 'M5 6.2v11.6a.8.8 0 0 0 1.2.7L14 13v4.8a.8.8 0 0 0 1.2.7l.1-.1V6.6l-.1-.1a.8.8 0 0 0-1.2.7V11L6.2 5.5A.8.8 0 0 0 5 6.2zM17 5.5h2v13h-2z',
    prev: 'M19 6.2v11.6a.8.8 0 0 1-1.2.7L10 13v4.8a.8.8 0 0 1-1.2.7l-.1-.1V6.6l.1-.1a.8.8 0 0 1 1.2.7V11l7.8-5.5a.8.8 0 0 1 1.2.7zM5 5.5h2v13H5z',
    shuffle: 'M17 3l4 4-4 4V8h-2.2c-1 0-1.9.5-2.5 1.3l-5 7A5 5 0 0 1 3.2 18H2v-2h1.2c1 0 1.9-.5 2.5-1.3l5-7A5 5 0 0 1 14.8 6H17V3zM2 6h1.2a5 5 0 0 1 4 2l.6.8-1.2 1.7-1-1.3C5 8.5 4.2 8 3.2 8H2V6zm12.8 10H17v-3l4 4-4 4v-3h-2.2a5 5 0 0 1-4-2l-.6-.8 1.2-1.7 1 1.3c.6.8 1.5 1.2 2.4 1.2z',
    repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
    lyrics: 'M3 4h18v2H3zm0 5h12v2H3zm0 5h18v2H3zm0 5h12v2H3z',
    queue: 'M3 5h13v2H3zm0 4h13v2H3zm0 4h8v2H3zm15-1v5.3a2.5 2.5 0 1 0 2 2.45V14h2v-2z',
    close: 'M6.4 5L12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z',
    vol: 'M4 9h4l5-4v14l-5-4H4zM16 8.5a5 5 0 0 1 0 7l-1.4-1.4a3 3 0 0 0 0-4.2zM18.5 6a8.5 8.5 0 0 1 0 12l-1.4-1.4a6.5 6.5 0 0 0 0-9.2z',
    mute: 'M4 9h4l5-4v14l-5-4H4zm12.3.3 1.4-1.4L20 10.2l2.3-2.3 1.4 1.4-2.3 2.3 2.3 2.3-1.4 1.4-2.3-2.3-2.3 2.3-1.4-1.4 2.3-2.3z',
    back: 'M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12z',
    home: 'M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z',
    clock: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 3v5.4l3.6 2.1-1 1.7L11 13.6V7z',
    mic: 'M12 2a4 4 0 0 1 4 4v5a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4zm-7 9h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.9V21h-2v-3.1A7 7 0 0 1 5 11z',
    album: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z',
    note: 'M10 3h10v4h-8v10.5A3.5 3.5 0 1 1 10 14.3z',
    list: 'M4 5h3v3H4zm5 0h11v3H9zm-5 5.5h3v3H4zm5 0h11v3H9zM4 16h3v3H4zm5 0h11v3H9z',
    expand: 'M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 4v-4h2v6h-6v-2z',
    chev: 'M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z',
    gear: 'M19.1 12.9a7 7 0 0 0 0-1.8l2-1.6a.5.5 0 0 0 .1-.6l-1.9-3.3a.5.5 0 0 0-.6-.2l-2.4 1a7 7 0 0 0-1.6-.9L14.4 3a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4l-.4 2.5a7 7 0 0 0-1.6.9l-2.4-1a.5.5 0 0 0-.6.2L2.7 8.9a.5.5 0 0 0 .1.6l2 1.6a7 7 0 0 0 0 1.8l-2 1.6a.5.5 0 0 0-.1.6l1.9 3.3c.1.2.4.3.6.2l2.4-1c.5.4 1 .7 1.6.9l.4 2.5c0 .2.3.4.5.4h3.8c.2 0 .5-.2.5-.4l.4-2.5a7 7 0 0 0 1.6-.9l2.4 1c.2.1.5 0 .6-.2l1.9-3.3a.5.5 0 0 0-.1-.6zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z',
    folder: 'M3 6.5A2.5 2.5 0 0 1 5.5 4h4.2l2 2h6.8A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z',
    radio: 'M4 8h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zm2.6-1.6L15.9 3l.7 1.9L10 7.3zM8 11a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm7 1v1.5h4V12zm0 3v1.5h4V15z'
  };
  function icon(name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', P[name]);
    s.appendChild(p); return s;
  }
  const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600); const m = Math.floor(s % 3600 / 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  function artUrl(a, size) {
    const u = a && (a.url || a);
    if (!u || typeof u !== 'string') return '';
    const px = Math.round(size * DPR);
    return u.replace('{w}', px).replace('{h}', px).replace('{c}', 'bb').replace('{f}', 'webp');
  }
  function img(src, cls) {
    const i = el('img', { class: cls || '', alt: '', loading: 'lazy', decoding: 'async' });
    if (src) { i.onload = () => i.classList.add('ok'); i.onerror = () => i.remove(); i.src = src; }
    return i;
  }
  function placeholder(kind) {
    const d = el('div', { style: 'width:100%;height:100%;display:grid;place-items:center;background:linear-gradient(135deg,var(--accent2),var(--accent));color:#fff' });
    const i = icon(kind === 'artist' ? 'mic' : kind === 'playlist' ? 'list' : kind === 'station' ? 'radio' : 'note'); i.style.cssText = 'width:38%;height:38%;opacity:.9';
    d.appendChild(i); return d;
  }
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // ======================= MusicKit + API =======================
  let mk = null, devToken = null, sf = 'us';
  const API = 'https://amp-api.music.apple.com';

  async function loadMusicKit() {
    if (cfg.mock) { await loadScript('mock/mock.js'); return; }
    if (window.MusicKit && window.MusicKit.configure) return;
    await new Promise((res, rej) => {
      document.addEventListener('musickitloaded', res, { once: true });
      loadScript('https://js-cdn.music.apple.com/musickit/v3/musickit.js').catch(rej);
      setTimeout(() => (window.MusicKit ? res() : rej(new Error('MusicKit load timeout'))), 30000);
    });
  }
  function loadScript(src) {
    return new Promise((res, rej) => { const s = el('script', { src, async: true }); s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
  }

  const memo = new Map();
  async function api(path, opts) {
    opts = opts || {};
    let url = path.startsWith('http') ? path : API + path;
    if (opts.params) { const u = new URL(url); for (const k in opts.params) u.searchParams.set(k, opts.params[k]); url = u.toString(); }
    const method = opts.method || 'GET';
    const key = method === 'GET' ? url : null;
    if (key && !opts.fresh && memo.has(key)) return memo.get(key);
    const p = (async () => {
      if (cfg.mock) return window.__mockApi(url, method, opts.body);
      const headers = { Authorization: 'Bearer ' + devToken };
      if (mk && mk.musicUserToken) headers['Media-User-Token'] = mk.musicUserToken;
      if (opts.body) headers['Content-Type'] = 'application/json';
      const r = await fetch(url, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
      if (r.status === 401 && !sessionStorage.getItem('lamp.tokenRetry')) {
        sessionStorage.setItem('lamp.tokenRetry', '1');
        await window.lamp.token(true); window.lamp.reload(); return new Promise(() => {});
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      sessionStorage.removeItem('lamp.tokenRetry');
      const txt = await r.text();
      return txt ? JSON.parse(txt) : {};
    })();
    if (key) { memo.set(key, p); p.catch(() => memo.delete(key)); if (memo.size > 400) memo.delete(memo.keys().next().value); }
    return p;
  }
  const lib = (p) => '/v1/me/library' + p;
  const cat = (p) => `/v1/catalog/${sf}` + p;

  // ======================= model =======================
  function kindOf(type) {
    type = String(type || '').replace('library-', '');
    if (type === 'albums') return 'album';
    if (type === 'playlists') return 'playlist';
    if (type === 'songs' || type === 'music-videos') return 'song';
    if (type === 'artists') return 'artist';
    if (type === 'stations') return 'station';
    return type;
  }
  function norm(r) {
    if (!r) return null;
    const a = r.attributes || {};
    const pp = a.playParams || {};
    const catRel = r.relationships && r.relationships.catalog && r.relationships.catalog.data && r.relationships.catalog.data[0];
    const artwork = a.artwork || (catRel && catRel.attributes && catRel.attributes.artwork) || null;
    return {
      id: r.id, type: r.type, kind: kindOf(r.type), lib: String(r.type || '').startsWith('library-'),
      name: a.name || (a.title && a.title.stringForDisplay) || '', artist: a.artistName || a.curatorName || '', album: a.albumName || '',
      artwork, catalogId: pp.catalogId || (catRel && catRel.id) || (!String(r.type).startsWith('library-') ? r.id : null),
      duration: a.durationInMillis || 0, track: a.trackNumber, disc: a.discNumber, explicit: a.contentRating === 'explicit',
      url: a.url || '', date: a.releaseDate || a.lastModifiedDate || '', count: a.trackCount, desc: (a.description && (a.description.standard || a.description.short)) || (a.editorialNotes && (a.editorialNotes.standard || a.editorialNotes.short)) || '',
      genre: (a.genreNames || [])[0] || '', canEdit: !!a.canEdit, playable: !!(a.playParams), raw: r
    };
  }
  const rel = (r, name) => (r && r.relationships && r.relationships[name]) || null;

  // ======================= navigation =======================
  const main = $('#main'), view = $('#view');
  // M3 album/playlist page: mark it "stuck" when the column header reaches the top bar (CSS makes both solid)
  main.addEventListener('scroll', () => {
    for (const v of main.querySelectorAll('.m3')) {
      const th = v.querySelector('.thead'), vh = v.querySelector(':scope > .vhead');
      if (!th) continue;
      const top = vh ? vh.offsetHeight : 0;
      if (th.style.top !== top + 'px') th.style.top = top + 'px';   // the column header sits right under the top bar
      v.classList.toggle('stuck', th.getBoundingClientRect().top <= main.getBoundingClientRect().top + top + 1);
    }
  }, { passive: true });
  let stack = [];
  const ROUTES = {};
  function go(route, args, opts) {
    opts = opts || {};
    const cur = stack[stack.length - 1];
    if (cur) cur.scroll = main.scrollTop;
    const entry = { route, args: args || {}, node: null, scroll: 0 };
    if (opts.root) stack = [entry]; else stack.push(entry);
    if (stack.length > 30) stack.shift();
    show(entry, true);
    markNav();
  }
  function back() {
    if (stack.length < 2) return;
    stack.pop();
    show(stack[stack.length - 1], false);
    markNav();
  }
  function show(entry, fresh) {
    view.textContent = '';
    if (!entry.node) {
      entry.node = el('div');
      const r = ROUTES[entry.route];
      try { r(entry.node, entry.args); } catch (e) { entry.node.appendChild(el('div', { class: 'empty', text: S.error + e.message })); }
    }
    view.appendChild(entry.node);
    main.scrollTop = fresh ? 0 : entry.scroll;
    refreshNowMarks();
  }
  function head(title, node) {
    const h = el('div', { class: 'vhead' });
    if (stack.length > 1) h.appendChild(el('button', { class: 'back', title: '←', onclick: back }, icon('back')));
    h.appendChild(el('h1', { text: title }));
    node.appendChild(h);
    return h;
  }

  // sidebar: groups that fold (the Dock layout shows the arrow; the state is kept per group)
  const nav = $('#nav');
  const store = (k, set) => { try { localStorage.setItem(k, JSON.stringify([...set])); } catch (_) {} };
  const loadSet = (k) => { try { return new Set(JSON.parse(localStorage.getItem(k) || '[]')); } catch (_) { return new Set(); } };
  const closedGroups = loadSet('lamp.closedGroups'), openFolders = loadSet('lamp.openFolders');
  function group(key, title) {
    const body = el('div', { class: 'gbody' }), cnt = el('span', { class: 'gcount' });
    const g = el('div', { class: 'grp' + (closedGroups.has(key) ? ' closed' : '') });
    g.append(el('button', { class: 'nsec', onclick: () => {
      if (g.classList.toggle('closed')) closedGroups.add(key); else closedGroups.delete(key);
      store('lamp.closedGroups', closedGroups);
    } }, el('span', { text: title }), cnt, icon('chev')), body);
    nav.appendChild(g);
    return { body, cnt };
  }
  const navItem = (r, t, i) => el('button', { class: 'nitem', 'data-r': r, onclick: () => go(r, {}, { root: true }) },
    icon(i), el('span', { text: t }), el('span', { class: 'ncount' }));
  group('am', S.appleMusic).body.append(navItem('home', S.home, 'home'), navItem('radio', S.radio, 'radio'));
  group('lib', S.library).body.append(navItem('recent', S.recent, 'clock'), navItem('artists', S.artists, 'mic'),
    navItem('albums', S.albums, 'album'), navItem('songs', S.songs, 'note'));
  const gPl = group('pl', S.playlists);
  const plBox = gPl.body;
  let nowPl = null;  // id of the playlist that is playing (marked in the sidebar)
  function markNav() {
    const root = stack[0];
    nav.querySelectorAll('.nitem').forEach((b) => {
      b.classList.toggle('on', !!(root && ((b.dataset.r === root.route && !b.dataset.pl) || (b.dataset.pl && root.args.id === b.dataset.pl))));
      b.classList.toggle('playing', !!(nowPl && b.dataset.pl === nowPl));
    });
  }
  let myPlaylists = [];
  function plItem(p) {
    const src = artUrl(p.artwork, 56);
    return el('button', { class: 'nitem pl' + (src ? ' thumb' : ''), 'data-r': 'detail', 'data-pl': p.id, title: p.name,
      onclick: () => go('detail', { id: p.id, type: p.type }, { root: true }), oncontextmenu: (e) => cardMenu(e, p) },
    icon('list'), src ? img(src, 'th') : null, el('span', { text: p.name }), el('span', { class: 'eq' }, el('i'), el('i'), el('i')));
  }
  const isFolder = (r) => String(r.type || '').includes('folder');
  function folderItem(r) {
    const key = r.id, kids = el('div', { class: 'nest' });
    let loaded = false;
    const wrap = el('div', { class: 'fold' + (openFolders.has(key) ? ' open' : '') });
    const fill = async () => { loaded = true; try { await fillFolder(kids, r.id); } catch (_) { loaded = false; } };
    wrap.append(el('button', { class: 'nitem folder', title: (r.attributes || {}).name || '', onclick: () => {
      const open = wrap.classList.toggle('open');
      if (open) openFolders.add(key); else openFolders.delete(key);
      store('lamp.openFolders', openFolders);
      if (open && !loaded) fill();
    } }, icon('folder'), el('span', { text: (r.attributes || {}).name || '' }), icon('chev')), kids);
    if (openFolders.has(key)) fill();
    return wrap;
  }
  async function fetchAll(path) {
    let next = path; const out = [];
    while (next && out.length < 500) { const r = await api(next, { fresh: true }); out.push(...(r.data || [])); next = r.next; }
    return out;
  }
  async function fillFolder(box, id) {
    const items = await fetchAll(lib(`/playlist-folders/${id}/children?limit=100`));
    box.textContent = '';
    for (const r of items) box.appendChild(isFolder(r) ? folderItem(r) : plItem(norm(r)));
    markNav();
  }
  async function loadPlaylists() {
    try {
      const out = (await fetchAll(lib('/playlists?limit=100'))).map(norm);
      myPlaylists = out;  // all playlists (also those inside folders), used by "Add to Playlist"
      gPl.cnt.textContent = out.length ? String(out.length) : '';
      // Playlist folders as in Apple Music; without folders (or if the API refuses) a plain list
      let root = [];
      try { root = await fetchAll(lib('/playlist-folders/p.playlistsroot/children?limit=100')); } catch (_) {}
      plBox.textContent = '';
      if (root.some(isFolder)) for (const r of root) plBox.appendChild(isFolder(r) ? folderItem(r) : plItem(norm(r)));
      else for (const p of out) plBox.appendChild(plItem(p));
      markNav();
    } catch (e) { console.warn('playlists', e); }
  }
  // numbers next to Artists / Albums / Songs (shown in the Dock layout)
  function loadCounts() {
    for (const r of ['artists', 'albums', 'songs']) {
      api(lib(`/${r}?limit=1`), { fresh: true }).then((x) => {
        const n = x && x.meta && x.meta.total; const c = nav.querySelector(`.nitem[data-r="${r}"] .ncount`);
        if (c && n) c.textContent = n.toLocaleString(PL ? 'pl-PL' : 'en-US');
      }).catch(() => {});
    }
  }
  $('.brand span').textContent = cfg.name;
  $('#ver').append(el('div', { text: `${cfg.name} ${cfg.version} · ${cfg.date}` }), el('div', { class: 'credit', text: 'Created by: JGu' }), el('div', { class: 'credit', text: 'Supported by Claude' }));

  // Sidebar: drag its right edge to resize (200–460 px); drag far left, double-click or Ctrl+B to hide it so the
  // page gets the whole width; the handle stays at the window edge to bring it back. Remembered per user.
  (() => {
    const app = $('#app');
    const sizer = el('div', { class: 'sizer', title: S.sizer });
    app.appendChild(sizer);
    let w = +(localStorage.getItem('lamp.sidew') || 0);
    let hidden = localStorage.getItem('lamp.sidehidden') === '1';
    const apply = () => {
      if (hidden) app.style.setProperty('--sidew', '0px');
      else if (w) app.style.setProperty('--sidew', w + 'px');
      else app.style.removeProperty('--sidew');               // layout default (Dock 290 px, Classic 236 px)
      document.body.classList.toggle('side-hidden', hidden);
    };
    const save = () => { try { localStorage.setItem('lamp.sidew', String(w || '')); localStorage.setItem('lamp.sidehidden', hidden ? '1' : '0'); } catch (_) {} };
    const toggle = () => { hidden = !hidden; apply(); save(); };
    sizer.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      sizer.setPointerCapture(e.pointerId);
      sizer.classList.add('drag'); document.body.classList.add('sizing');
      const left = app.getBoundingClientRect().left;
      const move = (ev) => {
        const x = ev.clientX - left;
        if (x < 120) { hidden = true; } else { hidden = false; w = Math.max(200, Math.min(460, Math.round(x))); }
        apply();
      };
      const up = () => { sizer.removeEventListener('pointermove', move); sizer.classList.remove('drag'); document.body.classList.remove('sizing'); save(); };
      sizer.addEventListener('pointermove', move);
      sizer.addEventListener('pointerup', up, { once: true });
      sizer.addEventListener('pointercancel', up, { once: true });
    });
    sizer.addEventListener('dblclick', toggle);
    document.addEventListener('keydown', (e) => { if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); toggle(); } });
    apply();
  })();

  // Settings: the same options as the tray menu, also reachable inside the window (bottom of the sidebar)
  const prefs = (() => {
    const T = cfg.T, st = Object.assign({}, cfg.settings);
    const box = el('div', { id: 'prefs', class: 'sheet', onclick: (e) => { if (e.target === box) close(); } });
    const card = el('div', { class: 'sheetcard', role: 'dialog' });
    box.appendChild(card);
    $('#app').appendChild(box);
    const seg = (key, opts) => {
      const w = el('div', { class: 'seg' });
      opts.forEach(([v, t]) => w.appendChild(el('button', { 'data-v': v, text: t, onclick: () => set(key, v) })));
      w.dataset.k = key;
      return w;
    };
    const tog = (key, t) => el('label', { class: 'tog' }, el('span', { text: t }),
      el('input', { type: 'checkbox', 'data-k': key, onchange: (e) => set(key, e.target.checked) }));
    card.append(
      el('div', { class: 'sheethead' }, el('h2', { text: T.settings }),
        el('button', { class: 'ib', title: S.close, onclick: () => close() }, icon('close'))),
      el('div', { class: 'psec', text: T.general }),
      el('div', { class: 'prow' }, el('span', { text: T.theme }), seg('theme', [['system', T.themeSystem], ['aurora', T.themeAurora]])),
      el('div', { class: 'pnote', text: T.accentNote }),
      el('div', { class: 'prow' }, el('span', { text: T.layout }), seg('layout', [['dock', T.layoutDock], ['classic', T.layoutClassic]])),
      tog('notifications', T.notifications), tog('closeToTray', T.closeToTray), tog('startHidden', T.startHidden),
      el('div', { class: 'psec', text: T.account }),
      el('div', { class: 'prow btns' },
        el('button', { class: 'btn sec', text: T.reload, onclick: () => window.lamp.reload() }),
        el('button', { class: 'btn sec', text: T.signOut, onclick: () => { close(); window.lamp.action('signOut'); } })),
      el('div', { class: 'pver', text: `${cfg.name} ${cfg.version} · Created by: JGu · Supported by Claude` }));
    function sync(s) {
      Object.assign(st, s || {});
      card.querySelectorAll('.seg').forEach((w) => w.querySelectorAll('button').forEach((b) => b.classList.toggle('on', st[w.dataset.k] === b.dataset.v)));
      card.querySelectorAll('input[data-k]').forEach((i) => { i.checked = !!st[i.dataset.k]; });
    }
    function set(key, v) {
      st[key] = v; sync();
      if (key === 'theme') document.body.classList.toggle('aurora', v === 'aurora');
      if (key === 'layout') document.body.classList.toggle('dock', v === 'dock');
      window.lamp.setting(key, v);
    }
    function open() { sync(); box.classList.add('open'); }
    function close() { box.classList.remove('open'); }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && box.classList.contains('open')) { close(); e.stopPropagation(); } }, true);
    const btn = el('button', { class: 'nitem setbtn', onclick: open }, icon('gear'), el('span', { text: T.settings }));
    $('#side').insertBefore(btn, $('#ver'));
    sync();
    return { sync, open };
  })();

  // ======================= renderers =======================
  function card(it, opts) {
    opts = opts || {};
    const round = it.kind === 'artist';
    const art = el('div', { class: 'art' });
    const src = artUrl(it.artwork, opts.size || 280); // covers grow to ~260 px on a large window
    if (src) art.appendChild(img(src)); else art.appendChild(placeholder(it.kind));
    if (it.kind !== 'artist') art.appendChild(el('button', { class: 'play', title: S.play, onclick: (e) => { e.stopPropagation(); playItem(it); } }, icon('play')));
    return el('div', { class: 'card' + (round ? ' round' : ''), onclick: () => open(it), oncontextmenu: (e) => cardMenu(e, it) },
      art, el('div', { class: 't', text: it.name, title: it.name }), el('div', { class: 's', text: opts.sub != null ? opts.sub : (it.kind === 'playlist' ? (it.artist || '') : it.artist) }));
  }
  function open(it) {
    if (it.kind === 'artist') go('artist', { id: it.id, type: it.type, name: it.name });
    else if (it.kind === 'station') playItem(it);
    else if (it.kind === 'song') { if (it.raw && rel(it.raw, 'albums')) go('detail', { id: rel(it.raw, 'albums').data[0].id, type: rel(it.raw, 'albums').data[0].type }); else playItem(it); }
    else go('detail', { id: it.id, type: it.type });
  }
  function spinner() { return el('div', { class: 'sentinel' }, el('div', { class: 'spin' })); }

  // Paginated grid / list with infinite scroll.
  function infinite(container, firstPath, renderBatch, onEmpty) {
    const sent = spinner();
    container.after(sent);
    let next = firstPath, busy = false, count = 0;
    const io = new IntersectionObserver((ents) => { if (ents.some((e) => e.isIntersecting)) load(); }, { root: main, rootMargin: '900px' });
    async function load() {
      if (busy || !next) return;
      busy = true;
      try {
        const r = await api(next);
        const items = (r.data || []).map(norm).filter(Boolean);
        count += items.length;
        renderBatch(items);
        next = r.next || null;
      } catch (e) { next = null; container.after(el('div', { class: 'empty', text: S.error + e.message })); }
      busy = false;
      if (!next) { io.disconnect(); sent.remove(); if (!count && onEmpty) onEmpty(); }
      else if (sent.getBoundingClientRect().top < main.clientHeight + 900) setTimeout(load, 0);
    }
    io.observe(sent); load();
  }

  // ---- track list ----
  let selRow = null;
  function trackList(tracks, opts) {
    opts = opts || {};
    const wrap = el('div', { class: 'tracks' });
    const showArt = opts.art !== false;
    const showAlbum = opts.album !== false;
    wrap.appendChild(el('div', { class: 'thead' + (showAlbum ? '' : ' noalbum') },
      el('span', { text: '' }), el('span', { text: S.title }), el('span', { text: S.artist }), showAlbum ? el('span', { class: 'album', text: S.album }) : null, el('span', { style: 'text-align:right', text: S.time })));
    const list = el('div');
    wrap.appendChild(list);
    const all = [];
    // own, editable library playlist: rows get "Remove from Playlist"
    const ownPl = opts.ctx && typeof opts.ctx === 'object' && opts.ctx.kind === 'playlist' && opts.ctx.lib &&
      (opts.ctx.canEdit || myPlaylists.some((p) => p.id === opts.ctx.id && p.canEdit)) ? opts.ctx : null;
    function drop(row, t) {
      const i = all.indexOf(t); if (i >= 0) all.splice(i, 1);
      if (selRow === row) selRow = null;
      row.remove();
      if (opts.onChange) opts.onChange();
    }
    function add(items) {
      const frag = document.createDocumentFragment();
      for (const t of items) {
        if (t.kind !== 'song') continue;
        const idx = all.length; all.push(t);
        const n = el('div', { class: 'n' });
        if (showArt) { const src = artUrl(t.artwork, 40); n.appendChild(src ? img(src, 'ok') : el('div', { style: 'width:34px;height:34px;border-radius:4px;overflow:hidden' }, placeholder('song'))); }
        else n.appendChild(el('span', { text: String(t.track || idx + 1) }));
        n.appendChild(el('span', { class: 'pb' }, icon('play')));
        const row = el('div', { class: 'tr' + (showArt ? '' : ' txt') + (showAlbum ? '' : ' noalbum'), 'data-id': t.id, 'data-cid': t.catalogId || '' },
          n,
          el('div', { class: 'c title', title: t.name }, t.name, t.explicit ? el('span', { class: 'exp', text: 'E' }) : null),
          el('div', { class: 'c', text: t.artist, title: t.artist }),
          showAlbum ? el('div', { class: 'c album link', text: t.album, title: t.album, onclick: (e) => { e.stopPropagation(); goAlbumOf(t); } }) : null,
          el('div', { class: 'd', text: t.duration ? fmt(t.duration / 1000) : '' }));
        row.addEventListener('click', (e) => { select(row); if (e.target.closest('.pb')) playList(all, all.indexOf(t), opts.ctx); });
        row.addEventListener('dblclick', () => playList(all, all.indexOf(t), opts.ctx));
        row.addEventListener('contextmenu', (e) => { select(row); trackMenu(e, t, ownPl && t.lib ? () => removeFromPlaylist(t, ownPl, () => drop(row, t)) : null); });
        frag.appendChild(row);
      }
      list.appendChild(frag);
      refreshNowMarks();
    }
    function select(row) { if (selRow) selRow.classList.remove('sel'); selRow = row; row.classList.add('sel'); }
    return { node: wrap, list, add, all };
  }

  // ======================= views =======================
  ROUTES.home = (node) => {
    head(S.home, node);
    const pad = el('div', { class: 'pad' }); node.appendChild(pad);
    const shelf = (title, items) => {
      if (!items || !items.length) return;
      const row = el('div', { class: 'row' }, items.map((i) => card(i)));
      pad.appendChild(el('div', { class: 'section' }, el('h2', { text: title }), row));
    };
    const sp = spinner(); pad.appendChild(sp);
    (async () => {
      const [recent, heavy, recs] = await Promise.allSettled([
        api('/v1/me/recent/played?limit=10'),
        api('/v1/me/history/heavy-rotation?limit=10'),
        api('/v1/me/recommendations?limit=10')
      ]);
      sp.remove();
      if (recent.value) shelf(S.recentlyPlayed, (recent.value.data || []).map(norm));
      if (heavy.value) shelf(S.heavy, (heavy.value.data || []).map(norm));
      if (recs.value) for (const g of recs.value.data || []) {
        const a = g.attributes || {};
        const items = ((rel(g, 'contents') || {}).data || []).map(norm);
        shelf((a.title && a.title.stringForDisplay) || S.madeForYou, items);
      }
      if (!pad.children.length) pad.appendChild(el('div', { class: 'empty', text: S.empty }));
    })();
  };

  ROUTES.radio = (node) => {
    head(S.radio, node);
    const pad = el('div', { class: 'pad' }); node.appendChild(pad);
    const sp = spinner(); pad.appendChild(sp);
    (async () => {
      const [mine, live] = await Promise.allSettled([
        api(cat('/stations?filter[identity]=personal')),
        api(cat('/stations?filter[featured]=apple-music-live-radio'))
      ]);
      sp.remove();
      const items = [...((mine.value && mine.value.data) || []), ...((live.value && live.value.data) || [])].map(norm);
      if (!items.length) pad.appendChild(el('div', { class: 'empty', text: S.empty }));
      else pad.appendChild(el('div', { class: 'section' }, el('h2', { text: S.stations }), el('div', { class: 'grid' }, items.map((i) => card(i, { sub: i.artist || S.radio })))));
    })();
  };

  function gridView(title, path, cardOpts) {
    return (node) => {
      head(title, node);
      const pad = el('div', { class: 'pad' }); node.appendChild(pad);
      const grid = el('div', { class: 'grid' }); pad.appendChild(grid);
      infinite(grid, path, (items) => { const f = document.createDocumentFragment(); items.forEach((i) => f.appendChild(card(i, cardOpts))); grid.appendChild(f); },
        () => pad.appendChild(el('div', { class: 'empty', text: S.empty })));
    };
  }
  ROUTES.recent = gridView(S.recent, lib('/recently-added?limit=25'));
  ROUTES.albums = gridView(S.albums, lib('/albums?limit=100'));
  ROUTES.artists = gridView(S.artists, lib('/artists?limit=100&include=catalog'), { sub: '', size: 280 });

  ROUTES.songs = (node) => {
    head(S.songs, node);
    const tl = trackList([], { ctx: 'library-songs' });
    node.appendChild(tl.node);
    infinite(tl.list, lib('/songs?limit=100&include=albums'), tl.add, () => tl.node.appendChild(el('div', { class: 'empty', text: S.empty })));
  };

  ROUTES.detail = (node, args) => {
    // Home / search show your own playlists by their catalog id (pl.u-…): open the library copy instead,
    // so its songs are library songs and the playlist can be edited (Remove from Playlist).
    if (!String(args.type || '').startsWith('library-') && String(args.id).startsWith('pl.')) {
      const own = myPlaylists.find((p) => ((p.raw && p.raw.attributes && p.raw.attributes.playParams) || {}).globalId === args.id);
      if (own) args = { ...args, id: own.id, type: own.type };
    }
    const isLib = String(args.type || '').startsWith('library-') || /^[lpi]\./.test(args.id);
    const kind = kindOf(args.type) || (args.id.startsWith('p.') || args.id.startsWith('pl.') ? 'playlist' : 'album');
    const base = isLib ? lib(`/${kind}s/${args.id}`) : cat(`/${kind}s/${args.id}`);
    const h = head('', node);
    const sp = spinner(); node.appendChild(sp);
    (async () => {
      let r;
      try { r = await api(base + (kind === 'album' ? '?include=tracks,artists' : '?include=tracks')); } catch (e) { sp.remove(); node.appendChild(el('div', { class: 'empty', text: S.error + e.message })); return; }
      sp.remove();
      const raw = (r.data || [])[0]; if (!raw) return;
      const it = norm(raw);
      h.querySelector('h1').textContent = '';
      const tr = rel(raw, 'tracks') || { data: [] };
      const tl = trackList([], { art: kind === 'playlist', album: kind === 'playlist', ctx: it, onChange: () => updFoot() });
      const artistRel = rel(raw, 'artists');
      const artistRef = artistRel && artistRel.data && artistRel.data[0];
      const total = it.count || (tr.data || []).length;
      const meta = [it.genre, it.date ? String(it.date).slice(0, 4) : ''].filter(Boolean).join(' · ');
      const a300 = artUrl(it.artwork, 300);
      // Dock: a big blurred copy of the cover behind the header AND the first rows, fading into the page (no hard edge)
      if (a300) {
        node.classList.add('m3');
        node.insertBefore(el('div', { class: 'pagebg', style: `--cover:url("${a300}")` }), node.firstChild);
      }
      const hero = el('div', { class: 'hero' },
        el('div', { class: 'art' }, a300 ? img(a300, 'ok') : placeholder(kind)),
        el('div', { class: 'info' },
          el('div', { class: 'kick', text: (kind === 'playlist' ? S.playlistK : S.albumK) + (it.date ? ' · ' + String(it.date).slice(0, 4) : '') }),
          el('h1', { text: it.name }),
          it.artist ? el('div', { class: 'by', text: it.artist, onclick: () => { if (artistRef) go('artist', { id: artistRef.id, type: artistRef.type, name: it.artist }); } }) : null,
          meta ? el('div', { class: 'meta', text: meta }) : el('div', { class: 'meta' }),
          it.desc ? el('div', { class: 'desc', text: stripHtml(it.desc) }) : null,
          el('div', { class: 'btns' },
            el('button', { class: 'btn', onclick: () => playList(tl.all, 0, it, false) }, icon('play'), S.play),
            el('button', { class: 'btn sec', onclick: () => playList(tl.all, 0, it, true) }, icon('shuffle'), S.shuffle),
            !it.lib ? el('button', { class: 'btn sec', onclick: () => addToLibrary(it) }, '+ ' + S.addLib) : null)));
      node.appendChild(hero);
      node.appendChild(tl.node);
      tl.add((tr.data || []).map(norm));
      const footer = el('div', { class: 'foot' });
      node.appendChild(footer);
      const updFoot = () => { const ms = tl.all.reduce((s, t) => s + (t.duration || 0), 0); footer.textContent = `${S.songsN(tl.all.length)}, ${Math.round(ms / 60000)}${S.min}`; };
      updFoot();
      if (tr.next) {
        const holder = el('div'); tl.list.after(holder);
        infinite(holder, tr.next, (items) => { tl.add(items); updFoot(); });
      }
      void total;
    })();
  };
  function stripHtml(s) { const d = document.createElement('template'); d.innerHTML = s; return d.content.textContent || ''; }

  ROUTES.artist = (node, args) => {
    head(args.name || '', node);
    const pad = el('div', { class: 'pad' }); node.appendChild(pad);
    const sp = spinner(); pad.appendChild(sp);
    const isLib = String(args.type || '').startsWith('library-') || args.id.startsWith('r.');
    (async () => {
      try {
        let catId = isLib ? null : args.id;
        if (isLib) {
          const albums = el('div', { class: 'grid' });
          pad.appendChild(el('div', { class: 'section' }, el('h2', { text: S.inLibrary }), albums));
          infinite(albums, lib(`/artists/${args.id}/albums?limit=100`), (items) => items.forEach((i) => albums.appendChild(card(i, { sub: i.date ? String(i.date).slice(0, 4) : '' }))));
          try { const c = await api(lib(`/artists/${args.id}/catalog`)); catId = c.data && c.data[0] && c.data[0].id; } catch (_) {}
        }
        if (catId) {
          const r = await api(cat(`/artists/${catId}?views=top-songs,full-albums,singles`));
          const a = r.data && r.data[0]; const v = (a && a.views) || {};
          const top = ((v['top-songs'] || {}).data || []).map(norm);
          if (top.length) {
            const tl = trackList([], { album: true, ctx: 'artist-top' });
            pad.appendChild(el('div', { class: 'section' }, el('h2', { text: S.topSongs })));
            tl.node.style.padding = '0'; pad.appendChild(tl.node); tl.add(top.slice(0, 10));
          }
          for (const [k, title] of [['full-albums', S.fullAlbums], ['singles', S.singles]]) {
            const items = ((v[k] || {}).data || []).map(norm);
            if (items.length) pad.appendChild(el('div', { class: 'section' }, el('h2', { text: title }), el('div', { class: 'grid' }, items.map((i) => card(i, { sub: i.date ? String(i.date).slice(0, 4) : '' })))));
          }
        }
      } catch (e) { pad.appendChild(el('div', { class: 'empty', text: S.error + e.message })); }
      sp.remove();
    })();
  };

  let searchScope = localStorage.getItem('lamp.scope') || 'catalog';
  ROUTES.search = (node, args) => {
    head(`${S.search}: „${args.q}”`, node);
    const chips = el('div', { class: 'chips' });
    const pad = el('div', { class: 'pad' });
    node.append(chips, pad);
    const mkChip = (scope, label) => el('button', { class: 'chip' + (searchScope === scope ? ' on' : ''), text: label, onclick: () => { searchScope = scope; localStorage.setItem('lamp.scope', scope); stack[stack.length - 1].node = null; show(stack[stack.length - 1], true); } });
    chips.append(mkChip('catalog', S.appleMusic), mkChip('library', S.inLibrary));
    const sp = spinner(); pad.appendChild(sp);
    (async () => {
      try {
        let res;
        if (searchScope === 'library') {
          const r = await api(lib('/search'), { params: { term: args.q, types: 'library-songs,library-albums,library-artists,library-playlists', limit: 25 } });
          const g = r.results || {};
          res = { songs: g['library-songs'], albums: g['library-albums'], artists: g['library-artists'], playlists: g['library-playlists'] };
        } else {
          const r = await api(cat('/search'), { params: { term: args.q, types: 'songs,albums,artists,playlists', limit: 20 } });
          res = r.results || {};
        }
        sp.remove();
        let any = false;
        const songs = ((res.songs || {}).data || []).map(norm);
        if (songs.length) { any = true; const tl = trackList([], { ctx: 'search' }); tl.node.style.padding = '0'; pad.appendChild(el('div', { class: 'section' }, el('h2', { text: S.songs }))); pad.appendChild(tl.node); tl.add(songs); }
        for (const [k, title] of [['artists', S.artists], ['albums', S.albums], ['playlists', S.playlists]]) {
          const items = ((res[k] || {}).data || []).map(norm);
          if (items.length) { any = true; pad.appendChild(el('div', { class: 'section' }, el('h2', { text: title }), el('div', { class: 'row' }, items.map((i) => card(i))))); }
        }
        if (!any) pad.appendChild(el('div', { class: 'empty', text: S.noResults }));
      } catch (e) { sp.remove(); pad.appendChild(el('div', { class: 'empty', text: S.error + e.message })); }
    })();
  };
  const qInput = $('#q');
  qInput.placeholder = S.search;
  const doSearch = debounce(() => {
    const q = qInput.value.trim();
    if (q.length < 2) return;
    const top = stack[stack.length - 1];
    if (top && top.route === 'search') { top.args.q = q; top.node = null; show(top, true); }
    else go('search', { q });
  }, 350);
  qInput.addEventListener('input', doSearch);
  qInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); if (e.key === 'Escape') qInput.blur(); });

  // ======================= playback =======================
  function queueKey(it) { return it.kind === 'album' ? 'album' : it.kind === 'playlist' ? 'playlist' : it.kind === 'station' ? 'station' : 'song'; }
  async function startQueue(opts, shuffle) {
    try {
      mk.shuffleMode = shuffle ? 1 : 0;
      await mk.setQueue(Object.assign({ startPlaying: true }, opts));
      if (!mk.isPlaying) await mk.play();
    } catch (e) { console.warn('setQueue', e); toast(S.playErr); throw e; }
  }
  async function playItem(it, shuffle) {
    nowPl = it.kind === 'playlist' ? it.id : null; markNav();
    if (!mk) return;
    try { await startQueue({ [queueKey(it)]: it.id }, !!shuffle); }
    catch (_) { if (it.catalogId && it.catalogId !== it.id) startQueue({ [queueKey(it)]: it.catalogId }, !!shuffle).catch(() => {}); }
  }
  async function playList(tracks, idx, ctx, shuffle) {
    if (!mk || !tracks.length) return;
    nowPl = ctx && typeof ctx === 'object' && ctx.kind === 'playlist' ? ctx.id : null; markNav();
    if (ctx && typeof ctx === 'object' && (ctx.kind === 'album' || ctx.kind === 'playlist')) {
      try { await startQueue({ [ctx.kind]: ctx.id, startWith: shuffle ? undefined : idx }, !!shuffle); return; } catch (_) { /* fall back to song list */ }
    }
    const from = Math.max(0, idx - 0);
    const ids = tracks.slice(from, from + 300).map((t) => t.id);
    try { await startQueue({ songs: ids }, !!shuffle); } catch (_) {}
  }
  function goAlbumOf(t) {
    const a = t.raw && rel(t.raw, 'albums');
    if (a && a.data && a.data[0]) go('detail', { id: a.data[0].id, type: a.data[0].type });
    else if (t.catalogId) api(cat(`/songs/${t.catalogId}`), { params: { include: 'albums' } }).then((r) => { const al = rel(r.data[0], 'albums'); if (al) go('detail', { id: al.data[0].id, type: 'albums' }); }).catch(() => {});
  }
  async function addToLibrary(it) {
    const id = it.catalogId || it.id;
    try { await api('/v1/me/library', { method: 'POST', params: { [`ids[${it.kind}s]`]: id } }); toast(S.added); } catch (e) { toast(S.error + e.message); }
  }
  // Not in Apple's public API docs; music.apple.com uses the same call. mode=all removes every copy of the song.
  async function removeFromPlaylist(t, pl, done) {
    try {
      await api(lib(`/playlists/${pl.id}/tracks`), { method: 'DELETE', params: { 'ids[library-songs]': t.id, mode: 'all' } });
      memo.clear(); done(); toast(S.removedFrom + pl.name);
    } catch (e) { toast(S.error + e.message); }
  }
  async function addToPlaylist(t, pl) {
    const data = [{ id: t.lib ? t.id : (t.catalogId || t.id), type: t.lib ? 'library-songs' : 'songs' }];
    try { await api(lib(`/playlists/${pl.id}/tracks`), { method: 'POST', body: { data } }); toast(S.addedTo + pl.name); memo.clear(); } catch (e) { toast(S.error + e.message); }
  }

  // ---- context menus ----
  const ctx = $('#ctx');
  function menu(e, items) {
    e.preventDefault();
    ctx.textContent = '';
    for (const it of items) {
      if (!it) continue;
      if (it === '-') { ctx.appendChild(el('hr')); continue; }
      if (it.sub) {
        ctx.appendChild(el('button', { text: it.label + ' ▸', onclick: (ev) => { ev.stopPropagation(); menu(e, [{ label: '← ' + it.label, back: true, onclick: () => menu(e, items) }, '-', ...it.sub]); } }));
        continue;
      }
      ctx.appendChild(el('button', { text: it.label, onclick: (ev) => { if (it.back) { ev.stopPropagation(); it.onclick(); return; } closeMenu(); it.onclick(); } }));
    }
    ctx.classList.add('open');
    const w = ctx.offsetWidth, h = ctx.offsetHeight;
    ctx.style.left = Math.min(e.clientX, innerWidth - w - 8) + 'px';
    ctx.style.top = Math.min(e.clientY, innerHeight - h - 8) + 'px';
  }
  function closeMenu() { ctx.classList.remove('open'); }
  document.addEventListener('click', (e) => { if (!ctx.contains(e.target)) closeMenu(); });
  window.addEventListener('blur', closeMenu);
  const copy = (u) => { navigator.clipboard.writeText(u).then(() => toast(S.copied)).catch(() => {}); };
  function trackMenu(e, t, remove) {
    const editable = myPlaylists.filter((p) => p.canEdit);
    menu(e, [
      { label: S.play, onclick: () => playItem(t) },
      { label: S.playNext, onclick: () => mk.playNext({ song: t.id }).then(() => toast(S.queued)).catch(() => toast(S.playErr)) },
      { label: S.playLater, onclick: () => mk.playLater({ song: t.id }).then(() => toast(S.queued)).catch(() => toast(S.playErr)) },
      '-',
      !t.lib && t.catalogId ? { label: S.addLib, onclick: () => addToLibrary(t) } : null,
      editable.length ? { label: S.addPl, sub: editable.map((p) => ({ label: p.name, onclick: () => addToPlaylist(t, p) })) } : null,
      remove ? { label: S.removePl, onclick: remove } : null,
      { label: S.goAlbum, onclick: () => goAlbumOf(t) },
      t.url ? { label: S.copyLink, onclick: () => copy(t.url) } : null
    ]);
  }
  function cardMenu(e, it) {
    const k = queueKey(it);
    menu(e, [
      { label: S.play, onclick: () => playItem(it) },
      it.kind !== 'station' ? { label: S.shuffle, onclick: () => playItem(it, true) } : null,
      it.kind !== 'station' ? { label: S.playNext, onclick: () => mk.playNext({ [k]: it.id }).then(() => toast(S.queued)).catch(() => toast(S.playErr)) } : null,
      it.kind !== 'station' ? { label: S.playLater, onclick: () => mk.playLater({ [k]: it.id }).then(() => toast(S.queued)).catch(() => toast(S.playErr)) } : null,
      !it.lib && it.kind !== 'station' && it.kind !== 'artist' ? '-' : null,
      !it.lib && it.kind !== 'station' && it.kind !== 'artist' ? { label: S.addLib, onclick: () => addToLibrary(it) } : null,
      it.url ? { label: S.copyLink, onclick: () => copy(it.url) } : null
    ].filter((x, i, arr) => x || false));
  }

  // ======================= player bar =======================
  const bar = $('#bar');
  const npArt = el('div', { class: 'art' });
  const npT1 = el('div', { class: 't1', text: S.nothing }), npT2 = el('div', { class: 't2' });
  const np = el('div', { class: 'np', title: S.cover, onclick: () => cover.open(true) }, npArt, el('div', { class: 'tt' }, npT1, npT2));
  const bShuf = el('button', { class: 'ib sm', title: S.shuffle, onclick: () => cmd('shuffle', !mk.shuffleMode) }, icon('shuffle'));
  const bPrev = el('button', { class: 'ib', title: S.prev, onclick: () => cmd('previous') }, icon('prev'));
  const bPlay = el('button', { class: 'ib big', title: S.play, onclick: () => cmd('toggle') }, icon('play'));
  const bNext = el('button', { class: 'ib', title: S.next, onclick: () => cmd('next') }, icon('next'));
  const repBadge = el('span', { class: 'badge', text: '1', style: 'display:none' });
  const bRep = el('button', { class: 'ib sm', title: S.repeat, onclick: () => cmd('repeat', ((mk.repeatMode | 0) + 1) % 3) }, icon('repeat'), repBadge);
  const seek = el('input', { type: 'range', min: 0, max: 1000, value: 0 });
  const tCur = el('span', { class: 'tm', text: '0:00' }), tDur = el('span', { class: 'tm', text: '0:00' });
  const vol = el('input', { type: 'range', min: 0, max: 100, value: Math.round((cfg.volume ?? 0.8) * 100), title: S.volume });
  const bMute = el('button', { class: 'ib', title: S.volume, onclick: () => { if (mk.volume > 0) { lastVol = mk.volume; cmd('volume', 0); } else cmd('volume', lastVol || 0.8); } }, icon('vol'));
  let lastVol = 0.8;
  const bLyr = el('button', { class: 'ib', title: S.lyrics, onclick: () => cover.open(true, true) }, icon('lyrics'));
  const bQueue = el('button', { class: 'ib', title: S.queue, onclick: () => queue.toggle() }, icon('queue'));
  const bCover = el('button', { class: 'ib', title: S.cover + ' (Ctrl+Shift+L)', onclick: () => cover.open(true) }, icon('expand'));
  bar.append(np,
    el('div', { class: 'mid' }, el('div', { class: 'ctrls' }, bShuf, bPrev, bPlay, bNext, bRep), el('div', { class: 'seek' }, tCur, seek, tDur)),
    el('div', { class: 'right' }, bLyr, bQueue, bCover, el('div', { class: 'vol' }, bMute, vol)));
  const setFill = (r) => r.style.setProperty('--p', (r.value / r.max * 100) + '%');
  let seeking = false;
  seek.addEventListener('input', () => { seeking = true; setFill(seek); tCur.textContent = fmt(seek.value / 1000 * (mk.currentPlaybackDuration || 0)); });
  seek.addEventListener('change', () => { cmd('seekTo', seek.value / 1000 * (mk.currentPlaybackDuration || 0)); seeking = false; });
  vol.addEventListener('input', () => { setFill(vol); cmd('volume', vol.value / 100); });
  setFill(vol);
  const setIcon = (b, n) => { const s = b.querySelector('svg'); s.replaceWith(icon(n)); };

  function cmd(name, arg) {
    if (name === 'cover') { cover.open(true); return; }
    if (name === 'theme') { document.body.classList.toggle('aurora', arg === 'aurora'); return; }
    if (name === 'layout') { document.body.classList.toggle('dock', arg === 'dock'); return; }
    if (name === 'accent') { setAccent(arg); return; }
    if (name === 'settings') { prefs.sync(arg); return; }
    if (!mk) return;
    try {
      switch (name) {
        case 'play': mk.play(); break;
        case 'pause': mk.pause(); break;
        case 'toggle': if (mk.isPlaying) mk.pause(); else if (mk.nowPlayingItem) mk.play(); break;
        case 'next': mk.skipToNextItem(); break;
        case 'previous': if (mk.currentPlaybackTime > 3) mk.seekToTime(0); else mk.skipToPreviousItem(); break;
        case 'seekTo': mk.seekToTime(Math.max(0, +arg || 0)); break;
        case 'volume': mk.volume = Math.max(0, Math.min(1, +arg)); window.lamp.setting('volume', mk.volume); break;
        case 'shuffle': mk.shuffleMode = arg ? 1 : 0; break;
        case 'repeat': mk.repeatMode = arg | 0; break;
        case 'signOut': mk.unauthorize && mk.unauthorize(); break;
      }
    } catch (e) { console.warn('cmd', name, e); }
    setTimeout(() => publish(true), 120);
  }
  window.lamp.onCommand(cmd);

  function nowInfo() {
    const it = mk && mk.nowPlayingItem;
    if (!it) return null;
    const a = it.attributes || {};
    const pp = a.playParams || {};
    return {
      id: String(it.id || pp.id || ''), catalogId: String(pp.catalogId || it.songId || ''), title: a.name || it.title || '', artist: a.artistName || it.artistName || '',
      album: a.albumName || it.albumName || '', artwork: a.artwork || it.artwork, durationMs: a.durationInMillis || (it.playbackDuration || 0),
      url: a.url || ''
    };
  }
  let lastPub = 0, curId = null;
  function publish(force) {
    const now = Date.now();
    if (!force && now - lastPub < 900) { updateTime(); return; }
    lastPub = now;
    const i = nowInfo();
    const status = mk && mk.isPlaying ? 'playing' : i ? 'paused' : 'stopped';
    const st = {
      status,
      meta: i ? { id: i.id, title: i.title, artist: i.artist, album: i.album, artUrl: artUrl(i.artwork, 300).replace('webp', 'jpg'), durationMs: i.durationMs, url: i.url } : null,
      position: mk ? mk.currentPlaybackTime || 0 : 0, duration: mk ? mk.currentPlaybackDuration || 0 : 0,
      volume: mk ? mk.volume : 1, shuffle: !!(mk && mk.shuffleMode), repeat: mk ? mk.repeatMode | 0 : 0
    };
    window.lamp.state(st);
    // bar
    if ((i && i.id) !== curId) {
      curId = i && i.id;
      npArt.textContent = '';
      if (i) { const src = artUrl(i.artwork, 60); npArt.appendChild(src ? img(src, 'ok') : placeholder('song')); }
      npT1.textContent = i ? i.title : S.nothing;
      npT2.textContent = '';
      if (i) npT2.append(el('span', { class: 'ar', text: i.artist }), i.album ? el('span', { class: 'al' }, el('span', { class: 'sep', text: i.artist ? ' — ' : '' }), i.album) : null);
      refreshNowMarks();
      if (queue.isOpen()) queue.render();
    }
    setIcon(bPlay, status === 'playing' ? 'pause' : 'play');
    document.body.classList.toggle('paused', status !== 'playing');
    bShuf.classList.toggle('on', st.shuffle);
    bRep.classList.toggle('on', st.repeat > 0); repBadge.style.display = st.repeat === 1 ? 'block' : 'none';
    if (document.activeElement !== vol) { vol.value = Math.round(st.volume * 100); setFill(vol); }
    setIcon(bMute, st.volume > 0 ? 'vol' : 'mute');
    updateTime();
    cover.update(i, st);
  }
  function updateTime() {
    if (!mk || seeking) return;
    const d = mk.currentPlaybackDuration || 0, p = mk.currentPlaybackTime || 0;
    seek.value = d ? Math.round(p / d * 1000) : 0; setFill(seek);
    tCur.textContent = fmt(p); tDur.textContent = d ? '-' + fmt(d - p) : '0:00';
  }
  function refreshNowMarks() {
    const i = nowInfo();
    view.querySelectorAll('.tr.now').forEach((r) => {
      r.classList.remove('now');
      const n = r.querySelector('.n'); const eq = n.querySelector('.eq'); if (eq) { eq.remove(); n.firstChild.style.display = ''; }
    });
    if (!i) return;
    const hit = (r) => (r.dataset.id && (r.dataset.id === i.id || r.dataset.id === i.catalogId)) || (r.dataset.cid && (r.dataset.cid === i.id || r.dataset.cid === i.catalogId));
    view.querySelectorAll('.tr').forEach((r) => {
      if (!hit(r)) return;
      r.classList.add('now');
      const n = r.querySelector('.n');
      if (n.firstChild && n.firstChild.tagName === 'SPAN') { n.firstChild.style.display = 'none'; n.insertBefore(el('span', { class: 'eq' }, el('i'), el('i'), el('i')), n.firstChild); }
    });
  }

  // ======================= queue drawer =======================
  const queue = (function () {
    const d = $('#queue');
    const list = el('div', { class: 'list' });
    d.append(el('h3', {}, el('span', { text: S.queue }), el('button', { class: 'ib', onclick: () => toggle(false) }, icon('close'))), list);
    let open = false;
    function toggle(v) { open = v === undefined ? !open : v; d.classList.toggle('open', open); bQueue.classList.toggle('on', open); if (open) render(); }
    function render() {
      list.textContent = '';
      const q = mk && mk.queue; if (!q) return;
      const items = q.items || []; const pos = q.position | 0;
      const from = Math.max(0, pos - 5);
      if (from < pos) list.appendChild(el('div', { class: 'qlabel', text: S.history }));
      for (let i = from; i < Math.min(items.length, pos + 150); i++) {
        if (i === pos + 1) list.appendChild(el('div', { class: 'qlabel', text: S.queue }));
        const it = items[i]; const a = it.attributes || {};
        const src = artUrl(a.artwork || it.artwork, 44);
        list.appendChild(el('div', { class: 'qi' + (i === pos ? ' cur' : '') + (i < pos ? ' past' : ''), onclick: () => { mk.changeToMediaAtIndex(i); } },
          src ? img(src, 'ok') : el('div', { style: 'width:40px;height:40px;border-radius:4px;overflow:hidden;flex:none' }, placeholder('song')),
          el('div', { class: 'tt' }, el('div', { class: 't1', text: a.name || it.title || '' }), el('div', { class: 't2', text: a.artistName || '' }))));
      }
      const cur = list.querySelector('.cur'); if (cur) cur.scrollIntoView({ block: 'center' });
    }
    return { toggle, render, isOpen: () => open };
  })();

  // ======================= cover view + lyrics =======================
  function parseTime(t) {
    if (!t) return NaN; t = t.trim();
    if (/s$/.test(t)) return parseFloat(t);
    let v = 0; for (const p of t.split(':').map(parseFloat)) v = v * 60 + p; return v;
  }
  function decodeEnt(s) {
    return s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }
  function parseTTML(ttml) {
    const synced = !/itunes:timing="None"/.test(ttml);
    const lines = []; const re = /<p\b([^>]*)>([\s\S]*?)<\/p>/g; let m;
    while ((m = re.exec(ttml))) {
      const b = /\bbegin="([^"]+)"/.exec(m[1]);
      let inner = m[2].replace(/<span[^>]*ttm:role="x-bg"[^>]*>[\s\S]*?<\/span>\s*<\/span>|<span[^>]*ttm:role="x-bg"[^>]*>[\s\S]*?<\/span>/g, '');
      inner = inner.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '');
      const text = decodeEnt(inner).replace(/\s+/g, ' ').trim();
      if (text) lines.push({ t: b ? parseTime(b[1]) : NaN, text });
    }
    return { synced: synced && lines.some((l) => !isNaN(l.t)), lines };
  }
  const lyricsCache = new Map();
  async function fetchLyrics(i) {
    const cid = i && i.catalogId && !/^[ilp]\./.test(i.catalogId) ? i.catalogId : (i && !/^[ilp]\./.test(i.id) ? i.id : null);
    if (!cid) return null;
    if (lyricsCache.has(cid)) return lyricsCache.get(cid);
    let res = null;
    for (const kind of ['lyrics', 'syllable-lyrics']) {
      try {
        const r = await api(cat(`/songs/${cid}/${kind}`));
        const ttml = r.data && r.data[0] && r.data[0].attributes && r.data[0].attributes.ttml;
        if (ttml) { res = parseTTML(ttml); if (res.lines.length) break; }
      } catch (_) {}
    }
    lyricsCache.set(cid, res); return res;
  }
  const cover = (function () {
    const root = $('#cover');
    const bg = el('div', { class: 'bg' }), tint = el('div', { class: 'tint' });
    const art = el('img', { class: 'cart', alt: '' });
    const title = el('div', { class: 'ctitle' }), sub = el('div', { class: 'csub' });
    const range = el('input', { type: 'range', min: 0, max: 1000, value: 0 });
    const cCur = el('span', { class: 'tm', text: '0:00' }), cDur = el('span', { class: 'tm', text: '0:00' });
    const cShuf = el('button', { class: 'ib sm', title: S.shuffle, onclick: () => cmd('shuffle', !mk.shuffleMode) }, icon('shuffle'));
    const cPlay = el('button', { class: 'ib big', onclick: () => cmd('toggle') }, icon('play'));
    const cRepB = el('span', { class: 'badge', text: '1', style: 'display:none' });
    const cRep = el('button', { class: 'ib sm', title: S.repeat, onclick: () => cmd('repeat', ((mk.repeatMode | 0) + 1) % 3) }, icon('repeat'), cRepB);
    const cVol = el('input', { type: 'range', min: 0, max: 100, value: 80 });
    const bL = el('button', { class: 'top', title: S.lyrics, onclick: () => toggleLyrics() }, icon('lyrics'));
    const bX = el('button', { class: 'top', title: S.close, onclick: () => open(false) }, icon('close'));
    const lyrBox = el('div', { class: 'lyrics' }), lyrInner = el('div', { class: 'lyrinner' }); lyrBox.appendChild(lyrInner);
    const stage = el('div', { class: 'stage' },
      el('div', { class: 'left' }, art, el('div', {}, title, sub), el('div', { class: 'seek' }, cCur, range, cDur),
        el('div', { class: 'ctrls' }, cShuf, el('button', { class: 'ib', onclick: () => cmd('previous') }, icon('prev')), cPlay, el('button', { class: 'ib', onclick: () => cmd('next') }, icon('next')), cRep),
        el('div', { class: 'vol' }, icon('vol'), cVol)),
      lyrBox);
    root.append(bg, tint, el('div', { class: 'topbar' }, bL, bX), stage);
    let isOpen = false, showLyr = localStorage.getItem('lamp.lyrics') !== '0', seekingC = false, lyrId = null, lyr = null, active = -1, raf = 0, info = null;
    range.addEventListener('input', () => { seekingC = true; setFill(range); });
    range.addEventListener('change', () => { cmd('seekTo', range.value / 1000 * (mk.currentPlaybackDuration || 0)); seekingC = false; });
    cVol.addEventListener('input', () => { setFill(cVol); cmd('volume', cVol.value / 100); });
    function open(v, lyricsOn) {
      isOpen = v; root.classList.toggle('open', v);
      if (lyricsOn && !showLyr) toggleLyrics();
      if (v) { lyrId = null; publish(true); tick(); } else cancelAnimationFrame(raf);
    }
    function toggleLyrics() {
      showLyr = !showLyr; localStorage.setItem('lamp.lyrics', showLyr ? '1' : '0');
      stage.classList.toggle('withlyr', showLyr); bL.classList.toggle('on', showLyr);
      if (showLyr) { lyrId = null; loadLyrics(); }
    }
    stage.classList.toggle('withlyr', showLyr); bL.classList.toggle('on', showLyr);
    function renderLyrics(state) {
      lyrInner.textContent = ''; active = -1;
      if (state === 'loading') { lyrInner.appendChild(el('div', { class: 'msg', text: S.loadingLyrics })); return; }
      if (!lyr || !lyr.lines.length) { lyrInner.appendChild(el('div', { class: 'msg', text: S.noLyrics })); return; }
      lyrBox.classList.toggle('unsynced', !lyr.synced);
      for (const ln of lyr.lines) {
        const d = el('div', { class: 'line', text: ln.text });
        if (lyr.synced && !isNaN(ln.t)) d.addEventListener('click', () => cmd('seekTo', ln.t + 0.01));
        ln.node = d; lyrInner.appendChild(d);
      }
      lyrBox.scrollTop = 0;
    }
    async function loadLyrics() {
      if (!isOpen || !showLyr) return;
      const id = info && info.id;
      if (id === lyrId) return;
      lyrId = id;
      if (!info) { lyr = null; renderLyrics(); return; }
      renderLyrics('loading');
      const r = await fetchLyrics(info);
      if (lyrId !== id) return;
      lyr = r; renderLyrics();
    }
    function tick() {
      cancelAnimationFrame(raf);
      const f = () => {
        if (!isOpen) return;
        if (mk && !seekingC) {
          const d = mk.currentPlaybackDuration || 0, p = mk.currentPlaybackTime || 0;
          range.value = d ? Math.round(p / d * 1000) : 0; setFill(range);
          cCur.textContent = fmt(p); cDur.textContent = '-' + fmt(Math.max(0, d - p));
        }
        if (lyr && lyr.synced && showLyr && mk) {
          const t = (mk.currentPlaybackTime || 0) + 0.25; let idx = -1;
          for (let i = 0; i < lyr.lines.length; i++) { if (lyr.lines[i].t <= t) idx = i; else if (lyr.lines[i].t > t) break; }
          if (idx !== active) {
            if (active >= 0 && lyr.lines[active]) lyr.lines[active].node.classList.remove('active');
            active = idx;
            const n = idx >= 0 && lyr.lines[idx].node;
            if (n) { n.classList.add('active'); lyrBox.scrollTo({ top: n.offsetTop - lyrBox.clientHeight * 0.38, behavior: 'smooth' }); }
          }
        }
        raf = requestAnimationFrame(f);
      };
      raf = requestAnimationFrame(f);
    }
    function update(i, st) {
      info = i;
      if (!isOpen) return;
      const big = i ? artUrl(i.artwork, 900) : '';
      if (art.dataset.src !== big) { art.dataset.src = big; if (big) art.src = big; else art.removeAttribute('src'); bg.style.backgroundImage = i ? `url("${artUrl(i.artwork, 300)}")` : 'none'; }
      title.textContent = i ? i.title : S.nothing; sub.textContent = i ? [i.artist, i.album].filter(Boolean).join(' — ') : '';
      setIcon(cPlay, st.status === 'playing' ? 'pause' : 'play');
      cShuf.classList.toggle('on', st.shuffle); cRep.classList.toggle('on', st.repeat > 0); cRepB.style.display = st.repeat === 1 ? 'block' : 'none';
      if (document.activeElement !== cVol) { cVol.value = Math.round(st.volume * 100); setFill(cVol); }
      loadLyrics();
    }
    return { open, update, isOpen: () => isOpen };
  })();

  // ======================= keyboard =======================
  document.addEventListener('keydown', (e) => {
    const typing = e.target && /INPUT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range';
    if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) { e.preventDefault(); cover.open(!cover.isOpen()); }
    else if (e.key === 'Escape') { if (cover.isOpen()) cover.open(false); else if (queue.isOpen()) queue.toggle(false); closeMenu(); }
    else if (e.ctrlKey && (e.key === 'f' || e.key === 'k')) { e.preventDefault(); qInput.focus(); qInput.select(); }
    else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    else if (!typing && e.key === ' ') { e.preventDefault(); cmd('toggle'); }
    else if (!typing && e.ctrlKey && e.key === 'ArrowRight') { e.preventDefault(); cmd('next'); }
    else if (!typing && e.ctrlKey && e.key === 'ArrowLeft') { e.preventDefault(); cmd('previous'); }
    else if (e.ctrlKey && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); memo.clear(); window.lamp.reload(); }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 3) back(); });

  // ======================= boot =======================
  const loginBox = $('#login');
  function showLogin(errText) {
    loginBox.textContent = '';
    const box = el('div', { class: 'lbox' },
      $('.brand .light-only').cloneNode(), $('.brand .dark-only').cloneNode(),
      el('h1', { text: S.signInTitle }), el('p', { text: S.signInText }));
    if (errText) {
      box.append(el('button', { class: 'btn', onclick: () => window.lamp.reload() }, S.retry), el('div', { class: 'err', text: errText }));
    } else {
      box.append(el('button', { class: 'btn', onclick: async () => {
        try { await mk.authorize(); } catch (e) { console.warn('authorize', e); }
        if (mk.isAuthorized) { loginBox.classList.remove('open'); afterLogin(); }
      } }, S.signIn));
    }
    loginBox.appendChild(box); loginBox.classList.add('open');
  }
  async function afterLogin() {
    sf = mk.storefrontId || mk.storefrontCountryCode || sf;
    try { if (!mk.storefrontId) { const r = await api('/v1/me/storefront'); sf = (r.data && r.data[0] && r.data[0].id) || sf; } } catch (_) {}
    loadPlaylists();
    loadCounts();
    go(localStorage.getItem('lamp.start') || 'home', {}, { root: true });
  }

  try {
    const tk = await window.lamp.token(false);
    if (!tk.token) { showLogin(S.tokenErr + (tk.error ? '\n\n' + tk.error : '')); return; }
    devToken = tk.token;
    await loadMusicKit();
    const MK = window.MusicKit;
    await MK.configure({ developerToken: devToken, app: { name: 'Apple Music', build: '2025.1.0' }, bitrate: (MK.PlaybackBitrate && MK.PlaybackBitrate.HIGH) || 256, suppressErrorDialog: true });
    mk = MK.getInstance();
    try { mk.volume = cfg.volume ?? 0.8; } catch (_) {}
    const E = MK.Events || {};
    for (const n of ['playbackStateDidChange', 'nowPlayingItemDidChange', 'playbackDurationDidChange', 'shuffleModeDidChange', 'repeatModeDidChange', 'playbackVolumeDidChange']) mk.addEventListener(E[n] || n, () => publish(true));
    mk.addEventListener(E.playbackTimeDidChange || 'playbackTimeDidChange', () => publish(false));
    for (const n of ['queueItemsDidChange', 'queuePositionDidChange']) mk.addEventListener(E[n] || n, () => { if (queue.isOpen()) queue.render(); });
    mk.addEventListener(E.mediaPlaybackError || 'mediaPlaybackError', (e) => { console.warn('playback error', e); toast(S.playErr); });
    mk.addEventListener(E.authorizationStatusDidChange || 'authorizationStatusDidChange', () => { if (!mk.isAuthorized) showLogin(); });
    if (!mk.isAuthorized) showLogin(); else afterLogin();
    publish(true);
  } catch (e) {
    console.error(e);
    showLogin(S.error + (e && e.message || e));
  }
})();

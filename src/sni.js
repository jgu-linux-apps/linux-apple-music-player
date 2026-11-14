'use strict';
/* Own tray icon: StatusNotifierItem + com.canonical.dbusmenu over D-Bus.
   Electron's built-in Linux tray hands the panel a temp-file icon that GNOME's AppIndicator
   extension often cannot load (shows "⋯"). Here the icon is sent as pixels (IconPixmap) and as a
   themed name, and menu items can carry images (album cover). */
const dbus = require('dbus-next');
const { Interface, ACCESS_READ } = dbus.interface;
const { Variant } = dbus;

const ITEM_PATH = '/StatusNotifierItem';
const MENU_PATH = '/MenuBar';

function createSni({ id, title, onActivate, onScroll }) {
  let bus = null, busName = null, registered = false;
  const st = {
    iconName: '', iconThemePath: '', pixmaps: [], tooltip: title,
    rev: 1, items: [] // flat list: { id, label, enabled, type, checked, icon(Buffer PNG), click }
  };

  // ---------------- StatusNotifierItem ----------------
  class Item extends Interface {
    get Category() { return 'ApplicationStatus'; }
    get Id() { return id; }
    get Title() { return title; }
    get Status() { return 'Active'; }
    get WindowId() { return 0; }
    get IconThemePath() { return st.iconThemePath; }
    get IconName() { return st.iconName; }
    get IconPixmap() { return st.pixmaps; }
    get OverlayIconName() { return ''; }
    get OverlayIconPixmap() { return []; }
    get AttentionIconName() { return ''; }
    get AttentionIconPixmap() { return []; }
    get AttentionMovieName() { return ''; }
    get ToolTip() { return ['', [], st.tooltip, '']; }
    get ItemIsMenu() { return false; }
    get Menu() { return MENU_PATH; }
    ContextMenu(_x, _y) {}
    Activate(_x, _y) { onActivate && onActivate(); }
    SecondaryActivate(_x, _y) { onActivate && onActivate(); }
    Scroll(delta, orientation) { onScroll && onScroll(delta, orientation); }
    NewIcon() {}
    NewToolTip() {}
    NewTitle() {}
    NewStatus(s) { return s; }
  }
  Item.configureMembers({
    properties: {
      Category: { signature: 's', access: ACCESS_READ },
      Id: { signature: 's', access: ACCESS_READ },
      Title: { signature: 's', access: ACCESS_READ },
      Status: { signature: 's', access: ACCESS_READ },
      WindowId: { signature: 'i', access: ACCESS_READ },
      IconThemePath: { signature: 's', access: ACCESS_READ },
      IconName: { signature: 's', access: ACCESS_READ },
      IconPixmap: { signature: 'a(iiay)', access: ACCESS_READ },
      OverlayIconName: { signature: 's', access: ACCESS_READ },
      OverlayIconPixmap: { signature: 'a(iiay)', access: ACCESS_READ },
      AttentionIconName: { signature: 's', access: ACCESS_READ },
      AttentionIconPixmap: { signature: 'a(iiay)', access: ACCESS_READ },
      AttentionMovieName: { signature: 's', access: ACCESS_READ },
      ToolTip: { signature: '(sa(iiay)ss)', access: ACCESS_READ },
      ItemIsMenu: { signature: 'b', access: ACCESS_READ },
      Menu: { signature: 'o', access: ACCESS_READ }
    },
    methods: {
      ContextMenu: { inSignature: 'ii' }, Activate: { inSignature: 'ii' },
      SecondaryActivate: { inSignature: 'ii' }, Scroll: { inSignature: 'is' }
    },
    signals: { NewIcon: { signature: '' }, NewToolTip: { signature: '' }, NewTitle: { signature: '' }, NewStatus: { signature: 's' } }
  });

  // ---------------- dbusmenu ----------------
  // All properties are always sent explicitly (no reliance on defaults), so updates can be diffed.
  function props(it) {
    const p = {};
    if (it.type === 'separator') { p.type = new Variant('s', 'separator'); return p; }
    p.label = new Variant('s', String(it.label || '').replace(/_/g, '__'));
    p.enabled = new Variant('b', it.enabled !== false);
    p.visible = new Variant('b', true);
    if (it.type === 'checkbox' || it.type === 'radio') {
      p['toggle-type'] = new Variant('s', it.type === 'radio' ? 'radio' : 'checkmark');
      p['toggle-state'] = new Variant('i', it.checked ? 1 : 0);
    }
    if (it.icon) p['icon-data'] = new Variant('ay', it.icon);
    return p;
  }
  function sig(it) {
    return JSON.stringify([it.type || 'standard', it.label || '', it.enabled !== false, !!it.checked, it.icon ? it.icon.length + ':' + it.icon.subarray(0, 64).toString('base64') + it.icon.subarray(-64).toString('base64') : '']);
  }
  function filter(p, names) {
    if (!names || !names.length) return p;
    const o = {}; for (const n of names) if (n in p) o[n] = p[n]; return o;
  }
  function node(it, names) { return new Variant('(ia{sv}av)', [it.id, filter(props(it), names), []]); }
  function layout(parent, names) {
    if (parent !== 0) {
      const it = st.items.find((x) => x.id === parent);
      return it ? [it.id, filter(props(it), names), []] : [parent, {}, []];
    }
    return [0, { 'children-display': new Variant('s', 'submenu') }, st.items.map((it) => node(it, names))];
  }

  class Menu extends Interface {
    get Version() { return 4; }
    get TextDirection() { return 'ltr'; }
    get Status() { return 'normal'; }
    get IconThemePath() { return []; }
    GetLayout(parentId, _depth, names) { return [st.rev, layout(parentId, names)]; }
    GetGroupProperties(ids, names) {
      const list = ids && ids.length ? st.items.filter((x) => ids.includes(x.id)) : st.items;
      return list.map((it) => [it.id, filter(props(it), names)]);
    }
    GetProperty(itemId, name) {
      const it = st.items.find((x) => x.id === itemId);
      const p = it ? props(it) : {};
      return p[name] || new Variant('s', '');
    }
    Event(itemId, eventId, _data, _ts) {
      if (eventId !== 'clicked') return;
      const it = st.items.find((x) => x.id === itemId);
      if (it && it.click && it.enabled !== false) setImmediate(() => { try { it.click(it); } catch (e) { console.warn('[tray] click', e); } });
    }
    EventGroup(events) { for (const [i, e, d, t] of events) this.Event(i, e, d, t); return []; }
    AboutToShow(_id) { return false; }
    AboutToShowGroup(_ids) { return [[], []]; }
    LayoutUpdated(rev, parent) { return [rev, parent]; }
    ItemsPropertiesUpdated(a, b) { return [a, b]; }
    ItemActivationRequested(i, t) { return [i, t]; }
  }
  Menu.configureMembers({
    properties: {
      Version: { signature: 'u', access: ACCESS_READ },
      TextDirection: { signature: 's', access: ACCESS_READ },
      Status: { signature: 's', access: ACCESS_READ },
      IconThemePath: { signature: 'as', access: ACCESS_READ }
    },
    methods: {
      GetLayout: { inSignature: 'iias', outSignature: 'u(ia{sv}av)' },
      GetGroupProperties: { inSignature: 'aias', outSignature: 'a(ia{sv})' },
      GetProperty: { inSignature: 'is', outSignature: 'v' },
      Event: { inSignature: 'isvu' },
      EventGroup: { inSignature: 'a(isvu)', outSignature: 'ai' },
      AboutToShow: { inSignature: 'i', outSignature: 'b' },
      AboutToShowGroup: { inSignature: 'ai', outSignature: 'aiai' }
    },
    signals: {
      LayoutUpdated: { signature: 'ui' },
      ItemsPropertiesUpdated: { signature: 'a(ia{sv})a(ias)' },
      ItemActivationRequested: { signature: 'iu' }
    }
  });

  const item = new Item('org.kde.StatusNotifierItem');
  const menu = new Menu('com.canonical.dbusmenu');

  async function register() {
    try {
      const obj = await bus.getProxyObject('org.kde.StatusNotifierWatcher', '/StatusNotifierWatcher');
      const w = obj.getInterface('org.kde.StatusNotifierWatcher');
      await w.RegisterStatusNotifierItem(busName);
      registered = true;
      return true;
    } catch (_) { registered = false; return false; }
  }

  // Returns true when a tray host (e.g. GNOME AppIndicator extension) is present.
  async function start() {
    bus = dbus.sessionBus();
    bus.on('error', (e) => console.warn('[tray] bus error', e && e.message));
    busName = `org.kde.StatusNotifierItem-${process.pid}-1`;
    await bus.requestName(busName, 0);
    bus.export(ITEM_PATH, item);
    bus.export(MENU_PATH, menu);
    if (pending) flush();
    const ok = await register();
    // Re-register when the panel/extension restarts.
    try {
      const dobj = await bus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus');
      const d = dobj.getInterface('org.freedesktop.DBus');
      d.on('NameOwnerChanged', (name, _old, neu) => { if (name === 'org.kde.StatusNotifierWatcher' && neu) setTimeout(register, 300); });
    } catch (_) {}
    return ok;
  }

  // pixmaps: [{ w, h, argb: Buffer }]
  function setIcon({ name, themePath, pixmaps }) {
    st.iconName = name || '';
    st.iconThemePath = themePath || '';
    st.pixmaps = (pixmaps || []).map((p) => [p.w, p.h, p.argb]);
    if (bus) { try { item.NewIcon(); } catch (_) {} }
  }
  function setTooltip(t) {
    st.tooltip = t || title;
    if (bus) { try { item.NewToolTip(); } catch (_) {} }
  }
  // Layout (structure) changes -> LayoutUpdated; label/state/icon changes -> ItemsPropertiesUpdated.
  // GNOME's AppIndicator extension cancels pending property fetches when LayoutUpdated signals
  // arrive in bursts, which leaves every item blank — so structure changes are rare and debounced.
  let pending = null, flushT = null;
  function structure(list) { return list.map((t) => (t.type === 'separator' ? '-' : t.type === 'checkbox' ? 'c' : t.type === 'radio' ? 'r' : 'i')).join(''); }
  function flush() {
    flushT = null;
    const next = pending; pending = null;
    if (!next) return;
    const items = next.map((t, i) => Object.assign({}, t, { id: i + 1 }));
    const sameShape = structure(items) === structure(st.items);
    const oldSig = new Map(st.items.map((it) => [it.id, sig(it)]));
    const oldHadIcon = new Map(st.items.map((it) => [it.id, !!it.icon]));
    st.items = items;
    if (!bus) return;
    if (!sameShape) {
      st.rev++;
      try { menu.LayoutUpdated(st.rev, 0); } catch (_) {}
      return;
    }
    const changed = [], removed = [];
    for (const it of items) {
      if (oldSig.get(it.id) === sig(it)) continue;
      changed.push([it.id, props(it)]);
      const gone = [];
      if (oldHadIcon.get(it.id) && !it.icon) gone.push('icon-data');
      if (gone.length) removed.push([it.id, gone]);
    }
    if (changed.length || removed.length) { try { menu.ItemsPropertiesUpdated(changed, removed); } catch (e) { console.warn('[tray] props', e && e.message); } }
  }
  function setMenu(template, immediate) {
    pending = template;
    if (immediate || !bus) { clearTimeout(flushT); flush(); return; }
    if (!flushT) flushT = setTimeout(flush, 120);
  }
  function stop() { try { bus && bus.disconnect(); } catch (_) {} }

  return { start, setIcon, setTooltip, setMenu, stop, isRegistered: () => registered };
}

module.exports = { createSni };

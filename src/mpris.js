'use strict';
// Minimal, self-contained MPRIS2 implementation (GNOME media controls, media keys, playerctl).
const dbus = require('dbus-next');
const { Interface, ACCESS_READ, ACCESS_READWRITE } = dbus.interface;
const { Variant } = dbus;

const OBJ = '/org/mpris/MediaPlayer2';
const NO_TRACK = '/org/mpris/MediaPlayer2/TrackList/NoTrack';

function createMpris({ identity, desktopEntry, onCommand }) {
  const state = {
    status: 'Stopped',
    meta: null, // {id,title,artist,album,artUrl,durationMs}
    positionUs: 0,
    volume: 1,
    shuffle: false,
    loop: 'None'
  };

  class Root extends Interface {
    get CanQuit() { return true; }
    get CanRaise() { return true; }
    get HasTrackList() { return false; }
    get Identity() { return identity; }
    get DesktopEntry() { return desktopEntry; }
    get SupportedUriSchemes() { return []; }
    get SupportedMimeTypes() { return []; }
    get Fullscreen() { return false; }
    set Fullscreen(_v) {}
    get CanSetFullscreen() { return false; }
    Raise() { onCommand('raise'); }
    Quit() { onCommand('quit'); }
  }
  Root.configureMembers({
    properties: {
      CanQuit: { signature: 'b', access: ACCESS_READ },
      CanRaise: { signature: 'b', access: ACCESS_READ },
      HasTrackList: { signature: 'b', access: ACCESS_READ },
      Identity: { signature: 's', access: ACCESS_READ },
      DesktopEntry: { signature: 's', access: ACCESS_READ },
      SupportedUriSchemes: { signature: 'as', access: ACCESS_READ },
      SupportedMimeTypes: { signature: 'as', access: ACCESS_READ },
      Fullscreen: { signature: 'b', access: ACCESS_READWRITE },
      CanSetFullscreen: { signature: 'b', access: ACCESS_READ }
    },
    methods: { Raise: {}, Quit: {} }
  });

  function trackId() {
    if (!state.meta || !state.meta.id) return NO_TRACK;
    return '/org/mpris/MediaPlayer2/track/t' + String(state.meta.id).replace(/[^A-Za-z0-9_]/g, '_');
  }

  function metadata() {
    const m = { 'mpris:trackid': new Variant('o', trackId()) };
    if (!state.meta) return m;
    const s = state.meta;
    if (s.title) m['xesam:title'] = new Variant('s', s.title);
    if (s.artist) m['xesam:artist'] = new Variant('as', [s.artist]);
    if (s.album) m['xesam:album'] = new Variant('s', s.album);
    if (s.artUrl) m['mpris:artUrl'] = new Variant('s', s.artUrl);
    if (s.durationMs) m['mpris:length'] = new Variant('x', BigInt(Math.round(s.durationMs * 1000)));
    if (s.url) m['xesam:url'] = new Variant('s', s.url);
    return m;
  }

  class Player extends Interface {
    get PlaybackStatus() { return state.status; }
    get LoopStatus() { return state.loop; }
    set LoopStatus(v) { onCommand('loop', v); }
    get Rate() { return 1.0; }
    set Rate(_v) {}
    get Shuffle() { return state.shuffle; }
    set Shuffle(v) { onCommand('shuffle', !!v); }
    get Metadata() { return metadata(); }
    get Volume() { return state.volume; }
    set Volume(v) { onCommand('volume', Math.max(0, Math.min(1, v))); }
    get Position() { return BigInt(Math.max(0, Math.round(state.positionUs))); }
    get MinimumRate() { return 1.0; }
    get MaximumRate() { return 1.0; }
    get CanGoNext() { return true; }
    get CanGoPrevious() { return true; }
    get CanPlay() { return true; }
    get CanPause() { return true; }
    get CanSeek() { return !!(state.meta && state.meta.durationMs); }
    get CanControl() { return true; }
    Next() { onCommand('next'); }
    Previous() { onCommand('previous'); }
    Pause() { onCommand('pause'); }
    PlayPause() { onCommand('toggle'); }
    Stop() { onCommand('pause'); }
    Play() { onCommand('play'); }
    Seek(offsetUs) { onCommand('seekBy', Number(offsetUs) / 1e6); }
    SetPosition(id, posUs) { if (id === trackId()) onCommand('seekTo', Number(posUs) / 1e6); }
    OpenUri(_u) {}
    Seeked(pos) { return pos; }
  }
  Player.configureMembers({
    properties: {
      PlaybackStatus: { signature: 's', access: ACCESS_READ },
      LoopStatus: { signature: 's', access: ACCESS_READWRITE },
      Rate: { signature: 'd', access: ACCESS_READWRITE },
      Shuffle: { signature: 'b', access: ACCESS_READWRITE },
      Metadata: { signature: 'a{sv}', access: ACCESS_READ },
      Volume: { signature: 'd', access: ACCESS_READWRITE },
      Position: { signature: 'x', access: ACCESS_READ },
      MinimumRate: { signature: 'd', access: ACCESS_READ },
      MaximumRate: { signature: 'd', access: ACCESS_READ },
      CanGoNext: { signature: 'b', access: ACCESS_READ },
      CanGoPrevious: { signature: 'b', access: ACCESS_READ },
      CanPlay: { signature: 'b', access: ACCESS_READ },
      CanPause: { signature: 'b', access: ACCESS_READ },
      CanSeek: { signature: 'b', access: ACCESS_READ },
      CanControl: { signature: 'b', access: ACCESS_READ }
    },
    methods: {
      Next: {}, Previous: {}, Pause: {}, PlayPause: {}, Stop: {}, Play: {},
      Seek: { inSignature: 'x' },
      SetPosition: { inSignature: 'ox' },
      OpenUri: { inSignature: 's' }
    },
    signals: { Seeked: { signature: 'x' } }
  });

  const root = new Root('org.mpris.MediaPlayer2');
  const player = new Player('org.mpris.MediaPlayer2.Player');
  let bus = null;

  async function start() {
    bus = dbus.sessionBus();
    bus.on('error', (e) => console.warn('[mpris] bus error', e && e.message));
    bus.export(OBJ, root);
    bus.export(OBJ, player);
    await bus.requestName('org.mpris.MediaPlayer2.linux_apple_music_player', 0);
  }

  function update(next) {
    const changed = {};
    if (next.status && next.status !== state.status) { state.status = next.status; changed.PlaybackStatus = state.status; }
    if ('meta' in next) {
      const a = JSON.stringify(state.meta), b = JSON.stringify(next.meta);
      if (a !== b) { state.meta = next.meta; changed.Metadata = metadata(); changed.CanSeek = player.CanSeek; }
    }
    if (typeof next.volume === 'number' && Math.abs(next.volume - state.volume) > 0.001) { state.volume = next.volume; changed.Volume = state.volume; }
    if (typeof next.shuffle === 'boolean' && next.shuffle !== state.shuffle) { state.shuffle = next.shuffle; changed.Shuffle = state.shuffle; }
    if (next.loop && next.loop !== state.loop) { state.loop = next.loop; changed.LoopStatus = state.loop; }
    if (typeof next.positionS === 'number') {
      const us = next.positionS * 1e6;
      const expected = state.positionUs + (next.elapsedS || 0) * 1e6;
      const jumped = Math.abs(us - expected) > 2.5e6;
      state.positionUs = us;
      if (jumped && bus) { try { player.Seeked(BigInt(Math.round(us))); } catch (_) {} }
    }
    if (Object.keys(changed).length && bus) {
      try { Interface.emitPropertiesChanged(player, changed, []); } catch (e) { console.warn('[mpris] emit', e.message); }
    }
  }

  function stop() { try { bus && bus.disconnect(); } catch (_) {} }

  return { start, update, stop };
}

module.exports = { createMpris };

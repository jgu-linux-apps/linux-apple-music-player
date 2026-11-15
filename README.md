# Linux Apple Music Player

**Version 0.3.3 — 2026-11-14**

A fast, lightweight Apple Music player for Ubuntu. It has its own interface built directly on the Apple Music API; Apple's heavy web player is not loaded. Audio plays through Apple's MusicKit with Widevine, so full-length songs work with your subscription.

## Features

- Own lightweight UI, styled like Apple Music for Windows: sidebar, content area and player bar
- Two themes (Settings or tray menu → Theme): **System**, which uses your Ubuntu accent colour, and **Aurora**, the shared look of the JGu Linux Apps series; both follow light/dark
- Two layouts (Settings or tray menu → Layout): **Dock** (default) – bigger text, a large player at the bottom with the cover, title and artist, progress along its whole width, a sidebar with groups that fold, counts and playlist folders, album headers on a blurred cover; **Classic** – the look before 0.3
- Sign in with your Apple ID (Apple Music subscription required)
- Home: recently played, heavy rotation and recommendations
- Radio: your personal station and Apple Music live radio
- Library: recently added, artists, albums, songs (infinite scroll) and your playlists in the sidebar
- Album, playlist and artist pages (top songs, albums, singles)
- Search in Apple Music or in your library (Ctrl+F)
- Right-click menu: play next, play later, add to library, add to playlist, go to album, copy link
- Queue panel with history; click a song to jump to it
- Cover view: large artwork, blurred background, all controls (Ctrl+Shift+L or click the song in the player bar)
- Synced lyrics in the cover view; click a line to jump to it
- Keyboard: Space play/pause, Ctrl+←/→ previous/next, Alt+← back, Esc closes panels
- Tray icon in the app's own style, light or dark following the system theme
- Tray menu with the current song and a small album cover, play/pause, next, previous
- Mouse wheel over the tray icon changes the volume
- Closing the window hides it to the tray; quit from the tray menu
- Ubuntu media controls (MPRIS): song, cover and controls in the top-bar menu and lock screen
- Media keys and `playerctl` work
- Optional notification for every new song, with cover (toggle in Settings or the tray menu)
- Light/dark theme follows the system; app and tray icons switch with it
- Dock right-click actions: Play/Pause, Next, Previous
- Polish UI when the system language is Polish, English otherwise
- Volume, window size and position are remembered; single instance
- Launching from a terminal detaches, so closing the terminal does not close the player

## Install

Download the newest `linux-apple-music-player_<version>_amd64.deb` from the [Releases page](https://github.com/jgu-linux-apps/linux-apple-music-player/releases/latest), then:

```bash
cd ~/Downloads
sudo apt install ./linux-apple-music-player_<version>_amd64.deb
```

Start **Linux Apple Music Player** from the app grid and sign in with your Apple ID.
The first launch downloads the Widevine DRM module from Google (a few seconds).

## Uninstall

```bash
sudo apt remove linux-apple-music-player
rm -rf ~/.config/linux-apple-music-player ~/.cache/linux-apple-music-player
rm -f ~/.local/share/icons/hicolor/*/apps/linux-apple-music-player.png
```

## Source code

The source code is in the `src/` folder of this repository; the `.deb` packages are not kept in git but
attached to [GitHub Releases](https://github.com/jgu-linux-apps/linux-apple-music-player/releases). `src/build.sh` is the packaging script used for the releases; it expects a
downloaded Electron runtime and the generated PNG icons, so it is not a one-step build on another machine.

## Note

The app uses the public access key of Apple's own web player, as other third-party Apple Music clients do. This is not an official Apple API key; if Apple changes it, the app fetches the new one automatically, but Apple could block such use at any time.

## Version history

- **0.3.6**:
  - Album and playlist pages: a large blurred copy of the cover reaches under the first songs and fades softly into the page, with no hard edge under the header. The column header (Title / Artist / Album / Time) is a sheet of glass that stays on top while scrolling. Works in the System and Aurora themes, light and dark.
  - The tray icon gets a new name, so GNOME shows the new vinyl tray icon right after installing instead of after logging out.
- **0.3.5**:
  - New app icon: a black vinyl record with a red label and a white note, on a white tile, or on the series' navy tile in dark mode. The tray icon is new too, white or dark following the panel.
  - New start-up screen with the full app name and credits, light or dark following the system. The main window appears once the player has loaded. No splash when starting hidden in the tray.
  - The System theme uses the accent colour you chose in Ubuntu (Settings → Appearance) for highlights and selections, and follows it live. It was always pink before; Apple pink is now only a fallback.
  - New **Settings** button at the bottom of the sidebar opens the same options as the tray menu: theme, layout, notifications, close to tray, start with the system, reload, and sign out.
- **0.3.3** – new dark-mode app icon in the series style: the app's own symbol on a deep navy tile, the same as the other apps of the series.
- **0.3.1** – new default layout **Dock** (tray menu → Layout): bigger and easier to read, a large player at the bottom (96 px cover, big title, artist and album, full-width progress), sidebar groups Apple Music / Library / Playlists that fold, counts next to Artists / Albums / Songs, playlists with cover thumbnails and in folders as in Apple Music, the playing playlist marked; album and playlist headers with a big title on a blurred cover, taller track rows. **Classic** keeps the previous look. The window now always opens when you start the player from the app menu; *Start with the system (hidden in tray)* (formerly *Start hidden in tray*) adds a login autostart entry that keeps it in the tray.
- **0.2.9** – album and playlist covers grow with the window: on a large / full-screen window they are up to ~50% bigger (with sharper artwork and slightly larger titles); on smaller windows they stay as before.
- **0.2.8** – own title bar: the window's top bar now follows the theme (Aurora: lavender / deep navy; System: the sidebar colour, close to the previous look), with the window buttons in the same colour.
- **0.2.7** – the theme choice now shows in the tray menu (two items *Theme: System* / *Theme: Aurora*; the tray menu has no submenus). The app icon in the dock and app grid now switches light/dark with the system **also while the player is closed** (small helper started at login).
- **0.2.6** – new **Aurora** theme (tray menu → Theme), the shared look of the JGu Linux Apps series: lavender / deep navy, violet-to-cyan gradients and glow. Light and dark follow the system; **System** keeps the original look.
- **0.2.5** – license: the app is now published under the Freeware License (No Modifications), see `LICENSE`; free to use and share unmodified, modification is not permitted. No other changes in the app.
- **0.2.4** and earlier: see the git history.

## License

Free of charge to use and redistribute unmodified; modification is not permitted. See `LICENSE`.
Not affiliated with Apple Inc.

Created by: JGu  
Supported by Claude

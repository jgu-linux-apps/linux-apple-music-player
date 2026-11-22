# Linux Apple Music Player

**Version 0.4.2 — 2026-11-22**

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
- **Sync with iPhone (experimental)**: add songs and albums from your disk to your Apple Music library, so they are on your iPhone too — through Apple Music for Windows in [WinBoat](https://github.com/winboat-org/winboat); see below

## Install

Download the newest `linux-apple-music-player_<version>_amd64.deb` from the [Releases page](https://github.com/jgu-linux-apps/linux-apple-music-player/releases/latest), then:

```bash
cd ~/Downloads
sudo apt install ./linux-apple-music-player_<version>_amd64.deb
```

Start **Linux Apple Music Player** from the app grid and sign in with your Apple ID.
The first launch downloads the Widevine DRM module from Google (a few seconds).

## Sync with iPhone (experimental)

Apple has no public way to upload your own music files to your Apple Music library: only Apple's own apps
do it, with **Sync Library** turned on. On Linux the player borrows Apple Music for Windows, running in a
Windows virtual machine managed by [WinBoat](https://github.com/winboat-org/winboat). The Windows window
shows on your Ubuntu desktop only while a sync runs.

One-time setup:

1. Install Docker, FreeRDP 3 and WinBoat, add yourself to the `docker` group and **restart the computer**
   (logging out is not enough):
   ```bash
   sudo apt install docker.io docker-compose-v2 freerdp3-x11 ./winboat-<version>-amd64.deb
   sudo usermod -aG docker $USER
   ```
   (WinBoat's `.deb` is on its [Releases page](https://github.com/winboat-org/winboat/releases).)
2. In WinBoat install Windows 11 and let it **share your home folder** with Windows.
3. In Windows install **Apple Music** from the Microsoft Store, sign in, and turn on
   **Settings → General → Sync Library**.

Then, in the player: **Library → Add from computer** → **Add album folder…** or **Add songs…**.
The player starts Windows if it is off, opens Apple Music and hands it the files through its
"Automatically Add to Apple Music" folder; Apple Music adds them to your library and uploads them to iCloud.
Keep the Apple Music window open until "Updating Library…" at its bottom is gone (it may not respond for a
while after a bigger album), then close it, and shut Windows down from the same panel if you like. If the
window freezes or disappears, **Show Apple Music window** connects it again.

- MP3, M4A/AAC, AIFF and WAV are sent as they are. FLAC, OGG, Opus, WMA, APE and WavPack are converted with
  `ffmpeg` (lossless → ALAC, lossy → AAC 256 kb/s), keeping tags and the embedded cover.
- The player reads the Windows user and password WinBoat created from `~/.winboat/docker-compose.yml`
  and passes the password to FreeRDP on stdin, so it never shows up in the process list.
- This is experimental: it depends on WinBoat (beta) and on Apple Music for Windows keeping its
  "Automatically Add" folder.

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

- **0.4.2**: Sync with iPhone: a "Show Apple Music window" button brings the Apple Music window back when it froze (another client took the Windows session) or was closed too early; the player never leaves a frozen FreeRDP window behind; the panel explains that Apple Music may not respond while it shows "Updating Library…" after a bigger album.
- **0.4.1**: Sync with iPhone: when Apple Music has taken all the files, the player window comes back to the front with the result; closing the Apple Music window is noticed by the panel, which then offers to shut Windows down.
- **0.4.0**: **Sync with iPhone (experimental)**: Library → Add from computer adds songs and album folders from your disk to your Apple Music library (and so to your iPhone) through Apple Music for Windows in WinBoat. The player starts Windows when needed, shows the Apple Music window on the Ubuntu desktop, hands it the files and follows the import step by step; FLAC/OGG are converted to ALAC/AAC on the way.
- **0.3.13**: in the Aurora theme the title bar is no longer a flat strip: the window's colour glow runs under it (turquoise from the top-left, violet at the bottom-right in dark; lavender-to-blue in light), like Linux iMessage and the rest of the series. The System theme is unchanged.
- **0.3.12**: the start-up screen (and the window background while it loads) follows the system's light or dark style from the first moment. Electron learns GNOME's colour scheme only a moment after start, so the start-up screen was always light; the app now reads it itself (XDG portal, then gsettings) and follows changes after that.
- **0.3.11**: your own playlists opened from Home (or anywhere that shows them by their shared catalog link) open as the library copy, so "Remove from Playlist" works there too.
- **0.3.10**: "Remove from Playlist" in the right-click menu of a song in your own playlists; the song disappears from the list at once. On album and playlist pages the top bar and the column header turn solid once the list scrolls under them, so the rows no longer show through.
- **0.3.9**: the tray shows the app's own icon: the black vinyl record with the red label and the white note, with a white rim, so it is clear on dark and light top bars alike. The 0.3.8 symbolic icon lost the note, because GNOME paints symbolic icons in a single colour.
- **0.3.8**: the tray icon is a symbolic icon, so GNOME paints it in the top bar's own text colour: white on a dark bar, dark on a light one. In 0.3.7 it followed the app theme, so with a light theme and the usual dark top bar it was dark on dark.
- **0.3.7**:
  - New tray icon that is easy to see at panel size: a solid record with a large note cut out, dark on light panels and white on dark ones. It replaces the 0.3.5 tray icon, which turned into a grey blob.
  - The sidebar can be resized: drag its right edge (200–460 px). Drag it fully to the left, double-click the edge or press Ctrl+B to hide it, so the page uses the whole window. A small handle at the window edge brings it back, and the width is remembered.
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

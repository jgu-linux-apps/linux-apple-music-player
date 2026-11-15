#!/bin/bash
set -e
cd /home/claude/lamp
V=$(node -p "require('./app/package.json').version"); P=linux-apple-music-player; N="Linux Apple Music Player"
B=build/${P}_${V}_amd64
rm -rf build && mkdir -p $B/DEBIAN $B/opt/$P/resources/app $B/usr/bin $B/usr/share/applications $B/etc/apparmor.d $B/usr/share/doc/$P
cp -a /home/claude/dl/electron/. $B/opt/$P/ && mv $B/opt/$P/electron $B/opt/$P/$P && rm -f $B/opt/$P/resources/default_app.asar
cp -a app/{package.json,main.js,preload.js,mpris.js,sni.js,i18n.js,ui,assets,node_modules} $B/opt/$P/resources/app/
for s in 48 64 128 256 512; do mkdir -p $B/usr/share/icons/hicolor/${s}x${s}/apps; cp app/assets/icon-light-$s.png $B/usr/share/icons/hicolor/${s}x${s}/apps/$P.png; done
for s in 22 32 48 64; do mkdir -p $B/usr/share/icons/hicolor/${s}x${s}/apps; rsvg-convert -w $s app/assets/tray/$P-tray4.svg -o $B/usr/share/icons/hicolor/${s}x${s}/apps/$P-tray4.png; done
mkdir -p $B/usr/share/icons/hicolor/scalable/apps && cp app/assets/icon-light.svg $B/usr/share/icons/hicolor/scalable/apps/$P.svg
# icon follows light/dark also while the app is closed (session autostart helper)
mkdir -p $B/usr/lib/$P $B/etc/xdg/autostart
install -m 0755 app/packaging/icon-watch.sh $B/usr/lib/$P/icon-watch.sh
install -m 0644 app/packaging/$P-icon.desktop $B/etc/xdg/autostart/$P-icon.desktop
cat > $B/usr/bin/$P <<'X'
#!/bin/sh
# Launcher: detaches from the terminal so closing the terminal does not close the player.
BIN=/opt/linux-apple-music-player/linux-apple-music-player
if [ -t 0 ] || [ -t 1 ]; then setsid -f "$BIN" "$@" >/dev/null 2>&1 </dev/null; else exec "$BIN" "$@"; fi
X
chmod 755 $B/usr/bin/$P
DBUS='dbus-send --session --type=method_call --dest=org.mpris.MediaPlayer2.linux_apple_music_player /org/mpris/MediaPlayer2'
cat > $B/usr/share/applications/$P.desktop <<X
[Desktop Entry]
Type=Application
Name=$N
GenericName=Music Player
GenericName[pl]=Odtwarzacz muzyki
Comment=Lightweight Apple Music player with tray, media controls and lyrics
Comment[pl]=Lekki odtwarzacz Apple Music z trayem, sterowaniem z panelu i tekstami
Exec=$P %U
Icon=$P
Terminal=false
Categories=AudioVideo;Audio;Player;Music;
Keywords=apple;music;itunes;player;lyrics;
StartupNotify=true
StartupWMClass=$P
Actions=PlayPause;Next;Previous;

[Desktop Action PlayPause]
Name=Play / Pause
Name[pl]=Odtwórz / pauza
Exec=$DBUS org.mpris.MediaPlayer2.Player.PlayPause

[Desktop Action Next]
Name=Next track
Name[pl]=Następny utwór
Exec=$DBUS org.mpris.MediaPlayer2.Player.Next

[Desktop Action Previous]
Name=Previous track
Name[pl]=Poprzedni utwór
Exec=$DBUS org.mpris.MediaPlayer2.Player.Previous
X
cat > $B/etc/apparmor.d/$P <<'X'
# Allows the Chromium sandbox (user namespaces) on Ubuntu 24.04+.
abi <abi/4.0>,
include <tunables/global>

profile linux-apple-music-player /opt/linux-apple-music-player/linux-apple-music-player flags=(unconfined) {
  userns,
  include if exists <local/linux-apple-music-player>
}
X
cat > $B/DEBIAN/control <<X
Package: $P
Version: $V
Section: sound
Priority: optional
Architecture: amd64
Installed-Size: $(du -sk $B | cut -f1)
Maintainer: Jaro <jaroslawguza83@gmail.com>
Depends: libgtk-3-0t64 | libgtk-3-0, libnss3, libgbm1, libasound2t64 | libasound2, libnotify4, libxss1, xdg-utils
Recommends: gnome-shell-extension-appindicator
Description: $N - lightweight Apple Music player for Ubuntu
 Fast Apple Music player with its own lightweight interface built on the
 Apple Music API (Apple ID and subscription required), Widevine for
 full-length playback, tray icon with close-to-tray, MPRIS integration with
 the Ubuntu media controls and media keys, optional notification for every
 song, cover view with synced lyrics and light/dark icons following the
 system. Not affiliated with Apple Inc.
X
echo /etc/apparmor.d/$P > $B/DEBIAN/conffiles
cat > $B/DEBIAN/postinst <<'X'
#!/bin/sh
set -e
P=linux-apple-music-player
chown root:root /opt/$P/chrome-sandbox 2>/dev/null || true
chmod 4755 /opt/$P/chrome-sandbox 2>/dev/null || true
if command -v apparmor_parser >/dev/null 2>&1 && [ -d /sys/kernel/security/apparmor ]; then apparmor_parser -r -T -W /etc/apparmor.d/$P 2>/dev/null || true; fi
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -f -t /usr/share/icons/hicolor || true
exit 0
X
cat > $B/DEBIAN/prerm <<'X'
#!/bin/sh
set -e
P=linux-apple-music-player
if [ "$1" = "remove" ] && command -v apparmor_parser >/dev/null 2>&1 && [ -f /etc/apparmor.d/$P ]; then apparmor_parser -R /etc/apparmor.d/$P 2>/dev/null || true; fi
exit 0
X
cat > $B/DEBIAN/postrm <<'X'
#!/bin/sh
set -e
if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -f -t /usr/share/icons/hicolor || true
fi
exit 0
X
chmod 755 $B/DEBIAN/postinst $B/DEBIAN/prerm $B/DEBIAN/postrm
cp dist/README.md dist/LICENSE $B/usr/share/doc/$P/
find $B -type d -exec chmod 755 {} +
rm -f dist/*.deb dist/*.tar.gz
dpkg-deb -Zxz --root-owner-group --build $B dist/ >/dev/null
S=src/$P-$V; rm -rf src; mkdir -p $S/icons
cp -a app/{package.json,package-lock.json,main.js,preload.js,mpris.js,sni.js,i18n.js,ui} $S/; cp app/assets/*.svg /home/claude/lamp/icons/*.svg $S/icons/ 2>/dev/null || true
cp dist/README.md dist/LICENSE build.sh $S/
tar -C src -czf dist/$P-$V-source.tar.gz $P-$V
ls -la dist

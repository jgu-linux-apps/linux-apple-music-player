#!/bin/sh
# Linux Apple Music Player: small background helper that keeps the app icon (dock, menu) in step with
# the system light/dark theme, also while the app is closed. It does nothing else and does not start the app.
# Dark: the dark icon is copied to ~/.local/share/icons (wins over /usr/share). Light: the copies are
# removed, so the light icon of the package is used. The app itself does the same while it runs.
P=linux-apple-music-player
SRC=/opt/$P/resources/app/assets
[ -f "$SRC/icon-dark.svg" ] || exit 0
BASE="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor"
SIZES="48 64 128 256 512"

is_dark() {
    case "$(gsettings get org.gnome.desktop.interface color-scheme 2>/dev/null)" in *dark*) return 0 ;; esac
    case "$(gsettings get org.gnome.desktop.interface gtk-theme 2>/dev/null)" in *-dark*|*-Dark*) return 0 ;; esac
    return 1
}

put() {  # put SRC DST: copy only when different
    cmp -s "$1" "$2" 2>/dev/null && return 0
    mkdir -p "$(dirname "$2")" && cp "$1" "$2"
}

apply() {
    if is_dark; then
        put "$SRC/icon-dark.svg" "$BASE/scalable/apps/$P.svg"
        for s in $SIZES; do put "$SRC/icon-dark-$s.png" "$BASE/${s}x${s}/apps/$P.png"; done
    else
        rm -f "$BASE/scalable/apps/$P.svg"
        for s in $SIZES; do rm -f "$BASE/${s}x${s}/apps/$P.png"; done
    fi
    command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -f -t "$BASE" 2>/dev/null
    touch "$BASE" "$BASE/.." 2>/dev/null || true  # make the shell re-read the icon theme
}

apply
gsettings monitor org.gnome.desktop.interface 2>/dev/null | while read -r line; do
    case "$line" in *color-scheme*|*gtk-theme*) apply ;; esac
done

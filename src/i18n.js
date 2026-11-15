'use strict';
// Polish when the OS language is Polish, English otherwise.
const STR = {
  en: {
    show: 'Show window',
    hide: 'Hide window',
    play: 'Play',
    pause: 'Pause',
    next: 'Next track',
    previous: 'Previous track',
    coverView: 'Cover view',
    lyrics: 'Lyrics',
    notifications: 'Notify on every song',
    closeToTray: 'Close to tray',
    theme: 'Theme',
    themeSystem: 'System (light / dark)',
    themeAurora: 'Aurora (light / dark)',
    layout: 'Layout',
    layoutClassic: 'Classic (before 0.3)',
    layoutDock: 'Dock (large player at the bottom)',
    startHidden: 'Start with the system (hidden in tray)',
    reload: 'Reload',
    settings: 'Settings',
    accentNote: 'The System theme uses the accent colour you chose in Ubuntu (Settings → Appearance).',
    general: 'General', account: 'Account',
    signOut: 'Sign out and clear data',
    signOutConfirm: 'Sign out of Apple Music and remove all local app data?',
    quit: 'Quit',
    nothingPlaying: 'Nothing playing',
    nowPlaying: 'Now playing',
    cancel: 'Cancel',
    ok: 'Sign out',
    drmWait: 'Preparing DRM module (first launch may take a moment)…',
    drmFail: 'The Widevine module could not be loaded. Only previews may play. Check your internet connection and restart the app.'
  },
  pl: {
    show: 'Pokaż okno',
    hide: 'Ukryj okno',
    play: 'Odtwórz',
    pause: 'Pauza',
    next: 'Następny utwór',
    previous: 'Poprzedni utwór',
    coverView: 'Widok okładki',
    lyrics: 'Tekst',
    notifications: 'Powiadomienie o każdej piosence',
    closeToTray: 'Zamykaj do traya',
    theme: 'Motyw',
    themeSystem: 'Systemowy (jasny / ciemny)',
    themeAurora: 'Aurora (jasny / ciemny)',
    layout: 'Układ',
    layoutClassic: 'Klasyczny (sprzed 0.3)',
    layoutDock: 'Dok (duży odtwarzacz na dole)',
    startHidden: 'Uruchamiaj z systemem (ukryte w trayu)',
    reload: 'Odśwież',
    settings: 'Ustawienia',
    accentNote: 'Motyw systemowy używa koloru akcentu wybranego w Ubuntu (Ustawienia → Wygląd).',
    general: 'Ogólne', account: 'Konto',
    signOut: 'Wyloguj i wyczyść dane',
    signOutConfirm: 'Wylogować z Apple Music i usunąć wszystkie lokalne dane aplikacji?',
    quit: 'Zakończ',
    nothingPlaying: 'Nic nie gra',
    nowPlaying: 'Teraz gra',
    cancel: 'Anuluj',
    ok: 'Wyloguj',
    drmWait: 'Przygotowuję moduł DRM (pierwsze uruchomienie może chwilę potrwać)…',
    drmFail: 'Nie udało się załadować modułu Widevine. Mogą grać tylko fragmenty utworów. Sprawdź internet i uruchom aplikację ponownie.'
  }
};

function detectLang(appLocale) {
  const cands = [process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG, process.env.LANGUAGE, appLocale];
  for (const c of cands) {
    if (c && c.trim()) return c.toLowerCase().startsWith('pl') ? 'pl' : 'en';
  }
  return 'en';
}

module.exports = { STR, detectLang };

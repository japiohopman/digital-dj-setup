# Progressive Web App shell

The Digital DJ app can be installed and launched in **standalone** display mode. This gives the installed app its own window without the normal browser URL/navigation bar. A platform status area may still be visible.

## Install on Android

1. Open the deployed app once in Chrome while online.
2. Use Chrome's **Install app** or **Add to Home screen** option.
3. Launch Digital DJ Setup from the new home-screen/app-launcher icon, not from the original browser tab.

## Install on iPhone

1. Open the deployed app in Safari while online.
2. Tap **Share**, then **Add to Home Screen**.
3. Enable **Open as Web App**, then tap **Add**.
4. Launch the new home-screen icon.

## Offline behaviour

- The app shell, built JavaScript/CSS, turntable artwork, icons and application-owned needle/vinyl sound effects are precached.
- Navigation is network-first while online and falls back to the cached app shell when offline.
- Only same-origin application assets are cached. No third-party resources or API responses are cached.
- User-selected audio files remain local File/Blob objects. They are not sent to a server and are never added to the service-worker cache.
- The offline indicator reports that the cached app shell is available. A resource that was not included in the app build cannot be fetched while offline.
- Offline shell availability begins only after a successful online visit has installed and populated the service worker cache.

The service worker is generated during the Vite production build from the actual output asset list. It uses a versioned cache and removes older app-shell caches after an update. Development mode does not register it, avoiding stale assets while running Vite locally.

## Device acceptance checklist

- [ ] Install from HTTPS on Android Chrome and launch from the home-screen icon.
- [ ] Install from Safari on iPhone and launch with **Open as Web App**.
- [ ] Confirm the normal browser URL/navigation bar is absent in the installed launch.
- [ ] Rotate between portrait and landscape; confirm the decks and mixer continue to use the full available app viewport and safe areas.
- [ ] Load one local audio file into each deck; confirm loading does not auto-play.
- [ ] Cancel a file picker; confirm deck state is unchanged.
- [ ] Disconnect the network after the first successful online launch; confirm the app shell and bundled artwork/sounds remain available.
- [ ] Select a local audio file while offline; confirm the file remains local and playback still works.
- [ ] Reconnect and deploy a new build; confirm the service worker updates to the new app shell.
- [ ] Record the device, OS, browser, PWA mode and tested viewport/orientation in Issue #19.

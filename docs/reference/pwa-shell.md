# Progressive Web App shell

The Digital DJ app can be installed and launched in **standalone** display mode. This gives the installed app its own window without the normal browser URL/navigation bar. A platform status area may still be visible.

## Test hosting with GitHub Pages

The repository is public, so GitHub Pages can host the static PWA without creating a Render service. The project-site URL is:

`https://japiohopman.github.io/digital-dj-setup/`

The Vite build uses the Pages base path for HTML, CSS artwork, manifest icons and the service-worker scope. The manifest itself uses deployment-relative paths so it also works on a root-hosted static host.

### First-time Pages setup

1. Merge the PWA implementation PR so the deployment workflow is available on `main`.
2. Open the repository's **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Open **Actions → Deploy GitHub Pages**.
5. Choose the branch you want to test in the **Run workflow** branch selector, then run it.
6. Open the URL reported by the deployment job. The default project URL is the address above.

The workflow is manual by design. It deploys only when explicitly run, and builds the branch selected in the Actions run form. GitHub Pages is a public website for this public repository; do not put secrets or private files in its build output.



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

- The app shell, built JavaScript/CSS and manifest are critical precache resources. Turntable artwork, icons and application-owned needle/vinyl sounds are cached best-effort; their failure cannot block installation of the offline app shell.
- Public app-owned UI SVGs are added individually to `PUBLIC_APP_ASSETS`; the album-crate overlay icon is included there as an optional precache resource.
- Navigation is network-first while online and falls back to the cached app shell when offline.
- Only same-origin application assets are cached. No third-party resources or API responses are cached.
- User-selected audio files remain local File/Blob objects. They are not sent to a server and are never added to the service-worker cache.
- The `OFFLINE · NO NETWORK` indicator reports the browser's network status only; it does not confirm that the service worker is installed or that the shell cache is populated.
- The separate `OFFLINE CACHE READY` indicator appears only when an active service worker controls the page and the exact current HTML, JavaScript and CSS entry resources are present in Cache Storage. It is shown in the footer in portrait and as a compact corner status in landscape. `OFFLINE CACHE NOT READY` means the app should not yet be relied on for offline launch.
- Offline shell availability is conditional on a successful online visit that installs the service worker and completes the initial app-shell cache population. A resource that was not included in the app build cannot be fetched while offline.

The service worker is generated during the Vite production build from the actual output asset list. It uses a versioned cache and removes older app-shell caches after an update. Precache fetches are bounded to eight seconds each so a slow request cannot hold the worker installation indefinitely. On a first install, failure to cache a required HTML, manifest, JavaScript or CSS resource prevents the new worker from activating, so readiness remains not ready. If an update fails, the browser keeps the previous active worker; readiness can remain ready when that worker still controls the page and the loaded build's exact entry resources are already cached. Development mode does not register it, avoiding stale assets while running Vite locally.

## Device acceptance checklist

- [ ] Publish the selected branch to GitHub Pages and open the HTTPS project URL.
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

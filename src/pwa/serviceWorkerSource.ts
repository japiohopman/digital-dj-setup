/**
 * Offline app-shell policy for the generated service worker.
 *
 * The HTML and its hashed JavaScript/CSS entry points are boot-critical.
 * Artwork and app-owned audio are best-effort so one optional media failure
 * cannot cancel installation of the offline application shell.
 * User-selected tracks remain File/Blob objects and are never cached.
 */

export const PUBLIC_APP_ASSETS = [
  '/favicon.svg',
  '/icons/app-192.png',
  '/icons/app-512.png',
  '/icons/UI/album_crate.svg',
  '/turntable/platter.png',
  '/turntable/record-grooves-1440x1440-white.png',
  '/turntable/slipmat.jpg',
  '/turntable/landscape/power-light.png',
  '/turntable/landscape/tt_33.png',
  '/turntable/landscape/tt_33_on.png',
  '/turntable/landscape/tt_45.png',
  '/turntable/landscape/tt_45_on.png',
  '/turntable/landscape/tt_arm.png',
  '/turntable/landscape/tt_case_and_lighting.png',
  '/turntable/landscape/tt_lightoff.png',
  '/turntable/landscape/tt_lighton.png',
  '/turntable/landscape/tt_powerdial.png',
  '/turntable/landscape/tt_startstop.png',
  '/turntable/landscape/tt_table.png',
  '/sounds/needle_placed_wrong.wav',
  '/sounds/needle_start_record.wav',
  '/sounds/not_on_record_loop.wav',
  '/sounds/vinyl_loop.wav',
  '/sounds/battle_amo/scratch_making_me_itch.mp3',
  '/sounds/battle_amo/super_duck_breaks.mp3',
] as const;

export interface RuntimeRequestDescriptor {
  method: string;
  destination: string;
}

export interface PrecachePlan {
  /** Resources required for the installed app to render its UI offline. */
  critical: string[];
  /** App-owned media and other build assets that may be cached opportunistically. */
  optional: string[];
}

/** Normalizes a deployment path to a leading- and trailing-slash URL scope. */
function normalizeBasePath(basePath: string): string {
  const leadingSlash = basePath.startsWith('/') ? basePath : '/' + basePath;
  return leadingSlash.endsWith('/') ? leadingSlash : leadingSlash + '/';
}

/** Checks the same-origin application asset allowlist using paths within the app's deployment scope. */
export function shouldCacheRuntimeRequest(
  request: RuntimeRequestDescriptor,
  pathname: string,
  requestOrigin: string,
  appOrigin: string,
  basePath = '/',
): boolean {
  if (request.method !== 'GET' || requestOrigin !== appOrigin) return false;

  const leadingSlash = basePath.startsWith('/') ? basePath : '/' + basePath;
  const normalizedBasePath = leadingSlash.endsWith('/') ? leadingSlash : leadingSlash + '/';
  if (!pathname.startsWith(normalizedBasePath)) return false;
  const appPath = '/' + pathname.slice(normalizedBasePath.length);

  const isAudioFile = /\.(?:aac|flac|m4a|mp3|ogg|opus|wav|weba)$/i.test(appPath);
  const isBundledApplicationSound = appPath.startsWith('/sounds/');
  if (isAudioFile && !isBundledApplicationSound) return false;

  return ['script', 'style', 'image', 'font'].includes(request.destination) ||
    appPath.startsWith('/turntable/') ||
    isBundledApplicationSound ||
    appPath === '/manifest.webmanifest' ||
    appPath === '/favicon.svg' ||
    appPath.startsWith('/icons/');
}

/** Splits the deployment bundle into required boot resources and optional media/assets. */
export function getPrecachePlan(bundleAssetPaths: string[], basePath = '/'): PrecachePlan {
  const normalizedBasePath = normalizeBasePath(basePath);
  const withBase = (path: string) => normalizedBasePath + path.replace(/^\/+/, '');
  const cacheableBundlePaths = bundleAssetPaths.filter((path) =>
    /\.(?:js|mjs|css|svg|png|jpe?g|webp|avif|woff2?|ico)$/i.test(path),
  );
  const criticalBundlePaths = cacheableBundlePaths.filter((path) => /\.(?:js|mjs|css)$/i.test(path));
  const optionalBundlePaths = cacheableBundlePaths.filter((path) => !/\.(?:js|mjs|css)$/i.test(path));

  return {
    critical: Array.from(new Set([
      normalizedBasePath,
      withBase('manifest.webmanifest'),
      ...criticalBundlePaths.map(withBase),
    ])).sort(),
    optional: Array.from(new Set([
      ...PUBLIC_APP_ASSETS.map(withBase),
      ...optionalBundlePaths.map(withBase),
    ])).sort(),
  };
}

/** Returns every precache URL for compatibility with build validation and documentation. */
export function getPrecacheUrls(bundleAssetPaths: string[], basePath = '/'): string[] {
  const plan = getPrecachePlan(bundleAssetPaths, basePath);
  return Array.from(new Set([...plan.critical, ...plan.optional])).sort();
}

/**
 * Emits a versioned service worker scoped to the deployment base.
 * The Vite plugin supplies a commit/build fingerprint.
 */
export function createServiceWorkerSource(
  bundleAssetPaths: string[],
  basePath = '/',
  buildFingerprint = '',
): string {
  const normalizedBasePath = normalizeBasePath(basePath);
  const plan = getPrecachePlan(bundleAssetPaths, normalizedBasePath);
  const allPrecacheUrls = [...plan.critical, ...plan.optional];
  const seed = [
    normalizedBasePath,
    buildFingerprint,
    ...allPrecacheUrls,
  ].join('\n');
  let versionHash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    versionHash ^= seed.charCodeAt(index);
    versionHash = Math.imul(versionHash, 16777619);
  }
  const cacheName = 'digital-dj-shell-' + (versionHash >>> 0).toString(16);
  const cachePolicy = shouldCacheRuntimeRequest.toString();

  return [
    "/* Generated by the Vite build. Do not edit the dist copy. */",
    "const CACHE_NAME = " + JSON.stringify(cacheName) + ";",
    "const APP_BASE_PATH = " + JSON.stringify(normalizedBasePath) + ";",
    "const APP_SHELL_URL = new URL(APP_BASE_PATH, self.location.origin).href;",
    "const CRITICAL_PRECACHE_URLS = " + JSON.stringify(plan.critical) + ";",
    "const OPTIONAL_PRECACHE_URLS = " + JSON.stringify(plan.optional) + ";",
    "const shouldCacheRuntimeRequest = (" + cachePolicy + ");",
    "",
    "async function cachePrecacheResource(cache, url) {",
    "  const controller = new AbortController();",
    "  const timeoutId = setTimeout(() => controller.abort(), 8000);",
    "  try {",
    "    const response = await fetch(url, { cache: 'reload', signal: controller.signal });",
    "    if (!response.ok) {",
    "      throw new Error('Could not precache application resource: ' + url);",
    "    }",
    "    await cache.put(url, response);",
    "  } finally {",
    "    clearTimeout(timeoutId);",
    "  }",
    "}",
    "",
    "self.addEventListener('install', (event) => {",
    "  event.waitUntil((async () => {",
    "    const cache = await caches.open(CACHE_NAME);",
    "",
    "    // The HTML, manifest and hashed JS/CSS must be present before this worker activates.",
    "    await Promise.all(CRITICAL_PRECACHE_URLS.map((url) => cachePrecacheResource(cache, url)));",
    "",
    "    // Artwork, icons and app-owned sounds must never block the offline app shell.",
    "    const optionalResults = await Promise.allSettled(",
    "      OPTIONAL_PRECACHE_URLS.map((url) => cachePrecacheResource(cache, url)),",
    "    );",
    "    const optionalFailures = optionalResults.filter((result) => result.status === 'rejected').length;",
    "    if (optionalFailures > 0) {",
    "      console.warn('Digital DJ app shell installed with ' + optionalFailures + ' optional offline asset(s) unavailable.');",
    "    }",
    "",
    "    await self.skipWaiting();",
    "  })());",
    "});",
    "",
    "self.addEventListener('activate', (event) => {",
    "  event.waitUntil((async () => {",
    "    const cacheNames = await caches.keys();",
    "    await Promise.all(cacheNames",
    "      .filter((name) => name.startsWith('digital-dj-shell-') && name !== CACHE_NAME)",
    "      .map((name) => caches.delete(name)));",
    "    await self.clients.claim();",
    "  })());",
    "});",
    "",
    "self.addEventListener('fetch', (event) => {",
    "  const request = event.request;",
    "  if (request.method !== 'GET') return;",
    "",
    "  const url = new URL(request.url);",
    "  if (url.origin !== self.location.origin) return;",
    "  if (url.pathname !== APP_BASE_PATH.slice(0, -1) && !url.pathname.startsWith(APP_BASE_PATH)) return;",
    "",
    "  if (request.mode === 'navigate') {",
    "    event.respondWith((async () => {",
    "      try {",
    "        const response = await fetch(request);",
    "        if (response.ok) {",
    "          try {",
    "            const cache = await caches.open(CACHE_NAME);",
    "            await cache.put(APP_SHELL_URL, response.clone());",
    "          } catch {",
    "            // Preserve a successful page response when storage is unavailable or full.",
    "          }",
    "        }",
    "        return response;",
    "      } catch {",
    "        let cached;",
    "        try {",
    "          cached = await caches.match(request) || await caches.match(APP_SHELL_URL);",
    "        } catch {",
    "          // Cache lookup can also fail; keep the explicit offline response below.",
    "        }",
    "        return cached || new Response(",
    "          'The DJ app shell is not cached yet. Connect once and open the app again.',",
    "          { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },",
    "        );",
    "      }",
    "    })());",
    "    return;",
    "  }",
    "",
    "  if (!shouldCacheRuntimeRequest(request, url.pathname, url.origin, self.location.origin, APP_BASE_PATH)) return;",
    "",
    "  event.respondWith((async () => {",
    "    let cached;",
    "    try {",
    "      cached = await caches.match(request);",
    "    } catch {",
    "      // A cache lookup failure should not prevent trying the network.",
    "    }",
    "    if (cached) return cached;",
    "",
    "    let response;",
    "    try {",
    "      response = await fetch(request);",
    "    } catch {",
    "      return new Response(",
    "        'This application resource is not available offline. Reconnect and reload.',",
    "        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },",
    "      );",
    "    }",
    "",
    "    if (response.ok) {",
    "      try {",
    "        const cache = await caches.open(CACHE_NAME);",
    "        await cache.put(request, response.clone());",
    "      } catch {",
    "        // Return the successful network response even when cache storage cannot be written.",
    "      }",
    "    }",
    "    return response;",
    "  })());",
    "});",
    "",
  ].join('\n');
}

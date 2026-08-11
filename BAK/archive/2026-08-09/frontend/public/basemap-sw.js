// public/basemap-sw.js
// Service Worker: cache-first strategy with LRU eviction for Google Maps basemap tiles.
// Plain JS only — NO import/export (SW context does not support ES modules reliably).

const CACHE_NAME = 'basemap-tiles-v1';
const LRU_META_KEY = 'basemap-lru-meta';
const MAX_TILES = 5000;
const TILE_URL_PATTERN = /^https:\/\/mt[0-3]\.google\.com\/vt\//;

// Inline transparent 1×1 PNG (same bytes as tilePlaceholder.ts — cannot import in SW context).
const TRANSPARENT_PNG_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAAbjbOmQAAAABJRU5ErkJggg==';

/**
 * Decode the inline base64 PNG to a Uint8Array.
 * @returns {Uint8Array}
 */
function transparentPngBytes() {
    var binary = atob(TRANSPARENT_PNG_B64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Return a Response containing the transparent PNG placeholder.
 * @returns {Response}
 */
function transparentPngResponse() {
    return new Response(transparentPngBytes(), {
        status: 200,
        headers: {
            'Content-Type': 'image/png',
            'X-Basemap-Placeholder': '1',
        },
    });
}

// ---------------------------------------------------------------------------
// Fetch event — intercept only Google Maps tile requests
// ---------------------------------------------------------------------------

self.addEventListener('fetch', function (event) {
    if (!TILE_URL_PATTERN.test(event.request.url)) return;
    event.respondWith(handleTileRequest(event.request));
});

/**
 * Cache-first handler for a tile request.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleTileRequest(request) {
    var cache = await caches.open(CACHE_NAME);
    var cached = await cache.match(request);

    if (cached) {
        // Cache hit — update LRU position (fire-and-forget; don't block the response)
        touchLru(request.url).catch(function (err) {
            console.debug('[BasemapSW] touchLru error', err);
        });
        return cached;
    }

    // Cache miss — fetch from network
    try {
        var response = await fetch(request);
        if (response.ok) {
            await cache.put(request, response.clone());
            await insertLru(request.url, cache);
        }
        return response;
    } catch (_err) {
        // Offline or network failure — return transparent PNG placeholder
        console.debug('[BasemapSW] tile-offline-placeholder', request.url);
        return transparentPngResponse();
    }
}

// ---------------------------------------------------------------------------
// LRU helpers
// ---------------------------------------------------------------------------

/**
 * Read the current LRU URL list from the cache metadata entry.
 * Returns an empty array if no entry exists yet.
 * @param {Cache} cache
 * @returns {Promise<string[]>}
 */
async function readLruMeta(cache) {
    var metaResponse = await cache.match(LRU_META_KEY);
    if (!metaResponse) return [];
    try {
        return await metaResponse.json();
    } catch (_e) {
        return [];
    }
}

/**
 * Persist the LRU URL list back into the cache metadata entry.
 * @param {Cache} cache
 * @param {string[]} list
 * @returns {Promise<void>}
 */
async function writeLruMeta(cache, list) {
    var body = JSON.stringify(list);
    var metaResponse = new Response(body, {
        headers: { 'Content-Type': 'application/json' },
    });
    await cache.put(LRU_META_KEY, metaResponse);
}

/**
 * Insert a URL into the LRU list (MRU position = end of array).
 * If the list exceeds MAX_TILES, evict the least-recently-used entry (front).
 * @param {string} url
 * @param {Cache} cache
 * @returns {Promise<void>}
 */
async function insertLru(url, cache) {
    var list = await readLruMeta(cache);

    // Avoid duplicates — if already present, don't double-count
    var idx = list.indexOf(url);
    if (idx !== -1) {
        list.splice(idx, 1);
    }

    list.push(url);

    // Evict oldest entries until we are within the limit
    while (list.length > MAX_TILES) {
        var evicted = list.shift();
        if (evicted) {
            await cache.delete(evicted);
        }
    }

    await writeLruMeta(cache, list);
}

/**
 * Move a URL to the MRU (most-recently-used) position by removing it from
 * its current position and appending it to the end of the list.
 * @param {string} url
 * @returns {Promise<void>}
 */
async function touchLru(url) {
    var cache = await caches.open(CACHE_NAME);
    var list = await readLruMeta(cache);

    var idx = list.indexOf(url);
    if (idx !== -1) {
        list.splice(idx, 1);
    }

    list.push(url);

    await writeLruMeta(cache, list);
}

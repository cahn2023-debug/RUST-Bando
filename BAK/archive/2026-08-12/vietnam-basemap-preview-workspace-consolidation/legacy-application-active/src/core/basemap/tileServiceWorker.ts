/** Register the basemap Service Worker. Resolves when the SW controls the page. */
export async function registerTileServiceWorker(): Promise<void> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    try {
        const reg = await navigator.serviceWorker.register('/basemap-sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        console.debug('[BasemapSW] registered', reg.scope);
    } catch (err) {
        console.warn('[BasemapSW] registration failed — proceeding without SW cache', err);
    }
}

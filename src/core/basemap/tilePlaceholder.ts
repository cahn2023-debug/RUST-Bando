/** Minimal 1×1 transparent PNG, sufficient for MapLibre's tile consumer. */
export const TRANSPARENT_PNG_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQ' +
    'AAbjbOmQAAAABJRU5ErkJggg==';

export function transparentPngBytes(): Uint8Array {
    const binary = atob(TRANSPARENT_PNG_B64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

export function transparentPngResponse(): Response {
    return new Response(transparentPngBytes(), {
        headers: { 'Content-Type': 'image/png', 'X-Basemap-Placeholder': '1' },
    });
}

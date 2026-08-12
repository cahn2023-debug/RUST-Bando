import maplibregl from 'maplibre-gl';
import { PMTiles, Protocol, type RangeResponse, type Source } from 'pmtiles';
import type { PreviewFileReader } from './types';

const PROTOCOL = 'basemap';

export function registerLocalPackageProtocol(reader: PreviewFileReader, tileArchive: string): () => void {
    const pmtilesProtocol = new Protocol();
    const source: Source = {
        getKey: () => 'package',
        async getBytes(offset, length, signal): Promise<RangeResponse> {
            const bytes = reader.readRange
                ? await reader.readRange(tileArchive, offset, length)
                : (await reader.read(tileArchive)).slice(offset, offset + length);
            if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
            return { data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
        },
    };
    pmtilesProtocol.add(new PMTiles(source));
    maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);
    maplibregl.addProtocol(PROTOCOL, async request => {
        const prefix = `${PROTOCOL}://package/`;
        if (!request.url.startsWith(prefix)) {
            throw new Error(`Basemap protocol URL không hợp lệ: ${request.url}`);
        }
        const path = decodeURIComponent(request.url.slice(prefix.length));
        const bytes = await reader.read(path);
        return { data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    });
    return () => {
        maplibregl.removeProtocol(PROTOCOL);
        maplibregl.removeProtocol('pmtiles');
    };
}

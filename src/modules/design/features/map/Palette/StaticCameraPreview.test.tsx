import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { safeInvoke } from '@IMPLEMENT/lib/tauri';
import * as googleMapsLoader from '@TOOL/utils/googleMapsLoader';
import { CameraHudFallback } from './CameraHudFallback';
import { StaticStreetViewPreview } from './StaticStreetViewPreview';

const mockInvoke = vi.mocked(safeInvoke);
vi.mock('@IMPLEMENT/lib/tauri', () => ({
    safeInvoke: vi.fn(),
}));

vi.mock('@TOOL/utils/googleMapsLoader', () => ({
    initGoogleMaps: vi.fn().mockReturnValue(true),
    waitForGoogleMaps: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@TOOL/utils/googleMapsRuntime', () => ({
    getGoogleMapsApiKey: () => 'fake-api-key'
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('CameraHudFallback', () => {
    it('renders fallback HUD text and SVG markup correctly', () => {
        render(
            <CameraHudFallback
                hfov={85.3}
                targetDistance={35}
                installHeight={4.5}
                targetHeight={1.7}
                rotation={45}
                ppm={128}
                statusLabel="Chi tiết"
                statusColor="#f59e0b"
            />
        );

        expect(screen.getByText(/85\.3°/)).toBeInTheDocument();
        expect(screen.getByText('128')).toBeInTheDocument();
        expect(screen.getByText('35m')).toBeInTheDocument();
        expect(screen.getByText('4.5m')).toBeInTheDocument();
        expect(screen.getByText('Chi tiết')).toBeInTheDocument();
        expect(screen.getByText(/HDG:\s*135°/)).toBeInTheDocument();
    });
});

describe('StaticStreetViewPreview', () => {
    beforeEach(() => {
        mockInvoke.mockReset();
        mockFetch.mockReset();
        vi.restoreAllMocks();
        delete (window as any).google;
    });

    it('shows fallback when coordinates are missing or invalid', async () => {
        render(
            <StaticStreetViewPreview
                lat={NaN}
                lng={NaN}
                heading={90}
                fov={70}
                apiKey="fake-key"
                fallback={<div>HUD Fallback Active</div>}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('HUD Fallback Active')).toBeInTheDocument();
        });
    });

    it('resolves nearest pano coordinates and signs street view URL successfully', async () => {
        mockFetch.mockResolvedValue({
            json: async () => ({
                status: 'OK',
                location: { lat: 10.762, lng: 106.66 }
            })
        });
        mockInvoke.mockResolvedValue('https://signed-url.com/image.jpg');

        render(
            <StaticStreetViewPreview
                lat={10.76}
                lng={106.66}
                heading={90}
                fov={70}
                apiKey="fake-key"
                fallback={<div>HUD Fallback Active</div>}
            />
        );

        expect(screen.getByText('Resolving Nearest Pano...')).toBeInTheDocument();

        await waitFor(() => {
            const img = screen.getByRole('img', { name: /street view preview/i });
            expect(img).toBeInTheDocument();
            expect(img.getAttribute('src')).toBe('https://signed-url.com/image.jpg');
        });

        expect(mockInvoke.mock.calls[0]?.[1]).toMatchObject({
            urlToSign: expect.stringContaining('return_error_code=true')
        });
        expect(screen.getByText(/FOV:\s*70\.0°/)).toBeInTheDocument();
        expect(screen.getAllByText(/HDG:\s*90°/)).toHaveLength(2);
    });

    it('reuses the resolved pano when only heading changes', async () => {
        mockFetch.mockResolvedValue({
            json: async () => ({
                status: 'OK',
                location: { lat: 10.762, lng: 106.66 }
            })
        });
        mockInvoke
            .mockResolvedValueOnce('https://signed-url.com/image-1.jpg')
            .mockResolvedValueOnce('https://signed-url.com/image-2.jpg');

        const { rerender } = render(
            <StaticStreetViewPreview
                lat={10.76}
                lng={106.66}
                heading={90}
                fov={70}
                apiKey="fake-key"
                fallback={<div>HUD Fallback Active</div>}
            />
        );

        await waitFor(() => {
            const img = screen.getByRole('img', { name: /street view preview/i });
            expect(img.getAttribute('src')).toBe('https://signed-url.com/image-1.jpg');
        });

        rerender(
            <StaticStreetViewPreview
                lat={10.76}
                lng={106.66}
                heading={180}
                fov={70}
                apiKey="fake-key"
                fallback={<div>HUD Fallback Active</div>}
            />
        );

        await waitFor(() => {
            const img = screen.getByRole('img', { name: /street view preview/i });
            expect(img.getAttribute('src')).toBe('https://signed-url.com/image-2.jpg');
        });

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockInvoke).toHaveBeenCalledTimes(3);
        expect(mockInvoke.mock.calls[0]?.[1]).toMatchObject({
            urlToSign: expect.stringContaining('location=10.76%2C106.66')
        });
        expect(mockInvoke.mock.calls[1]?.[1]).toMatchObject({
            urlToSign: expect.stringContaining('location=10.762%2C106.66')
        });
        expect(mockInvoke.mock.calls[2]?.[1]).toMatchObject({
            urlToSign: expect.stringContaining('heading=180.00')
        });
    });

    it('uses radius and outdoor source in metadata fallback requests', async () => {
        vi.spyOn(googleMapsLoader, 'waitForGoogleMaps').mockRejectedValue(new Error('SDK timeout'));
        mockFetch.mockResolvedValue({
            json: async () => ({
                status: 'ZERO_RESULTS'
            })
        });

        render(
            <StaticStreetViewPreview
                lat={10.76}
                lng={106.66}
                heading={90}
                fov={70}
                apiKey="fake-key"
                fallback={<div>HUD Fallback Active</div>}
            />
        );

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        const requestUrl = new URL(mockFetch.mock.calls[0][0]);
        expect(requestUrl.searchParams.get('location')).toBe('10.76,106.66');
        expect(requestUrl.searchParams.get('radius')).toBe('200');
        expect(requestUrl.searchParams.get('source')).toBe('outdoor');
        expect(requestUrl.searchParams.get('key')).toBe('fake-key');
    });

    it('still uses the Street View image when pano resolution fails but direct image lookup succeeds', async () => {
        vi.spyOn(googleMapsLoader, 'waitForGoogleMaps').mockRejectedValue(new Error('SDK timeout'));
        mockFetch.mockResolvedValue({
            json: async () => ({
                status: 'ZERO_RESULTS'
            })
        });
        mockInvoke.mockResolvedValue('https://signed-url.com/direct-image.jpg');

        render(
            <StaticStreetViewPreview
                lat={10.76}
                lng={106.66}
                heading={159}
                fov={67.4}
                apiKey="fake-key"
                fallback={<div>HUD Fallback Active</div>}
            />
        );

        await waitFor(() => {
            const img = screen.getByRole('img', { name: /street view preview/i });
            expect(img.getAttribute('src')).toBe('https://signed-url.com/direct-image.jpg');
        });

        expect(screen.queryByText('HUD Fallback Active')).not.toBeInTheDocument();
        expect(mockInvoke.mock.calls[0]?.[1]).toMatchObject({
            urlToSign: expect.stringContaining('location=10.76%2C106.66')
        });
    });

    it('triggers fallback on image loading error', async () => {
        mockFetch.mockResolvedValue({
            json: async () => ({
                status: 'OK',
                location: { lat: 10.762, lng: 106.66 }
            })
        });
        mockInvoke.mockResolvedValue('https://signed-url.com/image.jpg');

        render(
            <StaticStreetViewPreview
                lat={10.76}
                lng={106.66}
                heading={90}
                fov={70}
                apiKey="fake-key"
                fallback={<div>HUD Fallback Active</div>}
            />
        );

        let img: HTMLElement;
        await waitFor(() => {
            img = screen.getByRole('img', { name: /street view preview/i });
            expect(img).toBeInTheDocument();
        });

        img!.dispatchEvent(new Event('error'));

        await waitFor(() => {
            expect(screen.getByText('HUD Fallback Active')).toBeInTheDocument();
        });
    });
});

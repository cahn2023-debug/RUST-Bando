import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CameraHudFallback } from './CameraHudFallback';
import { StaticStreetViewPreview } from './StaticStreetViewPreview';

// Mock Tauri invoke
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
    invoke: (...args: any[]) => mockInvoke(...args)
}));

// Mock Google Maps Loader and Runtime
vi.mock('@TOOL/utils/googleMapsLoader', () => ({
    initGoogleMaps: vi.fn().mockReturnValue(true),
    waitForGoogleMaps: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@TOOL/utils/googleMapsRuntime', () => ({
    getGoogleMapsApiKey: () => 'fake-api-key'
}));

// Mock fetch
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

        // Verify stats overlay
        expect(screen.getByText('85.3°')).toBeInTheDocument();
        expect(screen.getByText('128')).toBeInTheDocument();
        expect(screen.getByText('35m')).toBeInTheDocument();
        expect(screen.getByText('4.5m')).toBeInTheDocument();
        expect(screen.getByText('Chi tiết')).toBeInTheDocument();
        expect(screen.getByText('HDG: 135°')).toBeInTheDocument(); // 45 + 90 = 135°
    });
});

describe('StaticStreetViewPreview', () => {
    beforeEach(() => {
        mockInvoke.mockReset();
        mockFetch.mockReset();
    });

    it('shows loading and then fallback when coordinates are missing or invalid', async () => {
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
        // Mock Metadata API response
        mockFetch.mockResolvedValue({
            json: async () => ({
                status: 'OK',
                location: { lat: 10.762, lng: 106.660 }
            })
        });

        // Mock Tauri sign_streetview_url invoke
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

        // Should initially show loading state
        expect(screen.getByText('Resolving Nearest Pano...')).toBeInTheDocument();

        // Should resolve nearest pano and set signed image src
        await waitFor(() => {
            const img = screen.getByRole('img', { name: /street view preview/i });
            expect(img).toBeInTheDocument();
            expect(img.getAttribute('src')).toBe('https://signed-url.com/image.jpg');
        });

        // Verify overlay HUD labels exist
        expect(screen.getByText('FOV: 70.0°')).toBeInTheDocument();
        expect(screen.getAllByText('HDG: 90°')).toHaveLength(2);
    });

    it('triggers fallback on image loading error', async () => {
        // Mock Metadata API response
        mockFetch.mockResolvedValue({
            json: async () => ({
                status: 'OK',
                location: { lat: 10.762, lng: 106.660 }
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

        // Wait for image to render
        let img: HTMLElement;
        await waitFor(() => {
            img = screen.getByRole('img', { name: /street view preview/i });
            expect(img).toBeInTheDocument();
        });

        // Fire image loading error
        img!.dispatchEvent(new Event('error'));

        // Should switch to fallback rendering
        await waitFor(() => {
            expect(screen.getByText('HUD Fallback Active')).toBeInTheDocument();
        });
    });
});

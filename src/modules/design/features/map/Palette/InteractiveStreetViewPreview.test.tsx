import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractiveStreetViewPreview } from './InteractiveStreetViewPreview';

describe('InteractiveStreetViewPreview', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows fallback when coordinates are invalid', () => {
        render(
            <InteractiveStreetViewPreview
                lat={Number.NaN}
                lng={Number.NaN}
                heading={90}
                fov={70}
                fallback={<div>HUD Fallback Active</div>}
            />
        );

        expect(screen.getByText('HUD Fallback Active')).toBeInTheDocument();
    });

    it('renders the public Street View iframe without an API key', () => {
        render(
            <InteractiveStreetViewPreview
                lat={10.76}
                lng={106.66}
                heading={90}
                fov={70}
                fallback={<div>HUD Fallback Active</div>}
            />
        );

        const iframe = screen.getByTitle('Street View Public Preview');
        const src = iframe.getAttribute('src');

        expect(src).toContain('https://maps.google.com/maps?');
        expect(src).toContain('layer=c');
        expect(src).toContain('cbll=10.76%2C106.66');
        expect(src).toContain('cbp=12%2C90.0%2C0%2C0%2C0');
        expect(src).toContain('output=svembed');
        expect(src).not.toContain('key=');

        act(() => {
            iframe.dispatchEvent(new Event('load'));
        });

        expect(screen.getByText('Street View (Public)')).toBeInTheDocument();
    });

    it('resets loading and updates iframe src when heading changes', () => {
        const { rerender } = render(
            <InteractiveStreetViewPreview
                lat={10.76}
                lng={106.66}
                heading={90}
                fov={70}
                fallback={<div>HUD Fallback Active</div>}
            />
        );

        const firstIframe = screen.getByTitle('Street View Public Preview');
        act(() => {
            firstIframe.dispatchEvent(new Event('load'));
        });

        expect(screen.getByText('Street View (Public)')).toBeInTheDocument();

        rerender(
            <InteractiveStreetViewPreview
                lat={10.76}
                lng={106.66}
                heading={180}
                fov={70}
                fallback={<div>HUD Fallback Active</div>}
            />
        );

        const nextIframe = screen.getByTitle('Street View Public Preview');
        expect(nextIframe.getAttribute('src')).toContain('cbp=12%2C180.0%2C0%2C0%2C0');
        expect(nextIframe.className).toContain('opacity-0');
        expect(screen.queryByText('Street View (Public)')).not.toBeInTheDocument();
    });

    it('falls back to HUD when the public iframe does not finish loading in time', () => {
        render(
            <InteractiveStreetViewPreview
                lat={10.76}
                lng={106.66}
                heading={90}
                fov={70}
                fallback={<div>HUD Fallback Active</div>}
            />
        );

        act(() => {
            vi.advanceTimersByTime(5000);
        });

        expect(screen.getByText('HUD Fallback Active')).toBeInTheDocument();
    });
});

import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapCaptureHandler } from './MapCaptureHandler';

const eventMocks = vi.hoisted(() => ({
  listener: null as ((event: { payload: any }) => void) | null,
  emit: vi.fn(),
}));

const mapMock = vi.hoisted(() => ({
  getContainer: vi.fn(),
  getCenter: vi.fn(),
  getZoom: vi.fn(),
  getPitch: vi.fn(),
  getBearing: vi.fn(),
  resize: vi.fn(),
  fitBounds: vi.fn(),
  jumpTo: vi.fn(),
  triggerRepaint: vi.fn(),
  getCanvas: vi.fn(),
  project: vi.fn(),
  areTilesLoaded: vi.fn(),
  isStyleLoaded: vi.fn(),
  once: vi.fn(),
  off: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_event: string, handler: (event: { payload: any }) => void) => {
    eventMocks.listener = handler;
    return vi.fn();
  }),
  emit: eventMocks.emit,
}));

vi.mock('../MapContext', () => ({
  useMapContext: () => ({ map: mapMock }),
}));

vi.mock('./mapCaptureValidation', () => ({
  validateMapCaptureCanvas: vi.fn(() => ({ valid: true })),
}));

describe('MapCaptureHandler', () => {
  beforeEach(() => {
    eventMocks.listener = null;
    eventMocks.emit.mockReset();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    mapMock.getContainer.mockReturnValue(document.createElement('div'));
    mapMock.getCenter.mockReturnValue({ lng: 106, lat: 10 });
    mapMock.getZoom.mockReturnValue(16);
    mapMock.getPitch.mockReturnValue(0);
    mapMock.getBearing.mockReturnValue(0);
    mapMock.areTilesLoaded.mockReturnValue(true);
    mapMock.isStyleLoaded.mockReturnValue(true);
    mapMock.once.mockImplementation((_event, handler) => handler());
    mapMock.project.mockReturnValue({ x: 0, y: 0 });

    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'width', { value: 800, configurable: true });
    Object.defineProperty(canvas, 'height', { value: 500, configurable: true });
    canvas.toDataURL = vi.fn(() => 'data:image/jpeg;base64,AAAA');
    mapMock.getCanvas.mockReturnValue(canvas);

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'canvas') {
        Object.defineProperty(element, 'width', { writable: true, value: 0, configurable: true });
        Object.defineProperty(element, 'height', { writable: true, value: 0, configurable: true });
        (element as HTMLCanvasElement).getContext = vi.fn(() => ({ drawImage: vi.fn() })) as any;
        (element as HTMLCanvasElement).toDataURL = vi.fn(() => 'data:image/jpeg;base64,BBBB');
        (element as HTMLCanvasElement).toBlob = vi.fn((callback: BlobCallback) => {
          callback(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
        });
      }
      return element;
    }) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('emits capture scope and always restores inactive capture mode', async () => {
    const captureEvents: any[] = [];
    const resultEvents: any[] = [];
    window.addEventListener('design-report-map-capture', (event) => {
      captureEvents.push((event as CustomEvent).detail);
    });
    window.addEventListener('map-capture-result', (event) => {
      resultEvents.push((event as CustomEvent).detail);
    });

    render(<MapCaptureHandler />);

    await waitFor(() => expect(eventMocks.listener).toBeTruthy());
    eventMocks.listener?.({
      payload: {
        captureId: 'capture-1',
        printArea: [10, 106, 10.1, 106.1],
        fitToBounds: true,
        focusFeatureIds: ['route-1', 'intersection-1'],
        hiddenFeatureIds: ['route-2'],
      },
    });

    await waitFor(() => {
      expect(eventMocks.emit).toHaveBeenCalledWith('map-capture-result', {
        captureId: 'capture-1',
        width: 800,
        height: 500,
        mimeType: 'image/jpeg',
      });
    });
    expect(resultEvents[0].image.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(captureEvents[0]).toEqual({
      active: true,
      focusFeatureIds: ['route-1', 'intersection-1'],
      hiddenFeatureIds: ['route-2'],
    });
    expect(captureEvents[captureEvents.length - 1]).toEqual({ active: false });
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageEditorModal } from './ImageEditorModal';

type MockCanvasContext = CanvasRenderingContext2D & {
  clearRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  translate: ReturnType<typeof vi.fn>;
  rotate: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
  strokeRect: ReturnType<typeof vi.fn>;
  ellipse: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  getImageData: ReturnType<typeof vi.fn>;
  putImageData: ReturnType<typeof vi.fn>;
  setLineDash: ReturnType<typeof vi.fn>;
};

describe('ImageEditorModal', () => {
  const onCancel = vi.fn();
  const onSave = vi.fn();
  const sampleUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  let contextMap: WeakMap<HTMLCanvasElement, MockCanvasContext>;
  let contexts: MockCanvasContext[];

  const createContext = (): MockCanvasContext => ({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    ellipse: vi.fn(),
    fillText: vi.fn(),
    getImageData: vi.fn(() => ({})),
    putImageData: vi.fn(),
    setLineDash: vi.fn(),
    globalCompositeOperation: 'source-over',
  } as unknown as MockCanvasContext);

  const getCanvasContext = (canvas: HTMLCanvasElement): MockCanvasContext => {
    const existing = contextMap.get(canvas);
    if (existing) return existing;
    const next = createContext();
    contextMap.set(canvas, next);
    contexts.push(next);
    return next;
  };

  const renderEditor = () => render(
    <ImageEditorModal
      imageUrl={sampleUrl}
      onCancel={onCancel}
      onSave={onSave}
    />
  );

  const drawCropSelection = () => {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const annotationCanvas = canvases[1];
    fireEvent.pointerDown(annotationCanvas, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(annotationCanvas, { clientX: 100, clientY: 60 });
    fireEvent.pointerUp(annotationCanvas);
    return canvases;
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    contextMap = new WeakMap();
    contexts = [];

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function getContextMock(this: HTMLCanvasElement) {
      return getCanvasContext(this);
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,compositeResult');
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 300,
      bottom: 150,
      width: 300,
      height: 150,
      toJSON: () => ({}),
    } as DOMRect);
  });

  it('renders modal with layered canvases and tool buttons', () => {
    renderEditor();

    expect(screen.getByText('Edit Photo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Công cụ cắt ảnh' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bút vẽ tự do (B)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tẩy xóa (E)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đường thẳng (L)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mũi tên' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hình tròn (C)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hình vuông/chữ nhật (R)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chữ ghi chú (T)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dán tem CAD' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xoay 90 độ theo chiều kim đồng hồ' })).toBeInTheDocument();
    expect(document.querySelectorAll('canvas')).toHaveLength(3);
  });

  it('switches active tool when tool buttons are clicked', () => {
    renderEditor();

    const eraserBtn = screen.getByRole('button', { name: 'Tẩy xóa (E)' });
    fireEvent.click(eraserBtn);
    expect(eraserBtn).toHaveClass('bg-cad-accent');

    const lineBtn = screen.getByRole('button', { name: 'Đường thẳng (L)' });
    fireEvent.click(lineBtn);
    expect(lineBtn).toHaveClass('bg-cad-accent');
  });

  it('supports hotkey tool selection (L, T, C, R, B, E)', () => {
    renderEditor();

    fireEvent.keyDown(window, { key: 'l' });
    expect(screen.getByRole('button', { name: 'Đường thẳng (L)' })).toHaveClass('bg-cad-accent');

    fireEvent.keyDown(window, { key: 'c' });
    expect(screen.getByRole('button', { name: 'Hình tròn (C)' })).toHaveClass('bg-cad-accent');

    fireEvent.keyDown(window, { key: 'r' });
    expect(screen.getByRole('button', { name: 'Hình vuông/chữ nhật (R)' })).toHaveClass('bg-cad-accent');

    fireEvent.keyDown(window, { key: 'e' });
    expect(screen.getByRole('button', { name: 'Tẩy xóa (E)' })).toHaveClass('bg-cad-accent');

    fireEvent.keyDown(window, { key: 'b' });
    expect(screen.getByRole('button', { name: 'Bút vẽ tự do (B)' })).toHaveClass('bg-cad-accent');
  });

  it('triggers onCancel when Cancel button or Esc key is pressed', () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('returns composite dataUrl and textAnnotations on save', async () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Save photo' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        dataUrl: 'data:image/png;base64,compositeResult',
        textAnnotations: [],
      });
    });
  });

  it('draws crop guide on the overlay canvas and does not save the overlay', async () => {
    renderEditor();
    const canvases = drawCropSelection();
    const annotationCtx = getCanvasContext(canvases[1]);
    const overlayCtx = getCanvasContext(canvases[2]);

    expect(overlayCtx.strokeRect).toHaveBeenCalledWith(10, 10, 90, 50);
    expect(annotationCtx.strokeRect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save photo' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const overlayWasDrawn = contexts.some(ctx =>
      ctx.drawImage.mock.calls.some(call => call[0] === canvases[2])
    );
    expect(overlayWasDrawn).toBe(false);
  });

  it('applies crop without copying the crop guide overlay', () => {
    renderEditor();
    const canvases = drawCropSelection();
    const overlayCtx = getCanvasContext(canvases[2]);

    fireEvent.click(screen.getByRole('button', { name: 'Apply crop' }));

    const overlayWasDrawn = contexts.some(ctx =>
      ctx.drawImage.mock.calls.some(call => call[0] === canvases[2])
    );
    expect(overlayWasDrawn).toBe(false);
    expect(overlayCtx.clearRect).toHaveBeenCalled();
    expect(screen.queryByAltText('Crop preview')).not.toBeInTheDocument();
  });

  it('applies free crop rotation and resets crop state', () => {
    renderEditor();
    drawCropSelection();
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const bgCtx = getCanvasContext(canvases[0]);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Crop rotation degrees' }), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply crop rotation' }));

    expect(canvases[0].width).toBeGreaterThan(300);
    expect(canvases[0].height).toBeGreaterThan(150);
    expect(bgCtx.rotate).toHaveBeenCalledWith((10 * Math.PI) / 180);
    expect(screen.getByRole('spinbutton', { name: 'Crop rotation degrees' })).toHaveValue(0);
    expect(screen.queryByAltText('Crop preview')).not.toBeInTheDocument();
  });

  it('previews crop rotation on the canvases and still allows crop selection', () => {
    renderEditor();
    drawCropSelection();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Crop rotation degrees' }), {
      target: { value: '-7.5' },
    });

    const canvases = Array.from(document.querySelectorAll('canvas'));
    const overlayCtx = getCanvasContext(canvases[2]);
    const frame = screen.getByTestId('image-editor-canvas-frame');
    expect(frame.style.transform).toBe('');
    expect(canvases[0].width).toBeGreaterThan(300);
    expect(canvases[0].height).toBeGreaterThan(150);
    expect(screen.queryByAltText('Crop preview')).not.toBeInTheDocument();

    drawCropSelection();

    expect(overlayCtx.strokeRect).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Apply crop' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Apply crop' }));

    expect(screen.getByRole('spinbutton', { name: 'Crop rotation degrees' })).toHaveValue(0);
    expect(screen.queryByAltText('Crop preview')).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageEditorModal } from './ImageEditorModal';

describe('ImageEditorModal', () => {
  const onCancel = vi.fn();
  const onSave = vi.fn();
  const sampleUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
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
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,compositeResult');
  });

  it('renders modal with dual canvas and tool buttons', () => {
    render(
      <ImageEditorModal
        imageUrl={sampleUrl}
        onCancel={onCancel}
        onSave={onSave}
      />
    );

    expect(screen.getByText('Chỉnh Sửa Ảnh')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pencil tool (B)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eraser tool (E)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Line tool (L)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arrow tool' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Circle tool (C)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Square tool (R)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Text tool (T)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stamp tool' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rotate 90 deg' })).toBeInTheDocument();
  });

  it('switches active tool when tool buttons are clicked', () => {
    render(
      <ImageEditorModal
        imageUrl={sampleUrl}
        onCancel={onCancel}
        onSave={onSave}
      />
    );

    const eraserBtn = screen.getByRole('button', { name: 'Eraser tool (E)' });
    fireEvent.click(eraserBtn);
    expect(eraserBtn).toHaveClass('bg-indigo-500');

    const lineBtn = screen.getByRole('button', { name: 'Line tool (L)' });
    fireEvent.click(lineBtn);
    expect(lineBtn).toHaveClass('bg-indigo-500');
  });

  it('supports hotkey tool selection (L, T, C, R, B, E)', () => {
    render(
      <ImageEditorModal
        imageUrl={sampleUrl}
        onCancel={onCancel}
        onSave={onSave}
      />
    );

    fireEvent.keyDown(window, { key: 'l' });
    expect(screen.getByRole('button', { name: 'Line tool (L)' })).toHaveClass('bg-indigo-500');

    fireEvent.keyDown(window, { key: 'c' });
    expect(screen.getByRole('button', { name: 'Circle tool (C)' })).toHaveClass('bg-indigo-500');

    fireEvent.keyDown(window, { key: 'r' });
    expect(screen.getByRole('button', { name: 'Square tool (R)' })).toHaveClass('bg-indigo-500');

    fireEvent.keyDown(window, { key: 'e' });
    expect(screen.getByRole('button', { name: 'Eraser tool (E)' })).toHaveClass('bg-indigo-500');

    fireEvent.keyDown(window, { key: 'b' });
    expect(screen.getByRole('button', { name: 'Pencil tool (B)' })).toHaveClass('bg-indigo-500');
  });

  it('triggers onCancel when Cancel button or Esc key is pressed', () => {
    render(
      <ImageEditorModal
        imageUrl={sampleUrl}
        onCancel={onCancel}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('returns composite dataUrl and textAnnotations on save', async () => {
    render(
      <ImageEditorModal
        imageUrl={sampleUrl}
        onCancel={onCancel}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save photo' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        dataUrl: 'data:image/png;base64,compositeResult',
        textAnnotations: [],
      });
    });
  });
});

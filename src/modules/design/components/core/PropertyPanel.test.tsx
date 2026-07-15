import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PropertyPanel } from './PropertyPanel';

const mocks = vi.hoisted(() => ({
  queueEvent: vi.fn(),
  dispatchEvent: vi.fn(),
  selectFeature: vi.fn(),
  setDrawingMode: vi.fn(),
  setSelectedGroup: vi.fn(),
  setActiveParentFeature: vi.fn(),
  setPreview: vi.fn(),
  setEditingFeatureId: vi.fn(),
  togglePalette: vi.fn(),
  startCamera: vi.fn(),
  stopCamera: vi.fn(),
  capture: vi.fn(),
  importMediaAsset: vi.fn(),
  resolveMediaAsset: vi.fn(),
  deleteMediaAsset: vi.fn(),
}));

const cameraState = vi.hoisted(() => ({
  onCapture: null as null | ((dataUrl: string) => void),
}));

const selectedFeature = {
  id: 'feature-1',
  name: 'Camera A',
  geom_type: 'Point',
  group_id: 'group-1',
  layer_id: 'layer-1',
  coordinates: [106.1, 10.2],
  metadata: JSON.stringify({
    media: {
      imageUrls: ['data:image/png;base64,old'],
    },
  }),
  properties: {},
};

const designState = {
  features: {
    [selectedFeature.id]: selectedFeature,
  },
  feature_groups: {
    'group-1': {
      id: 'group-1',
      name: 'Camera Group',
      type: 'cctv',
    },
  },
};

const mockUseDesignSync = vi.hoisted(() => {
  const store = vi.fn(() => ({
    state: designState,
    selectedFeatureId: selectedFeature.id,
    selectFeature: mocks.selectFeature,
    dispatchEvent: mocks.dispatchEvent,
    queueEvent: mocks.queueEvent,
    setDrawingMode: mocks.setDrawingMode,
    setSelectedGroup: mocks.setSelectedGroup,
    setActiveParentFeature: mocks.setActiveParentFeature,
    setPreview: mocks.setPreview,
    previewMetadata: null,
    editingFeatureId: null,
    setEditingFeatureId: mocks.setEditingFeatureId,
    projectId: 'project-1',
    selectionSet: new Set<string>(),
  })) as Mock & {
    getState: Mock;
    setState: Mock;
  };

  store.getState = vi.fn(() => ({ state: designState }));
  store.setState = vi.fn();
  return store;
});

vi.mock('@IMPLEMENT/stores/useDesignSync', () => ({
  useDesignSync: mockUseDesignSync,
}));

vi.mock('@IMPLEMENT/hooks/useProjectData', () => ({
  useProjectData: () => ({ contracts: [] }),
}));

vi.mock('@IMPLEMENT/stores/useLayoutStore', () => ({
  useLayoutStore: (selector: (state: unknown) => unknown) => selector({
    togglePalette: mocks.togglePalette,
    paletteConfigs: {},
  }),
}));

vi.mock('@DESIGN/features/map/Palette/PaletteContext', () => ({
  usePaletteContext: () => ({
    onPin: vi.fn(),
    onClose: vi.fn(),
    isPinned: false,
    dragHandleProps: {},
  }),
}));

vi.mock('@IMPLEMENT/hooks/useCamera', () => ({
  useCamera: (options?: { onCapture?: (dataUrl: string) => void }) => {
    cameraState.onCapture = options?.onCapture ?? null;
    return {
    isCameraOpen: false,
    isCapturing: false,
    videoRef: { current: null },
    canvasRef: { current: null },
    startCamera: mocks.startCamera,
    stopCamera: mocks.stopCamera,
    capture: mocks.capture,
    };
  },
}));

vi.mock('@IMPLEMENT/services/importService', () => ({
  importFromExcel: vi.fn(),
  importFromKML: vi.fn(),
  getExcelHeaders: vi.fn(),
  applyImportedRecords: vi.fn(),
}));

vi.mock('@IMPLEMENT/lib/tauri', () => ({
  safeOpenDialog: vi.fn(),
}));

vi.mock('@IMPLEMENT/services/mediaAssetService', () => ({
  importMediaAsset: mocks.importMediaAsset,
  resolveMediaAsset: mocks.resolveMediaAsset,
  deleteMediaAsset: mocks.deleteMediaAsset,
}));

const createClipboardItem = (file: File) => ({
  kind: 'file',
  type: file.type,
  getAsFile: () => file,
});

const getMediaSection = async () => {
  await screen.findByText('Site Photos');
  const section = screen.getByText('Site Photos').closest('section');
  if (!section) throw new Error('Site Photos section not found');
  return section;
};

describe('PropertyPanel clipboard images', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockClear());
    cameraState.onCapture = null;
    mockUseDesignSync.mockClear();
    mockUseDesignSync.getState.mockClear();
    mockUseDesignSync.setState.mockClear();
    mocks.importMediaAsset.mockImplementation(async (_projectId: string, _featureId: string, dataUrl: string) => ({
      id: dataUrl.includes('jpeg') ? 'asset-jpeg' : 'asset-png',
      assetId: dataUrl.includes('jpeg') ? 'asset-jpeg' : 'asset-png',
      projectId: 'project-1',
      featureId: selectedFeature.id,
      sha256: 'sha',
      relPath: 'project.assets/media/test.png',
      path: 'D:/Code Antinigaty/RUST/project.assets/media/test.png',
      mimeType: dataUrl.includes('jpeg') ? 'image/jpeg' : 'image/png',
      byteSize: 123,
      src: dataUrl.includes('jpeg') ? 'asset://jpeg-preview' : 'asset://png-preview',
    }));
    mocks.resolveMediaAsset.mockImplementation(async (_projectId: string, assetId: string) => ({
      id: assetId,
      assetId,
      projectId: 'project-1',
      featureId: selectedFeature.id,
      sha256: 'sha',
      relPath: `project.assets/media/${assetId}.png`,
      path: `D:/Code Antinigaty/RUST/project.assets/media/${assetId}.png`,
      mimeType: 'image/png',
      byteSize: 123,
      src: `asset://${assetId}`,
    }));
    mocks.deleteMediaAsset.mockResolvedValue(undefined);
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
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,edited');
  });

  it('pastes one clipboard image into media.imageUrls as a draft', async () => {
    render(<PropertyPanel />);
    const mediaSection = await getMediaSection();
    const file = new File(['image-data'], 'site.png', { type: 'image/png' });

    fireEvent.paste(mediaSection, {
      clipboardData: {
        items: [createClipboardItem(file)],
      },
    });

    await waitFor(() => {
      expect(mocks.importMediaAsset).toHaveBeenCalledWith('project-1', selectedFeature.id, expect.stringMatching(/^data:image\/png;base64,/));
      expect(mocks.queueEvent).toHaveBeenCalledWith({
        type: 'FeatureUpdated',
        payload: expect.objectContaining({
          id: selectedFeature.id,
          name: 'Camera A',
        }),
      });
      expect(mocks.setPreview).toHaveBeenCalledWith(
        selectedFeature.id,
        expect.objectContaining({
          media: expect.objectContaining({
            imageAssetIds: ['asset-png'],
            primaryImageAssetId: 'asset-png',
            imageUrl: 'data:image/png;base64,old',
            imageUrls: ['data:image/png;base64,old'],
          }),
        }),
        'Camera A',
      );
    });
  });

  it('appends multiple pasted images and keeps existing photos', async () => {
    render(<PropertyPanel />);
    const mediaSection = await getMediaSection();
    const png = new File(['png-data'], 'one.png', { type: 'image/png' });
    const jpeg = new File(['jpeg-data'], 'two.jpg', { type: 'image/jpeg' });

    fireEvent.paste(mediaSection, {
      clipboardData: {
        items: [createClipboardItem(png), createClipboardItem(jpeg)],
      },
    });

    await waitFor(() => {
      expect(mocks.setPreview).toHaveBeenCalledWith(
        selectedFeature.id,
        expect.objectContaining({
          media: expect.objectContaining({
            imageAssetIds: ['asset-png', 'asset-jpeg'],
            primaryImageAssetId: 'asset-png',
            imageUrl: 'data:image/png;base64,old',
            imageUrls: ['data:image/png;base64,old'],
          }),
        }),
        'Camera A',
      );
    });
  });

  it('ignores clipboard content without images', async () => {
    render(<PropertyPanel />);
    const mediaSection = await getMediaSection();

    fireEvent.paste(mediaSection, {
      clipboardData: {
        items: [{
          kind: 'string',
          type: 'text/plain',
          getAsFile: () => null,
        }],
      },
    });

    await waitFor(() => {
      expect(mocks.setPreview).not.toHaveBeenCalled();
    });
  });

  it('removes an asset-backed image and keeps legacy images', async () => {
    mockUseDesignSync.mockReturnValue({
      state: designState,
      selectedFeatureId: selectedFeature.id,
      selectFeature: mocks.selectFeature,
      dispatchEvent: mocks.dispatchEvent,
      queueEvent: mocks.queueEvent,
      setDrawingMode: mocks.setDrawingMode,
      setSelectedGroup: mocks.setSelectedGroup,
      setActiveParentFeature: mocks.setActiveParentFeature,
      setPreview: mocks.setPreview,
      previewMetadata: {
        id: selectedFeature.id,
        name: 'Camera A',
        metadata: {
          media: {
            imageAssetIds: ['asset-1'],
            primaryImageAssetId: 'asset-1',
            imageUrls: ['data:image/png;base64,old'],
          },
        },
      },
      editingFeatureId: null,
      setEditingFeatureId: mocks.setEditingFeatureId,
      projectId: 'project-1',
      selectionSet: new Set<string>(),
    });

    render(<PropertyPanel />);
    await screen.findAllByRole('button', { name: 'Remove' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);

    await waitFor(() => {
      expect(mocks.deleteMediaAsset).toHaveBeenCalledWith('project-1', 'asset-1');
        expect(mocks.setPreview).toHaveBeenCalledWith(
        selectedFeature.id,
        expect.objectContaining({
          media: expect.objectContaining({
            imageUrls: ['data:image/png;base64,old'],
            imageAssetIds: [],
          }),
        }),
        'Camera A',
      );
    });
  });

  it('opens the image editor for an attached image', async () => {
    render(<PropertyPanel />);

    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[0]);

    expect(await screen.findByText('Edit Photo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stamp tool' })).toBeInTheDocument();
    expect(screen.getByLabelText('Stroke pattern')).toBeInTheDocument();
    expect(screen.getByLabelText('Asset stamp')).toBeInTheDocument();
    expect(screen.getByLabelText('Text size')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OK text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save photo' })).toBeInTheDocument();
  });

  it('replaces the edited image at the same index and keeps other photos', async () => {
    mockUseDesignSync.mockReturnValue({
      state: designState,
      selectedFeatureId: selectedFeature.id,
      selectFeature: mocks.selectFeature,
      dispatchEvent: mocks.dispatchEvent,
      queueEvent: mocks.queueEvent,
      setDrawingMode: mocks.setDrawingMode,
      setSelectedGroup: mocks.setSelectedGroup,
      setActiveParentFeature: mocks.setActiveParentFeature,
      setPreview: mocks.setPreview,
      previewMetadata: {
        id: selectedFeature.id,
        name: 'Camera A',
        metadata: {
          media: {
            imageAssetIds: ['asset-1', 'asset-2'],
            primaryImageAssetId: 'asset-1',
          },
        },
      },
      editingFeatureId: null,
      setEditingFeatureId: mocks.setEditingFeatureId,
      projectId: 'project-1',
      selectionSet: new Set<string>(),
    });

    render(<PropertyPanel />);
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[1]);
    fireEvent.click(await screen.findByRole('button', { name: 'Save photo' }));

    await waitFor(() => {
      expect(mocks.importMediaAsset).toHaveBeenCalledWith('project-1', selectedFeature.id, 'data:image/png;base64,edited');
      expect(mocks.deleteMediaAsset).toHaveBeenCalledWith('project-1', 'asset-2');
      expect(mocks.setPreview).toHaveBeenCalledWith(
        selectedFeature.id,
        expect.objectContaining({
          media: expect.objectContaining({
            imageAssetIds: ['asset-1', 'asset-png'],
            primaryImageAssetId: 'asset-1',
          }),
        }),
        'Camera A',
      );
    });
    await waitFor(() => {
      expect(mocks.queueEvent).toHaveBeenCalledWith({
        type: 'FeatureUpdated',
        payload: expect.objectContaining({
          id: selectedFeature.id,
          name: 'Camera A',
          metadata: expect.stringContaining('asset-png'),
        }),
      });
    });
  });

  it('imports a captured image into media assets immediately', async () => {
    render(<PropertyPanel />);

    expect(cameraState.onCapture).toBeTypeOf('function');
    await cameraState.onCapture?.('data:image/png;base64,captured');

    await waitFor(() => {
      expect(mocks.importMediaAsset).toHaveBeenCalledWith('project-1', selectedFeature.id, 'data:image/png;base64,captured');
      expect(mocks.queueEvent).toHaveBeenCalledWith({
        type: 'FeatureUpdated',
        payload: expect.objectContaining({
          id: selectedFeature.id,
          metadata: expect.stringContaining('asset-png'),
        }),
      });
    });
  });

  it('shows an error and leaves metadata unchanged when media import fails', async () => {
    mocks.importMediaAsset.mockRejectedValueOnce(new Error('disk full'));

    render(<PropertyPanel />);
    const mediaSection = await getMediaSection();
    const file = new File(['image-data'], 'site.png', { type: 'image/png' });

    fireEvent.paste(mediaSection, {
      clipboardData: {
        items: [createClipboardItem(file)],
      },
    });

    expect(await screen.findByText('Không thể lưu ảnh vào thư mục dự án. Vui lòng thử lại.')).toBeInTheDocument();
    expect(mocks.setPreview).not.toHaveBeenCalled();
    expect(mocks.queueEvent).not.toHaveBeenCalled();
  });

  it('still renders legacy imageUrls alongside asset-backed photos', async () => {
    mockUseDesignSync.mockReturnValue({
      state: designState,
      selectedFeatureId: selectedFeature.id,
      selectFeature: mocks.selectFeature,
      dispatchEvent: mocks.dispatchEvent,
      queueEvent: mocks.queueEvent,
      setDrawingMode: mocks.setDrawingMode,
      setSelectedGroup: mocks.setSelectedGroup,
      setActiveParentFeature: mocks.setActiveParentFeature,
      setPreview: mocks.setPreview,
      previewMetadata: {
        id: selectedFeature.id,
        name: 'Camera A',
        metadata: {
          media: {
            imageAssetIds: ['asset-1'],
            primaryImageAssetId: 'asset-1',
            imageUrls: ['data:image/png;base64,legacy'],
          },
        },
      },
      editingFeatureId: null,
      setEditingFeatureId: mocks.setEditingFeatureId,
      projectId: 'project-1',
      selectionSet: new Set<string>(),
    });

    render(<PropertyPanel />);

    await waitFor(async () => {
      const images = await screen.findAllByRole('img');
      expect(images).toHaveLength(2);
      expect(images[0]).toHaveAttribute('src', 'asset://asset-1');
      expect(images[1]).toHaveAttribute('src', 'data:image/png;base64,legacy');
    });
  });

  it('cancels image editing without updating metadata', async () => {
    render(<PropertyPanel />);

    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Edit Photo')).not.toBeInTheDocument();
    expect(mocks.setPreview).not.toHaveBeenCalled();
  });

  it('does not deselect the map feature when Escape exits the image editor', async () => {
    render(<PropertyPanel />);

    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[0]);
    expect(await screen.findByText('Edit Photo')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByText('Edit Photo')).not.toBeInTheDocument();
    });
    expect(mocks.selectFeature).not.toHaveBeenCalled();
    expect(mocks.setActiveParentFeature).not.toHaveBeenCalled();
  });

  it('shows display order through the merged code field instead of a DISPLAY ORDER dynamic spec', async () => {
    const originalMetadata = selectedFeature.metadata;
    selectedFeature.metadata = JSON.stringify({ display_order: '21_4' });
    mockUseDesignSync.mockReturnValue({
      state: designState,
      selectedFeatureId: selectedFeature.id,
      selectFeature: mocks.selectFeature,
      dispatchEvent: mocks.dispatchEvent,
      queueEvent: mocks.queueEvent,
      setDrawingMode: mocks.setDrawingMode,
      setSelectedGroup: mocks.setSelectedGroup,
      setActiveParentFeature: mocks.setActiveParentFeature,
      setPreview: mocks.setPreview,
      previewMetadata: null,
      editingFeatureId: null,
      setEditingFeatureId: mocks.setEditingFeatureId,
      projectId: 'project-1',
      selectionSet: new Set<string>(),
    });

    render(<PropertyPanel />);

    await screen.findByDisplayValue('21_4');
    expect(screen.queryByText(/display order/i)).not.toBeInTheDocument();

    selectedFeature.metadata = originalMetadata;
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PropertyPanel } from './PropertyPanel';

const mocks = vi.hoisted(() => ({
  queueEvent: vi.fn(),
  queueEvents: vi.fn(),
  dispatchEvent: vi.fn(),
  dispatchEvents: vi.fn(),
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
  replaceMediaAsset: vi.fn(),
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
    dispatchEvents: mocks.dispatchEvents,
    queueEvent: mocks.queueEvent,
    queueEvents: mocks.queueEvents,
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
  replaceMediaAsset: mocks.replaceMediaAsset,
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

const getLastPatchedMetadata = () => {
  const call = mockUseDesignSync.setState.mock.calls[mockUseDesignSync.setState.mock.calls.length - 1]?.[0];
  const metadata = call?.state?.features?.[selectedFeature.id]?.metadata;
  return JSON.parse(metadata || '{}');
};

describe('PropertyPanel clipboard images', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockClear());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    cameraState.onCapture = null;
    mockUseDesignSync.mockClear();
    mockUseDesignSync.getState.mockClear();
    mockUseDesignSync.setState.mockClear();
    const importedIds: string[] = [];
    mocks.importMediaAsset.mockImplementation(async (_projectId: string, _featureId: string, dataUrl: string) => ({
      ...(() => {
        const assetId = dataUrl.includes('jpeg') ? 'asset-jpeg' : 'asset-png';
        if (!importedIds.includes(assetId)) importedIds.push(assetId);
        return {
          id: assetId,
          assetId,
          projectId: 'project-1',
          featureId: selectedFeature.id,
          sha256: 'sha',
          relPath: 'project.assets/media/test.png',
          path: 'D:/Code Antinigaty/RUST/project.assets/media/test.png',
          mimeType: dataUrl.includes('jpeg') ? 'image/jpeg' : 'image/png',
          byteSize: 123,
          src: dataUrl.includes('jpeg') ? 'asset://jpeg-preview' : 'asset://png-preview',
          featurePatch: {
            id: selectedFeature.id,
            name: 'Camera A',
            metadata: JSON.stringify({
              media: {
                imageAssetIds: [...importedIds],
                primaryImageAssetId: importedIds[0],
                imageUrl: 'data:image/png;base64,old',
                imageUrls: ['data:image/png;base64,old'],
              },
            }),
            properties: selectedFeature.properties,
          },
        };
      })(),
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
    mocks.deleteMediaAsset.mockResolvedValue({
      featurePatch: {
        id: selectedFeature.id,
        name: 'Camera A',
        metadata: JSON.stringify({
          media: {
            imageAssetIds: [],
            imageUrls: ['data:image/png;base64,old'],
          },
        }),
        properties: selectedFeature.properties,
      },
    });
    mocks.replaceMediaAsset.mockResolvedValue({
      id: 'asset-png',
      assetId: 'asset-png',
      projectId: 'project-1',
      featureId: selectedFeature.id,
      sha256: 'sha',
      relPath: 'project.assets/media/test.png',
      path: 'D:/Code Antinigaty/RUST/project.assets/media/test.png',
      mimeType: 'image/png',
      byteSize: 123,
      src: 'asset://png-preview',
      featurePatch: {
        id: selectedFeature.id,
        name: 'Camera A',
        metadata: JSON.stringify({
          media: {
            imageAssetIds: ['asset-1', 'asset-png'],
            primaryImageAssetId: 'asset-1',
          },
        }),
        properties: selectedFeature.properties,
      },
    });
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
      expect(mocks.queueEvent).not.toHaveBeenCalled();
      expect(getLastPatchedMetadata()).toMatchObject({
        media: expect.objectContaining({
          imageAssetIds: ['asset-png'],
          primaryImageAssetId: 'asset-png',
          imageUrl: 'data:image/png;base64,old',
          imageUrls: ['data:image/png;base64,old'],
        }),
      });
    });
  });

  it('preserves unsaved text draft edits when an image is imported', async () => {
    render(<PropertyPanel />);
    const notesInput = await screen.findByLabelText('Survey Notes');
    fireEvent.change(notesInput, { target: { value: 'Unsaved note draft' } });

    const mediaSection = await getMediaSection();
    const file = new File(['image-data'], 'site.png', { type: 'image/png' });

    fireEvent.paste(mediaSection, {
      clipboardData: {
        items: [createClipboardItem(file)],
      },
    });

    await waitFor(() => {
      expect(mocks.importMediaAsset).toHaveBeenCalled();
    });

    expect(notesInput).toHaveValue('Unsaved note draft');
    expect(screen.getByRole('button', { name: /save specs/i })).not.toBeDisabled();
  });

  it('clamps and persists point size changes into metadata and properties', async () => {
    const originalMetadata = selectedFeature.metadata;
    const originalProperties = selectedFeature.properties;
    try {
      selectedFeature.properties = {
        icon: 'point_circle',
        iconKey: 'point_circle',
        type: 'point',
        color: '#3b82f6',
        size: 32,
      };
      selectedFeature.metadata = JSON.stringify({
        icon: 'point_circle',
        type: 'point',
        color: '#3b82f6',
        size: 32,
      });

      render(<PropertyPanel />);
      const sizeInput = await screen.findByLabelText('Size');
      await waitFor(() => expect(sizeInput).toHaveValue(32));

      fireEvent.change(sizeInput, { target: { value: '255252' } });
      await waitFor(() => expect(sizeInput).toHaveValue(100));
      const saveButton = screen.getByRole('button', { name: /save specs/i });
      await waitFor(() => expect(saveButton).not.toBeDisabled());
      fireEvent.click(saveButton);

      await waitFor(() => expect(mocks.queueEvent).toHaveBeenCalledTimes(1));
      const payload = mocks.queueEvent.mock.calls[0][0].payload;
      const savedMetadata = JSON.parse(payload.metadata);
      expect(savedMetadata).toMatchObject({
        icon: 'point_circle',
        type: 'point',
        color: '#3b82f6',
        size: 100,
        gis: expect.objectContaining({
          size: 100,
        }),
      });
      expect(payload.properties).toMatchObject({
        icon: 'point_circle',
        iconKey: 'point_circle',
        type: 'point',
        color: '#3b82f6',
        size: 100,
      });
    } finally {
      selectedFeature.metadata = originalMetadata;
      selectedFeature.properties = originalProperties;
    }
  });

  it('pastes an image without changing a nested camera into a standalone point', async () => {
    const originalMetadata = selectedFeature.metadata;
    const originalProperties = selectedFeature.properties;
    selectedFeature.properties = {
      icon: 'cctv',
      iconKey: 'cctv',
      type: 'cctv',
    };
    selectedFeature.metadata = JSON.stringify({
      parent_feature_id: 'intersection-1',
      media: {
        imageUrls: ['data:image/png;base64,old'],
      },
    });

    render(<PropertyPanel />);
    const mediaSection = await getMediaSection();
    const file = new File(['image-data'], 'site.png', { type: 'image/png' });

    fireEvent.paste(mediaSection, {
      clipboardData: {
        items: [createClipboardItem(file)],
      },
    });

    await waitFor(() => {
      expect(mocks.importMediaAsset).toHaveBeenCalled();
      expect(mocks.queueEvent).not.toHaveBeenCalled();
    });
    expect(getLastPatchedMetadata()).toMatchObject({
      media: expect.objectContaining({
        imageAssetIds: ['asset-png'],
      }),
    });

    selectedFeature.metadata = originalMetadata;
    selectedFeature.properties = originalProperties;
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
      expect(getLastPatchedMetadata()).toMatchObject({
        media: expect.objectContaining({
          imageAssetIds: ['asset-png', 'asset-jpeg'],
          primaryImageAssetId: 'asset-png',
          imageUrl: 'data:image/png;base64,old',
          imageUrls: ['data:image/png;base64,old'],
        }),
      });
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
      dispatchEvents: mocks.dispatchEvents,
      queueEvent: mocks.queueEvent,
      queueEvents: mocks.queueEvents,
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
      expect(getLastPatchedMetadata()).toMatchObject({
        media: expect.objectContaining({
          imageUrls: ['data:image/png;base64,old'],
          imageAssetIds: [],
        }),
      });
    });
  });

  it('opens the image editor for an attached image', async () => {
    render(<PropertyPanel />);

    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[0]);

    expect(await screen.findByText('Edit Photo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stamp tool' })).toBeInTheDocument();
    expect(screen.getByLabelText('Stroke pattern')).toBeInTheDocument();
    expect(screen.getByLabelText('Asset stamp')).toBeInTheDocument();
    expect(screen.getByLabelText('Text size')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OK text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save photo' })).toBeInTheDocument();
  });

  it('scopes image editor shortcuts to the open editor and ignores text inputs', async () => {
    render(<PropertyPanel />);

    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[0]);
    expect(await screen.findByText('Edit Photo')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'l' });
    expect(screen.getByRole('button', { name: 'Line tool (L)' })).toHaveClass('bg-cad-accent');

    fireEvent.keyDown(window, { key: 'C' });
    expect(screen.getByRole('button', { name: 'Circle tool (C)' })).toHaveClass('bg-cad-accent');

    fireEvent.keyDown(window, { key: 'r' });
    expect(screen.getByRole('button', { name: 'Square tool (R)' })).toHaveClass('bg-cad-accent');

    fireEvent.keyDown(window, { key: 'T' });
    expect(screen.getByRole('button', { name: 'Text tool (T)' })).toHaveClass('bg-cad-accent');

    fireEvent.keyDown(screen.getByLabelText('Text value'), { key: 'l' });
    expect(screen.getByRole('button', { name: 'Text tool (T)' })).toHaveClass('bg-cad-accent');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(window, { key: 'l' });
    expect(screen.queryByText('Edit Photo')).not.toBeInTheDocument();
  });

  it('replaces the edited image at the same index and keeps other photos', async () => {
    mockUseDesignSync.mockReturnValue({
      state: designState,
      selectedFeatureId: selectedFeature.id,
      selectFeature: mocks.selectFeature,
      dispatchEvent: mocks.dispatchEvent,
      dispatchEvents: mocks.dispatchEvents,
      queueEvent: mocks.queueEvent,
      queueEvents: mocks.queueEvents,
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
      expect(mocks.replaceMediaAsset).toHaveBeenCalledWith('project-1', selectedFeature.id, 'asset-2', 'data:image/png;base64,edited');
      expect(mocks.deleteMediaAsset).not.toHaveBeenCalledWith('project-1', 'asset-2');
      expect(getLastPatchedMetadata()).toMatchObject({
        media: expect.objectContaining({
          imageAssetIds: ['asset-1', 'asset-png'],
          primaryImageAssetId: 'asset-1',
        }),
      });
      expect(mocks.queueEvent).not.toHaveBeenCalled();
    });
  });

  it('saves added image text into the object description', async () => {
    const originalMetadata = selectedFeature.metadata;
    selectedFeature.metadata = JSON.stringify({
      description: 'Existing note',
      media: {
        imageUrls: ['data:image/png;base64,old'],
      },
    });
    mockUseDesignSync.mockReturnValue({
      state: designState,
      selectedFeatureId: selectedFeature.id,
      selectFeature: mocks.selectFeature,
      dispatchEvent: mocks.dispatchEvent,
      dispatchEvents: mocks.dispatchEvents,
      queueEvent: mocks.queueEvent,
      queueEvents: mocks.queueEvents,
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
    await screen.findAllByDisplayValue('Existing note');
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[0]);
    await screen.findByText('Edit Photo');

    fireEvent.keyDown(window, { key: 't' });
    fireEvent.change(screen.getByLabelText('Text value'), { target: { value: 'Photo label' } });
    const canvases = document.querySelectorAll('canvas');
    const canvas = canvases[canvases.length - 1];
    if (!canvas) throw new Error('Image editor canvas not found');
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole('button', { name: 'OK text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save photo' }));

    await waitFor(() => {
      const payload = mocks.queueEvent.mock.calls[mocks.queueEvent.mock.calls.length - 1]?.[0].payload;
      const savedMetadata = JSON.parse(payload.metadata);
      expect(savedMetadata.description).toBe('Existing note\nPhoto label');
    });

    selectedFeature.metadata = originalMetadata;
  });

  it('does not save image text that was undone before saving', async () => {
    const originalMetadata = selectedFeature.metadata;
    selectedFeature.metadata = JSON.stringify({
      description: 'Existing note',
      media: {
        imageUrls: ['data:image/png;base64,old'],
      },
    });
    mockUseDesignSync.mockReturnValue({
      state: designState,
      selectedFeatureId: selectedFeature.id,
      selectFeature: mocks.selectFeature,
      dispatchEvent: mocks.dispatchEvent,
      dispatchEvents: mocks.dispatchEvents,
      queueEvent: mocks.queueEvent,
      queueEvents: mocks.queueEvents,
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
    await screen.findAllByDisplayValue('Existing note');
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[0]);
    await screen.findByText('Edit Photo');

    fireEvent.keyDown(window, { key: 't' });
    fireEvent.change(screen.getByLabelText('Text value'), { target: { value: 'Removed label' } });
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('Image editor canvas not found');
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole('button', { name: 'OK text' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save photo' }));

    await waitFor(() => {
      const payload = mocks.queueEvent.mock.calls[mocks.queueEvent.mock.calls.length - 1]?.[0].payload;
      const savedMetadata = JSON.parse(payload.metadata);
      expect(savedMetadata.description).toBe('Existing note');
    });

    selectedFeature.metadata = originalMetadata;
  });

  it('imports a captured image into media assets immediately', async () => {
    render(<PropertyPanel />);

    expect(cameraState.onCapture).toBeTypeOf('function');
    await cameraState.onCapture?.('data:image/png;base64,captured');

    await waitFor(() => {
      expect(mocks.importMediaAsset).toHaveBeenCalledWith('project-1', selectedFeature.id, 'data:image/png;base64,captured');
      expect(mocks.queueEvent).not.toHaveBeenCalled();
      expect(getLastPatchedMetadata().media.imageAssetIds).toEqual(['asset-png']);
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
      dispatchEvents: mocks.dispatchEvents,
      queueEvent: mocks.queueEvent,
      queueEvents: mocks.queueEvents,
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
      dispatchEvents: mocks.dispatchEvents,
      queueEvent: mocks.queueEvent,
      queueEvents: mocks.queueEvents,
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

  it('hides internal metadata keys but preserves them when saving user edits', async () => {
    const originalMetadata = selectedFeature.metadata;
    const originalProperties = selectedFeature.properties;
    selectedFeature.properties = {
      icon: 'cctv',
      iconKey: 'cctv',
      type: 'cctv',
    };
    selectedFeature.metadata = JSON.stringify({
      parent_feature_id: 'parent-uuid',
      start_node_id: 'start-uuid',
      end_node_id: 'end-uuid',
      snap_links: { v0: 'parent-uuid' },
      vertexMetadata: { 0: { description: 'hidden vertex' } },
      ai: { model: 'hidden-model' },
      network: {
        from_feature_id: 'start-uuid',
        to_feature_id: 'end-uuid',
      },
    });

    render(<PropertyPanel />);

    await screen.findByText('Object Metadata');
    expect(screen.queryByText(/parent feature id/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/start node id/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/end node id/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/snap links/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/vertexmetadata/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hidden-model/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\{\}/)).not.toBeInTheDocument();

    const notesInput = screen.getByLabelText('Survey Notes');
    fireEvent.change(notesInput, { target: { value: 'Checked in field' } });
    await waitFor(() => expect(notesInput).toHaveValue('Checked in field'));
    fireEvent.click(screen.getByRole('button', { name: /save specs/i }));

    await waitFor(() => {
      expect(mocks.queueEvent).toHaveBeenCalledWith({
        type: 'FeatureUpdated',
        payload: expect.objectContaining({
          id: selectedFeature.id,
          metadata: expect.stringContaining('parent_feature_id'),
        }),
      });
    });
    const payload = mocks.queueEvent.mock.calls[mocks.queueEvent.mock.calls.length - 1][0].payload;
    const savedMetadata = JSON.parse(payload.metadata);
    expect(payload).not.toHaveProperty('group_id');
    expect(payload).not.toHaveProperty('geom_type');
    expect(payload).not.toHaveProperty('layer_id');
    expect(payload.properties).toMatchObject({
      icon: 'cctv',
      iconKey: 'cctv',
      type: 'cctv',
    });
    expect(savedMetadata).toMatchObject({
      icon: 'cctv',
      type: 'cctv',
      description: 'Checked in field',
      parent_feature_id: 'parent-uuid',
      start_node_id: 'start-uuid',
      end_node_id: 'end-uuid',
      snap_links: { v0: 'parent-uuid' },
      vertexMetadata: { 0: { description: 'hidden vertex' } },
      ai: { model: 'hidden-model' },
      network: {
        from_feature_id: 'start-uuid',
        to_feature_id: 'end-uuid',
      },
    });

    selectedFeature.metadata = originalMetadata;
    selectedFeature.properties = originalProperties;
  });

  it('renders camera metadata fields from specs and GIS metadata', async () => {
    const originalMetadata = selectedFeature.metadata;
    selectedFeature.metadata = JSON.stringify({
      icon: 'cctv',
      type: 'cctv',
      specs: {
        install_height: 4.5,
        focal_length: 8,
        sensor_size: '1/2.8',
        resolution_x: 1920,
        resolution_y: 1080,
        target_distance: 30,
        target_height: 1.7,
      },
      gis: {
        rotation: 90,
        fov_angle: 65,
        fov_radius: 40,
        fov_visible: true,
      },
      network: {
        telemetry_id: 'CAM-001',
      },
    });

    render(<PropertyPanel />);

    await screen.findByText('Camera Metadata');
    expect(screen.getByLabelText('Telemetry ID')).toHaveValue('CAM-001');
    expect(screen.getByLabelText('Install Height')).toHaveValue('4.5');
    expect(screen.getByLabelText('Focal Length')).toHaveValue('8');
    expect(screen.getByLabelText('Sensor Size')).toHaveValue('1/2.8');
    expect(screen.getByLabelText('Resolution X')).toHaveValue('1920');
    expect(screen.getByLabelText('Resolution Y')).toHaveValue('1080');
    expect(screen.getByLabelText('Rotation')).toHaveValue('90');
    expect(screen.getByLabelText('FOV Angle')).toHaveValue('65');
    expect(screen.getByLabelText('FOV Radius')).toHaveValue('40');
    expect(screen.getByLabelText('Target Distance')).toHaveValue('30');
    expect(screen.getByLabelText('Target Height')).toHaveValue('1.7');
    expect(screen.getByLabelText('Show FOV')).toBeChecked();

    selectedFeature.metadata = originalMetadata;
  });

  it('renders fiber line route names without exposing endpoint UUID metadata', async () => {
    const originalFeature = { ...selectedFeature };
    Object.assign(selectedFeature, {
      geom_type: 'LineString',
      name: 'Signal Line A',
      coordinates: [[106.1, 10.2], [106.2, 10.3]],
      metadata: JSON.stringify({
        infrastructure: {
          type: 'SignalLine',
          cable_type: 'FO-24',
          core_count: 24,
        },
        network: {
          from_feature_id: 'node-start',
          to_feature_id: 'node-end',
          direction_mode: 'auto',
        },
        start_node_id: 'node-start',
        end_node_id: 'node-end',
        snap_links: { v0: 'node-start', v1: 'node-mid', v2: 'node-end' },
      }),
    });
    const stateWithLine = {
      ...designState,
      features: {
        ...designState.features,
        [selectedFeature.id]: selectedFeature,
        'node-start': {
          id: 'node-start',
          name: 'Intersection Start',
          geom_type: 'Point',
          group_id: 'group-1',
          layer_id: 'layer-1',
          coordinates: [106.1, 10.2],
          metadata: JSON.stringify({ display_order: '01' }),
          properties: {},
        },
        'node-mid': {
          id: 'node-mid',
          name: 'Position Mid',
          geom_type: 'Point',
          group_id: 'group-1',
          layer_id: 'layer-1',
          coordinates: [106.15, 10.25],
          metadata: '{}',
          properties: {},
        },
        'node-end': {
          id: 'node-end',
          name: 'Camera End',
          geom_type: 'Point',
          group_id: 'group-1',
          layer_id: 'layer-1',
          coordinates: [106.2, 10.3],
          metadata: '{}',
          properties: { stt: '03' },
        },
      },
    };
    mockUseDesignSync.mockReturnValue({
      state: stateWithLine,
      selectedFeatureId: selectedFeature.id,
      selectFeature: mocks.selectFeature,
      dispatchEvent: mocks.dispatchEvent,
      dispatchEvents: mocks.dispatchEvents,
      queueEvent: mocks.queueEvent,
      queueEvents: mocks.queueEvents,
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

    await screen.findByText('Line Metadata');
    expect(screen.getByText('01.Intersection Start - Position Mid - 03.Camera End')).toBeInTheDocument();
    expect(screen.getByText('Cáp quang')).toBeInTheDocument();
    expect(screen.getByLabelText('Loại cáp')).toHaveValue('FO-24');
    expect(screen.getByLabelText('Dung lượng cáp')).toHaveValue('24');
    expect(screen.queryByText(/Power Line/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Trench/i)).not.toBeInTheDocument();
    expect(screen.queryByText('node-start')).not.toBeInTheDocument();
    expect(screen.queryByText('node-end')).not.toBeInTheDocument();
    expect(screen.queryByText(/snap links/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/direction mode/i)).not.toBeInTheDocument();

    Object.assign(selectedFeature, originalFeature);
  });

  it('saves fiber line metadata and existing fiber cable in the same batch', async () => {
    const originalFeature = { ...selectedFeature };
    Object.assign(selectedFeature, {
      geom_type: 'LineString',
      name: 'Signal Line A',
      coordinates: [[106.1, 10.2], [106.2, 10.3]],
      metadata: JSON.stringify({
        infrastructure: {
          type: 'PowerLine',
          cable_type: 'FO-24',
          core_count: 24,
        },
        start_node_id: 'node-start',
        end_node_id: 'node-end',
      }),
    });
    const stateWithCable = {
      ...designState,
      features: {
        ...designState.features,
        [selectedFeature.id]: selectedFeature,
        'node-start': {
          id: 'node-start',
          name: 'Start',
          geom_type: 'Point',
          group_id: 'group-1',
          layer_id: 'layer-1',
          coordinates: [106.1, 10.2],
          metadata: '{}',
          properties: {},
        },
        'node-end': {
          id: 'node-end',
          name: 'End',
          geom_type: 'Point',
          group_id: 'group-1',
          layer_id: 'layer-1',
          coordinates: [106.2, 10.3],
          metadata: '{}',
          properties: {},
        },
      },
      inventory: {
        cables: [{
          id: 'existing-cable-1',
          project_id: 'project-1',
          feature_id: selectedFeature.id,
          cable_type: 'FO-24',
          fiber_count: 24,
          owner: 'owner-1',
          status: 'active',
          source: 'legacy',
          created_at: '',
          updated_at: '',
        }],
      },
    };
    mockUseDesignSync.mockReturnValue({
      state: stateWithCable,
      selectedFeatureId: selectedFeature.id,
      selectFeature: mocks.selectFeature,
      dispatchEvent: mocks.dispatchEvent,
      dispatchEvents: mocks.dispatchEvents,
      queueEvent: mocks.queueEvent,
      queueEvents: mocks.queueEvents,
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
    const cableTypeInput = await screen.findByLabelText('Loại cáp');
    fireEvent.change(cableTypeInput, { target: { value: 'FO-48' } });
    fireEvent.click(screen.getByRole('button', { name: /save specs/i }));

    await waitFor(() => expect(mocks.queueEvents).toHaveBeenCalledTimes(1));
    const events = mocks.queueEvents.mock.calls[0][0];
    expect(events.map((event: { type: string }) => event.type)).toEqual(['FeatureUpdated', 'FiberCableUpserted']);
    const savedMetadata = JSON.parse(events[0].payload.metadata);
    expect(savedMetadata.infrastructure).toMatchObject({
      type: 'SignalLine',
      cable_type: 'FO-48',
      core_count: 24,
    });
    expect(events[1].payload).toMatchObject({
      id: 'existing-cable-1',
      project_id: 'project-1',
      feature_id: selectedFeature.id,
      cable_type: 'FO-48',
      fiber_count: 24,
      owner: 'owner-1',
      status: 'active',
      source: 'legacy',
    });

    Object.assign(selectedFeature, originalFeature);
  });
});

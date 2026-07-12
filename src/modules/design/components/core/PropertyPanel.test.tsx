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
  useCamera: () => ({
    isCameraOpen: false,
    isCapturing: false,
    videoRef: { current: null },
    canvasRef: { current: null },
    startCamera: vi.fn(),
    stopCamera: vi.fn(),
    capture: vi.fn(),
  }),
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
    mockUseDesignSync.mockClear();
    mockUseDesignSync.getState.mockClear();
    mockUseDesignSync.setState.mockClear();
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
      expect(mocks.setPreview).toHaveBeenCalledWith(
        selectedFeature.id,
        expect.objectContaining({
          media: {
            imageUrl: 'data:image/png;base64,old',
            imageUrls: [
              'data:image/png;base64,old',
              expect.stringMatching(/^data:image\/png;base64,/),
            ],
          },
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
          media: {
            imageUrl: 'data:image/png;base64,old',
            imageUrls: [
              'data:image/png;base64,old',
              expect.stringMatching(/^data:image\/png;base64,/),
              expect.stringMatching(/^data:image\/jpeg;base64,/),
            ],
          },
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

  it('removes a pasted image from media.imageUrls', async () => {
    const { unmount } = render(<PropertyPanel />);
    const mediaSection = await getMediaSection();
    const file = new File(['image-data'], 'site.png', { type: 'image/png' });

    fireEvent.paste(mediaSection, {
      clipboardData: {
        items: [createClipboardItem(file)],
      },
    });

    let pastedUrl = '';
    await waitFor(() => {
      const previewCall = mocks.setPreview.mock.calls.find((call) => {
        const metadata = call[1] as { media?: { imageUrls?: string[] } };
        return metadata.media?.imageUrls?.length === 2;
      });
      expect(previewCall).toBeTruthy();
      pastedUrl = previewCall?.[1].media.imageUrls[1] ?? '';
    });

    unmount();
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
            imageUrls: ['data:image/png;base64,old', pastedUrl],
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
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    fireEvent.click(removeButtons[removeButtons.length - 1]);

    await waitFor(() => {
      expect(mocks.setPreview).toHaveBeenCalledWith(
        selectedFeature.id,
        expect.objectContaining({
          media: {
            imageUrls: ['data:image/png;base64,old'],
          },
        }),
        'Camera A',
      );
    });
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { ReportExportDialog, SitePhotoPreviewItem } from './ReportExportDialog';
import { buildReportDocx } from './reportDocx';
import { saveReportDocxFile } from './reportFileSave';
import { resolveMediaAsset } from '@IMPLEMENT/services/mediaAssetService';

const eventMocks = vi.hoisted(() => ({
  listeners: new Map<string, Array<(event: { payload: any }) => void>>(),
  emitted: [] as Array<{ event: string; payload: any }>,
}));

const tauriMocks = vi.hoisted(() => ({
  safeInvoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, handler: (event: { payload: any }) => void) => {
    const handlers = eventMocks.listeners.get(event) || [];
    handlers.push(handler);
    eventMocks.listeners.set(event, handlers);
    return vi.fn();
  }),
  emit: vi.fn(async (event: string, payload: any) => {
    eventMocks.emitted.push({ event, payload });
    if (event === 'request-map-capture') {
      const resultHandlers = eventMocks.listeners.get('map-capture-result') || [];
      resultHandlers.forEach((handler) => handler({
        payload: {
          captureId: payload.captureId,
          dataUrl: 'data:image/jpeg;base64,MAP',
        },
      }));
    }
  }),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(async () => 'D:/report.docx'),
}));

vi.mock('@IMPLEMENT/services/mediaAssetService', () => ({
  resolveMediaAsset: vi.fn(),
}));

vi.mock('@IMPLEMENT/lib/tauri', () => ({
  safeInvoke: tauriMocks.safeInvoke,
  safeListen: vi.fn(async (event: string, handler: (event: { payload: any }) => void) => {
    const handlers = eventMocks.listeners.get(event) || [];
    handlers.push(handler);
    eventMocks.listeners.set(event, handlers);
    return vi.fn();
  }),
  safeEmit: vi.fn(async (event: string, payload: any) => {
    eventMocks.emitted.push({ event, payload });
    if (event === 'request-map-capture') {
      const resultHandlers = eventMocks.listeners.get('map-capture-result') || [];
      resultHandlers.forEach((handler) => handler({
        payload: {
          captureId: payload.captureId,
          dataUrl: 'data:image/jpeg;base64,MAP',
        },
      }));
    }
  }),
  safeSaveDialog: vi.fn(async () => 'D:/report.docx'),
}));

vi.mock('./reportDocx', async () => {
  const actual = await vi.importActual<typeof import('./reportDocx')>('./reportDocx');
  return {
    ...actual,
    buildReportDocx: vi.fn(async () => new ArrayBuffer(8)),
  };
});

vi.mock('./reportFileSave', () => ({
  saveReportDocxFile: vi.fn(async () => undefined),
}));

const route = {
  id: 'route-1',
  layer_id: 'layer-1',
  group_id: 'group-1',
  name: 'Tuyến 1',
  geom_type: 'LineString',
  coordinates: [[106.1, 10.1], [106.2, 10.2]],
  properties: {},
  metadata: JSON.stringify({
    infrastructure: { type: 'SignalLine' },
    media: { imageAssetIds: ['missing-photo'] },
  }),
};

const intersection = {
  id: 'intersection-1',
  layer_id: 'layer-1',
  group_id: 'group-1',
  name: 'Nút giao 1',
  geom_type: 'Point',
  coordinates: [106.1, 10.1],
  properties: {},
  metadata: JSON.stringify({ icon: 'intersection' }),
};

const otherRoute = {
  ...route,
  id: 'route-2',
  name: 'Tuyến khác',
  coordinates: [[106.3, 10.3], [106.4, 10.4]],
  metadata: JSON.stringify({ infrastructure: { type: 'SignalLine' } }),
};

describe('ReportExportDialog', () => {
  beforeEach(() => {
    eventMocks.listeners.clear();
    eventMocks.emitted = [];
    vi.mocked(buildReportDocx).mockClear();
    vi.mocked(saveReportDocxFile).mockClear();
    vi.mocked(resolveMediaAsset).mockReset();
    vi.mocked(resolveMediaAsset).mockRejectedValue(new Error('missing asset'));
    useDesignSync.setState({
      projectId: 'project-1',
      projectPath: 'D:/projects/demo.pmp',
      selectedFeatureId: 'route-1',
      selectedGroupId: null,
      selectionSet: new Set(),
      state: {
        regions: { 'region-1': { id: 'region-1', parent_id: null, name: 'Region', description: null } },
        layers: { 'layer-1': { id: 'layer-1', region_id: 'region-1', name: 'Layer', is_visible: true } },
        feature_groups: { 'group-1': { id: 'group-1', layer_id: 'layer-1', parent_id: null, name: 'Group', group_type: 'FOLDER' } },
        features: {
          'route-1': route,
          'intersection-1': intersection,
          'route-2': otherRoute,
        },
        settings: {},
      },
    } as any);
  });

  it('exports with edited title, scoped map capture, and photo warnings', async () => {
    render(<ReportExportDialog projectName="Demo" onClose={vi.fn()} />);

    const titleInput = screen.getByLabelText(/Tiêu đề/i);
    fireEvent.change(titleInput, { target: { value: 'Báo cáo nghiệm thu tuyến 1' } });

    await waitFor(() => expect(screen.getAllByText('Báo cáo nghiệm thu tuyến 1').length).toBeGreaterThan(0));
    await waitFor(() => expect(resolveMediaAsset).toHaveBeenCalledWith('project-1', 'missing-photo', 'D:/projects/demo.pmp'));
    await waitFor(() => expect(screen.getAllByText('missing-photo').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByText('Xuất Word'));

    await waitFor(() => expect(saveReportDocxFile).toHaveBeenCalled());
    const capturePayload = eventMocks.emitted.find((item) => item.event === 'request-map-capture')?.payload;
    expect(capturePayload.focusFeatureIds).toEqual(['route-1', 'intersection-1']);
    expect(capturePayload.hiddenFeatureIds).toContain('route-2');

    const exportedModel = vi.mocked(buildReportDocx).mock.calls[0][0];
    expect(exportedModel.title).toBe('Báo cáo nghiệm thu tuyến 1');
    expect(exportedModel.sections[0].photoWarnings.join(' ')).toContain('Không resolve được ảnh');
  });

  it('renders site photo preview from asset resolver fallback', async () => {
    vi.mocked(resolveMediaAsset).mockResolvedValue({
      id: 'asset-1',
      assetId: 'asset-1',
      projectId: 'project-1',
      sha256: 'sha',
      relPath: 'assets/media/sha.png',
      path: 'D:/project/assets/media/sha.png',
      mimeType: 'image/png',
      byteSize: 12,
      src: 'data:image/png;base64,PHOTO',
    });

    render(
      <SitePhotoPreviewItem
        projectId="project-1"
        projectPath="D:/projects/demo.pmp"
        photo={{
          id: 'photo-1',
          label: 'Anh 1',
          dataUrl: '',
          assetId: 'asset-1',
          featureId: 'feature-1',
          status: 'resolved',
          warning: 'old warning',
        }}
      />,
    );

    const image = await screen.findByRole('img', { name: 'Anh 1' });
    expect(image).toHaveAttribute('src', 'data:image/png;base64,PHOTO');
    expect(resolveMediaAsset).toHaveBeenCalledWith('project-1', 'asset-1', 'D:/projects/demo.pmp');
  });
});

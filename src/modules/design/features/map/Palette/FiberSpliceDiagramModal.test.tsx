import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FiberSpliceDiagramModal } from './FiberSpliceDiagramModal';
import type { FiberInventory } from '@CONTRACT/types';
import {
  deleteFiberPortPatch,
  deleteFiberPortTermination,
  getFiberInventory,
  upsertEquipment,
  upsertFiberPort,
  upsertFiberPortPatch,
  upsertFiberPortTermination,
  upsertFiberSplice,
} from '@DESIGN/features/map/network/fiberService';

const mockDesignSync = vi.hoisted(() => ({
  value: {
    projectId: 'project-1',
    state: {
      features: {
        'enclosure-1': { name: 'Enclosure 1' },
        'cable-feature-in': { name: 'Ring IN' },
        'cable-feature-out': { name: 'Ring OUT' },
      },
      inventory: null as FiberInventory | null,
    },
  },
}));

vi.mock('@IMPLEMENT/stores/useDesignSync', () => ({
  useDesignSync: (selector: (value: typeof mockDesignSync.value) => unknown) => selector(mockDesignSync.value),
}));

vi.mock('@DESIGN/features/map/network/fiberService', () => ({
  getFiberInventory: vi.fn(),
  upsertEquipment: vi.fn(),
  upsertFiberPort: vi.fn(),
  upsertFiberPortPatch: vi.fn(),
  upsertFiberPortTermination: vi.fn(),
  deleteFiberPortPatch: vi.fn(),
  deleteFiberPortTermination: vi.fn(),
  upsertFiberSplice: vi.fn(),
  deleteFiberSplice: vi.fn(),
}));

const now = '2026-07-21T00:00:00.000Z';

const makeInventory = (splices: FiberInventory['splices'] = []): FiberInventory => ({
  project_id: 'project-1',
  scope: {},
  cables: [
    {
      id: 'cable-in',
      project_id: 'project-1',
      feature_id: 'cable-feature-in',
      cable_type: null,
      fiber_count: 2,
      owner: null,
      status: 'active',
      source: 'manual',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'cable-out',
      project_id: 'project-1',
      feature_id: 'cable-feature-out',
      cable_type: null,
      fiber_count: 2,
      owner: null,
      status: 'active',
      source: 'manual',
      created_at: now,
      updated_at: now,
    },
  ],
  strands: [
    { id: 'in-1', cable_id: 'cable-in', strand_no: 1, color: null, status: 'available', created_at: now, updated_at: now },
    { id: 'in-2', cable_id: 'cable-in', strand_no: 2, color: null, status: 'available', created_at: now, updated_at: now },
    { id: 'out-1', cable_id: 'cable-out', strand_no: 1, color: null, status: 'available', created_at: now, updated_at: now },
    { id: 'out-2', cable_id: 'cable-out', strand_no: 2, color: null, status: 'available', created_at: now, updated_at: now },
  ],
  ports: [],
  splices,
  circuits: [],
  cable_points: [
    {
      id: 'point-in',
      project_id: 'project-1',
      cable_id: 'cable-in',
      feature_id: 'enclosure-1',
      point_kind: 'cable_end',
      sequence_no: 1,
      vertex_index: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'point-out',
      project_id: 'project-1',
      cable_id: 'cable-out',
      feature_id: 'enclosure-1',
      point_kind: 'cable_start',
      sequence_no: 2,
      vertex_index: null,
      created_at: now,
      updated_at: now,
    },
  ],
  equipment: [],
  summary: {
    total_strands: 4,
    available_strands: 4,
    reserved_strands: 0,
    active_strands: 0,
    damaged_strands: 0,
    free_strands: 4,
  },
});

const makeOdfInventory = () => ({
  ...makeSameCableInventory(),
  equipment: [{
    id: 'equipment-odf',
    project_id: 'project-1',
    feature_id: 'enclosure-1',
    equipment_type: 'odf',
    status: 'active',
    created_at: now,
    updated_at: now,
  }],
  ports: [
    { id: 'port-1', feature_id: 'enclosure-1', port_label: 'P01', port_kind: 'ODF', direction: 'bidirectional', status: 'available', created_at: now, updated_at: now },
    { id: 'port-2', feature_id: 'enclosure-1', port_label: 'P02', port_kind: 'ODF', direction: 'bidirectional', status: 'available', created_at: now, updated_at: now },
  ],
  port_terminations: [],
  port_patches: [],
} satisfies FiberInventory);

const makeSameCableInventory = (): FiberInventory => ({
  ...makeInventory(),
  cables: [
    {
      id: 'cable-in',
      project_id: 'project-1',
      feature_id: 'cable-feature-in',
      cable_type: null,
      fiber_count: 2,
      owner: null,
      status: 'active',
      source: 'manual',
      created_at: now,
      updated_at: now,
    },
  ],
  strands: [
    { id: 'strand-1', cable_id: 'cable-in', strand_no: 1, color: null, status: 'available', created_at: now, updated_at: now },
    { id: 'strand-2', cable_id: 'cable-in', strand_no: 2, color: null, status: 'available', created_at: now, updated_at: now },
  ],
  cable_points: [
    {
      id: 'point-same-cable',
      project_id: 'project-1',
      cable_id: 'cable-in',
      feature_id: 'enclosure-1',
      point_kind: 'splice_enclosure',
      sequence_no: 1,
      vertex_index: null,
      created_at: now,
      updated_at: now,
    },
  ],
  summary: {
    total_strands: 2,
    available_strands: 2,
    reserved_strands: 0,
    active_strands: 0,
    damaged_strands: 0,
    free_strands: 2,
  },
});

const renderModal = (inventory: FiberInventory) => {
  mockDesignSync.value.state.inventory = inventory;
  vi.mocked(getFiberInventory).mockResolvedValue(inventory);
  return render(<FiberSpliceDiagramModal enclosureId="enclosure-1" evaluation={{ edges: [] }} onClose={vi.fn()} />);
};

const strandButton = (container: HTMLElement, side: 'left' | 'right', id: string) => {
  const button = container.querySelector(`[data-fiber-strand-side="${side}"][data-fiber-strand-id="${id}"]`);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing ${side} strand ${id}`);
  return button;
};

describe('FiberSpliceDiagramModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => null),
    });
	    Element.prototype.getBoundingClientRect = function () {
	      if (this instanceof HTMLElement && this.dataset.fiberDropPortId) {
	        const id = this.dataset.fiberDropPortId;
	        const index = id.endsWith('2') ? 1 : 0;
	        const left = 388 + index * 52;
	        const top = 52;
	        return {
	          x: left,
	          y: top,
	          left,
	          top,
	          right: left + 44,
	          bottom: top + 44,
	          width: 44,
	          height: 44,
	          toJSON: () => ({}),
	        };
	      }
      if (this instanceof HTMLElement && this.dataset.fiberStrandSide) {
        const side = this.dataset.fiberStrandSide;
        const id = this.dataset.fiberStrandId || '';
        const row = id.endsWith('2') ? 1 : 0;
        const top = 72 + row * 24;
        const left = side === 'left' ? 40 : 560;
        return {
          x: left,
          y: top,
          left,
          top,
          right: left + 280,
          bottom: top + 20,
          width: 280,
          height: 20,
          toJSON: () => ({}),
        };
      }
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 900,
        bottom: 420,
        width: 900,
        height: 420,
        toJSON: () => ({}),
      };
    };
  });

  it('renders saved splice lines from measured strand anchors', async () => {
    renderModal(makeInventory([
      {
        id: 'splice-1',
        enclosure_feature_id: 'enclosure-1',
        from_strand_id: 'in-1',
        to_strand_id: 'out-1',
        from_direction: 'start',
        to_direction: 'end',
        loss_db: 0.05,
        created_at: now,
        updated_at: now,
      },
    ]));

    const path = await screen.findByTestId('fiber-splice-path');
    expect(path).toHaveAttribute('d', expect.stringContaining('M 320 82'));
    expect(path).toHaveAttribute('d', expect.stringContaining('560 82'));
  });

  it('shows a preview path while dragging an IN core', async () => {
    const { container } = renderModal(makeInventory());
    const inCore = await waitFor(() => strandButton(container, 'left', 'in-1'));

    fireEvent.pointerDown(inCore, { button: 0, clientX: 320, clientY: 82 });
    fireEvent.pointerMove(window, { clientX: 460, clientY: 120 });

    const preview = await screen.findByTestId('fiber-splice-preview-path');
    expect(preview).toHaveAttribute('d', expect.stringContaining('M 320 82'));
    expect(preview).toHaveAttribute('d', expect.stringContaining('460 120'));
  });

  it('connects cores on valid drop', async () => {
    const { container } = renderModal(makeInventory());
    const inCore = await waitFor(() => strandButton(container, 'left', 'in-1'));
    const outCore = strandButton(container, 'right', 'out-1');
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(outCore);
    vi.mocked(upsertFiberSplice).mockResolvedValue({} as any);

    fireEvent.pointerDown(inCore, { button: 0, clientX: 320, clientY: 82 });
    fireEvent.pointerMove(window, { clientX: 560, clientY: 82 });
    fireEvent.pointerUp(window, { clientX: 560, clientY: 82 });

    await waitFor(() => {
      expect(upsertFiberSplice).toHaveBeenCalledWith('project-1', {
        id: '00000000-0000-4000-8000-000000000001',
        enclosureFeatureId: 'enclosure-1',
        fromStrandId: 'in-1',
        toStrandId: 'out-1',
        fromDirection: 'start',
        toDirection: 'end',
        lossDb: 0.05,
      });
    });
  });

  it('connects the same cable strand when endpoint directions differ', async () => {
    const { container } = renderModal(makeSameCableInventory());
    const inCore = await waitFor(() => strandButton(container, 'left', 'strand-1'));
    const outCore = strandButton(container, 'right', 'strand-1');
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(outCore);
    vi.mocked(upsertFiberSplice).mockResolvedValue({} as any);

    fireEvent.pointerDown(inCore, { button: 0, clientX: 320, clientY: 82 });
    fireEvent.pointerMove(window, { clientX: 560, clientY: 82 });
    fireEvent.pointerUp(window, { clientX: 560, clientY: 82 });

    await waitFor(() => {
      expect(upsertFiberSplice).toHaveBeenCalledWith('project-1', expect.objectContaining({
        fromStrandId: 'strand-1',
        toStrandId: 'strand-1',
        fromDirection: 'start',
        toDirection: 'end',
      }));
    });
  });

  it('does not connect when dropping on an occupied OUT core', async () => {
    const { container } = renderModal(makeInventory([
      {
        id: 'splice-occupied',
        enclosure_feature_id: 'enclosure-1',
        from_strand_id: 'in-2',
        to_strand_id: 'out-1',
        from_direction: 'start',
        to_direction: 'end',
        loss_db: 0.05,
        created_at: now,
        updated_at: now,
      },
    ]));
    const inCore = await waitFor(() => strandButton(container, 'left', 'in-1'));
    const occupiedOutCore = strandButton(container, 'right', 'out-1');
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(occupiedOutCore);

    fireEvent.pointerDown(inCore, { button: 0, clientX: 320, clientY: 82 });
    fireEvent.pointerUp(window, { clientX: 560, clientY: 82 });

    await waitFor(() => {
      expect(upsertFiberSplice).not.toHaveBeenCalled();
    });
  });

  it('creates manual ODF ports', async () => {
    renderModal({ ...makeOdfInventory(), ports: [], port_terminations: [], port_patches: [] });
    vi.mocked(upsertEquipment).mockResolvedValue({} as any);
    vi.mocked(upsertFiberPort).mockResolvedValue({} as any);

    fireEvent.change(await screen.findByLabelText(/Số cổng quang/i), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Cập nhật port/i }));

    await waitFor(() => {
      expect(upsertFiberPort).toHaveBeenCalledTimes(2);
      expect(upsertFiberPort).toHaveBeenCalledWith('project-1', expect.objectContaining({ portLabel: 'P01', portKind: 'ODF' }));
      expect(upsertFiberPort).toHaveBeenCalledWith('project-1', expect.objectContaining({ portLabel: 'P02', portKind: 'ODF' }));
    });
  });

  it('terminates one ODF side by dropping a core on a port', async () => {
    const { container } = renderModal(makeOdfInventory());
    vi.mocked(upsertFiberPortTermination).mockResolvedValue({} as any);
    const inCore = await waitFor(() => strandButton(container, 'left', 'strand-1'));
    const port = await screen.findByRole('button', { name: /P01/i });
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(port);

    fireEvent.pointerDown(inCore, { button: 0, clientX: 320, clientY: 82 });
    fireEvent.pointerMove(window, { clientX: 380, clientY: 82 });
    fireEvent.pointerUp(window, { clientX: 380, clientY: 82 });

    await waitFor(() => {
      expect(upsertFiberPortTermination).toHaveBeenCalledWith('project-1', expect.objectContaining({
        portId: 'port-1',
        strandId: 'strand-1',
        strandDirection: 'start',
        side: 'left',
      }));
    });
  });

	  it('patches two ODF ports for two-sided continuity', async () => {
	    renderModal(makeOdfInventory());
	    vi.mocked(upsertFiberPortPatch).mockResolvedValue({} as any);

    const port1 = await screen.findByRole('button', { name: /P01/i });
    const port2 = await screen.findByRole('button', { name: /P02/i });
    fireEvent.click(port1);
    fireEvent.click(port2);

    await waitFor(() => {
      expect(upsertFiberPortPatch).toHaveBeenCalledWith('project-1', expect.objectContaining({
        fromPortId: 'port-1',
        toPortId: 'port-2',
	      }));
	    });
	  });

	  it('deletes an ODF core-to-port termination by clicking its line', async () => {
	    renderModal({
	      ...makeOdfInventory(),
	      port_terminations: [{
	        id: 'termination-1',
	        port_id: 'port-1',
	        strand_id: 'strand-1',
	        strand_direction: 'start',
	        side: 'left',
	        status: 'active',
	        created_at: now,
	        updated_at: now,
	      }],
	    });
	    vi.mocked(deleteFiberPortTermination).mockResolvedValue({} as any);

	    const path = await screen.findByTestId('fiber-odf-path');
	    fireEvent.click(path);

	    await waitFor(() => {
	      expect(deleteFiberPortTermination).toHaveBeenCalledWith('project-1', 'termination-1');
	    });
	  });

	  it('deletes an ODF port patch by clicking its line', async () => {
	    renderModal({
	      ...makeOdfInventory(),
	      port_patches: [{
	        id: 'patch-1',
	        from_port_id: 'port-1',
	        to_port_id: 'port-2',
	        status: 'active',
	        loss_db: 0.05,
	        created_at: now,
	        updated_at: now,
	      }],
	    });
	    vi.mocked(deleteFiberPortPatch).mockResolvedValue({} as any);

	    const path = await screen.findByTestId('fiber-odf-path');
	    fireEvent.click(path);

	    await waitFor(() => {
	      expect(deleteFiberPortPatch).toHaveBeenCalledWith('project-1', 'patch-1');
	    });
	  });

	  it('keeps ODF ports clickable for patching when core-to-port lines exist', async () => {
	    renderModal({
	      ...makeOdfInventory(),
	      port_terminations: [{
	        id: 'termination-1',
	        port_id: 'port-1',
	        strand_id: 'strand-1',
	        strand_direction: 'start',
	        side: 'left',
	        status: 'active',
	        created_at: now,
	        updated_at: now,
	      }],
	    });
	    vi.mocked(upsertFiberPortPatch).mockResolvedValue({} as any);

	    expect(await screen.findByTestId('fiber-odf-path')).toBeInTheDocument();
	    fireEvent.click(screen.getByRole('button', { name: /P01/i }));
	    fireEvent.click(screen.getByRole('button', { name: /P02/i }));

	    await waitFor(() => {
	      expect(upsertFiberPortPatch).toHaveBeenCalledWith('project-1', expect.objectContaining({
	        fromPortId: 'port-1',
	        toPortId: 'port-2',
	      }));
	    });
	  });

	  it('renders terminated ODF cores like regular cores without occupied styling', async () => {
	    const { container } = renderModal({
	      ...makeOdfInventory(),
	      port_terminations: [{
	        id: 'termination-1',
	        port_id: 'port-1',
	        strand_id: 'strand-1',
	        strand_direction: 'start',
	        side: 'left',
	        status: 'active',
	        created_at: now,
	        updated_at: now,
	      }],
	    });

	    const occupiedCore = await waitFor(() => strandButton(container, 'left', 'strand-1'));
	    expect(occupiedCore.className).not.toContain('opacity-50');
	    expect(occupiedCore.className).not.toContain('border-emerald-400/45');
	    expect(occupiedCore).not.toBeDisabled();
	  });

	  it('allows dragging ODF core N01 to move its existing termination to another port', async () => {
	    const { container } = renderModal({
	      ...makeOdfInventory(),
	      port_terminations: [{
	        id: 'termination-1',
	        port_id: 'port-1',
	        strand_id: 'strand-1',
	        strand_direction: 'start',
	        side: 'left',
	        status: 'active',
	        created_at: now,
	        updated_at: now,
	      }],
	    });
	    vi.mocked(deleteFiberPortTermination).mockResolvedValue({} as any);
	    vi.mocked(upsertFiberPortTermination).mockResolvedValue({} as any);

	    const occupiedCore = await waitFor(() => strandButton(container, 'left', 'strand-1'));
	    fireEvent.click(occupiedCore);

	    expect(screen.getByText(/IN core: #1/i)).toBeInTheDocument();

	    const port2 = screen.getByRole('button', { name: /P02/i });
	    vi.spyOn(document, 'elementFromPoint').mockReturnValue(port2);
	    fireEvent.pointerDown(occupiedCore, { button: 0, clientX: 320, clientY: 82 });
	    fireEvent.pointerMove(window, { clientX: 440, clientY: 74 });
	    fireEvent.pointerUp(window, { clientX: 440, clientY: 74 });

	    await waitFor(() => {
	      expect(deleteFiberPortTermination).toHaveBeenCalledWith('project-1', 'termination-1');
	      expect(upsertFiberPortTermination).toHaveBeenCalledWith('project-1', expect.objectContaining({
	        id: 'termination-1',
	        portId: 'port-2',
	        strandId: 'strand-1',
	        strandDirection: 'start',
	        side: 'left',
	      }));
	    });
	  });
	});

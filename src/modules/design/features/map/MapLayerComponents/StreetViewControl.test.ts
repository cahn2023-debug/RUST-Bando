import { describe, expect, it } from 'vitest';
import { canUpdatePegmanMarker, canUseLeafletPane } from './StreetViewControl';

const makeMap = (loaded: boolean, pane: HTMLElement | null) => ({
  _loaded: loaded,
  getPane: () => pane,
});

describe('StreetViewControl Leaflet readiness guards', () => {
  it('rejects pane access before Leaflet has finished loading', () => {
    const pane = document.createElement('div');
    document.body.appendChild(pane);

    expect(canUseLeafletPane(makeMap(false, pane) as any)).toBe(false);

    pane.remove();
  });

  it('rejects panes that are no longer attached to the document', () => {
    const pane = document.createElement('div');

    expect(canUseLeafletPane(makeMap(true, pane) as any)).toBe(false);
  });

  it('allows attached panes on a loaded map', () => {
    const pane = document.createElement('div');
    document.body.appendChild(pane);

    expect(canUseLeafletPane(makeMap(true, pane) as any)).toBe(true);

    pane.remove();
  });

  it('rejects pegman marker updates when the marker is not attached to the map', () => {
    const pane = document.createElement('div');
    document.body.appendChild(pane);
    const map = makeMap(true, pane);

    expect(canUpdatePegmanMarker(map as any, { _map: null } as any)).toBe(false);

    pane.remove();
  });

  it('allows pegman marker updates only when marker and pane are attached', () => {
    const pane = document.createElement('div');
    document.body.appendChild(pane);
    const map = makeMap(true, pane);

    expect(canUpdatePegmanMarker(map as any, { _map: map } as any)).toBe(true);

    pane.remove();
  });
});

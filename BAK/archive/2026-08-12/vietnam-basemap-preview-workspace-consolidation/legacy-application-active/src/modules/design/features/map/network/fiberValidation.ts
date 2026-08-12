import type { FiberValidationDiagnostic } from '@CONTRACT/types';

export type FiberDiagnosticSummary = Record<FiberValidationDiagnostic['type'], number>;

export const isFiberDiagnosticType = (value: unknown): value is FiberValidationDiagnostic['type'] =>
  value === 'missing-strand'
  || value === 'missing-port'
  || value === 'duplicate-splice'
  || value === 'invalid-splice-loop'
  || value === 'strand-occupied'
  || value === 'missing-circuit-endpoint'
  || value === 'broken-hop'
  || value === 'damaged-strand'
  || value === 'endpoint-mismatch'
  || value === 'uninitialized-cable'
  || value === 'missing-polyline-endpoint'
  || value === 'missing-cable-point'
  || value === 'invalid-enclosure-location'
  || value === 'missing-branch-enclosure'
  || value === 'unmaterialized-cable-points'
  || value === 'direction-conflict'
  || value === 'multiple-origin';

export const summarizeFiberDiagnostics = (
  diagnostics: FiberValidationDiagnostic[]
): FiberDiagnosticSummary =>
  diagnostics.reduce((summary, diagnostic) => {
    summary[diagnostic.type] = (summary[diagnostic.type] || 0) + 1;
    return summary;
  }, {} as FiberDiagnosticSummary);


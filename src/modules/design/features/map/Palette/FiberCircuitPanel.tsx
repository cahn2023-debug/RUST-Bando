import React from 'react';
import type { FiberCircuit, FiberTraceResult } from '@CONTRACT/types';
import { Button } from '@DESIGN/components/ui/Button';

interface FiberCircuitPanelProps {
  circuits: FiberCircuit[];
  selectedCircuitId?: string | null;
  traceResult?: FiberTraceResult | null;
  getFeatureLabel?: (featureId: string) => string;
  onSelectCircuit?: (circuitId: string) => void;
  onTraceCircuit?: (circuitId: string) => void | Promise<void>;
  onFocusFeature?: (featureId: string) => void;
}

export const FiberCircuitPanel: React.FC<FiberCircuitPanelProps> = ({
  circuits,
  selectedCircuitId,
  traceResult,
  getFeatureLabel = id => id,
  onSelectCircuit,
  onTraceCircuit,
  onFocusFeature,
}) => {
  if (circuits.length === 0) {
    return (
      <div className="rounded-lg border border-cad-border bg-cad-surface p-3 text-[10.5px] text-cad-text-muted">
        Chưa có tuyến A-Z. Tạo tuyến mới bằng form bên trên.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {circuits.map(circuit => {
        const selected = selectedCircuitId === circuit.id;
        return (
          <div
            key={circuit.id}
            className={selected
              ? 'rounded-lg border border-cad-active/30 bg-cad-active/10 p-3'
              : 'rounded-lg border border-cad-border bg-cad-surface p-3'}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onSelectCircuit?.(circuit.id)}
                className="min-w-0 text-left"
              >
                <div className="truncate text-[11px] font-semibold text-cad-text-primary">{circuit.name}</div>
                <div className="truncate text-[9px] text-cad-text-muted">
                  {circuit.service_type} · {circuit.status}
                </div>
              </button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onTraceCircuit?.(circuit.id)}
              >
                Trace A-Z
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-[9px] text-cad-text-muted">
              <button
                type="button"
                onClick={() => onFocusFeature?.(circuit.a_feature_id)}
                className="truncate rounded bg-cad-elevated px-2 py-1 text-left hover:text-cad-active"
              >
                A · {getFeatureLabel(circuit.a_feature_id)}
              </button>
              <button
                type="button"
                onClick={() => onFocusFeature?.(circuit.z_feature_id)}
                className="truncate rounded bg-cad-elevated px-2 py-1 text-left hover:text-cad-active"
              >
                Z · {getFeatureLabel(circuit.z_feature_id)}
              </button>
            </div>
            {selected && traceResult && (
              <div className="mt-3 rounded border border-cad-border bg-cad-elevated p-2 text-[9px] text-cad-text-muted">
                <div className="mb-1 font-semibold text-cad-text-secondary">Kết quả trace</div>
                <div className="grid grid-cols-4 gap-1">
                  <span>Hop {traceResult.hops.length}</span>
                  <span>Sợi {traceResult.strands.length}</span>
                  <span>Port {traceResult.ports.length}</span>
                  <span>Nối {traceResult.splices.length}</span>
                </div>
                {traceResult.hops.length > 0 && (
                  <div className="mt-2 max-h-24 space-y-1 overflow-auto">
                    {traceResult.hops.map(hop => (
                      <div key={`${hop.circuit_id}-${hop.sequence_no}`} className="rounded bg-cad-elevated px-2 py-1">
                        #{hop.sequence_no} · {hop.strand_id || 'Chưa chọn sợi'} · {hop.port_id || 'Chưa chọn port'}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

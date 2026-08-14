import React from 'react';
import type { FeatureState, FiberInventory } from '@CONTRACT/types';
import { getFeatureLabel } from '@DESIGN/features/map/network/fiberUiModel';

interface OneEndEquipmentUIProps {
  projectId: string | null;
  featureId: string;
  cables: string[];
  inventory: FiberInventory;
  featuresById: Record<string, FeatureState> | undefined;
}

export const OneEndEquipmentUI: React.FC<OneEndEquipmentUIProps> = ({
  projectId: _projectId,
  featureId,
  cables,
  inventory,
  featuresById,
}) => {
  const points = (inventory.cable_points || []).filter(point => point.feature_id === featureId);
  const ports = inventory.ports.filter(port => port.feature_id === featureId);

  return (
    <div className="mt-2 space-y-2">
      <div className="rounded border border-cad-border bg-cad-surface p-2 text-[10px] text-cad-text-secondary">
        <p className="mb-2 font-semibold text-cad-text-secondary">Cáp kết nối tại điểm này:</p>
        <ul className="list-inside list-disc space-y-1">
          {cables.map(cableId => {
            const cable = inventory.cables.find(item => item.id === cableId);
            const label = getFeatureLabel(featuresById, cable?.feature_id);
            const pointKinds = points
              .filter(point => point.cable_id === cableId)
              .map(point => point.point_kind)
              .join(', ');

            return (
              <li key={cableId}>
                <span className="text-cad-accent">{label}</span> ({cable?.fiber_count || 0} FO)
                {pointKinds && <span className="text-cad-text-muted"> · {pointKinds}</span>}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded border border-cad-border bg-cad-surface p-2 text-[10px] text-cad-text-secondary">
        <div className="mb-1 font-semibold text-cad-text-secondary">Port</div>
        {ports.length === 0 ? (
          <div>Chưa có port được khai báo cho thiết bị này.</div>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            {ports.map(port => (
              <div key={port.id} className="rounded bg-cad-elevated px-2 py-1">
                <div className="font-semibold text-cad-text-primary">{port.port_label}</div>
                <div>{port.port_kind} · {port.direction} · {port.status}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

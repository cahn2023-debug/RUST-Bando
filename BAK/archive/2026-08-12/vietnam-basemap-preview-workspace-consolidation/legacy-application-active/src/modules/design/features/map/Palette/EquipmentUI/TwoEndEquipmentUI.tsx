import React from 'react';
import type { FeatureState, FiberInventory } from '@CONTRACT/types';
import { getFeatureLabel } from '@DESIGN/features/map/network/fiberUiModel';

interface TwoEndEquipmentUIProps {
  projectId: string | null;
  featureId: string;
  cables: string[];
  inventory: FiberInventory;
  featuresById: Record<string, FeatureState> | undefined;
}

export const TwoEndEquipmentUI: React.FC<TwoEndEquipmentUIProps> = ({
  projectId: _projectId,
  featureId,
  cables,
  inventory,
  featuresById,
}) => {
  const splices = inventory.splices.filter(splice => splice.enclosure_feature_id === featureId);

  return (
    <div className="mt-2 space-y-2">
      <div className="rounded border border-cad-border bg-cad-surface p-2 text-[10px] text-cad-text-secondary">
        <p className="mb-2 font-semibold text-cad-text-secondary">Cáp kết nối qua măng xông này:</p>
        <div className="flex items-center justify-between rounded bg-cad-bg p-2">
          {cables.map((cableId, index) => {
            const cable = inventory.cables.find(item => item.id === cableId);
            const label = getFeatureLabel(featuresById, cable?.feature_id);
            return (
              <React.Fragment key={cableId}>
                <div className="flex flex-1 flex-col items-center">
                  <span className="font-semibold text-cad-accent">{label}</span>
                  <span>({cable?.fiber_count || 0} FO)</span>
                </div>
                {index < cables.length - 1 && (
                  <div className="px-2 text-cad-text-muted">↔</div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="rounded border border-cad-border bg-cad-surface p-2 text-[10px] text-cad-text-secondary">
        <div className="mb-1 font-semibold text-cad-text-secondary">Mối nối</div>
        {splices.length === 0 ? (
          <div>Chưa có mối nối được ghi nhận tại điểm này.</div>
        ) : (
          <div className="space-y-1">
            {splices.map(splice => (
              <div key={splice.id} className="rounded bg-cad-elevated px-2 py-1">
                <span className="text-cyan-300">{splice.from_strand_id}</span>
                <span className="text-cad-text-muted"> {splice.from_direction} ↔ {splice.to_direction} </span>
                <span className="text-pink-300">{splice.to_strand_id}</span>
                <span className="text-cad-text-muted"> · {splice.loss_db ?? 0} dB</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

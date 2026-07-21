import React, { useMemo } from 'react';
import { Route, Share2 } from 'lucide-react';
import type { Equipment, FeatureState, FiberCablePoint, FiberInventory } from '@CONTRACT/types';
import { getFeatureLabel } from '@DESIGN/features/map/network/fiberUiModel';
import { OneEndEquipmentUI } from './EquipmentUI/OneEndEquipmentUI';
import { TwoEndEquipmentUI } from './EquipmentUI/TwoEndEquipmentUI';

interface EquipmentPanelProps {
  projectId: string | null;
  selectedFeatureId: string | null;
  inventory: FiberInventory | null;
  featuresById: Record<string, FeatureState> | undefined;
}

export const EquipmentPanel: React.FC<EquipmentPanelProps> = ({
  projectId,
  selectedFeatureId,
  inventory,
  featuresById,
}) => {
  const nodeEquipmentData = useMemo(() => {
    if (!selectedFeatureId || !inventory) return null;

    const connectedPoints = (inventory.cable_points || []).filter(point => point.feature_id === selectedFeatureId);
    const equipment = (inventory.equipment || []).filter(item => item.feature_id === selectedFeatureId);

    if (connectedPoints.length === 0 && equipment.length === 0) {
      return { type: 'none' as const, cables: [], points: [], equipment };
    }

    const cablesMap = new Map<string, FiberCablePoint[]>();
    connectedPoints.forEach(point => {
      const list = cablesMap.get(point.cable_id) || [];
      list.push(point);
      cablesMap.set(point.cable_id, list);
    });

    const uniqueCables = Array.from(cablesMap.keys());
    const hasInlineEnclosure = connectedPoints.some(point => point.point_kind === 'splice_enclosure');
    const hasEnclosureEquipment = equipment.some(item => item.equipment_type === 'splice_enclosure');
    const type = uniqueCables.length === 2 || hasInlineEnclosure || hasEnclosureEquipment ? 'two-end' as const : 'one-end' as const;

    return { type, cables: uniqueCables, points: connectedPoints, equipment };
  }, [selectedFeatureId, inventory]);

  if (!selectedFeatureId || !inventory) {
    return (
      <div className="rounded-lg border border-white/5 bg-black/20 p-3 text-[10px] text-zinc-400">
        Vui lòng chọn một Point trên bản đồ để xem thiết bị.
      </div>
    );
  }

  const featureLabel = getFeatureLabel(featuresById, selectedFeatureId);
  const equipment = nodeEquipmentData?.equipment as Equipment[] | undefined;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/5 bg-black/20 p-3 text-[10px] text-zinc-400">
        <div className="space-y-2">
          <div className="font-semibold text-zinc-300">
            Thiết bị tại: {featureLabel}
          </div>

          {equipment && equipment.length > 0 && (
            <div className="grid grid-cols-2 gap-1">
              {equipment.map(item => (
                <div key={item.id} className="rounded border border-white/5 bg-black/25 px-2 py-1">
                  <div className="font-semibold text-zinc-200">{item.equipment_type}</div>
                  <div className="text-zinc-500">{item.status}</div>
                </div>
              ))}
            </div>
          )}

          {nodeEquipmentData?.type === 'none' && (
            <div>Nút này chưa có cáp quang nào kết nối tới.</div>
          )}

          {nodeEquipmentData?.type === 'one-end' && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-zinc-300">
                <Share2 size={12} /> <span>ODF / Điểm cuối cáp</span>
              </div>
              <OneEndEquipmentUI
                projectId={projectId}
                featureId={selectedFeatureId}
                cables={nodeEquipmentData.cables}
                inventory={inventory}
                featuresById={featuresById}
              />
            </div>
          )}

          {nodeEquipmentData?.type === 'two-end' && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-zinc-300">
                <Route size={12} /> <span>Măng xông / điểm nối tuyến</span>
              </div>
              <TwoEndEquipmentUI
                projectId={projectId}
                featureId={selectedFeatureId}
                cables={nodeEquipmentData.cables}
                inventory={inventory}
                featuresById={featuresById}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

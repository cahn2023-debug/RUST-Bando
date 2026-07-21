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
  const isOdf = equipment?.some(item => item.equipment_type === 'odf') || false;
  const odfPorts = (inventory.ports || [])
    .filter(port => port.feature_id === selectedFeatureId)
    .sort((a, b) => a.port_label.localeCompare(b.port_label, undefined, { numeric: true }));
  const odfTerminations = inventory.port_terminations || [];
  const odfPatches = inventory.port_patches || [];
  const terminationsByPort = new Map(odfTerminations.map(item => [item.port_id, item]));
  const patchesByPort = new Map<string, number>();
  odfPatches.forEach(patch => {
    patchesByPort.set(patch.from_port_id, (patchesByPort.get(patch.from_port_id) || 0) + 1);
    patchesByPort.set(patch.to_port_id, (patchesByPort.get(patch.to_port_id) || 0) + 1);
  });

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

          {isOdf && (
            <div className="rounded border border-emerald-500/10 bg-emerald-500/5 p-2">
              <div className="mb-2 font-semibold text-emerald-200">ODF ports</div>
              {odfPorts.length === 0 ? (
                <div className="text-zinc-500">Chưa khai báo số cổng quang cho ODF này.</div>
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {odfPorts.map(port => {
                    const termination = terminationsByPort.get(port.id);
                    const patchCount = patchesByPort.get(port.id) || 0;
                    const status = termination ? patchCount > 0 ? 'Thông tuyến' : 'Một hướng' : 'Trống';
                    return (
                      <div key={port.id} className="rounded border border-white/5 bg-black/25 px-2 py-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-zinc-200">{port.port_label}</span>
                          <span className={status === 'Thông tuyến' ? 'text-emerald-300' : status === 'Một hướng' ? 'text-amber-300' : 'text-zinc-500'}>{status}</span>
                        </div>
                        {termination && (
                          <div className="truncate text-zinc-500">
                            {termination.side.toUpperCase()} · {termination.strand_direction}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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

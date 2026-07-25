import React from 'react';
import { TriangleAlert } from 'lucide-react';
import type { FiberCapacitySummary } from '@CONTRACT/types';
import type { FiberCableRow } from '@DESIGN/features/map/network/fiberUiModel';
import { Button } from '@DESIGN/components/ui/Button';

interface FiberCapacityPanelProps {
  rows?: FiberCableRow[];
  items?: FiberCapacitySummary[];
  selectedCableId?: string | null;
  onSelectCable?: (cableId: string) => void;
  onInitializeCable?: (cableId: string, fiberCount: number) => void | Promise<void>;
}

const percent = (value: number | undefined) => Math.round((value || 0) * 100);

export const FiberCapacityPanel: React.FC<FiberCapacityPanelProps> = ({
  rows,
  items = [],
  selectedCableId,
  onSelectCable,
  onInitializeCable,
}) => {
  const displayRows: FiberCableRow[] = rows || items.map(item => ({
    cable: {
      id: item.cable_id,
      project_id: '',
      feature_id: item.feature_id,
      cable_type: item.cable_type,
      fiber_count: item.fiber_count,
      owner: null,
      status: 'planned' as const,
      source: 'manual' as const,
      created_at: '',
      updated_at: '',
    },
    label: item.cable_id,
    initialized: (item.available_count + item.reserved_count + item.active_count + item.damaged_count) > 0,
    strandCount: item.available_count + item.reserved_count + item.active_count + item.damaged_count,
    points: [],
    enclosureCount: 0,
    capacity: item,
  }));

  if (displayRows.length === 0) {
    return (
      <div className="rounded-lg border border-cad-border bg-cad-surface p-3 text-[10.5px] text-cad-text-muted">
        Chưa có cáp fiber. Hãy nhận diện tuyến từ polyline hoặc vẽ tuyến Network trước.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {displayRows.map(row => {
        const { cable, capacity } = row;
        const isSelected = selectedCableId && cable.id === selectedCableId;
        const free = capacity?.available_count || 0;
        const reserved = capacity?.reserved_count || 0;
        const active = capacity?.active_count || 0;
        const damaged = capacity?.damaged_count || 0;
        const defaultFiberCount = cable.fiber_count || row.strandCount || 12;
        const pointSummary = row.points.length > 0
          ? `Đầu ${row.startPoint ? '✓' : '—'} · Cuối ${row.endPoint ? '✓' : '—'} · Măng xông ${row.enclosureCount}`
          : 'Chưa materialize điểm tuyến';

        return (
          <div
            key={cable.id}
            className={isSelected
              ? 'rounded-lg border border-cad-active/30 bg-cad-active/10 p-3'
              : 'rounded-lg border border-cad-border bg-cad-surface p-3 hover:border-cad-border hover:bg-cad-text-primary/[0.03]'}
          >
            <button
              type="button"
              onClick={() => onSelectCable?.(cable.id)}
              className="w-full text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold text-cad-text-primary flex items-center gap-1">
                    {row.diagnostics && row.diagnostics.length > 0 && (
                      <TriangleAlert size={12} className="text-cad-warn" />
                    )}
                    {row.label}
                  </div>
                  <div className="truncate text-[9px] text-cad-text-muted">
                    {cable.cable_type || 'Cáp'} · {row.initialized ? `${row.strandCount} sợi đã khởi tạo` : 'Chưa khởi tạo sợi'}
                  </div>
                  <div className="truncate text-[9px] text-cad-active/80">{pointSummary}</div>
                </div>
                <div className="text-right text-[10px]">
                  <div className="font-semibold text-cad-text-primary">{cable.fiber_count ?? row.strandCount} sợi</div>
                  <div className="text-cad-text-muted">{percent(capacity?.utilization)}%</div>
                </div>
              </div>
            </button>
            <div className="mt-2 grid grid-cols-4 gap-1 text-[9px] text-cad-text-muted">
              <span>Khả dụng {free}</span>
              <span>Giữ chỗ {reserved}</span>
              <span>Đang dùng {active}</span>
              <span>Lỗi {damaged}</span>
            </div>
            {!row.initialized && onInitializeCable && (
              <Button
                variant="accent"
                size="sm"
                onClick={() => onInitializeCable(cable.id, defaultFiberCount)}
                className="mt-2"
              >
                Khởi tạo sợi
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
};

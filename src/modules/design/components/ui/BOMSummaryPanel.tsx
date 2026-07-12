/**
 * BOM Summary Component
 * Displays aggregated statistics and Bill of Materials
 */

import React, { useMemo, useState } from 'react';
import { Package, BarChart3, Users, Layers, Map as MapIcon } from 'lucide-react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { generateBOMSummary, bomToExcelData } from '@IMPLEMENT/services/bomService';
import { cn } from '@TOOL/utils/cn';
import * as XLSX from 'xlsx';
import { save } from '@tauri-apps/plugin-dialog';

interface BOMSummaryProps {
  className?: string;
}

export const BOMSummaryPanel: React.FC<BOMSummaryProps> = ({ className }) => {
  const { state } = useDesignSync();
  const [activeTab, setActiveTab] = useState<'summary' | 'bom' | 'stats'>('summary');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterGroup, setFilterGroup] = useState<string>('ALL');

  const bomSummary = useMemo(() => {
    if (!state) return null;
    return generateBOMSummary(state);
  }, [state]);

  if (!bomSummary) {
    return (
      <div className="flex items-center justify-center h-full text-cad-text-muted text-xs">
        Đang tải dữ liệu...
      </div>
    );
  }

  const categories = Array.from(new Set(bomSummary.items.map(item => item.category)));
  const groups = Array.from(new Set(bomSummary.items.map(item => item.group).filter(Boolean)));

  const filteredItems = bomSummary.items.filter(item => {
    if (filterCategory !== 'ALL' && item.category !== filterCategory) return false;
    if (filterGroup !== 'ALL' && item.group !== filterGroup) return false;
    return true;
  });

  const groupedItems = Array.from(
    filteredItems.reduce((acc, item) => {
      const groupName = item.group || 'Không nhóm';
      const current = acc.get(groupName) || { groupName, total: 0, items: [] as typeof filteredItems };
      current.total += item.count;
      current.items.push(item);
      acc.set(groupName, current);
      return acc;
    }, new Map<string, { groupName: string; total: number; items: typeof filteredItems }>())
  )
    .map(([, value]) => value)
    .sort((a, b) => a.groupName.localeCompare(b.groupName, undefined, { numeric: true }));

  const handleExportBOM = async () => {
    try {
      const filePath = await save({
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
        defaultPath: `BOM_Summary_${new Date().toISOString().split('T')[0]}.xlsx`
      });

      if (!filePath) return;

      const excelData = bomToExcelData(bomSummary);
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'BOM Summary');

      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_binary_file', { path: filePath, data: Array.from(new Uint8Array(buffer)) });
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  return (
    <div className={cn('flex flex-col h-full bg-cad-surface', className)}>
      {/* Header Stats */}
      <div className="grid grid-cols-4 gap-3 p-4 border-b border-cad-border bg-cad-elevated">
        <div className="flex items-center gap-3 p-3 bg-cad-surface rounded-lg border border-cad-border">
          <div className="p-2 bg-cad-accent/10 rounded-lg">
            <Package size={18} className="text-cad-accent" />
          </div>
          <div>
            <div className="text-[10px] text-cad-text-muted uppercase font-bold">Tổng đối tượng</div>
            <div className="text-lg font-black text-cad-text-primary">{bomSummary.totalFeatures}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 bg-cad-surface rounded-lg border border-cad-border">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Users size={18} className="text-blue-400" />
          </div>
          <div>
            <div className="text-[10px] text-cad-text-muted uppercase font-bold">Nhóm</div>
            <div className="text-lg font-black text-cad-text-primary">{bomSummary.totalGroups}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 bg-cad-surface rounded-lg border border-cad-border">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <Layers size={18} className="text-emerald-400" />
          </div>
          <div>
            <div className="text-[10px] text-cad-text-muted uppercase font-bold">Lớp</div>
            <div className="text-lg font-black text-cad-text-primary">{bomSummary.totalLayers}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 bg-cad-surface rounded-lg border border-cad-border">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <MapIcon size={18} className="text-purple-400" />
          </div>
          <div>
            <div className="text-[10px] text-cad-text-muted uppercase font-bold">Vùng</div>
            <div className="text-lg font-black text-cad-text-primary">{bomSummary.totalRegions}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-cad-border bg-cad-elevated">
        <button
          onClick={() => setActiveTab('summary')}
          className={cn(
            'px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded transition-all',
            activeTab === 'summary'
              ? 'bg-cad-accent text-white'
              : 'text-cad-text-muted hover:text-cad-text-primary hover:bg-cad-surface'
          )}
        >
          <BarChart3 size={14} className="inline mr-2" />
          Thống kê
        </button>
        <button
          onClick={() => setActiveTab('bom')}
          className={cn(
            'px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded transition-all',
            activeTab === 'bom'
              ? 'bg-cad-accent text-white'
              : 'text-cad-text-muted hover:text-cad-text-primary hover:bg-cad-surface'
          )}
        >
          <Package size={14} className="inline mr-2" />
          BOM
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={cn(
            'px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded transition-all',
            activeTab === 'stats'
              ? 'bg-cad-accent text-white'
              : 'text-cad-text-muted hover:text-cad-text-primary hover:bg-cad-surface'
          )}
        >
          Chi tiết
        </button>

        <div className="ml-auto flex items-center gap-2">
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="bg-cad-surface border border-cad-border rounded px-2 py-1 text-[10px] font-bold text-cad-text-primary outline-none focus:border-cad-accent"
          >
            <option value="ALL">Tất cả loại</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select
            value={filterGroup}
            onChange={e => setFilterGroup(e.target.value)}
            className="bg-cad-surface border border-cad-border rounded px-2 py-1 text-[10px] font-bold text-cad-text-primary outline-none focus:border-cad-accent"
          >
            <option value="ALL">Tất cả nhóm</option>
            {groups.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          <button
            onClick={handleExportBOM}
            className="px-3 py-1.5 bg-cad-accent text-white text-[10px] font-black uppercase rounded hover:brightness-110 transition-all"
          >
            Xuất Excel
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto custom-scrollbar p-4">
        {activeTab === 'summary' && (
          <div className="space-y-4">
            {/* By Type */}
            <div className="bg-cad-elevated rounded-lg border border-cad-border p-4">
              <h3 className="text-xs font-black text-cad-text-muted uppercase tracking-widest mb-3">
                Theo loại thiết bị
              </h3>
              <div className="space-y-2">
                {Object.entries(bomSummary.summary.byType)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between p-2 bg-cad-surface rounded border border-cad-border/50">
                      <span className="text-xs font-bold text-cad-text-primary">{type}</span>
                      <span className="text-sm font-black text-cad-accent">{count}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* By Group */}
            <div className="bg-cad-elevated rounded-lg border border-cad-border p-4">
              <h3 className="text-xs font-black text-cad-text-muted uppercase tracking-widest mb-3">
                Theo nhóm
              </h3>
              <div className="space-y-2">
                {Object.entries(bomSummary.summary.byGroup)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)
                  .map(([group, count]) => (
                    <div key={group} className="flex items-center justify-between p-2 bg-cad-surface rounded border border-cad-border/50">
                      <span className="text-xs font-bold text-cad-text-primary truncate mr-4">{group}</span>
                      <span className="text-sm font-black text-blue-400">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'bom' && (
          <div className="bg-cad-elevated rounded-lg border border-cad-border overflow-hidden">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-cad-elevated z-10">
                <tr className="border-b border-cad-border">
                  <th className="px-4 py-3 text-[10px] font-black text-cad-text-muted uppercase tracking-widest">STT</th>
                  <th className="px-4 py-3 text-[10px] font-black text-cad-text-muted uppercase tracking-widest">Loại</th>
                  <th className="px-4 py-3 text-[10px] font-black text-cad-text-muted uppercase tracking-widest">Phân loại</th>
                  <th className="px-4 py-3 text-[10px] font-black text-cad-text-muted uppercase tracking-widest">Nhóm</th>
                  <th className="px-4 py-3 text-[10px] font-black text-cad-text-muted uppercase tracking-widest text-right">Số lượng</th>
                  <th className="px-4 py-3 text-[10px] font-black text-cad-text-muted uppercase tracking-widest">Đơn vị</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cad-border/30">
                {groupedItems.map((group, groupIndex) => (
                  <React.Fragment key={group.groupName}>
                    <tr className="bg-cad-surface/80 border-y border-cad-border/70">
                      <td className="px-4 py-2 text-[10px] font-black text-cad-text-muted">{groupIndex + 1}</td>
                      <td className="px-4 py-2 text-xs font-black text-cad-accent uppercase" colSpan={3}>
                        {group.groupName}
                      </td>
                      <td className="px-4 py-2 text-sm font-black text-cad-accent text-right">{group.total}</td>
                      <td className="px-4 py-2 text-[10px] font-bold text-cad-text-muted uppercase">Tổng</td>
                    </tr>
                    {group.items.map((item, itemIndex) => (
                      <tr key={`${group.groupName}-${item.type}-${itemIndex}`} className="hover:bg-cad-accent/5 transition-colors">
                        <td className="px-4 py-2 text-xs text-cad-text-muted">{`${groupIndex + 1}.${itemIndex + 1}`}</td>
                        <td className="px-4 py-2 text-xs font-bold text-cad-text-primary">{item.type}</td>
                        <td className="px-4 py-2 text-xs text-cad-text-secondary">{item.category}</td>
                        <td className="px-4 py-2 text-xs text-cad-text-secondary">{item.group}</td>
                        <td className="px-4 py-2 text-sm font-black text-cad-accent text-right">{item.count}</td>
                        <td className="px-4 py-2 text-xs text-cad-text-muted">{item.unit}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            {filteredItems.length === 0 && (
              <div className="p-8 text-center text-cad-text-muted text-xs">
                Không có dữ liệu phù hợp với bộ lọc
              </div>
            )}
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="grid grid-cols-2 gap-4">
            {/* By Layer */}
            <div className="bg-cad-elevated rounded-lg border border-cad-border p-4">
              <h3 className="text-xs font-black text-cad-text-muted uppercase tracking-widest mb-3">
                Theo lớp
              </h3>
              <div className="space-y-2 max-h-96 overflow-auto custom-scrollbar">
                {Object.entries(bomSummary.summary.byLayer)
                  .sort((a, b) => b[1] - a[1])
                  .map(([layer, count]) => (
                    <div key={layer} className="flex items-center justify-between p-2 bg-cad-surface rounded border border-cad-border/50">
                      <span className="text-xs font-bold text-cad-text-primary truncate mr-4">{layer}</span>
                      <span className="text-sm font-black text-emerald-400">{count}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* By Region */}
            <div className="bg-cad-elevated rounded-lg border border-cad-border p-4">
              <h3 className="text-xs font-black text-cad-text-muted uppercase tracking-widest mb-3">
                Theo vùng
              </h3>
              <div className="space-y-2 max-h-96 overflow-auto custom-scrollbar">
                {Object.entries(bomSummary.summary.byRegion)
                  .sort((a, b) => b[1] - a[1])
                  .map(([region, count]) => (
                    <div key={region} className="flex items-center justify-between p-2 bg-cad-surface rounded border border-cad-border/50">
                      <span className="text-xs font-bold text-cad-text-primary truncate mr-4">{region}</span>
                      <span className="text-sm font-black text-purple-400">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

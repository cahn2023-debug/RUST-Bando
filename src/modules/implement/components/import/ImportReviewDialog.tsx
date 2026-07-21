import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, FileCode, X, SquareCheckBig } from 'lucide-react';
import type { FeatureRecord } from '@IMPLEMENT/services/importService';

interface ImportReviewDialogProps {
  open: boolean;
  fileName: string;
  sourceLabel: string;
  records: FeatureRecord[];
  onClose: () => void;
  onConfirm: (records: FeatureRecord[]) => Promise<void> | void;
}

const summarizeProperties = (properties: Record<string, string>) => {
  const entries = Object.entries(properties).slice(0, 4);
  if (entries.length === 0) return 'No mapped fields';
  return entries.map(([key, value]) => `${key}: ${value}`).join(' | ');
};

export function ImportReviewDialog({
  open,
  fileName,
  sourceLabel,
  records,
  onClose,
  onConfirm,
}: ImportReviewDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const normalizedRecords = useMemo(() => records.map((record) => record.id), [records]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIds(normalizedRecords);
  }, [normalizedRecords]);

  if (!open) return null;

  const selectedCount = selectedIds.length;
  const selectedRecords = records.filter((record) => selectedIds.includes(record.id));
  const allSelected = selectedCount === records.length && records.length > 0;

  const toggleRecord = (id: string) => {
    setSelectedIds((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : records.map((record) => record.id));
  };

  return (
    <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-cad-border bg-cad-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-cad-border bg-cad-elevated px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-lg bg-cad-accent/10 p-2 text-cad-accent">
              {sourceLabel === 'KML/KMZ' ? <FileCode size={18} /> : <FileSpreadsheet size={18} />}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold uppercase tracking-wider text-cad-text-primary">{fileName}</div>
              <div className="truncate text-[10px] uppercase tracking-widest text-cad-text-muted">{sourceLabel}</div>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-cad-text-muted hover:bg-cad-surface hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          <div className="mb-4 flex items-center justify-between rounded-lg border border-cad-border bg-cad-bg px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-cad-text-muted">
              {records.length} records detected
            </div>
            <button
              onClick={toggleAll}
              className="flex items-center gap-2 rounded border border-cad-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-cad-text-secondary hover:border-cad-accent hover:text-cad-accent"
            >
              <SquareCheckBig size={12} />
              {allSelected ? 'Unselect all' : 'Select all'}
            </button>
          </div>

          <div className="grid gap-2">
            {records.map((record) => (
              <label
                key={record.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-cad-border bg-cad-bg px-4 py-3 hover:border-cad-accent/40"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(record.id)}
                  onChange={() => toggleRecord(record.id)}
                  className="mt-1 h-4 w-4 rounded border-cad-border text-cad-accent"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-cad-text-primary">
                    <span className="rounded border border-cad-border px-2 py-0.5 uppercase text-[10px] text-cad-text-muted">{record.geom_type}</span>
                    <span className="truncate">{record.properties.name || record.id}</span>
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-widest text-cad-text-muted">
                    {record.center_lat.toFixed(6)}, {record.center_lon.toFixed(6)}
                  </div>
                  <div className="mt-2 text-[10px] leading-relaxed text-cad-text-secondary">
                    {summarizeProperties(record.properties)}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-cad-border bg-cad-elevated px-5 py-4">
          <div className="text-[10px] uppercase tracking-widest text-cad-text-muted">
            {selectedCount} selected
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded border border-cad-border px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-cad-text-secondary hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={() => void onConfirm(selectedRecords)}
              disabled={selectedRecords.length === 0}
              className="rounded bg-cad-accent px-4 py-2 text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-50"
            >
              Confirm import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

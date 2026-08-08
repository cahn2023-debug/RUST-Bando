import type { ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, Download, Eye, Loader2 } from "lucide-react";
import { Button } from "@DESIGN/components/ui/Button";
import { cn } from "@TOOL/utils/cn";
import type { ReportModel } from "./reportModel";
import { getDescendantKeys, type SelectableReportItem } from "./useReportDialogState";

interface ReportOptionsFormProps {
  reportModel: ReportModel;
  reportTitle: string;
  defaultReportTitle: string;
  activeView: "select" | "preview";
  includeMapImages: boolean;
  isCapturing: boolean;
  isExporting: boolean;
  error: string | null;
  exportStatus: string | null;
  visibleSelectableItems: SelectableReportItem[];
  selectedKeys: Set<string>;
  selectableItems: SelectableReportItem[];
  expandedSelectionKeys: Set<string>;
  children: ReactNode;
  onReportTitleChange: (value: string) => void;
  onShowSelect: () => void;
  onPreview: () => void;
  onExport: () => void;
  onIncludeMapImagesChange: (value: boolean) => void;
  onToggleSelection: (key: string) => void;
  onToggleSelectionExpanded: (key: string) => void;
}

export function ReportOptionsForm({
  reportModel,
  reportTitle,
  defaultReportTitle,
  activeView,
  includeMapImages,
  isCapturing,
  isExporting,
  error,
  exportStatus,
  visibleSelectableItems,
  selectedKeys,
  selectableItems,
  expandedSelectionKeys,
  children,
  onReportTitleChange,
  onShowSelect,
  onPreview,
  onExport,
  onIncludeMapImagesChange,
  onToggleSelection,
  onToggleSelectionExpanded,
}: ReportOptionsFormProps) {
  return (
    <>
        <div className="h-12 border-b border-cad-border flex items-center justify-between px-5 shrink-0">
          <div className="flex min-w-0 items-center gap-2">
            <label className="flex min-w-[260px] max-w-[430px] items-center gap-2 text-[10px] font-black uppercase tracking-wide text-cad-text-muted">
              Tiêu đề
              <input
                type="text"
                value={reportTitle}
                onChange={(event) => onReportTitleChange(event.target.value)}
                className="min-w-0 flex-1 rounded border border-cad-border bg-cad-elevated px-2 py-1.5 text-xs font-semibold normal-case tracking-normal text-cad-text-primary outline-none focus:border-cad-accent"
                placeholder={defaultReportTitle}
              />
            </label>
            <button
              onClick={() => onShowSelect()}
              className={cn("px-3 py-1.5 text-[10px] font-bold uppercase rounded border", activeView === "select" ? "border-cad-accent text-cad-accent bg-cad-accent/10" : "border-cad-border text-cad-text-muted")}
            >
              Chọn dữ liệu
            </button>
            <button
              onClick={onPreview}
              disabled={isCapturing}
              className="px-3 py-1.5 text-[10px] font-bold uppercase rounded border border-cad-border text-cad-text-secondary hover:text-cad-text-primary flex items-center gap-2 disabled:opacity-50"
            >
              {isCapturing ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
              Preview
            </button>
          </div>
          <Button
            variant="primary"
            size="md"
            icon={Download}
            loading={isExporting}
            disabled={reportModel.sections.length === 0}
            onClick={onExport}
            className="uppercase tracking-wide"
          >
            Xuất Word
          </Button>
        </div>

        {error && (
          <div className="px-5 py-2 bg-cad-danger/10 text-cad-danger text-xs border-b border-cad-danger/20">
            {error}
          </div>
        )}

        {exportStatus && (
          <div className="px-5 py-2 bg-cad-accent/10 text-cad-accent text-xs border-b border-cad-accent/20">
            {exportStatus}
          </div>
        )}

      <div className="flex-1 min-h-0 grid grid-cols-[320px_1fr]">
          <aside className="border-r border-cad-border overflow-y-auto p-3">
            <label className="mb-3 flex items-start gap-2 rounded border border-cad-border bg-cad-elevated p-2 text-[10px] text-cad-text-secondary">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={includeMapImages}
                onChange={(event) => onIncludeMapImagesChange(event.target.checked)}
              />
              <span>
                <span className="block font-black uppercase text-cad-text-primary">Kèm ảnh bản đồ khi xuất</span>
                <span className="block text-cad-text-muted">Bật mặc định. Có thể tắt nếu báo cáo quá nhiều đối tượng.</span>
              </span>
            </label>
            <div className="text-[10px] font-black uppercase tracking-widest text-cad-text-muted mb-2">Thư mục / đối tượng</div>
            <div className="space-y-1">
              {visibleSelectableItems.map((item) => {
                const checked = selectedKeys.has(item.key);
                const hasChildren = getDescendantKeys(selectableItems, item.key).length > 0;
                const isExpanded = expandedSelectionKeys.has(item.key);
                return (
                  <div
                    key={item.key}
                    className="flex items-center gap-1 rounded px-1 py-1 hover:bg-cad-text-primary/5 text-xs"
                    style={{ paddingLeft: 8 + item.level * 16 }}
                  >
                    <button
                      type="button"
                      onClick={() => hasChildren && onToggleSelectionExpanded(item.key)}
                      className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded text-cad-text-muted", hasChildren && "hover:bg-cad-text-primary/10 hover:text-cad-text-primary")}
                      aria-label={hasChildren ? (isExpanded ? "Thu gọn mục" : "Mở rộng mục") : undefined}
                      disabled={!hasChildren}
                    >
                      {hasChildren && (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
                    </button>
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                      <span className={cn("w-4 h-4 border rounded flex items-center justify-center shrink-0", checked ? "bg-cad-accent border-cad-accent text-black" : "border-cad-border")}>
                        {checked && <Check size={12} />}
                      </span>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => onToggleSelection(item.key)}
                      />
                      <span className="truncate text-cad-text-secondary">{item.name}</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </aside>
        {children}
      </div>
    </>
  );
}

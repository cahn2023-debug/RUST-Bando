import { ReportDialogHeader } from "./ReportDialogHeader";
import { ReportOptionsForm } from "./ReportOptionsForm";
import { ReportPreviewSection, SitePhotoPreviewItem } from "./ReportPreviewSection";
import { useReportDialogState } from "./useReportDialogState";

interface ReportExportDialogProps {
  projectName: string;
  onClose: () => void;
}

export function ReportExportDialog({ projectName, onClose }: ReportExportDialogProps) {
  const dialog = useReportDialogState(projectName);

  if (!dialog.state || !dialog.reportModel) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-cad-modal bg-black/65 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-[min(1180px,96vw)] h-[min(760px,92vh)] bg-cad-surface border border-cad-border shadow-2xl flex flex-col overflow-hidden rounded">
        <ReportDialogHeader sectionCount={dialog.reportModel.sections.length} onClose={onClose} />

        <ReportOptionsForm
          reportModel={dialog.reportModel}
          reportTitle={dialog.reportTitle}
          defaultReportTitle={dialog.defaultReportTitle}
          activeView={dialog.activeView}
          includeMapImages={dialog.includeMapImages}
          isCapturing={dialog.isCapturing}
          isExporting={dialog.isExporting}
          error={dialog.error}
          exportStatus={dialog.exportStatus}
          visibleSelectableItems={dialog.visibleSelectableItems}
          selectedKeys={dialog.selectedKeys}
          selectableItems={dialog.selectableItems}
          expandedSelectionKeys={dialog.expandedSelectionKeys}
          onReportTitleChange={dialog.handleReportTitleChange}
          onShowSelect={() => dialog.setActiveView("select")}
          onPreview={dialog.handlePreview}
          onExport={dialog.handleExport}
          onIncludeMapImagesChange={dialog.setIncludeMapImages}
          onToggleSelection={dialog.toggleSelection}
          onToggleSelectionExpanded={dialog.toggleSelectionExpanded}
        >
          <main className="overflow-hidden bg-white text-slate-900">
            {dialog.activeView === "select" ? (
              <div className="p-8 text-sm text-slate-600">
                Đã chọn {dialog.selectedKeys.size} mục. Bấm Preview để xem trước nội dung báo cáo.
              </div>
            ) : (
              <ReportPreviewSection
                model={dialog.reportModel}
                imageMap={dialog.imageMap}
                activeSectionId={dialog.currentSectionId}
                onSelectSection={dialog.handleSelectPreviewSection}
              />
            )}
          </main>
        </ReportOptionsForm>
      </div>
    </div>
  );
}

export { SitePhotoPreviewItem };

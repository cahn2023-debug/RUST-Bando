import { FileText, X } from "lucide-react";
import { Button } from "@DESIGN/components/ui/Button";

interface ReportDialogHeaderProps {
  sectionCount: number;
  onClose: () => void;
}

export function ReportDialogHeader({ sectionCount, onClose }: ReportDialogHeaderProps) {
  return (
        <div className="h-14 px-5 border-b border-cad-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cad-accent/10 text-cad-accent rounded">
              <FileText size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-cad-text-primary uppercase tracking-wide">Báo cáo thiết kế</h2>
              <p className="text-[10px] text-cad-text-muted">{sectionCount} mục chi tiết</p>
            </div>
          </div>
          <Button variant="ghost" size="md" icon={X} ariaLabel="Đóng hộp thoại báo cáo" onClick={onClose} />
        </div>
  );
}

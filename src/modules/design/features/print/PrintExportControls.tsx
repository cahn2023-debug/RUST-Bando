import { Download, Loader2 } from 'lucide-react';
import { Button } from '@DESIGN/components/ui/Button';
import { cn } from '@DESIGN/features/print/printDialogUtils';

type PrintArea = [number, number, number, number];

interface PrintExportControlsProps {
  paperSize: string;
  printArea: PrintArea | null;
  capturing: boolean;
  onClose: () => void;
  onPrint: () => void;
}

export function PrintExportControls({
  paperSize,
  printArea,
  capturing,
  onClose,
  onPrint,
}: PrintExportControlsProps) {
  return (
    <div className="p-5 border-t border-cad-border flex items-center justify-between bg-cad-header">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cad-accent animate-pulse" />
          <span className="text-[10px] font-black text-cad-text-secondary uppercase tracking-widest">System Ready</span>
        </div>
        <span className="text-[9px] text-cad-text-muted font-mono">Format: High-Res PNG | Output: {paperSize} Portrait</span>
      </div>
      <div className="flex gap-4">
        <Button
          variant="secondary"
          size="lg"
          onClick={onClose}
          className="px-8 rounded-xl font-black uppercase tracking-widest"
        >
          Hủy bỏ
        </Button>
        <button
          onClick={onPrint}
          disabled={capturing || !printArea}
          className={cn(
            "px-10 py-2.5 rounded-xl bg-cad-warn text-black font-black text-xs uppercase tracking-widest shadow-lg hover:shadow-cad-warn/40 transition-all flex items-center gap-3 group",
            capturing ? 'opacity-70 cursor-wait' : 'hover:scale-105 active:scale-95',
            !printArea && 'opacity-50 grayscale cursor-not-allowed'
          )}
        >
          {capturing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
              Xuất bản in
            </>
          )}
        </button>
      </div>
    </div>
  );
}

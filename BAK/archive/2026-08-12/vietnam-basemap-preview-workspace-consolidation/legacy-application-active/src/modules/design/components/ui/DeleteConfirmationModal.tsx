import { useEffect, useRef } from "react";
import { Trash2, AlertTriangle, X } from "lucide-react";
import { Button } from "@DESIGN/components/ui/Button";

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  itemName?: string;
}

export function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Xác nhận xóa dữ liệu",
  message = "Bạn có chắc chắn muốn xóa mục này không? Hành động này không thể hoàn tác và dữ liệu sẽ mất vĩnh viễn.",
  itemName,
}: DeleteConfirmationModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Escape closes; focus lands on the non-destructive action (MASTER.md §7).
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    cancelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-cad-overlay flex items-center justify-center p-4 animate-in fade-in duration-200">
      <button type="button" className="cad-overlay border-0 p-0" onClick={onClose} aria-label="Đóng hộp thoại" tabIndex={-1} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirmation-title"
        className="cad-dialog relative z-cad-modal w-full max-w-md border-cad-danger/30 animate-in zoom-in-95 duration-200"
      >
        {/* Top accent rule */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-cad-danger to-transparent" />

        <div className="flex items-center justify-between gap-3 border-b border-cad-border p-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-md bg-cad-danger/10 p-2">
              <AlertTriangle size={20} className="cad-icon-danger" aria-hidden="true" />
            </div>
            <h3
              id="delete-confirmation-title"
              className="truncate text-sm font-black uppercase tracking-widest text-cad-text-primary"
            >
              {title}
            </h3>
          </div>
          <Button variant="ghost" size="md" icon={X} onClick={onClose} ariaLabel="Đóng hộp thoại" />
        </div>

        <div className="flex flex-col items-center gap-6 p-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-cad-danger/20 bg-cad-danger/5">
            <Trash2 size={36} className="cad-icon-danger" aria-hidden="true" />
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium leading-relaxed text-cad-text-secondary">{message}</p>
            {itemName && (
              <div className="inline-block rounded-md border border-cad-border bg-cad-elevated px-4 py-2">
                <span className="text-xs font-bold italic text-cad-danger">
                  &quot;{itemName}&quot;
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 border-t border-cad-border bg-cad-elevated/40 p-5">
          <Button ref={cancelRef} variant="secondary" size="lg" onClick={onClose} className="flex-1">
            Hủy bỏ
          </Button>
          <Button
            variant="danger"
            size="lg"
            icon={Trash2}
            className="flex-1"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            Xác nhận xóa
          </Button>
        </div>
      </div>
    </div>
  );
}

import { Trash2, AlertTriangle, X } from "lucide-react";

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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 animate-in fade-in duration-300">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div
        className="relative w-full max-w-md bg-[#1e1e1e] border border-red-500/30 rounded-2xl shadow-[0_0_50px_rgba(239,68,68,0.15)] overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Gradient */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent" />

        {/* Subtle Background Glow */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-red-500/10 rounded-full blur-[80px] pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <AlertTriangle size={20} className="text-red-500" />
            </div>
            <h3 className="text-sm font-black text-white uppercase tracking-widest">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 flex flex-col items-center text-center space-y-6">
          <div className="relative">
            <div className="w-20 h-20 bg-red-500/5 rounded-full flex items-center justify-center border border-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.1)]">
              <Trash2 size={36} className="text-red-500 transition-transform hover:scale-110 duration-500" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-black rounded-full flex items-center justify-center animate-bounce">
              <span className="text-[10px] font-black">!</span>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-white/70 text-xs leading-relaxed font-medium">
              {message}
            </p>
            {itemName && (
              <div className="inline-block px-4 py-2 bg-white/5 border border-white/10 rounded-xl">
                <span className="text-red-400 font-bold text-xs italic">
                  "{itemName}"
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 bg-white/[0.02] border-t border-white/5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all border border-white/5"
          >
            Hủy bỏ
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-black text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-red-500/20 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
          >
            <Trash2 size={14} strokeWidth={3} />
            Xác nhận xóa
          </button>
        </div>
      </div>
    </div>
  );
}

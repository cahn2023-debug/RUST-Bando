import { create } from 'zustand';

interface ExportState {
  isExporting: boolean;
  progress: number;
  statusText: string;
  error: string | null;
  startExport: (initialText?: string) => void;
  updateProgress: (progress: number, text: string) => void;
  finishExport: () => void;
  setError: (error: string) => void;
}

export const useExportStore = create<ExportState>((set) => ({
  isExporting: false,
  progress: 0,
  statusText: '',
  error: null,
  startExport: (initialText = 'Đang khởi tạo quá trình xuất...') => set({
    isExporting: true,
    progress: 0,
    statusText: initialText,
    error: null
  }),
  updateProgress: (progress, text) => set({
    progress: Math.min(progress, 100),
    statusText: text
  }),
  finishExport: () => {
    // Small delay before closing to show 100%
    setTimeout(() => set({ isExporting: false, progress: 0, statusText: '', error: null }), 1000);
  },
  setError: (error) => set({ error, isExporting: true }) // Keep modal open to show error
}));

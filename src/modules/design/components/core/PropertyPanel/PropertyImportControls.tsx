import { useState } from 'react';
import { FileUp, Loader2, MapPin, Route, Image as ImageIcon, Grid3X3 } from 'lucide-react';
import { importFromExcel, importFromKML, getExcelHeaders, applyImportedRecords, type FeatureRecord } from '@IMPLEMENT/services/importService';
import { safeOpenDialog } from '@IMPLEMENT/lib/tauri';
import { ImportReviewDialog } from '@IMPLEMENT/components/import/ImportReviewDialog';

interface PropertyImportControlsProps {
  feature: any;
  setDrawingMode: (mode: any) => void;
  setSelectedGroup: (id: string) => void;
  setActiveParentFeature: (id: string | null) => void;
  setPreview: (id: string | null, meta: any) => void;
}

export const PropertyImportControls = ({
  feature,
  setDrawingMode,
  setSelectedGroup,
  setActiveParentFeature,
  setPreview,
}: PropertyImportControlsProps) => {
  const [isImporting, setIsImporting] = useState(false);
  const [review, setReview] = useState<{ fileName: string; sourceLabel: string; records: FeatureRecord[] } | null>(null);

  const confirmImport = async (records: FeatureRecord[]) => {
    const targetGroupId = feature.group_id;
    const importedCount = await applyImportedRecords(records, targetGroupId);
    setSelectedGroup(targetGroupId);
    setPreview(null, null);
    setReview(null);
    alert(`Đã import ${importedCount} đối tượng.`);
  };

  const handleFileUpload = async () => {
    if (!feature) return;
    setIsImporting(true);
    try {
      const selected = await safeOpenDialog({
        filters: [{ name: 'GIS Data', extensions: ['xlsx', 'xls', 'xlsm', 'xlsb', 'kml', 'kmz'] }],
        multiple: false,
        directory: false,
      });

      if (!selected || typeof selected !== 'string') {
        return;
      }

      const filePath = selected;
      const fileName = filePath.split(/[\\/]/).pop() || filePath;
      const ext = fileName.split('.').pop()?.toLowerCase() || '';

      if (['xls', 'xlsx', 'xlsm', 'xlsb'].includes(ext)) {
        const headers = await getExcelHeaders(filePath);
        if (headers.length === 0) {
          alert('File Excel không đọc được.');
          return;
        }

        const records = await importFromExcel(filePath, {
          name_column: headers[0] || '',
          lat_column: headers.find((header) => /lat|vi_do|latitude/i.test(header)) || '',
          lng_column: headers.find((header) => /lng|lon|kinh|longitude/i.test(header)) || '',
          description_column: headers.find((header) => /mo ta|description|ghi chu/i.test(header)),
          order_column: headers.find((header) => /stt|order|ma hieu|id/i.test(header)),
        });

        setReview({ fileName, sourceLabel: 'Excel', records });
      } else if (['kml', 'kmz'].includes(ext)) {
        const records = await importFromKML(filePath);
        setReview({ fileName, sourceLabel: 'KML/KMZ', records });
      } else if (ext === 'gpx') {
        alert('Định dạng GPX sẽ được hỗ trợ ở phiên bản tiếp theo.');
      } else {
        alert('Vui lòng chọn Excel, KML, hoặc KMZ.');
      }
    } catch (err: any) {
      console.error('Import error:', err);
      alert('Lỗi import: ' + (err.message || err));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="pt-2 space-y-3">
      <div className="space-y-2 rounded-md border border-orange-500/10 bg-orange-500/5 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-orange-400">
          <Grid3X3 size={12} /> Bảng điều khiển Nút giao
        </p>
        <button
          onClick={handleFileUpload}
          disabled={isImporting}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-white transition-all hover:bg-orange-700 disabled:opacity-60"
        >
          {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
          {isImporting ? 'Đang import...' : 'Upload dữ liệu (Excel/KML/KMZ)'}
        </button>
        <p className="px-1 text-[7px] leading-relaxed text-[#555]">
          Hỗ trợ: .xlsx, .xls, .xlsm, .xlsb, .kml, .kmz
        </p>
        <div className="my-1 h-px bg-orange-500/10" />
        <p className="mb-1 text-[8px] font-bold uppercase tracking-wider text-[#666]">Thêm thủ công:</p>
        <div className="grid grid-cols-1 gap-1.5">
          <button
            onClick={() => { setDrawingMode('point'); setSelectedGroup(feature.group_id); setActiveParentFeature(feature.id); }}
            className="flex items-center gap-2 rounded bg-[#252525] px-3 py-1.5 text-[8px] font-bold uppercase text-white transition-all hover:bg-indigo-600"
          >
            <MapPin size={10} className="text-indigo-400" /> Thêm điểm khảo sát
          </button>
          <button
            onClick={() => { setDrawingMode('polyline'); setSelectedGroup(feature.group_id); setActiveParentFeature(feature.id); }}
            className="flex items-center gap-2 rounded bg-[#252525] px-3 py-1.5 text-[8px] font-bold uppercase text-white transition-all hover:bg-emerald-600"
          >
            <Route size={10} className="text-emerald-400" /> Thêm tuyến/cáp
          </button>
          <button
            onClick={() => { setDrawingMode('image'); setSelectedGroup(feature.group_id); setActiveParentFeature(feature.id); }}
            className="flex items-center gap-2 rounded bg-[#252525] px-3 py-1.5 text-[8px] font-bold uppercase text-white transition-all hover:bg-amber-600"
          >
            <ImageIcon size={10} className="text-amber-400" /> Thêm ảnh hiện trường
          </button>
        </div>
      </div>

      {review && (
        <ImportReviewDialog
          open={true}
          fileName={review.fileName}
          sourceLabel={review.sourceLabel}
          records={review.records}
          onClose={() => setReview(null)}
          onConfirm={confirmImport}
        />
      )}
    </div>
  );
};

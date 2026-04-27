import React, { useRef, useState } from 'react';
import { FileUp, Loader2, MapPin, Route, Image as ImageIcon, Grid3X3 } from 'lucide-react';
import { importFromExcel, importFromKML, getExcelHeaders } from '@IMPLEMENT/services/importService';

interface PropertyImportControlsProps {
  feature: any;
  setDrawingMode: (mode: string) => void;
  setSelectedGroup: (id: string) => void;
  setActiveParentFeature: (id: string | null) => void;
  setPreview: (id: string | null, meta: any) => void;
}

export const PropertyImportControls: React.FC<PropertyImportControlsProps> = ({
  feature,
  setDrawingMode,
  setSelectedGroup,
  setActiveParentFeature,
  setPreview,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!feature || !e.target.files?.length) return;
    const file = e.target.files[0];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    setIsImporting(true);
    try {
      const targetGroupId = feature.group_id;

      if (['xls', 'xlsx', 'csv'].includes(ext)) {
        const headers = await getExcelHeaders(file.name);
        if (headers.length === 0) { alert('File Excel rỗng hoặc không đọc được.'); return; }
        const datasetId = await importFromExcel(file.name);
        alert(`✅ Đã bắt đầu import Excel/CSV: ${file.name}\nID Task: ${datasetId}`);
      } else if (['kml', 'kmz'].includes(ext)) {
        const datasetId = await importFromKML(file.name);
        alert(`✅ Đã bắt đầu import KML/KMZ: ${file.name}\nID Task: ${datasetId}`);
      } else if (['gpx'].includes(ext)) {
        alert('Định dạng GPX sẽ được hỗ trợ trong phiên bản tiếp theo.');
      } else {
        alert('Định dạng file không được hỗ trợ. Vui lòng chọn Excel, KML, hoặc KMZ.');
      }

      setSelectedGroup(targetGroupId);
      setPreview(null, null);
    } catch (err: any) {
      console.error('Import error:', err);
      alert('Lỗi import: ' + (err.message || err));
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="pt-2 space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv,.kml,.kmz,.gpx"
        className="hidden"
        onChange={handleFileUpload}
      />
      <div className="space-y-2 p-3 bg-orange-500/5 border border-orange-500/10 rounded-md">
        <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
          <Grid3X3 size={12} /> Bảng điều khiển Nút giao
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isImporting}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 disabled:opacity-60 text-white rounded-md transition-all text-[10px] font-bold uppercase tracking-wider shadow-lg shadow-orange-500/20 group"
        >
          {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />}
          {isImporting ? 'Đang import...' : 'Upload dữ liệu (Excel/KML/KMZ)'}
        </button>
        <p className="text-[7px] text-[#555] px-1 leading-relaxed">
          Hỗ trợ: .xlsx, .xls, .csv, .kml, .kmz
        </p>
        <div className="h-px bg-orange-500/10 my-1" />
        <p className="text-[8px] text-[#666] uppercase tracking-wider font-bold mb-1">Thêm thủ công:</p>
        <div className="grid grid-cols-1 gap-1.5">
          <button
            onClick={() => { setDrawingMode('point'); setSelectedGroup(feature.group_id); setActiveParentFeature(feature.id); }}
            className="flex items-center gap-2 py-1.5 px-3 bg-[#252525] hover:bg-indigo-600 text-white rounded text-[8px] font-bold uppercase transition-all"
          >
            <MapPin size={10} className="text-indigo-400" /> Thêm Điểm Khảo Sát
          </button>
          <button
            onClick={() => { setDrawingMode('polyline'); setSelectedGroup(feature.group_id); setActiveParentFeature(feature.id); }}
            className="flex items-center gap-2 py-1.5 px-3 bg-[#252525] hover:bg-emerald-600 text-white rounded text-[8px] font-bold uppercase transition-all"
          >
            <Route size={10} className="text-emerald-400" /> Thêm Tuyến/Cáp
          </button>
          <button
            onClick={() => { setDrawingMode('image'); setSelectedGroup(feature.group_id); setActiveParentFeature(feature.id); }}
            className="flex items-center gap-2 py-1.5 px-3 bg-[#252525] hover:bg-amber-600 text-white rounded text-[8px] font-bold uppercase transition-all"
          >
            <ImageIcon size={10} className="text-amber-400" /> Thêm Ảnh Hiện Trường
          </button>
        </div>
      </div>
    </div>
  );
};

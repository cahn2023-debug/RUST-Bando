import React, { useState } from 'react';
import { FileUp, Loader2, MapPin, Route, Image as ImageIcon, Grid3X3 } from 'lucide-react';
import { importFromExcel, importFromKML, getExcelHeaders, applyImportedRecords } from '@IMPLEMENT/services/importService';
import { safeOpenDialog } from '@IMPLEMENT/lib/tauri';
import { ImportReviewDialog } from '@IMPLEMENT/components/import/ImportReviewDialog';

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
  const [isImporting, setIsImporting] = useState(false);

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
      const targetGroupId = feature.group_id;

      if (['xls', 'xlsx', 'xlsm', 'xlsb'].includes(ext)) {
        const headers = await getExcelHeaders(filePath);
        if (headers.length === 0) { alert('File Excel rá»—ng hoáº·c khÃ´ng Ä‘á»c Ä‘Æ°á»£c.'); return; }
        const records = await importFromExcel(filePath, {
          name_column: headers[0] || '',
          lat_column: headers.find((header) => /lat|vĩ|vi_do|latitude/i.test(header)) || '',
          lng_column: headers.find((header) => /lng|lon|kinh|longitude/i.test(header)) || '',
          description_column: headers.find((header) => /mô tả|mo ta|description|ghi chú/i.test(header)),
          order_column: headers.find((header) => /stt|order|mã hiệu|ma hieu|id/i.test(header)),
        });
        const importedCount = await applyImportedRecords(records, targetGroupId);
        alert(`âœ… ÄÃ£ import ${importedCount} Ä‘á»‘i tÆ°á»£ng tá»« ${fileName}.`);
      } else if (['kml', 'kmz'].includes(ext)) {
        const records = await importFromKML(filePath);
        const importedCount = await applyImportedRecords(records, targetGroupId);
        alert(`âœ… ÄÃ£ import ${importedCount} Ä‘á»‘i tÆ°á»£ng tá»« ${fileName}.`);
      } else if (['gpx'].includes(ext)) {
        alert('Äá»‹nh dáº¡ng GPX sáº½ Ä‘Æ°á»£c há»— trá»£ trong phiÃªn báº£n tiáº¿p theo.');
      } else {
        alert('Äá»‹nh dáº¡ng file khÃ´ng Ä‘Æ°á»£c há»— trá»£. Vui lÃ²ng chá»n Excel, KML, hoáº·c KMZ.');
      }

      setSelectedGroup(targetGroupId);
      setPreview(null, null);
    } catch (err: any) {
      console.error('Import error:', err);
      alert('Lá»—i import: ' + (err.message || err));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="pt-2 space-y-3">
      <div className="space-y-2 p-3 bg-orange-500/5 border border-orange-500/10 rounded-md">
        <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
          <Grid3X3 size={12} /> Báº£ng Ä‘iá»u khiá»ƒn NÃºt giao
        </p>
        <button
          onClick={handleFileUpload}
          disabled={isImporting}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 disabled:opacity-60 text-white rounded-md transition-all text-[10px] font-bold uppercase tracking-wider shadow-lg shadow-orange-500/20 group"
        >
          {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />}
          {isImporting ? 'Äang import...' : 'Upload dá»¯ liá»‡u (Excel/KML/KMZ)'}
        </button>
        <p className="text-[7px] text-[#555] px-1 leading-relaxed">
          Há»— trá»£: .xlsx, .xls, .xlsm, .xlsb, .kml, .kmz
        </p>
        <div className="h-px bg-orange-500/10 my-1" />
        <p className="text-[8px] text-[#666] uppercase tracking-wider font-bold mb-1">ThÃªm thá»§ cÃ´ng:</p>
        <div className="grid grid-cols-1 gap-1.5">
          <button
            onClick={() => { setDrawingMode('point'); setSelectedGroup(feature.group_id); setActiveParentFeature(feature.id); }}
            className="flex items-center gap-2 py-1.5 px-3 bg-[#252525] hover:bg-indigo-600 text-white rounded text-[8px] font-bold uppercase transition-all"
          >
            <MapPin size={10} className="text-indigo-400" /> ThÃªm Äiá»ƒm Kháº£o SÃ¡t
          </button>
          <button
            onClick={() => { setDrawingMode('polyline'); setSelectedGroup(feature.group_id); setActiveParentFeature(feature.id); }}
            className="flex items-center gap-2 py-1.5 px-3 bg-[#252525] hover:bg-emerald-600 text-white rounded text-[8px] font-bold uppercase transition-all"
          >
            <Route size={10} className="text-emerald-400" /> ThÃªm Tuyáº¿n/CÃ¡p
          </button>
          <button
            onClick={() => { setDrawingMode('image'); setSelectedGroup(feature.group_id); setActiveParentFeature(feature.id); }}
            className="flex items-center gap-2 py-1.5 px-3 bg-[#252525] hover:bg-amber-600 text-white rounded text-[8px] font-bold uppercase transition-all"
          >
            <ImageIcon size={10} className="text-amber-400" /> ThÃªm áº¢nh Hiá»‡n TrÆ°á»ng
          </button>
        </div>
      </div>
    </div>
  );
};

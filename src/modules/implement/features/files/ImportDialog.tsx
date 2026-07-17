import { useState } from "react";
import { X, FileSpreadsheet, Upload, CheckCircle2, Loader2, FileCode, ArrowRight, Settings2, AlertCircle } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { importService, DatasetMeta, ImportMapping, applyImportedRecords, type FeatureRecord } from "@IMPLEMENT/services/importService";
import { ImportReviewDialog } from "@IMPLEMENT/components/import/ImportReviewDialog";

interface Props {
  onClose: () => void;
  onSuccess: (datasetId: string) => void;
}

type Step = "select" | "preview" | "mapping" | "importing" | "complete";

const COMMON_FIELDS = {
  name: ["tên", "name", "label", "đối tượng", "title"],
  lat: ["vĩ độ", "latitude", "lat", "y", "vi_do"],
  lon: ["kinh độ", "longitude", "lon", "lng", "x", "kinh_do"],
  order: ["stt", "thứ tự", "order", "no", "id", "số thứ tự"]
};

export function ImportDialog({ onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>("select");
  const [filePath, setFilePath] = useState<string>("");
  const [meta, setMeta] = useState<DatasetMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<{ fileName: string; sourceLabel: string; records: FeatureRecord[] } | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({
    name_column: "",
    lat_column: "",
    lng_column: ""
  });

  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'GIS Data',
          extensions: ['xlsx', 'xls', 'xlsb', 'xlsm', 'kml', 'kmz']
        }]
      });

      if (selected && typeof selected === 'string') {
        setFilePath(selected);
        setLoading(true);
        setError(null);

        const inferredMeta = await importService.analyzeFile(selected);
        setMeta(inferredMeta);

        // Auto-suggest mapping
        const newMapping: any = {};
        inferredMeta.fields.forEach(f => {
          const lowerName = f.name.toLowerCase();
          const lowerDisplay = f.display_name.toLowerCase();
          const matches = (keys: string[]) => keys.some(key => lowerName.includes(key) || lowerDisplay.includes(key));

          if (matches(COMMON_FIELDS.name)) newMapping.name_column = f.display_name;
          if (matches(COMMON_FIELDS.lat)) newMapping.lat_column = f.display_name;
          if (matches(COMMON_FIELDS.lon)) newMapping.lng_column = f.display_name;
          if (matches(COMMON_FIELDS.order)) newMapping.order_column = f.display_name;
        });
        setMapping(newMapping as ImportMapping);

        setStep("preview");
      }
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleStartImport = async () => {
    if (!filePath) return;

    setLoading(true);
    setStep("importing");
    setError(null);

    try {
      const records = await importService.startImport(filePath, mapping);
      setReview({
        fileName: filePath.split('\\').pop() || filePath,
        sourceLabel: isKml ? 'KML/KMZ' : 'Excel',
        records,
      });
      setStep("preview");
    } catch (err: any) {
      setError(err?.message || err?.toString() || "Import failed.");
      setStep("preview");
    } finally {
      setLoading(false);
    }
  };

  const isKml = filePath.toLowerCase().endsWith('.kml') || filePath.toLowerCase().endsWith('.kmz');

  const confirmImport = async (records: FeatureRecord[]) => {
    try {
      const importedCount = await applyImportedRecords(records);
      setStep("complete");
      onSuccess(`imported_${importedCount}`);
      onClose();
    } finally {
      setReview(null);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex-center bg-surface-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface-100 rounded-2xl shadow-2xl border border-surface-200 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200 relative pb-2">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl pointer-events-none -mt-32 -mr-32" />

        <div className="flex items-center justify-between p-6 border-b border-surface-200/50 bg-surface-50/50 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-500/10 rounded-xl text-brand-600">
              <Upload size={20} />
            </div>
            <h2 className="text-xl font-bold text-surface-900">Import GIS Data</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-200 hover:text-surface-900 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-8">
          {step === "select" && (
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-surface-300 rounded-2xl p-12 bg-surface-50/50 hover:bg-surface-50 transition-colors cursor-pointer group" onClick={handleSelectFile}>
              <div className="w-16 h-16 bg-brand-50 rounded-2xl flex-center text-brand-500 mb-4 group-hover:scale-110 transition-transform">
                <FileSpreadsheet size={32} />
              </div>
              <p className="text-surface-900 font-semibold mb-1 text-lg">Click to select a file</p>
              <p className="text-surface-500 text-sm">Supports Excel (.xlsx), KML (.kml), KMZ (.kmz)</p>
              {loading && <div className="mt-4 flex items-center gap-2 text-brand-500 font-medium">
                <Loader2 className="animate-spin" size={18} />
                <span>Analyzing structure...</span>
              </div>}
            </div>
          )}

          {step === "preview" && meta && (
            <div className="space-y-6">
              <div className="p-4 bg-brand-50 rounded-xl border border-brand-100 flex items-center gap-4">
                <div className="p-2 bg-white rounded-lg shadow-sm text-brand-500">
                  {isKml ? <FileCode size={20} /> : <FileSpreadsheet size={20} />}
                </div>
                <div>
                  <p className="text-xs text-brand-600 font-bold uppercase tracking-wider">Target File</p>
                  <p className="text-surface-900 font-medium truncate max-w-sm">{filePath.split('\\').pop()}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-surface-800 mb-3 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  Detected Schema (Fields)
                </h3>
                <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {meta.fields.map((f, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-surface-50 border border-surface-200 rounded-xl">
                      <span className="text-sm text-surface-900 font-medium">{f.name}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-surface-200 text-surface-600 rounded-md uppercase">{f.field_type}</span>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-3 text-rose-600">
                  <div className="p-1 bg-rose-100 rounded-lg text-rose-600">
                    <AlertCircle size={14} />
                  </div>
                  <p className="text-xs leading-relaxed">{error}</p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-surface-200/50">
                <button
                  onClick={() => setStep("select")}
                  className="px-5 py-2.5 text-sm font-semibold text-surface-600 hover:bg-surface-200 rounded-xl transition-colors"
                >
                  Change File
                </button>
                <button
                  onClick={() => setStep("mapping")}
                  className="flex items-center gap-2 px-8 py-2.5 text-sm font-bold bg-brand-600 hover:bg-brand-500 text-white rounded-xl shadow-md transition-all active:scale-95"
                >
                  Continue to Mapping
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {step === "mapping" && meta && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-2 mb-2">
                <Settings2 size={18} className="text-brand-500" />
                <h3 className="font-bold text-surface-900">Map your data columns</h3>
              </div>

              <div className="grid gap-4">
                {[
                  { label: "STT (Order)", key: "order_column" as const },
                  { label: "Name (Tên)", key: "name_column" as const },
                  { label: "Latitude (Vĩ độ)", key: "lat_column" as const },
                  { label: "Longitude (Kinh độ)", key: "lng_column" as const },
                ].map((field) => (
                  <div key={field.key} className="flex items-center gap-4 p-3 bg-surface-50 border border-surface-200 rounded-xl">
                    <span className="text-sm font-medium text-surface-700 w-32 shrink-0">{field.label}</span>
                    <select
                      value={mapping[field.key] || ""}
                      onChange={(e) => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                      className="flex-1 bg-white border border-surface-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                    >
                      <option value="">-- Do not map --</option>
                      {meta.fields.map((f) => (
                        <option key={f.name} value={f.display_name}>{f.display_name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-surface-500 bg-surface-50 p-3 rounded-lg border border-surface-200">
                ℹ️ Unmapped columns will be stored as additional attributes in the object's info.
              </p>

              <div className="flex justify-end gap-3 pt-4 border-t border-surface-200/50">
                <button
                  onClick={() => setStep("preview")}
                  className="px-5 py-2.5 text-sm font-semibold text-surface-600 hover:bg-surface-200 rounded-xl transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleStartImport}
                  className="px-8 py-2.5 text-sm font-bold bg-brand-600 hover:bg-brand-500 text-white rounded-xl shadow-md transition-all active:scale-95"
                >
                  Start Import
                </button>
              </div>
            </div>
          )}

          {step === "importing" && (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-brand-500/20 rounded-full blur-2xl animate-pulse" />
                <Loader2 className="animate-spin text-brand-600 relative" size={64} />
              </div>
              <h3 className="text-xl font-bold text-surface-900 mb-2">Processing Data</h3>
              <p className="text-surface-500 max-w-xs">
                Applying field mapping, generating metadata, and batch uploading to Firestore...
              </p>
            </div>
          )}

          {step === "complete" && (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex-center mb-6 animate-in zoom-in duration-500">
                <CheckCircle2 size={48} />
              </div>
              <h3 className="text-2xl font-bold text-surface-900 mb-2">Import Successful</h3>
              <p className="text-surface-500">Your dataset has been imported and indexed successfully.</p>
            </div>
          )}
        </div>
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
    </>
  );
}

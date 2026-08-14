import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  Loader2,
  Settings2,
  Upload,
  X,
} from "lucide-react";
import { open } from "@/contracts/tauri-api/runtime";
import type { Project } from "@CONTRACT/types";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import {
  applyImportedRecords,
  importService,
  type DatasetMeta,
  type FeatureRecord,
  type ImportMapping,
  type PmpImportPreview,
} from "@IMPLEMENT/services/importService";
import { requestStorageHealthRefresh } from "@IMPLEMENT/services/projectStorageService";
import { ImportReviewDialog } from "@IMPLEMENT/components/import/ImportReviewDialog";

interface Props {
  onClose: () => void;
  onSuccess: (datasetId: string) => void;
  project?: Project | null;
}

type Step = "select" | "preview" | "mapping" | "importing" | "complete" | "pmpPreview";
type ImportMode = "gis" | "pmp" | null;

const COMMON_FIELDS = {
  name: ["ten", "name", "label", "doi tuong", "title"],
  lat: ["vi do", "latitude", "lat", "y", "vi_do"],
  lon: ["kinh do", "longitude", "lon", "lng", "x", "kinh_do"],
  order: ["stt", "thu tu", "order", "no", "id", "so thu tu"],
};

export function ImportDialog({ onClose, onSuccess, project }: Props) {
  const [step, setStep] = useState<Step>("select");
  const [mode, setMode] = useState<ImportMode>(null);
  const [filePath, setFilePath] = useState("");
  const [meta, setMeta] = useState<DatasetMeta | null>(null);
  const [pmpPreview, setPmpPreview] = useState<PmpImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<{
    fileName: string;
    sourceLabel: string;
    records: FeatureRecord[];
  } | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({
    name_column: "",
    lat_column: "",
    lng_column: "",
  });

  const isKml =
    filePath.toLowerCase().endsWith(".kml") || filePath.toLowerCase().endsWith(".kmz");

  const resetSelection = () => {
    setFilePath("");
    setMeta(null);
    setPmpPreview(null);
    setReview(null);
    setError(null);
    setMode(null);
    setMapping({
      name_column: "",
      lat_column: "",
      lng_column: "",
    });
    setStep("select");
  };

  const handleSelectGisFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "GIS Data",
            extensions: ["xlsx", "xls", "xlsb", "xlsm", "kml", "kmz"],
          },
        ],
      });

      if (!selected || typeof selected !== "string") {
        return;
      }

      setMode("gis");
      setFilePath(selected);
      setLoading(true);
      setError(null);
      setPmpPreview(null);

      const inferredMeta = await importService.analyzeFile(selected);
      setMeta(inferredMeta);

      const newMapping: Partial<ImportMapping> = {};
      inferredMeta.fields.forEach((field) => {
        const lowerName = field.name.toLowerCase();
        const lowerDisplay = field.display_name.toLowerCase();
        const matches = (keys: string[]) =>
          keys.some((key) => lowerName.includes(key) || lowerDisplay.includes(key));

        if (matches(COMMON_FIELDS.name)) newMapping.name_column = field.display_name;
        if (matches(COMMON_FIELDS.lat)) newMapping.lat_column = field.display_name;
        if (matches(COMMON_FIELDS.lon)) newMapping.lng_column = field.display_name;
        if (matches(COMMON_FIELDS.order)) newMapping.order_column = field.display_name;
      });

      setMapping({
        name_column: newMapping.name_column || "",
        lat_column: newMapping.lat_column || "",
        lng_column: newMapping.lng_column || "",
        description_column: newMapping.description_column,
        order_column: newMapping.order_column,
      });
      setStep("preview");
    } catch (err: any) {
      setError(err?.message || err?.toString() || "Failed to analyze import file.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPmpFile = async () => {
    try {
      if (!project?.id || !project.path) {
        throw new Error("Open a target project before importing a .pmp file.");
      }

      const selected = await open({
        multiple: false,
        filters: [{ name: "PMP Database", extensions: ["pmp"] }],
      });

      if (!selected || typeof selected !== "string") {
        return;
      }

      setMode("pmp");
      setFilePath(selected);
      setLoading(true);
      setError(null);
      setMeta(null);
      setReview(null);

      const preview = await importService.analyzePmpImport(selected);
      setPmpPreview(preview);
      setStep("pmpPreview");
    } catch (err: any) {
      setError(err?.message || err?.toString() || "Failed to inspect .pmp file.");
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
        fileName: filePath.split("\\").pop() || filePath,
        sourceLabel: isKml ? "KML/KMZ" : "Excel",
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

  const confirmImportRecords = async (records: FeatureRecord[]) => {
    try {
      const importedCount = await applyImportedRecords(records);
      setStep("complete");
      onSuccess(`imported_${importedCount}`);
      onClose();
    } finally {
      setReview(null);
    }
  };

  const confirmPmpImport = async () => {
    if (!project?.id || !project.path || !filePath) {
      setError("Target project is missing for .pmp import.");
      return;
    }

    setLoading(true);
    setStep("importing");
    setError(null);

    try {
      const result = await importService.importPmpIntoProject(filePath, String(project.id));
      await useDesignSync.getState().initialize(String(project.id), project.path);
      requestStorageHealthRefresh();
      setStep("complete");
      onSuccess(`pmp_import_${result.importedFeatures}`);
      onClose();
    } catch (err: any) {
      setError(err?.message || err?.toString() || "PMP import failed.");
      setStep("pmpPreview");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-cad-overlay flex-center bg-surface-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="bg-surface-100 rounded-2xl shadow-2xl border border-surface-200 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200 relative pb-2">
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl pointer-events-none -mt-32 -mr-32" />

          <div className="flex items-center justify-between p-6 border-b border-surface-200/50 bg-surface-50/50 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-500/10 rounded-xl text-brand-600">
                <Upload size={20} />
              </div>
              <h2 className="text-xl font-bold text-surface-900">Import Data</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-200 hover:text-surface-900 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-8">
            {step === "select" && (
              <div className="space-y-4">
                <button
                  type="button"
                  className="w-full flex flex-col items-center justify-center border-2 border-dashed border-surface-300 rounded-2xl p-10 bg-surface-50/50 hover:bg-surface-50 transition-colors text-left"
                  onClick={() => void handleSelectGisFile()}
                >
                  <div className="w-16 h-16 bg-brand-50 rounded-2xl flex-center text-brand-500 mb-4">
                    <FileSpreadsheet size={32} />
                  </div>
                  <p className="text-surface-900 font-semibold mb-1 text-lg">Import GIS dataset</p>
                  <p className="text-surface-500 text-sm">
                    Supports Excel (.xlsx) and KML/KMZ files.
                  </p>
                </button>

                <button
                  type="button"
                  className="w-full flex flex-col items-center justify-center border-2 border-dashed border-surface-300 rounded-2xl p-10 bg-surface-50/50 hover:bg-surface-50 transition-colors text-left"
                  onClick={() => void handleSelectPmpFile()}
                >
                  <div className="w-16 h-16 bg-brand-50 rounded-2xl flex-center text-brand-500 mb-4">
                    <FileArchive size={32} />
                  </div>
                  <p className="text-surface-900 font-semibold mb-1 text-lg">
                    Import from .pmp
                  </p>
                  <p className="text-surface-500 text-sm">
                    Merge design data and linked media into the current project.
                  </p>
                </button>

                {loading && (
                  <div className="flex items-center justify-center gap-2 text-brand-500 font-medium pt-2">
                    <Loader2 className="animate-spin" size={18} />
                    <span>Analyzing file...</span>
                  </div>
                )}

                {error && (
                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-3 text-rose-600">
                    <div className="p-1 bg-rose-100 rounded-lg text-rose-600">
                      <AlertCircle size={14} />
                    </div>
                    <p className="text-xs leading-relaxed">{error}</p>
                  </div>
                )}
              </div>
            )}

            {step === "preview" && meta && mode === "gis" && (
              <div className="space-y-6">
                <div className="p-4 bg-brand-50 rounded-xl border border-brand-100 flex items-center gap-4">
                  <div className="p-2 bg-cad-surface rounded-lg shadow-sm text-cad-accent">
                    {isKml ? <FileCode size={20} /> : <FileSpreadsheet size={20} />}
                  </div>
                  <div>
                    <p className="text-xs text-brand-600 font-bold uppercase tracking-wider">
                      Target File
                    </p>
                    <p className="text-surface-900 font-medium truncate max-w-sm">
                      {filePath.split("\\").pop()}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-surface-800 mb-3 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    Detected Schema
                  </h3>
                  <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {meta.fields.map((field) => (
                      <div
                        key={field.name}
                        className="flex items-center justify-between p-3 bg-surface-50 border border-surface-200 rounded-xl"
                      >
                        <span className="text-sm text-surface-900 font-medium">
                          {field.name}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-surface-200 text-surface-600 rounded-md uppercase">
                          {field.field_type}
                        </span>
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
                    onClick={resetSelection}
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

            {step === "pmpPreview" && pmpPreview && mode === "pmp" && (
              <div className="space-y-6">
                <div className="p-4 bg-brand-50 rounded-xl border border-brand-100 flex items-center gap-4">
                  <div className="p-2 bg-cad-surface rounded-lg shadow-sm text-cad-accent">
                    <FileArchive size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-brand-600 font-bold uppercase tracking-wider">
                      Source PMP
                    </p>
                    <p className="text-surface-900 font-medium truncate max-w-sm">
                      {filePath.split("\\").pop()}
                    </p>
                    <p className="text-xs text-surface-500 mt-1 truncate">
                      {pmpPreview.sourceProjectName}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Regions" value={pmpPreview.regions} />
                  <Metric label="Layers" value={pmpPreview.layers} />
                  <Metric label="Groups" value={pmpPreview.groups} />
                  <Metric label="Features" value={pmpPreview.features} />
                  <Metric label="Media" value={pmpPreview.mediaAssets} />
                  <Metric label="Target" value={project?.name || "Missing"} />
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
                  Imported data will be copied into the current project with new IDs. Existing
                  data stays unchanged.
                </div>

                {pmpPreview.warnings.length > 0 && (
                  <div className="space-y-2">
                    {pmpPreview.warnings.map((warning) => (
                      <div
                        key={warning}
                        className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-3 text-rose-600"
                      >
                        <div className="p-1 bg-rose-100 rounded-lg text-rose-600">
                          <AlertCircle size={14} />
                        </div>
                        <p className="text-xs leading-relaxed">{warning}</p>
                      </div>
                    ))}
                  </div>
                )}

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
                    onClick={resetSelection}
                    className="px-5 py-2.5 text-sm font-semibold text-surface-600 hover:bg-surface-200 rounded-xl transition-colors"
                  >
                    Change File
                  </button>
                  <button
                    onClick={() => void confirmPmpImport()}
                    className="flex items-center gap-2 px-8 py-2.5 text-sm font-bold bg-brand-600 hover:bg-brand-500 text-white rounded-xl shadow-md transition-all active:scale-95"
                  >
                    Import PMP
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {step === "mapping" && meta && mode === "gis" && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-200">
                <div className="flex items-center gap-2 mb-2">
                  <Settings2 size={18} className="text-brand-500" />
                  <h3 className="font-bold text-surface-900">Map your data columns</h3>
                </div>

                <div className="grid gap-4">
                  {[
                    { label: "STT (Order)", key: "order_column" as const },
                    { label: "Name", key: "name_column" as const },
                    { label: "Latitude", key: "lat_column" as const },
                    { label: "Longitude", key: "lng_column" as const },
                  ].map((field) => (
                    <div
                      key={field.key}
                      className="flex items-center gap-4 p-3 bg-surface-50 border border-surface-200 rounded-xl"
                    >
                      <span className="text-sm font-medium text-surface-700 w-32 shrink-0">
                        {field.label}
                      </span>
                      <select
                        value={mapping[field.key] || ""}
                        onChange={(event) =>
                          setMapping((prev) => ({
                            ...prev,
                            [field.key]: event.target.value,
                          }))
                        }
                        className="cad-input flex-1 rounded-lg px-3 py-1.5 text-sm transition-all"
                      >
                        <option value="">-- Do not map --</option>
                        {meta.fields.map((fieldMeta) => (
                          <option key={fieldMeta.name} value={fieldMeta.display_name}>
                            {fieldMeta.display_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <p className="text-[10px] text-surface-500 bg-surface-50 p-3 rounded-lg border border-surface-200">
                  Unmapped columns will be kept as extra properties on imported features.
                </p>

                <div className="flex justify-end gap-3 pt-4 border-t border-surface-200/50">
                  <button
                    onClick={() => setStep("preview")}
                    className="px-5 py-2.5 text-sm font-semibold text-surface-600 hover:bg-surface-200 rounded-xl transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => void handleStartImport()}
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
                  {mode === "pmp"
                    ? "Copying design data, remapping IDs, and rebuilding the project snapshot."
                    : "Applying field mapping and preparing imported records."}
                </p>
              </div>
            )}

            {step === "complete" && (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex-center mb-6 animate-in zoom-in duration-200">
                  <CheckCircle2 size={48} />
                </div>
                <h3 className="text-2xl font-bold text-surface-900 mb-2">Import Successful</h3>
                <p className="text-surface-500">
                  {mode === "pmp"
                    ? "The .pmp data has been merged into the current project."
                    : "Your dataset has been imported successfully."}
                </p>
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
          onConfirm={confirmImportRecords}
        />
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between p-3 bg-surface-50 border border-surface-200 rounded-xl">
      <span className="text-sm text-surface-600 font-medium">{label}</span>
      <span className="text-sm font-bold text-surface-900">{value}</span>
    </div>
  );
}

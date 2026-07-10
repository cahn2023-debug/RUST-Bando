import { useState, useEffect } from "react";
import { safeInvoke as invoke, safeSaveDialog as save } from "@IMPLEMENT/lib/tauri";
import { X, FolderPlus, Info } from "lucide-react";

interface Props {
  onClose: () => void;
  onSuccess: (path?: string) => void;
}

export function CreateProjectModal({ onClose, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-derive project name whenever path changes
  useEffect(() => {
    if (path) {
      const filenameWithExt = path.split(/[/\\]/).pop() || "";
      const derivedName = filenameWithExt.replace(/\.pmp$/i, "");
      if (derivedName && derivedName !== name) {
        console.log("[CreateProjectModal] Auto-deriving name:", derivedName);
        setName(derivedName);
      }
    }
  }, [path, name]);

  const handleSelectPath = async () => {
    try {
      console.info("[CreateProjectModal] Opening save dialog...");
      const selected = await save({
        filters: [{ name: 'PMP Database', extensions: ['pmp'] }],
        defaultPath: 'Project.pmp',
        title: 'Save New Project'
      });

      if (selected && typeof selected === 'string') {
        console.info("[CreateProjectModal] Path selected:", selected);
        setPath(selected);
        
        // Extract filename without extension as project name
        // Supports both \ and / for cross-platform robustness
        const filenameWithExt = selected.split(/[\\/]/).pop() || "";
        const filename = filenameWithExt.replace(/\.pmp$/i, "");
        
        if (filename) {
          console.info("[CreateProjectModal] Derived name:", filename);
          setName(filename);
        }
      }
    } catch (e) {
      console.error("[CreateProjectModal] Select path error:", e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim() || !name.trim()) {
      console.warn("[CreateProjectModal] Validation failed: path or name is empty.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      console.log("[CreateProjectModal] Submitting New Project", { path, name });

      const projectUuid = await invoke<string>("create_pmp_v2", {
        path,
        name,
        description: desc || null
      });

      console.log("[CreateProjectModal] Success! Project UUID:", projectUuid);
      
      // Delay before success to ensure backend file handles are fully released
      setTimeout(() => {
        onSuccess(path);
      }, 1000);
      
      onClose();
    } catch (err: any) {
      console.error("[CreateProjectModal] Submission Error:", err);
      setError(err.message || "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex-center bg-surface-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface-100 rounded-2xl shadow-2xl border border-surface-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl pointer-events-none -mt-32 -mr-32" />
        <div className="flex items-center justify-between p-6 border-b border-surface-200/50 bg-surface-50/50 backdrop-blur">
          <h2 className="text-xl font-bold text-surface-900">New Project</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-200 hover:text-surface-900 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5 relative z-10">

          <div>
            <label className="block text-sm font-semibold text-surface-800 mb-1.5">Database File (.pmp) <span className="text-rose-500">*</span></label>
            <div className="flex gap-2">
              <input
                required
                readOnly
                type="text"
                value={path}
                placeholder="Select where to save the .pmp file"
                className="flex-1 border border-surface-300 bg-surface-50 rounded-xl px-4 py-2.5 text-sm outline-none text-surface-900 shadow-inner overflow-ellipsis"
              />
              <button
                type="button"
                onClick={handleSelectPath}
                className="px-4 bg-brand-600 hover:bg-brand-500 rounded-xl transition-colors flex-center text-white shadow-sm"
                title="Browse..."
              >
                <FolderPlus size={18} />
              </button>
            </div>
            {error && (
              <div className="mt-2 text-xs text-rose-500 bg-rose-50 p-2 rounded-lg border border-rose-100 flex items-center gap-2">
                <Info size={14} className="rotate-180" />
                <span>{error}</span>
              </div>
            )}
            {name && (
              <div className="mt-2 flex items-center gap-2 text-xs text-brand-600 bg-brand-50 p-2 rounded-lg border border-brand-100">
                <Info size={14} />
                <span>Project Name: <strong>{name}</strong> (derived from file)</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-surface-800 mb-1.5">Description (Optional)</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Short description..."
              rows={3}
              className="w-full bg-surface-50 border border-surface-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all resize-none shadow-sm text-surface-900"
            />
          </div>

          <div className="mt-4 flex justify-end gap-3 pt-2 border-t border-surface-200/50">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-surface-600 hover:bg-surface-200 hover:text-surface-900 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={loading}
              type="submit"
              className="px-6 py-2.5 text-sm font-bold bg-brand-600 hover:bg-brand-500 text-white rounded-xl shadow-md hover:shadow-brand-500/25 border border-brand-500 transition-all disabled:opacity-50 active:scale-95"
            >
              {loading ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

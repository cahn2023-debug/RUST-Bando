import { useState, useEffect } from "react";
import { safeInvoke as invoke, safeSaveDialog as save } from "@IMPLEMENT/lib/tauri";
import type { Project } from "@CONTRACT/types";
import { X, FolderPlus, Info } from "lucide-react";

interface Props {
  onClose: () => void;
  onSuccess: (project?: Project) => void;
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

      const project = await invoke<Project>("create_pmp_v2", {
        path,
        name,
        description: desc || null
      });

      console.log("[CreateProjectModal] Success! Project:", project?.id || "unknown");
      onSuccess(project || undefined);
      onClose();
    } catch (err: any) {
      console.error("[CreateProjectModal] Submission Error:", err);
      setError(err.message || "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div
        className="relative w-full max-w-md bg-[#1e1e1e] border border-cad-border rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Gradient */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cad-accent to-transparent" />

        {/* Subtle Background Glow */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-cad-accent/5 rounded-full blur-[80px] pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h2 className="text-sm font-black text-white uppercase tracking-widest">New Project</h2>
          <button
            onClick={onClose}
            className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-all"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5 relative z-10">

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-cad-text-secondary mb-1.5">
              Database File (.pmp) <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                required
                readOnly
                type="text"
                value={path}
                placeholder="Select where to save the .pmp file"
                className="flex-1 bg-cad-bg border border-cad-border hover:border-cad-accent/50 focus:border-cad-accent rounded-sm px-4 py-2 text-xs outline-none text-cad-text-primary transition-all font-mono overflow-ellipsis"
              />
              <button
                type="button"
                onClick={handleSelectPath}
                className="px-4 bg-cad-accent hover:bg-white text-black font-black rounded-sm transition-all flex items-center justify-center shadow-md shadow-cad-accent/15"
                title="Browse..."
              >
                <FolderPlus size={18} />
              </button>
            </div>
            {error && (
              <div className="mt-2 text-[10px] font-mono uppercase text-red-400 bg-red-500/10 p-2.5 rounded-sm border border-red-500/20 flex items-center gap-2">
                <Info size={14} className="rotate-180" />
                <span>{error}</span>
              </div>
            )}
            {name && (
              <div className="mt-2 flex items-center gap-2 text-[10px] font-mono uppercase text-cad-accent bg-cad-accent/10 p-2.5 rounded-sm border border-cad-accent/20">
                <Info size={14} />
                <span>Project Name: <strong>{name}</strong> (derived from file)</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-cad-text-secondary mb-1.5">
              Description (Optional)
            </label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Short description..."
              rows={3}
              className="w-full bg-cad-bg border border-cad-border hover:border-cad-accent/50 focus:border-cad-accent rounded-sm px-4 py-3 text-xs outline-none transition-all resize-none text-cad-text-primary"
            />
          </div>

          <div className="mt-4 flex justify-end gap-3 pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-[10px] font-black uppercase tracking-wider rounded-sm transition-all border border-white/5"
            >
              Cancel
            </button>
            <button
              disabled={loading}
              type="submit"
              className="flex-1 py-3 bg-cad-accent hover:bg-white text-black text-[10px] font-black uppercase tracking-wider rounded-sm transition-all shadow-lg shadow-cad-accent/20 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

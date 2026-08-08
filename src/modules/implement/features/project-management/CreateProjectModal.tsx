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

  useEffect(() => {
    if (path) {
      const filenameWithExt = path.split(/[/\\]/).pop() || "";
      const derivedName = filenameWithExt.replace(/\.pmp$/i, "");
      if (derivedName && derivedName !== name) {
        console.log("[CreateProjectModal] Auto-deriving name:", derivedName);
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
    <div className="fixed inset-0 z-cad-overlay flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="cad-overlay" onClick={onClose} />

      <div
        className="cad-dialog relative w-full max-w-md animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 bg-gradient-to-r from-transparent via-cad-accent to-transparent" />
        <div className="flex items-center justify-between border-b border-cad-border px-5 py-4">
          <div>
            <h2 className="text-sm font-black text-cad-text-primary uppercase tracking-[0.16em]">New Project</h2>
            <p className="text-[9px] text-cad-text-muted uppercase tracking-[0.14em] mt-1">Create a new workspace file</p>
          </div>
          <button
            onClick={onClose}
            className="cad-icon-button"
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
                className="cad-input flex-1 font-mono overflow-ellipsis"
              />
              <button
                type="button"
                onClick={handleSelectPath}
                className="cad-button cad-button-primary px-4"
                title="Browse..."
              >
                <FolderPlus size={18} />
              </button>
            </div>
            {error && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 p-2.5 text-[10px] font-mono uppercase text-red-300">
                <Info size={14} className="rotate-180" />
                <span>{error}</span>
              </div>
            )}
            {name && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-cad-accent/20 bg-cad-accent/10 p-2.5 text-[10px] font-mono uppercase text-cad-accent">
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
              className="cad-textarea"
            />
          </div>

          <div className="mt-4 flex justify-end gap-3 border-t border-cad-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="cad-button cad-button-secondary flex-1 py-3"
            >
              Cancel
            </button>
            <button
              disabled={loading}
              type="submit"
              className="cad-button cad-button-primary flex-1 py-3"
            >
              {loading ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, FolderPlus } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateProjectModal({ onClose, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSelectPath = async () => {
    try {
      const selected = await save({
        filters: [{ name: 'PMP Database', extensions: ['pmp'] }],
        defaultPath: name ? `${name.replace(/\s+/g, '_')}.pmp` : 'New_Project.pmp'
      });
      if (selected && typeof selected === 'string') {
        setPath(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !path.trim()) return;

    setLoading(true);
    try {
      // 1. Create the physical PMP DB
      await invoke("create_pmp_file", { path });

      // 2. Insert the project metadata into this newly created DB
      await invoke("create_project", {
        name,
        path, // We store the pmp path inside its own DB as the root reference
        description: desc || null
      });
      
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      alert("Error: " + err);
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
            <label className="block text-sm font-semibold text-surface-800 mb-1.5">Project Name <span className="text-rose-500">*</span></label>
            <input 
              required
              autoFocus
              type="text" 
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. QL Ban Hang v2"
              className="w-full bg-surface-50 border border-surface-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all text-surface-900 shadow-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-surface-800 mb-1.5">Database File (.pmp) <span className="text-rose-500">*</span></label>
            <div className="flex gap-2">
              <input 
                required
                readOnly
                type="text" 
                value={path}
                placeholder="Select where to save the .pmp file"
                className="flex-1 border border-surface-300 bg-surface-200/50 rounded-xl px-4 py-2.5 text-sm outline-none cursor-not-allowed text-surface-500 shadow-inner"
              />
              <button 
                type="button" 
                onClick={handleSelectPath}
                className="px-4 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-xl transition-colors flex-center text-brand-600 shadow-sm"
                title="Browse..."
              >
                <FolderPlus size={18} />
              </button>
            </div>
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

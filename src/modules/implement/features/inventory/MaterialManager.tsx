import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@/contracts/tauri-api/runtime";
import { Package, Plus, Trash2, Edit2, Search, Filter, Download } from "lucide-react";
import { Material } from "@CONTRACT/types";
import { DeleteConfirmationModal } from "@DESIGN/components/ui/DeleteConfirmationModal";

interface Props {
  projectId: string;
}

export function MaterialManager({ projectId }: Props) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newMaterial, setNewMaterial] = useState<Partial<Material>>({
    name: "",
    unit: "m",
    unit_cost: 0,
    category: "General"
  });
  const [deleteModalConfig, setDeleteModalConfig] = useState<{ isOpen: boolean; id: string | null; itemName: string }>({
    isOpen: false,
    id: null,
    itemName: ""
  });
  const materialNameInputRef = useRef<HTMLInputElement>(null);

  const categories = ["General", "Steel", "Concrete", "Wood", "Electrical", "Mechanical", "Finishing"];

  const loadMaterials = async () => {
    try {
      setLoading(true);
      const data = await invoke<Material[]>("get_materials");
      setMaterials(data);
    } catch (err) {
      console.error("Error loading materials:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMaterials();
  }, [projectId]);

  useEffect(() => {
    if (showAdd) materialNameInputRef.current?.focus();
  }, [showAdd]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMaterial.name) return;
    try {
      await invoke("create_material", {
        name: newMaterial.name,
        code: newMaterial.specs || null,
        unit: newMaterial.unit || "m",
        base_price: Number(newMaterial.unit_cost) || 0,
        category: newMaterial.category || "General"
      });
      setNewMaterial({ name: "", unit: "m", unit_cost: 0, category: "General" });
      setShowAdd(false);
      loadMaterials();
    } catch (err) {
      console.error("Error adding material:", err);
    }
  };

  const handleDelete = (id: string, name: string) => {
    setDeleteModalConfig({
      isOpen: true,
      id,
      itemName: name
    });
  };

  const confirmDelete = async () => {
    if (deleteModalConfig.id === null) return;
    try {
      await invoke("delete_material", { id: deleteModalConfig.id });
      loadMaterials();
    } catch (err) {
      console.error("Error deleting material:", err);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-cad-bg p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-display font-black text-white tracking-tight uppercase">Material Resources</h2>
          <p className="text-[10px] font-mono text-cad-text-muted uppercase">Inventory & Procurement Tracking</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-3 py-1.5 bg-cad-surface border border-cad-border text-[10px] font-bold text-cad-text-secondary hover:text-white rounded-sm hover:border-cad-accent transition-all uppercase">
            <Download size={14} /> Export CSV
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-1.5 bg-cad-accent text-black text-[10px] font-black rounded-sm hover:bg-cad-accent/80 transition-all uppercase"
          >
            <Plus size={16} /> Add Material
          </button>
        </div>
      </div>

      {/* Filters/Search */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="col-span-2 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cad-text-muted" />
          <input
            type="text"
            placeholder="SEARCH MATERIALS..."
            className="w-full bg-cad-surface border border-cad-border pl-10 pr-4 py-2 text-[11px] font-mono text-white placeholder:text-cad-text-muted focus:border-cad-accent outline-none uppercase rounded-sm"
          />
        </div>
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cad-text-muted" />
          <select className="w-full bg-cad-surface border border-cad-border pl-10 pr-4 py-2 text-[11px] font-mono text-white focus:border-cad-accent outline-none appearance-none rounded-sm uppercase">
            <option>All Categories</option>
            {categories.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden border border-cad-border rounded-sm bg-cad-surface/30">
        <div className="h-full overflow-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-cad-elevated z-10">
              <tr className="border-b border-cad-border text-[9px] font-black text-cad-text-muted uppercase tracking-widest">
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Item Description</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3 text-right">Unit Cost</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cad-border/50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-6 h-6 border-2 border-cad-accent border-t-transparent animate-spin rounded-full" />
                      <span className="text-[10px] font-mono text-cad-text-muted uppercase">Querying Materials...</span>
                    </div>
                  </td>
                </tr>
              ) : (!materials || materials.length === 0) ? (
                <tr>
                  <td colSpan={5} className="px-4 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Package size={32} className="text-cad-text-muted" />
                      <span className="text-[10px] font-mono text-cad-text-muted uppercase">No materials found in registry</span>
                    </div>
                  </td>
                </tr>
              ) : (
                materials.map((m) => (
                  <tr key={m.id} className="hover:bg-cad-accent/5 group/row transition-colors">
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-cad-bg border border-cad-border text-[8px] font-black text-cad-accent rounded-sm uppercase">
                        {m.category || "General"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-[11px] text-white uppercase">{m.name}</div>
                      {m.specs && <div className="text-[9px] text-cad-text-muted font-mono mt-0.5">{m.specs}</div>}
                    </td>
                    <td className="px-4 py-3 text-[10px] font-mono text-cad-text-secondary">{m.unit}</td>
                    <td className="px-4 py-3 text-right font-mono text-[11px] text-cad-accent">
                      ${(m.unit_cost ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                        <button className="p-1.5 hover:bg-cad-accent hover:text-black text-cad-text-muted rounded-sm transition-all"><Edit2 size={13} /></button>
                        <button
                          onClick={() => handleDelete(m.id, m.name)}
                          className="p-1.5 hover:bg-red-500 hover:text-white text-cad-text-muted rounded-sm transition-all"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal Overlay */}
      {showAdd && (
        <div className="fixed inset-0 z-cad-overlay flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-cad-surface border border-cad-border w-full max-w-md shadow-2xl rounded-sm">
            <div className="p-4 border-b border-cad-border bg-cad-bg/50 flex justify-between items-center">
              <h3 className="text-sm font-black text-white uppercase tracking-widest">New Resource Entry</h3>
              <button onClick={() => setShowAdd(false)} className="text-cad-text-muted hover:text-white">×</button>
            </div>
            <form onSubmit={handleAdd} className="p-6 flex flex-col gap-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-cad-text-muted uppercase tracking-widest">Description</label>
                <input
                  ref={materialNameInputRef}
                  required
                  value={newMaterial.name}
                  onChange={e => setNewMaterial({ ...newMaterial, name: e.target.value })}
                  placeholder="MATERIAL NAME / TYPE..."
                  className="w-full bg-cad-bg border border-cad-border px-3 py-2 text-xs text-white focus:border-cad-accent outline-none uppercase rounded-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-cad-text-muted uppercase tracking-widest">Unit</label>
                  <select
                    value={newMaterial.unit}
                    onChange={e => setNewMaterial({ ...newMaterial, unit: e.target.value })}
                    className="w-full bg-cad-bg border border-cad-border px-3 py-2 text-xs text-white focus:border-cad-accent outline-none rounded-sm uppercase"
                  >
                    <option value="m">Meter (m)</option>
                    <option value="m2">Sq Meter (m2)</option>
                    <option value="m3">Cu Meter (m3)</option>
                    <option value="kg">Kilogram (kg)</option>
                    <option value="ton">Ton</option>
                    <option value="set">Set</option>
                    <option value="pcs">Pieces</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-cad-text-muted uppercase tracking-widest">Unit Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newMaterial.unit_cost}
                    onChange={e => setNewMaterial({ ...newMaterial, unit_cost: parseFloat(e.target.value) })}
                    placeholder="0.00"
                    className="w-full bg-cad-bg border border-cad-border px-3 py-2 text-xs text-white focus:border-cad-accent outline-none rounded-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-cad-text-muted uppercase tracking-widest">Category</label>
                <select
                  value={newMaterial.category || "General"}
                  onChange={e => setNewMaterial({ ...newMaterial, category: e.target.value })}
                  className="w-full bg-cad-bg border border-cad-border px-3 py-2 text-xs text-white focus:border-cad-accent outline-none rounded-sm uppercase"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-cad-text-muted uppercase tracking-widest">Specifications</label>
                <textarea
                  value={newMaterial.specs || ""}
                  onChange={e => setNewMaterial({ ...newMaterial, specs: e.target.value })}
                  placeholder="OPTIONAL SPECS / STANDARDS..."
                  className="w-full bg-cad-bg border border-cad-border px-3 py-2 text-xs text-white focus:border-cad-accent outline-none uppercase rounded-sm h-20 resize-none"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2 border border-cad-border text-[10px] font-bold text-cad-text-muted hover:text-white uppercase transition-all rounded-sm">Cancel</button>
                <button type="submit" className="flex-1 py-2 bg-cad-accent text-black text-[10px] font-black uppercase transition-all rounded-sm">Commit Entry</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DeleteConfirmationModal
        isOpen={deleteModalConfig.isOpen}
        onClose={() => setDeleteModalConfig({ ...deleteModalConfig, isOpen: false })}
        onConfirm={confirmDelete}
        title="Xác nhận xóa vật tư"
        itemName={deleteModalConfig.itemName}
        message="Bạn có chắc chắn muốn xóa vật tư này khỏi kho? Hành động này có thể ảnh hưởng đến các dự án đang sử dụng vật tư này."
      />
    </div>
  );
}

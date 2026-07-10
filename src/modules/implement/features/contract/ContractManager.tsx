import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { Contract } from "@CONTRACT/types";
import { CADInput } from "@IMPLEMENT/features/project-management/ProjectDetailPanels";
import { DeleteConfirmationModal } from "@DESIGN/components/ui/DeleteConfirmationModal";

interface Props {
  contracts: Contract[];
  onAdd: (form: Partial<Contract>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  featureCounts?: Record<string, number>;
  onViewAnalysis?: (contract: Contract) => void;
}

export function ContractManager({ contracts, onAdd, onDelete, featureCounts = {}, onViewAnalysis }: Props) {
  const [addingContract, setAddingContract] = useState(false);
  const [newContractForm, setNewContractForm] = useState<Partial<Contract>>({});
  const [deleteModalConfig, setDeleteModalConfig] = useState<{ isOpen: boolean; id: string | null; itemName: string }>({
    isOpen: false,
    id: null,
    itemName: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContractForm.name?.trim()) return;
    await onAdd(newContractForm);
    setNewContractForm({});
    setAddingContract(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-cad-bg custom-scrollbar">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-display font-black text-white tracking-tight uppercase">CONTRACT MANAGEMENT</h2>
          <button
            onClick={() => setAddingContract(true)}
            className="px-4 py-1.5 bg-cad-accent text-black text-xs font-black rounded-sm hover:bg-cad-accent/80 transition-colors flex items-center gap-2"
          >
            <Plus size={14} /> NEW CONTRACT
          </button>
        </div>

        {addingContract && (
          <form onSubmit={handleSubmit} className="mb-8 bg-cad-surface border border-cad-accent p-6 rounded-sm shadow-2xl">
            <div className="grid grid-cols-2 gap-6 mb-6">
              <CADInput label="Contract Name" value={newContractForm.name || ""} onChange={(v: any) => setNewContractForm(p => ({ ...p, name: v }))} />
              <CADInput label="Contract Number" value={newContractForm.contract_number || ""} onChange={(v: any) => setNewContractForm(p => ({ ...p, contract_number: v }))} />
              <CADInput label="Vendor" value={newContractForm.vendor || ""} onChange={(v: any) => setNewContractForm(p => ({ ...p, vendor: v }))} />
              <CADInput label="Value" type="number" value={newContractForm.value || ""} onChange={(v: any) => setNewContractForm(p => ({ ...p, value: parseFloat(v) }))} />
              <CADInput label="Signed Date" type="date" value={newContractForm.signed_date || ""} onChange={(v: any) => setNewContractForm(p => ({ ...p, signed_date: v }))} />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setAddingContract(false)} className="px-4 py-1.5 text-xs font-bold text-cad-text-muted hover:text-white uppercase">Cancel</button>
              <button type="submit" className="px-4 py-1.5 bg-cad-accent text-black text-xs font-black rounded-sm uppercase">Create Record</button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {contracts?.map(c => (
            <div key={c.id} className="bg-cad-surface border border-cad-border p-5 hover:border-cad-accent transition-all group/card relative">
              <button
                onClick={() => {
                  setDeleteModalConfig({
                    isOpen: true,
                    id: c.id,
                    itemName: c.name || "Hợp đồng không tên"
                  });
                }}
                className="absolute top-4 right-4 text-cad-text-muted hover:text-red-500 opacity-0 group-hover/card:opacity-100 transition-opacity"
              >
                <X size={14} />
              </button>
              <div className="text-[9px] font-mono text-cad-accent mb-1 font-bold">{c.contract_number || 'PENDING'}</div>
              <h3 className="font-display font-black text-sm text-white mb-4 uppercase">{c.name}</h3>
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-cad-text-muted uppercase">Vendor: <span className="text-white">{c.vendor || '---'}</span></span>
                <span className="text-cad-accent font-bold">${c.value?.toLocaleString() || '0'}</span>
              </div>
              <div className="mt-3 pt-3 border-t border-cad-border/50 flex justify-between items-center text-[8px] font-bold uppercase tracking-widest text-cad-text-muted">
                <div className="flex flex-col gap-1">
                  <span>Linked Objects: <span className="text-cad-accent">{featureCounts[c.id] || 0}</span></span>
                  {c.has_analysis && (
                    <span className="flex items-center gap-1 text-green-500">
                      <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                      BOM ANALYZED
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {c.signed_date && <span>Signed: {new Date(c.signed_date).toLocaleDateString()}</span>}
                  {c.file_path && onViewAnalysis && (
                    <button
                      onClick={() => onViewAnalysis(c)}
                      className="mt-1 text-cad-accent hover:underline hover:text-white transition-colors"
                    >
                      VIEW ANALYSIS
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <DeleteConfirmationModal
        isOpen={deleteModalConfig.isOpen}
        onClose={() => setDeleteModalConfig({ ...deleteModalConfig, isOpen: false })}
        onConfirm={async () => {
          if (deleteModalConfig.id) {
            await onDelete(deleteModalConfig.id);
            setDeleteModalConfig({ isOpen: false, id: null, itemName: "" });
          }
        }}
        title="Xác nhận xóa hợp đồng"
        itemName={deleteModalConfig.itemName}
        message="Bạn có chắc chắn muốn xóa bản ghi hợp đồng này? Tất cả dữ liệu liên quan sẽ bị loại bỏ khỏi quản lý dự án."
      />
    </div>
  );
}

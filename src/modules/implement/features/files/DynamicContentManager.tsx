import React, { useState, useEffect } from "react";
import { Plus, X, Trash2, Edit2, Save } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ContentType, ContentField, ContentItem } from "@CONTRACT/types";
import { CADInput } from "@IMPLEMENT/features/project-management/ProjectDetailPanels/CADInput";
import { logger } from "@TOOL/utils/logger";

interface Props {
    projectId: string;
    contentType: ContentType;
}

export function DynamicContentManager({ projectId, contentType }: Props) {
    const [fields, setFields] = useState<ContentField[]>([]);
    const [items, setItems] = useState<ContentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formValues, setFormValues] = useState<Record<string, any>>({});
    const [itemName, setItemName] = useState("");

    const fetchData = async () => {
        setLoading(true);
        try {
            const [fetchedFields, fetchedItems] = await Promise.all([
                invoke<ContentField[]>("get_content_fields", { typeId: contentType.id }),
                invoke<ContentItem[]>("get_content_items", { projectId, typeId: contentType.id })
            ]);
            setFields(fetchedFields);
            setItems(fetchedItems);
        } catch (err) {
            logger.error("Failed to fetch dynamic content data:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [projectId, contentType.id]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await invoke("save_content_item", {
                contentTypeId: contentType.id,
                projectId,
                name: itemName,
                dataJson: JSON.stringify(formValues),
                id: editingId
            });
            setIsAdding(false);
            setEditingId(null);
            setFormValues({});
            setItemName("");
            fetchData();
        } catch (err) {
            logger.error("Failed to save content item:", err);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Xác nhận xóa bản ghi này?")) return;
        try {
            await invoke("delete_content_item", { itemId: id });
            fetchData();
        } catch (err) {
            logger.error("Failed to delete content item:", err);
        }
    };

    const startEdit = (item: ContentItem) => {
        setEditingId(item.id);
        setItemName(item.name);
        setFormValues(JSON.parse(item.data_json));
        setIsAdding(true);
    };

    if (loading) {
        return <div className="p-8 text-cad-text-muted animate-pulse">Loading {contentType.name}...</div>;
    }

    return (
        <div className="flex-1 overflow-y-auto p-6 bg-cad-bg custom-scrollbar">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h2 className="text-xl font-display font-black text-white tracking-tight uppercase">
                            {contentType.name}
                        </h2>
                        {contentType.description && (
                            <p className="text-xs text-cad-text-muted mt-1">{contentType.description}</p>
                        )}
                    </div>
                    <button
                        onClick={() => {
                            setIsAdding(true);
                            setEditingId(null);
                            setFormValues({});
                            setItemName("");
                        }}
                        className="px-4 py-1.5 bg-cad-accent text-black text-xs font-black rounded-sm hover:bg-cad-accent/80 transition-colors flex items-center gap-2"
                    >
                        <Plus size={14} /> NEW RECORD
                    </button>
                </div>

                {isAdding && (
                    <form onSubmit={handleSave} className="mb-8 bg-cad-surface border border-cad-accent p-6 rounded-sm shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-sm font-black text-cad-accent uppercase">
                                {editingId ? "Edit Record" : "Create New Record"}
                            </h3>
                            <button type="button" onClick={() => setIsAdding(false)} className="text-cad-text-muted hover:text-white">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <CADInput
                                label="Bản ghi / Đối tượng"
                                value={itemName}
                                onChange={setItemName}
                                required
                            />
                            {fields?.map(field => (
                                <CADInput
                                    key={field.id}
                                    label={field.label}
                                    type={field.field_type as any}
                                    value={formValues[field.name] || ""}
                                    onChange={(val: any) => setFormValues(prev => ({ ...prev, [field.name]: val }))}
                                    required={field.required}
                                />
                            ))}
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setIsAdding(false)}
                                className="px-4 py-1.5 text-xs font-bold text-cad-text-muted hover:text-white uppercase"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-1.5 bg-cad-accent text-black text-xs font-black rounded-sm uppercase flex items-center gap-2"
                            >
                                <Save size={14} /> {editingId ? "Update Record" : "Save Record"}
                            </button>
                        </div>
                    </form>
                )}

                <div className="bg-cad-surface border border-cad-border rounded-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-cad-header/50 border-b border-cad-border">
                                <th className="p-4 text-[10px] font-black text-cad-text-muted uppercase tracking-wider">Item Name</th>
                                {fields?.map(f => (
                                    <th key={f.id} className="p-4 text-[10px] font-black text-cad-text-muted uppercase tracking-wider">
                                        {f.label}
                                    </th>
                                ))}
                                <th className="p-4 text-[10px] font-black text-cad-text-muted uppercase tracking-wider w-24">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-cad-border/30">
                            {(!items || items.length === 0) ? (
                                <tr>
                                    <td colSpan={(fields?.length || 0) + 2} className="p-8 text-center text-cad-text-muted text-xs italic">
                                        No records found for this module.
                                    </td>
                                </tr>
                            ) : (
                                items.map(item => {
                                    const data = JSON.parse(item.data_json);
                                    return (
                                        <tr key={item.id} className="hover:bg-white/5 transition-colors group">
                                            <td className="p-4 text-xs font-bold text-white">{item.name}</td>
                                            {fields?.map(f => (
                                                <td key={f.id} className="p-4 text-xs text-cad-text-muted font-mono">
                                                    {data[f.name] || "---"}
                                                </td>
                                            ))}
                                            <td className="p-4">
                                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => startEdit(item)}
                                                        className="p-1 text-cad-text-muted hover:text-cad-accent transition-colors"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(item.id)}
                                                        className="p-1 text-cad-text-muted hover:text-red-500 transition-colors"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

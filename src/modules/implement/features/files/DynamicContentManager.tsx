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
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
        <div className="flex-1 overflow-y-auto bg-cad-bg p-6 cad-scrollbar">
            <div className="mx-auto max-w-6xl">
                <div className="mb-8 flex items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-display font-black uppercase tracking-tight text-cad-text-primary">
                            {contentType.name}
                        </h2>
                        {contentType.description && (
                            <p className="mt-1 text-xs text-cad-text-muted">{contentType.description}</p>
                        )}
                    </div>
                    <button
                        onClick={() => {
                            setIsAdding(true);
                            setEditingId(null);
                            setFormValues({});
                            setItemName("");
                        }}
                        className="cad-button cad-button-primary"
                    >
                        <Plus size={14} /> NEW RECORD
                    </button>
                </div>

                {isAdding && (
                    <form onSubmit={handleSave} className="cad-card mb-8 p-6">
                        <div className="mb-6 flex items-center justify-between">
                            <h3 className="text-sm font-black uppercase text-cad-accent">
                                {editingId ? "Edit Record" : "Create New Record"}
                            </h3>
                            <button type="button" onClick={() => setIsAdding(false)} className="cad-icon-button">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                            <CADInput
                                label="Bản ghi / Đối tượng"
                                value={itemName}
                                onChange={setItemName}
                                required
                            />
                            {fields.map(field => (
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
                                className="cad-button cad-button-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="cad-button cad-button-primary"
                            >
                                <Save size={14} /> {editingId ? "Update Record" : "Save Record"}
                            </button>
                        </div>
                    </form>
                )}

                <div className="cad-card overflow-hidden">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="border-b border-cad-border bg-cad-header/50">
                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-cad-text-muted">Item Name</th>
                                {fields.map(f => (
                                    <th key={f.id} className="p-4 text-[10px] font-black uppercase tracking-wider text-cad-text-muted">
                                        {f.label}
                                    </th>
                                ))}
                                <th className="w-24 p-4 text-[10px] font-black uppercase tracking-wider text-cad-text-muted">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-cad-border/30">
                            {items.length === 0 ? (
                                <tr>
                                    <td colSpan={fields.length + 2} className="p-8 text-center text-xs italic text-cad-text-muted">
                                        No records found for this module.
                                    </td>
                                </tr>
                            ) : (
                                items.map(item => {
                                    const data = JSON.parse(item.data_json);
                                    return (
                                        <tr key={item.id} className="group transition-colors hover:bg-white/5">
                                            <td className="p-4 text-xs font-bold text-cad-text-primary">{item.name}</td>
                                            {fields.map(f => (
                                                <td key={f.id} className="p-4 font-mono text-xs text-cad-text-muted">
                                                    {data[f.name] || "---"}
                                                </td>
                                            ))}
                                            <td className="p-4">
                                                <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                                                    <button
                                                        onClick={() => startEdit(item)}
                                                        className="cad-icon-button h-7 w-7"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(item.id)}
                                                        className="cad-icon-button h-7 w-7"
                                                    >
                                                        <Trash2 size={14} className="text-red-400" />
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

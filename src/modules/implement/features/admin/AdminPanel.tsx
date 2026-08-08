import React, { useState, useEffect } from 'react';
import { Shield, History, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { safeInvoke } from '@IMPLEMENT/lib/tauri';
import { cn } from '@SHARED/utils/cn';

interface AppConfig {
    admins: Record<string, string>;
    last_opened_project_path?: string;
    is_ai_enabled: boolean;
}

export const AdminPanel: React.FC = () => {
    const [config, setConfig] = useState<AppConfig | null>(null);
    const [newEmail, setNewEmail] = useState('');
    const [newRole, setNewRole] = useState<'Admin' | 'Editor' | 'Viewer'>('Editor');
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'ROLES' | 'LOGS'>('ROLES');
    const [logs, setLogs] = useState<any[]>([]);

    const fetchConfig = async () => {
        try {
            const cfg = await safeInvoke<AppConfig>('get_app_config');
            setConfig(cfg);
        } catch (err) {
            console.error("Failed to fetch config:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchLogs = async () => {
        try {
            const auditLogs = await safeInvoke<any[]>('get_audit_logs', { limit: 50 });
            setLogs(auditLogs);
        } catch (err) {
            console.error("Failed to fetch logs:", err);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchConfig();
        fetchLogs();
    }, []);

    const handleUpdateRole = async (email: string, role: string) => {
        if (!config) return;
        const newAdmins = { ...config.admins, [email]: role };
        try {
            await safeInvoke('update_app_config', {
                config: { ...config, admins: newAdmins }
            });
            await fetchConfig();
        } catch (err) {
            alert("Failed to update: " + (err instanceof Error ? err.message : String(err)));
        }
    };

    const handleRemoveAdmin = async (email: string) => {
        if (!config) return;
        const { [email]: _, ...newAdmins } = config.admins;
        try {
            await safeInvoke('update_app_config', {
                config: { ...config, admins: newAdmins }
            });
            await fetchConfig();
        } catch (err) {
            alert("Failed to remove: " + (err instanceof Error ? err.message : String(err)));
        }
    };

    if (loading) return <div className="p-8 text-cad-text-muted font-mono animate-pulse">Initializing Administrative Terminal...</div>;

    return (
        <div className="flex h-full flex-col overflow-hidden border-l border-cad-border bg-cad-surface animate-in slide-in-from-right duration-200">
            <div className="border-b border-cad-border bg-cad-elevated/30 p-6">
                <div className="mb-6 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-md border border-cad-border bg-cad-bg p-2 text-cad-accent">
                            <Shield size={20} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-widest text-cad-text-primary">System Administration</h2>
                            <p className="text-[10px] font-bold uppercase tracking-tight text-cad-text-muted">Access Control & Audit Logs</p>
                        </div>
                    </div>

                    <div className="flex rounded-md border border-cad-border bg-cad-bg p-1">
                        <button
                            onClick={() => setActiveTab('ROLES')}
                            className={cn(
                                "rounded-md px-4 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all",
                                activeTab === 'ROLES' ? "bg-cad-accent text-black shadow-lg" : "text-cad-text-muted hover:text-cad-text-primary"
                            )}
                        >
                            Identities
                        </button>
                        <button
                            onClick={() => setActiveTab('LOGS')}
                            className={cn(
                                "rounded-md px-4 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all",
                                activeTab === 'LOGS' ? "bg-cad-accent text-black shadow-lg" : "text-cad-text-muted hover:text-cad-text-primary"
                            )}
                        >
                            Chronicle
                        </button>
                    </div>
                </div>

                {activeTab === 'ROLES' && (
                    <div className="flex gap-2">
                        <input
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="operator@system.com"
                            className="cad-input flex-1"
                        />
                        <select
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value as any)}
                            className="cad-select w-32 text-[10px] font-bold uppercase"
                        >
                            <option value="Admin">Admin</option>
                            <option value="Editor">Editor</option>
                            <option value="Viewer">Viewer</option>
                        </select>
                        <button
                            onClick={() => {
                                if (newEmail) handleUpdateRole(newEmail, newRole);
                                setNewEmail('');
                            }}
                            className="cad-button cad-button-primary px-3"
                        >
                            <Plus size={18} />
                        </button>
                    </div>
                )}
            </div>

            <div className="cad-scrollbar flex-1 overflow-y-auto p-6">
                {activeTab === 'ROLES' ? (
                    <div className="space-y-3">
                        {Object.entries(config?.admins || {}).map(([email, role]) => (
                            <div key={email} className="group flex items-center justify-between rounded-md border border-cad-border bg-cad-elevated/50 p-4 transition-all hover:border-cad-accent/30">
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "flex h-10 w-10 items-center justify-center rounded-full border border-cad-border text-xs font-black",
                                        role === 'Admin' ? "bg-cad-accent/20 text-cad-accent" : "bg-blue-500/10 text-blue-400"
                                    )}>
                                        {email.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="text-[13px] font-bold text-cad-text-primary">{email}</div>
                                        <div className="mt-0.5 flex items-center gap-2">
                                            <span className={cn(
                                                "rounded-full border px-2 py-0.5 text-[9px] font-black uppercase",
                                                role === 'Admin' ? "border-cad-accent bg-cad-accent text-black" : "border-blue-500/20 bg-blue-500/10 text-blue-400"
                                            )}>
                                                {role}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleRemoveAdmin(email)}
                                    className="cad-icon-button opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 size={16} className="text-red-400" />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {logs.map((log) => (
                            <div key={log.id} className="flex gap-4 rounded-md border border-cad-border bg-cad-elevated/20 p-4 transition-colors hover:bg-cad-elevated/40">
                                <div className="shrink-0 rounded-md bg-cad-text-primary/5 p-2">
                                    <History size={14} className="text-cad-text-muted" />
                                </div>
                                <div
                                    className="flex-1 cursor-pointer overflow-hidden"
                                    onClick={() => {
                                        const details = document.getElementById(`log-details-${log.id}`);
                                        if (details) details.classList.toggle('hidden');
                                    }}
                                >
                                    <div className="mb-1 flex items-baseline justify-between gap-4">
                                        <div className="flex items-center gap-2">
                                            <span className="truncate text-[10px] font-black uppercase tracking-wider text-cad-accent">{log.action_type || log.event_type}</span>
                                            <span className="truncate text-[9px] font-bold text-cad-text-muted">@{log.table_name}</span>
                                        </div>
                                        <span className="shrink-0 font-mono text-[9px] text-cad-text-muted">{new Date(log.timestamp || log.created_at).toLocaleString()}</span>
                                    </div>
                                    <div className="mb-1 truncate text-[11px] font-medium text-cad-text-primary">Record ID: {log.record_id || log.entity_id}</div>
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <div className="h-1.5 w-1.5 rounded-full bg-cad-accent" />
                                            <span className="truncate text-[10px] font-bold text-cad-text-muted">User: {log.user_email || 'System'}</span>
                                        </div>
                                        {(log.old_values_json || log.new_values_json) && (
                                            <span className="text-[8px] font-black uppercase text-cad-accent/50 animate-pulse">Click to see Delta</span>
                                        )}
                                    </div>

                                    <div id={`log-details-${log.id}`} className="hidden mt-4 space-y-3 rounded-md border border-cad-border bg-black/40 p-3 animate-in fade-in zoom-in duration-200">
                                        {log.old_values_json && (
                                            <div>
                                                <div className="mb-1 text-[9px] font-black uppercase leading-none text-red-400/50">[-] Old Values</div>
                                                <pre className="whitespace-pre-wrap break-all rounded-md border border-red-500/10 bg-red-500/5 p-2 font-mono text-[10px] text-red-200/40">
                                                    {JSON.stringify(JSON.parse(log.old_values_json), null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                        {log.new_values_json && (
                                            <div>
                                                <div className="mb-1 text-[9px] font-black uppercase leading-none text-green-400/50">[+] New Values</div>
                                                <pre className="whitespace-pre-wrap break-all rounded-md border border-green-500/10 bg-green-500/5 p-2 font-mono text-[10px] text-green-200/40">
                                                    {JSON.stringify(JSON.parse(log.new_values_json), null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="border-t border-cad-border bg-black/20 p-6">
                <div className="flex items-center gap-2 rounded-md border border-yellow-500/10 bg-yellow-500/5 p-3">
                    <AlertTriangle size={14} className="shrink-0 text-yellow-500" />
                    <p className="text-[9px] font-bold leading-relaxed text-yellow-200/60 uppercase">
                        Caution: Permissions grant recursive access to linked assets.
                    </p>
                </div>
            </div>
        </div>
    );
};

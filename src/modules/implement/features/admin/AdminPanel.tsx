import React, { useState, useEffect } from 'react';
import { Shield, History, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { safeInvoke } from '@IMPLEMENT/lib/tauri';
import { cn } from '@TOOL/utils/cn';


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
            alert("Failed to update: " + err);
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
            alert("Failed to remove: " + err);
        }
    };

    if (loading) return <div className="p-8 text-cad-text-muted font-mono animate-pulse">Initializing Administrative Terminal...</div>;

    return (
        <div className="flex flex-col h-full bg-cad-surface border-l border-cad-border animate-in slide-in-from-right duration-500">
            <div className="p-6 border-b border-cad-border bg-cad-elevated/30">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-cad-accent/10 rounded-lg text-cad-accent">
                            <Shield size={20} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-widest text-white">System Administration</h2>
                            <p className="text-[10px] text-cad-text-muted uppercase font-bold tracking-tight">Access Control & Audit Logs</p>
                        </div>
                    </div>

                    <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                        <button
                            onClick={() => setActiveTab('ROLES')}
                            className={cn(
                                "px-4 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-md transition-all",
                                activeTab === 'ROLES' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white"
                            )}
                        >
                            Identities
                        </button>
                        <button
                            onClick={() => setActiveTab('LOGS')}
                            className={cn(
                                "px-4 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-md transition-all",
                                activeTab === 'LOGS' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white"
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
                            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-xs text-white focus:outline-none focus:border-cad-accent/50"
                        />
                        <select
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value as any)}
                            className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[10px] font-bold text-white uppercase focus:outline-none"
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
                            className="bg-cad-accent hover:opacity-90 text-black p-2 rounded-lg transition-all"
                        >
                            <Plus size={18} />
                        </button>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-6">
                {activeTab === 'ROLES' ? (
                    <div className="space-y-3">
                        {Object.entries(config?.admins || {}).map(([email, role]) => (
                            <div key={email} className="group flex items-center justify-between p-4 bg-cad-elevated/50 border border-white/5 rounded-xl hover:border-cad-accent/30 transition-all">
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "w-10 h-10 rounded-full flex items-center justify-center font-black text-xs border border-white/10",
                                        role === 'Admin' ? "bg-cad-accent/20 text-cad-accent" : "bg-blue-500/10 text-blue-400"
                                    )}>
                                        {email.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="text-[13px] font-bold text-white">{email}</div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className={cn(
                                                "text-[9px] font-black uppercase px-2 py-0.5 rounded-full border",
                                                role === 'Admin' ? "bg-cad-accent text-black border-cad-accent" : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                            )}>
                                                {role}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleRemoveAdmin(email)}
                                    className="opacity-0 group-hover:opacity-100 p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {logs.map((log) => (
                            <div key={log.id} className="flex gap-4 p-4 bg-cad-elevated/20 border border-white/[0.03] rounded-xl hover:bg-cad-elevated/40 transition-colors">
                                <div className="bg-white/5 p-2 rounded-lg shrink-0">
                                    <History size={14} className="text-cad-text-muted" />
                                </div>
                                <div className="flex-1 overflow-hidden cursor-pointer" onClick={() => {
                                    const details = document.getElementById(`log-details-${log.id}`);
                                    if (details) details.classList.toggle('hidden');
                                }}>
                                    <div className="flex items-baseline justify-between gap-4 mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-cad-accent truncate">{log.action_type || log.event_type}</span>
                                            <span className="text-[9px] font-bold text-white/30 truncate">@{log.table_name}</span>
                                        </div>
                                        <span className="text-[9px] font-mono text-cad-text-muted shrink-0">{new Date(log.timestamp || log.created_at).toLocaleString()}</span>
                                    </div>
                                    <div className="text-[11px] text-white/70 font-medium mb-1 truncate">Record ID: {log.record_id || log.entity_id}</div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-cad-accent" />
                                            <span className="text-[10px] font-bold text-cad-text-muted truncate">User: {log.user_email || 'System'}</span>
                                        </div>
                                        {(log.old_values_json || log.new_values_json) && (
                                            <span className="text-[8px] font-black uppercase text-cad-accent/50 animate-pulse">Click to see Delta</span>
                                        )}
                                    </div>

                                    {/* Delta Details */}
                                    <div id={`log-details-${log.id}`} className="hidden mt-4 p-3 bg-black/40 rounded-lg border border-white/10 space-y-3 animate-in fade-in zoom-in duration-200">
                                        {log.old_values_json && (
                                            <div>
                                                <div className="text-[9px] font-black uppercase text-red-400/50 mb-1 leading-none">[-] Old Values</div>
                                                <pre className="text-[10px] font-mono text-red-200/40 bg-red-500/5 p-2 rounded whitespace-pre-wrap break-all border border-red-500/10">
                                                    {JSON.stringify(JSON.parse(log.old_values_json), null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                        {log.new_values_json && (
                                            <div>
                                                <div className="text-[9px] font-black uppercase text-green-400/50 mb-1 leading-none">[+] New Values</div>
                                                <pre className="text-[10px] font-mono text-green-200/40 bg-green-500/5 p-2 rounded whitespace-pre-wrap break-all border border-green-500/10">
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

            <div className="p-6 border-t border-cad-border bg-black/20">
                <div className="flex items-center gap-2 p-3 bg-yellow-500/5 border border-yellow-500/10 rounded-lg">
                    <AlertTriangle size={14} className="text-yellow-500 shrink-0" />
                    <p className="text-[9px] font-bold text-yellow-200/60 uppercase leading-relaxed">
                        Caution: Permissions grant recursive access to linked assets.
                    </p>
                </div>
            </div>
        </div>
    );
};

import { useEffect, useMemo, useRef, useState } from "react";
import {
    AlertTriangle,
    Check,
    CheckSquare,
    Cpu,
    Download,
    Globe,
    KeyRound,
    RefreshCw,
    Save,
    Send,
    ShieldAlert,
    Sparkles,
    Square,
    Trash2,
    X,
} from "lucide-react";
import { IS_REAL_TAURI, safeInvoke, safeListen } from "@IMPLEMENT/lib/tauri";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import { useSettingsStore } from "@CORE/stores/useSettingsStore";
import { cn } from "@SHARED/utils/cn";

type AiPanelTab = "chat" | "config";

interface AiConfig {
    enable_ai: boolean;
    low_power_mode: boolean;
    provider_enabled: boolean;
    provider_base_url: string;
    provider_model: string;
    max_tokens: number;
    timeout_ms: number;
    cloud_confirm_each_request: boolean;
    has_api_key: boolean;
}

interface AiStatusModel {
    id: string;
    role: string;
    version: string;
    fileName?: string;
    file_name?: string;
    installed: boolean;
    sizeBytes?: number;
    size_bytes?: number;
    checksumOk?: boolean | null;
    checksum_ok?: boolean | null;
}

interface AiStatus {
    state: string;
    enabled: boolean;
    localReady?: boolean;
    local_ready?: boolean;
    cloudReady?: boolean;
    cloud_ready?: boolean;
    downloading: boolean;
    loadedSessions?: string[];
    loaded_sessions?: string[];
    models?: AiStatusModel[];
    error?: string | null;
    providerModel?: string;
    provider_model?: string;
    hasApiKey?: boolean;
    has_api_key?: boolean;
}

interface AiCitation {
    sourceTable?: string;
    source_table?: string;
    sourceId?: string;
    source_id?: string;
    title: string;
    snippet: string;
    score: number;
}

interface AiActionProposal {
    id: string;
    actionType?: string;
    action_type?: string;
    targetTable?: string;
    target_table?: string;
    targetId?: string | null;
    target_id?: string | null;
    diff: unknown;
}

interface Message {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    provider?: string;
    model?: string;
    citations?: AiCitation[];
    actionProposals?: AiActionProposal[];
}

interface DownloadProgress {
    requestId?: string;
    model?: string;
    bytesDownloaded?: number;
    expectedBytes?: number;
    status?: string;
    checksum?: boolean;
}

const DEFAULT_AI_CONFIG: AiConfig = {
    enable_ai: false,
    low_power_mode: false,
    provider_enabled: false,
    provider_base_url: "https://api.openai.com/v1",
    provider_model: "gpt-4o-mini",
    max_tokens: 1200,
    timeout_ms: 45000,
    cloud_confirm_each_request: true,
    has_api_key: false,
};

const strictInvoke = async <T,>(command: string, args?: Record<string, unknown>): Promise<T> => {
    if (!IS_REAL_TAURI) {
        throw new Error(`Tauri runtime is not available for ${command}.`);
    }
    return safeInvoke<T>(command, args);
};

const parseJsonArray = <T,>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[];
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
};

const displayBytes = (value?: number) => {
    if (!value || value <= 0) return "-";
    if (value > 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
    if (value > 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${value} B`;
};

export function AiAssistantPanel() {
    const projectId = useDesignSync((s) => s.projectId) || "";
    const projectPath = useDesignSync((s) => s.projectPath);
    const featureCount = useDesignSync((s) => Object.keys(s.state?.features || {}).length);
    const { enableAi, setEnableAi } = useSettingsStore();

    const [activeTab, setActiveTab] = useState<AiPanelTab>("chat");
    const [status, setStatus] = useState<AiStatus | null>(null);
    const [config, setConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG);
    const [apiKey, setApiKey] = useState("");
    const [messages, setMessages] = useState<Message[]>([]);
    const [conversationId, setConversationId] = useState("");
    const [inputValue, setInputValue] = useState("");
    const [allowCloud, setAllowCloud] = useState(false);
    const [showCloudConsent, setShowCloudConsent] = useState(false);
    const [pendingCloudText, setPendingCloudText] = useState("");
    const [loading, setLoading] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
    const [apiError, setApiError] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const loadedSessions = status?.loadedSessions || status?.loaded_sessions || [];
    const models = status?.models || [];
    const localReady = !!(status?.localReady || status?.local_ready);
    const cloudReady = !!(status?.cloudReady || status?.cloud_ready);
    const hasApiKey = !!(status?.hasApiKey || status?.has_api_key || config.has_api_key);

    const chatDisabledReason = useMemo(() => {
        if (!projectId) return "Open a project before chatting with AI.";
        if (loading) return "AI is responding.";
        if (status?.downloading || status?.state === "DOWNLOADING") return "Model download is running.";
        if (!enableAi || !status?.enabled) return "Enable AI in Config first.";
        if (allowCloud && !cloudReady) return "Cloud provider or API key is not configured.";
        if (!allowCloud && !localReady && status?.state === "MODEL_REQUIRED") return "Download local models or enable cloud.";
        return null;
    }, [allowCloud, cloudReady, enableAi, loading, localReady, projectId, status]);

    const refreshStatus = async () => {
        const nextStatus = await safeInvoke<AiStatus>("get_ai_status");
        setStatus(nextStatus);
    };

    const refreshConfig = async () => {
        const nextConfig = await safeInvoke<Partial<AiConfig>>("get_ai_config");
        setConfig({ ...DEFAULT_AI_CONFIG, ...(nextConfig || {}) });
    };

    const refreshAi = async () => {
        await Promise.all([refreshStatus(), refreshConfig()]);
    };

    useEffect(() => {
        const refreshTimer = window.setTimeout(() => void refreshAi(), 0);
        const interval = window.setInterval(refreshAi, 8000);
        return () => {
            window.clearTimeout(refreshTimer);
            window.clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        let mounted = true;
        void safeListen<DownloadProgress>("ai-model-progress", (event: { payload: DownloadProgress }) => {
            if (!mounted) return;
            setDownloadProgress(event.payload);
        });
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (!projectId) {
            const resetTimer = window.setTimeout(() => {
                setConversationId("");
                setMessages([]);
            }, 0);
            return () => window.clearTimeout(resetTimer);
        }

        const initChat = async () => {
            setApiError(null);
            const list = await safeInvoke<any[]>("list_ai_conversations", { projectId });
            if (list && list.length > 0) {
                setConversationId(list[0].id);
                const history = await safeInvoke<any[]>("list_ai_messages", { conversationId: list[0].id });
                setMessages((history || []).map((m) => ({
                    id: m.id,
                    role: m.role,
                    content: m.content,
                    provider: m.provider,
                    model: m.model,
                    citations: parseJsonArray<AiCitation>(m.citations_json),
                    actionProposals: [],
                })));
                return;
            }

            const newConv = await safeInvoke<any>("create_ai_conversation", {
                projectId,
                title: "AI Assistant Thread",
            });
            if (newConv?.id) {
                setConversationId(newConv.id);
                setMessages([]);
            }
        };

        void initChat();
    }, [projectId]);

    useEffect(() => {
        if (typeof messagesEndRef.current?.scrollIntoView === "function") {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    const getRuntimeLabel = () => {
        if (!status) return "LOADING";
        switch (status.state) {
            case "AI_OFF": return "AI OFF";
            case "MODEL_REQUIRED": return "MODEL REQUIRED";
            case "DOWNLOADING": return "DOWNLOADING";
            case "LOCAL_READY": return "LOCAL READY";
            case "CLOUD_READY": return "CLOUD READY";
            case "ERROR": return "RUNTIME ERROR";
            default: return status.state;
        }
    };

    const updateLocalConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => {
        setConfig((prev) => ({ ...prev, [key]: value }));
    };

    const handleSaveConfig = async () => {
        setSavingConfig(true);
        setApiError(null);
        try {
            await strictInvoke("update_ai_config", {
                config: {
                    enableAi: config.enable_ai,
                    lowPowerMode: config.low_power_mode,
                    providerEnabled: config.provider_enabled,
                    providerBaseUrl: config.provider_base_url,
                    providerModel: config.provider_model,
                    maxTokens: Number(config.max_tokens),
                    timeoutMs: Number(config.timeout_ms),
                    cloudConfirmEachRequest: config.cloud_confirm_each_request,
                },
            });
            await setEnableAi(config.enable_ai);
            await refreshAi();
        } catch (e: any) {
            setApiError(e?.message || e?.toString() || "Failed to save AI config.");
        } finally {
            setSavingConfig(false);
        }
    };

    const handleSaveApiKey = async () => {
        if (!apiKey.trim()) return;
        setSavingConfig(true);
        setApiError(null);
        try {
            await strictInvoke("set_ai_api_key", { apiKey });
            setApiKey("");
            await refreshAi();
        } catch (e: any) {
            setApiError(e?.message || e?.toString() || "Failed to save API key.");
        } finally {
            setSavingConfig(false);
        }
    };

    const handleDeleteApiKey = async () => {
        setSavingConfig(true);
        setApiError(null);
        try {
            await strictInvoke("delete_ai_api_key");
            await refreshAi();
        } catch (e: any) {
            setApiError(e?.message || e?.toString() || "Failed to delete API key.");
        } finally {
            setSavingConfig(false);
        }
    };

    const handleDownloadModels = async () => {
        setDownloadProgress({ status: "starting" });
        setApiError(null);
        try {
            await strictInvoke("install_ai_models");
            await refreshStatus();
        } catch (e: any) {
            setApiError(e?.message || e?.toString() || "Model installation failed.");
        } finally {
            setDownloadProgress(null);
        }
    };

    const handleCancelDownload = async () => {
        try {
            await strictInvoke("cancel_ai_model_install");
            await refreshStatus();
        } catch (e: any) {
            setApiError(e?.message || e?.toString() || "Failed to cancel model install.");
        }
    };

    const handleRemoveModels = async () => {
        try {
            await strictInvoke("remove_ai_models");
            await refreshStatus();
        } catch (e: any) {
            setApiError(e?.message || e?.toString() || "Failed to remove AI models.");
        }
    };

    const handleReleaseMemory = async () => {
        try {
            await strictInvoke("release_ai_memory");
            await refreshStatus();
        } catch (e: any) {
            setApiError(e?.message || e?.toString() || "Failed to release AI memory.");
        }
    };

    const sendMessage = async (text: string, confirmedScope: unknown = null) => {
        if (!text.trim() || !conversationId || chatDisabledReason) return;

        setInputValue("");
        setLoading(true);
        setApiError(null);
        setMessages((prev) => [...prev, {
            id: `local-${Date.now()}`,
            role: "user",
            content: text,
        }]);

        try {
            const chatRes = await strictInvoke<any>("send_ai_message", {
                request: {
                    projectId,
                    conversationId,
                    message: text,
                    allowCloud,
                    confirmedScope,
                },
            });

            const assistantMsg: Message = {
                id: chatRes.requestId || `assistant-${Date.now()}`,
                role: "assistant",
                content: chatRes.content,
                provider: chatRes.provider,
                model: chatRes.model,
                citations: chatRes.citations || [],
                actionProposals: chatRes.actionProposals || [],
            };
            setMessages((prev) => [...prev, assistantMsg]);
        } catch (e: any) {
            setApiError(e?.message || e?.toString() || "Failed to get AI response.");
        } finally {
            setLoading(false);
            await refreshStatus();
        }
    };

    const handleSendMessage = async () => {
        const text = inputValue.trim();
        if (!text || chatDisabledReason) return;
        if (allowCloud && config.cloud_confirm_each_request) {
            setPendingCloudText(text);
            setShowCloudConsent(true);
            return;
        }
        await sendMessage(text);
    };

    const handleConfirmCloudSend = async () => {
        const text = pendingCloudText;
        setShowCloudConsent(false);
        setPendingCloudText("");
        await sendMessage(text, {
            message: text,
            projectContext: {
                projectId,
                projectPath,
                featureCount,
            },
        });
    };

    const handleConfirmAction = async (proposalId: string) => {
        try {
            await strictInvoke("confirm_ai_action", { actionId: proposalId });
            setMessages((prev) => prev.map((m) => ({
                ...m,
                actionProposals: m.actionProposals?.filter((p) => p.id !== proposalId),
            })));
            setApiError(null);
        } catch (e: any) {
            setApiError(e?.message || e?.toString() || "Failed to confirm AI action.");
        }
    };

    const handleRejectAction = async (proposalId: string) => {
        try {
            await strictInvoke("reject_ai_action", {
                actionId: proposalId,
                note: "User rejected from AI Assistant",
            });
            setMessages((prev) => prev.map((m) => ({
                ...m,
                actionProposals: m.actionProposals?.filter((p) => p.id !== proposalId),
            })));
        } catch (e: any) {
            setApiError(e?.message || e?.toString() || "Failed to reject AI action.");
        }
    };

    const progressPercent = downloadProgress?.expectedBytes && downloadProgress.bytesDownloaded
        ? Math.min(100, Math.round((downloadProgress.bytesDownloaded / downloadProgress.expectedBytes) * 100))
        : null;

    return (
        <div className="flex h-full w-full min-h-0 flex-col bg-cad-surface text-xs text-cad-text-primary select-none overflow-hidden">
            <div className="border-b border-cad-border bg-cad-elevated/40 p-2.5">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <Sparkles className={cn("h-4 w-4", enableAi ? "text-cad-accent animate-pulse" : "text-cad-text-muted")} />
                        <span className="truncate font-display font-bold uppercase tracking-wider">{getRuntimeLabel()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        {loadedSessions.length > 0 && (
                            <button onClick={handleReleaseMemory} title="Unload models and release RAM" className="rounded p-1 text-cad-text-secondary transition-all hover:bg-cad-text-primary/10 hover:text-cad-text-primary">
                                <Cpu className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 rounded border border-cad-border bg-cad-bg p-1">
                    {(["chat", "config"] as AiPanelTab[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={cn(
                                "rounded px-2 py-1 text-[9px] font-black uppercase tracking-widest transition-all",
                                activeTab === tab ? "bg-cad-accent text-black" : "text-cad-text-secondary hover:text-cad-text-primary"
                            )}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {apiError && (
                <div className="flex items-start gap-2 border-b border-cad-danger/20 bg-cad-danger/10 p-2 text-cad-danger">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0 break-words"><span className="font-semibold">Error: </span>{apiError}</div>
                </div>
            )}

            {activeTab === "config" ? (
                <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-3">
                    <section className="space-y-2 rounded border border-cad-border bg-cad-bg p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-cad-text-primary">AI Runtime</div>
                                <div className="mt-1 text-[9px] uppercase tracking-wider text-cad-text-muted">{status?.state || "UNKNOWN"}</div>
                            </div>
                            <button onClick={() => updateLocalConfig("enable_ai", !config.enable_ai)} className="text-cad-accent">
                                {config.enable_ai ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                            </button>
                        </div>
                        <label className="flex items-center gap-2 text-[10px] font-bold uppercase text-cad-text-secondary">
                            <input type="checkbox" checked={config.low_power_mode} onChange={(e) => updateLocalConfig("low_power_mode", e.target.checked)} className="accent-cad-accent" />
                            Low power mode
                        </label>
                    </section>

                    <section className="space-y-3 rounded border border-cad-border bg-cad-bg p-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-cad-text-primary">
                                <Download className="h-3.5 w-3.5 text-cad-accent" /> Local Models
                            </div>
                            <span className={cn("text-[9px] font-bold uppercase", localReady ? "text-cad-accent" : "text-cad-warn")}>{localReady ? "Ready" : "Required"}</span>
                        </div>
                        <div className="space-y-1">
                            {models.map((model) => (
                                <div key={model.id} className="flex items-center justify-between gap-2 rounded bg-cad-surface px-2 py-1.5 text-[9px]">
                                    <span className="min-w-0 truncate font-bold text-cad-text-secondary">{model.role}: {model.version}</span>
                                    <span className={model.installed ? "text-cad-accent" : "text-cad-text-muted"}>{model.installed ? displayBytes(model.sizeBytes || model.size_bytes) : "missing"}</span>
                                </div>
                            ))}
                        </div>
                        {downloadProgress && (
                            <div className="rounded border border-cad-accent/20 bg-cad-accent/5 p-2">
                                <div className="flex justify-between text-[9px] font-bold uppercase text-cad-text-secondary">
                                    <span>{downloadProgress.model || "models"}: {downloadProgress.status}</span>
                                    <span>{progressPercent == null ? "" : `${progressPercent}%`}</span>
                                </div>
                                <div className="mt-1 h-1.5 overflow-hidden rounded bg-cad-bg">
                                    <div className="h-full bg-cad-accent transition-all" style={{ width: `${progressPercent || 15}%` }} />
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-3 gap-2">
                            <button onClick={handleDownloadModels} disabled={status?.downloading} className="flex items-center justify-center gap-1 rounded bg-cad-accent px-2 py-1.5 text-[9px] font-black uppercase text-black disabled:opacity-50">
                                <RefreshCw className="h-3 w-3" /> Download
                            </button>
                            <button onClick={handleCancelDownload} disabled={!status?.downloading} className="flex items-center justify-center gap-1 rounded border border-cad-border px-2 py-1.5 text-[9px] font-black uppercase text-cad-text-secondary disabled:opacity-40">
                                <X className="h-3 w-3" /> Cancel
                            </button>
                            <button onClick={handleRemoveModels} className="flex items-center justify-center gap-1 rounded border border-cad-danger/40 px-2 py-1.5 text-[9px] font-black uppercase text-cad-danger">
                                <Trash2 className="h-3 w-3" /> Remove
                            </button>
                        </div>
                    </section>

                    <section className="space-y-3 rounded border border-cad-border bg-cad-bg p-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-cad-text-primary">
                                <Globe className="h-3.5 w-3.5 text-cad-accent" /> Cloud Provider
                            </div>
                            <span className={cn("text-[9px] font-bold uppercase", cloudReady ? "text-cad-accent" : "text-cad-text-muted")}>{cloudReady ? "Ready" : "Optional"}</span>
                        </div>
                        <label className="flex items-center gap-2 text-[10px] font-bold uppercase text-cad-text-secondary">
                            <input type="checkbox" checked={config.provider_enabled} onChange={(e) => updateLocalConfig("provider_enabled", e.target.checked)} className="accent-cad-accent" />
                            Enable cloud
                        </label>
                        <input value={config.provider_base_url} onChange={(e) => updateLocalConfig("provider_base_url", e.target.value)} className="w-full rounded border border-cad-border bg-cad-bg px-2 py-1.5 text-[10px] text-cad-text-primary outline-none focus:border-cad-accent" />
                        <input value={config.provider_model} onChange={(e) => updateLocalConfig("provider_model", e.target.value)} className="w-full rounded border border-cad-border bg-cad-bg px-2 py-1.5 text-[10px] text-cad-text-primary outline-none focus:border-cad-accent" />
                        <div className="grid grid-cols-2 gap-2">
                            <input type="number" value={config.max_tokens} onChange={(e) => updateLocalConfig("max_tokens", Number(e.target.value))} className="w-full rounded border border-cad-border bg-cad-bg px-2 py-1.5 text-[10px] text-cad-text-primary outline-none" />
                            <input type="number" value={config.timeout_ms} onChange={(e) => updateLocalConfig("timeout_ms", Number(e.target.value))} className="w-full rounded border border-cad-border bg-cad-bg px-2 py-1.5 text-[10px] text-cad-text-primary outline-none" />
                        </div>
                        <label className="flex items-center gap-2 text-[10px] font-bold uppercase text-cad-text-secondary">
                            <input type="checkbox" checked={config.cloud_confirm_each_request} onChange={(e) => updateLocalConfig("cloud_confirm_each_request", e.target.checked)} className="accent-cad-accent" />
                            Confirm every cloud request
                        </label>
                        <div className="flex gap-2">
                            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={hasApiKey ? "API key stored" : "OpenAI-compatible API key"} className="min-w-0 flex-1 rounded border border-cad-border bg-cad-bg px-2 py-1.5 text-[10px] text-cad-text-primary outline-none" />
                            <button aria-label="Save AI API key" onClick={handleSaveApiKey} disabled={!apiKey.trim() || savingConfig} className="rounded bg-cad-accent px-2 text-black disabled:opacity-40"><KeyRound className="h-3.5 w-3.5" /></button>
                            <button aria-label="Delete AI API key" onClick={handleDeleteApiKey} disabled={!hasApiKey || savingConfig} className="rounded border border-cad-danger/40 px-2 text-cad-danger disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                    </section>
                </div>
            ) : (
                <>
                    {status?.state === "MODEL_REQUIRED" && (
                        <div className="flex flex-col items-center justify-center gap-2.5 border-b border-cad-border bg-cad-elevated p-4 text-center">
                            <AlertTriangle className="h-8 w-8 text-cad-warn" />
                            <div className="font-bold text-cad-text-primary">Local Model Required</div>
                            <button onClick={() => setActiveTab("config")} className="rounded bg-cad-accent px-3 py-1.5 text-[10px] font-black uppercase text-black">Open Config</button>
                        </div>
                    )}

                    <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
                        {messages.length === 0 && (
                            <div className="flex h-full flex-col items-center justify-center gap-2.5 p-6 text-center text-cad-text-muted">
                                <Sparkles className="h-10 w-10 opacity-35" />
                                <div className="font-display text-[10px] font-black uppercase tracking-widest">AI CAD Assistant</div>
                                <p className="max-w-[240px] text-[10px] leading-relaxed">Ask about project metadata, files, features, task estimates, or request proposed updates.</p>
                            </div>
                        )}

                        {messages.map((msg, idx) => (
                            <div key={msg.id || idx} className={cn("flex max-w-[88%] flex-col rounded-lg border p-2.5 transition-all", msg.role === "user" ? "ml-auto border-cad-border/70 bg-cad-elevated text-cad-text-primary" : "mr-auto border-cad-border/30 bg-cad-bg text-cad-text-secondary")}>
                                <div className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</div>
                                {msg.citations && msg.citations.length > 0 && (
                                    <div className="mt-2.5 space-y-1 border-t border-cad-border/30 pt-2">
                                        <div className="text-[9px] font-black uppercase tracking-wider text-cad-text-muted">References</div>
                                        {msg.citations.map((cit, cIdx) => (
                                            <div key={`${cit.sourceId || cit.source_id || cIdx}`} className="rounded border border-cad-border/20 bg-cad-surface p-1 text-[9px] leading-snug">
                                                <div className="flex justify-between gap-2 font-bold text-cad-text-primary">
                                                    <span className="truncate">[{cIdx + 1}] {cit.title}</span>
                                                    <span className="text-cad-accent opacity-85">{Math.round((cit.score || 0) * 100)}%</span>
                                                </div>
                                                <div className="mt-0.5 truncate text-cad-text-muted">{cit.snippet}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {msg.actionProposals && msg.actionProposals.length > 0 && (
                                    <div className="mt-2.5 space-y-2 border-t border-cad-border/30 pt-2.5">
                                        <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-cad-warn">
                                            <AlertTriangle className="h-3.5 w-3.5" /> Proposed Action Diff
                                        </div>
                                        {msg.actionProposals.map((prop) => (
                                            <div key={prop.id} className="space-y-2 rounded border border-cad-warn/30 bg-cad-surface p-2 text-[9px]">
                                                <div className="flex justify-between gap-2 font-bold uppercase tracking-wider text-cad-text-primary">
                                                    <span>Type: {prop.actionType || prop.action_type}</span>
                                                    <span>Target: {prop.targetTable || prop.target_table}</span>
                                                </div>
                                                <pre className="custom-scrollbar overflow-x-auto rounded bg-cad-bg p-1.5 font-mono text-[8px] text-cad-warn/90 select-text">{JSON.stringify(prop.diff, null, 2)}</pre>
                                                <div className="flex justify-end gap-1.5">
                                                    <button onClick={() => handleRejectAction(prop.id)} className="flex items-center gap-0.5 rounded border border-cad-danger/40 bg-cad-danger/10 px-2 py-1 font-bold text-cad-danger">
                                                        <X className="h-3 w-3" /> Reject
                                                    </button>
                                                    <button onClick={() => handleConfirmAction(prop.id)} className="flex items-center gap-0.5 rounded border border-cad-accent/40 bg-cad-accent/10 px-2 py-1 font-bold text-cad-accent">
                                                        <Check className="h-3 w-3" /> Accept
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {showCloudConsent && (
                        <div className="flex flex-col gap-2.5 border-t border-cad-border bg-cad-elevated p-3">
                            <div className="flex items-center gap-2 font-bold text-cad-warn">
                                <Globe className="h-4 w-4" />
                                <span>Cloud AI Data Scope Consent</span>
                            </div>
                            <p className="text-[10px] leading-normal text-cad-text-secondary">This request will send the message and local citation snippets to the configured OpenAI-compatible endpoint.</p>
                            <pre className="max-h-[90px] overflow-y-auto rounded bg-cad-bg p-2 font-mono text-[8px] text-cad-text-muted">{JSON.stringify({ message: pendingCloudText, projectId, projectPath, featureCount }, null, 2)}</pre>
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setShowCloudConsent(false)} className="rounded border border-cad-border px-2.5 py-1.5 text-[10px] font-bold uppercase text-cad-text-secondary">Cancel</button>
                                <button onClick={handleConfirmCloudSend} className="rounded bg-cad-accent px-2.5 py-1.5 text-[10px] font-bold uppercase text-black">Confirm & Send</button>
                            </div>
                        </div>
                    )}

                    {!showCloudConsent && (
                        <div className="space-y-1.5 border-t border-cad-border bg-cad-elevated/40 p-2">
                            <div className="flex items-center justify-between px-1">
                                <button onClick={() => setAllowCloud(!allowCloud)} className="flex items-center gap-1 text-[9px] font-bold text-cad-text-secondary hover:text-cad-text-primary">
                                    {allowCloud ? <CheckSquare className="h-3.5 w-3.5 text-cad-accent" /> : <Square className="h-3.5 w-3.5" />}
                                    <span>ALLOW CLOUD</span>
                                </button>
                                <span className="truncate text-[8px] uppercase text-cad-text-muted" title={chatDisabledReason || undefined}>{chatDisabledReason || "Ready"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && void handleSendMessage()}
                                    placeholder="Type a query or command..."
                                    disabled={!!chatDisabledReason}
                                    className="min-w-0 flex-1 rounded-md border border-cad-border bg-cad-bg px-2.5 py-2 font-display text-cad-text-primary placeholder-cad-text-muted outline-none transition-all focus:border-cad-accent disabled:opacity-50"
                                />
                                <button aria-label="Send AI message" onClick={handleSendMessage} disabled={!!chatDisabledReason || !inputValue.trim()} className="shrink-0 rounded-md bg-cad-accent p-2 text-black transition-all hover:opacity-90 disabled:opacity-40">
                                    <Send className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {activeTab === "config" && (
                <div className="border-t border-cad-border bg-cad-elevated/40 p-3">
                    <button onClick={handleSaveConfig} disabled={savingConfig} className="flex w-full items-center justify-center gap-2 rounded bg-cad-accent py-2 text-[10px] font-black uppercase tracking-widest text-black transition-all hover:bg-cad-active disabled:opacity-50">
                        {savingConfig ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save AI Config
                    </button>
                </div>
            )}
        </div>
    );
}

import React, { useState, useEffect, useRef } from "react";
import { 
    Send, Sparkles, Cpu, ShieldAlert, Check, X, AlertTriangle, 
    RefreshCw, Globe, HelpCircle, FileText, ChevronDown, CheckSquare, Square
} from "lucide-react";
import { safeInvoke } from "@IMPLEMENT/lib/tauri";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import { useSettingsStore } from "@IMPLEMENT/stores/useSettingsStore";
import { cn } from "@TOOL/utils/cn";

interface Message {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    provider?: string;
    model?: string;
    citations?: any[];
    actionProposals?: any[];
}

export function AiAssistantPanel() {
    const project = useDesignSync(s => s.state);
    const projectId = project?.id || "";
    
    const { enableAi, setEnableAi } = useSettingsStore();
    const [status, setStatus] = useState<any>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [conversationId, setConversationId] = useState<string>("");
    const [inputValue, setInputValue] = useState("");
    
    // Cloud consent & Scope preview
    const [allowCloud, setAllowCloud] = useState(false);
    const [showCloudConsent, setShowCloudConsent] = useState(false);
    const [consentChecked, setConsentChecked] = useState(false);
    
    const [loading, setLoading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<any>(null);
    const [apiError, setApiError] = useState<string | null>(null);
    
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const refreshStatus = async () => {
        try {
            const res = await safeInvoke<any>("get_ai_status");
            setStatus(res);
        } catch (e) {
            console.error("Failed to fetch AI status:", e);
        }
    };

    useEffect(() => {
        void refreshStatus();
        const interval = setInterval(refreshStatus, 8000);
        return () => clearInterval(interval);
    }, []);

    // Load or create conversation
    useEffect(() => {
        if (!projectId) return;

        const initChat = async () => {
            try {
                const list = await safeInvoke<any[]>("list_ai_conversations", { projectId });
                if (list && list.length > 0) {
                    setConversationId(list[0].id);
                    // Fetch message history for this conversation
                    const history = await safeInvoke<any[]>("list_ai_messages", { conversationId: list[0].id });
                    if (history) {
                        setMessages(history.map(m => ({
                            id: m.id,
                            role: m.role,
                            content: m.content,
                            provider: m.provider,
                            model: m.model,
                            citations: JSON.parse(m.citations_json || "[]"),
                            actionProposals: [] // Proposals will be fetched/handled separately or loaded as actions
                        })));
                    }
                } else {
                    const newConv = await safeInvoke<any>("create_ai_conversation", { 
                        projectId, 
                        title: "AI Assistant Thread" 
                    });
                    if (newConv) {
                        setConversationId(newConv.id);
                        setMessages([]);
                    }
                }
            } catch (e) {
                console.error("Failed to load chat history:", e);
            }
        };

        void initChat();
    }, [projectId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSendMessage = async () => {
        if (!inputValue.trim() || !conversationId || loading) return;

        // If cloud RAG is enabled but cloud consent has not been validated
        if (allowCloud && !consentChecked) {
            setShowCloudConsent(true);
            return;
        }

        const text = inputValue;
        setInputValue("");
        setLoading(true);
        setApiError(null);

        // Optimistically add user message
        const userMsg: Message = {
            id: Math.random().toString(),
            role: "user",
            content: text
        };
        setMessages(prev => [...prev, userMsg]);

        try {
            // Confirm details scope definition to cloud
            const confirmedScope = allowCloud ? {
                message: text,
                projectContext: {
                    id: projectId,
                    name: project?.name,
                    taskCount: Object.keys(project?.features || {}).length
                }
            } : null;

            const chatRes = await safeInvoke<any>("send_ai_message", {
                request: {
                    projectId,
                    conversationId,
                    message: text,
                    allowCloud,
                    confirmedScope
                }
            });

            if (chatRes) {
                const assistantMsg: Message = {
                    id: chatRes.requestId || Math.random().toString(),
                    role: "assistant",
                    content: chatRes.content,
                    provider: chatRes.provider,
                    model: chatRes.model,
                    citations: chatRes.citations || [],
                    actionProposals: chatRes.actionProposals || []
                };
                setMessages(prev => [...prev, assistantMsg]);
            }
        } catch (e: any) {
            setApiError(e?.message || e?.toString() || "Failed to get AI response.");
        } finally {
            setLoading(false);
            void refreshStatus();
        }
    };

    const handleDownloadModels = async () => {
        try {
            setDownloadProgress({ status: "Starting..." });
            // Tauri event listener could be hooked here for progress, but start trigger suffices
            await safeInvoke("install_ai_models");
            void refreshStatus();
        } catch (e: any) {
            setApiError(e || "Model installation failed.");
        } finally {
            setDownloadProgress(null);
        }
    };

    const handleReleaseMemory = async () => {
        try {
            await safeInvoke("release_ai_memory");
            void refreshStatus();
        } catch (e: any) {
            console.error("Release memory error:", e);
        }
    };

    const handleConfirmAction = async (proposalId: string) => {
        try {
            await safeInvoke("confirm_ai_action", { actionId: proposalId });
            // Clear or update action in message display
            setMessages(prev => prev.map(m => {
                if (m.actionProposals) {
                    return {
                        ...m,
                        actionProposals: m.actionProposals.filter(p => p.id !== proposalId)
                    };
                }
                return m;
            }));
            setApiError(null);
        } catch (e: any) {
            setApiError(e || "Failed to confirm AI action.");
        }
    };

    const handleRejectAction = async (proposalId: string) => {
        try {
            await safeInvoke("reject_ai_action", { actionId: proposalId, note: "User rejected from Palette UI" });
            setMessages(prev => prev.map(m => {
                if (m.actionProposals) {
                    return {
                        ...m,
                        actionProposals: m.actionProposals.filter(p => p.id !== proposalId)
                    };
                }
                return m;
            }));
        } catch (e: any) {
            console.error("Failed to reject action:", e);
        }
    };

    const handleConsentAndSubmit = () => {
        setConsentChecked(true);
        setShowCloudConsent(false);
        // Resubmit message with consent verified
        setTimeout(handleSendMessage, 50);
    };

    const getRuntimeLabel = () => {
        if (!status) return "LOADING...";
        switch(status.state) {
            case "AI_OFF": return "AI DISABLED";
            case "MODEL_REQUIRED": return "MODEL REQUIRED";
            case "DOWNLOADING": return "DOWNLOADING MODEL...";
            case "LOCAL_READY": return "LOCAL READY (OFFLINE)";
            case "CLOUD_READY": return "CLOUD READY";
            case "ERROR": return "RUNTIME ERROR";
            default: return status.state;
        }
    };

    return (
        <div className="flex flex-col h-full bg-cad-surface text-cad-text-primary text-xs select-none">
            {/* Header info bar */}
            <div className="flex items-center justify-between p-2.5 border-b border-cad-border bg-cad-elevated/40">
                <div className="flex items-center gap-2">
                    <Sparkles className={cn("w-4 h-4", enableAi ? "text-cad-accent animate-pulse" : "text-cad-text-muted")} />
                    <span className="font-bold tracking-wider font-display uppercase">{getRuntimeLabel()}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    {status?.loadedSessions && status.loadedSessions.length > 0 && (
                        <button 
                            onClick={handleReleaseMemory}
                            title="Unload models and release RAM"
                            className="p-1 rounded text-cad-text-secondary hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                        >
                            <Cpu className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Error banners */}
            {apiError && (
                <div className="p-2 bg-red-950/40 border-b border-red-500/20 text-red-400 flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                        <span className="font-semibold">Error: </span>
                        {apiError}
                    </div>
                </div>
            )}

            {/* Model Setup State Banner */}
            {status?.state === "MODEL_REQUIRED" && (
                <div className="p-4 bg-cad-elevated border-b border-cad-border flex flex-col gap-2.5 items-center justify-center text-center">
                    <AlertTriangle className="w-8 h-8 text-yellow-500" />
                    <div>
                        <div className="font-bold text-white mb-1">Local Model Required</div>
                        <p className="text-[10px] text-cad-text-secondary max-w-[280px]">
                            To use offline AI features, please download the local weights manifest (~150MB total).
                        </p>
                    </div>
                    <button 
                        onClick={handleDownloadModels}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-cad-accent text-white font-bold tracking-wider hover:opacity-90 active:scale-95 transition-all"
                    >
                        <RefreshCw className="w-3 h-3 animate-spin-slow" />
                        DOWNLOAD MODELS
                    </button>
                </div>
            )}

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0 custom-scrollbar">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-cad-text-muted gap-2.5">
                        <Sparkles className="w-10 h-10 stroke-[1.2] opacity-35" />
                        <div className="font-black font-display text-[10px] tracking-widest uppercase">AI CAD Assistant</div>
                        <p className="max-w-[220px] text-[10px] leading-relaxed">
                            Ask me to query metadata, predict task schedules, analyze contract signals or propose structural CAD updates.
                        </p>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div 
                        key={msg.id || idx} 
                        className={cn(
                            "flex flex-col max-w-[85%] rounded-lg p-2.5 border transition-all",
                            msg.role === "user" 
                                ? "ml-auto bg-cad-elevated border-cad-border/70 text-cad-text-primary"
                                : "mr-auto bg-black/25 border-cad-border/30 text-cad-text-secondary"
                        )}
                    >
                        <div className="whitespace-pre-wrap leading-relaxed break-words">{msg.content}</div>

                        {/* Citation Snips */}
                        {msg.citations && msg.citations.length > 0 && (
                            <div className="mt-2.5 pt-2 border-t border-cad-border/30 space-y-1">
                                <div className="text-[9px] font-black uppercase text-cad-text-muted tracking-wider">References</div>
                                {msg.citations.map((cit, cIdx) => (
                                    <div key={cIdx} className="p-1 rounded bg-black/15 border border-cad-border/20 text-[9px] leading-snug">
                                        <div className="font-bold text-white flex justify-between">
                                            <span>[{cIdx + 1}] {cit.title}</span>
                                            <span className="text-cad-accent opacity-85">Match: {Math.round(cit.score * 100)}%</span>
                                        </div>
                                        <div className="text-cad-text-muted mt-0.5 truncate max-w-[280px]">{cit.snippet}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Action Proposal diff blocks */}
                        {msg.actionProposals && msg.actionProposals.length > 0 && (
                            <div className="mt-2.5 pt-2.5 border-t border-cad-border/30 space-y-2">
                                <div className="text-[9px] font-black uppercase text-yellow-500 tracking-wider flex items-center gap-1">
                                    <AlertTriangle className="w-3.5 h-3.5" /> Proposed Action Diff
                                </div>
                                {msg.actionProposals.map((prop, pIdx) => (
                                    <div key={prop.id || pIdx} className="p-2 rounded bg-black/20 border border-yellow-600/30 text-[9px] space-y-2">
                                        <div className="flex justify-between font-bold text-white uppercase tracking-wider">
                                            <span>Type: {prop.actionType}</span>
                                            <span>Target: {prop.targetTable}</span>
                                        </div>
                                        <pre className="text-yellow-400/90 font-mono text-[8px] bg-black/40 p-1.5 rounded overflow-x-auto select-text custom-scrollbar">
                                            {JSON.stringify(prop.diff, null, 2)}
                                        </pre>
                                        <div className="flex gap-1.5 justify-end">
                                            <button 
                                                onClick={() => handleRejectAction(prop.id)}
                                                className="flex items-center gap-0.5 px-2 py-1 rounded bg-red-950 border border-red-800 text-red-300 font-bold hover:bg-red-900 active:scale-95 transition-all"
                                            >
                                                <X className="w-3 h-3" /> REJECT
                                            </button>
                                            <button 
                                                onClick={() => handleConfirmAction(prop.id)}
                                                className="flex items-center gap-0.5 px-2 py-1 rounded bg-green-950 border border-green-800 text-green-300 font-bold hover:bg-green-900 active:scale-95 transition-all"
                                            >
                                                <Check className="w-3 h-3" /> ACCEPT
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

            {/* Cloud Consent Gate Dialog overlay */}
            {showCloudConsent && (
                <div className="p-3 bg-cad-elevated border-t border-cad-border flex flex-col gap-2.5">
                    <div className="flex items-center gap-2 text-yellow-500 font-bold">
                        <Globe className="w-4 h-4 animate-pulse" />
                        <span>Cloud AI Data Scope Consent</span>
                    </div>
                    <p className="text-[10px] text-cad-text-secondary leading-normal">
                        Sending this request will forward metadata queries and local citations to the OpenAI-compatible endpoint. No geometry coords or passwords will be shared.
                    </p>
                    <div className="p-2 rounded bg-black/30 font-mono text-[8px] max-h-[80px] overflow-y-auto text-cad-text-muted">
                        <span className="font-bold text-white">Transmitting scope preview:</span>
                        <pre className="whitespace-pre-wrap">{JSON.stringify({
                            message: inputValue,
                            project_id: projectId
                        }, null, 2)}</pre>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button 
                            onClick={() => setShowCloudConsent(false)}
                            className="px-2.5 py-1.5 rounded border border-cad-border hover:bg-white/5 active:scale-95 transition-all font-bold text-cad-text-secondary"
                        >
                            CANCEL
                        </button>
                        <button 
                            onClick={handleConsentAndSubmit}
                            className="px-2.5 py-1.5 rounded bg-cad-accent hover:opacity-90 active:scale-95 transition-all font-bold text-white"
                        >
                            CONFIRM & SEND
                        </button>
                    </div>
                </div>
            )}

            {/* Input Form */}
            {!showCloudConsent && (
                <div className="p-2 border-t border-cad-border bg-cad-elevated/40 space-y-1.5">
                    <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => {
                                    setAllowCloud(!allowCloud);
                                    setConsentChecked(false);
                                }}
                                className="flex items-center gap-1 text-[9px] font-bold text-cad-text-secondary hover:text-white"
                            >
                                {allowCloud ? (
                                    <CheckSquare className="w-3.5 h-3.5 text-cad-accent" />
                                ) : (
                                    <Square className="w-3.5 h-3.5" />
                                )}
                                <span>ALLOW CLOUD (OPENAI)</span>
                            </button>
                        </div>
                        <span className="text-[8px] text-cad-text-muted uppercase">V2 Runtime</span>
                    </div>
                    
                    <div className="flex gap-2 items-center">
                        <input 
                            type="text" 
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                            placeholder="Type a query or command..."
                            disabled={loading || status?.state === "DOWNLOADING"}
                            className="flex-1 bg-black/30 border border-cad-border rounded-md px-2.5 py-2 text-white placeholder-cad-text-muted focus:outline-none focus:border-cad-accent font-display transition-all"
                        />
                        <button 
                            onClick={handleSendMessage}
                            disabled={loading || !inputValue.trim() || status?.state === "DOWNLOADING"}
                            className="p-2 rounded-md bg-cad-accent text-white hover:opacity-90 disabled:opacity-40 disabled:hover:opacity-40 active:scale-95 transition-all shrink-0"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

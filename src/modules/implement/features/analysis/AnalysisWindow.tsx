import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Minus, Square, X } from 'lucide-react';
import { AnalysisDialog } from '@IMPLEMENT/features/analysis/AnalysisDialog';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { useSettingsStore } from '@CORE/stores/useSettingsStore';
import { useAuthStore } from '@CORE/stores/useAuthStore';
import { getCurrentWebviewWindow } from '@/contracts/tauri-api/runtime';

const AnalysisWindow: React.FC = () => {
    const { initialize, state, error: projectError } = useDesignSync();
    const { loadSettings } = useSettingsStore();
    const { user, initialized: authInitialized, isStandalone } = useAuthStore();
    const [isMaximized, setIsMaximized] = useState(false);
    const windowRootRef = useRef<HTMLDivElement | null>(null);

    const resetViewportScroll = () => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.documentElement.scrollLeft = 0;
        document.body.scrollTop = 0;
        document.body.scrollLeft = 0;
        document.scrollingElement?.scrollTo?.(0, 0);
        windowRootRef.current?.scrollTo?.(0, 0);
    };

    useLayoutEffect(() => {
        resetViewportScroll();
    }, []);

    useEffect(() => {
        let disposed = false;
        let cleanup: (() => void) | null = null;

        const initWindowControls = async () => {
            try {
                const appWindow = getCurrentWebviewWindow();
                if (!appWindow) return;
                const syncMaximized = async () => {
                    if (!disposed) {
                        setIsMaximized(await appWindow.isMaximized());
                    }
                };

                await syncMaximized();
                const unlisten = await appWindow.onResized(() => {
                    void syncMaximized();
                });
                cleanup = () => {
                    unlisten();
                };
            } catch (error) {
                console.warn('[AnalysisWindow] Failed to initialize window controls:', error);
            }
        };

        void initWindowControls();

        return () => {
            disposed = true;
            cleanup?.();
        };
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const urlProjectId = params.get('projectId');
        resetViewportScroll();
        console.log(`[AnalysisWindow] Detected urlProjectId from URL: ${urlProjectId}`);
        const currentProjectId = useDesignSync.getState().projectId;

        if (urlProjectId && currentProjectId !== urlProjectId) {
            console.log(`[AnalysisWindow] Calling initialize for project ${urlProjectId}...`);
            initialize(urlProjectId).catch(err => {
                console.error("[AnalysisWindow] Initialization error:", err);
            });
        } else if (urlProjectId) {
            console.log(`[AnalysisWindow] Project already initialized: ${urlProjectId}`);
        } else {
            console.warn("[AnalysisWindow] No projectId found in URL params.");
        }
        loadSettings();

        document.title = "Bảng phân tích dữ liệu - Analysis";
    }, []);

    useEffect(() => {
        if (!state) return;
        const frame = window.requestAnimationFrame(() => {
            resetViewportScroll();
        });
        return () => {
            window.cancelAnimationFrame(frame);
        };
    }, [state]);

    // 1. Wait for Auth
    if (!authInitialized && !isStandalone) {
        return (
            <div className="h-full w-full min-h-0 min-w-0 flex items-center justify-center bg-cad-bg text-cad-text-primary flex-col gap-4">
                <div className="w-10 h-10 border-2 border-cad-accent border-t-transparent rounded-full animate-spin"></div>
                <div className="text-[11px] font-mono text-cad-text-muted uppercase tracking-widest">
                    Đang xác thực hệ thống...
                </div>
            </div>
        );
    }

    // 2. Check User session
    // Since we added a protection buffer in useAuthStore, we can trust 'user' being null here 
    // means a definitive failure after the grace period.
    if (!user && !isStandalone) {
        console.error("[AnalysisWindow] Auth failed: No user soul found after window warmup.");
        return (
            <div className="h-full w-full min-h-0 min-w-0 flex items-center justify-center bg-cad-bg text-red-400 flex-col gap-4 p-8 text-center">
                <div className="text-xl font-bold italic">Phiên đăng nhập hết hạn</div>
                <div className="text-[10px] text-cad-text-muted uppercase">Vui lòng đăng nhập lại ở cửa sổ chính hoặc làm mới trang.</div>
                <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-1 border border-red-500/30 hover:bg-red-500/10 text-[9px] uppercase tracking-tighter transition-colors"
                >
                    Thử lại (Reload)
                </button>
            </div>
        );
    }

    if (projectError) {
        return (
            <div className="h-full w-full min-h-0 min-w-0 flex items-center justify-center bg-cad-bg text-red-500 flex-col gap-4 p-8 text-center">
                <div className="text-xl font-bold">Lỗi khởi tạo</div>
                <div className="text-sm border border-red-500/30 bg-red-500/10 p-4 rounded max-w-lg overflow-auto">
                    {projectError}
                </div>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-4 px-4 py-2 bg-cad-accent text-white rounded hover:opacity-90 transition-opacity"
                >
                    Thử lại
                </button>
            </div>
        );
    }

    if (!state) {
        return (
            <div className="h-full w-full min-h-0 min-w-0 flex items-center justify-center bg-cad-bg text-cad-text-primary flex-col gap-4">
                <div className="w-10 h-10 border-2 border-cad-accent border-t-transparent rounded-full animate-spin"></div>
                <div className="text-[11px] font-mono text-cad-text-muted uppercase tracking-widest">
                    Đang khởi tạo dữ liệu dự án...
                </div>
            </div>
        );
    }

    return (
        <div ref={windowRootRef} className="fixed inset-0 min-h-0 min-w-0 bg-cad-bg overflow-hidden flex flex-col">
            <div
                role="presentation"
                data-tauri-drag-region
                onMouseDown={(event) => {
                    if (event.currentTarget === event.target || (event.target as HTMLElement).hasAttribute('data-tauri-drag-region')) {
                        getCurrentWebviewWindow()?.startDragging();
                    }
                }}
                onDoubleClick={() => getCurrentWebviewWindow()?.toggleMaximize()}
                className="flex h-10 shrink-0 select-none items-center justify-between border-b border-cad-border bg-cad-header pl-2 pr-0"
            >
                <div data-tauri-drag-region className="flex items-center gap-2 min-w-0 pointer-events-none">
                                    <div className="ml-1 flex h-7 w-7 items-center justify-center rounded-sm bg-cad-danger">
                        <span className="text-white font-black text-sm italic">P</span>
                    </div>
                    <span data-tauri-drag-region className="text-xs font-bold text-white tracking-wide truncate ml-1">
                        Bảng phân tích dữ liệu - Analysis
                    </span>
                    {(state as any)?.project?.name && (
                        <span data-tauri-drag-region className="text-xs text-cad-text-secondary truncate">
                            - {String((state as any).project.name).toUpperCase()}
                        </span>
                    )}
                </div>

                <div className="flex items-center h-full pointer-events-auto">
                    <button
                        onClick={() => getCurrentWebviewWindow()?.minimize()}
                        className="w-11 h-full flex items-center justify-center text-cad-text-primary hover:bg-cad-text-primary/5 transition-colors"
                        aria-label="Minimize analysis window"
                    >
                        <Minus className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => getCurrentWebviewWindow()?.toggleMaximize()}
                        className="w-11 h-full flex items-center justify-center text-cad-text-primary hover:bg-cad-text-primary/5 transition-colors"
                        aria-label="Maximize analysis window"
                    >
                        {isMaximized ? (
                            <div className="relative w-3 h-3 border border-white top-[1px] left-[1px]">
                                <div className="absolute -right-1 -top-1 h-3 w-3 border border-cad-text-primary bg-cad-header" />
                            </div>
                        ) : (
                            <Square className="w-3 h-3" />
                        )}
                    </button>
                    <button
                        onClick={() => getCurrentWebviewWindow()?.close()}
                        className="flex h-full w-11 items-center justify-center text-cad-text-primary transition-colors hover:bg-cad-danger"
                        aria-label="Close analysis window"
                    >
                        <X className="w-4.5 h-4.5" />
                    </button>
                </div>
            </div>
            <div className="flex-1 min-h-0 min-w-0 overflow-hidden relative">
                <AnalysisDialog onClose={() => {
                    getCurrentWebviewWindow()?.close();
                }} />
            </div>
        </div>
    );
};

export default AnalysisWindow;

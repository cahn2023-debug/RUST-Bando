import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BarChart3, Minus, Square, X } from 'lucide-react';
import { AnalysisDialog } from '@IMPLEMENT/features/analysis/AnalysisDialog';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { useSettingsStore } from '@IMPLEMENT/stores/useSettingsStore';
import { useAuthStore } from '@IMPLEMENT/stores/useAuthStore';
import { cn } from '@TOOL/utils/cn';

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
                const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                const appWindow = getCurrentWebviewWindow();
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
                data-tauri-drag-region
                onMouseDown={(event) => {
                    if (event.currentTarget === event.target || (event.target as HTMLElement).hasAttribute('data-tauri-drag-region')) {
                        import('@tauri-apps/api/webviewWindow').then((m) => {
                            m.getCurrentWebviewWindow().startDragging();
                        });
                    }
                }}
                onDoubleClick={() => import('@tauri-apps/api/webviewWindow').then((m) => m.getCurrentWebviewWindow().toggleMaximize())}
                className="h-11 shrink-0 border-b border-cad-border bg-cad-elevated/95 backdrop-blur-md flex items-center justify-between pl-3 pr-0 select-none"
            >
                <div data-tauri-drag-region className="flex items-center gap-3 min-w-0">
                    <div data-tauri-drag-region className="w-7 h-7 rounded-md bg-cad-accent/10 text-cad-accent flex items-center justify-center">
                        <BarChart3 data-tauri-drag-region className="w-4 h-4" />
                    </div>
                    <div data-tauri-drag-region className="min-w-0">
                        <div data-tauri-drag-region className="text-[11px] font-black text-cad-text-primary uppercase tracking-wider truncate">
                            Analysis
                        </div>
                        <div data-tauri-drag-region className="text-[9px] font-mono text-cad-text-muted uppercase tracking-widest truncate">
                            Drag window here
                        </div>
                    </div>
                </div>

                <div className="flex items-center h-full">
                    <button
                        onClick={() => import('@tauri-apps/api/webviewWindow').then((m) => m.getCurrentWebviewWindow().minimize())}
                        className="w-12 h-full flex items-center justify-center text-cad-text-secondary hover:bg-cad-surface transition-colors"
                        aria-label="Minimize analysis window"
                    >
                        <Minus className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => import('@tauri-apps/api/webviewWindow').then((m) => m.getCurrentWebviewWindow().toggleMaximize())}
                        className="w-12 h-full flex items-center justify-center text-cad-text-secondary hover:bg-cad-surface transition-colors"
                        aria-label="Maximize analysis window"
                    >
                        <Square className={cn('w-3.5 h-3.5', isMaximized && 'rotate-180')} />
                    </button>
                    <button
                        onClick={() => import('@tauri-apps/api/webviewWindow').then((m) => m.getCurrentWebviewWindow().close())}
                        className="w-12 h-full flex items-center justify-center text-cad-text-secondary hover:bg-rose-500 hover:text-white transition-colors"
                        aria-label="Close analysis window"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
            <div className="flex-1 min-h-0 min-w-0 overflow-hidden relative">
                <AnalysisDialog onClose={() => {
                    import('@tauri-apps/api/webviewWindow').then(m => {
                        m.getCurrentWebviewWindow().close();
                    });
                }} />
            </div>
        </div>
    );
};

export default AnalysisWindow;

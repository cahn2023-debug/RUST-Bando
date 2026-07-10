import React, { useEffect } from 'react';
import { AnalysisDialog } from '@IMPLEMENT/features/analysis/AnalysisDialog';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { useSettingsStore } from '@IMPLEMENT/stores/useSettingsStore';
import { useAuthStore } from '@IMPLEMENT/stores/useAuthStore';
import { isUuidLike } from '@TOOL/utils/designIpc';

const AnalysisWindow: React.FC = () => {
    const { initialize, state, error: projectError } = useDesignSync();
    const { loadSettings } = useSettingsStore();
    const { user, initialized: authInitialized } = useAuthStore();

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const urlProjectId = params.get('projectId');
        console.log(`[AnalysisWindow] Detected urlProjectId from URL: ${urlProjectId}`);
        const currentProjectId = useDesignSync.getState().projectId;

        if (urlProjectId && !isUuidLike(urlProjectId)) {
            console.warn(`[AnalysisWindow] Skip initialize due to non-UUID projectId: ${urlProjectId}`);
        } else if (urlProjectId && currentProjectId !== urlProjectId) {
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

    // 1. Wait for Auth
    if (!authInitialized) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-cad-bg text-cad-text-primary flex-col gap-4">
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
    if (!user) {
        console.error("[AnalysisWindow] Auth failed: No user soul found after window warmup.");
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-cad-bg text-red-400 flex-col gap-4 p-8 text-center">
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
            <div className="h-screen w-screen flex items-center justify-center bg-cad-bg text-red-500 flex-col gap-4 p-8 text-center">
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
            <div className="h-screen w-screen flex items-center justify-center bg-cad-bg text-cad-text-primary flex-col gap-4">
                <div className="w-10 h-10 border-2 border-cad-accent border-t-transparent rounded-full animate-spin"></div>
                <div className="text-[11px] font-mono text-cad-text-muted uppercase tracking-widest">
                    Đang khởi tạo dữ liệu dự án...
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen w-screen bg-cad-bg overflow-hidden flex flex-col">
            <div className="flex-1 overflow-hidden relative">
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

import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Project } from "@CONTRACT/types";

export function useRibbonActions(project?: Project | null) {
    const openStandaloneWindow = useCallback(async (view: 'analysis' | 'print' | 'contract_analysis') => {
        if (!project?.id) return;
        try {
            const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
            const label = view;
            let title = view === 'print' ? 'Thiết lập in ấn & Xuất bản hồ sơ' :
                view === 'contract_analysis' ? 'Phân tích hợp đồng & BOM - AI Assistant' :
                    'Bảng phân tích dữ liệu - Analysis';

            const width = view === 'print' ? 1100 : 1200;
            const height = view === 'print' ? 900 : 800;

            let win = await WebviewWindow.getByLabel(label);
            if (win) await win.destroy();

            win = new WebviewWindow(label, {
                url: `index.html?view=${view}&projectId=${project.id}`,
                title, width, height, minWidth: 800, minHeight: 600,
                decorations: false, visible: false
            });

            win.once('tauri:/created', async () => {
                const w = await WebviewWindow.getByLabel(label);
                if (w) setTimeout(async () => { await w.show(); await w.setFocus(); }, 150);
            });
        } catch (err) {
            console.error(`Failed to open standalone window ${view}:`, err);
        }
    }, [project?.id]);

    const onReleaseAiMemory = useCallback(async () => {
        try {
            await invoke('release_ai_memory');
        } catch (e) {
            console.error("[AI] Failed to release memory:", e);
        }
    }, []);

    return {
        openStandaloneWindow,
        onReleaseAiMemory
    };
}

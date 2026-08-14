import { useCallback } from "react";
import { createWebviewWindow, getWindowByLabel, invoke } from "@/contracts/tauri-api/runtime";
import { Project } from "@CONTRACT/types";

export function useRibbonActions(project?: Project | null) {
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    const openStandaloneWindow = useCallback(async (view: 'analysis' | 'print' | 'contract_analysis') => {
        if (!project?.id) return;
        try {
            const label = view === 'analysis' ? `analysis-${project.id}` : view;
            const title = view === 'print'
                ? 'Thiết lập in ấn & Xuất bản hồ sơ'
                : view === 'contract_analysis'
                    ? 'Phân tích hợp đồng & BOM - AI Assistant'
                    : 'Bảng phân tích dữ liệu - Analysis';

            const width = view === 'print' ? 1100 : 1200;
            const height = view === 'print' ? 900 : 800;

            const focusWindow = async () => {
                const existingWindow = await getWindowByLabel(label);
                if (!existingWindow) {
                    return false;
                }

                try {
                    if (await existingWindow.isMinimized()) {
                        await existingWindow.unminimize();
                    }
                    await existingWindow.show();
                    await existingWindow.setFocus();
                    return true;
                } catch (focusError) {
                    console.error(`Failed to focus standalone window ${view}:`, focusError);
                    return false;
                }
            };

            const destroyWindow = async () => {
                const existingWindow = await getWindowByLabel(label);
                if (!existingWindow) {
                    return false;
                }

                try {
                    await existingWindow.destroy();
                    await new Promise((resolve) => setTimeout(resolve, 120));
                    return true;
                } catch (destroyError) {
                    console.error(`Failed to destroy standalone window ${view}:`, destroyError);
                    return false;
                }
            };

            if (await focusWindow()) {
                return;
            }

            await destroyWindow();

            const createWindow = () => createWebviewWindow(label, {
                url: `index.html?view=${view}&projectId=${project.id}`,
                title,
                width,
                height,
                minWidth: 800,
                minHeight: 600,
                decorations: false,
                visible: true,
                focus: true
            });

            const win = createWindow();
            if (!win) return;

            win.once('tauri://created', () => {
                setTimeout(async () => {
                        await focusWindow();
                }, 150);
            });

            win.once('tauri://error', async (event) => {
                console.error(`Failed to create standalone window ${view}:`, event);

                if (typeof event.payload === 'string' && event.payload.includes('already exists')) {
                    const destroyed = await destroyWindow();
                    if (destroyed) {
                        const retryWindow = createWindow();
                        if (!retryWindow) return;
                        retryWindow.once('tauri://created', () => {
                            setTimeout(async () => {
                                await focusWindow();
                            }, 150);
                        });
                        retryWindow.once('tauri://error', (retryEvent) => {
                            console.error(`Retry failed to create standalone window ${view}:`, retryEvent);
                        });
                        return;
                    }
                }

                await focusWindow();
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

import React, { useEffect } from 'react';
import { PrintDialog } from '@DESIGN/features/print/PrintDialog';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { useSettingsStore } from '@IMPLEMENT/stores/useSettingsStore';

const PrintWindow: React.FC = () => {
    const { initialize, projectId } = useDesignSync();
    const { loadSettings } = useSettingsStore();

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const urlProjectId = params.get('projectId');
        
        if (urlProjectId) {
            initialize(parseInt(urlProjectId));
        }
        loadSettings();
        
        document.title = "Thiết lập in ấn & Xuất bản hồ sơ";
    }, []);

    if (!projectId) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-cad-bg text-cad-text-primary">
                Đang khởi tạo dữ liệu dự án...
            </div>
        );
    }

    return (
        <div className="h-screen w-screen bg-cad-bg overflow-hidden flex flex-col">
            <div className="flex-1 overflow-hidden relative">
                <PrintDialog onClose={() => {
                    import('@tauri-apps/api/webviewWindow').then(m => {
                        m.getCurrentWebviewWindow().close();
                    });
                }} />
            </div>
        </div>
    );
};

export default PrintWindow;

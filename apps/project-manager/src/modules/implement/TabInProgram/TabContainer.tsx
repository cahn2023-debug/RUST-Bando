import React from 'react';
import { useTabStore } from './useTabStore';
import './TabContainer.css';

interface TabContainerProps {
    onTabSwitch?: (id: string) => void | boolean | Promise<void | boolean>;
    onTabClose?: (id: string) => void | boolean | Promise<void | boolean>;
}

export const TabContainer: React.FC<TabContainerProps> = ({ onTabSwitch, onTabClose }) => {
    const { tabs, activeTabId, setActiveTab, removeTab } = useTabStore();

    const handleTabClick = async (id: string) => {
        const shouldSwitch = await onTabSwitch?.(id);
        if (shouldSwitch === false) return;
        setActiveTab(id);
    };

    const handleClose = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const shouldClose = await onTabClose?.(id);
        if (shouldClose === false) return;
        removeTab(id);
    };

    if (tabs.length === 0) return null;

    return (
        <div className="tab-container cad-scrollbar pointer-events-auto" role="tablist" aria-label="Open project tabs">
            {tabs.map((tab) => (
                <div
                    key={tab.id}
                    role="tab"
                    aria-selected={activeTabId === tab.id}
                    tabIndex={activeTabId === tab.id ? 0 : -1}
                    className={`tab-item ${activeTabId === tab.id ? 'active' : ''}`}
                    onClick={() => handleTabClick(tab.id)}
                    onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleTabClick(tab.id);
                        }
                    }}
                    title={tab.path}
                >
                    <span className="tab-name">{tab.name}</span>
                    <button
                        type="button"
                        className="tab-close"
                        onClick={(e) => handleClose(e, tab.id)}
                        aria-label={`Close ${tab.name}`}
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    );
};

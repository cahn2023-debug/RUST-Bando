import React from 'react';
import { useTabStore } from './useTabStore';
import './TabContainer.css';

interface TabContainerProps {
    onTabSwitch?: (id: string) => void;
    onTabClose?: (id: string) => void;
}

export const TabContainer: React.FC<TabContainerProps> = ({ onTabSwitch, onTabClose }) => {
    const { tabs, activeTabId, setActiveTab, removeTab } = useTabStore();

    const handleTabClick = (id: string) => {
        setActiveTab(id);
        onTabSwitch?.(id);
    };

    const handleClose = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        removeTab(id);
        onTabClose?.(id);
    };

    if (tabs.length === 0) return null;

    return (
        <div className="tab-container cad-scrollbar pointer-events-auto">
            {tabs.map((tab) => (
                <div
                    key={tab.id}
                    className={`tab-item ${activeTabId === tab.id ? 'active' : ''}`}
                    onClick={() => handleTabClick(tab.id)}
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

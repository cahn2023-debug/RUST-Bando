import React from 'react';
import { MousePointer2, MapPin, Share2, Hexagon, Trash2 } from 'lucide-react';
import './MapToolbar.css';

interface MapToolbarProps {
    activeMode: string;
    onModeChange: (mode: string) => void;
    onDelete: () => void;
}

export const MapToolbar: React.FC<MapToolbarProps> = ({ activeMode, onModeChange, onDelete }) => {
    return (
        <div className="map-toolbar-container">
            <div className="map-toolbar-group">
                <button
                    className={`toolbar-btn ${activeMode === 'simple_select' ? 'active' : ''}`}
                    onClick={() => onModeChange('simple_select')}
                    title="Select (V)"
                >
                    <MousePointer2 size={18} />
                </button>

                <div className="toolbar-separator" />

                <button
                    className={`toolbar-btn ${activeMode === 'draw_point' ? 'active' : ''}`}
                    onClick={() => onModeChange('draw_point')}
                    title="Vẽ Điểm (P)"
                >
                    <MapPin size={18} />
                </button>

                <button
                    className={`toolbar-btn ${activeMode === 'draw_line_string' ? 'active' : ''}`}
                    onClick={() => onModeChange('draw_line_string')}
                    title="Vẽ Đường (L)"
                >
                    <Share2 size={18} />
                </button>

                <button
                    className={`toolbar-btn ${activeMode === 'draw_polygon' ? 'active' : ''}`}
                    onClick={() => onModeChange('draw_polygon')}
                    title="Vẽ Vùng (G)"
                >
                    <Hexagon size={18} />
                </button>

                <div className="toolbar-separator" />

                <button
                    className="toolbar-btn delete-btn"
                    onClick={onDelete}
                    title="Xóa đối tượng (Delete)"
                >
                    <Trash2 size={18} />
                </button>
            </div>
        </div>
    );
};

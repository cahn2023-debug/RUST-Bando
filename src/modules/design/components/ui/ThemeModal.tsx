import { useState, useEffect, useRef } from 'react';
import { Settings2, X, Play } from 'lucide-react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { getParsedMetadata } from '@TOOL/utils/featureUtils';

interface ThemeModalProps {
  groupId: string;
  groupName: string;
  onClose: () => void;
}

export function ThemeModal({ groupId, groupName, onClose }: ThemeModalProps) {
  const state = useDesignSync(s => s.state);
  const selectedFeatureId = useDesignSync(s => s.selectedFeatureId);
  const dispatchEvents = useDesignSync(s => s.dispatchEvents);
  const setGroupThemePreview = useDesignSync(s => s.setGroupThemePreview);
  const [iconType, setIconType] = useState('default');
  const [color, setColor] = useState('#3B82F6');
  const [size, setSize] = useState<number>(32);
  const [isApplying, setIsApplying] = useState(false);
  const loadedRef = useRef(false);

  const asString = (value: unknown) => (typeof value === 'string' ? value : '');
  const asNumber = (value: unknown, fallback: number) =>
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) || fallback : fallback;

  // Initial load: Only load once per groupId
  useEffect(() => {
    loadedRef.current = false;
  }, [groupId]);

  useEffect(() => {
    if (loadedRef.current || !state) return;

    // 1. Prioritize currently selected feature if it is in this group
    if (selectedFeatureId) {
      const selectedFeature = state.features[selectedFeatureId];
      if (selectedFeature && selectedFeature.group_id === groupId) {
        const meta = getParsedMetadata(selectedFeature);
        if (meta.icon) setIconType(asString(meta.icon) || iconType);
        if (meta.color) setColor(asString(meta.color) || color);
        if (meta.size !== undefined && meta.size !== null) setSize(asNumber(meta.size, size));
        loadedRef.current = true;
        return;
      }
    }

    // 2. Fallback to Group's saved theme config
    if (state.feature_groups[groupId]) {
      const group = state.feature_groups[groupId];
      try {
        const themeConfig = typeof group.metadata === 'string'
          ? (JSON.parse(group.metadata) as any).theme_config
          : (group.metadata as any)?.theme_config;

        if (themeConfig) {
          if (themeConfig.icon) setIconType(asString(themeConfig.icon) || iconType);
          if (themeConfig.color) setColor(asString(themeConfig.color) || color);
          if (themeConfig.size !== undefined && themeConfig.size !== null) setSize(asNumber(themeConfig.size, size));
          loadedRef.current = true;
        }
      } catch (e) {
        console.warn("Failed to parse group theme metadata", e);
      }
    }
  }, [groupId, state, selectedFeatureId]);

  // Handle Real-time Preview
  useEffect(() => {
    setGroupThemePreview(groupId, {
      icon: iconType,
      color: color,
      size: size
    });

    // Cleanup preview on unmount
    return () => {
      setGroupThemePreview(null, null);
    };
  }, [groupId, iconType, color, size, setGroupThemePreview]);

  const handleCancel = () => {
    setGroupThemePreview(null, null); // Immediate clear
    onClose();
  };

  const handleApply = async () => {
    if (!state) return;

    setIsApplying(true);

    try {
      // 1. Save theme config to the Group itself
      const group = state.feature_groups[groupId];
      if (!group) {
        console.error("Group not found:", groupId);
        alert("Group not found");
        setIsApplying(false);
        return;
      }

      const groupMeta = typeof group.metadata === 'string' ? JSON.parse(group.metadata || '{}') : (group.metadata || {});
      const updatedGroupMeta = {
        ...groupMeta,
        theme_config: {
          icon: iconType,
          color: color,
          size: size
        }
      };

      const groupUpdateEvent = {
        type: 'FeatureGroupUpdated' as const,
        payload: {
          id: groupId,
          layer_id: group.layer_id || '',
          parent_id: group.parent_id || null,
          name: group.name || '',
          is_visible: group.is_visible !== undefined ? group.is_visible : true,
          metadata: JSON.stringify(updatedGroupMeta)
        }
      };

      // 2. Filter features: Only apply to direct features of this group,
      // AND skip any features that belong to a subgroup of type INTERSECTION
      const featuresInGroup = Object.values(state.features).filter(f => {
        // Must be in the current group
        if (f.group_id !== groupId) return false;

        // Skip if this is a feature belonging to an intersection (check metadata)
        const meta = getParsedMetadata(f);
        if (meta.parent_feature_id) return false;

        return true;
      });

      const featureEvents: any[] = featuresInGroup
        .filter(f => {
          // Ensure feature has required fields
          if (!f.id || !f.geom_type) {
            console.warn("Skipping feature with missing fields:", f.id);
            return false;
          }
          return true;
        })
        .map(f => {
          const metadata = getParsedMetadata(f);

          // Use iconType if provided, otherwise preserve existing
          let targetIcon = metadata.icon;
          if (iconType !== 'default') {
            targetIcon = iconType;
          }

          // IMPORTANT: Only merge theme-related fields into metadata
          // Do NOT overwrite the entire metadata string
          const newMetadata = {
            ...metadata,
            icon: targetIcon,
            color: color || metadata.color,
            size: size || metadata.size || 32
          };

          return {
            type: 'FeatureUpdated',
            payload: {
              id: f.id,
              name: f.name || '',
              geom_type: f.geom_type,
              layer_id: f.layer_id || '',
              group_id: f.group_id || null,
              coordinates: f.coordinates || { type: 'Point', coordinates: [] },
              properties: f.properties || {},
              metadata: JSON.stringify(newMetadata)
            }
          };
        });

      const allEvents = [groupUpdateEvent, ...featureEvents];

      if (allEvents.length > 0) {
        console.log(`[Theme] Applying theme to group "${groupName}" with ${featureEvents.length} features`);
        
        // Close modal immediately for better UX
        // Dispatch will continue in background
        onClose();
        
        // Dispatch in background without blocking UI
        dispatchEvents(allEvents)
          .then(() => {
            console.log('[Theme] Theme applied successfully');
          })
          .catch((error) => {
            console.error('[Theme] Failed to apply theme:', error);
            // Show error toast instead of alert since modal is closed
            if (error.message?.includes('timed out')) {
              console.warn('[Theme] Operation timed out but may still be processing. Check the map to verify results.');
            }
          });
      } else {
        console.warn('[Theme] No events to dispatch');
        onClose();
      }
    } catch (error) {
      console.error('[Theme] Failed to apply theme:', error);
      alert(`Failed to apply theme: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsApplying(false);
    }
  };

  const presetColors = [
    '#EF4444', // Red
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Emerald
    '#8B5CF6', // Amber
    '#EC4899', // Purple
    '#6366F1', // Violet
    '#14B8A6', // Teal
    '#F43F5E', // Pink
    '#64748B', // Slate
    '#000000', // Black
    '#FFFFFF', // White
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1A1A1A] border border-cad-border rounded-lg shadow-2xl w-full max-w-sm overflow-hidden flex flex-col font-sans">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cad-border bg-[#222]">
          <div className="flex items-center gap-2">
            <Settings2 size={16} className="text-cad-accent" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Group Theme</h2>
            <span className="text-[10px] text-cad-text-muted bg-black/30 px-2 py-0.5 rounded-full">{groupName}</span>
          </div>
          <button
            onClick={handleCancel}
            className="text-cad-text-muted hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-5 text-sm text-cad-text-primary">

          <div className="space-y-2">
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-cad-text-muted">Biểu tượng (Icon)</label>
            <div className="relative">
              <select
                value={iconType}
                onChange={e => setIconType(e.target.value)}
                className="w-full bg-[#2A2A2A] border border-cad-border rounded p-2 pl-9 text-white outline-none focus:border-cad-accent appearance-none transition-colors"
              >
                <option value="default">(Giữ nguyên)</option>
                <option value="cctv">Camera CCTV</option>
                <option value="ptz">Camera PTZ</option>
                <option value="speed">Camera Bắn Tốc Độ</option>
                <option value="lpr">Camera Nhận Diện Biển Số</option>
                <option value="intersection">Nút giao (Cross)</option>
                <option value="point_circle">Chấm tròn</option>
              </select>
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-cad-accent">
                {/* Preview current icon */}
                {iconType === 'cctv' && <div className="w-4 h-4 rounded-sm border-2 border-current flex items-center justify-center text-[8px] font-bold">C</div>}
                {iconType === 'ptz' && <div className="w-4 h-4 rounded-full border-2 border-current"></div>}
                {iconType === 'speed' && <div className="w-4 h-4 bg-current rounded-sm flex items-center justify-center text-[6px] text-[#1A1A1A] font-black">S</div>}
                {iconType === 'lpr' && <div className="w-4 h-4 border-2 border-current skew-x-[-12deg] flex items-center justify-center text-[6px] font-black">L</div>}
                {iconType === 'intersection' && <div className="text-sm scale-125">✖</div>}
                {iconType === 'point_circle' && <div className="w-2.5 h-2.5 rounded-full bg-current mx-auto shadow-[0_0_5px_currentColor]"></div>}
                {iconType === 'default' && <Settings2 size={14} />}
              </div>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-cad-text-muted">
                <div className="border-t-4 border-l-4 border-r-4 border-l-transparent border-r-transparent border-t-cad-text-muted"></div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-cad-text-muted">Màu sắc (Color)</label>
            <div className="flex flex-wrap gap-2">
              {presetColors.map(c => (
                <div
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full cursor-pointer border-2 transition-all ${color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0"
              />
              <span className="font-mono text-xs text-cad-text-muted bg-[#2A2A2A] px-2 py-1 rounded">{color}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-cad-text-muted">Kích thước (Size)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="1"
                max="100"
                step="1"
                value={size}
                onChange={e => setSize(parseInt(e.target.value))}
                className="flex-1 accent-cad-accent"
              />
              <span className="font-mono text-xs bg-[#2A2A2A] px-3 py-1 rounded border border-cad-border">{size}px</span>
            </div>
            <p className="text-[10px] text-cad-text-muted italic opacity-70">
              * Kích thước 1-10px phù hợp cho độ dày đường Polyline/Line.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-cad-border bg-[#222] flex justify-end gap-2">
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded text-xs font-semibold text-cad-text-secondary hover:text-white transition-colors"
            disabled={isApplying}
          >
            Hủy
          </button>
          <button
            onClick={handleApply}
            disabled={isApplying}
            className="px-4 py-2 rounded text-xs font-bold bg-cad-accent text-black hover:bg-cad-accent/90 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {isApplying ? (
              <span className="animate-pulse">Đang áp dụng...</span>
            ) : (
              <>
                <Play size={12} fill="currentColor" />
                Áp dụng
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

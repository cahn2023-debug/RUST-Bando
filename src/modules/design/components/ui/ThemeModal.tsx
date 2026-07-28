import { useState, useEffect, useRef, useCallback } from 'react';
import { Settings2, X, Play } from 'lucide-react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { getParsedMetadata, normalizeFeatureSymbolData, getObjectTypeForIcon } from '@TOOL/utils/featureUtils';
import { confirmUserAction } from '@TOOL/utils/userConfirmation';
import { Button } from '@DESIGN/components/ui/Button';

interface ThemeModalProps {
  groupId: string;
  groupName: string;
  onClose: () => void;
  targetFeatureIds?: string[];
}

/**
 * Symbol palette offered to the user. These are data values written into feature
 * metadata (`metadata.color`) and rendered on the map canvas, so they are NOT theme
 * chrome and must stay literal hexes — see MASTER.md §2.
 */
const PRESET_COLORS = [
  '#EF4444', // Red
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#6366F1', // Indigo
  '#14B8A6', // Teal
  '#F43F5E', // Rose
  '#64748B', // Slate
  '#000000', // Black
  '#FFFFFF', // White
] as const;

export function ThemeModal({ groupId, groupName, onClose, targetFeatureIds }: ThemeModalProps) {
  const state = useDesignSync(s => s.state);
  const selectedFeatureId = useDesignSync(s => s.selectedFeatureId);
  const dispatchEvents = useDesignSync(s => s.dispatchEvents);
  const setGroupThemePreview = useDesignSync(s => s.setGroupThemePreview);
  const [iconType, setIconType] = useState('default');
  const [color, setColor] = useState('#3B82F6');
  const [size, setSize] = useState<number>(32);
  const [isApplying, setIsApplying] = useState(false);
  const loadedRef = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const hasExplicitTargets = !!targetFeatureIds?.length;

  const asString = (value: unknown) => (typeof value === 'string' ? value : '');
  const asNumber = (value: unknown, fallback: number) =>
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) || fallback : fallback;

  // Initial load: Only load once per groupId
  useEffect(() => {
    loadedRef.current = false;
  }, [groupId, targetFeatureIds]);

  useEffect(() => {
    if (loadedRef.current || !state) return;

    // 1. Prioritize currently selected feature if it is in this group
    if (selectedFeatureId) {
      const selectedFeature = state.features[selectedFeatureId];
      if (selectedFeature && (selectedFeature.group_id === groupId || targetFeatureIds?.includes(selectedFeatureId))) {
        const meta = getParsedMetadata(selectedFeature);
        if (meta.icon) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setIconType(asString(meta.icon) || iconType);
        }
        if (meta.color) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setColor(asString(meta.color) || color);
        }
        if (meta.size !== undefined && meta.size !== null) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setSize(asNumber(meta.size, size));
        }
        loadedRef.current = true;
        return;
      }
    }

    // 2. Fallback to Group's saved theme config
    if (!hasExplicitTargets && state.feature_groups[groupId]) {
      const group = state.feature_groups[groupId];
      try {
        const themeConfig = typeof group.metadata === 'string'
          ? (JSON.parse(group.metadata) as any).theme_config
          : (group.metadata as any)?.theme_config;

        if (themeConfig) {
          if (themeConfig.icon) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIconType(asString(themeConfig.icon) || iconType);
          }
          if (themeConfig.color) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setColor(asString(themeConfig.color) || color);
          }
          if (themeConfig.size !== undefined && themeConfig.size !== null) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSize(asNumber(themeConfig.size, size));
          }
          loadedRef.current = true;
        }
      } catch (e) {
        console.warn("Failed to parse group theme metadata", e);
      }
    }
  }, [groupId, state, selectedFeatureId, targetFeatureIds, hasExplicitTargets]);

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

  const handleCancel = useCallback(() => {
    setGroupThemePreview(null, null); // Immediate clear
    onClose();
  }, [setGroupThemePreview, onClose]);

  // Initial focus lands on the non-destructive action (MASTER.md §7). Mount-only:
  // re-running this would yank focus back to Cancel mid-interaction.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Escape closes the dialog.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleCancel();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleCancel]);

  const handleApply = async () => {
    if (!(await confirmUserAction('Xác nhận áp dụng biểu tượng và giao diện cho các đối tượng đã chọn?'))) return;
    if (!state) return;

    setIsApplying(true);

    try {
      const group = state.feature_groups[groupId];
      if (!group && !hasExplicitTargets) {
        console.error("Group not found:", groupId);
        alert("Group not found");
        setIsApplying(false);
        return;
      }

      const groupUpdateEvent = group ? (() => {
        const groupMeta = typeof group.metadata === 'string' ? JSON.parse(group.metadata || '{}') : (group.metadata || {});
        const updatedGroupMeta = {
          ...groupMeta,
          theme_config: {
            icon: iconType,
            color: color,
            size: size
          }
        };

        return {
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
      })() : null;

      // 2. Filter features: Only apply to direct features of this group,
      // AND skip any features that belong to a subgroup of type INTERSECTION
      const featuresInGroup = hasExplicitTargets ? targetFeatureIds!
        .map(id => state.features[id])
        .filter(Boolean) : Object.values(state.features).filter(f => {
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
          const isExplicitIcon = iconType && iconType !== 'default';
          const targetIcon = isExplicitIcon ? iconType : metadata.icon;

          const metaAny = metadata as Record<string, any>;
          const activeColor = color || (metadata.gis as any)?.color || metaAny.color;
          const activeSize = size; // Always use current modal slider size

          const draftMetadata = {
            ...metadata,
            icon: targetIcon,
            color: activeColor,
            size: activeSize,
            gis: {
              ...(metadata.gis || {}),
              color: activeColor,
              size: activeSize,
            }
          };

          // Override properties.icon and properties.iconKey if an explicit icon was picked in the modal
          const existingProps = f.properties && typeof f.properties === 'object' && !Array.isArray(f.properties)
            ? f.properties
            : {};
          
          const symbolInputProps = isExplicitIcon
            ? { ...existingProps, icon: iconType, iconKey: iconType, type: getObjectTypeForIcon(iconType as any) }
            : existingProps;

          const symbol = normalizeFeatureSymbolData(
            { ...f, properties: symbolInputProps, metadata: draftMetadata },
            group?.type,
            group?.name || groupName,
            draftMetadata
          );

          const finalIconKey = isExplicitIcon ? iconType : symbol.iconKey;
          const finalObjectType = isExplicitIcon ? getObjectTypeForIcon(iconType as any) : symbol.objectType;

          const newMetadata = {
            ...draftMetadata,
            icon: finalIconKey,
            type: finalObjectType,
          };

          return {
            type: 'FeatureUpdated',
            payload: {
              id: f.id,
              layer_id: f.layer_id,
              group_id: f.group_id,
              geom_type: f.geom_type,
              name: f.name || '',
              metadata: JSON.stringify(newMetadata),
              properties: {
                ...existingProps,
                icon: finalIconKey,
                iconKey: finalIconKey,
                type: finalObjectType,
                color: activeColor,
                size: activeSize,
              },
            }
          };
        });

      const allEvents = groupUpdateEvent ? [groupUpdateEvent, ...featureEvents] : featureEvents;

      if (allEvents.length > 0) {
        console.log(`[Theme] Applying theme to group "${groupName}" with ${featureEvents.length} features`);
        onClose();
        dispatchEvents(allEvents)
          .then(() => {
            console.log('[Theme] Theme applied successfully');
          })
          .catch((error) => {
            console.error('[Theme] Failed to apply theme:', error);
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

  return (
    <div className="fixed inset-0 z-cad-modal flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-theme-title"
        className="bg-cad-surface border border-cad-border rounded-lg shadow-2xl w-full max-w-sm overflow-hidden flex flex-col font-sans"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cad-border bg-cad-elevated">
          <div className="flex items-center gap-2">
            <Settings2 size={16} className="text-cad-accent" aria-hidden="true" />
            <h2 id="group-theme-title" className="text-sm font-bold text-cad-text-primary uppercase tracking-wider">Group Theme</h2>
            <span className="text-[10px] text-cad-text-muted bg-cad-bg px-2 py-0.5 rounded-full">{groupName}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={X}
            ariaLabel="Đóng"
            onClick={handleCancel}
          />
        </div>

        {/* Content */}
        <div className="p-4 space-y-5 text-sm text-cad-text-primary">

          <div className="space-y-2">
            <label htmlFor="group-theme-icon" className="block text-[11px] uppercase tracking-wider font-semibold text-cad-text-muted">Biểu tượng (Icon)</label>
            <div className="relative">
              <select
                id="group-theme-icon"
                value={iconType}
                onChange={e => setIconType(e.target.value)}
                className="w-full bg-cad-bg border border-cad-border rounded p-2 pl-9 text-cad-text-primary focus:border-cad-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cad-accent appearance-none transition-colors"
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
                {iconType === 'speed' && <div className="w-4 h-4 bg-current rounded-sm flex items-center justify-center text-[6px] text-black font-black">S</div>}
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
            <span className="block text-[11px] uppercase tracking-wider font-semibold text-cad-text-muted" id="group-theme-color-label">Màu sắc (Color)</span>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="group-theme-color-label">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Chọn màu ${c}`}
                  aria-pressed={color === c}
                  className={`w-6 h-6 rounded-full cursor-pointer border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cad-accent focus-visible:ring-offset-2 focus-visible:ring-offset-cad-surface ${color === c ? 'border-cad-text-primary scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="color"
                aria-label="Màu tùy chỉnh"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cad-accent"
              />
              <span className="font-mono text-xs text-cad-text-muted bg-cad-bg px-2 py-1 rounded">{color}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="group-theme-size" className="block text-[11px] uppercase tracking-wider font-semibold text-cad-text-muted">Kích thước (Size)</label>
            <div className="flex items-center gap-3">
              <input
                id="group-theme-size"
                type="range"
                min="1"
                max="100"
                step="1"
                value={size}
                onChange={e => setSize(parseInt(e.target.value))}
                aria-valuetext={`${size}px`}
                className="flex-1 accent-cad-accent cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cad-accent"
              />
              <span className="font-mono text-xs bg-cad-bg px-3 py-1 rounded border border-cad-border">{size}px</span>
            </div>
            <p className="text-[10px] text-cad-text-muted italic opacity-70">
              * Kích thước 1-10px phù hợp cho độ dày đường Polyline/Line.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-cad-border bg-cad-elevated flex justify-end gap-2">
          <Button
            ref={cancelRef}
            variant="ghost"
            size="md"
            onClick={handleCancel}
            disabled={isApplying}
          >
            Hủy
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleApply}
            disabled={isApplying}
            loading={isApplying}
            icon={isApplying ? undefined : Play}
          >
            {isApplying ? 'Đang áp dụng...' : 'Áp dụng'}
          </Button>
        </div>

      </div>
    </div>
  );
}

/**
 * Technical Specs Panel
 * Displays detailed technical specifications for selected features
 */

import React, { useMemo } from 'react';
import { Wrench, Ruler, Camera, MapPin, Eye, Zap } from 'lucide-react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { getParsedMetadata } from '@TOOL/utils/featureMetadata';
import { getFeatureDisplayInfo } from '@TOOL/utils/featureUtils';
import { cn } from '@TOOL/utils/cn';
import type { FeatureMetadata } from '@CONTRACT/types';

interface TechnicalSpecsPanelProps {
  className?: string;
}

interface SpecField {
  label: string;
  value: string | number | undefined;
  icon?: React.ReactNode;
  unit?: string;
}

const toSpecValue = (value: unknown): string | number | undefined => {
  if (typeof value === 'string' || typeof value === 'number') return value;
  return undefined;
};

export const TechnicalSpecsPanel: React.FC<TechnicalSpecsPanelProps> = ({ className }) => {
  const { state, selectedFeatureId } = useDesignSync();

  const selectedFeature = useMemo(() => {
    if (!selectedFeatureId || !state) return null;
    return state.features[selectedFeatureId] || null;
  }, [selectedFeatureId, state]);

  const selectedGroup = useMemo(() => {
    if (!selectedFeature?.group_id || !state) return null;
    return state.feature_groups[selectedFeature.group_id] || null;
  }, [selectedFeature, state]);

  const specs = useMemo<SpecField[]>(() => {
    if (!selectedFeature) return [];

    const metadata = getParsedMetadata(selectedFeature) as FeatureMetadata;
    const displayInfo = getFeatureDisplayInfo(selectedFeature, selectedGroup?.type, selectedGroup?.name, metadata);
    const fields: SpecField[] = [];

    // Basic Info
    fields.push({
      label: 'Tên đối tượng',
      value: selectedFeature.name,
      icon: <MapPin size={14} />
    });

    fields.push({
      label: 'Mã hiệu (STT)',
      value: toSpecValue(metadata.display_order ?? metadata.stt) ?? 'N/A',
      icon: <Wrench size={14} />
    });

    fields.push({
      label: 'Loại đối tượng',
      value: displayInfo.label,
      icon: <Ruler size={14} />
    });

    // GIS Specs
    if (metadata.gis) {
      if (metadata.gis.vn2000_x && metadata.gis.vn2000_y) {
        fields.push({
          label: 'Tọa độ VN-2000',
          value: `X: ${metadata.gis.vn2000_x.toFixed(2)}, Y: ${metadata.gis.vn2000_y.toFixed(2)}`,
          icon: <MapPin size={14} />
        });
      }

      if (metadata.gis.rotation !== undefined) {
        fields.push({
          label: 'Góc xoay',
          value: metadata.gis.rotation,
          unit: '°',
          icon: <Ruler size={14} />
        });
      }

      if (metadata.gis.fov_angle !== undefined) {
        fields.push({
          label: 'Góc nhìn (FOV)',
          value: metadata.gis.fov_angle,
          unit: '°',
          icon: <Eye size={14} />
        });
      }

      if (metadata.gis.fov_radius !== undefined) {
        fields.push({
          label: 'Bán kính FOV',
          value: metadata.gis.fov_radius,
          unit: 'm',
          icon: <Eye size={14} />
        });
      }

      if (metadata.gis.lengthKm !== undefined) {
        fields.push({
          label: 'Chiều dài',
          value: (metadata.gis.lengthKm * 1000).toFixed(2),
          unit: 'm',
          icon: <Ruler size={14} />
        });
      }
    }

    // Camera Specs
    if (metadata.specs) {
      if (metadata.specs.focal_length !== undefined) {
        fields.push({
          label: 'Tiêu cự',
          value: metadata.specs.focal_length,
          unit: 'mm',
          icon: <Camera size={14} />
        });
      }

      if (metadata.specs.install_height !== undefined) {
        fields.push({
          label: 'Chiều cao lắp đặt',
          value: metadata.specs.install_height,
          unit: 'm',
          icon: <Ruler size={14} />
        });
      }

      if (metadata.specs.sensor_size) {
        fields.push({
          label: 'Kích thước cảm biến',
          value: metadata.specs.sensor_size,
          icon: <Camera size={14} />
        });
      }

      if (metadata.specs.resolution_x && metadata.specs.resolution_y) {
        fields.push({
          label: 'Độ phân giải',
          value: `${metadata.specs.resolution_x} x ${metadata.specs.resolution_y}`,
          icon: <Camera size={14} />
        });
      }

      if (metadata.specs.target_distance !== undefined) {
        fields.push({
          label: 'Khoảng cách mục tiêu',
          value: metadata.specs.target_distance,
          unit: 'm',
          icon: <MapPin size={14} />
        });
      }

      if (metadata.specs.target_height !== undefined) {
        fields.push({
          label: 'Chiều cao mục tiêu',
          value: metadata.specs.target_height,
          unit: 'm',
          icon: <MapPin size={14} />
        });
      }
    }

    // Infrastructure Specs
    if (metadata.infrastructure) {
      if (metadata.infrastructure.type) {
        fields.push({
          label: 'Loại hạ tầng',
          value: metadata.infrastructure.type,
          icon: <Zap size={14} />
        });
      }

      if (metadata.infrastructure.voltage) {
        fields.push({
          label: 'Điện áp',
          value: metadata.infrastructure.voltage,
          icon: <Zap size={14} />
        });
      }

      if (metadata.infrastructure.cable_type) {
        fields.push({
          label: 'Loại cáp',
          value: metadata.infrastructure.cable_type,
          icon: <Zap size={14} />
        });
      }

      if (metadata.infrastructure.core_count) {
        fields.push({
          label: 'Số lõi',
          value: metadata.infrastructure.core_count,
          icon: <Zap size={14} />
        });
      }

      if (metadata.infrastructure.depth !== undefined) {
        fields.push({
          label: 'Độ sâu',
          value: metadata.infrastructure.depth,
          unit: 'm',
          icon: <Ruler size={14} />
        });
      }
    }

    // Business Info
    if (metadata.business) {
      if (metadata.business.contractor) {
        fields.push({
          label: 'Nhà thầu',
          value: metadata.business.contractor,
          icon: <Wrench size={14} />
        });
      }

      if (metadata.business.phoneNumber) {
        fields.push({
          label: 'Số điện thoại',
          value: metadata.business.phoneNumber,
          icon: <Wrench size={14} />
        });
      }
    }

    // Custom fields (not in predefined categories)
    const systemKeys = ['gis', 'specs', 'infrastructure', 'business', 'media', 'ai', 'description', 'status', 'display_order', 'stt', 'type', 'icon', 'color', 'size'];
    Object.entries(metadata).forEach(([key, value]) => {
      if (!systemKeys.includes(key) && value !== undefined && value !== null && value !== '') {
        if (typeof value !== 'object') {
          fields.push({
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            value: String(value),
            icon: <Wrench size={14} />
          });
        }
      }
    });

    return fields;
  }, [selectedFeature, selectedGroup]);

  if (!selectedFeature) {
    return (
      <div className={cn('flex items-center justify-center h-full text-cad-text-muted text-xs', className)}>
        <div className="text-center">
          <Wrench size={32} className="mx-auto mb-2 opacity-30" />
          <div>Chọn đối tượng để xem thông số kỹ thuật</div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full bg-cad-surface', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-cad-border bg-cad-elevated">
        <h3 className="text-xs font-black text-cad-text-primary uppercase tracking-widest">
          Thông số kỹ thuật
        </h3>
        <p className="text-[10px] text-cad-text-muted mt-1 truncate">
          {selectedFeature.name}
        </p>
      </div>

      {/* Specs List */}
      <div className="flex-1 overflow-auto custom-scrollbar p-4">
        <div className="space-y-2">
          {specs.map((spec, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3 bg-cad-elevated rounded-lg border border-cad-border/50 hover:border-cad-accent/30 transition-colors"
            >
              <div className="p-1.5 bg-cad-accent/10 rounded text-cad-accent shrink-0 mt-0.5">
                {spec.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-cad-text-muted uppercase tracking-wider mb-1">
                  {spec.label}
                </div>
                <div className="text-xs font-bold text-cad-text-primary break-words">
                  {spec.value}
                  {spec.unit && (
                    <span className="text-cad-text-muted ml-1 font-normal">{spec.unit}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {specs.length === 0 && (
          <div className="text-center py-8 text-cad-text-muted text-xs">
            Không có thông số kỹ thuật
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="px-4 py-2 border-t border-cad-border bg-cad-elevated">
        <div className="flex items-center justify-between text-[10px] text-cad-text-muted">
          <span>Tổng số trường:</span>
          <span className="font-black text-cad-accent">{specs.length}</span>
        </div>
      </div>
    </div>
  );
};

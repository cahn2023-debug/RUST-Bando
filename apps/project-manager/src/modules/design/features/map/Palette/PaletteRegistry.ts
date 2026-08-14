import type { ComponentType } from 'react';
import { lazyWithRetry } from '@SHARED/utils/lazyWithRetry';

export interface PaletteDefinition {
    id: string;
    component: ComponentType<any>;
}

const registry: Record<string, PaletteDefinition> = {};

export const PaletteRegistry = {
    register: (id: string, component: ComponentType<any>) => {
        registry[id] = { id, component };
    },
    getComponent: (id: string) => {
        return registry[id]?.component || null;
    }
};

// Default registration
import { PropertyPanel } from "@DESIGN/components/core/PropertyPanel";
PaletteRegistry.register('spec-panel', PropertyPanel);

// Lazy registrations
const DeviceConfigPanel = lazyWithRetry(() => import('@DESIGN/features/map/Palette/DeviceConfigPanel').then(m => ({ default: m.DeviceConfigPanel })), { moduleName: 'DeviceConfigPanel' });
const CameraViewPanel = lazyWithRetry(() => import('@DESIGN/features/map/Palette/CameraViewPanel').then(m => ({ default: m.CameraViewPanel })), { moduleName: 'CameraViewPanel' });
const SystemConfigPanel = lazyWithRetry(() => import('@DESIGN/features/map/Palette/SystemConfigPanel').then(m => ({ default: m.SystemConfigPanel })), { moduleName: 'SystemConfigPanel' });
const BoxSummary = lazyWithRetry(() => import('@DESIGN/features/map/MapLayerComponents/BoxSummary').then(m => ({ default: m.BoxSummary })), { moduleName: 'BoxSummary' });
const NetworkGraphPanel = lazyWithRetry(() => import('@DESIGN/features/map/Palette/NetworkGraphPanel').then(m => ({ default: m.NetworkGraphPanel })), { moduleName: 'NetworkGraphPanel' });

PaletteRegistry.register('device-config', DeviceConfigPanel);
PaletteRegistry.register('camera-view', CameraViewPanel);
PaletteRegistry.register('system-config', SystemConfigPanel);
PaletteRegistry.register('summary-panel', BoxSummary);
PaletteRegistry.register('network-graph', NetworkGraphPanel);

const AiAssistantPanel = lazyWithRetry(() => import('@DESIGN/features/map/Palette/AiAssistantPanel').then(m => ({ default: m.AiAssistantPanel })), { moduleName: 'AiAssistantPanel' });
PaletteRegistry.register('ai-assistant', AiAssistantPanel);

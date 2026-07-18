import { lazy } from 'react';

export interface PaletteDefinition {
    id: string;
    component: React.ComponentType<any>;
}

const registry: Record<string, PaletteDefinition> = {};

export const PaletteRegistry = {
    register: (id: string, component: React.ComponentType<any>) => {
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
const DeviceConfigPanel = lazy(() => import('@DESIGN/features/map/Palette/DeviceConfigPanel').then(m => ({ default: m.DeviceConfigPanel })));
const CameraViewPanel = lazy(() => import('@DESIGN/features/map/Palette/CameraViewPanel').then(m => ({ default: m.CameraViewPanel })));
const SystemConfigPanel = lazy(() => import('@DESIGN/features/map/Palette/SystemConfigPanel').then(m => ({ default: m.SystemConfigPanel })));
const BoxSummary = lazy(() => import('@DESIGN/features/map/MapLayerComponents/BoxSummary').then(m => ({ default: m.BoxSummary })));
const NetworkGraphPanel = lazy(() => import('@DESIGN/features/map/Palette/NetworkGraphPanel').then(m => ({ default: m.NetworkGraphPanel })));

PaletteRegistry.register('device-config', DeviceConfigPanel);
PaletteRegistry.register('camera-view', CameraViewPanel);
PaletteRegistry.register('system-config', SystemConfigPanel);
PaletteRegistry.register('summary-panel', BoxSummary);
PaletteRegistry.register('network-graph', NetworkGraphPanel);

const AiAssistantPanel = lazy(() => import('@DESIGN/features/map/Palette/AiAssistantPanel').then(m => ({ default: m.AiAssistantPanel })));
PaletteRegistry.register('ai-assistant', AiAssistantPanel);

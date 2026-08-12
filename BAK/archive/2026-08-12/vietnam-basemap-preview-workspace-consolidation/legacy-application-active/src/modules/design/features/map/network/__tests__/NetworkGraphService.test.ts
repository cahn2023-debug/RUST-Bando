import { describe, it, expect } from 'vitest';
import { NetworkGraphService } from '../NetworkGraphService';
import type { FeatureState } from '@CONTRACT/types';

describe('NetworkGraphService', () => {
    it('should build graph and evaluate correctly with cabinets', () => {
        const featuresById: Record<string, FeatureState> = {
            'cabinet-1': {
                id: 'cabinet-1',
                layer_id: 'cab_layer',
                group_id: null,
                name: 'Cabinet 1',
                properties: {},
                geom_type: 'Point',
                coordinates: [0, 0],
                metadata: {
                    network: { role: 'cabinet', telemetry_id: 'cab1' }
                }
            },
            'intersection-1': {
                id: 'intersection-1',
                layer_id: 'int_layer',
                group_id: null,
                name: 'Intersection 1',
                properties: {},
                geom_type: 'Point',
                coordinates: [0, 0],
                metadata: {
                    network: { role: 'intersection', telemetry_id: 'int1' }
                }
            },
            'line-1': {
                id: 'line-1',
                layer_id: 'line_layer',
                group_id: null,
                name: 'Line 1',
                properties: {},
                geom_type: 'LineString',
                coordinates: [],
                metadata: {
                    infrastructure: { type: 'SignalLine' },
                    network: { from_feature_id: 'cabinet-1', to_feature_id: 'intersection-1' }
                }
            }
        };

        const result = NetworkGraphService.evaluate(featuresById, {
            nodes: {
                'cab1': 'online',
                'int1': 'online'
            },
            edges: {
                'line-1': 'online' // actually the edge uses feature.id if telemetryId is not set, but getEntityStatus checks both
            }
        });

        expect(result.nodes).toHaveLength(2);
        expect(result.edges).toHaveLength(1);
        expect(result.nodeStates['cabinet-1'].status).toBe('online');
        expect(result.nodeStates['intersection-1'].status).toBe('online');
    });
    
    it('should handle offline upstream effectively', () => {
        const featuresById: Record<string, FeatureState> = {
            'cabinet-1': {
                id: 'cabinet-1',
                layer_id: 'cab_layer',
                group_id: null,
                name: 'Cabinet 1',
                properties: {},
                geom_type: 'Point',
                coordinates: [0, 0],
                metadata: JSON.stringify({
                    network: { role: 'cabinet', telemetry_id: 'cab1' }
                })
            },
            'intersection-1': {
                id: 'intersection-1',
                layer_id: 'int_layer',
                group_id: null,
                name: 'Intersection 1',
                properties: {},
                geom_type: 'Point',
                coordinates: [0, 0],
                metadata: JSON.stringify({
                    network: { role: 'intersection', telemetry_id: 'int1' }
                })
            },
            'line-1': {
                id: 'line-1',
                layer_id: 'line_layer',
                group_id: null,
                name: 'Line 1',
                properties: {},
                geom_type: 'LineString',
                coordinates: [],
                metadata: JSON.stringify({
                    infrastructure: { type: 'SignalLine' },
                    network: { from_feature_id: 'cabinet-1', to_feature_id: 'intersection-1' }
                })
            }
        };

        const result = NetworkGraphService.evaluate(featuresById, {
            nodes: {
                'cab1': 'offline', // Cabinet is offline
                'int1': 'online'
            },
            edges: {} // edges default to unknown which is not online
        });

        // Cabinet is direct-offline
        expect(result.nodeStates['cabinet-1'].status).toBe('direct-offline');
        
        // Intersection is online but upstream cabinet is offline, so it has no active path to any *online* cabinet.
        // Therefore it should be upstream-offline.
        expect(result.nodeStates['intersection-1'].status).toBe('upstream-offline');
    });
    
    it('should use an intersection as source if no cabinet exists', () => {
        const featuresById: Record<string, FeatureState> = {
            'intersection-1': {
                id: 'intersection-1',
                layer_id: 'int_layer',
                group_id: null,
                name: 'Intersection 1',
                properties: {},
                geom_type: 'Point',
                coordinates: [0, 0],
                metadata: {
                    network: { role: 'intersection', telemetry_id: 'int1' }
                }
            }
        };

        const result = NetworkGraphService.evaluate(featuresById, {
            nodes: { 'int1': 'online' }
        });

        expect(result.diagnostics).toEqual([]);
        expect(result.nodeStates['intersection-1'].status).toBe('online');
    });
});

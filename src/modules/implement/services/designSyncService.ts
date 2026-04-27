import { MapState } from '@CONTRACT/types';
import { DesignEventType } from '@CONTRACT/designTypes';
import { calculateFeatureNumbers, getParsedMetadata } from '@TOOL/utils/featureUtils';

/**
 * DesignSyncService - Decoupled Business Logic for Design Data
 * 
 * V2 Strategy: Tách logic tính toán nghiệp vụ (STT, Deduplicate) 
 * ra khỏi Zustand Store để giúp Store mỏng hơn và dễ test hơn.
 */
export class DesignSyncService {
    /**
     * Logic tính toán lại số thứ tự (display_order) dựa trên topology hiện tại.
     * Trả về danh sách các sự kiện cần dispatch.
     */
    static calculateSTTUpdateEvents(state: MapState): DesignEventType[] {
        if (!state.features) return [];

        const features = Object.values(state.features);
        const featureNumbers = calculateFeatureNumbers(features, state.features);
        const updateEvents: DesignEventType[] = [];

        features.forEach(f => {
            const calculatedSTT = featureNumbers[f.id];
            if (!calculatedSTT) return;

            const meta = getParsedMetadata(f);
            const currentOrder = String(meta.display_order || '');

            if (currentOrder !== String(calculatedSTT)) {
                updateEvents.push({
                    type: 'FeatureUpdated',
                    payload: {
                        id: f.id,
                        metadata: JSON.stringify({ ...meta, display_order: String(calculatedSTT) })
                    }
                });
            }
        });

        return updateEvents;
    }
}

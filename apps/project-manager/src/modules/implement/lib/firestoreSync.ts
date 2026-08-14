// DEPRECATED: Firestore database sync removed in v1.2 (Local-First Architecture)
import { MapState, FeatureState } from '@CONTRACT/types';

export const pushStateToFirestore = async (_projectId: number, _state: MapState) => {
  await Promise.resolve();
};

export const pushFeaturesToFirestore = async (_projectId: number, _features: Record<string, FeatureState>) => {
  await Promise.resolve();
};

export const subscribeToProjectState = (
  _projectId: number,
  _onStateChange: (state: MapState, hasPendingWrites: boolean) => void,
  _onLegacyDetected?: () => void
) => {
  return () => { };
};

export const deleteFeatureFromFirestore = async (_projectId: number, _featureId: string) => {
  await Promise.resolve();
};

export const deleteFeaturesFromFirestoreBatch = async (_projectId: number, _featureIds: string[]) => {
  await Promise.resolve();
};

export const forceGlobalCleanup = async (_projectId: number, _localState: MapState) => {
  await Promise.resolve();
  return 0;
};

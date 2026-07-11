// Firestore database sync has been disabled as per standardization plan.
// Firebase is now only used for Authentication.

import { MapState, FeatureState } from '@CONTRACT/types';

export const pushStateToFirestore = async (_projectId: number, _state: MapState) => {
  // CLOUD SYNC DISABLED
};

export const pushFeaturesToFirestore = async (_projectId: number, _features: Record<string, FeatureState>) => {
  // CLOUD SYNC DISABLED
};

export const subscribeToProjectState = (
  _projectId: number,
  _onStateChange: (state: MapState, hasPendingWrites: boolean) => void,
  _onLegacyDetected?: () => void
) => {
  // NO SUBSCRIPTION
  return () => { };
};

export const deleteFeatureFromFirestore = async (_projectId: number, _featureId: string) => {
  // CLOUD SYNC DISABLED
};

export const deleteFeaturesFromFirestoreBatch = async (_projectId: number, _featureIds: string[]) => {
  // CLOUD SYNC DISABLED
};

export const forceGlobalCleanup = async (_projectId: number, _localState: MapState) => {
  // CLOUD SYNC DISABLED
  return 0;
};

import { invoke } from '@tauri-apps/api/core';
import { GisValidationReport, SpatialMeasurements } from '../postgis';

export const gisApi = {
  isValid: async (ewkt: string): Promise<GisValidationReport> => {
    return invoke<GisValidationReport>('st_is_valid', { ewkt });
  },

  makeValid: async (ewkt: string): Promise<string> => {
    return invoke<string>('st_make_valid', { ewkt });
  },

  transform: async (ewkt: string, fromSrid: number, toSrid: number): Promise<string> => {
    return invoke<string>('st_transform', { ewkt, fromSrid, toSrid });
  },

  measureFeature: async (ewkt: string): Promise<SpatialMeasurements> => {
    return invoke<SpatialMeasurements>('st_measure_feature', { ewkt });
  },

  spatialRelate: async (ewktA: string, ewktB: string, predicate: string): Promise<boolean> => {
    return invoke<boolean>('st_spatial_relate', { ewktA, ewktB, predicate });
  },
};

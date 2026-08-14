/**
 * Public Domain Contracts (Version 1.2)
 * Primary public interfaces for cross-domain communication in RUST CAD & GIS Network.
 * Direct deep-imports into domain private internals are forbidden by architecture rules.
 */

export type { Project, MapState, FeatureState } from '../modules/contract/types';

export interface TelemetryConfig {
  optIn: boolean;
  sanitized: boolean;
  appVersion: string;
  osVersion: string;
}

export interface LicenseStatus {
  isValid: boolean;
  hardwareId: string;
  edition: string;
  licenseKey?: string;
}

export interface PackageHeader {
  formatVersion: string;
  productVersion: string;
  projectId: string;
  projectName: string;
  featureCount: number;
  attachmentCount: number;
  checksum: string;
}

/**
 * mapIconManifest.ts — Nguồn icon DUY NHẤT cho Marker + Layer Tree + BOM Summary
 * Tuân thủ quy chuẩn DESIGN_SYSTEM_CHUAN_HOA_HOAN_THIEN.md Section 5
 */

export interface MapIconConfig {
  name: string;
  icon: string;
  color: string;
  isCustom?: boolean;
}

export const MAP_ICON_MANIFEST: Record<string, MapIconConfig> = {
  pole: {
    name: "Cột điện (Pole)",
    icon: "UtilityPole",
    color: "var(--cad-obj-pole)",
    isCustom: false,
  },
  cabinet: {
    name: "Tủ cáp (Cabinet)",
    icon: "CabinetIcon",
    color: "var(--cad-obj-cabinet)",
    isCustom: true,
  },
  splice: {
    name: "Măng xông (Splice Closure)",
    icon: "SpliceIcon",
    color: "var(--cad-obj-splice)",
    isCustom: true,
  },
  odf: {
    name: "ODF (Optical Distribution Frame)",
    icon: "Server",
    color: "var(--cad-obj-odf)",
    isCustom: false,
  },
  splitter: {
    name: "Splitter (Bộ chia quang)",
    icon: "Split",
    color: "var(--cad-obj-splitter)",
    isCustom: false,
  },
  camera: {
    name: "Camera CCTV",
    icon: "Camera",
    color: "var(--cad-obj-camera)",
    isCustom: false,
  },
  node: {
    name: "Node giao cắt chung",
    icon: "CircleDot",
    color: "var(--cad-obj-node)",
    isCustom: false,
  },
} as const;

export type MapFeatureType = keyof typeof MAP_ICON_MANIFEST;

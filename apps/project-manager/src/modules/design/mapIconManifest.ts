import type { IconType } from '@CONTRACT/types';

/**
 * mapIconManifest.ts — Nguồn icon DUY NHẤT cho Marker + Layer Tree + BOM Summary
 * Tuân thủ quy chuẩn DESIGN_SYSTEM_CHUAN_HOA_HOAN_THIEN.md Section 5
 */

export interface MapIconConfig {
  name: string;
  label?: string;
  icon: string;
  color: string;
  isCustom?: boolean;
  iconKey?: IconType;
  objectType?: string;
  aliases?: readonly string[];
  length_m?: number;
  width_m?: number;
  height_m?: number;
}

export const MAP_ICON_MANIFEST: Record<string, MapIconConfig> = {
  default: {
    name: "Mặc định",
    label: "Mặc định",
    icon: "MapPin",
    color: "var(--cad-obj-node)",
    iconKey: "default",
    objectType: "point",
    aliases: ["default", "point"],
    isCustom: false,
  },
  point_circle: {
    name: "Điểm",
    label: "Điểm",
    icon: "Circle",
    color: "var(--cad-obj-node)",
    iconKey: "point_circle",
    objectType: "point",
    aliases: ["point_circle", "circle"],
    isCustom: false,
  },
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
  info_cabinet: {
    name: "Tủ thông tin (1.2m x 0.6m)",
    label: "Tủ thông tin (1.2x0.6m)",
    icon: "InfoCabinetIcon",
    color: "#eab308",
    iconKey: "info_cabinet",
    objectType: "info_cabinet",
    aliases: ["info_cabinet"],
    isCustom: true,
    length_m: 1.2,
    width_m: 0.6,
    height_m: 1.5,
  },
  light_cabinet: {
    name: "Tủ đèn (1.0m x 0.5m)",
    label: "Tủ đèn (1.0x0.5m)",
    icon: "LightCabinetIcon",
    color: "#f97316",
    iconKey: "light_cabinet",
    objectType: "light_cabinet",
    aliases: ["light_cabinet"],
    isCustom: true,
    length_m: 1.0,
    width_m: 0.5,
    height_m: 1.2,
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
    label: "CCTV",
    icon: "Camera",
    color: "var(--cad-obj-camera)",
    iconKey: "cctv",
    objectType: "cctv",
    aliases: ["camera", "cctv"],
    isCustom: false,
  },
  cctv: {
    name: "Camera CCTV",
    label: "CCTV",
    icon: "Camera",
    color: "var(--cad-obj-camera)",
    iconKey: "cctv",
    objectType: "cctv",
    aliases: ["cctv", "camera"],
    isCustom: false,
  },
  ptz: {
    name: "Camera PTZ",
    label: "PTZ",
    icon: "Video",
    color: "var(--cad-obj-camera)",
    iconKey: "ptz",
    objectType: "ptz",
    aliases: ["ptz"],
    isCustom: false,
  },
  speed: {
    name: "Camera Tốc Độ",
    label: "SPEED",
    icon: "Monitor",
    color: "var(--cad-obj-camera)",
    iconKey: "speed",
    objectType: "speed",
    aliases: ["speed"],
    isCustom: false,
  },
  lpr: {
    name: "Camera Biển Số (LPR)",
    label: "LPR",
    icon: "Info",
    color: "var(--cad-obj-camera)",
    iconKey: "lpr",
    objectType: "lpr",
    aliases: ["lpr"],
    isCustom: false,
  },
  intersection: {
    name: "Nút Giao Cắt",
    label: "Nút giao",
    icon: "Intersection",
    color: "var(--cad-obj-node)",
    iconKey: "intersection",
    objectType: "intersection",
    aliases: ["intersection", "nut_giao", "nút giao"],
    isCustom: false,
  },
  point: {
    name: "Điểm Khảo Sát",
    icon: "CircleDot",
    color: "var(--cad-obj-node)",
    isCustom: false,
  },
  node: {
    name: "Node giao cắt chung",
    icon: "CircleDot",
    color: "var(--cad-obj-node)",
    isCustom: false,
  },
} as const;

export const getMapIconConfigForIcon = (iconKey: IconType): MapIconConfig | undefined => (
  Object.values(MAP_ICON_MANIFEST).find((entry) => entry.iconKey === iconKey)
);

export type MapFeatureType = keyof typeof MAP_ICON_MANIFEST;

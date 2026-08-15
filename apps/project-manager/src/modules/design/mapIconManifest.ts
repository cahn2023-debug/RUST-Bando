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
    color: "#6366f1",
    iconKey: "default",
    objectType: "point",
    aliases: ["default", "point", "diem", "điểm", "diem_khao_sat", "survey_point"],
    isCustom: false,
  },
  point_circle: {
    name: "Điểm tròn",
    label: "Điểm",
    icon: "Circle",
    color: "#6366f1",
    iconKey: "point_circle",
    objectType: "point",
    aliases: ["point_circle", "circle", "tron"],
    isCustom: false,
  },
  pole: {
    name: "Cột điện (Pole)",
    label: "Cột điện",
    icon: "UtilityPole",
    color: "#94a3b8",
    iconKey: "default",
    objectType: "pole",
    aliases: ["pole", "cot_dien", "cột điện", "tru_dien", "pillar"],
    isCustom: false,
  },
  cabinet: {
    name: "Tủ cáp (Cabinet)",
    label: "Tủ cáp",
    icon: "CabinetIcon",
    color: "#3b82f6",
    iconKey: "info_cabinet",
    objectType: "cabinet",
    aliases: ["cabinet", "tu_cap", "tủ cáp", "tu_thiet_bi"],
    isCustom: true,
  },
  info_cabinet: {
    name: "Tủ thông tin (1.2m x 0.6m)",
    label: "Tủ thông tin (1.2x0.6m)",
    icon: "InfoCabinetIcon",
    color: "#eab308",
    iconKey: "info_cabinet",
    objectType: "info_cabinet",
    aliases: ["info_cabinet", "tu_thong_tin", "tủ thông tin"],
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
    aliases: ["light_cabinet", "tu_den", "tủ đèn"],
    isCustom: true,
    length_m: 1.0,
    width_m: 0.5,
    height_m: 1.2,
  },
  splice: {
    name: "Măng xông (Splice Closure)",
    label: "Măng xông",
    icon: "SpliceIcon",
    color: "#10b981",
    iconKey: "default",
    objectType: "splice",
    aliases: ["splice", "mang_xong", "măng xông", "closure"],
    isCustom: true,
  },
  odf: {
    name: "ODF (Optical Distribution Frame)",
    label: "ODF",
    icon: "Server",
    color: "#8b5cf6",
    iconKey: "default",
    objectType: "odf",
    aliases: ["odf", "khung_phan_phoi_quang"],
    isCustom: false,
  },
  splitter: {
    name: "Splitter (Bộ chia quang)",
    label: "Bộ chia quang",
    icon: "Split",
    color: "#ec4899",
    iconKey: "default",
    objectType: "splitter",
    aliases: ["splitter", "bo_chia_quang"],
    isCustom: false,
  },
  camera: {
    name: "Camera CCTV",
    label: "CCTV",
    icon: "Camera",
    color: "#3b82f6",
    iconKey: "cctv",
    objectType: "cctv",
    aliases: ["camera", "cctv", "mat_cam", "mắt cam", "cam", "giam_sat"],
    isCustom: false,
  },
  cctv: {
    name: "Camera CCTV",
    label: "CCTV",
    icon: "Camera",
    color: "#3b82f6",
    iconKey: "cctv",
    objectType: "cctv",
    aliases: ["cctv", "camera"],
    isCustom: false,
  },
  ptz: {
    name: "Camera PTZ",
    label: "PTZ",
    icon: "Video",
    color: "#3b82f6",
    iconKey: "ptz",
    objectType: "ptz",
    aliases: ["ptz", "camera_ptz", "cam_ptz"],
    isCustom: false,
  },
  speed: {
    name: "Camera Tốc Độ",
    label: "SPEED",
    icon: "Monitor",
    color: "#3b82f6",
    iconKey: "speed",
    objectType: "speed",
    aliases: ["speed", "toc_do", "tốc độ", "camera_speed"],
    isCustom: false,
  },
  lpr: {
    name: "Camera Biển Số (LPR)",
    label: "LPR",
    icon: "Info",
    color: "#3b82f6",
    iconKey: "lpr",
    objectType: "lpr",
    aliases: ["lpr", "bien_so", "biển số", "anpr", "camera_lpr"],
    isCustom: false,
  },
  intersection: {
    name: "Nút Giao Cắt",
    label: "Nút giao",
    icon: "Intersection",
    color: "#6366f1",
    iconKey: "intersection",
    objectType: "intersection",
    aliases: ["intersection", "nut_giao", "nút giao", "nga_tu", "nga_ba"],
    isCustom: false,
  },
  point: {
    name: "Điểm Khảo Sát",
    label: "Điểm khảo sát",
    icon: "CircleDot",
    color: "#6366f1",
    iconKey: "default",
    objectType: "point",
    aliases: ["point", "diem", "điểm", "diem_khao_sat"],
    isCustom: false,
  },
  node: {
    name: "Node giao cắt chung",
    label: "Node",
    icon: "CircleDot",
    color: "#6366f1",
    iconKey: "default",
    objectType: "point",
    aliases: ["node", "nut"],
    isCustom: false,
  },
} as const;

export const getMapIconConfigForIcon = (iconKey: IconType): MapIconConfig | undefined => (
  Object.values(MAP_ICON_MANIFEST).find((entry) => entry.iconKey === iconKey)
);

export type MapFeatureType = keyof typeof MAP_ICON_MANIFEST;

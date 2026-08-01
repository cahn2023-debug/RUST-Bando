import { invoke } from "@tauri-apps/api/core";

export const RAW_BINARY_PATH_HEADER = "x-antinigaty-file-path-b64";

export const encodeRawBinaryFilePath = (path: string): string => {
  const bytes = new TextEncoder().encode(path);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

export const saveReportDocxFile = async (path: string, buffer: ArrayBuffer): Promise<void> => {
  await invoke("save_binary_file_raw", new Uint8Array(buffer), {
    headers: {
      [RAW_BINARY_PATH_HEADER]: encodeRawBinaryFilePath(path),
    },
  });
};

import { safeInvoke } from '@IMPLEMENT/lib/tauri';

export type BinaryFileData = Uint8Array | number[];
export type RawBinaryOptions = { headers: Record<string, string> };

export const fileApi = {
  saveBinary: (path: string, data: BinaryFileData) =>
    safeInvoke<void>('save_binary_file', { path, data }),

  readBinary: (path: string) =>
    safeInvoke<number[]>('read_binary_file', { path }),

  saveBinaryRaw: (data: BinaryFileData, options: RawBinaryOptions) =>
    safeInvoke<void>('save_binary_file_raw', data, options),
};

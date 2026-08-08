import * as tauriAdapter from '@IMPLEMENT/lib/tauri';

const getAdapterExport = <K extends keyof typeof tauriAdapter>(name: K) => {
  try {
    return tauriAdapter[name];
  } catch {
    return undefined;
  }
};

export const convertFileSrc = getAdapterExport('safeConvertFileSrc') ?? ((path: string) => path);
export const emit = getAdapterExport('safeEmit') ?? (() => Promise.resolve());
export const invoke = getAdapterExport('safeInvoke')!;
export const listen = getAdapterExport('safeListen') ?? (() => Promise.resolve(() => undefined));
export const open = getAdapterExport('safeOpenDialog') ?? (() => Promise.resolve(null));
export const save = getAdapterExport('safeSaveDialog') ?? (() => Promise.resolve(null));
export const createWebviewWindow = getAdapterExport('safeCreateWebviewWindow') ?? (() => null);
export const getCurrentWebviewWindow = getAdapterExport('safeGetCurrentWebviewWindow') ?? (() => null);
export const getCurrentWindow = getAdapterExport('safeGetCurrentWindow') ?? (() => null);
export const getWindowByLabel = getAdapterExport('safeGetWindowByLabel') ?? (() => Promise.resolve(null));

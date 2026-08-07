import { create } from 'zustand';
import { safeInvoke } from '@IMPLEMENT/lib/tauri';

interface SettingsState {
  enableAi: boolean;
  lowPowerMode: boolean;
  showFovTypes: string[];
  loading: boolean;

  setEnableAi: (enabled: boolean) => Promise<void>;
  setLowPowerMode: (enabled: boolean) => Promise<void>;
  setShowFovTypes: (types: string[]) => void;
  toggleFovType: (type: string) => void;
  loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  enableAi: false,
  lowPowerMode: false,
  showFovTypes: ['cctv', 'camera', 'ptz', 'speed', 'lpr'],
  loading: false,

  setEnableAi: async (enabled: boolean) => {
    try {
      const currentLowPower = get().lowPowerMode;
      await safeInvoke('update_app_config', {
        enableAi: enabled,
        lowPowerMode: currentLowPower
      });
      set({ enableAi: enabled });
    } catch (err) {
      console.error("Failed to update AI settings:", err);
    }
  },

  setLowPowerMode: async (enabled: boolean) => {
    try {
      const currentAi = get().enableAi;
      await safeInvoke('update_app_config', {
        enableAi: currentAi,
        lowPowerMode: enabled
      });
      set({ lowPowerMode: enabled });
    } catch (err) {
      console.error("Failed to update low power mode:", err);
    }
  },

  setShowFovTypes: (types) => set({ showFovTypes: types }),

  toggleFovType: (type) => {
    const current = get().showFovTypes;
    if (current.includes(type)) {
      set({ showFovTypes: current.filter(t => t !== type) });
    } else {
      set({ showFovTypes: [...current, type] });
    }
  },

  loadSettings: async () => {
    set({ loading: true });
    try {
      const config = await safeInvoke<any>('get_app_config');
      set({
        enableAi: !!config?.enable_ai,
        lowPowerMode: !!config?.low_power_mode,
        loading: false
      });
    } catch (err) {
      console.error("Failed to load settings:", err);
      set({ loading: false });
    }
  }
}));

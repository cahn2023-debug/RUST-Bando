import { safeInvoke as invoke } from '@IMPLEMENT/lib/tauri';

export interface AiStatus {
  isInitialized: boolean;
  activeModel?: string;
  availableModels: string[];
}

export interface AiConfig {
  provider: string;
  model: string;
  temperature: number;
}

export const aiApi = {
  getStatus: async (): Promise<AiStatus> => {
    return invoke<AiStatus>('get_ai_status');
  },

  getConfig: async (): Promise<AiConfig> => {
    return invoke<AiConfig>('get_ai_config');
  },

  updateConfig: async (config: Partial<AiConfig>): Promise<void> => {
    return invoke('update_ai_config', { config });
  },

  sendMessage: async (conversationId: string, message: string): Promise<string> => {
    return invoke<string>('send_ai_message', { conversationId, message });
  },

  cancelRequest: async (requestId: string): Promise<void> => {
    return invoke('cancel_ai_request', { requestId });
  },
};

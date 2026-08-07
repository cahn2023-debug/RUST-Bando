import { invoke } from '@tauri-apps/api/core';

export interface ProjectTreeItem {
  id: string;
  name: string;
  kind: 'region' | 'layer' | 'group' | 'feature';
  children?: ProjectTreeItem[];
}

export interface ActiveProjectState {
  id: string;
  name: string;
  path?: string;
  modifiedAt?: string;
}

export const projectApi = {
  createProject: async (name: string, path: string): Promise<string> => {
    return invoke<string>('create_pmp_v2', { name, path });
  },

  loadProject: async (path: string): Promise<ActiveProjectState> => {
    return invoke<ActiveProjectState>('load_pmp_file', { path });
  },

  getActiveProject: async (): Promise<ActiveProjectState | null> => {
    return invoke<ActiveProjectState | null>('get_active_project');
  },

  getProjectTree: async (projectId: string): Promise<ProjectTreeItem[]> => {
    return invoke<ProjectTreeItem[]>('get_project_tree', { projectId });
  },

  saveProject: async (projectId: string): Promise<void> => {
    return invoke('save_project', { projectId });
  },

  closeProject: async (projectId: string): Promise<void> => {
    return invoke('close_active_project', { projectId });
  },

  deleteProject: async (projectId: string): Promise<void> => {
    return invoke('delete_project', { projectId });
  },
};

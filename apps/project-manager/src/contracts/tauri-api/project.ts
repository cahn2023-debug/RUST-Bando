import { safeInvoke as invoke } from '@IMPLEMENT/lib/tauri';

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
  createProject: async (path: string, name: string, description?: string): Promise<ActiveProjectState> => {
    const payload: { path: string; name: string; description?: string } = { path, name };
    if (description !== undefined) payload.description = description;
    return invoke<ActiveProjectState>('create_pmp_v2', payload);
  },

  loadProject: async (path: string): Promise<ActiveProjectState> => {
    return invoke<ActiveProjectState>('load_pmp_file', { path });
  },

  getActiveProject: async (): Promise<ActiveProjectState | null> => {
    return invoke<ActiveProjectState | null>('get_active_project');
  },

  getProjectTree: async (projectId: string, path?: string): Promise<ProjectTreeItem[]> => {
    return invoke<ProjectTreeItem[]>(
      'get_project_tree',
      path === undefined ? { projectId } : { projectId, path }
    );
  },

  saveProject: async (): Promise<void> => {
    return invoke('save_project');
  },

  closeProject: async (): Promise<void> => {
    return invoke('close_active_project');
  },

  deleteProject: async (projectId: string): Promise<void> => {
    return invoke('delete_project', { id: projectId });
  },

  saveRecentProjects: async (projects: unknown[]): Promise<void> => {
    return invoke('save_recent_projects', { projects });
  },

  saveLastOpenedProject: async (project?: unknown, path?: string): Promise<void> => {
    const payload: { project?: unknown; path?: string } = {};
    if (project !== undefined) payload.project = project;
    if (path !== undefined) payload.path = path;
    return invoke('save_last_opened_project', payload);
  },

  indexFiles: async (projectId: string): Promise<unknown> => {
    return invoke('index_project_files', { projectId });
  },
};

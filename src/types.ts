export interface Project {
  id: number;
  name: string;
  path: string;
  description: string | null;
  status: 'active' | 'archived' | 'completed';
  created_at: string;
}

export interface Task {
  id: number;
  project_id: number;
  parent_id: number | null;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_completed: boolean;
  status: string;
  color: string | null;
  target_file_path?: string | null;
}

export interface Note {
  id: number;
  project_id: number;
  title: string;
  content: string | null;
  target_file_path: string | null;
  created_at: string;
}

export interface Contract {
  id: number;
  project_id: number;
  name: string;
  contract_number: string | null;
  vendor: string | null;
  value: number | null;
  signed_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  extension: string | null;
  children: FileNode[] | null;
}

export interface TaskDependency {
  id: number;
  from_task_id: number;
  to_task_id: number;
}

export interface SearchResult {
  file_path: string;
  title: string;
  snippet: string;
}

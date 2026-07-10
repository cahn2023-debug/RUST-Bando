import { useState, useEffect } from "react";
import { safeInvoke } from "@IMPLEMENT/lib/tauri";
import { Project, Task, Note, Contract, TaskDependency } from "@CONTRACT/types";
import { useSettingsStore } from "@IMPLEMENT/stores/useSettingsStore";
import { addDays } from "date-fns";
import { logger } from "@TOOL/utils/logger";

export function useProjectData(project: Project) {
  const projectId = project?.id ?? "";
  const hasValidProject = !!projectId;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);

  const loadTasks = async () => {
    if (!hasValidProject) {
      setTasks([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await safeInvoke<Task[]>("get_tasks", { projectId });
      setTasks(data);
    } catch (err) {
      logger.error("Failed to load tasks:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadNotes = async () => {
    if (!hasValidProject) {
      setNotes([]);
      return;
    }
    try {
      const data = await safeInvoke<Note[]>("get_notes", { projectId });
      setNotes(data);
    } catch (err) {
      logger.error("Failed to load notes:", err);
    }
  };

  const loadContracts = async () => {
    if (!hasValidProject) {
      setContracts([]);
      return;
    }
    try {
      const data = await safeInvoke<Contract[]>("get_contracts", { projectId });
      setContracts(data || []);
    } catch (err) {
      logger.error("Error loading contracts:", err);
      setContracts([]);
    }
  };

  const loadDependencies = async () => {
    if (!hasValidProject) {
      setDependencies([]);
      return;
    }
    try {
      const data = await safeInvoke<TaskDependency[]>("get_task_dependencies", { projectId });
      setDependencies(data);
    } catch (err) {
      logger.error("Error loading dependencies:", err);
    }
  };

  useEffect(() => {
    if (!hasValidProject) {
      setTasks([]);
      setNotes([]);
      setContracts([]);
      setDependencies([]);
      setLoading(false);
      return;
    }

    loadTasks();
    loadNotes();
    loadContracts();
    loadDependencies();

    // Trigger background indexing
    safeInvoke("index_project_files", { projectId }).catch((err: any) => {
      logger.warn("Background indexing failed:", err);
    });
  }, [projectId, hasValidProject]);

  const handleCreateTask = async (name: string) => {
    if (!name.trim()) return;
    try {
      let predictedDays = 1;
      const isAiEnabled = useSettingsStore.getState().enableAi;
      if (isAiEnabled) {
        try {
          predictedDays = await safeInvoke<number>("predict_task", { taskName: name });
        } catch (predictErr) {
          logger.warn("AI Prediction failed, using fallback:", predictErr);
        }
      }

      const start = new Date();
      const end = addDays(start, predictedDays);
      await safeInvoke("create_task", {
        projectId,
        parentId: null,
        name,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        color: "#6366f1",
        status: "todo"
      });
      loadTasks();
    } catch (err) {
      logger.error("Failed to create task:", err);
    }
  };

  const handleCreateGroup = async () => {
    try {
      await safeInvoke("create_task", {
        projectId,
        parentId: null,
        name: "New Group",
        startDate: null,
        endDate: null,
        color: "#1E1E1E",
        status: "folder"
      });
      loadTasks();
    } catch (err) {
      logger.error("Failed to create group:", err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Delete this task?")) return;
    try {
      setTasks(prev => prev.filter(t => t.id !== taskId));
      await safeInvoke("delete_task", { taskId });
      loadTasks();
    } catch (err) {
      logger.error("Failed to delete task:", err);
      loadTasks();
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, status: string) => {
    try {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
      await safeInvoke("update_task_status", { taskId, status });
    } catch (err) {
      logger.error("Failed to update status:", err);
      loadTasks();
    }
  };

  const handleUpdateDates = async (task: Task, start: string | null, end: string | null) => {
    try {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, start_date: start, end_date: end } : t));
      await safeInvoke("update_task_dates", {
        taskId: task.id,
        startDate: start,
        endDate: end
      });
    } catch (err) {
      logger.error("Failed to update dates:", err);
      loadTasks();
    }
  };

  return {
    tasks,
    loading,
    notes,
    contracts,
    dependencies,
    loadTasks,
    loadNotes,
    loadContracts,
    loadDependencies,
    handleCreateTask,
    handleCreateGroup,
    handleDeleteTask,
    handleUpdateTaskStatus,
    handleUpdateDates,
    handleCreateNote: async (title: string, content: string) => {
      try {
        await safeInvoke("create_note", {
          projectId,
          title,
          content
        });
        loadNotes();
      } catch (err) {
        logger.error("Failed to create note:", err);
      }
    },
    handleDeleteNote: async (noteId: string) => {
      try {
        await safeInvoke("delete_note", { noteId });
        loadNotes();
      } catch (err) {
        logger.error("Failed to delete note:", err);
      }
    },
    handleCreateContract: async (form: Partial<Contract>) => {
      try {
        await safeInvoke("create_contract", {
          projectId,
          name: form.name,
          contractNumber: form.contract_number,
          vendor: form.vendor,
          value: form.value,
          signedDate: form.signed_date,
          notes: form.notes,
          filePath: form.file_path
        });
        loadContracts();
      } catch (err) {
        logger.error("Failed to create contract:", err);
      }
    },
    handleDeleteContract: async (contractId: string) => {
      try {
        await safeInvoke("delete_contract", { contractId });
        loadContracts();
      } catch (err) {
        logger.error("Failed to delete contract:", err);
      }
    },
    setTasks,
    setNotes,
    setContracts
  };
}

import { useEffect, useRef, useState } from "react";
import { safeInvoke as invoke, safeOpenDialog } from "@IMPLEMENT/lib/tauri";
import { useSettingsStore } from "@IMPLEMENT/stores/useSettingsStore";
import { Project } from "@CONTRACT/types";
import { useTabStore } from "@IMPLEMENT/TabInProgram/useTabStore";

const normalizeProject = (project: Project | null | undefined): Project | null => {
    if (!project || !project.path) {
        return null;
    }

    return {
        ...project,
        id: String(project.id ?? ""),
        name: project.name ?? "",
        path: project.path,
        description: project.description ?? null,
        contract_number: project.contract_number ?? null,
        investor: project.investor ?? null,
        contractor: project.contractor ?? null,
        signed_date: project.signed_date ?? null,
        duration: project.duration ?? null,
        end_date: project.end_date ?? null,
        status: (project.status as Project["status"]) ?? "active",
        created_at: project.created_at ?? "",
        updated_at: project.updated_at ?? "",
    };
};

const isProjectLoadable = (project: Project | null | undefined): project is Project =>
    !!project && !!project.id && !!project.path;

export function useProjectManager() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [loadingProjects, setLoadingProjects] = useState(true);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
    const { loadSettings } = useSettingsStore();

    // Guard against stale hydration after F5. Any new open request invalidates older loaders.
    const requestIdRef = useRef(0);
    const selectedProjectRef = useRef<Project | null>(null);
    const indexingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        selectedProjectRef.current = selectedProject;
    }, [selectedProject]);

    const loadProjects = async () => {
        const requestId = ++requestIdRef.current;
        console.group(`[useProjectManager] loadProjects Process #${requestId}`);
        console.info("Starting loadProjects sequence...");

        setLoadingProjects(true);
        let hydratedProject: Project | null = normalizeProject(selectedProjectRef.current);

        try {
            // 1. Check active project from backend
            try {
                const activeProject = normalizeProject(await invoke<Project | null>("get_active_project"));
                console.info("Backend Active Project Result:", activeProject?.name || "None");

                if (requestId !== requestIdRef.current) {
                    console.warn("Request ID mismatch (Stale request), aborting hydration.");
                    console.groupEnd();
                    return;
                }

                if (isProjectLoadable(activeProject)) {
                    console.info(`[useProjectManager] Hydrating active project from backend: ${activeProject.name}`);
                    hydratedProject = activeProject;
                }
            } catch (err) {
                console.warn("Failed to check active project from backend:", err);
            }

            // 2. Load recent projects from backend
            let currentProjects: Project[] = [];
            try {
                const backendProjects = await invoke<Project[]>("get_recent_projects");
                currentProjects = backendProjects
                    .map(normalizeProject)
                    .filter((project): project is Project => project !== null);
                console.info(`Loaded ${currentProjects.length} recent projects from backend`);
            } catch (backendErr) {
                console.warn("Backend recent projects not available, falling back to localStorage:", backendErr);
                // Fallback to localStorage only if backend fails
                const saved = localStorage.getItem("recent_pmps");
                if (saved) {
                    try {
                        currentProjects = (JSON.parse(saved) as Project[])
                            .map(normalizeProject)
                            .filter((project): project is Project => project !== null);
                    } catch (e) {
                        console.error("Failed to parse local projects:", e);
                    }
                }
            }

            // 3. Load official config from backend
            try {
                const config = await invoke<{ recent_pmps: Project[]; last_opened_pmp?: string }>("get_app_config");
                if (requestId !== requestIdRef.current) return;

                if (config.recent_pmps && config.recent_pmps.length > 0) {
                    currentProjects = config.recent_pmps
                        .map(normalizeProject)
                        .filter((project): project is Project => project !== null);
                    localStorage.setItem("recent_pmps", JSON.stringify(currentProjects));
                }

                // V4.1 Note: Auto-load from config.last_opened_pmp is intentionally disabled 
                // to support F5 -> Home Dashboard flow.
            } catch (backendErr) {
                console.warn("Backend config not available or incompatible:", backendErr);
            }

            console.info("Final Hydrated Project:", hydratedProject?.name || "None");
            setProjects(currentProjects);

            if (isProjectLoadable(hydratedProject)) {
                selectedProjectRef.current = hydratedProject;
                setSelectedProject(hydratedProject);
            }
        } catch (err) {
            console.error("Critical error in loadProjects:", err);
        } finally {
            if (requestId === requestIdRef.current) {
                setLoadingProjects(false);
            }
            console.groupEnd();
        }
    };

    useEffect(() => {
        loadProjects();
        loadSettings();

        return () => {
            if (indexingTimeoutRef.current) {
                clearTimeout(indexingTimeoutRef.current);
                indexingTimeoutRef.current = null;
            }
        };
    }, []);

    const refreshProject = async () => {
        if (!selectedProjectRef.current) return;

        try {
            const projectData = (await invoke<Project[]>("get_projects"))
                .map(normalizeProject)
                .filter((project): project is Project => project !== null);
            if (projectData && projectData.length > 0) {
                const current = selectedProjectRef.current;
                const project = projectData.find((x) => x.id === current?.id) || projectData[0];
                selectedProjectRef.current = project;
                setSelectedProject(project);
            }
        } catch (e) {
            console.error("Failed to refresh project:", e);
        }
    };

    const handleOpenProject = async (pathToOpen?: string) => {
        const requestId = ++requestIdRef.current;

        try {
            if (indexingTimeoutRef.current) {
                clearTimeout(indexingTimeoutRef.current);
                indexingTimeoutRef.current = null;
            }

            const isTauri = !!(window as any).__TAURI_IPC__;
            const selectedPath = pathToOpen || await safeOpenDialog({
                filters: [{ name: "PMP Database", extensions: ["pmp"] }],
                multiple: false,
                directory: false,
            });

            if (!selectedPath || typeof selectedPath !== "string") {
                if (!isTauri && !pathToOpen) {
                    console.warn("[useProjectManager] File dialog skipped: Not in Tauri environment.");
                }
                return false;
            }

            // OPTIMISTIC RESET: Clear UI state immediately before backend starts heavy load
            const { useDesignSync } = await import("@IMPLEMENT/stores/useDesignSync");
            useDesignSync.getState().reset();
            // We DON'T set selectedProject to null here, so the Detail view stays visible 
            // but shows the "isLoading" state from useDesignSync.

            console.info(`[useProjectManager] Attempting to load PMP file: ${selectedPath}`);
            const migratedProject = normalizeProject(await invoke<Project>("load_pmp_file", { path: selectedPath }));
            if (requestId !== requestIdRef.current) return false;

            let recoveredProject = migratedProject;
            if (!isProjectLoadable(recoveredProject)) {
                console.info("[useProjectManager] load_pmp_file returned null, attempting fallback to active project...");
                recoveredProject = normalizeProject(await invoke<Project | null>("get_active_project"));
            }

            if (isProjectLoadable(recoveredProject)) {
                const project = recoveredProject;
                console.info(`[useProjectManager] Loaded project: ${project.name} (ID: ${project.id})`);

                selectedProjectRef.current = project;
                setSelectedProject(project);

                indexingTimeoutRef.current = setTimeout(() => {
                    invoke("index_project_files", { projectId: project.id }).catch(console.error);
                    indexingTimeoutRef.current = null;
                }, 3000);

                const nextRecent = [project, ...projects.filter((x) => x.path !== project.path)]
                    .map(normalizeProject)
                    .filter((item): item is Project => item !== null)
                    .slice(0, 10);
                setProjects(nextRecent);

                // Save to backend first
                invoke("save_recent_projects", { projects: nextRecent }).catch((err) => {
                    console.warn("Failed to save recent projects to backend, using localStorage:", err);
                    // Fallback to localStorage if backend fails
                    localStorage.setItem("recent_pmps", JSON.stringify(nextRecent));
                });

                invoke("save_last_opened_project", { project }).catch(console.error);

                // V4.1: Add to Tab Store
                useTabStore.getState().addTab({
                    id: project.id,
                    name: project.name,
                    path: project.path
                });

                return true;
            }

            console.warn("[useProjectManager] Failed to load PMP: Project not loadable or busy. Path:", selectedPath);
            alert("Không thể nạp tệp PMP. Tệp có thể đang trống hoặc đang được mở bởi một tiến trình khác.");
        } catch (e) {
            console.error("Error opening PMP:", e);
            const isTauri = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__;
            if (isTauri) {
                alert("Lỗi hệ thống khi nạp tệp PMP. Vui lòng kiểm tra lại đường dẫn.");
            } else {
                console.warn("[useProjectManager] Suppression of alert in browser environment.");
            }
        }

        return false;
    };

    const handleDeleteProject = async (e: React.MouseEvent, project: Project) => {
        e.stopPropagation();
        setProjectToDelete(project);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!projectToDelete) return;

        try {
            if (selectedProjectRef.current?.id === projectToDelete.id) {
                selectedProjectRef.current = null;
                setSelectedProject(null);
            }

            try {
                await invoke("load_pmp_file", { path: projectToDelete.path });
                await invoke("delete_project", { id: projectToDelete.id });
            } catch (err) {
                console.warn("Could not delete from backend (might be already gone or locked):", err);
            }

            const updatedProjects = projects.filter((project) => project.path !== projectToDelete.path);
            setProjects(updatedProjects);

            // Remove from backend first
            invoke("remove_recent_project", { path: projectToDelete.path }).catch((err) => {
                console.warn("Failed to remove from backend, using localStorage:", err);
                // Fallback to localStorage if backend fails
                localStorage.setItem("recent_pmps", JSON.stringify(updatedProjects));
            });

            // V4.1: Remove from Tab Store
            useTabStore.getState().removeTab(projectToDelete.id);

            setIsDeleteModalOpen(false);
            setProjectToDelete(null);
        } catch (err) {
            console.error("Failed to delete project:", err);
            alert("Lỗi khi xóa dự án.");
        }
    };

    const handleRestoreFromConfig = async () => {
        try {
            const config = await invoke<{ recent_pmps: Project[] }>("get_app_config");
            if (config.recent_pmps && config.recent_pmps.length > 0) {
                console.info(`Restoring ${config.recent_pmps.length} projects from config...`);
                const normalizedProjects = config.recent_pmps
                    .map(normalizeProject)
                    .filter((project): project is Project => project !== null);
                setProjects(normalizedProjects);

                // Save to backend
                invoke("save_recent_projects", { projects: normalizedProjects })
                    .catch((err) => {
                        console.warn("Failed to save to backend, using localStorage:", err);
                        localStorage.setItem("recent_pmps", JSON.stringify(normalizedProjects));
                    });
                alert(`Đã khôi phục thành công ${config.recent_pmps.length} dự án từ cấu hình hệ thống.`);
            } else {
                alert("Cấu hình hệ thống chưa có thông tin dự án cũ.");
            }
        } catch (err) {
            console.error("Restore error:", err);
            alert("Lỗi khi khôi phục từ backend.");
        }
    };

    const handleCloseProject = async () => {
        console.info("[useProjectManager] Closing active project...");
        try {
            await invoke("close_active_project");
            selectedProjectRef.current = null;
            setSelectedProject(null);
            console.info("[useProjectManager] Project closed successfully.");
        } catch (e) {
            console.error("[useProjectManager] Failed to close project:", e);
        }
    };

    return {
        projects,
        setProjects,
        selectedProject,
        setSelectedProject,
        loadingProjects,
        loadProjects,
        refreshProject,
        handleOpenProject,
        handleCloseProject,
        handleDeleteProject,
        handleRestoreFromConfig,
        isDeleteModalOpen,
        setIsDeleteModalOpen,
        projectToDelete,
        confirmDelete,
    };
}

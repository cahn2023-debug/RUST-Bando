import { useEffect, useRef, useState } from "react";
import { safeInvoke as invoke, safeOpenDialog, IS_REAL_TAURI } from "@IMPLEMENT/lib/tauri";
import { useSettingsStore } from "@IMPLEMENT/stores/useSettingsStore";
import { Project } from "@CONTRACT/types";
import { useTabStore } from "@IMPLEMENT/TabInProgram/useTabStore";
import { backfillProjectPath } from "./projectPathUtils";

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
    const projectsRef = useRef<Project[]>([]);
    const selectedProjectRef = useRef<Project | null>(null);
    const indexingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const openingPathRef = useRef<string | null>(null);

    useEffect(() => {
        projectsRef.current = projects;
    }, [projects]);

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
            const [activeProjectResult, recentProjectsResult] = await Promise.allSettled([
                invoke<Project | null>("get_active_project"),
                invoke<Project[]>("get_recent_projects"),
            ]);

            if (requestId !== requestIdRef.current) {
                console.warn("Request ID mismatch (Stale request), aborting hydration.");
                console.groupEnd();
                return;
            }

            const activeProject = activeProjectResult.status === "fulfilled"
                ? normalizeProject(activeProjectResult.value)
                : null;
            console.info("Backend Active Project Result:", activeProject?.name || "None");

            if (isProjectLoadable(activeProject)) {
                console.info(`[useProjectManager] Hydrating active project from backend: ${activeProject.name}`);
                hydratedProject = activeProject;
            }

            let currentProjects: Project[] = [];
            if (recentProjectsResult.status === "fulfilled") {
                currentProjects = (Array.isArray(recentProjectsResult.value) ? recentProjectsResult.value : [])
                    .map(normalizeProject)
                    .filter((project): project is Project => project !== null);
                console.info(`Loaded ${currentProjects.length} recent projects from backend`);
                localStorage.setItem("recent_pmps", JSON.stringify(currentProjects));
            } else {
                console.warn("Backend recent projects not available, falling back to localStorage:", recentProjectsResult.reason);
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

            console.info("Final Hydrated Project:", hydratedProject?.name || "None");
            hydratedProject = backfillProjectPath(hydratedProject, currentProjects);
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

    const scheduleProjectIndexing = (projectId: string) => {
        indexingTimeoutRef.current = setTimeout(() => {
            invoke("index_project_files", { projectId }).catch(console.error);
            indexingTimeoutRef.current = null;
        }, 3000);
    };

    const applyOpenedProject = (project: Project, persistLastOpened: boolean) => {
        selectedProjectRef.current = project;
        setSelectedProject(project);

        const nextRecent = [project, ...projectsRef.current.filter((x) => x.path !== project.path)]
            .map(normalizeProject)
            .filter((item): item is Project => item !== null)
            .slice(0, 10);
        projectsRef.current = nextRecent;
        setProjects(nextRecent);

        invoke("save_recent_projects", { projects: nextRecent }).catch((err) => {
            console.warn("Failed to save recent projects to backend, using localStorage:", err);
            localStorage.setItem("recent_pmps", JSON.stringify(nextRecent));
        });

        if (persistLastOpened) {
            invoke("save_last_opened_project", { project }).catch(console.error);
        }

        useTabStore.getState().addTab({
            id: project.id,
            name: project.name,
            path: project.path
        });
    };

    const mergeProjectMetadata = (base: Project, update: Project): Project => ({
        ...base,
        ...update,
        id: update.id || base.id,
        name: update.name || base.name,
        path: update.path || base.path,
    });

    const handleOpenProject = async (pathToOpen?: string) => {
        const requestId = ++requestIdRef.current;
        let selectedPathForCleanup: string | null = null;
        console.group(`[useProjectManager] handleOpenProject Process #${requestId}`);
        console.info("Path to open:", pathToOpen || "Manual selection");

        try {
            if (indexingTimeoutRef.current) {
                console.info("Clearing existing indexing timeout...");
                clearTimeout(indexingTimeoutRef.current);
                indexingTimeoutRef.current = null;
            }

            const isTauri = IS_REAL_TAURI;
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

            if (openingPathRef.current === selectedPath) {
                console.warn("[useProjectManager] Skip duplicate open while same path is already loading:", selectedPath);
                return false;
            }
            openingPathRef.current = selectedPath;
            selectedPathForCleanup = selectedPath;

            // OPTIMISTIC RESET: Clear UI state immediately before backend starts heavy load
            const { useDesignSync } = await import("@IMPLEMENT/stores/useDesignSync");
            useDesignSync.getState().reset();

            const optimisticProject = projectsRef.current.find((project) => project.path === selectedPath);
            if (isProjectLoadable(optimisticProject)) {
                console.info(`[useProjectManager] Optimistically opening project: ${optimisticProject.name}`);
                applyOpenedProject(optimisticProject, false);
                scheduleProjectIndexing(optimisticProject.id);

                void (async () => {
                    try {
                        console.info(`[useProjectManager] Attaching PMP file in background: ${selectedPath}`);
                        const migratedProject = normalizeProject(await invoke<Project>("load_pmp_file", { path: selectedPath }));
                        console.info("load_pmp_file result:", migratedProject?.name || "Null");

                        if (requestId !== requestIdRef.current) {
                            console.warn("Request ID mismatch (Stale open request), skipping background finalization.");
                            return;
                        }

                        let recoveredProject = migratedProject;
                        if (!isProjectLoadable(recoveredProject)) {
                            console.info("[useProjectManager] load_pmp_file returned null, attempting fallback to active project...");
                            recoveredProject = normalizeProject(await invoke<Project | null>("get_active_project"));
                        }

                        if (requestId !== requestIdRef.current) {
                            console.warn("Request ID mismatch after fallback, skipping background finalization.");
                            return;
                        }

                        if (isProjectLoadable(recoveredProject)) {
                            const project = mergeProjectMetadata(optimisticProject, recoveredProject);
                            console.info(`[useProjectManager] Background attach resolved project: ${project.name} (ID: ${project.id})`);
                            applyOpenedProject(project, true);
                            return;
                        }

                        console.warn("[useProjectManager] Background attach did not return a loadable project. Keeping optimistic workspace open.");
                    } catch (e) {
                        console.error("Background PMP attach failed:", e);
                    }
                })();

                return true;
            }

            console.info(`[useProjectManager] Attempting to load PMP file: ${selectedPath}`);
            const migratedProject = normalizeProject(await invoke<Project>("load_pmp_file", { path: selectedPath }));
            console.info("load_pmp_file result:", migratedProject?.name || "Null");

            if (requestId !== requestIdRef.current) {
                console.warn("Request ID mismatch (Stale open request), aborting.");
                console.groupEnd();
                return false;
            }

            let recoveredProject = migratedProject;
            if (!isProjectLoadable(recoveredProject)) {
                console.info("[useProjectManager] load_pmp_file returned null, attempting fallback to active project...");
                recoveredProject = normalizeProject(await invoke<Project | null>("get_active_project"));
            }

            if (isProjectLoadable(recoveredProject)) {
                const project = recoveredProject;
                console.info(`[useProjectManager] Successfully resolved project: ${project.name} (ID: ${project.id})`);

                applyOpenedProject(project, true);
                scheduleProjectIndexing(project.id);

                return true;
            }

            console.warn("[useProjectManager] Failed to load PMP: Project not loadable or busy. Path:", selectedPath);
            alert("Không thể nạp tệp PMP. Tệp có thể đang trống hoặc đang được mở bởi một tiến trình khác.");
        } catch (e) {
            console.error("Error opening PMP:", e);
            const isTauri = IS_REAL_TAURI;
            if (isTauri) {
                alert("Lỗi hệ thống khi nạp tệp PMP. Vui lòng kiểm tra lại đường dẫn.");
            } else {
                console.warn("[useProjectManager] Suppression of alert in browser environment.");
            }
        } finally {
            if (selectedPathForCleanup && openingPathRef.current === selectedPathForCleanup) {
                openingPathRef.current = null;
            }
            console.groupEnd();
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
                await invoke("close_active_project").catch((err) => {
                    console.warn("Could not close active project while removing from recent:", err);
                });
            }

            try {
                await invoke("delete_project", { id: projectToDelete.id });
            } catch (err) {
                console.warn("Could not remove project metadata from backend:", err);
            }

            const updatedProjects = projects.filter((project) => project.path !== projectToDelete.path);
            setProjects(updatedProjects);
            localStorage.setItem("recent_pmps", JSON.stringify(updatedProjects));

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

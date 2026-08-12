import React from "react";
import { CreateProjectModal } from "@IMPLEMENT/features/project-management/CreateProjectModal";
import { ExportProgressModal } from "@DESIGN/components/ui/ExportProgressModal";
import { DeleteConfirmationModal } from "@DESIGN/components/ui/DeleteConfirmationModal";
import { PerformanceOverlay } from "@DESIGN/components/ui/PerformanceOverlay";
import { Project } from "@CONTRACT/types";

interface GlobalModalsProps {
    showCreate: boolean;
    setShowCreate: (show: boolean) => void;
    loadProjects: () => void;
    handleOpenProject: (path: string) => Promise<boolean>;
    setActiveTab: (tab: string) => void;
    isDeleteModalOpen: boolean;
    setIsDeleteModalOpen: (open: boolean) => void;
    confirmDelete: () => void;
    projectToDelete: Project | null;
}

export const GlobalModals: React.FC<GlobalModalsProps> = ({
    showCreate,
    setShowCreate,
    loadProjects,
    handleOpenProject,
    setActiveTab,
    isDeleteModalOpen,
    setIsDeleteModalOpen,
    confirmDelete,
    projectToDelete,
}) => {
    return (
        <>
            {showCreate && (
                <CreateProjectModal
                    onClose={() => setShowCreate(false)}
                    onSuccess={(project?: Project) => {
                        loadProjects();
                        if (project?.path) {
                            handleOpenProject(project.path).then((success) => {
                                if (success) setActiveTab("DESIGN");
                            });
                        }
                    }}
                />
            )}

            <ExportProgressModal />

            <DeleteConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Xác nhận gỡ bỏ dự án"
                message="Bạn có chắc chắn muốn xóa dự án này khỏi danh sách gần đây không? Thao tác này không xóa tệp .pmp trên máy tính của bạn."
                itemName={projectToDelete?.name}
            />
            <PerformanceOverlay />
        </>
    );
};

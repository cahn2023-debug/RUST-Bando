import { ThemeModal } from "@DESIGN/components/ui/ThemeModal";
import { MappingDialog } from "@DESIGN/components/core/CADPanels/MappingDialog";
import { DeleteConfirmationModal } from "@DESIGN/components/ui/DeleteConfirmationModal";
import { ImportMapping } from "@IMPLEMENT/services/importService";

interface MappingDialogData {
  headers: string[];
  filename: string;
  groupId: string;
  filePath: string;
}

interface ExplorerModalsProps {
    themeGroupId: string | null;
    setThemeGroupId: (id: string | null) => void;
    groupName?: string;
    themeTargetFeatureIds?: string[];
    mappingData: MappingDialogData | null;
    setMappingData: (data: MappingDialogData | null) => void;
    handleMappingConfirm: (mapping: ImportMapping) => Promise<void>;
    deleteModal: {
        isOpen: boolean;
        type: 'region' | 'group' | 'layer' | 'feature' | 'featureChildren' | null;
        id: string;
        name: string;
    };
    setDeleteModal: (updater: (prev: ExplorerModalsProps['deleteModal']) => ExplorerModalsProps['deleteModal']) => void;
    confirmDelete: () => Promise<void>;
}

export function ExplorerModals({
    themeGroupId,
    setThemeGroupId,
    groupName,
    themeTargetFeatureIds,
    mappingData,
    setMappingData,
    handleMappingConfirm,
    deleteModal,
    setDeleteModal,
    confirmDelete
}: ExplorerModalsProps) {
    return (
        <>
            {themeGroupId && (
                <ThemeModal
                    groupId={themeGroupId}
                    groupName={groupName || 'Group'}
                    onClose={() => setThemeGroupId(null)}
                    targetFeatureIds={themeTargetFeatureIds}
                />
            )}

            {mappingData && (
                <MappingDialog
                    headers={mappingData.headers}
                    filename={mappingData.filename}
                    onConfirm={handleMappingConfirm}
                    onClose={() => setMappingData(null)}
                />
            )}

            <DeleteConfirmationModal
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal((prev) => ({ ...prev, isOpen: false }))}
                onConfirm={confirmDelete}
                title={`Xóa ${deleteModal.type === 'feature' ? 'Đối tượng' : deleteModal.type === 'region' ? 'Dự án' : deleteModal.type === 'featureChildren' ? 'Đối tượng trong nút giao' : 'Nhóm'}`}
                message={`Bạn có chắc chắn muốn xóa ${deleteModal.type === 'feature' ? 'đối tượng' : deleteModal.type === 'featureChildren' ? 'toàn bộ đối tượng trong nút giao' : 'thư mục'} "${deleteModal.name}"${deleteModal.type !== 'feature' && deleteModal.type !== 'featureChildren' ? ' và toàn bộ nội dung bên trong' : ''}? Hành động này không thể hoàn tác.`}
                itemName={deleteModal.name}
            />
        </>
    );
}

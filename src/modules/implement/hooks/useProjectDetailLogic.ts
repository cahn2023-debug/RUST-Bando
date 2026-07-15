import { useState, useEffect, useCallback, useRef } from 'react';
import { safeInvoke, safeListen } from '@IMPLEMENT/lib/tauri';
import {
  Project,
  FileNode,
  ContentType,
  ContractMetadata,
  BOMItem,
  LocalMetadata,
} from '@CONTRACT/types';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { useProjectData } from '@IMPLEMENT/hooks/useProjectData';
import { logger } from '@TOOL/utils/logger';
import { queryProjection, getContentTypes } from '@TOOL/utils/designIpc';

export function useProjectDetailLogic(project: Project, onProjectUpdate?: () => void) {
  const projectId = project?.id ?? '';
  const hasValidProject = !!projectId;
  const projectPath = project?.path ?? '';
  const [fileNodes, setFileNodes] = useState<FileNode[]>([]);
  const [viewMode, setViewMode] = useState<
    | 'tasks'
    | 'contracts'
    | 'kanban'
    | 'search'
    | 'calendar'
    | 'analysis'
    | 'global-bom'
    | 'global-summary'
    | 'manager'
  >('tasks');
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    type: 'doc' | 'excel' | 'code' | 'image' | 'pdf';
    path?: string;
  } | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [localMetadata, setLocalMetadata] = useState({
    contract_number: project?.contract_number || '',
    investor: project?.investor || '',
    contractor: project?.contractor || '',
    signed_date: project?.signed_date || '',
    duration: project?.duration || '',
    end_date: (project as any)?.end_date || '',
  });

  const [analysisData, setAnalysisData] = useState<ContractMetadata | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showRawFile, setShowRawFile] = useState(false);
  const [globalBOMData, setGlobalBOMData] = useState<BOMItem[]>([]);
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const bootstrapKeyRef = useRef<string | null>(null);

  const { contracts, loadContracts, handleCreateContract, handleDeleteContract } =
    useProjectData(project);

  const loadFileTree = useCallback(async () => {
    if (!hasValidProject || !projectPath) {
      setFileNodes([]);
      return;
    }
    try {
      const data = await safeInvoke<FileNode[]>('get_project_tree', {
        projectId,
        path: projectPath,
      });
      setFileNodes(data);
    } catch (err) {
      logger.error('Error loading file tree:', err);
    }
  }, [hasValidProject, projectId, projectPath]);

  const loadBOM = useCallback(async () => {
    if (!hasValidProject) {
      setGlobalBOMData([]);
      return;
    }
    try {
      // âœ… DÃ¹ng utility queryProjection (V2 Bridge)
      const res = await queryProjection('bom_metadata', projectId);

      // âœ… Optional chaining + fallback empty array
      setGlobalBOMData(res?.bom_table ?? []);

      if (res?.metadata) {
        setLocalMetadata({
          contract_number: res.metadata.contract_number ?? '',
          investor: res.metadata.investor ?? '',
          contractor: res.metadata.contractor ?? '',
          signed_date: res.metadata.signed_date ?? '',
          duration: res.metadata.duration ?? '',
          end_date: res.metadata.end_date ?? '',
        });
      }
    } catch (err) {
      logger.warn('[V2] Projection query failed, using fallback:', err);
      setGlobalBOMData([]);
    }
  }, [hasValidProject, projectId]);

  useEffect(() => {
    let unlistenMeta: (() => void) | undefined;
    let unlistenSync: (() => void) | undefined;

    const setup = async () => {
      unlistenMeta = await safeListen<Record<string, unknown>>('metadata-updated', (event: any) => {
        const payload = event.payload;
        if (hasValidProject && String(payload.project_id) === String(projectId)) {
          setLocalMetadata({
            contract_number: (payload.contract_number as string) ?? '',
            investor: (payload.investor as string) ?? '',
            contractor: (payload.contractor as string) ?? '',
            signed_date: (payload.signed_date as string) ?? '',
            duration: (payload.duration as string) ?? '',
            end_date: (payload.end_date as string) ?? '',
          });
          if (onProjectUpdate) onProjectUpdate();
        }
      });

      unlistenSync = await safeListen<{ project_id: string | number }>(
        'sync-finished',
        (event: any) => {
          if (hasValidProject && String(event.payload) === String(projectId)) {
            loadBOM();
          }
        }
      );
    };

    setup();
    return () => {
      if (typeof unlistenMeta === 'function') unlistenMeta();
      if (typeof unlistenSync === 'function') unlistenSync();
    };
  }, [hasValidProject, projectId, loadBOM, onProjectUpdate]);

  useEffect(() => {
    if (!hasValidProject) {
      logger.warn('[ProjectDetail] Skipping bootstrap because projectId is invalid:', project);
      return;
    }

    const bootstrapKey = `${projectId}@${projectPath}`;
    if (bootstrapKeyRef.current === bootstrapKey) {
      return;
    }
    bootstrapKeyRef.current = bootstrapKey;

    const bootstrap = async () => {
      loadFileTree();
      try {
        // initialize() already hydrates design state; avoid duplicate hydration race.
        const results = await Promise.allSettled([
          getContentTypes(),
          useDesignSync.getState().initialize(String(projectId), projectPath || undefined),
        ]);

        const types = results[0].status === 'fulfilled' ? results[0].value : [];

        setContentTypes(types);
        // logic xá»­ lÃ½ design state náº¿u cáº§n...

        loadBOM();
      } catch (err) {
        logger.error('V2 Bootstrap failed:', err);
      }
    };

    bootstrap();
  }, [hasValidProject, projectId, projectPath, loadFileTree, loadBOM]);

  const handleFileSelect = useCallback(
    async (path: string, name: string, extension?: string, activeTab?: string) => {
      if (
        name === 'Báº£ng dá»¯ liá»‡u há»£p Ä‘á»“ng' ||
        name === 'Tá»•ng há»£p chi tiáº¿t (Local)'
      ) {
        setAnalysisData(null);
        setSelectedFile({ name, type: 'excel', path });
        setViewMode(name === 'Báº£ng dá»¯ liá»‡u há»£p Ä‘á»“ng' ? 'global-bom' : 'global-summary');
        setAnalyzing(true);
        await loadBOM();
        setAnalyzing(false);
        return;
      }

      const ext = extension?.toLowerCase();
      const type =
        ext === 'xlsx' || ext === 'xls' || ext === 'csv'
          ? 'excel'
          : ext === 'docx'
            ? 'doc'
            : ['png', 'jpg', 'jpeg', 'gif'].includes(ext || '')
              ? 'image'
              : ext === 'pdf'
                ? 'pdf'
                : 'code';

      setSelectedFile({ name, type, path });
      setSelectedFile({ name, type, path });
      setViewMode('analysis');

      if (activeTab === 'CONTRACT' && (type === 'doc' || type === 'pdf')) {
        setAnalyzing(true);
        setShowRawFile(false);
        try {
          const data = await safeInvoke<ContractMetadata>('analyze_contract_metadata', { path });
          setAnalysisData(data);
        } catch (err) {
          logger.error('Analysis failed:', err);
          setAnalysisData(null);
        } finally {
          setAnalyzing(false);
        }
      } else {
        setAnalysisData(null);
      }
    },
    [loadBOM]
  );

  const handleBulkSync = useCallback(async () => {
    if (analyzing || !selectedFile?.path) return;
    setAnalyzing(true);
    try {
      const newData = await safeInvoke<ContractMetadata>('update_and_sync_contract_metadata', {
        path: selectedFile.path,
        projectId,
      });
      setAnalysisData(newData);
      setLocalMetadata({
        contract_number: newData.contract_number,
        investor: newData.investor,
        contractor: newData.contractor,
        signed_date: newData.signed_date,
        duration: newData.duration,
        end_date: newData.end_date,
      });
    } catch (err) {
      logger.error('Lá»—i Ä‘á»“ng bá»™ dá»¯ liá»‡u:', err);
    } finally {
      setAnalyzing(false);
    }
  }, [projectId, analyzing, selectedFile?.path]);

  const handleSaveCorrections = useCallback(
    async (correctedData: ContractMetadata) => {
      try {
        const updatedData = await safeInvoke<ContractMetadata>('save_contract_analysis', {
          path: selectedFile?.path,
          projectId,
          data: correctedData,
        });
        await safeInvoke('save_ai_correction', { path: selectedFile?.path, data: correctedData });
        if (updatedData) {
          setAnalysisData(updatedData);
          setLocalMetadata({
            contract_number: updatedData.contract_number ?? '',
            investor: updatedData.investor ?? '',
            contractor: updatedData.contractor ?? '',
            signed_date: updatedData.signed_date ?? '',
            duration: updatedData.duration ?? '',
            end_date: updatedData.end_date ?? '',
          });
        }
        loadContracts();
        if (onProjectUpdate) onProjectUpdate();
        logger.sync('ÄÃ£ Ä‘á»“ng bá»™ hÃ³a dá»¯ liá»‡u thÃ nh cÃ´ng!');
      } catch (err) {
        logger.error('Lá»—i Ä‘á»“ng bá»™ dá»¯ liá»‡u:', err);
      }
    },
    [projectId, selectedFile?.path, loadContracts, onProjectUpdate]
  );

  const handleProjectMetadataUpdate = useCallback(
    async (correctedData: LocalMetadata & { bom_table?: BOMItem[] }) => {
      // V2: UI Guard - Signal that we are saving to prevent initialize() from wiping the store
      const { setIsSaving } = useDesignSync.getState();
      setIsSaving(true);

      try {
        await safeInvoke('update_project_details', {
          id: projectId,
          contract_number: correctedData.contract_number ?? project.contract_number,
          investor: correctedData.investor ?? project.investor,
          contractor: correctedData.contractor ?? project.contractor,
          signed_date: correctedData.signed_date ?? project.signed_date,
          duration: correctedData.duration ?? project.duration,
          end_date: correctedData.end_date ?? (project as any).end_date,
        });

        setLocalMetadata({
          contract_number: (correctedData.contract_number ?? project?.contract_number) || '',
          investor: (correctedData.investor ?? project?.investor) || '',
          contractor: (correctedData.contractor ?? project?.contractor) || '',
          signed_date: (correctedData.signed_date ?? project?.signed_date) || '',
          duration: (correctedData.duration ?? project?.duration) || '',
          end_date: (correctedData.end_date ?? (project as any)?.end_date) || '',
        });

        setGlobalBOMData(correctedData.bom_table ?? []);

        await safeInvoke('save_project_bom_table', {
          projectId,
          bomTable: correctedData.bom_table || [],
          metadata: {
            contract_number: correctedData.contract_number ?? project.contract_number,
            investor: correctedData.investor ?? project.investor,
            contractor: correctedData.contractor ?? project.contractor,
            signed_date: correctedData.signed_date ?? project.signed_date,
            duration: correctedData.duration ?? project.duration,
            end_date: correctedData.end_date ?? (project as any).end_date,
            bom_table: correctedData.bom_table || [],
          },
        });

        if (onProjectUpdate) onProjectUpdate();
        logger.sync('ÄÃ£ Ä‘á»“ng bá»™ hÃ³a dá»¯ liá»‡u dá»± Ã¡n thÃ nh cÃ´ng!');
      } catch (err) {
        logger.error('Failed to update project metadata:', err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [projectId, onProjectUpdate]
  );

  return {
    fileNodes,
    viewMode,
    setViewMode,
    selectedFile,
    setSelectedFile,
    fileContent,
    setFileContent,
    localMetadata,
    analysisData,
    setAnalysisData,
    analyzing,
    showRawFile,
    setShowRawFile,
    globalBOMData,
    contentTypes,
    handleFileSelect,
    contracts,
    handleCreateContract,
    handleDeleteContract,
    handleBulkSync,
    handleSaveCorrections,
    handleProjectMetadataUpdate,
  };
}

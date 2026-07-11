import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus,
  Package,
  Building2,
  FolderOpen,
  FileText,
  Clock,
  Zap,
  PlayCircle,
  ExternalLink,
  Cpu,
  CheckCircle2,
  User,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { addDays, parse, format, isValid } from 'date-fns';
import { AnalysisTable } from '@DESIGN/components/ui/AnalysisTable';
import { ColumnDef } from '@tanstack/react-table';
import { BOMItem, ContractMetadata } from '@CONTRACT/types';

export interface ContractExecutionGroup {
  id?: string;
  project_id: string;
  name: string;
  description: string;
  status: string;
  due_date: string;
  assignee: string;
  color: string;
  bom_item_uids: string[];
}

interface Props {
  projectId: string;
  data: ContractMetadata;
  onViewRaw: () => void;
  onSaveCorrections?: (correctedData: ContractMetadata) => void;
  onBulkSync?: () => Promise<void>;
  viewType?: 'dashboard' | 'groups' | 'analysis';
  projectName?: string;
  isAnalyzing?: boolean;
}

export function ContractAnalysisView({
  projectId,
  data: initialData,
  onViewRaw,
  // onSaveCorrections, // Unused in this view
  onBulkSync,
  viewType = 'analysis',
  projectName,
  isAnalyzing = false,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [data, setData] = useState<ContractMetadata>(initialData);
  const [executionGroups, setExecutionGroups] = useState<ContractExecutionGroup[]>([]);
  const [isAddingGroup, setIsAddingGroup] = useState(false);

  useEffect(() => {
    const calculatedEndDate = calculateEndDate(initialData.signed_date, initialData.duration);
    const processedBOM = initialData.bom_table.map((item) => ({
      ...item,
      uid: item.uid && item.uid !== '' ? item.uid : crypto.randomUUID(),
    }));
    setData({
      ...initialData,
      bom_table: processedBOM,
      end_date:
        initialData.end_date && initialData.end_date !== '---'
          ? initialData.end_date
          : calculatedEndDate,
    });
  }, [initialData]);

  useEffect(() => {
    if (projectId) fetchGroups();
  }, [projectId]);

  const fetchGroups = async () => {
    try {
      const groups = await invoke<ContractExecutionGroup[]>('get_execution_groups', { projectId });
      setExecutionGroups(groups);
    } catch (error) {
      console.error('Fetch groups error:', error);
    }
  };

  const handleUpsertGroup = async (group: Partial<ContractExecutionGroup>) => {
    try {
      const newGroup = {
        project_id: projectId,
        name: group.name || 'Nhóm mới',
        description: group.description || '',
        status: group.status || 'todo',
        due_date: group.due_date || '',
        assignee: group.assignee || '',
        color: group.color || 'emerald',
        bom_item_uids: group.bom_item_uids || [],
        id: group.id,
      };
      await invoke('upsert_execution_group', { group: newGroup });
      fetchGroups();
      setIsAddingGroup(false);
    } catch (error) {
      console.error('Upsert group error:', error);
    }
  };

  const calculateEndDate = (signedDate: string, durationStr: string) => {
    try {
      const date = parse(signedDate, 'dd/MM/yyyy', new Date());
      if (!isValid(date)) return '---';
      const days = parseInt(durationStr.replace(/\D/g, '')) || 0;
      if (days <= 0) return signedDate;
      return format(addDays(date, days), 'dd/MM/yyyy');
    } catch (e) {
      return '---';
    }
  };

  const handleBOMUpdate = useCallback(async (id: string, field: string, value: any) => {
    setData((prev) => {
      const newBOM = prev.bom_table.map((item) => {
        if (item.uid === id) {
          const newItem = { ...item, [field]: value };
          if (field === 'quantity' || field === 'price') {
            newItem.total = (newItem.quantity || 0) * (newItem.price || 0);
          }
          return newItem;
        }
        return item;
      });
      return { ...prev, bom_table: newBOM };
    });
  }, []);

  const onBatchUpdate = useCallback(async (selectedIds: string[], field: string, value: any) => {
    setData((prev) => {
      const newBOM = prev.bom_table.map((item) => {
        if (selectedIds.includes(item.uid)) {
          const newItem = { ...item, [field]: value };
          if (field === 'quantity' || field === 'price') {
            newItem.total = (newItem.quantity || 0) * (newItem.price || 0);
          }
          return newItem;
        }
        return item;
      });
      return { ...prev, bom_table: newBOM };
    });
  }, []);

  const tableData = useMemo(() => {
    return data.bom_table.map((item) => ({
      ...item,
      id: item.uid,
    }));
  }, [data.bom_table]);

  const columns = useMemo<ColumnDef<BOMItem>[]>(
    () => [
      {
        id: 'select',
        size: 40,
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            className="accent-cad-accent w-4 h-4"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="accent-cad-accent w-4 h-4"
          />
        ),
      },
      { header: 'STT', accessorKey: 'stt', size: 60 },
      {
        header: 'TÊN HẠNG MỤC',
        accessorKey: 'name',
        size: 250,
        cell: (info) => (
          <div className="font-bold text-white tracking-tight">{info.getValue() as string}</div>
        ),
      },
      { header: 'QUY CÁCH', accessorKey: 'description', size: 300 },
      { header: 'ĐVT', accessorKey: 'unit', size: 70 },
      {
        header: 'SỐ LƯỢNG',
        accessorKey: 'quantity',
        size: 100,
        cell: (info) => (info.getValue() as number).toLocaleString(),
      },
      {
        header: 'ĐƠN GIÁ',
        accessorKey: 'price',
        size: 120,
        cell: (info) => `${(info.getValue() as number).toLocaleString()} đ`,
      },
      {
        header: 'THÀNH TIỀN',
        accessorKey: 'total',
        size: 140,
        cell: (info) => (
          <span className="font-bold text-cad-accent">
            {(info.getValue() as number).toLocaleString()} đ
          </span>
        ),
      },
    ],
    []
  );

  const totalAmount = data.bom_table.reduce((sum, item) => sum + item.total, 0);

  const renderActions = () => (
    <div className="flex gap-2 font-sans">
      {onBulkSync && (
        <button
          onClick={onBulkSync}
          className="px-4 py-1.5 bg-cad-accent text-black text-[10px] font-black rounded uppercase tracking-wider hover:brightness-110 transition-all flex items-center gap-2"
        >
          <PlayCircle size={14} /> ĐỒNG BỘ DỮ LIỆU
        </button>
      )}
      <button
        onClick={() => setIsEditing(!isEditing)}
        className={`px-4 py-1.5 border text-[10px] font-black rounded uppercase tracking-wider transition-all ${isEditing ? 'bg-cad-accent/30 text-cad-accent border-cad-accent/50' : 'bg-cad-accent/10 text-cad-accent border-cad-accent/20'}`}
      >
        {isEditing ? 'LƯU BOM' : 'CHỈNH SỬA BOM'}
      </button>
      <button
        onClick={onViewRaw}
        className="px-4 py-1.5 bg-cad-elevated text-cad-text-muted hover:text-white text-[10px] font-black rounded border border-cad-border uppercase transition-all flex items-center gap-2"
      >
        <ExternalLink size={12} /> XEM GỐC
      </button>
    </div>
  );

  if (viewType === 'dashboard') {
    return (
      <div className="flex-1 bg-cad-bg p-8 overflow-y-auto custom-scrollbar animate-in fade-in duration-500 font-sans">
        <div className="max-w-7xl mx-auto space-y-8">
          <ProjectInfoBar projectName={projectName} data={data} isAnalyzing={isAnalyzing} />
          <header className="flex justify-between items-end mb-4">
            <div>
              <h1 className="text-4xl font-black text-white tracking-tighter uppercase leading-none mb-2">
                PROJECT <span className="text-cad-accent">OVERSIGHT</span>
              </h1>
              <p className="text-cad-text-secondary text-xs font-medium uppercase tracking-widest opacity-60">
                Dữ liệu tổng hợp và tiến độ.
              </p>
            </div>
            {onBulkSync && (
              <button
                onClick={onBulkSync}
                className="px-6 py-2 bg-cad-accent text-black text-xs font-black rounded-sm hover:brightness-110 transition-all flex items-center gap-2 uppercase"
              >
                <PlayCircle size={16} /> Đồng bộ toàn bộ dữ liệu
              </button>
            )}
          </header>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StatCard
              icon={<Building2 className="text-cad-accent" />}
              label="Tổng giá trị"
              value={`${totalAmount.toLocaleString()} đ`}
              subValue="Hợp đồng hiện tại"
            />
            <StatCard
              icon={<Package className="text-cad-accent" />}
              label="Vật tư"
              value={data.bom_table.length.toString()}
              subValue="Số hạng mục"
            />
            <StatCard
              icon={<Cpu className="text-cad-accent" />}
              label="Nhóm việc"
              value={executionGroups.length.toString()}
              subValue="Đã phân công"
            />
            <StatCard
              icon={<CheckCircle2 className="text-cad-accent" />}
              label="Tồn kho"
              value="92%"
              subValue="Sẵn sàng"
              color="text-cad-accent"
            />
          </div>
        </div>
      </div>
    );
  }

  const tableContent = (
    <AnalysisTable
      data={tableData}
      columns={columns as any}
      projectId={projectId}
      title="DANH SÁCH THIẾT BỊ HÀNG HÓA"
      onUpdate={handleBOMUpdate}
      onBatchUpdate={onBatchUpdate}
      isStandalone={false}
      renderExtraActions={renderActions}
      batchFields={[
        { label: 'Số lượng', value: 'quantity' },
        { label: 'Đơn giá', value: 'price' },
        { label: 'Xuất xứ', value: 'origin' },
        { label: 'Hãng sản xuất', value: 'manufacturer' },
      ]}
    />
  );

  if (viewType === 'groups') {
    return (
      <div className="flex-1 bg-cad-bg overflow-hidden flex flex-col animate-in fade-in duration-500 font-sans">
        <div className="px-8 py-4 border-b border-cad-border bg-cad-bg/80 backdrop-blur-md z-10 flex flex-col gap-2">
          <h1 className="text-2xl font-black text-white tracking-tighter uppercase leading-none">
            DETAILED <span className="text-cad-accent">SUMMARY</span>
          </h1>
          <ProjectInfoBar projectName={projectName} data={data} compact isAnalyzing={isAnalyzing} />
        </div>
        <div className="flex-1 overflow-hidden flex">
          <div className="w-80 border-r border-cad-border bg-cad-bg p-6 overflow-y-auto space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-black text-white uppercase tracking-widest">
                NHÓM CÔNG VIỆC
              </h2>
              <button
                onClick={() => setIsAddingGroup(true)}
                className="p-1.5 bg-cad-accent/10 text-cad-accent rounded-full hover:bg-cad-accent/20 transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
            {isAddingGroup && (
              <div className="p-4 bg-cad-surface border border-cad-accent/30 rounded-lg space-y-2">
                <input
                  autoFocus
                  placeholder="Tên nhóm..."
                  className="w-full bg-cad-bg border border-cad-border px-3 py-1.5 text-xs text-white rounded outline-none"
                  onKeyDown={(e) =>
                    e.key === 'Enter' &&
                    handleUpsertGroup({ name: (e.target as HTMLInputElement).value })
                  }
                />
                <p className="text-[9px] text-cad-text-muted font-bold">ENTER để lưu, ESC hủy</p>
              </div>
            )}
            {executionGroups.map((group) => (
              <TaskCard
                key={group.id}
                {...group}
                status={group.status.toUpperCase()}
                title={group.name}
                desc={group.description || `Hạng mục: ${group.bom_item_uids.length}`}
                color={group.color as any}
                due={group.due_date || 'N/A'}
              />
            ))}
          </div>
          <div className="flex-1 bg-cad-surface/30 flex flex-col">{tableContent}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-cad-bg overflow-hidden flex flex-col animate-in fade-in duration-500 font-sans">
      <div className="px-8 py-6 border-b border-cad-border bg-cad-bg/80 backdrop-blur-sm z-10 space-y-4">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-black text-white tracking-tighter uppercase leading-none mb-1">
              CONTRACT <span className="text-cad-accent">ANALYSIS</span>
            </h1>
            <p className="text-cad-text-secondary text-[10px] font-bold uppercase tracking-widest opacity-60">
              Theo dõi mua sắm và hiệu suất.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 text-cad-accent">
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-black text-cad-text-muted uppercase tracking-widest">
                TỒN KHO
              </span>
              <span className="text-3xl font-black">{totalAmount === 0 ? 0 : 92}%</span>
            </div>
            <div className="w-64 h-1.5 bg-cad-elevated rounded-full overflow-hidden">
              <div
                className="h-full bg-cad-accent rounded-full shadow-[0_0_10px_rgba(34,197,94,0.3)] transition-all duration-1000"
                style={{ width: '92%' }}
              ></div>
            </div>
          </div>
        </div>
        <ProjectInfoBar projectName={projectName} data={data} compact isAnalyzing={isAnalyzing} />
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">{tableContent}</div>
    </div>
  );
}

function ProjectInfoBar({ projectName, data, compact }: any) {
  return (
    <div
      className={`grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-x-8 gap-y-2 ${compact ? '' : 'bg-cad-surface/50 border border-cad-border p-4 rounded-xl'}`}
    >
      <InfoItem icon={<FolderOpen size={12} />} label="DỰ ÁN" value={projectName || '---'} />
      <InfoItem icon={<FileText size={12} />} label="SỐ HĐ" value={data.contract_number || '---'} />
      <InfoItem icon={<Building2 size={12} />} label="CHỦ ĐẦU TƯ" value={data.investor || '---'} />
      <InfoItem icon={<User size={12} />} label="NHÀ THẦU" value={data.contractor || '---'} />
      <InfoItem icon={<Clock size={12} />} label="DỰ KIẾN" value={data.end_date || '---'} />
      <InfoItem
        icon={<Zap size={12} />}
        label="GIÁ TRỊ"
        value={`${Math.round(data.bom_table.reduce((s: any, i: any) => s + i.total, 0) / 1000000)}M`}
      />
    </div>
  );
}

function InfoItem({ icon, label, value }: any) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-cad-accent opacity-70">{icon}</div>
      <div className="flex flex-col">
        <span className="text-[8px] font-black text-cad-text-muted uppercase tracking-widest">
          {label}
        </span>
        <span className="text-[10px] font-bold text-white truncate max-w-[120px]">{value}</span>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, subValue, color = 'text-white' }: any) {
  return (
    <div className="bg-cad-surface border border-cad-border p-5 rounded-xl hover:border-cad-accent/30 transition-all group">
      <div className="mb-3">{icon}</div>
      <span className="text-[9px] font-black text-cad-text-muted uppercase tracking-widest mb-1 block">
        {label}
      </span>
      <div className={`text-xl font-black ${color} tracking-tight mb-0.5`}>{value}</div>
      <div className="text-[8px] font-bold text-cad-text-secondary uppercase opacity-50">
        {subValue}
      </div>
    </div>
  );
}

function TaskCard({ status, title, due, color }: any) {
  const colors: any = {
    emerald: 'bg-cad-accent/10 text-cad-accent border-cad-accent/20',
    slate: 'bg-cad-elevated text-cad-text-muted border-cad-border',
  };
  return (
    <div
      className={`p-4 bg-cad-surface border rounded-xl hover:border-cad-accent/30 cursor-pointer transition-all ${colors[color] || colors.slate}`}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-black/20 uppercase tracking-widest">
          {status}
        </span>
        <span className="text-[8px] opacity-60 font-bold">{due}</span>
      </div>
      <h3 className="text-white font-black text-xs uppercase mb-1">{title}</h3>
    </div>
  );
}

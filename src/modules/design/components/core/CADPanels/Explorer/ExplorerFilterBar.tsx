import { Type, RefreshCw } from "lucide-react";
import { cn } from "@TOOL/utils/cn";

interface ExplorerFilterBarProps {
    filterType: string | null;
    setFilterType: (type: string | null) => void;
    sortField: 'name' | 'stt';
    setSortField: (field: 'name' | 'stt') => void;
    reverseOrder: boolean;
    setReverseOrder: (reverse: boolean) => void;
}

export function ExplorerFilterBar({
    filterType,
    setFilterType,
    sortField,
    setSortField,
    reverseOrder,
    setReverseOrder
}: ExplorerFilterBarProps) {
    return (
        <div className="flex items-center gap-1">
            <select
                value={filterType || ""}
                onChange={(e) => setFilterType(e.target.value || null)}
                className="flex-1 bg-cad-surface border border-cad-border text-[8px] font-mono py-0.5 px-1 outline-none text-cad-text-muted focus:border-cad-accent rounded-sm"
            >
                <option value="">TẤT CẢ LOẠI</option>
                <option value="INTERSECTION">NÚT GIAO</option>
                <option value="POLYLINE">TUYẾN</option>
                <option value="CCTV">CAMERA CCTV</option>
                <option value="PTZ">CAMERA PTZ</option>
                <option value="SPEED">CAMERA SPEED</option>
                <option value="LPR">CAMERA LPR</option>
                <option value="FOLDER">THƯ MỤC</option>
            </select>

            <div className="flex items-center gap-0.5 ml-auto">
                <button
                    onClick={() => setSortField(sortField === 'name' ? 'stt' : 'name')}
                    className={cn(
                        "p-1 border border-cad-border rounded-sm transition-all flex items-center gap-1 text-[8px] font-mono h-6",
                        sortField === 'stt' ? "bg-cad-accent text-black border-cad-accent" : "hover:border-cad-accent text-cad-text-muted"
                    )}
                    title="Sắp xếp theo Tên/STT"
                >
                    <Type size={10} />
                    {sortField === 'stt' ? "STT" : "NAME"}
                </button>

                <button
                    onClick={() => setReverseOrder(!reverseOrder)}
                    className={cn(
                        "p-1 border border-cad-border rounded-sm transition-all flex items-center gap-1 text-[8px] font-mono h-6",
                        reverseOrder ? "bg-cad-accent text-black border-cad-accent" : "hover:border-cad-accent text-cad-text-muted"
                    )}
                    title="Đảo ngược thứ tự"
                >
                    <RefreshCw size={10} className={cn(reverseOrder && "rotate-180")} />
                    {reverseOrder ? "DESC" : "ASC"}
                </button>
            </div>
        </div>
    );
}

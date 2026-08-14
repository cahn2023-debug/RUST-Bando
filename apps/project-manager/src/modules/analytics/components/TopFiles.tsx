import React from 'react';
import { FileWarning, FileCode, FileText, File as FileIcon } from 'lucide-react';

export interface FileStat {
    name: string;
    size: number;
}

interface TopFilesProps {
    files: FileStat[];
}

const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['rs', 'js', 'ts', 'tsx', 'cpp', 'py'].includes(ext || '')) return FileCode;
    if (['txt', 'md', 'doc', 'pdf'].includes(ext || '')) return FileText;
    return FileIcon;
};

const TopFiles: React.FC<TopFilesProps> = ({ files }) => {
    const maxSize = (files && files.length > 0) ? Math.max(...files.map(f => f.size)) : 0;

    return (
        <div className="cad-card h-full p-6">
            <div className="mb-6 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-cad-text-secondary">Top Largest Files</h3>
                <FileWarning size={16} className="text-amber-400/70" />
            </div>

            <div className="space-y-5">
                {files.length === 0 ? (
                    <div className="py-10 text-center text-cad-text-muted/60 italic text-sm">No data available</div>
                ) : (
                    files.map((file, index) => {
                        const Icon = getFileIcon(file.name);
                        const percentage = maxSize > 0 ? (file.size / maxSize) * 100 : 0;

                        return (
                            <div key={index} className="group flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-cad-border bg-cad-bg text-cad-text-muted transition-colors group-hover:text-cad-text-primary">
                                            <Icon size={16} />
                                        </div>
                                        <span className="truncate text-sm font-medium text-cad-text-primary transition-colors group-hover:text-white">
                                            {file.name}
                                        </span>
                                    </div>
                                    <span className="font-mono text-xs tabular-nums text-cad-text-muted">
                                        {formatSize(file.size)}
                                    </span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-cad-bg">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-cad-accent/45 to-cad-active transition-all duration-1000 ease-out"
                                        style={{ width: `${percentage}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default TopFiles;

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
        <div className="p-6 rounded-2xl border border-white/10 backdrop-blur-xl bg-white/5 h-full">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Top Largest Files</h3>
                <FileWarning size={16} className="text-orange-400 opacity-50" />
            </div>

            <div className="space-y-5">
                {files.length === 0 ? (
                    <div className="py-10 text-center text-white/20 italic text-sm">No data available</div>
                ) : (
                    files.map((file, index) => {
                        const Icon = getFileIcon(file.name);
                        const percentage = (file.size / maxSize) * 100;

                        return (
                            <div key={index} className="group flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="flex-shrink-0 p-1.5 rounded-lg bg-white/5 text-white/60 group-hover:bg-white/10 group-hover:text-white transition-colors">
                                            <Icon size={16} />
                                        </div>
                                        <span className="text-sm text-white/80 truncate font-medium group-hover:text-white transition-colors">
                                            {file.name}
                                        </span>
                                    </div>
                                    <span className="text-xs font-mono text-white/40 tabular-nums">{formatSize(file.size)}</span>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-blue-500/50 to-blue-400 rounded-full transition-all duration-1000 ease-out"
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

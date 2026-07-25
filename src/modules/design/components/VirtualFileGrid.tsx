import React from 'react';
import { VirtuosoGrid } from 'react-virtuoso';
import { convertFileSrc } from '@tauri-apps/api/core';
import { logger } from '@TOOL/utils/logger';

export interface FileItemData {
    id: string;
    name: string;
    path: string;
    type: 'doc' | 'excel' | 'code' | 'image' | 'pdf' | 'other';
}

const ItemContainer = ({ children, ...props }: any) => (
    <div
        {...props}
        style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '8px',
            width: '33.33%', // 3 columns
            boxSizing: 'border-box',
        }}
    >
        {children}
    </div>
);

const ListContainer = React.forwardRef<HTMLDivElement, any>((props, ref) => (
    <div {...props} ref={ref} style={{ display: 'flex', flexWrap: 'wrap', ...props.style }} />
));

export function VirtualFileGrid({ files }: { files: FileItemData[] }) {
    return (
        <VirtuosoGrid
            style={{ height: '100%', width: '100%', minHeight: '400px' }}
            data={files}
            components={{
                List: ListContainer,
                Item: ItemContainer,
            }}
            itemContent={(_index: number, file: FileItemData) => (
                <FilePreviewCard file={file} />
            )}
        />
    );
}

function FilePreviewCard({ file }: { file: FileItemData }) {
    const [error, setError] = React.useState(false);

    const previewUrl = React.useMemo(() => {
        try {
            if (!file.path) return '';
            // Uses Tauri's convertFileSrc to construct custom URI scheme
            const url = convertFileSrc(file.path, 'preview');
            logger.debug(`Generated preview URL for ${file.name}: ${url}`);
            return url;
        } catch (e) {
            logger.error(`Error generating preview URL for ${file.name}`, e);
            return '';
        }
    }, [file.path, file.name]);

    const isHtmlPreview = ['doc', 'excel', 'pdf'].includes(file.type);

    return (
        <div className="flex flex-col border border-cad-border rounded relative bg-cad-elevated overflow-hidden group hover:border-cad-accent transition-colors h-full">
            <div className="h-40 w-full relative bg-cad-bg overflow-hidden flex items-center justify-center pointer-events-none">
                {error || !previewUrl ? (
                    <div className="text-cad-text-muted text-xs flex flex-col items-center gap-2">
                        <span className="text-2xl">📄</span>
                        <span>No Preview</span>
                    </div>
                ) : isHtmlPreview ? (
                    <iframe
                        src={previewUrl}
                        className="w-full h-full border-none bg-white"
                        sandbox="allow-same-origin"
                        loading="lazy"
                        onError={() => setError(true)}
                        title={`Preview ${file.name}`}
                    />
                ) : (
                    <img
                        src={previewUrl}
                        alt={file.name}
                        loading="lazy"
                        className="w-full h-full object-contain p-2"
                        onError={() => setError(true)}
                    />
                )}
            </div>
            <div className="p-2 border-t border-cad-border flex flex-col gap-1">
                <span className="truncate text-[11px] text-cad-text-primary uppercase font-medium" title={file.name}>
                    {file.name}
                </span>
                <span className="text-[10px] text-cad-text-muted">
                    {file.type} format
                </span>
            </div>
        </div>
    );
}

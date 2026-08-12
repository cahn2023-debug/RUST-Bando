import { X, FileIcon, Maximize2, FileText } from "lucide-react";
import { convertFileSrc } from "@/contracts/tauri-api/runtime";
import Editor from "@monaco-editor/react";

interface Props {
  selectedFile: {
    name: string;
    type: 'doc' | 'excel' | 'code' | 'image' | 'pdf';
    path?: string;
  };
  fileContent: string;
  onClose: () => void;
  onOpenExternally: () => void;
  onEditorMount: (editor: any) => void;
}

export function FilePreview({ selectedFile, fileContent, onClose, onOpenExternally, onEditorMount }: Props) {
  return (
    <div className="fixed inset-10 z-cad-modal overflow-hidden rounded-md border border-cad-border bg-cad-surface shadow-[0_0_50px_rgba(0,0,0,0.35)] flex flex-col">
      <div className="cad-toolbar">
        <div className="flex items-center gap-2">
          <FileIcon size={14} className="text-cad-accent" />
          <span className="max-w-[55vw] truncate text-xs font-black uppercase tracking-wider text-cad-text-primary">
            {selectedFile.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onOpenExternally} className="cad-icon-button" title="Open externally">
            <Maximize2 size={14} />
          </button>
          <button onClick={onClose} className="cad-icon-button" title="Close preview">
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden bg-cad-bg">
        {selectedFile.type === 'image' ? (
          <div className="flex h-full w-full items-center justify-center bg-cad-bg p-4">
            <img
              src={convertFileSrc(selectedFile.path || '')}
              alt={selectedFile.name}
              className="max-h-[80%] max-w-full rounded-md border border-cad-border object-contain shadow-md"
            />
          </div>
        ) : selectedFile.type === 'pdf' ? (
          <iframe
            src={convertFileSrc(selectedFile.path || '')}
            className="h-full w-full border-none"
            title={selectedFile.name}
          />
        ) : ['code', 'doc', 'excel'].includes(selectedFile.type) ? (
          <div className="h-full w-full p-2">
            <Editor
              height="100%"
              theme="vs-dark"
              path={selectedFile.name}
              value={fileContent || "Loading content..."}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 12,
                wordWrap: "on"
              }}
              onMount={onEditorMount}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <div className="cad-empty-state max-w-sm w-full">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-cad-border bg-cad-bg">
                <FileText size={24} className="text-cad-text-muted" />
              </div>
              <h3 className="mb-1 truncate px-4 text-sm font-bold text-cad-text-primary">{selectedFile.name}</h3>
              <p className="mb-6 text-[11px] text-cad-text-muted">Preview rendering is restricted.</p>
              <button onClick={onOpenExternally} className="cad-button cad-button-primary w-full">
                Open Externally
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

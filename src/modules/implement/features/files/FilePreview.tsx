import { X, FileIcon, Maximize2, FileText } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
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
    <div className="fixed inset-10 z-[100] bg-cad-surface border border-cad-accent shadow-[0_0_50px_rgba(34,197,94,0.2)] flex flex-col rounded-sm overflow-hidden">
      <div className="h-10 bg-cad-bg flex items-center justify-between px-4 border-b border-cad-border">
         <div className="flex items-center gap-2">
            <FileIcon size={14} className="text-cad-accent" />
            <span className="text-xs font-black text-white uppercase tracking-wider">{selectedFile.name}</span>
         </div>
         <div className="flex items-center gap-2">
            <button onClick={onOpenExternally} className="p-2 hover:bg-cad-elevated text-cad-text-muted hover:text-cad-accent transition-all"><Maximize2 size={14}/></button>
            <button onClick={onClose} className="p-2 hover:bg-red-500 text-cad-text-muted hover:text-white transition-all"><X size={16}/></button>
         </div>
      </div>
      <div className="flex-1 bg-cad-bg relative overflow-hidden">
        <div className="flex-1 flex items-center justify-center text-[#888888] text-sm overflow-hidden bg-[#1E1E1E] relative h-full">
           {selectedFile.type === 'image' ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-[#1E1E1E]">
                <img 
                  src={convertFileSrc(selectedFile.path || '')} 
                  alt={selectedFile.name} 
                  className="max-w-full max-h-[80%] object-contain drop-shadow-md rounded-md border border-[#333333]" 
                />
              </div>
           ) : selectedFile.type === 'pdf' ? (
              <div className="w-full h-full bg-[#1E1E1E]">
                <iframe 
                  src={convertFileSrc(selectedFile.path || '')} 
                  className="w-full h-full border-none"
                  title={selectedFile.name}
                />
              </div>
           ) : ['code', 'doc', 'excel'].includes(selectedFile.type) ? (
              <div className="w-full h-full text-left pt-2 px-1 relative">
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
              <div className="flex flex-col items-center p-6 bg-[#252526] rounded-xl border border-[#333333] shadow-xl max-w-sm w-full text-center">
                 <div className="w-12 h-12 rounded-lg bg-[#333333] flex items-center justify-center mb-4">
                    <FileText size={24} className="text-[#CCCCCC]" />
                 </div>
                 <h3 className="text-white font-bold mb-1 truncate w-full px-4 text-sm">{selectedFile.name}</h3>
                 <p className="text-[11px] text-[#888888] mb-6">Preview rendering is restricted.</p>
                 <button onClick={onOpenExternally} className="px-4 py-2 bg-[#007ACC] hover:bg-[#005C99] text-white text-[11px] font-semibold rounded transition-colors w-full cursor-pointer">
                    Open Externally
                 </button>
              </div>
           )}
        </div>
      </div>
    </div>
  );
}

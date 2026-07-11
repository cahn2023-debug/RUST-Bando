import { useEffect, useRef } from "react";
import { Network, ZoomIn, RefreshCw, Share2 } from "lucide-react";

interface GraphManagementProps {
    projectId: string | number;
}

export function GraphManagement({ projectId: _projectId }: GraphManagementProps) {
    // const { t } = useTranslation();
    const graphContentRef = useRef<HTMLPreElement>(null);

    const mermaidDefinition = `
graph TD
    A[src-tauri] -->|Invoke| B[Frontend]
    B -->|Command| A
    subgraph DESIGN
        D1[components/ui]
        D2[features/map]
    end
    subgraph IMPLEMENT
        I1[features/project]
        I2[stores/useDesignSync]
    end
    B --> D1
    B --> I1
    I1 --> I2
  `;

    useEffect(() => {
        graphContentRef.current?.scrollTo({ top: 0, left: 0 });
    }, [mermaidDefinition]);

    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-cad-bg font-sans">
            <div className="h-10 border-b border-cad-border bg-cad-surface flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-2">
                    <Network size={14} className="text-cad-accent" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-cad-text-primary">
                        Project Architecture Graph
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-cad-accent/10 border border-cad-accent/20 text-[8px] font-bold text-cad-accent uppercase">
                        Live Analysis
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    <button className="p-1.5 hover:bg-cad-elevated rounded transition-colors text-cad-text-muted hover:text-cad-text-primary">
                        <RefreshCw size={12} />
                    </button>
                    <button className="p-1.5 hover:bg-cad-elevated rounded transition-colors text-cad-text-muted hover:text-cad-text-primary">
                        <ZoomIn size={12} />
                    </button>
                    <button className="p-1.5 hover:bg-cad-elevated rounded transition-colors text-cad-text-muted hover:text-cad-text-primary">
                        <Share2 size={12} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-8 flex items-center justify-center bg-[#0d1117]">
                <pre
                    ref={graphContentRef}
                    className="w-full max-w-4xl text-left text-xs text-cad-text-primary bg-black/20 border border-white/10 rounded-xl p-6 overflow-auto"
                >
                    {mermaidDefinition}
                </pre>
            </div>

            <div className="h-8 border-t border-cad-border bg-cad-surface/50 px-4 flex items-center justify-between shrink-0">
                <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-[9px] font-bold text-cad-text-muted uppercase">Modules</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-purple-500" />
                        <span className="text-[9px] font-bold text-cad-text-muted uppercase">Relations</span>
                    </div>
                </div>
                <span className="text-[9px] font-mono text-cad-text-muted/60 uppercase">
                    Grapuco Sync: a10fa941-54e0-489a-89bd-87411333c0a5
                </span>
            </div>
        </div>
    );
}

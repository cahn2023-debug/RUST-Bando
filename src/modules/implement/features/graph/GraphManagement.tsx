import { useEffect, useRef } from "react";
import mermaid from "mermaid";
import { Network, ZoomIn, RefreshCw, Share2 } from "lucide-react";

mermaid.initialize({
    startOnLoad: true,
    theme: "dark",
    securityLevel: "loose",
    fontFamily: "Inter, var(--font-sans)",
});

interface GraphManagementProps {
    projectId: number;
}

export function GraphManagement({ projectId: _projectId }: GraphManagementProps) {
    // const { t } = useTranslation();
    const graphContentRef = useRef<HTMLDivElement>(null);

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
        if (graphContentRef.current) {
            graphContentRef.current.removeAttribute('data-processed');
            mermaid.contentLoaded();
        }
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
                <div ref={graphContentRef} className="mermaid w-full max-w-4xl text-center">
                    {mermaidDefinition}
                </div>
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

import { useEffect, useRef } from "react";
import { Network, ZoomIn, RefreshCw, Share2 } from "lucide-react";

interface GraphManagementProps {
    projectId: string | number;
}

export function GraphManagement({ projectId: _projectId }: GraphManagementProps) {
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
        <div className="flex h-full flex-col overflow-hidden bg-cad-bg font-sans">
            <div className="cad-toolbar">
                <div className="flex items-center gap-2">
                    <Network size={14} className="text-cad-accent" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-cad-text-primary">
                        Project Architecture Graph
                    </span>
                    <span className="cad-badge cad-badge-accent">Live Analysis</span>
                </div>

                <div className="flex items-center gap-1">
                    <button className="cad-icon-button">
                        <RefreshCw size={12} />
                    </button>
                    <button className="cad-icon-button">
                        <ZoomIn size={12} />
                    </button>
                    <button className="cad-icon-button">
                        <Share2 size={12} />
                    </button>
                </div>
            </div>

            <div className="flex flex-1 items-center justify-center overflow-auto bg-cad-bg p-8">
                <pre
                    ref={graphContentRef}
                    className="cad-card w-full max-w-4xl overflow-auto p-6 text-left text-xs text-cad-text-primary"
                >
                    {mermaidDefinition}
                </pre>
            </div>

            <div className="cad-statusbar">
                <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full bg-cad-accent" />
                        <span className="text-[9px] font-bold uppercase text-cad-text-muted">Modules</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full bg-purple-500" />
                        <span className="text-[9px] font-bold uppercase text-cad-text-muted">Relations</span>
                    </div>
                </div>
                <span className="text-[9px] font-mono uppercase text-cad-text-muted/60">
                    Grapuco Sync: a10fa941-54e0-489a-89bd-87411333c0a5
                </span>
            </div>
        </div>
    );
}

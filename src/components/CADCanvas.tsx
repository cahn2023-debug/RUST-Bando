import { useMemo } from "react";
import { ZoomIn, ZoomOut, Maximize2, Move } from "lucide-react";

export function CADCanvas({ projectName }: { projectName: string }) {
  // Generate some dummy technical elements for the CAD feel
  const entities = useMemo(() => {
    return [
      { type: "rect", x: 100, y: 100, w: 200, h: 150, stroke: "#22C55E" },
      { type: "circle", cx: 400, cy: 200, r: 50, stroke: "#3B82F6" },
      { type: "line", x1: 50, y1: 50, x2: 500, y2: 350, stroke: "#EF4444" },
      { type: "text", x: 105, y: 95, text: "A-01", fill: "#FFFFFF" },
    ];
  }, []);

  return (
    <div className="relative flex-1 bg-[#0A0A0B] overflow-hidden group">
      {/* CAD Grid Background */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(to right, #333 1px, transparent 1px),
            linear-gradient(to bottom, #333 1px, transparent 1px),
            linear-gradient(to right, #222 1px, transparent 1px),
            linear-gradient(to bottom, #222 1px, transparent 1px)
          `,
          backgroundSize: '100px 100px, 100px 100px, 20px 20px, 20px 20px'
        }}
      />

      {/* SVG Drawing Area */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {entities.map((e, i) => {
          if (e.type === "rect") return <rect key={i} x={e.x} y={e.y} width={e.w} height={e.h} fill="none" stroke={e.stroke} strokeWidth="1" />;
          if (e.type === "circle") return <circle key={i} cx={e.cx} cy={e.cy} r={e.r} fill="none" stroke={e.stroke} strokeWidth="1" />;
          if (e.type === "line") return <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={e.stroke} strokeWidth="1" />;
          if (e.type === "text") return <text key={i} x={e.x} y={e.y} fill={e.fill} fontSize="10" fontFamily="monospace">{e.text}</text>;
          return null;
        })}
      </svg>

      {/* Floating CAD HUD */}
      <div className="absolute top-4 left-4 p-3 bg-cad-bg/80 border border-cad-border backdrop-blur-sm rounded shadow-2xl">
        <div className="text-[10px] font-mono text-cad-accent mb-1 font-bold">MODEL SPACE</div>
        <div className="text-xs font-display font-black text-white uppercase tracking-wider">{projectName}</div>
        <div className="mt-2 h-[1px] bg-cad-border w-full" />
        <div className="mt-2 text-[9px] font-mono text-cad-text-muted">
          X: 1240.42 <br/>
          Y: 890.12 <br/>
          Z: 0.00
        </div>
      </div>

      {/* Navigation Controls (Bottom Right) */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <CADNavButton icon={ZoomIn} />
        <CADNavButton icon={ZoomOut} />
        <CADNavButton icon={Move} />
        <CADNavButton icon={Maximize2} />
      </div>

      {/* Floating ViewCube METAPHOR */}
      <div className="absolute top-4 right-4 w-12 h-12 bg-cad-surface border border-cad-border flex items-center justify-center rounded-sm rotate-45 group-hover:rotate-0 transition-transform duration-500 shadow-lg">
        <div className="text-[8px] font-mono font-bold text-cad-text-muted -rotate-45 group-hover:rotate-0 transition-transform">TOP</div>
      </div>

      {/* Crosshair Metaphor */}
      <div className="absolute inset-0 pointer-events-none cursor-crosshair">
        <div className="absolute left-1/2 top-0 bottom-0 w-[0.5px] bg-cad-accent/30" />
        <div className="absolute top-1/2 left-0 right-0 h-[0.5px] bg-cad-accent/30" />
      </div>
    </div>
  );
}

function CADNavButton({ icon: Icon }: { icon: any }) {
  return (
    <button className="p-2 bg-cad-surface/80 border border-cad-border text-cad-text-secondary hover:text-cad-accent hover:bg-cad-elevated backdrop-blur-sm transition-all rounded-sm">
      <Icon size={14} />
    </button>
  );
}

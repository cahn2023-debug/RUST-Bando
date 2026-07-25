import React, { useState } from "react";
import { Terminal, Sparkles, Send } from "lucide-react";

export function CommandPrompt() {
  const [input, setInput] = useState("");

  const handleCommand = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && input.trim()) {
      console.log("Execute command:", input);
      setInput("");
    }
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[600px] pointer-events-auto bg-cad-surface/90 backdrop-blur-md border border-cad-border rounded shadow-2xl overflow-hidden flex flex-col group/cmd">
      <div className="bg-cad-bg/50 px-3 py-1 flex items-center justify-between border-b border-cad-border/50">
        <div className="flex items-center gap-2">
          <Terminal size={10} className="text-cad-accent" />
          <span className="text-[9px] font-black tracking-widest text-cad-text-muted uppercase">Command Console</span>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-1 text-[8px] text-cad-accent hover:text-cad-active transition-colors font-bold uppercase"><Sparkles size={10} /> AI Command</button>
        </div>
      </div>
      <div className="p-2 flex flex-col gap-1 max-h-[80px] overflow-y-auto text-[9px] font-mono text-cad-text-muted scrollbar-hide">
        <div className="opacity-50 tracking-tighter lowercase">sys: v0.4.2 stable build</div>
        <div className="text-cad-accent/40">drawing: viewport normalized (0,0,1024,1024)</div>
        <div className="flex gap-2"><span>cmd:</span> <span className="text-cad-text-primary">_LINE</span></div>
      </div>
      <div className="flex items-center bg-cad-bg border-t border-cad-border/30 p-1">
        <span className="text-cad-accent font-black mx-2 text-[12px] font-mono select-none">_</span>
        <input 
          type="text" 
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleCommand}
          placeholder="ENTER COMMAND OR ASK AI ASSISTANT..."
          className="flex-1 bg-transparent text-cad-text-primary font-mono text-[10px] outline-none placeholder:text-cad-text-muted/30 uppercase tracking-tight"
        />
        <button onClick={() => setInput("")} className="p-1.5 text-cad-text-muted hover:text-cad-accent transition-colors"><Send size={12}/></button>
      </div>
    </div>
  );
}

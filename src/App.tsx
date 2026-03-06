import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HardDrive, FolderOpen, Plus, LayoutGrid } from "lucide-react";
import { Project } from "./types";
import { CreateProjectModal } from "./components/CreateProjectModal";
import { open } from "@tauri-apps/plugin-dialog";

// AutoCAD Style Components
import { TitleBar } from "./components/TitleBar";
import { Ribbon } from "./components/Ribbon";
import { CommandLine } from "./components/CommandLine";
import { StatusBar } from "./components/StatusBar";
import { ProjectDetail } from "./components/ProjectDetail";

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("HOME");

  // Search State

  const loadProjects = async () => {
    try {
      setLoading(true);
      const saved = localStorage.getItem('recent_pmps');
      if (saved) {
        setProjects(JSON.parse(saved));
      } else {
        setProjects([]);
      }
    } catch (err) {
      console.error("Failed to load projects:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleOpenProject = async () => {
    try {
      const selectedPath = await open({
        filters: [{ name: 'PMP Database', extensions: ['pmp'] }],
        multiple: false,
        directory: false,
      });

      if (selectedPath && typeof selectedPath === 'string') {
        await invoke("load_pmp_file", { path: selectedPath });
        const projectData = await invoke<Project[]>("get_projects");
        
        if (projectData && projectData.length > 0) {
           const p = projectData[0];
           setSelectedProject(p);
           setActiveTab("DESIGN"); // Auto jump to design module
           invoke("index_project_files", { path: p.path }).catch(console.error);
           
           const existParams = projects.filter(x => x.path !== p.path);
           const newRecent = [p, ...existParams].slice(0, 10);
           setProjects(newRecent);
           localStorage.setItem('recent_pmps', JSON.stringify(newRecent));
        } else {
           alert("The selected PMP file is empty or not properly initialized.");
        }
      }
    } catch (e) {
      console.error("Error opening PMP:", e);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-cad-bg text-cad-text-primary font-sans">
      <TitleBar />
      <Ribbon activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Main Work Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {selectedProject ? (
            <ProjectDetail 
              project={selectedProject} 
              activeTab={activeTab}
            />
          ) : (
            <div className="flex-1 flex flex-col p-8 overflow-y-auto custom-scrollbar">
              <div className="max-w-5xl mx-auto w-full">
                <div className="flex items-center justify-between border-b border-cad-border pb-4 mb-8">
                  <div className="flex items-center gap-3">
                    <LayoutGrid className="text-cad-accent" size={24} />
                    <h2 className="text-xl font-display font-bold tracking-tight">RECENT WORKSPACES</h2>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleOpenProject}
                      className="px-4 py-1.5 bg-cad-surface hover:bg-cad-elevated border border-cad-border text-xs font-bold rounded-sm transition-colors flex items-center gap-2"
                    >
                      <FolderOpen size={14} /> OPEN PMP
                    </button>
                    <button 
                      onClick={() => setShowCreate(true)}
                      className="px-4 py-1.5 bg-cad-accent hover:bg-cad-accent/80 text-black text-xs font-black rounded-sm transition-colors flex items-center gap-2"
                    >
                      <Plus size={14} /> NEW PROJECT
                    </button>
                  </div>
                </div>

                {loading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-24 bg-cad-surface animate-pulse border border-cad-border rounded-sm"></div>
                    ))}
                  </div>
                ) : projects.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center border-2 border-dashed border-cad-border bg-cad-surface/30 rounded-lg">
                    <HardDrive size={48} className="text-cad-text-muted mb-4" />
                    <h3 className="text-lg font-display font-bold text-cad-text-secondary">NO PROJECT DATA FOUND</h3>
                    <p className="text-cad-text-muted text-xs font-mono mt-2">INITIALIZE A NEW WORKSPACE TO BEGIN DESIGNING</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {projects.map((p) => (
                      <div 
                        key={p.id} 
                        className="group bg-cad-surface border border-cad-border hover:border-cad-accent p-5 flex items-start gap-4 cursor-pointer transition-all hover:bg-cad-elevated"
                        onClick={async () => {
                          try {
                            await invoke("load_pmp_file", { path: p.path });
                            setSelectedProject(p);
                            setActiveTab("DESIGN");
                            invoke("index_project_files", { path: p.path }).catch(console.error);
                          } catch (e) {
                            alert("Failed to load project");
                          }
                        }}
                      >
                        <div className="p-3 bg-cad-bg rounded-sm text-cad-accent group-hover:scale-110 transition-transform border border-cad-border">
                          <HardDrive size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-display font-black text-sm group-hover:text-cad-accent transition-colors truncate uppercase">{p.name}</h4>
                          <p className="text-[10px] font-mono text-cad-text-muted mt-1 truncate" title={p.path}>{p.path}</p>
                          <div className="mt-3 h-[1px] bg-cad-border w-full group-hover:bg-cad-accent/30 transition-colors" />
                          <div className="mt-3 flex justify-between items-center">
                            <span className="text-[9px] font-mono text-cad-text-muted uppercase">Status: OK</span>
                            <span className="text-[9px] font-mono text-cad-accent opacity-0 group-hover:opacity-100 transition-opacity font-bold underline">OPEN PROJECT</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <CommandLine />
      <StatusBar />

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onSuccess={loadProjects} />}
    </div>
  );
}



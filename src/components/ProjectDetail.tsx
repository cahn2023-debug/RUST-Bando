import React, { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { open } from "@tauri-apps/plugin-dialog";
import { Plus, CheckCircle2, Circle, ChevronRight, ChevronLeft, ChevronDown, FileText, Folder, Globe, Search, File as FileIcon, X, Briefcase, Maximize2 } from "lucide-react";
import { Project, Task, FileNode, Note, Contract, SearchResult, TaskDependency } from "../types";
import { format, addDays, differenceInDays, eachDayOfInterval, startOfWeek, endOfWeek, isSameDay, startOfMonth, endOfMonth, isSameMonth, addMonths, subMonths } from "date-fns";
import { CADCanvas } from "./CADCanvas";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import Editor from "@monaco-editor/react";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Props {
  project: Project;
  activeTab: string;
}

export function ProjectDetail({ project, activeTab }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [fileNodes, setFileNodes] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  
  const [viewMode, setViewMode] = useState<'tasks'|'contracts'|'kanban'|'search'|'calendar'>('tasks');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [addingContract, setAddingContract] = useState(false);
  const [newContractForm, setNewContractForm] = useState<Partial<Contract>>({});

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; text: string } | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<HTMLDivElement>(null);

  const [selectedFile, setSelectedFile] = useState<{name: string, type: 'doc' | 'excel' | 'code' | 'image' | 'pdf', path?: string} | null>(null);
  const [fileContent, setFileContent] = useState("");

  const [rightTab, setRightTab] = useState<'tasks'|'notes'>('tasks');
  const [notes, setNotes] = useState<Note[]>([]);
  const [addingNote, setAddingNote] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const processedTasks = useMemo(() => {
    return tasks.map(t => {
      if (t.status === 'folder') {
        const children = tasks.filter(child => child.parent_id === t.id && child.start_date && child.end_date);
        if (children.length > 0) {
          const starts = children.map(c => new Date(c.start_date!).getTime());
          const ends = children.map(c => new Date(c.end_date!).getTime());
          return {
            ...t,
            start_date: new Date(Math.min(...starts)).toISOString(),
            end_date: new Date(Math.max(...ends)).toISOString()
          };
        }
      }
      return t;
    });
  }, [tasks]);

  useEffect(() => {
    if (selectedFile?.path) {
      if (selectedFile.type === 'code') {
        invoke<string>("read_file_content", { path: selectedFile.path })
          .then(setFileContent)
          .catch(console.error);
      } else if (selectedFile.type === 'doc' || selectedFile.type === 'excel') {
        invoke<string>("preview_document_text", { path: selectedFile.path })
          .then(setFileContent)
          .catch(console.error);
      } else {
        setFileContent("");
      }
    } else {
      setFileContent("");
    }
  }, [selectedFile]);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const data = await invoke<Task[]>("get_tasks", { projectId: project.id });
      setTasks(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadFileTree = async () => {
    try {
      const data = await invoke<FileNode[]>("get_project_tree", { projectId: project.id, path: project.path });
      console.log("File tree loaded:", data);
      setFileNodes(data);
    } catch (err) {
      console.error("Error loading file tree:", err);
    }
  };

  const handleAddFolder = async () => {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: "Select Folder to Add"
      });
      if (selectedPath && typeof selectedPath === 'string') {
        await invoke("add_project_folder", { projectId: project.id, folderPath: selectedPath });
        loadFileTree();
      }
    } catch (err) {
      console.error("Failed to add folder:", err);
    }
  };

  const loadNotes = async () => {
    try {
      const data = await invoke<Note[]>("get_notes", { projectId: project.id });
      setNotes(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadDependencies = async () => {
    try {
      const data = await invoke<TaskDependency[]>("get_task_dependencies", { projectId: project.id });
      setDependencies(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadContracts = async () => {
    try {
      const data = await invoke<Contract[]>("get_contracts", { projectId: project.id });
      setContracts(data);
    } catch (err) {
      console.error("Error loading contracts:", err);
    }
  };

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#preview-pane-container')) return;

      const selection = window.getSelection()?.toString().trim();
      if (selection && selection.length > 0) {
        e.preventDefault();
        setContextMenu({ x: e.pageX, y: e.pageY, text: selection });
      }
    };
    const handleClick = () => setContextMenu(null);
    
    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("click", handleClick);
    };
  }, []);

  useEffect(() => {
    loadTasks();
    loadFileTree();
    loadNotes();
    loadContracts();
    loadDependencies();
    
    // Trigger background indexing for the project root
    invoke("index_project_files", { path: project.path }).catch(err => {
      console.error("Background indexing failed:", err);
    });
  }, [project.id, project.path]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim()) return;
    try {
      const predictedDays = await invoke<number>("predict_task", { taskName: newTaskName });
      const start = new Date();
      const end = addDays(start, predictedDays);
      await invoke("create_task", {
        projectId: project.id,
        parentId: null,
        name: newTaskName,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        color: "#6366f1",
        status: "todo",
        targetFilePath: selectedFile?.path || null
      });
      setNewTaskName("");
      setAddingTask(false);
      loadTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateGroup = async () => {
    try {
      await invoke("create_task", {
        projectId: project.id,
        parentId: null,
        name: "New Group",
        startDate: null,
        endDate: null,
        color: "#1E1E1E",
        status: "folder"
      });
      loadTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteTitle.trim()) return;
    try {
      await invoke("create_note", {
        projectId: project.id,
        title: newNoteTitle,
        content: null,
        targetFilePath: selectedFile?.path || null
      });
      setNewNoteTitle("");
      setAddingNote(false);
      loadNotes();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!confirm("Delete this note?")) return;
    try {
      await invoke("delete_note", { noteId });
      loadNotes();
    } catch (err) {
      console.error(err);
    }
  };
  
  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContractForm.name?.trim()) return;
    try {
      await invoke("create_contract", {
        projectId: project.id,
        name: newContractForm.name,
        contractNumber: newContractForm.contract_number || null,
        vendor: newContractForm.vendor || null,
        value: newContractForm.value ? parseFloat(newContractForm.value as any) : null,
        signedDate: newContractForm.signed_date || null,
        notes: newContractForm.notes || null
      });
      setNewContractForm({});
      setAddingContract(false);
      loadContracts();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteContract = async (contractId: number) => {
    if (!confirm("Delete this contract?")) return;
    try {
      await invoke("delete_contract", { contractId });
      loadContracts();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleTask = async (task: Task) => {
    try {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_completed: !t.is_completed } : t));
      await invoke("toggle_task", { taskId: task.id, isCompleted: !task.is_completed});
    } catch (err) {
      console.error(err);
      loadTasks();
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    try {
      const results = await invoke<SearchResult[]>("search_documents", { query });
      setSearchResults(results);
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId: number, status: string) => {
    try {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
      await invoke("update_task_status", { taskId, status });
    } catch (err) {
      console.error(err);
      loadTasks();
    }
  };

  const handleUpdateDates = async (task: Task, start: string | null, end: string | null) => {
    try {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, start_date: start, end_date: end } : t));
      await invoke("update_task_dates", {
        taskId: task.id,
        startDate: start,
        endDate: end
      });
    } catch (err) {
      console.error(err);
      loadTasks();
    }
  };

  const handleDropToGroup = async (e: React.DragEvent, parentId: number | null) => {
    e.preventDefault();
    const taskIdStr = e.dataTransfer.getData("taskId");
    if (!taskIdStr) return;
    const taskId = parseInt(taskIdStr);
    
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === 'folder' || task.id === parentId) return;

    // Optimistic UI
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, parent_id: parentId } : t));
    
    try {
      await invoke("update_task_parent", { taskId, parentId });
      loadTasks(); 
    } catch (err) {
      console.error(err);
      loadTasks();
    }
  };


  const handleGridScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (ganttRef.current && ganttRef.current.scrollTop !== e.currentTarget.scrollTop) {
      ganttRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleGanttScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (gridRef.current && gridRef.current.scrollTop !== e.currentTarget.scrollTop) {
      gridRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleOpenExternally = async () => {
    if (selectedFile && selectedFile.path) {
      try {
        await openPath(selectedFile.path);
      } catch (err) {
        console.error("Failed to open file externally:", err);
      }
    } else {
      console.warn("No valid path to open.");
    }
  };

  const handleEditorDidMount = (editor: any) => {
    editor.addAction({
      id: "add_to_task",
      label: "✨ Add to Task",
      contextMenuGroupId: "navigation",
      contextMenuOrder: 1,
      run: (ed: any) => {
        const text = ed.getModel()?.getValueInRange(ed.getSelection());
        if (text) {
           setAddingTask(true);
           setNewTaskName(text);
           setRightTab('tasks');
        }
      }
    });

    editor.addAction({
      id: "add_to_note",
      label: "✨ Add to Note",
      contextMenuGroupId: "navigation",
      contextMenuOrder: 2,
      run: (ed: any) => {
        const text = ed.getModel()?.getValueInRange(ed.getSelection());
        if (text) {
           setAddingNote(true);
           setNewNoteTitle(text.slice(0, 30) + (text.length > 30 ? "..." : ""));
           setRightTab('notes');
        }
      }
    });
  };
  const handleTaskClick = (target_file_path?: string | null) => {
    if (target_file_path) {
      const name = target_file_path.split(/[/\\]/).pop() || 'Unknown';
      const extension = name.split('.').pop()?.toLowerCase();
      const type = (extension === 'xlsx' || extension === 'csv') ? 'excel' : 
                   (extension === 'docx') ? 'doc' : 
                   (['png','jpg','jpeg','gif'].includes(extension || '')) ? 'image' :
                   (extension === 'pdf') ? 'pdf' : 'code';
      setSelectedFile({ name, type, path: target_file_path });
    }
  };

  const renderFileNodes = (nodes: FileNode[]) => {
    return nodes.map((node) => {
      if (node.is_dir) {
        return (
          <FolderTree key={node.path} name={node.name} expanded={false}>
            {node.children && renderFileNodes(node.children)}
          </FolderTree>
        );
      }
      return (
         <FileItem 
           key={node.path} 
           name={node.name} 
           type={node.extension?.toLowerCase() === 'xlsx' || node.extension?.toLowerCase() === 'csv' ? 'excel' : 
                 node.extension?.toLowerCase() === 'docx' ? 'doc' : 
                 ['png','jpg','jpeg','gif'].includes(node.extension?.toLowerCase() || '') ? 'image' :
                 node.extension?.toLowerCase() === 'pdf' ? 'pdf' : 'code'}
           isActive={selectedFile?.path === node.path}
           onSelect={() => {
             setSelectedFile({
               name: node.name, 
               type: node.extension?.toLowerCase() === 'xlsx' || node.extension?.toLowerCase() === 'csv' ? 'excel' : 
                     node.extension?.toLowerCase() === 'docx' ? 'doc' : 
                     ['png','jpg','jpeg','gif'].includes(node.extension?.toLowerCase() || '') ? 'image' :
                     node.extension?.toLowerCase() === 'pdf' ? 'pdf' : 'code',
               path: node.path
             });
           }}
           path={node.path}
        />
      );
    });
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-cad-bg">
      {/* 1. Sidebar - Context Aware */}
      <div className="w-[300px] border-r border-cad-border flex flex-col shrink-0 bg-cad-surface group/sidebar">
        <div className="p-3 border-b border-cad-border flex justify-between items-center bg-cad-bg/50">
           <span className="text-[10px] font-black text-cad-accent tracking-widest uppercase">
             {activeTab === 'DESIGN' ? 'Drawing Explorer' : activeTab === 'OPERATE' ? 'Contract Records' : 'Workspace Explorer'}
           </span>
           <button onClick={handleAddFolder} className="p-1 hover:bg-cad-elevated text-cad-text-muted hover:text-cad-accent transition-colors"><Plus size={14}/></button>
        </div>
        
        {/* Search within Sidebar */}
        <div className="p-3 border-b border-cad-border">
          <div className="relative group/search flex items-center bg-cad-bg border border-cad-border focus-within:border-cad-accent transition-all rounded-sm overflow-hidden">
            <div className="pl-2.5 pr-2"><Search size={12} className="text-cad-text-muted group-focus-within/search:text-cad-accent" /></div>
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="QUICK SEARCH..." 
              className="w-full bg-transparent text-[10px] font-mono py-1.5 pr-2 text-cad-text-primary placeholder:text-cad-text-muted outline-none uppercase" 
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {searchQuery ? (
            <div className="p-3 flex flex-col gap-2">
               {isSearching && <div className="text-[10px] text-cad-text-muted italic animate-pulse">SEARCHING DATABASE...</div>}
               {searchResults.map((res, idx) => (
                 <div key={idx} onClick={() => handleTaskClick(res.file_path)} className="p-2 border border-cad-border hover:border-cad-accent bg-cad-bg/30 cursor-pointer transition-all rounded-sm group/item">
                    <div className="flex items-center gap-2 mb-1">
                      <FileIcon size={12} className="text-cad-accent" />
                      <span className="text-[10px] font-bold text-white uppercase truncate">{res.title}</span>
                    </div>
                    <div className="text-[9px] text-cad-text-muted line-clamp-2 font-mono leading-tight" dangerouslySetInnerHTML={{__html: res.snippet}} />
                 </div>
               ))}
            </div>
          ) : (
            <div className="py-2">
              <FolderTree name={project.name.toUpperCase()} expanded>
                {renderFileNodes(fileNodes)}
              </FolderTree>
            </div>
          )}
        </div>
      </div>

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'DESIGN' ? (
          <CADCanvas projectName={project.name} />
        ) : activeTab === 'OPERATE' ? (
          <div className="flex-1 overflow-y-auto p-6 bg-cad-bg custom-scrollbar">
            {/* Contracts View (Module 3) */}
            <div className="max-w-4xl mx-auto">
               <div className="flex justify-between items-center mb-8">
                  <h2 className="text-xl font-display font-black text-white tracking-tight uppercase">Contract Management</h2>
                  <button onClick={() => setAddingContract(true)} className="px-4 py-1.5 bg-cad-accent text-black text-xs font-black rounded-sm hover:bg-cad-accent/80 transition-colors flex items-center gap-2">
                    <Plus size={14}/> NEW CONTRACT
                  </button>
               </div>
               
               {addingContract && (
                  <form onSubmit={handleCreateContract} className="mb-8 bg-cad-surface border border-cad-accent p-6 rounded-sm shadow-2xl">
                    <div className="grid grid-cols-2 gap-6 mb-6">
                       <CADInput label="Contract Name" value={newContractForm.name || ""} onChange={v => setNewContractForm(p => ({...p, name: v}))} />
                       <CADInput label="Contract Number" value={newContractForm.contract_number || ""} onChange={v => setNewContractForm(p => ({...p, contract_number: v}))} />
                       <CADInput label="Vendor" value={newContractForm.vendor || ""} onChange={v => setNewContractForm(p => ({...p, vendor: v}))} />
                       <CADInput label="Value" type="number" value={newContractForm.value || ""} onChange={v => setNewContractForm(p => ({...p, value: parseFloat(v)}))} />
                       <CADInput label="Signed Date" type="date" value={newContractForm.signed_date || ""} onChange={v => setNewContractForm(p => ({...p, signed_date: v}))} />
                    </div>
                    <div className="flex justify-end gap-3">
                       <button type="button" onClick={() => setAddingContract(false)} className="px-4 py-1.5 text-xs font-bold text-cad-text-muted hover:text-white uppercase">Cancel</button>
                       <button type="submit" className="px-4 py-1.5 bg-cad-accent text-black text-xs font-black rounded-sm uppercase">Create Record</button>
                    </div>
                  </form>
               )}

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {contracts.map(c => (
                    <div key={c.id} className="bg-cad-surface border border-cad-border p-5 hover:border-cad-accent transition-all group/card relative">
                       <button onClick={() => handleDeleteContract(c.id)} className="absolute top-4 right-4 text-cad-text-muted hover:text-red-500 opacity-0 group-hover/card:opacity-100 transition-opacity"><X size={14}/></button>
                       <div className="text-[9px] font-mono text-cad-accent mb-1 font-bold">{c.contract_number || 'PENDING'}</div>
                       <h3 className="font-display font-black text-sm text-white mb-4 uppercase">{c.name}</h3>
                       <div className="flex justify-between items-center text-[10px] font-mono">
                          <span className="text-cad-text-muted uppercase">Vendor: <span className="text-white">{c.vendor || '---'}</span></span>
                          <span className="text-cad-accent font-bold">${c.value?.toLocaleString() || '0'}</span>
                       </div>
                    </div>
                  ))}
               </div>
            </div>
          </div>
        ) : (
          /* IMPLEMENT Tab - Module 2 (Gantt/Tasks) */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Sub-navigation for IMPLEMENT */}
            <div className="h-[34px] bg-cad-surface border-b border-cad-border flex items-center px-4 gap-4">
               <ViewToggle current={viewMode} onChange={setViewMode} />
               <div className="w-[1px] h-4 bg-cad-border mx-2" />
               <button onClick={() => setAddingTask(true)} className="flex items-center gap-1.5 text-[10px] font-bold text-cad-text-secondary hover:text-cad-accent transition-colors"><Plus size={12}/> ADD TASK</button>
            </div>

            <div className="flex-1 flex overflow-hidden">
               {viewMode === 'tasks' ? (
                 <>
                   <div className="w-[400px] border-r border-cad-border bg-cad-surface overflow-hidden flex flex-col shrink-0">
                      <div className="flex h-7 bg-cad-bg border-b border-cad-border text-[9px] font-black text-cad-text-muted items-center px-3 uppercase tracking-tighter">
                         <div className="w-8 shrink-0">ID</div>
                         <div className="flex-1 px-3">Description</div>
                         <div className="w-32 shrink-0 text-center">Timeline</div>
                      </div>
                      <div className="flex-1 overflow-y-auto custom-scrollbar" ref={gridRef} onScroll={handleGridScroll}>
                         {processedTasks.map((t, i) => (
                           <TaskRow key={t.id} task={t} index={i} onToggle={() => handleToggleTask(t)} onSelect={handleTaskClick} />
                         ))}
                      </div>
                   </div>
                   <div className="flex-1 overflow-auto bg-cad-bg custom-scrollbar" ref={ganttRef} onScroll={handleGanttScroll}>
                      <GanttTimeline tasks={processedTasks} dependencies={dependencies} loading={loading} onUpdateTaskDates={handleUpdateDates} />
                   </div>
                 </>
               ) : viewMode === 'kanban' ? (
                  <KanbanView tasks={tasks} onUpdateStatus={handleUpdateTaskStatus} onClick={handleTaskClick} />
               ) : viewMode === 'calendar' ? (
           <CalendarView days={calendarDays} tasks={tasks} month={currentMonth} onMonthChange={setCurrentMonth} onClick={handleTaskClick} />
               ) : null}
            </div>
          </div>
        )}
        
        {/* Global Context Menu Float */}
        {contextMenu && (
          <div 
            className="fixed z-[200] bg-cad-surface border border-cad-accent rounded-sm shadow-2xl flex flex-col min-w-[180px] overflow-hidden"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button 
              className="px-4 py-2.5 text-left text-[10px] font-black text-cad-text-primary hover:bg-cad-accent hover:text-black transition-all flex items-center gap-3 uppercase"
              onClick={() => {
                if (contextMenu) {
                  setAddingTask(true);
                  setNewTaskName(contextMenu.text);
                  setRightTab('tasks');
                  setContextMenu(null);
                }
              }}
            >
              <Plus size={12} /> Add as Task
            </button>
            <div className="h-px bg-cad-border w-full" />
            <button 
              className="px-4 py-2.5 text-left text-[10px] font-black text-cad-text-primary hover:bg-cad-accent hover:text-black transition-all flex items-center gap-3 uppercase"
              onClick={() => {
                if (contextMenu) {
                  setAddingNote(true);
                  setNewNoteTitle(contextMenu.text.slice(0, 30) + (contextMenu.text.length > 30 ? "..." : ""));
                  setRightTab('notes');
                  setContextMenu(null);
                }
              }}
            >
              <FileText size={12} /> Add as Note
            </button>
          </div>
        )}
      </div>

      {/* 3. Right Sidebar - Task Manager / Properties */}
      <div className="w-[300px] border-l border-cad-border bg-cad-surface flex flex-col shrink-0">
         <div className="h-[38px] border-b border-cad-border flex items-center justify-between px-4 bg-cad-bg/50">
            <span className="text-[10px] font-black text-cad-accent tracking-widest uppercase">Property Manager</span>
            <div className="flex gap-1">
               <button onClick={() => setRightTab('tasks')} className={cn("p-1.5 rounded-sm transition-all", rightTab === 'tasks' ? "bg-cad-accent text-black" : "text-cad-text-muted hover:text-white")}><Briefcase size={12}/></button>
               <button onClick={() => setRightTab('notes')} className={cn("p-1.5 rounded-sm transition-all", rightTab === 'notes' ? "bg-cad-accent text-black" : "text-cad-text-muted hover:text-white")}><FileText size={12}/></button>
            </div>
         </div>
         
         <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {rightTab === 'tasks' ? (
              <ProjectTasksSidebar 
                tasks={tasks} 
                onAdd={setAddingTask} 
                onAddGroup={handleCreateGroup} 
                onDrop={handleDropToGroup} 
                onSelect={handleTaskClick} 
                adding={addingTask}
                newName={newTaskName}
                setNewName={setNewTaskName}
                onSubmit={handleCreateTask}
              />
            ) : (
              <ProjectNotesSidebar 
                notes={notes} 
                onAdd={setAddingNote} 
                onDelete={handleDeleteNote}
                onSelect={handleTaskClick} 
                adding={addingNote}
                newTitle={newNoteTitle}
                setNewTitle={setNewNoteTitle}
                onSubmit={handleCreateNote}
              />
            )}
         </div>
      </div>

      {/* Floating Preview Window (Only if file selected) */}
      {selectedFile && (
        <div className="fixed inset-10 z-[100] bg-cad-surface border border-cad-accent shadow-[0_0_50px_rgba(34,197,94,0.2)] flex flex-col rounded-sm overflow-hidden">
          <div className="h-10 bg-cad-bg flex items-center justify-between px-4 border-b border-cad-border">
             <div className="flex items-center gap-2">
                <FileIcon size={14} className="text-cad-accent" />
                <span className="text-xs font-black text-white uppercase tracking-wider">{selectedFile.name}</span>
             </div>
             <div className="flex items-center gap-2">
                <button onClick={handleOpenExternally} className="p-2 hover:bg-cad-elevated text-cad-text-muted hover:text-cad-accent transition-all"><Maximize2 size={14}/></button>
                <button onClick={() => setSelectedFile(null)} className="p-2 hover:bg-red-500 text-cad-text-muted hover:text-white transition-all"><X size={16}/></button>
             </div>
          </div>
          <div className="flex-1 bg-cad-bg relative overflow-hidden">
             {/* File Previewer Content */}
            <div className="flex-1 flex items-center justify-center text-[#888888] text-sm overflow-hidden bg-[#1E1E1E] relative">
               {!selectedFile ? (
                  <div className="flex flex-col items-center gap-2 opacity-50">
                    <FileText size={24} />
                    <p className="text-xs">Select a file to preview</p>
                  </div>
               ) : selectedFile.type === 'image' ? (
                  <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-[#1E1E1E]">
                    <img 
                      src={convertFileSrc(selectedFile.path || '')} 
                      alt={selectedFile.name} 
                      className="max-w-full max-h-[80%] object-contain drop-shadow-md rounded-md border border-[#333333]" 
                    />
                  </div>
               ) : selectedFile.type === 'pdf' ? (
                  <div className="w-full h-full bg-[#1E1E1E] invert-[0.8] hue-rotate-180">
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
                      onMount={handleEditorDidMount}
                    />
                  </div>
               ) : (
                  <div className="flex flex-col items-center p-6 bg-[#252526] rounded-xl border border-[#333333] shadow-xl max-w-sm w-full text-center">
                     <div className="w-12 h-12 rounded-lg bg-[#333333] flex items-center justify-center mb-4">
                        <FileText size={24} className="text-[#CCCCCC]" />
                     </div>
                     <h3 className="text-white font-bold mb-1 truncate w-full px-4 text-sm">{selectedFile.name}</h3>
                     <p className="text-[11px] text-[#888888] mb-6">Preview rendering is restricted.</p>
                     <button onClick={handleOpenExternally} className="px-4 py-2 bg-[#007ACC] hover:bg-[#005C99] text-white text-[11px] font-semibold rounded transition-colors w-full cursor-pointer">
                        Open Externally
                     </button>
                  </div>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Extract sub-components for better readability
function CADInput({ label, value, onChange, type = "text" }: { label: string, value: any, onChange: (v: string) => void, type?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[9px] font-mono font-bold text-cad-text-muted uppercase tracking-widest">{label}</label>
      <input 
        type={type} 
        value={value} 
        onChange={e => onChange(e.target.value)} 
        className="bg-cad-bg border border-cad-border focus:border-cad-accent text-[11px] text-white p-2 outline-none transition-all rounded-sm uppercase font-mono" 
      />
    </div>
  );
}

function ViewToggle({ current, onChange }: { current: string, onChange: (v: any) => void }) {
  const modes = [
    { id: 'tasks', label: 'SCHED' },
    { id: 'kanban', label: 'BOARD' },
    { id: 'calendar', label: 'PLAN' }
  ];
  return (
    <div className="flex bg-cad-bg p-0.5 rounded-sm border border-cad-border">
      {modes.map(m => (
        <button 
          key={m.id} 
          onClick={() => onChange(m.id)}
          className={cn("px-3 py-1 text-[9px] font-black rounded-sm transition-all", current === m.id ? "bg-cad-accent text-black" : "text-cad-text-muted hover:text-white")}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function TaskRow({ task, index, onToggle, onSelect }: { task: Task, index: number, onToggle: () => void, onSelect: (p: string) => void }) {
  const isFolder = task.status === 'folder';
  return (
    <div 
      className={cn(
        "flex h-9 border-b border-cad-border text-[11px] items-center cursor-pointer group transition-colors relative",
        isFolder ? "bg-cad-bg/40" : "hover:bg-cad-elevated"
      )}
      onClick={() => task.target_file_path && onSelect(task.target_file_path)}
    >
      <div className="w-8 shrink-0 text-center font-mono text-[9px] text-cad-text-muted border-r border-cad-border h-full flex items-center justify-center">{index + 1}</div>
      <div className="flex-1 flex items-center gap-3 px-3 truncate">
         {!isFolder && (
           <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="shrink-0 text-cad-text-muted hover:text-cad-accent">
             {task.is_completed ? <CheckCircle2 size={13} className="text-cad-accent" /> : <Circle size={13} />}
           </button>
         )}
         {isFolder && <Folder size={13} className="text-cad-text-muted shrink-0" />}
         <span className={cn("truncate font-bold uppercase tracking-tight", task.is_completed ? "line-through text-cad-text-muted" : "text-cad-text-primary")}>{task.name}</span>
      </div>
      <div className="w-32 shrink-0 text-[9px] font-mono text-cad-text-muted text-center border-l border-cad-border h-full flex items-center justify-center bg-cad-bg/20">
         {task.start_date ? format(new Date(task.start_date), 'MM.dd') : '--'} - {task.end_date ? format(new Date(task.end_date), 'MM.dd') : '--'}
      </div>
    </div>
  );
}

// ... existing helper components optimized ...

// Sub-components for Module 2: IMPLEMENT
function KanbanView({ tasks, onUpdateStatus, onClick }: { tasks: Task[], onUpdateStatus: (id: number, s: string) => void, onClick: (path: string) => void }) {
  const statuses = ['todo', 'in_progress', 'done'];
  return (
    <div className="flex-1 overflow-x-auto bg-cad-bg p-4 flex gap-4 custom-scrollbar">
      {statuses.map(status => {
        const columnTasks = tasks.filter(t => t.status === status);
        return (
          <div 
            key={status} 
            className="w-72 shrink-0 flex flex-col bg-cad-surface border border-cad-border rounded-sm"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("taskId");
              if (id) onUpdateStatus(parseInt(id), status);
            }}
          >
            <div className="p-3 border-b border-cad-border flex items-center justify-between bg-cad-bg/30">
               <h4 className="text-[10px] font-black uppercase tracking-widest text-cad-accent">
                 {status.replace('_', ' ')}
               </h4>
               <span className="text-[9px] font-mono bg-cad-elevated px-1.5 py-0.5 rounded text-cad-text-muted">{columnTasks.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2 custom-scrollbar">
               {columnTasks.map(t => (
                  <div 
                    key={t.id} 
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("taskId", t.id.toString())}
                    className="bg-cad-bg border border-cad-border p-3 hover:border-cad-accent transition-all cursor-grab active:cursor-grabbing group"
                    onClick={() => t.target_file_path && onClick(t.target_file_path)}
                  >
                     <div className="text-[11px] font-bold text-white mb-2 uppercase tracking-tight">{t.name}</div>
                     {t.target_file_path && (
                       <div className="flex items-center gap-1.5 text-[9px] text-cad-accent font-mono">
                          <FileIcon size={10} /> <span className="truncate">{t.target_file_path.split(/[/\\]/).pop()}</span>
                       </div>
                     )}
                  </div>
               ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarView({ days, tasks, month, onMonthChange, onClick }: { days: Date[], tasks: Task[], month: Date, onMonthChange: (d: Date) => void, onClick: (path: string) => void }) {
  return (
    <div className="flex-1 flex flex-col bg-cad-bg p-4 h-full">
      <div className="flex items-center justify-between mb-4">
         <div className="flex items-center gap-4">
            <button onClick={() => onMonthChange(subMonths(month, 1))} className="p-1 hover:bg-cad-elevated text-white"><ChevronLeft size={16}/></button>
            <h3 className="text-sm font-black text-white uppercase tracking-tighter w-40 text-center">{format(month, "MMMM yyyy")}</h3>
            <button onClick={() => onMonthChange(addMonths(month, 1))} className="p-1 hover:bg-cad-elevated text-white"><ChevronRight size={16}/></button>
         </div>
      </div>
      <div className="flex-1 border border-cad-border bg-cad-surface grid grid-cols-7 overflow-hidden rounded-sm">
         {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <div key={day} className="py-2 text-center text-[9px] font-black text-cad-text-muted uppercase border-b border-cad-border bg-cad-bg/50">{day}</div>
         ))}
         {days.map((day, idx) => {
            const currentMonth = isSameMonth(day, month);
            const today = isSameDay(day, new Date());
            const dayTasks = tasks.filter(t => t.start_date && t.end_date && t.status !== 'folder' && new Date(t.start_date) <= day && new Date(t.end_date) >= day);
            return (
              <div key={idx} className={cn("border-b border-r border-cad-border p-1 min-h-[80px] flex flex-col gap-1 transition-all", !currentMonth && "opacity-20 bg-cad-bg/50", today && "bg-cad-accent/5")}>
                 <div className={cn("text-[9px] font-mono text-right p-1", today ? "text-cad-accent font-bold" : "text-cad-text-muted")}>{format(day, "d")}</div>
                 <div className="flex-1 overflow-y-auto flex flex-col gap-1 no-scrollbar">
                    {dayTasks.map(t => (
                       <div key={t.id} onClick={() => t.target_file_path && onClick(t.target_file_path)} className={cn("text-[8px] px-1.5 py-0.5 rounded-sm truncate font-bold cursor-pointer uppercase tracking-tighter border", t.is_completed ? "bg-cad-elevated text-cad-text-muted line-through" : "bg-cad-accent/10 text-cad-accent border-cad-accent/20 hover:bg-cad-accent/20")}>
                          {t.name}
                       </div>
                    ))}
                 </div>
              </div>
            );
         })}
      </div>
    </div>
  );
}

// Sidebar Components
function ProjectTasksSidebar({ tasks, onAdd, onAddGroup, onDrop, onSelect, adding, newName, setNewName, onSubmit }: any) {
  const groups = tasks.filter((t: any) => t.status === 'folder');
  const unassigned = tasks.filter((t: any) => t.status !== 'folder' && !t.parent_id);
  
  return (
    <div className="flex flex-col gap-4">
       <div className="flex justify-between items-center bg-cad-bg/30 p-2 rounded-sm border border-cad-border">
          <span className="text-[10px] font-black text-cad-text-muted uppercase">Structure</span>
          <button onClick={onAddGroup} className="text-[9px] font-black text-cad-accent uppercase hover:underline">+ New Group</button>
       </div>
       
       <div className="flex flex-col gap-3">
          {[...groups, { id: 0, name: "Unassigned", status: "folder" }].map((g: any) => {
             const isUnassigned = g.id === 0;
             const groupTasks = isUnassigned ? unassigned : tasks.filter((t: any) => t.parent_id === g.id);
             return (
               <div 
                 key={g.id} 
                 className="bg-cad-bg/50 border border-cad-border p-2 rounded-sm min-h-[50px]"
                 onDragOver={(e) => e.preventDefault()}
                 onDrop={(e) => onDrop(e, isUnassigned ? null : g.id)}
               >
                  <div className="flex items-center gap-2 mb-2">
                     <Folder size={12} className={isUnassigned ? "text-cad-text-muted" : "text-cad-accent"} />
                     <span className="text-[10px] font-black text-white uppercase">{g.name}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                     {groupTasks.map((t: any) => (
                        <div 
                          key={t.id} 
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("taskId", t.id.toString())}
                          onClick={() => t.target_file_path && onSelect(t.target_file_path)}
                          className="bg-cad-surface px-2 py-1.5 border border-cad-border hover:border-cad-accent cursor-pointer flex items-center justify-between"
                        >
                           <span className={cn("text-[9px] font-bold uppercase truncate", t.is_completed ? "text-cad-text-muted line-through" : "text-white")}>{t.name}</span>
                           {t.target_file_path && <FileIcon size={10} className="text-cad-accent opacity-50" />}
                        </div>
                     ))}
                  </div>
               </div>
             );
          })}
       </div>

       {adding ? (
          <form onSubmit={onSubmit} className="bg-cad-bg p-3 border border-cad-accent">
             <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} className="w-full bg-cad-surface border border-cad-border p-2 text-[10px] text-white outline-none" placeholder="TASK NAME..." />
             <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => onAdd(false)} className="text-[9px] font-black text-cad-text-muted hover:text-white uppercase transition-all">Cancel</button>
                <button type="submit" className="text-[9px] font-black bg-cad-accent text-black px-2 py-1 rounded-sm uppercase transition-all hover:bg-cad-accent/80">Save</button>
             </div>
          </form>
       ) : (
          <button onClick={() => onAdd(true)} className="w-full py-2 border border-cad-border border-dashed text-[10px] font-bold text-cad-text-muted hover:text-cad-accent hover:border-cad-accent transition-all uppercase">
             + NEW TASK
          </button>
       )}
    </div>
  );
}

function ProjectNotesSidebar({ notes, onAdd, onDelete, adding, newTitle, setNewTitle, onSubmit }: any) {
   return (
      <div className="flex flex-col gap-4">
         {adding ? (
            <form onSubmit={onSubmit} className="bg-cad-bg p-3 border border-cad-accent">
               <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full bg-cad-surface border border-cad-border p-2 text-[10px] text-white outline-none" placeholder="NOTE TITLE..." />
               <div className="flex justify-end gap-2 mt-2">
                  <button type="button" onClick={() => onAdd(false)} className="text-[9px] font-black text-cad-text-muted hover:text-white uppercase transition-all">Cancel</button>
                  <button type="submit" className="text-[9px] font-black bg-cad-accent text-black px-2 py-1 rounded-sm uppercase transition-all hover:bg-cad-accent/80">Keep</button>
               </div>
            </form>
         ) : (
            <button onClick={() => onAdd(true)} className="w-full py-2 border border-cad-border border-dashed text-[10px] font-bold text-cad-text-muted hover:text-cad-accent hover:border-cad-accent transition-all uppercase">
               + RECORD NOTE
            </button>
         )}

         <div className="flex flex-col gap-2">
            {notes.map((n: any) => (
               <div key={n.id} className="bg-cad-bg/50 border border-cad-border p-3 hover:border-cad-accent transition-all group relative">
                  <button onClick={() => onDelete(n.id)} className="absolute top-2 right-2 text-cad-text-muted hover:text-red-500 opacity-0 group-hover:opacity-100"><X size={12}/></button>
                  <h4 className="text-[10px] font-black text-white uppercase mb-1">{n.title}</h4>
                  <div className="text-[8px] font-mono text-cad-text-muted uppercase">{format(new Date(n.created_at), 'MM/dd HH:mm')}</div>
                  {n.target_file_path && (
                     <div className="mt-2 text-[9px] font-mono text-cad-accent flex items-center gap-1">
                        <FileIcon size={10} /> {n.target_file_path.split(/[/\\]/).pop()}
                     </div>
                  )}
               </div>
            ))}
         </div>
      </div>
   );
}


// Tree view components
function FolderTree({ name, expanded = false, children }: { name: string, expanded?: boolean, children?: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(expanded);
  return (
    <div className="select-none mb-0">
      <div 
        className="flex items-center gap-1.5 py-1 px-1.5 hover:bg-cad-elevated rounded-sm cursor-pointer group transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="text-cad-text-muted shrink-0 w-4 transition-colors flex justify-center mt-0.5">
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </div>
        <Folder size={12} className="text-cad-accent shrink-0 opacity-70" />
        <span className="text-[11px] text-cad-text-primary uppercase font-bold truncate transition-colors">{name}</span>
      </div>
      {isOpen && children && (
        <div className="ml-4 pl-1.5 border-l border-cad-border">
          {children}
        </div>
      )}
    </div>
  );
}

function FileItem({ name, onSelect, isActive, path }: { name: string, type?: 'doc' | 'excel' | 'code' | 'image' | 'pdf', onSelect?: () => void, isActive?: boolean, path?: string }) {
  const Icon = FileText;
  
  return (
    <div 
      draggable={!!path}
      onDragStart={(e) => {
        if (path) {
          e.dataTransfer.setData("application/file-path", path);
        }
      }}
      onClick={(e) => { e.stopPropagation(); onSelect && onSelect(); }}
      className={cn(
        "flex items-center gap-2 py-1 pl-4 pr-2 hover:bg-cad-elevated rounded-sm cursor-pointer group transition-all", 
        isActive && "bg-cad-elevated border-l-2 border-cad-accent"
      )}
    >
      <Icon size={12} className={cn("shrink-0", isActive ? "text-cad-accent" : "text-cad-text-muted")} />
      <span className={cn("text-[11px] cursor-pointer truncate transition-colors w-full uppercase font-medium", isActive ? "text-white" : "text-cad-text-primary")}>{name}</span>
    </div>
  );
}


// Subcomponent for Gantt Timeline (Adjusted for dark mode)
function GanttTimeline({ tasks, dependencies = [], loading = false, onUpdateTaskDates }: { tasks: Task[], dependencies?: TaskDependency[], loading?: boolean, onUpdateTaskDates?: (task: Task, newStart: string, newEnd: string) => void }) {
  if (loading) {
    return (
      <div className="min-w-fit h-full relative" style={{ width: 14 * 40 }}>
        <div className="sticky top-0 z-20 flex bg-[#252526] border-b border-[#2D2D2D] h-[26px]">
           {[...Array(14)].map((_, i) => <div key={i} className="shrink-0 h-full border-r border-[#2D2D2D]" style={{ width: 40 }} />)}
        </div>
        <div className="relative pt-0 flex flex-col w-full">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="relative h-10 w-full border-b border-[#2D2D2D] flex items-center">
                 <div className="absolute h-3 bg-[#333333] rounded-sm animate-pulse" style={{ left: 40 + (i * 20), width: 120 + (i * 10) }} />
              </div>
            ))}
        </div>
      </div>
    );
  }

  const timelineData = useMemo(() => {
    if (tasks.length === 0) return null;
    let minDate = new Date();
    let maxDate = new Date();
    tasks.forEach((t, i) => {
      if (t.start_date) {
        const d = new Date(t.start_date);
        if (i === 0 || d < minDate) minDate = d;
      }
      if (t.end_date) {
        const d = new Date(t.end_date);
        if (i === 0 || d > maxDate) maxDate = d;
      }
    });

    const start = addDays(startOfWeek(minDate), -7);
    const end = addDays(endOfWeek(maxDate), 14);
    const days = eachDayOfInterval({ start, end });
    return { start, end, days };
  }, [tasks]);

  if (!timelineData) {
    return <div className="h-full flex flex-col items-center justify-center opacity-70">
        <div className="w-10 h-10 rounded-full bg-[#333333] flex-center mb-3">
          <Globe size={20} className="text-[#888888]" />
        </div>
        <p className="text-[#CCCCCC] font-bold text-xs">Gantt View Unavailable</p>
        <p className="text-[#888888] text-[10px] mt-1">Add tasks with start/end dates.</p>
    </div>;
  }

  const { start: timelineStart, days } = timelineData;
  const DAY_WIDTH = 40;

  return (
    <div className="min-w-fit h-full relative" style={{ width: days.length * DAY_WIDTH }}>
      <div className="sticky top-0 z-20 flex bg-[#252526] border-b border-[#2D2D2D] h-[26px]">
        {days.map((day, idx) => {
          const isToday = isSameDay(day, new Date());
          return (
            <div key={idx} className={cn("shrink-0 h-full border-r border-[#2D2D2D] flex items-center justify-center relative", isToday && "bg-[#007ACC]/20")} style={{ width: DAY_WIDTH }}>
              <span className={cn("text-[9px] font-mono", isToday ? "font-bold text-[#007ACC]" : "text-[#888888]")}>
                {format(day, 'd')}
              </span>
            </div>
          );
        })}
      </div>

      <div className="absolute inset-0 top-[26px] flex pointer-events-none">
        {days.map((day, idx) => (
          <div key={idx} className={cn("shrink-0 border-r h-full", isSameDay(day, new Date()) ? "border-[#007ACC]/30 bg-[#007ACC]/5" : "border-[#2D2D2D]")} style={{ width: DAY_WIDTH }}/>
        ))}
      </div>

      <div className="relative pt-0 flex flex-col w-full">
        {tasks.map((task) => {
          return (
            <div 
              key={task.id} 
              className="relative h-10 w-full border-b border-[#2D2D2D] flex items-center hover:bg-[#2A2D2E]"
              onDragOver={(e) => {
                 if (e.dataTransfer.types.includes("gantt-task")) {
                    e.preventDefault(); // allow drop
                 }
              }}
              onDrop={(e) => {
                 if (!onUpdateTaskDates || task.status === 'folder') return;
                 const data = e.dataTransfer.getData("gantt-task");
                 if (!data) return;
                 const { id, duration, offsetX } = JSON.parse(data);
                 if (id !== task.id) return; // Only allow dropping on its own row for now

                 const rect = e.currentTarget.getBoundingClientRect();
                 const dropX = e.clientX - rect.left - offsetX;
                 
                 let dayIdx = Math.floor(dropX / DAY_WIDTH);
                 if (dayIdx < 0) dayIdx = 0;
                 if (dayIdx >= days.length) dayIdx = days.length - 1;

                 const newStart = new Date(days[dayIdx]);
                 // duration already includes the +1 day logic, so subtract 1 for the end date calculation
                 const newEnd = addDays(newStart, duration - 1);
                 
                 onUpdateTaskDates(task, newStart.toISOString(), newEnd.toISOString());
              }}
            >
                {task.start_date && task.end_date && (() => {
                  const tStart = new Date(task.start_date);
                  const tEnd = new Date(task.end_date);
                  const offsetDays = differenceInDays(tStart, timelineStart);
                  const durationDays = differenceInDays(tEnd, tStart) + 1;
                  const left = offsetDays * DAY_WIDTH;
                  const width = Math.max(durationDays * DAY_WIDTH, DAY_WIDTH/2);

                  return (
                    <div 
                      draggable={task.status !== 'folder'}
                      onDragStart={(evt) => {
                        if (task.status === 'folder') return;
                        const rect = evt.currentTarget.getBoundingClientRect();
                        const offsetX = evt.clientX - rect.left;
                        evt.dataTransfer.setData("gantt-task", JSON.stringify({ 
                           id: task.id, 
                           duration: durationDays,
                           offsetX: offsetX 
                        }));
                      }}
                      className={cn("absolute h-[18px] rounded-sm cursor-pointer overflow-hidden border border-[rgba(255,255,255,0.1)] flex items-center transition-all", task.is_completed ? "opacity-30 grayscale hover:opacity-50" : "hover:brightness-110 z-10", task.status === 'folder' ? "bg-transparent border border-[#888888] text-[#888888] pointer-events-none" : "bg-[#007ACC] cursor-grab active:cursor-grabbing")}
                      style={{
                        left: `${left + 4}px`,
                        width: `${width - 8}px`,
                        background: task.status === 'folder' ? 'transparent' : (task.is_completed ? '#4CAF50' : '#007ACC')
                      }}
                    >
                      <span className="px-1.5 block truncate text-[9px] font-semibold flex-1" style={{color: task.status === 'folder' ? '#CCCCCC' : 'white'}}>{task.name}</span>
                    </div>
                  );
                })()}
            </div>
          );
        })}
      </div>
      
      <svg className="absolute top-[26px] left-0 pointer-events-none z-10" style={{ width: days.length * DAY_WIDTH, height: Math.max(tasks.length * 40, 100) }}>
         {dependencies.map(dep => {
            const fromIdx = tasks.findIndex(t => t.id === dep.from_task_id);
            const toIdx = tasks.findIndex(t => t.id === dep.to_task_id);
            if (fromIdx === -1 || toIdx === -1) return null;
            
            const fromTask = tasks[fromIdx];
            const toTask = tasks[toIdx];
            if (!fromTask.end_date || !toTask.start_date) return null;

            const fromEnd = new Date(fromTask.end_date);
            const toStart = new Date(toTask.start_date);
            
            const fromOffsetX = (differenceInDays(fromEnd, timelineStart) + 1) * DAY_WIDTH;
            const toOffsetX = differenceInDays(toStart, timelineStart) * DAY_WIDTH;

            const fromY = fromIdx * 40 + 20;
            const toY = toIdx * 40 + 20;

            const path = `M ${fromOffsetX} ${fromY} C ${fromOffsetX + 15} ${fromY}, ${toOffsetX - 15} ${toY}, ${toOffsetX} ${toY}`;

            return (
              <g key={dep.id}>
                 <path d={path} fill="none" stroke="#007ACC" strokeWidth="1.5" strokeOpacity="0.5" />
                 <polygon points={`${toOffsetX},${toY} ${toOffsetX-5},${toY-4} ${toOffsetX-5},${toY+4}`} fill="#007ACC" fillOpacity="0.8" />
              </g>
            );
         })}
      </svg>

      <div className="absolute top-[26px] bottom-0 w-px bg-[#007ACC] z-10 pointer-events-none" style={{ left: `${differenceInDays(new Date(), timelineStart) * DAY_WIDTH + (DAY_WIDTH/2)}px`}} />
    </div>
  );
}

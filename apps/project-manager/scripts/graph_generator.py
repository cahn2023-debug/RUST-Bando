import os
import re
import json
from pathlib import Path

# Configuration
IGNORE_DIRS = {'.git', 'node_modules', 'dist', 'target', '.grapuco', 'BAK', '__pycache__', '.vscode', '.gemini', 'docs'}
PROJECT_ROOT = Path(__file__).parent.parent
OUTPUT_FILE = PROJECT_ROOT / 'docs' / 'graph' / 'KNOWLEDGE_GRAPH.md'
KI_STORE = Path.home() / '.gemini' / 'antigravity' / 'knowledge'

# Regex patterns
TS_IMPORT_RE = re.compile(r'import\s+.*?\s+from\s+[\'"](.*?)[\'"]')
TS_SYMBOL_RE = re.compile(r'^(export\s+)?(class|interface|type|function)\s+(\w+)', re.MULTILINE)

RUST_MOD_RE = re.compile(r'^(pub\s+)?mod\s+(\w+);', re.MULTILINE)
RUST_USE_RE = re.compile(r'^use\s+([^;]+);', re.MULTILINE)
RUST_SYMBOL_RE = re.compile(r'^(pub\s+)?(struct|enum|fn|type)\s+(\w+)', re.MULTILINE)

def get_rel_path(path):
    try:
        return path.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return str(path)

def scan_typescript(file_path):
    dependencies = []
    symbols = []
    try:
        content = file_path.read_text(encoding='utf-8')
        # Imports
        matches = TS_IMPORT_RE.findall(content)
        for match in matches:
            if match.startswith('.'):
                dep_path = (file_path.parent / match).resolve()
                for ext in ['.ts', '.tsx', '/index.ts', '/index.tsx']:
                    full_p = Path(str(dep_path) + ext)
                    if full_p.exists():
                        dependencies.append(get_rel_path(full_p))
                        break
            else:
                dependencies.append(f"npm:{match}")
        
        # Symbols
        sym_matches = TS_SYMBOL_RE.findall(content)
        for _, kind, name in sym_matches:
            symbols.append((kind, name))
    except Exception as e:
        print(f"Error scanning TS {file_path}: {e}")
    return dependencies, symbols

def scan_rust(file_path):
    dependencies = []
    symbols = []
    try:
        content = file_path.read_text(encoding='utf-8')
        # Simple Rust dependency detection
        matches = RUST_MOD_RE.findall(content)
        for match in matches:
            mod_name = match[1]
            dependencies.append(f"mod:{mod_name}")
        
        uses = RUST_USE_RE.findall(content)
        for use in uses:
            dependencies.append(f"use:{use.strip()}")

        # Symbols
        sym_matches = RUST_SYMBOL_RE.findall(content)
        for _, kind, name in sym_matches:
            symbols.append((kind, name))
    except Exception as e:
        pass
    return dependencies, symbols

def generate_graph():
    nodes = {} # path -> id
    node_symbols = {} # node_id -> [(kind, name)]
    edges = []
    node_counter = 0
    
    # Ensure output directory exists
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    print(f"Scanning project root: {PROJECT_ROOT}")
    
    # Target specific directories to avoid noise
    TARGET_DIRS = ['src', 'src-tauri']
    
    for target in TARGET_DIRS:
        target_path = PROJECT_ROOT / target
        if not target_path.exists():
            continue
            
        for root, dirs, files in os.walk(target_path):
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith('.')]
            
            for file in files:
                file_path = Path(root) / file
                rel_path = get_rel_path(file_path)
                
                if file.endswith(('.ts', '.tsx', '.rs')):
                    if rel_path not in nodes:
                        nodes[rel_path] = f"node_{node_counter}"
                        node_counter += 1
                    
                    node_id = nodes[rel_path]
                    if file.endswith(('.ts', '.tsx')):
                        deps, syms = scan_typescript(file_path)
                        for dep in deps:
                            edges.append((rel_path, dep))
                        node_symbols[node_id] = syms
                    elif file.endswith('.rs'):
                        deps, syms = scan_rust(file_path)
                        for dep in deps:
                            edges.append((rel_path, dep))
                        node_symbols[node_id] = syms

    # Knowledge Items Integration
    ki_edges = []
    if KI_STORE.exists():
        for ki_dir in KI_STORE.iterdir():
            if ki_dir.is_dir():
                meta_file = ki_dir / 'metadata.json'
                if meta_file.exists():
                    try:
                        meta = json.loads(meta_file.read_text(encoding='utf-8'))
                        ki_id_str = f"KI:{meta.get('slug', ki_dir.name)}"
                        if ki_id_str not in nodes:
                            nodes[ki_id_str] = f"node_{node_counter}"
                            node_counter += 1
                        
                        ki_node_id = nodes[ki_id_str]
                        # Link to code_refs
                        for ref in meta.get('code_refs', []):
                            ki_edges.append((ki_id_str, ref))
                    except:
                        pass

    # Generate Mermaid content
    mermaid = [
        "---",
        "title: Bando Knowledge Graph",
        "---",
        "graph TD",
        "  %% Node Styles",
        "  classDef ts fill:#2b7489,color:#fff,stroke:#1e5160;",
        "  classDef rs fill:#dea584,color:#000,stroke:#8b4513;",
        "  classDef ki fill:#9b59b6,color:#fff,stroke:#7d3c98;",
        "  classDef external fill:#eee,stroke:#999,stroke-dasharray: 5 5;",
        "  classDef symbol fill:#f9f9f9,stroke:#333,stroke-width:1px;",
        ""
    ]

    # Add Nodes with Subgraphs for detailed view
    for path, node_id in sorted(nodes.items()):
        if path.startswith('KI:'):
            mermaid.append(f"  {node_id}[\"{path}\"]:::ki")
            continue

        syms = node_symbols.get(node_id, [])
        if syms:
            mermaid.append(f"  subgraph {node_id}_sub [\"{path}\"]")
            # Style for the subgraph
            if path.endswith('.rs'):
                mermaid.append(f"    direction LR")
            
            file_node_id = f"{node_id}_file"
            mermaid.append(f"    {file_node_id}(\"📄 {path}\")")
            
            for i, (kind, name) in enumerate(syms[:15]): # Limit to 15 symbols to avoid giant graphs
                sym_id = f"{node_id}_s{i}"
                icon = "📦" if kind in ['struct', 'class', 'interface'] else "🔧" if kind == 'fn' or kind == 'function' else "📋"
                mermaid.append(f"    {sym_id}[\"{icon} {name} ({kind})\"]:::symbol")
                mermaid.append(f"    {file_node_id} --- {sym_id}")
            
            if len(syms) > 15:
                mermaid.append(f"    {node_id}_more[\"... and {len(syms)-15} more symbols\"]:::symbol")
                mermaid.append(f"    {file_node_id} --- {node_id}_more")

            mermaid.append(f"  end")
            # Set the class of the virtual node to the file type for coloring
            if path.endswith('.rs'):
                mermaid.append(f"  class {node_id}_sub rs")
            else:
                mermaid.append(f"  class {node_id}_sub ts")
        else:
            if path.endswith(('.ts', '.tsx')):
                mermaid.append(f"  {node_id}[\"📄 {path}\"]:::ts")
            elif path.endswith('.rs'):
                mermaid.append(f"  {node_id}[\"📄 {path}\"]:::rs")

    # Add Edges (use subgraph/virtual node IDs)
    for start_path, end_path in edges:
        start_id = nodes.get(start_path)
        if not start_id: continue

        if end_path.startswith('npm:'):
            pass
        elif end_path in nodes:
            end_id = nodes[end_path]
            # If end has a subgraph, target the file node inside or just the subgraph
            mermaid.append(f"  {start_id}_file --> {end_id}_file" if start_id in node_symbols and end_id in node_symbols else f"  {start_id} --> {end_id}")

    # Add KI Links
    for ki_path, code_ref in ki_edges:
        ki_id = nodes.get(ki_path)
        target_path = next((p for p in nodes if p.endswith(code_ref) or code_ref in p), None)
        if ki_id and target_path:
            target_id = nodes[target_path]
            target_ref = f"{target_id}_file" if target_id in node_symbols else target_id
            mermaid.append(f"  {ki_id} -. links .-> {target_ref}")

    header = "# Project Knowledge Graph\n\nAutomatically generated by `BK-Graph Engine`.\n\n"
    OUTPUT_FILE.write_text(header + "```mermaid\n" + "\n".join(mermaid) + "\n```", encoding='utf-8')
    print(f"Graph generated at {OUTPUT_FILE}")

if __name__ == "__main__":
    generate_graph()

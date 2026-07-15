import os
import re

def find_reachable_modules(root_dir):
    reachable = set()
    work_list = []
    
    # Standard entry points
    for entry in ['lib.rs', 'main.rs']:
        p = os.path.join(root_dir, entry)
        if os.path.exists(p):
            # Normalizing path for set comparison
            abs_p = os.path.abspath(p)
            reachable.add(abs_p)
            work_list.append(abs_p)
            
    # Pattern to find mod declarations: mod name; or pub mod name;
    mod_pattern = re.compile(r'^\s*(?:pub\s+)?mod\s+([a-zA-Z0-9_]+)\s*;', re.MULTILINE)
    path_pattern = re.compile(r'#\[path\s*=\s*"([^"]+)"\]\s*(?:pub\s+)?mod\s+[a-zA-Z0-9_]+\s*;', re.MULTILINE)
    
    while work_list:
        current_file = work_list.pop()
        current_dir = os.path.dirname(current_file)
        
        try:
            with open(current_file, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception:
            continue
            
        # Handle #[path = "..."] mod name;
        paths = path_pattern.findall(content)
        for p_attr in paths:
            p = os.path.join(current_dir, p_attr)
            abs_p = os.path.abspath(p)
            if os.path.exists(abs_p) and abs_p not in reachable:
                reachable.add(abs_p)
                work_list.append(abs_p)
                
        # Handle standard mod name;
        modules = mod_pattern.findall(content)
        for mod_name in modules:
            # Check for file.rs
            p1 = os.path.join(current_dir, mod_name + '.rs')
            # Check for name/mod.rs
            p2 = os.path.join(current_dir, mod_name, 'mod.rs')
            
            for p in [p1, p2]:
                abs_p = os.path.abspath(p)
                if os.path.exists(abs_p) and abs_p not in reachable:
                    reachable.add(abs_p)
                    work_list.append(abs_p)
                    
    return reachable

def scan_all_rs_files(root_dir):
    all_rs = set()
    for root, dirs, files in os.walk(root_dir):
        for file in files:
            if file.endswith('.rs'):
                all_rs.add(os.path.abspath(os.path.join(root, file)))
    return all_rs

root_src = r'src'
all_files = scan_all_rs_files(root_src)
reachable_files = find_reachable_modules(root_src)

unreachable = all_files - reachable_files

# Filter out build.rs if it's at root of src-tauri, but here we scan 'src'
# Also filter out scripts/ etc if any.

print(f"Total .rs files: {len(all_files)}")
print(f"Reachable .rs files: {len(reachable_files)}")
print(f"Unreachable .rs files: {len(unreachable)}")

print("\n--- Unreachable Files ---")
for f in sorted(unreachable):
    # Print relative path for readability
    print(os.path.relpath(f, '.'))

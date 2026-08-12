import os
import re

root = r"d:\Code Antinigaty\Phan mem quan ly file V4\RUST\src-tauri\src"

def is_declared(dir_path, name):
    relative_path = os.path.relpath(dir_path, root)
    
    # Files in bin/ are binaries, they are used by definition as entry points
    if "bin" in relative_path.split(os.sep):
        return True

    # Check mod.rs in current dir
    mod_rs = os.path.join(dir_path, "mod.rs")
    if os.path.exists(mod_rs):
        with open(mod_rs, 'r', encoding='utf-8') as f:
            content = f.read()
            if re.search(fr"(pub\s+)?mod\s+{name};", content):
                return True
    
    # Check if parent directory has a file named same as current dir
    parent_dir = os.path.dirname(dir_path)
    parent_mod_file = os.path.join(parent_dir, os.path.basename(dir_path) + ".rs")
    if os.path.exists(parent_mod_file):
        with open(parent_mod_file, 'r', encoding='utf-8') as f:
            content = f.read()
            if re.search(fr"(pub\s+)?mod\s+{name};", content):
                return True

    # Check lib.rs or main.rs if we are at root
    if dir_path == root:
        for entry in ["lib.rs", "main.rs"]:
            entry_path = os.path.join(root, entry)
            if os.path.exists(entry_path):
                with open(entry_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    if re.search(fr"(pub\s+)?mod\s+{name};", content):
                        return True
    
    # Recursive check: if this dir is not root, check if the module representing the dir is declared in parent
    if dir_path != root:
        dir_name = os.path.basename(dir_path)
        if is_declared(parent_dir, dir_name):
            # The directory itself is declared, but is the file 'name' declared in it?
            # Actually our logic above already checks mod.rs and parent_mod_file.
            pass

    return False

unused_files = []

for dirpath, dirnames, filenames in os.walk(root):
    # Skip existing BAK or . folders
    if "BAK" in dirpath or ".git" in dirpath:
        continue
        
    for filename in filenames:
        if not filename.endswith(".rs"):
            continue
        if filename in ["main.rs", "lib.rs", "mod.rs"]:
            continue
            
        name = filename[:-3]
        if not is_declared(dirpath, name):
            unused_files.append(os.path.join(dirpath, filename))

print("UNUSED_FILES_COUNT:", len(unused_files))
for f in unused_files:
    print(f)

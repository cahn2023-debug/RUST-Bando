import os
import re

root_dir = r"d:\Code Antinigaty\Phan mem quan ly file V4\RUST\src-tauri\src"
bak_dir = r"d:\Code Antinigaty\Phan mem quan ly file V4\RUST\BAK"

ignored_files = ["main.rs", "lib.rs", "build.rs"]

def check_referenced(file_path):
    dir_name = os.path.dirname(file_path)
    base_name = os.path.basename(file_path).replace(".rs", "")
    
    # Check mod.rs in same dir
    mod_rs = os.path.join(dir_name, "mod.rs")
    if os.path.exists(mod_rs):
        with open(mod_rs, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
            if re.search(fr"\b(pub\s+)?mod\s+{base_name}\b", content):
                return True
                
    # Check parent dir's mod.rs (e.g. src/domain/mod.rs referencing src/domain/models.rs)
    parent_dir = os.path.dirname(dir_name)
    parent_mod_rs = os.path.join(parent_dir, "mod.rs")
    if os.path.exists(parent_mod_rs):
         with open(parent_mod_rs, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
            current_mod_name = os.path.basename(dir_name)
            if re.search(fr"\b(pub\s+)?mod\s+{current_mod_name}\b", content):
                # If the directory is referenced, now we check if the file is referenced in its own mod.rs
                # which we already did above.
                pass

    # Root level checks
    for root_entry in ["main.rs", "lib.rs"]:
        root_path = os.path.join(root_dir, root_entry)
        if os.path.exists(root_path):
            with open(root_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                if re.search(fr"\b(pub\s+)?mod\s+{base_name}\b", content):
                    return True

    return False

unreferenced = []

for root, dirs, files in os.walk(root_dir):
    # Special skip for bin directory
    if os.path.basename(root) == "bin":
        continue
        
    for file in files:
        if file.endswith(".rs") and file not in ignored_files:
            full_path = os.path.join(root, file)
            # mod.rs is the reference point, don't move it if it's referenced by parent
            if file == "mod.rs":
                parent_dir = os.path.dirname(root)
                current_dir_name = os.path.basename(root)
                # Check if parent references this directory
                found = False
                for p_mod in [os.path.join(parent_dir, "mod.rs"), os.path.join(parent_dir, "lib.rs"), os.path.join(parent_dir, "main.rs")]:
                    if os.path.exists(p_mod):
                        with open(p_mod, "r", encoding="utf-8", errors="ignore") as f:
                            if re.search(fr"\b(pub\s+)?mod\s+{current_dir_name}\b", f.read()):
                                found = True
                                break
                if not found and root != root_dir:
                    unreferenced.append(full_path)
                continue

            if not check_referenced(full_path):
                unreferenced.append(full_path)

print("UNREFERENCED_FILES_START")
for f in unreferenced:
    print(f)
print("UNREFERENCED_FILES_END")

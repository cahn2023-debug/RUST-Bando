import os
import subprocess
import datetime

def get_changed_files():
    """Returns a list of changed (modified/staged/untracked) files using git."""
    try:
        # Get staged, modified, and untracked files
        result = subprocess.run(
            ['git', 'status', '--porcelain'],
            capture_output=True,
            text=True,
            check=True
        )
        lines = result.stdout.splitlines()
        files = []
        for line in lines:
            status = line[:2].strip()
            # XY path
            # X is staged, Y is unstaged
            # If status contains 'D', it's deleted, skip it.
            if 'D' in status:
                continue
                
            path = line[3:].strip()
            
            # Remove quotes if path has spaces
            if path.startswith('"') and path.endswith('"'):
                path = path[1:-1]

            # Direct filtering for build/junk directories to avoid even listing them
            ignore_dirs = ['target/', 'node_modules/', '.git/', '.agent/', '.gemini/', 'dist/']
            if any(path.startswith(d) or f'/{d}' in path for d in ignore_dirs):
                continue

            if os.path.isfile(path):
                files.append(path)
        return files
    except subprocess.CalledProcessError:
        print("Git not found or not a git repository.")
        return []

def aggregate_to_markdown(files, output_path="udnl_upload.md"):
    """Bundles the content of the listed files into a single Markdown file."""
    ignore_list = ['node_modules', 'target', '.git', 'dist', '.gemini', '.agent']
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(f"# Code Update Aggregation\n")
        f.write(f"Generated on: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        
        for file_path in files:
            # Basic filtering
            if any(ignore in file_path for ignore in ignore_list):
                continue
                
            # Skip common binary/junk extensions and large lock files
            if file_path.endswith(('.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar.gz', '.exe', '.dll', 'lock.json', 'lock.yaml', 'lock', 'Cargo.lock')):
                continue

            try:
                f.write(f"## File: `{file_path}`\n\n")
                
                # Determine language for code blocks
                ext = os.path.splitext(file_path)[1].lower().replace('.', '')
                if ext in ['js', 'jsx', 'ts', 'tsx', 'py', 'rs', 'json', 'html', 'css', 'sql', 'md']:
                    lang = ext
                else:
                    lang = ""

                f.write(f"```{lang}\n")
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as src:
                    f.write(src.read())
                f.write(f"\n```\n\n")
                f.write("---\n\n")
            except Exception as e:
                print(f"Error reading {file_path}: {e}")

    print(f"Aggregated {len(files)} files into {output_path}")

if __name__ == "__main__":
    changed_files = get_changed_files()
    if changed_files:
        aggregate_to_markdown(changed_files)
    else:
        print("No changed files detected.")

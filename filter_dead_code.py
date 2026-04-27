import json
import os

def filter_warnings(json_file):
    if not os.path.exists(json_file):
        print(f"File {json_file} does not exist.")
        return

    try:
        # PowerShell redirection often creates UTF-16LE files
        with open(json_file, 'r', encoding='utf-16-le') as f:
            content = f.read()
    except UnicodeDecodeError:
        with open(json_file, 'r', encoding='utf-8') as f:
            content = f.read()

    lines = content.splitlines()
    dead_code = []
    
    for line in lines:
        if not line.strip():
            continue
        try:
            data = json.loads(line)
            if data.get("reason") == "compiler-message":
                msg = data.get("message", {})
                code = msg.get("code")
                if code and code.get("code") in ["dead_code", "unused_variables", "unused_imports", "unused_mut"]:
                    span = msg.get("spans", [{}])[0]
                    dead_code.append({
                        "code": code.get("code"),
                        "message": msg.get("message"),
                        "file": span.get("file_name"),
                        "line_start": span.get("line_start"),
                        "line_end": span.get("line_end")
                    })
        except json.JSONDecodeError:
            continue

    print(json.dumps(dead_code, indent=2))

if __name__ == "__main__":
    filter_warnings(r"d:\Code Antinigaty\Phan mem quan ly file V4\RUST\src-tauri\cargo_check.json")

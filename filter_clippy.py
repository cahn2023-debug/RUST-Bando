import json
import os

def filter_clippy(json_file):
    if not os.path.exists(json_file):
        print(f"File {json_file} does not exist.")
        return

    try:
        with open(json_file, 'r', encoding='utf-16-le') as f:
            content = f.read()
    except UnicodeDecodeError:
        with open(json_file, 'r', encoding='utf-8') as f:
            content = f.read()

    lines = content.splitlines()
    findings = []
    
    for line in lines:
        if not line.strip():
            continue
        try:
            data = json.loads(line)
            if data.get("reason") == "compiler-message":
                msg = data.get("message", {})
                level = msg.get("level")
                if level in ["error", "warning"]:
                    span = msg.get("spans", [{}])[0]
                    findings.append({
                        "level": level,
                        "message": msg.get("message"),
                        "file": span.get("file_name"),
                        "line": span.get("line_start"),
                        "code": msg.get("code", {}).get("code") if msg.get("code") else None
                    })
        except json.JSONDecodeError:
            continue

    # Group by message and count
    summary = {}
    for f in findings:
        key = f"{f['code']}: {f['message']}"
        if key not in summary:
            summary[key] = []
        summary[key].append(f"{f['file']}:{f['line']}")

    print(json.dumps(summary, indent=2))

if __name__ == "__main__":
    filter_clippy(r"d:\Code Antinigaty\Phan mem quan ly file V4\RUST\src-tauri\clippy_results.json")

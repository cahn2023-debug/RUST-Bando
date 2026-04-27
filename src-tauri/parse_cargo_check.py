import json
import subprocess
import os

def run_cargo_check():
    print("Running cargo check --workspace --message-format=json...")
    try:
        # Use shell=True for Windows and to capture both stdout and stderr
        process = subprocess.Popen(
            ['cargo', 'check', '--workspace', '--message-format=json'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd='d:/Code Antinigaty/Phan mem quan ly file V4/RUST/src-tauri',
            text=True,
            encoding='utf-8'
        )
        
        findings = []
        
        while True:
            line = process.stdout.readline()
            if not line:
                break
            
            try:
                data = json.loads(line)
                if data.get('reason') == 'compiler-message':
                    msg = data.get('message', {})
                    code = msg.get('code', {})
                    if code and code.get('code') in ['dead_code', 'unused_variables', 'unused_imports', 'unused_must_use']:
                        level = msg.get('level')
                        if level == 'warning':
                            rendered = msg.get('rendered', '')
                            spans = msg.get('spans', [])
                            if spans:
                                span = spans[0]
                                finding = {
                                    'code': code.get('code'),
                                    'file': span.get('file_name'),
                                    'line_start': span.get('line_start'),
                                    'line_end': span.get('line_end'),
                                    'column_start': span.get('column_start'),
                                    'column_end': span.get('column_end'),
                                    'message': msg.get('message')
                                }
                                findings.append(finding)
            except json.JSONDecodeError:
                continue

        process.wait()
        return findings
    except Exception as e:
        print(f"Error running cargo check: {e}")
        return []

if __name__ == "__main__":
    findings = run_cargo_check()
    if findings:
        # Sort by file and then line (reverse to delete from bottom to top)
        findings.sort(key=lambda x: (x['file'], x['line_start']), reverse=True)
        print(json.dumps(findings, indent=2))
        
        # Also save to a file for later use
        with open('dead_code_findings.json', 'w', encoding='utf-8') as f:
            json.dump(findings, f, indent=2)
        print(f"\nFound {len(findings)} issues. Saved to dead_code_findings.json")
    else:
        print("No dead code or unused items found.")

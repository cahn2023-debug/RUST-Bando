import json
import os

def parse_dead_code(report_path):
    findings = []
    # Try different encodings due to PowerShell redirection
    encodings = ['utf-8', 'utf-16', 'utf-16-le', 'utf-16-be']
    
    content = None
    for enc in encodings:
        try:
            with open(report_path, 'r', encoding=enc) as f:
                content = f.read()
                print(f"Successfully read with {enc}")
                break
        except Exception:
            continue
            
    if not content:
        print("Failed to read file with any encoding")
        return []
        
    for line in content.splitlines():
        if not line.strip(): continue
        try:
            data = json.loads(line)
        except Exception:
            continue
        
        if data.get('reason') == 'compiler-message':
            msg = data.get('message', {})
            code = msg.get('code', {})
            if code and code.get('code') in ['dead_code', 'unused_variables', 'unused_imports', 'unused_must_use']:
                spans = msg.get('spans', [])
                for span in spans:
                    if span.get('is_primary'):
                        findings.append({
                            'file': span.get('file_name'),
                            'line_start': span.get('line_start'),
                            'line_end': span.get('line_end'),
                            'message': msg.get('message'),
                            'code': code.get('code')
                        })
    return findings

report = 'dead_code_report.json'
results = parse_dead_code(report)

# Sort from bottom to top of file to avoid line shift issues during deletion
results.sort(key=lambda x: (x['file'], -x['line_start']))

print(f"Total findings: {len(results)}")
for r in results:
    print(f"{r['file']}:{r['line_start']}-{r['line_end']} [{r['code']}] {r['message']}")

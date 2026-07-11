import json

issues = []
errors = []
try:
    f = open('cargo_check_final.json', 'r', encoding='utf-16')
    lines = f.readlines()
    f.close()
except:
    f = open('cargo_check_final.json', 'r', encoding='utf-8')
    lines = f.readlines()
    f.close()

for line in lines:
        try:
            data = json.loads(line)
            if data.get('reason') == 'compiler-message':
                msg = data.get('message', {})
                if msg.get('level') == 'warning':
                    code_info = msg.get('code', {})
                    if code_info:
                        code = code_info.get('code')
                        if code in ['dead_code', 'unused_imports', 'unused_variables', 'unused_must_use', 'non_snake_case', 'unused_mut']:
                            spans = msg.get('spans', [])
                            if spans:
                                span = spans[0]
                                issues.append({
                                    'code': code,
                                    'file': span.get('file_name'),
                                    'line_start': span.get('line_start'),
                                    'text': span.get('text'),
                                    'message': msg.get('message')
                                })
                elif msg.get('level') == 'error':
                    errors.append(msg.get('message'))
        except:
            continue

# Deduplicate
unique_issues = []
seen = set()
for iss in issues:
    key = (iss['file'], iss['line_start'], iss['code'])
    if key not in seen:
        unique_issues.append(iss)
        seen.add(key)

with open('all_warnings.json', 'w', encoding='utf-8') as f:
    json.dump(unique_issues, f, indent=2)
print(f"Extracted {len(unique_issues)} issues and {len(errors)} errors.")
if errors:
    print("ERRORS FOUND:")
    for e in errors:
        print(f" - {e}")

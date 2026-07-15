import os

def find_file(name, path):
    for root, dirs, files in os.walk(path):
        if name in files:
            p = os.path.join(root, name)
            print(f"FOUND: {p} ({os.path.getsize(p)} bytes)")

find_file('offline_pm.db', r"d:\Code Antinigaty\Phan mem quan ly file V4")

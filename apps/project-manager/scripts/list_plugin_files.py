import os

path = r"d:\Code Antinigaty\Phan mem quan ly file V4\RUST\src-tauri\src\core\plugin"
for root, dirs, files in os.walk(path):
    print(f"Directory: {root}")
    for file in files:
        print(f"  - {file}")

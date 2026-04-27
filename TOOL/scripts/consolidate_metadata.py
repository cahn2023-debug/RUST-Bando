import sqlite3
import os
import glob
import json

def get_metadata(db_path):
    try:
        conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
        cur = conn.cursor()
        
        # Get projects
        cur.execute("SELECT name, contract_number, investor, contractor, signed_date, duration, end_date FROM projects")
        projects = cur.fetchall()
        
        # Get contracts
        cur.execute("SELECT name, contract_number, vendor, value, signed_date FROM contracts")
        contracts = cur.fetchall()
        
        # Get file metadata
        cur.execute("SELECT filename, metadata_json FROM files WHERE metadata_json IS NOT NULL")
        files = cur.fetchall()
        
        conn.close()
        return projects, contracts, files
    except Exception as e:
        # print(f"Error reading {db_path}: {e}")
        return [], [], []

def main():
    root_dir = r"d:\Code Antinigaty\Phan mem quan ly file V4"
    pmp_files = glob.glob(os.path.join(root_dir, "**", "*.pmp"), recursive=True)
    
    summary = {
        "total_pmp_files": len(pmp_files),
        "projects": [],
        "contracts": [],
        "file_analyses": []
    }
    
    for f in pmp_files:
        projs, contrs, fls = get_metadata(f)
        for p in projs:
            summary["projects"].append({
                "source": f,
                "name": p[0],
                "contract_number": p[1],
                "investor": p[2],
                "contractor": p[3],
                "signed_date": p[4],
                "duration": p[5],
                "end_date": p[6]
            })
        for c in contrs:
            summary["contracts"].append({
                "source": f,
                "name": c[0],
                "contract_number": c[1],
                "vendor": c[2],
                "value": c[3],
                "signed_date": c[4]
            })
        for fl in fls:
            summary["file_analyses"].append({
                "source": f,
                "filename": fl[0],
                "metadata": json.loads(fl[1]) if fl[1] else {}
            })
            
    # Save summary
    with open("consolidated_metadata_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
        
    # Generate Markdown Report
    with open("CONSOLIDATED_CONTRACT_REPORT.md", "w", encoding="utf-8") as f:
        f.write("# CONSOLIDATED CONTRACT METADATA REPORT\n\n")
        f.write(f"**Total PMP Files Scanned:** {len(pmp_files)}\n\n")
        
        f.write("## 🏗️ Project Metadata\n")
        f.write("| Source | Project Name | Contract # | Investor | Contractor |\n")
        f.write("|---|---|---|---|---|\n")
        for p in summary["projects"]:
            if p["contract_number"] or p["investor"]:
                f.write(f"| {os.path.basename(p['source'])} | {p['name']} | {p['contract_number']} | {p['investor']} | {p['contractor']} |\n")
        
        f.write("\n## 📜 Contract Records\n")
        f.write("| Source | Contract Name | Contract # | Vendor | Value |\n")
        f.write("|---|---|---|---|---|\n")
        for c in summary["contracts"]:
            f.write(f"| {os.path.basename(c['source'])} | {c['name']} | {c['contract_number']} | {c['vendor']} | {c['value']:,.0f} |\n")
            
    print("Consolidated summary and report generated.")

if __name__ == "__main__":
    main()

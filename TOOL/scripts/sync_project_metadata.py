import sqlite3
import json
import os
import sys

def is_valid(val):
    if not val or val == "N/A" or val == "---":
        return False
    blacklist = ["BẢNG", "TỔNG HỢP", "PHẦN", "MỤC", "FILE", "DỰ ÁN", "DANH MỤC"]
    v = val.upper()
    for word in blacklist:
        if word in v:
            return False
    if len(val) > 60:
        return False
    return True

def score_metadata(m):
    score = 0
    if is_valid(m.get('contract_number', '')): score += 10
    if is_valid(m.get('investor', '')): score += 5
    if is_valid(m.get('contractor', '')): score += 5
    if is_valid(m.get('signed_date', '')): score += 8
    if is_valid(m.get('duration', '')): score += 3
    if m.get('bom_table') and len(m['bom_table']) > 0: score += 2
    return score

def sync_metadata():
    db_path = r'J:\My Drive\-----TRIEN KHAI -----\Duan_Camera_LamDong.pmp'
    
    if not os.path.exists(db_path):
        print(f"Error: Database not found at {db_path}")
        return

    try:
        # Connect with timeout to handle potential app locks
        conn = sqlite3.connect(db_path, timeout=20.0)
        cursor = conn.cursor()

        print(f"Connected to database: {db_path}")

        # 1. Fetch all metadata from files
        cursor.execute("SELECT path, metadata_json FROM files WHERE metadata_json IS NOT NULL")
        files = cursor.fetchall()
        
        if not files:
            print("No analyzed files found in the database.")
            return

        best_metadata = None
        best_score = -1
        best_path = ""

        for path, meta_str in files:
            try:
                meta = json.loads(meta_str)
                score = score_metadata(meta)
                print(f"File: {os.path.basename(path)} | Score: {score}")
                
                if score > best_score:
                    best_score = score
                    best_metadata = meta
                    best_path = path
            except Exception as e:
                print(f"Failed to parse JSON for {path}: {e}")

        if best_metadata and best_score > 0:
            print(f"\n--- BEST METADATA FOUND (Score: {best_score}) ---")
            print(f"Source: {best_path}")
            print(f"Contract: {best_metadata.get('contract_number')}")
            print(f"Investor: {best_metadata.get('investor')}")
            
            # 2. Update Projects Table
            # Note: We update ID=1 as primary project or ALL projects in the file
            cursor.execute("""
                UPDATE projects SET 
                    contract_number = ?,
                    investor = ?,
                    contractor = ?,
                    signed_date = ?,
                    duration = ?,
                    end_date = ?,
                    updated_at = CURRENT_TIMESTAMP
            """, (
                best_metadata.get('contract_number', ''),
                best_metadata.get('investor', ''),
                best_metadata.get('contractor', ''),
                best_metadata.get('signed_date', ''),
                best_metadata.get('duration', ''),
                best_metadata.get('end_date', '')
            ))
            
            # 3. Synchronize with Contracts table as well
            # Update specific contract records that match this file path
            total_val = sum(item.get('total', 0) for item in best_metadata.get('bom_table', []))
            
            cursor.execute("""
                UPDATE contracts SET 
                    contract_number = ?,
                    vendor = ?,
                    value = ?,
                    signed_date = ?,
                    has_analysis = 1
                WHERE REPLACE(file_path, '\\', '/') = ? COLLATE NOCASE
            """, (
                best_metadata.get('contract_number', ''),
                best_metadata.get('contractor', ''),
                total_val,
                best_metadata.get('signed_date', ''),
                best_path.replace('\\', '/')
            ))

            conn.commit()
            print("\nSuccessfully synchronized project and contract metadata.")
        else:
            print("\nNo high-quality metadata found to synchronize.")

        conn.close()

    except Exception as e:
        print(f"Error during synchronization: {e}")

if __name__ == "__main__":
    sync_metadata()

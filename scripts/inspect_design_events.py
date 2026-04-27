import sqlite3
import os
import json

db_path = r"D:\Code Antinigaty\Phan mem quan ly file V4\RUST\1213.pmp"

def inspect():
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 1. Check schemas
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        print(f"Available tables: {tables}")
        
        table_name = "design_events"
        if ("design_events",) not in tables:
            print("design_events not found. Searching for similar names...")
            # Fallback or exit
            return
        
        # 2. Events by type
        cursor.execute("SELECT event_type, COUNT(*) FROM design_events GROUP BY event_type")
        print("Events by type:", cursor.fetchall())
        
        # 3. Track IDs
        cursor.execute("SELECT payload_json FROM design_events WHERE event_type = 'FeatureCreated'")
        created_ids = set()
        for row in cursor.fetchall():
            try:
                p = json.loads(row[0])
                created_ids.add(p['payload']['id'])
            except json.JSONDecodeError as je:
                print(f"Failed to parse JSON in FeatureCreated: {je}")
            except KeyError as ke:
                print(f"Missing key in FeatureCreated payload: {ke}")

        cursor.execute("SELECT payload_json FROM design_events WHERE event_type = 'FeatureDeleted'")
        deleted_ids = set()
        for row in cursor.fetchall():
            try:
                p = json.loads(row[0])
                deleted_ids.add(p['payload']['id'])
            except json.JSONDecodeError as je:
                print(f"Failed to parse JSON in FeatureDeleted: {je}")
            except KeyError as ke:
                print(f"Missing key in FeatureDeleted payload: {ke}")
            
        print(f"Created IDs: {len(created_ids)}")
        print(f"Deleted IDs: {len(deleted_ids)}")
        print(f"Net Active: {len(created_ids - deleted_ids)}")
        
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect()

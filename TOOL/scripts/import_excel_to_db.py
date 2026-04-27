import openpyxl
import sqlite3
import json
import uuid
import datetime
import os

db_path = r'D:\Code Antinigaty\Phan mem quan ly file V4\1213.pmp'
excel_path = 'data_Desig.xlsx'

def import_data():
    if not os.path.exists(excel_path):
        print(f"Error: Excel file not found at {excel_path}")
        return
        
    wb = openpyxl.load_workbook(excel_path, data_only=True)
    sheet = wb.active
    rows = list(sheet.rows)
    
    if not rows:
        print("Error: Empty Excel sheet")
        return
        
    headers = [cell.value for cell in rows[0]]
    
    # 1. Connect to DB
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    try:
        # Get active project (assuming the one in 1213.pmp)
        cur.execute("SELECT id FROM projects LIMIT 1")
        project_id = cur.fetchone()[0]
        
        # Get or Create default Layer and Group for these imports
        layer_id = str(uuid.uuid4())
        group_id = str(uuid.uuid4())
        
        # We'll create events for these too
        now = datetime.datetime.now().isoformat()
        
        events = []
        
        # Event: Layer Created
        events.append({
            "event_id": str(uuid.uuid4()),
            "project_id": project_id,
            "event_type": "LayerCreated",
            "payload_json": json.dumps({
                "type": "LayerCreated",
                "payload": {"id": layer_id, "region_id": "root", "name": "Imported from Excel"}
            }),
            "timestamp": now
        })
        
        # Event: Feature Group Created
        events.append({
            "event_id": str(uuid.uuid4()),
            "project_id": project_id,
            "event_type": "FeatureGroupCreated",
            "payload_json": json.dumps({
                "type": "FeatureGroupCreated",
                "payload": {"id": group_id, "layer_id": layer_id, "parent_id": None, "name": "Excel Nodes", "group_type": "point"}
            }),
            "timestamp": now
        })
        
        # Identify Materials from headers (Index 4 to 39)
        material_map = {} # header_name -> material_id
        for i in range(4, 40):
            h = headers[i]
            if h and h != "None" and h != "Ghi chú":
                cur.execute("SELECT id FROM materials WHERE name = ?", (h,))
                row = cur.fetchone()
                if row:
                    material_map[h] = (row[0], i)
                else:
                    cur.execute("INSERT INTO materials (name, unit) VALUES (?, ?)", (h, "Cái/M"))
                    material_map[h] = (cur.lastrowid, i)
        
        # Process Rows
        for row_idx, row in enumerate(rows[1:]):
            vals = [cell.value for cell in row]
            if len(vals) < 4: continue
            
            lat = vals[1]
            lon = vals[2]
            name = vals[3]
            
            if not lat or not lon: continue
            
            # Create Feature
            feature_id = str(uuid.uuid4())
            
            feature_payload = {
                "type": "FeatureCreated",
                "payload": {
                    "id": feature_id,
                    "group_id": group_id,
                    "name": str(name),
                    "geom_type": "point",
                    "metadata": "{}",
                    "coordinates": [float(lon), float(lat)],
                    "properties": {"excel_row": row_idx + 2}
                }
            }
            
            events.append({
                "event_id": str(uuid.uuid4()),
                "project_id": project_id,
                "event_type": "FeatureCreated",
                "payload_json": json.dumps(feature_payload, ensure_ascii=False),
                "timestamp": now
            })
            
            # Create Work Items for this feature
            for m_name, (m_id, col_idx) in material_map.items():
                qty = vals[col_idx]
                if qty and str(qty).strip() and str(qty) != "0":
                    try:
                        # Handle basic numeric conversion (Excel might have formulas or strings)
                        q_val = float(qty) if not isinstance(qty, str) else 0
                        if q_val > 0:
                            cur.execute(
                                "INSERT INTO work_items (project_id, feature_id, name, material_id, quantity) VALUES (?, ?, ?, ?, ?)",
                                (project_id, feature_id, m_name, m_id, q_val)
                            )
                    except (ValueError, TypeError) as conv_error:
                        print(f"Failed to convert quantity for '{m_name}': {conv_error}")
                        pass  # Skip invalid quantities
        
        # Insert all events
        for e in events:
            cur.execute(
                "INSERT INTO design_events (event_id, project_id, event_type, payload_json, timestamp) VALUES (?, ?, ?, ?, ?)",
                (e["event_id"], e["project_id"], e["event_type"], e["payload_json"], e["timestamp"])
            )
            
        conn.commit()
        print(f"Successfully imported {len(events)-2} features and their work items.")
        
    except Exception as ex:
        conn.rollback()
        print(f"Error during import: {ex}")
    finally:
        conn.close()

if __name__ == "__main__":
    import_data()

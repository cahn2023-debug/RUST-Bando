import sqlite3
import uuid

db_path = r"D:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp"

def apply_fix():
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 1. Identify Target (Winner)
        cursor.execute("SELECT project_id, COUNT(*) as cnt FROM event_store GROUP BY project_id ORDER BY cnt DESC")
        event_counts = cursor.fetchall()
        
        if not event_counts:
            print("No events found in event_store. Cannot proceed.")
            return

        winner_id = event_counts[0][0]
        print(f"Winner ID: {winner_id} with {event_counts[0][1]} events.")

        # 2. Consolidate events
        cursor.execute("UPDATE event_store SET project_id = ?", (winner_id,))
        print(f"Consolidated all events to {winner_id}.")

        # 3. Purge redundant projects
        cursor.execute("SELECT id, name FROM projects")
        projects = cursor.fetchall()
        for pid, name in projects:
            if pid != winner_id:
                print(f"Deleting redundant project record: {pid} ({name})")
                cursor.execute("DELETE FROM projects WHERE id = ?", (pid,))

        # 4. Sync Metadata
        cursor.execute("UPDATE pmp_metadata SET project_id = ?", (winner_id,))
        print("Updated pmp_metadata.")

        # 5. Clear empty features to force app to see they are missing (app logic will handle rebuild if I don't do it here)
        # Actually, I'll delete all features to force a clean slate for the winner
        cursor.execute("DELETE FROM features")
        print("Cleared features table to force a clean rebuild on next open.")

        conn.commit()
        conn.close()
        print("\n=== FIX APPLIED SUCCESSFULLY ===")
    except Exception as e:
        print(f"Error applying fix: {e}")

if __name__ == "__main__":
    apply_fix()

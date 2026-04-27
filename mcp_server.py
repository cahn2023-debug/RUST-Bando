import sqlite3
import json
import os
from mcp.server.fastmcp import FastMCP

# Initialize FastMCP server
mcp = FastMCP("ProjectManager")

def get_appdata_dir():
    appdata = os.environ.get('APPDATA')
    if not appdata:
        return None
    return os.path.join(appdata, "com.thanhbui.offline-project-manager")

def get_active_pmp_path():
    config_dir = get_appdata_dir()
    if not config_dir:
        return None
    settings_path = os.path.join(config_dir, "settings.json")
    if os.path.exists(settings_path):
        with open(settings_path, 'r', encoding='utf-8') as f:
            settings = json.load(f)
            return settings.get("last_opened_pmp")
    return None

def get_db_connection(pmp_path=None):
    """Establishes a connection to the active project database."""
    if not pmp_path:
        pmp_path = get_active_pmp_path()
    
    if not pmp_path or not os.path.exists(pmp_path):
        raise FileNotFoundError(f"Active project file not found or path missing: {pmp_path}")
    
    # Use URI for read-only if possible, or just standard connect
    conn = sqlite3.connect(pmp_path)
    conn.row_factory = sqlite3.Row
    return conn

@mcp.tool()
def get_system_settings():
    """Get the global application settings (deviceId, lastOpenedPmp, recentPmps)."""
    config_dir = get_appdata_dir()
    if not config_dir:
        return {"error": "AppData not found"}
    settings_path = os.path.join(config_dir, "settings.json")
    if os.path.exists(settings_path):
        with open(settings_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"error": "Settings file not found"}

@mcp.tool()
def get_active_project_info():
    """Get metadata for the currently active project."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM projects LIMIT 1")
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else {"error": "No project record found in PMP"}
    except Exception as e:
        return {"error": str(e)}

@mcp.tool()
def list_tasks(status_filter: str = None):
    """List tasks for the active project.
    
    Args:
        status_filter: Optional filter by status (e.g., 'active', 'completed').
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        query = "SELECT id, name, status, priority, start_date, end_date, is_completed FROM tasks"
        params = []
        if status_filter:
            query += " WHERE status = ?"
            params.append(status_filter)
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]
    except Exception as e:
        return {"error": str(e)}

@mcp.tool()
def list_notes():
    """List all notes for the active project."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, title, content, updated_at FROM notes")
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]
    except Exception as e:
        return {"error": str(e)}

@mcp.tool()
def search_project(query: str):
    """Search for information across tasks, notes, and files using FTS.
    
    Args:
        query: The search term.
    """
    results = {}
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Search Tasks
        cursor.execute("SELECT task_id as id, name, description FROM task_search WHERE task_search MATCH ?", (query,))
        results["tasks"] = [dict(row) for row in rows] if (rows := cursor.fetchall()) else []
        
        # Search Notes
        cursor.execute("SELECT note_id as id, title, content FROM note_search WHERE note_search MATCH ?", (query,))
        results["notes"] = [dict(row) for row in rows] if (rows := cursor.fetchall()) else []
        
        conn.close()
        return results
    except Exception as e:
        return {"error": str(e)}

@mcp.tool()
def get_recent_errors():
    """Retrieve the latest entries from the system error log."""
    log_path = os.path.join("src-tauri", "src", "domain", "implement", "commands", "errors_v3_utf8.log")
    if os.path.exists(log_path):
        try:
            with open(log_path, 'r', encoding='utf-8') as f:
                return f.readlines()[-30:] # Last 30 lines
        except Exception as e:
            return {"error": f"Failed to read logs: {e}"}
    return {"error": "Log file not found"}

if __name__ == "__main__":
    mcp.run()

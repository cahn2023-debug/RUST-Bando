import sqlite3
import json
import os

db_path = "1213.pmp"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

print("--- FIXING SCHEMA MISMATCHES ---")

# 1. Projects table: add end_date
try:
    cursor.execute("ALTER TABLE projects ADD COLUMN end_date TEXT")
    print("Added end_date to projects table.")
except sqlite3.OperationalError:
    print("Column end_date already exists in projects table.")

# 2. Contracts table: add has_analysis
try:
    cursor.execute("ALTER TABLE contracts ADD COLUMN has_analysis INTEGER DEFAULT 0")
    print("Added has_analysis to contracts table.")
except sqlite3.OperationalError:
    print("Column has_analysis already exists in contracts table.")

conn.commit()
conn.close()
print("Schema fixed successfully.")

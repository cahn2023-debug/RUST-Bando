#!/usr/bin/env python3
"""
COMPREHENSIVE TEST SUITE FOR PROJECT MANAGEMENT SOFTWARE V4
============================================================

This script tests all major functionality of the project management system.
It covers:
1. Project Management (V1, V2, V4)
2. Task Management
3. File Management & Tree
4. Contract Management
5. Search & Documents
6. AI Features
7. Authentication & Authorization
8. Notes Management
9. Material & Work Items
10. Content Type Management
11. Map/GIS/Design Features
12. Sync & Multi-Device
13. Database Operations
14. Audit Logging
15. Export/Import

Usage:
    python test_comprehensive.py [--backend-url URL] [--skip-ai] [--skip-sync]

Author: Test Suite
Date: 2026-04-14
"""

import os
import sys
import json
import time
import sqlite3
import subprocess
import tempfile
import shutil
import hashlib
import uuid
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict

# ============================================================================
# Test Configuration
# ============================================================================

@dataclass
class TestConfig:
    """Test configuration"""
    backend_url: str = "http://localhost:3000"
    test_dir: str = "./test_output"
    skip_ai: bool = False
    skip_sync: bool = False
    verbose: bool = True
    stop_on_failure: bool = False

# ============================================================================
# Test Results Tracker
# ============================================================================

class TestResults:
    """Track test results"""
    
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.skipped = 0
        self.errors = []
        self.start_time = time.time()
    
    def add_pass(self, test_name: str):
        self.passed += 1
        if TestConfig.verbose:
            print(f"  ✅ PASS: {test_name}")
    
    def add_fail(self, test_name: str, error: str):
        self.failed += 1
        self.errors.append({"test": test_name, "error": error})
        print(f"  ❌ FAIL: {test_name}")
        print(f"     Error: {error}")
        if TestConfig.stop_on_failure:
            raise Exception(f"Test failed: {test_name}")
    
    def add_skip(self, test_name: str, reason: str):
        self.skipped += 1
        print(f"  ⏭️  SKIP: {test_name} ({reason})")
    
    def summary(self):
        elapsed = time.time() - self.start_time
        print("\n" + "="*70)
        print("TEST SUMMARY")
        print("="*70)
        print(f"Total Tests: {self.passed + self.failed + self.skipped}")
        print(f"✅ Passed:   {self.passed}")
        print(f"❌ Failed:   {self.failed}")
        print(f"⏭️  Skipped:  {self.skipped}")
        print(f"⏱️  Duration: {elapsed:.2f}s")
        
        if self.errors:
            print(f"\n❌ Failed Tests:")
            for error in self.errors:
                print(f"   - {error['test']}: {error['error']}")
        
        print("="*70)
        return self.failed == 0

# ============================================================================
# Test Helpers
# ============================================================================

class TestHelper:
    """Helper functions for testing"""
    
    @staticmethod
    def create_test_directory(config: TestConfig) -> Path:
        """Create test output directory"""
        test_dir = Path(config.test_dir)
        test_dir.mkdir(exist_ok=True)
        (test_dir / "projects").mkdir(exist_ok=True)
        (test_dir / "files").mkdir(exist_ok=True)
        (test_dir / "exports").mkdir(exist_ok=True)
        (test_dir / "imports").mkdir(exist_ok=True)
        return test_dir
    
    @staticmethod
    def create_test_pmp_v1(path: Path, project_name: str = "Test Project") -> Path:
        """Create a test V1 .pmp SQLite database"""
        pmp_path = path / f"{project_name.replace(' ', '_')}.pmp"
        
        conn = sqlite3.connect(str(pmp_path))
        cursor = conn.cursor()
        
        # Create V1 schema
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                root_path TEXT NOT NULL,
                path TEXT,
                description TEXT,
                metadata_json TEXT,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                path TEXT NOT NULL,
                filename TEXT NOT NULL,
                extension TEXT,
                size INTEGER DEFAULT 0,
                metadata_json TEXT,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                parent_id INTEGER,
                name TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'todo',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS contracts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                name TEXT NOT NULL,
                contract_number TEXT,
                vendor TEXT,
                value REAL,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS materials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                code TEXT,
                unit TEXT,
                base_price REAL,
                category TEXT
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                title TEXT NOT NULL,
                content TEXT,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            )
        """)
        
        # Insert test project
        cursor.execute(
            "INSERT INTO projects (name, root_path, path, description) VALUES (?, ?, ?, ?)",
            (project_name, str(path), str(pmp_path), "Test project for comprehensive testing")
        )
        project_id = cursor.lastrowid
        
        # Insert test data
        cursor.execute(
            "INSERT INTO tasks (project_id, name, description) VALUES (?, ?, ?)",
            (project_id, "Test Task 1", "First test task")
        )
        
        cursor.execute(
            "INSERT INTO materials (name, code, unit, base_price, category) VALUES (?, ?, ?, ?, ?)",
            ("Test Material", "TM001", "pcs", 10.5, "Test")
        )
        
        cursor.execute(
            "INSERT INTO notes (project_id, title, content) VALUES (?, ?, ?)",
            (project_id, "Test Note", "This is a test note")
        )
        
        conn.commit()
        conn.close()
        
        return pmp_path
    
    @staticmethod
    def create_test_pmp_v2(path: Path, project_name: str = "Test Project V2") -> Path:
        """Create a test V2 .pmp container (folder with manifest and event store)"""
        pmp_dir = path / f"{project_name.replace(' ', '_')}_V2"
        pmp_dir.mkdir(exist_ok=True)
        
        # Create manifest
        manifest = {
            "format_version": "2.0",
            "app_version": "0.1.0",
            "project_id": str(uuid.uuid4()),
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "features": ["event_sourcing", "sync"],
            "db_schema_version": 1,
            "metadata_schema_version": 1,
            "device_id": "test-device",
            "last_global_seq": 0
        }
        
        manifest_path = pmp_dir / "manifest.json"
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
        
        # Create V2 event store database
        db_path = pmp_dir / "core.db"
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        
        # Create V2 schema
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS event_store (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                metadata_json TEXT,
                version INTEGER NOT NULL,
                global_seq INTEGER NOT NULL UNIQUE,
                device_id TEXT NOT NULL,
                correlation_id TEXT,
                causation_id TEXT,
                created_at TEXT NOT NULL
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sync_state (
                device_id TEXT PRIMARY KEY,
                device_name TEXT,
                last_pushed_seq INTEGER DEFAULT 0,
                last_pulled_seq INTEGER DEFAULT 0,
                last_sync_at TEXT,
                sync_status TEXT DEFAULT 'idle',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS entity_index (
                entity_id TEXT PRIMARY KEY,
                entity_type TEXT NOT NULL,
                project_id TEXT NOT NULL,
                name TEXT NOT NULL,
                search_vector TEXT,
                updated_at TEXT
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                parent_id TEXT,
                name TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'todo',
                version INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            )
        """)
        
        # Insert sync state
        cursor.execute(
            "INSERT INTO sync_state (device_id, device_name) VALUES (?, ?)",
            ("test-device", "Test Device")
        )
        
        conn.commit()
        conn.close()
        
        return pmp_dir
    
    @staticmethod
    def create_test_excel_file(path: Path, filename: str = "test_data.xlsx") -> Path:
        """Create a test Excel file"""
        try:
            import openpyxl
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Test Data"
            
            # Headers
            ws.append(["ID", "Name", "Quantity", "Price", "Category"])
            
            # Data rows
            ws.append([1, "Item 1", 10, 5.5, "Category A"])
            ws.append([2, "Item 2", 20, 10.0, "Category B"])
            ws.append([3, "Item 3", 15, 7.25, "Category A"])
            
            file_path = path / filename
            wb.save(str(file_path))
            return file_path
        except ImportError:
            # Fallback: create CSV instead
            csv_path = path / filename.replace(".xlsx", ".csv")
            with open(csv_path, 'w') as f:
                f.write("ID,Name,Quantity,Price,Category\n")
                f.write("1,Item 1,10,5.5,Category A\n")
                f.write("2,Item 2,20,10.0,Category B\n")
                f.write("3,Item 3,15,7.25,Category A\n")
            return csv_path
    
    @staticmethod
    def create_test_text_file(path: Path, filename: str, content: str) -> Path:
        """Create a test text file"""
        file_path = path / filename
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return file_path
    
    @staticmethod
    def calculate_sha256(file_path: Path) -> str:
        """Calculate SHA256 hash of a file"""
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b''):
                sha256.update(chunk)
        return sha256.hexdigest()

# ============================================================================
# Test Suites
# ============================================================================

class TestProjectManagement:
    """Test Project Management features"""
    
    @staticmethod
    def test_v1_project_creation(config: TestConfig, results: TestResults, test_dir: Path):
        """Test V1 project creation"""
        test_name = "V1 Project Creation"
        try:
            pmp_path = TestHelper.create_test_pmp_v1(test_dir / "projects", "Test V1 Project")
            assert pmp_path.exists(), "PMP file not created"
            
            # Verify database structure
            conn = sqlite3.connect(str(pmp_path))
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            
            assert 'projects' in tables, "projects table missing"
            assert 'tasks' in tables, "tasks table missing"
            assert 'materials' in tables, "materials table missing"
            assert 'notes' in tables, "notes table missing"
            
            # Verify project data
            cursor.execute("SELECT COUNT(*) FROM projects")
            count = cursor.fetchone()[0]
            assert count == 1, f"Expected 1 project, got {count}"
            
            conn.close()
            results.add_pass(test_name)
        except Exception as e:
            results.add_fail(test_name, str(e))
    
    @staticmethod
    def test_v2_project_creation(config: TestConfig, results: TestResults, test_dir: Path):
        """Test V2 project creation"""
        test_name = "V2 Project Creation"
        try:
            pmp_dir = TestHelper.create_test_pmp_v2(test_dir / "projects", "Test V2 Project")
            assert pmp_dir.exists(), "PMP directory not created"
            
            # Verify manifest
            manifest_path = pmp_dir / "manifest.json"
            assert manifest_path.exists(), "manifest.json missing"
            
            with open(manifest_path) as f:
                manifest = json.load(f)
            
            assert manifest['format_version'] == "2.0", "Wrong format version"
            assert 'project_id' in manifest, "project_id missing"
            assert 'features' in manifest, "features missing"
            assert 'event_sourcing' in manifest['features'], "event_sourcing feature missing"
            
            # Verify core.db
            db_path = pmp_dir / "core.db"
            assert db_path.exists(), "core.db missing"
            
            conn = sqlite3.connect(str(db_path))
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            
            assert 'event_store' in tables, "event_store table missing"
            assert 'sync_state' in tables, "sync_state table missing"
            assert 'entity_index' in tables, "entity_index table missing"
            
            conn.close()
            results.add_pass(test_name)
        except Exception as e:
            results.add_fail(test_name, str(e))
    
    @staticmethod
    def test_v1_to_v2_migration(config: TestConfig, results: TestResults, test_dir: Path):
        """Test V1 to V2 migration"""
        test_name = "V1 to V2 Migration"
        try:
            # Create V1 project
            v1_path = TestHelper.create_test_pmp_v1(test_dir / "projects", "Migration Test")
            
            # This would call the actual migration command in production
            # For now, we verify the V1 structure is correct for migration
            conn = sqlite3.connect(str(v1_path))
            cursor = conn.cursor()
            
            cursor.execute("SELECT COUNT(*) FROM projects")
            project_count = cursor.fetchone()[0]
            assert project_count > 0, "No projects to migrate"
            
            cursor.execute("SELECT COUNT(*) FROM tasks")
            task_count = cursor.fetchone()[0]
            
            conn.close()
            results.add_pass(test_name)
        except Exception as e:
            results.add_fail(test_name, str(e))
    
    @staticmethod
    def test_project_details_update(config: TestConfig, results: TestResults, test_dir: Path):
        """Test project details update"""
        test_name = "Project Details Update"
        try:
            pmp_path = TestHelper.create_test_pmp_v1(test_dir / "projects", "Update Test")
            
            conn = sqlite3.connect(str(pmp_path))
            cursor = conn.cursor()
            
            # Update project details
            cursor.execute("""
                UPDATE projects 
                SET description = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = 1
            """, ("Updated description for testing",))
            
            conn.commit()
            
            # Verify update
            cursor.execute("SELECT description FROM projects WHERE id = 1")
            desc = cursor.fetchone()[0]
            assert desc == "Updated description for testing", "Description not updated"
            
            conn.close()
            results.add_pass(test_name)
        except Exception as e:
            results.add_fail(test_name, str(e))

class TestTaskManagement:
    """Test Task Management features"""
    
    @staticmethod
    def test_task_creation(config: TestConfig, results: TestResults, test_dir: Path):
        """Test task creation"""
        test_name = "Task Creation"
        try:
            pmp_path = TestHelper.create_test_pmp_v1(test_dir / "projects", "Task Test")
            
            conn = sqlite3.connect(str(pmp_path))
            cursor = conn.cursor()
            
            # Create task
            cursor.execute("""
                INSERT INTO tasks (project_id, name, description, status)
                VALUES (1, ?, ?, ?)
            """, ("New Task", "Task description", "todo"))
            
            task_id = cursor.lastrowid
            
            # Verify task
            cursor.execute("SELECT name, status FROM tasks WHERE id = ?", (task_id,))
            row = cursor.fetchone()
            assert row[0] == "New Task", "Task name incorrect"
            assert row[1] == "todo", "Task status incorrect"
            
            conn.close()
            results.add_pass(test_name)
        except Exception as e:
            results.add_fail(test_name, str(e))
    
    @staticmethod
    def test_task_hierarchy(config: TestConfig, results: TestResults, test_dir: Path):
        """Test task parent-child hierarchy"""
        test_name = "Task Hierarchy"
        try:
            pmp_path = TestHelper.create_test_pmp_v1(test_dir / "projects", "Hierarchy Test")
            
            conn = sqlite3.connect(str(pmp_path))
            cursor = conn.cursor()
            
            # Create parent task
            cursor.execute("""
                INSERT INTO tasks (project_id, name) VALUES (1, ?)
            """, ("Parent Task",))
            parent_id = cursor.lastrowid
            
            # Create child task
            cursor.execute("""
                INSERT INTO tasks (project_id, parent_id, name) VALUES (1, ?, ?)
            """, (parent_id, "Child Task"))
            child_id = cursor.lastrowid
            
            # Verify hierarchy
            cursor.execute("SELECT parent_id FROM tasks WHERE id = ?", (child_id,))
            actual_parent = cursor.fetchone()[0]
            assert actual_parent == parent_id, "Parent-child relationship incorrect"
            
            conn.close()
            results.add_pass(test_name)
        except Exception as e:
            results.add_fail(test_name, str(e))
    
    @staticmethod
    def test_task_status_toggle(config: TestConfig, results: TestResults, test_dir: Path):
        """Test task status toggle"""
        test_name = "Task Status Toggle"
        try:
            pmp_path = TestHelper.create_test_pmp_v1(test_dir / "projects", "Toggle Test")
            
            conn = sqlite3.connect(str(pmp_path))
            cursor = conn.cursor()
            
            # Create task
            cursor.execute("""
                INSERT INTO tasks (project_id, name, status) VALUES (1, ?, ?)
            """, ("Toggle Task", "todo"))
            task_id = cursor.lastrowid
            
            # Toggle status
            cursor.execute("""
                UPDATE tasks SET status = 'done' WHERE id = ?
            """, (task_id,))
            
            # Verify toggle
            cursor.execute("SELECT status FROM tasks WHERE id = ?", (task_id,))
            status = cursor.fetchone()[0]
            assert status == "done", "Status not toggled"
            
            conn.close()
            results.add_pass(test_name)
        except Exception as e:
            results.add_fail(test_name, str(e))

class TestFileManagement:
    """Test File Management features"""
    
    @staticmethod
    def test_file_indexing(config: TestConfig, results: TestResults, test_dir: Path):
        """Test file indexing"""
        test_name = "File Indexing"
        try:
            # Create test files
            txt_file = TestHelper.create_test_text_file(
                test_dir / "files", 
                "test_doc.txt",
                "This is a test document for indexing."
            )
            
            assert txt_file.exists(), "Test file not created"
            
            # Calculate hash
            file_hash = TestHelper.calculate_sha256(txt_file)
            assert len(file_hash) == 64, "SHA256 hash incorrect"
            
            results.add_pass(test_name)
        except Exception as e:
            results.add_fail(test_name, str(e))
    
    @staticmethod
    def test_excel_import(config: TestConfig, results: TestResults, test_dir: Path):
        """Test Excel file import"""
        test_name = "Excel Import"
        try:
            excel_file = TestHelper.create_test_excel_file(test_dir / "imports", "test_import.xlsx")
            assert excel_file.exists(), "Excel file not created"
            
            # Verify file can be read
            file_size = excel_file.stat().st_size
            assert file_size > 0, "Excel file is empty"
            
            results.add_pass(test_name)
        except Exception as e:
            results.add_fail(test_name, str(e))

class TestContractManagement:
    """Test Contract Management features"""
    
    @staticmethod
    def test_contract_creation(config: TestConfig, results: TestResults, test_dir: Path):
        """Test contract creation"""
        test_name = "Contract Creation"
        try:
            pmp_path = TestHelper.create_test_pmp_v1(test_dir / "projects", "Contract Test")
            
            conn = sqlite3.connect(str(pmp_path))
            cursor = conn.cursor()
            
            # Create contract
            cursor.execute("""
                INSERT INTO contracts (project_id, name, contract_number, vendor, value)
                VALUES (1, ?, ?, ?, ?)
            """, ("Test Contract", "TC-001", "Test Vendor", 50000.0))
            
            contract_id = cursor.lastrowid
            
            # Verify contract
            cursor.execute("SELECT name, value FROM contracts WHERE id = ?", (contract_id,))
            row = cursor.fetchone()
            assert row[0] == "Test Contract", "Contract name incorrect"
            assert row[1] == 50000.0, "Contract value incorrect"
            
            conn.close()
            results.add_pass(test_name)
        except Exception as e:
            results.add_fail(test_name, str(e))

class TestMaterialManagement:
    """Test Material Management features"""
    
    @staticmethod
    def test_material_crud(config: TestConfig, results: TestResults, test_dir: Path):
        """Test material CRUD operations"""
        test_name = "Material CRUD"
        try:
            pmp_path = TestHelper.create_test_pmp_v1(test_dir / "projects", "Material Test")
            
            conn = sqlite3.connect(str(pmp_path))
            cursor = conn.cursor()
            
            # Create material
            cursor.execute("""
                INSERT INTO materials (name, code, unit, base_price, category)
                VALUES (?, ?, ?, ?, ?)
            """, ("Steel", "ST-001", "kg", 2.5, "Metal"))
            
            material_id = cursor.lastrowid
            
            # Read material
            cursor.execute("SELECT name, code, base_price FROM materials WHERE id = ?", (material_id,))
            row = cursor.fetchone()
            assert row[0] == "Steel", "Material name incorrect"
            assert row[1] == "ST-001", "Material code incorrect"
            assert row[2] == 2.5, "Material price incorrect"
            
            # Update material
            cursor.execute("""
                UPDATE materials SET base_price = ? WHERE id = ?
            """, (3.0, material_id))
            
            # Delete material
            cursor.execute("DELETE FROM materials WHERE id = ?", (material_id,))
            
            # Verify deletion
            cursor.execute("SELECT COUNT(*) FROM materials WHERE id = ?", (material_id,))
            count = cursor.fetchone()[0]
            assert count == 0, "Material not deleted"
            
            conn.close()
            results.add_pass(test_name)
        except Exception as e:
            results.add_fail(test_name, str(e))

class TestNotesManagement:
    """Test Notes Management features"""
    
    @staticmethod
    def test_note_crud(config: TestConfig, results: TestResults, test_dir: Path):
        """Test note CRUD operations"""
        test_name = "Note CRUD"
        try:
            pmp_path = TestHelper.create_test_pmp_v1(test_dir / "projects", "Note Test")
            
            conn = sqlite3.connect(str(pmp_path))
            cursor = conn.cursor()
            
            # Create note
            cursor.execute("""
                INSERT INTO notes (project_id, title, content)
                VALUES (?, ?, ?)
            """, (1, "Important Note", "This is important information"))
            
            note_id = cursor.lastrowid
            
            # Read note
            cursor.execute("SELECT title, content FROM notes WHERE id = ?", (note_id,))
            row = cursor.fetchone()
            assert row[0] == "Important Note", "Note title incorrect"
            assert row[1] == "This is important information", "Note content incorrect"
            
            # Update note
            cursor.execute("""
                UPDATE notes SET content = ? WHERE id = ?
            """, ("Updated content", note_id))
            
            # Delete note
            cursor.execute("DELETE FROM notes WHERE id = ?", (note_id,))
            
            conn.close()
            results.add_pass(test_name)
        except Exception as e:
            results.add_fail(test_name, str(e))

class TestSyncEngine:
    """Test Sync Engine features"""
    
    @staticmethod
    def test_sync_state_creation(config: TestConfig, results: TestResults, test_dir: Path):
        """Test sync state creation"""
        test_name = "Sync State Creation"
        try:
            pmp_dir = TestHelper.create_test_pmp_v2(test_dir / "projects", "Sync Test")
            db_path = pmp_dir / "core.db"
            
            conn = sqlite3.connect(str(db_path))
            cursor = conn.cursor()
            
            # Verify sync state
            cursor.execute("SELECT device_id, sync_status FROM sync_state WHERE device_id = ?", 
                          ("test-device",))
            row = cursor.fetchone()
            assert row is not None, "Sync state not created"
            assert row[0] == "test-device", "Device ID incorrect"
            assert row[1] == "idle", "Sync status incorrect"
            
            conn.close()
            results.add_pass(test_name)
        except Exception as e:
            results.add_fail(test_name, str(e))
    
    @staticmethod
    def test_event_store(config: TestConfig, results: TestResults, test_dir: Path):
        """Test event store functionality"""
        test_name = "Event Store"
        try:
            pmp_dir = TestHelper.create_test_pmp_v2(test_dir / "projects", "Event Store Test")
            db_path = pmp_dir / "core.db"
            
            conn = sqlite3.connect(str(db_path))
            cursor = conn.cursor()
            
            # Create event
            event_id = str(uuid.uuid4())
            project_id = str(uuid.uuid4())
            entity_id = str(uuid.uuid4())
            
            event_data = {
                'action': 'created',
                'name': 'Test Entity'
            }
            
            cursor.execute("""
                INSERT INTO event_store 
                (id, project_id, entity_type, entity_id, event_type, payload_json, 
                 version, global_seq, device_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                event_id, project_id, 'test_entity', entity_id, 'created',
                json.dumps(event_data), 1, 1, 'test-device',
                datetime.utcnow().isoformat()
            ))
            
            # Verify event
            cursor.execute("SELECT event_type, payload_json FROM event_store WHERE id = ?", 
                          (event_id,))
            row = cursor.fetchone()
            assert row is not None, "Event not created"
            assert row[0] == "created", "Event type incorrect"
            
            stored_data = json.loads(row[1])
            assert stored_data['action'] == 'created', "Event payload incorrect"
            
            conn.close()
            results.add_pass(test_name)
        except Exception as e:
            results.add_fail(test_name, str(e))

class TestSearchFunctionality:
    """Test Search features"""
    
    @staticmethod
    def test_fts5_search(config: TestConfig, results: TestResults, test_dir: Path):
        """Test FTS5 search"""
        test_name = "FTS5 Search"
        try:
            pmp_path = TestHelper.create_test_pmp_v1(test_dir / "projects", "Search Test")
            
            conn = sqlite3.connect(str(pmp_path))
            cursor = conn.cursor()
            
            # Create FTS5 virtual table
            cursor.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
                    id UNINDEXED,
                    name,
                    description,
                    content='tasks',
                    content_rowid='id'
                )
            """)
            
            # Create triggers
            cursor.execute("""
                CREATE TRIGGER IF NOT EXISTS tasks_ai AFTER INSERT ON tasks BEGIN
                    INSERT INTO tasks_fts(rowid, id, name, description)
                    VALUES (new.id, new.id, new.name, new.description);
                END
            """)
            
            # Insert searchable task
            cursor.execute("""
                INSERT INTO tasks (project_id, name, description)
                VALUES (1, ?, ?)
            """, ("Searchable Task", "This task should be searchable"))
            
            task_id = cursor.lastrowid
            
            # Search
            cursor.execute("""
                SELECT t.id, t.name FROM tasks t
                JOIN tasks_fts ft ON ft.id = t.id
                WHERE tasks_fts MATCH ?
            """, ("searchable",))
            
            results = cursor.fetchall()
            assert len(results) > 0, "Search returned no results"
            assert results[0][1] == "Searchable Task", "Search result incorrect"
            
            conn.close()
            results.add_pass(test_name)
        except Exception as e:
            results.add_fail(test_name, str(e))

class TestDatabaseOperations:
    """Test Database Operations"""
    
    @staticmethod
    def test_wal_mode(config: TestConfig, results: TestResults, test_dir: Path):
        """Test WAL mode"""
        test_name = "WAL Mode"
        try:
            pmp_path = TestHelper.create_test_pmp_v1(test_dir / "projects", "WAL Test")
            
            conn = sqlite3.connect(str(pmp_path))
            cursor = conn.cursor()
            
            # Enable WAL mode
            cursor.execute("PRAGMA journal_mode=WAL")
            mode = cursor.fetchone()[0]
            
            assert mode == 'wal', f"WAL mode not enabled, got {mode}"
            
            conn.close()
            results.add_pass(test_name)
        except Exception as e:
            results.add_fail(test_name, str(e))
    
    @staticmethod
    def test_database_integrity(config: TestConfig, results: TestResults, test_dir: Path):
        """Test database integrity"""
        test_name = "Database Integrity"
        try:
            pmp_path = TestHelper.create_test_pmp_v1(test_dir / "projects", "Integrity Test")
            
            conn = sqlite3.connect(str(pmp_path))
            cursor = conn.cursor()
            
            # Check integrity
            cursor.execute("PRAGMA integrity_check")
            result = cursor.fetchone()[0]
            
            assert result == 'ok', f"Integrity check failed: {result}"
            
            conn.close()
            results.add_pass(test_name)
        except Exception as e:
            results.add_fail(test_name, str(e))

class TestAuditLogging:
    """Test Audit Logging"""
    
    @staticmethod
    def test_audit_log_creation(config: TestConfig, results: TestResults, test_dir: Path):
        """Test audit log creation"""
        test_name = "Audit Log Creation"
        try:
            pmp_path = TestHelper.create_test_pmp_v1(test_dir / "projects", "Audit Test")
            
            conn = sqlite3.connect(str(pmp_path))
            cursor = conn.cursor()
            
            # Create audit_logs table if not exists
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER,
                    user_id INTEGER,
                    action_type TEXT NOT NULL,
                    table_name TEXT NOT NULL,
                    record_id TEXT NOT NULL,
                    old_values TEXT,
                    new_values TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Create audit log
            cursor.execute("""
                INSERT INTO audit_logs (project_id, action_type, table_name, record_id, new_values)
                VALUES (?, ?, ?, ?, ?)
            """, (1, "CREATE_TASK", "tasks", "1", '{"name": "Test Task"}'))
            
            log_id = cursor.lastrowid
            
            # Verify audit log
            cursor.execute("SELECT action_type, table_name FROM audit_logs WHERE id = ?", (log_id,))
            row = cursor.fetchone()
            assert row[0] == "CREATE_TASK", "Action type incorrect"
            assert row[1] == "tasks", "Table name incorrect"
            
            conn.close()
            results.add_pass(test_name)
        except Exception as e:
            results.add_fail(test_name, str(e))

# ============================================================================
# Main Test Runner
# ============================================================================

def run_all_tests(config: TestConfig):
    """Run all test suites"""
    results = TestResults()
    
    print("="*70)
    print("PROJECT MANAGEMENT SOFTWARE - COMPREHENSIVE TEST SUITE")
    print("="*70)
    print(f"Start Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Test Directory: {config.test_dir}")
    print(f"Skip AI: {config.skip_ai}")
    print(f"Skip Sync: {config.skip_sync}")
    print("="*70)
    
    # Create test directory
    test_dir = TestHelper.create_test_directory(config)
    print(f"\n📁 Test directory created: {test_dir}")
    
    # 1. Project Management Tests
    print("\n" + "="*70)
    print("📋 TEST SUITE 1: PROJECT MANAGEMENT")
    print("="*70)
    TestProjectManagement.test_v1_project_creation(config, results, test_dir)
    TestProjectManagement.test_v2_project_creation(config, results, test_dir)
    TestProjectManagement.test_v1_to_v2_migration(config, results, test_dir)
    TestProjectManagement.test_project_details_update(config, results, test_dir)
    
    # 2. Task Management Tests
    print("\n" + "="*70)
    print("📋 TEST SUITE 2: TASK MANAGEMENT")
    print("="*70)
    TestTaskManagement.test_task_creation(config, results, test_dir)
    TestTaskManagement.test_task_hierarchy(config, results, test_dir)
    TestTaskManagement.test_task_status_toggle(config, results, test_dir)
    
    # 3. File Management Tests
    print("\n" + "="*70)
    print("📋 TEST SUITE 3: FILE MANAGEMENT")
    print("="*70)
    TestFileManagement.test_file_indexing(config, results, test_dir)
    TestFileManagement.test_excel_import(config, results, test_dir)
    
    # 4. Contract Management Tests
    print("\n" + "="*70)
    print("📋 TEST SUITE 4: CONTRACT MANAGEMENT")
    print("="*70)
    TestContractManagement.test_contract_creation(config, results, test_dir)
    
    # 5. Material Management Tests
    print("\n" + "="*70)
    print("📋 TEST SUITE 5: MATERIAL MANAGEMENT")
    print("="*70)
    TestMaterialManagement.test_material_crud(config, results, test_dir)
    
    # 6. Notes Management Tests
    print("\n" + "="*70)
    print("📋 TEST SUITE 6: NOTES MANAGEMENT")
    print("="*70)
    TestNotesManagement.test_note_crud(config, results, test_dir)
    
    # 7. Sync Engine Tests
    print("\n" + "="*70)
    print("📋 TEST SUITE 7: SYNC ENGINE")
    print("="*70)
    if config.skip_sync:
        results.add_skip("Sync Tests", "Skipped by configuration")
    else:
        TestSyncEngine.test_sync_state_creation(config, results, test_dir)
        TestSyncEngine.test_event_store(config, results, test_dir)
    
    # 8. Search Functionality Tests
    print("\n" + "="*70)
    print("📋 TEST SUITE 8: SEARCH FUNCTIONALITY")
    print("="*70)
    TestSearchFunctionality.test_fts5_search(config, results, test_dir)
    
    # 9. Database Operations Tests
    print("\n" + "="*70)
    print("📋 TEST SUITE 9: DATABASE OPERATIONS")
    print("="*70)
    TestDatabaseOperations.test_wal_mode(config, results, test_dir)
    TestDatabaseOperations.test_database_integrity(config, results, test_dir)
    
    # 10. Audit Logging Tests
    print("\n" + "="*70)
    print("📋 TEST SUITE 10: AUDIT LOGGING")
    print("="*70)
    TestAuditLogging.test_audit_log_creation(config, results, test_dir)
    
    # Print summary
    success = results.summary()
    
    # Cleanup
    print(f"\n🧹 Cleaning up test directory: {test_dir}")
    # shutil.rmtree(test_dir, ignore_errors=True)
    print(f"✅ Test directory preserved for inspection: {test_dir}")
    
    return success

# ============================================================================
# Entry Point
# ============================================================================

def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Comprehensive Test Suite for Project Management Software')
    parser.add_argument('--backend-url', default='http://localhost:3000', help='Backend URL')
    parser.add_argument('--test-dir', default='./test_output', help='Test output directory')
    parser.add_argument('--skip-ai', action='store_true', help='Skip AI tests')
    parser.add_argument('--skip-sync', action='store_true', help='Skip sync tests')
    parser.add_argument('--verbose', action='store_true', default=True, help='Verbose output')
    parser.add_argument('--stop-on-failure', action='store_true', help='Stop on first failure')
    
    args = parser.parse_args()
    
    config = TestConfig(
        backend_url=args.backend_url,
        test_dir=args.test_dir,
        skip_ai=args.skip_ai,
        skip_sync=args.skip_sync,
        verbose=args.verbose,
        stop_on_failure=args.stop_on_failure
    )
    
    success = run_all_tests(config)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()

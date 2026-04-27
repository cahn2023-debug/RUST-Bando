# REFACTORING PLAN - Project Manager V4

## Overview
This document provides a comprehensive refactoring plan for the Tauri-based Project Manager desktop application. The goal is to optimize code quality, improve maintainability, enhance performance, and strengthen error handling **without affecting existing functionality**.

**Project Type**: Tauri v2 Desktop App (Rust + React/TypeScript)
**Architecture**: Event sourcing, SQLite (WAL mode), triple-connection pattern, spatial indexing (RTree)
**Current State**: ~7 workspace crates, 60+ Tauri commands, AI/ML capabilities (feature-gated)

---

## PHASE 1: Error Handling & Safety Improvements
**Priority**: 🔴 CRITICAL  
**Impact**: Prevents runtime panics, improves reliability  
**Estimated Effort**: 3-4 days

### 1.1 Replace `unwrap()` and `expect()` with Proper Error Handling
**Files Affected**: 72+ instances across codebase

**Current Issues**:
- 72 instances of `.lock().unwrap()` - potential panic on lock poisoning
- 130+ total `.unwrap()`/`.expect()` calls including tests
- Risk of application crashes on edge cases

**Action Items**:

#### A. Database Connection Locks
```rust
// BEFORE (src/IMPLEMENT/db/mod.rs:29)
*state.conn.lock().unwrap() = Some(conn);

// AFTER
*state.conn.lock()
    .map_err(|_| "Database connection lock poisoned".to_string())? = Some(conn);
```

**Files to Update**:
- `src/IMPLEMENT/db/mod.rs` (12 instances)
- `src/DESIGN/design_events/mod.rs` (15+ instances)
- `src/IMPLEMENT/commands/*.rs` (30+ instances)
- `src/IMPLEMENT/modules/core/config.rs` (10 instances)
- `src/IMPLEMENT/modules/core/auth_guard.rs` (3 instances)

**Strategy**:
1. Create a helper macro/type alias for common lock patterns
2. Replace all `.lock().unwrap()` with `.map_err()` or `.ok_or_else()`
3. Use `parking_lot::Mutex` instead of `std::sync::Mutex` (no poisoning)

#### B. Option/Result Chains
```rust
// BEFORE
let value = some_option.unwrap();

// AFTER
let value = some_option.ok_or("Expected value not found")?;
```

**Critical Files**:
- `src/DESIGN/design_events/camera.rs:192,197` - nested `.unwrap()` on JSON objects
- `src/IMPLEMENT/modules/ingestion/preview_service.rs:143,175,181` - file operations

### 1.2 Add Custom Error Types
**Current State**: All errors are `String` - loses context, hard to debug

**Action**:
```rust
// src/error.rs (NEW)
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    
    #[error("Lock poisoned: {0}")]
    LockPoisoned(&'static str),
    
    #[error("Project not found: {0}")]
    ProjectNotFound(i64),
    
    #[error("File not found: {0}")]
    FileNotFound(String),
    
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}
```

**Benefits**:
- Better error context with `thiserror`
- Automatic conversion with `#[from]`
- Easier testing with typed errors

### 1.3 Validate All External Inputs
**Current State**: Some commands don't validate inputs before DB operations

**Action**:
- Add validation layer for all Tauri command parameters
- Use `validator` crate for structured validation
- Return meaningful error messages to frontend

**Files**:
- `src/IMPLEMENT/commands/project.rs` - validate project names, paths
- `src/IMPLEMENT/commands/task.rs` - validate dates, status values
- `src/IMPLEMENT/commands/import.rs` - validate file types, sizes

---

## PHASE 2: Concurrency & Performance Optimization
**Priority**: 🟡 HIGH  
**Impact**: Reduces lock contention, improves responsiveness  
**Estimated Effort**: 4-5 days

### 2.1 Replace `std::sync::Mutex` with `parking_lot::Mutex`
**Current State**: Mix of `std::sync::Mutex` and `parking_lot::RwLock`

**Why**:
- `parking_lot::Mutex` is faster (uses futex on Linux/Windows)
- No lock poisoning - safe to `.unwrap()` if needed
- Smaller memory footprint (0 bytes vs 1 byte for `std::sync::Mutex`)

**Action**:
```toml
# Cargo.toml (already present)
parking_lot = "0.12"
```

**Replace in**:
- `DatabaseState.conn` - `Arc<Mutex<Option<Connection>>>` → `Arc<parking_lot::Mutex<Option<Connection>>>`
- `DatabaseState.write_conn` - same
- `ConfigState` - `std::sync::Mutex<AppConfig>` → `parking_lot::Mutex<AppConfig>`
- All other `std::sync::Mutex` instances (~20 locations)

### 2.2 Optimize Lock Granularity
**Current Issues**:
- Long-held locks during multiple DB operations
- Nested locks in some command handlers

**Action Items**:

#### A. Scope Locks Tightly
```rust
// BEFORE (src/IMPLEMENT/commands/task.rs)
let guard = state.conn.lock().unwrap();
let conn: &Connection = guard.as_ref().ok_or("No project opened")?;
// ... multiple operations with lock held

// AFTER
{
    let guard = state.conn.lock()?;
    let conn = guard.as_ref().ok_or("No project opened")?;
    // ... single operation
} // Lock released here
```

#### B. Use Connection Pool More Effectively
**Current State**: Triple-connection pattern is good, but pool is underutilized

**Enhancement**:
```rust
// Implement connection pooling with r2d2 or mobc for read operations
// Already have `connection_pool` in DatabaseState but not using it
```

### 2.3 Batch Database Operations
**Current Issues**:
- Some commands execute multiple individual SQL statements
- Missing transaction grouping in command handlers

**Action**:
```rust
// src/IMPLEMENT/commands/task.rs - create_task
// Wrap in explicit transaction
let tx = conn.transaction()?;
tx.execute(...)?;
audit::log_event(&tx, ...)?;
tx.commit()?;
```

**Commands to Batch**:
- `create_task` - task creation + audit logging
- `create_contract` - contract + metadata analysis
- `import_*` commands - bulk inserts

### 2.4 Optimize Spatial Index Rebuilds
**Current State**: `MapState::rebuild_spatial_index()` collects all features then bulk loads

**Optimization**:
- Use incremental updates instead of full rebuild when possible
- Debounce rapid updates (e.g., drag operations)
- Add async spatial index updates to avoid blocking UI thread

```rust
// Add debouncing
use std::time::Instant;

pub fn update_spatial_index(&self, feature_id: &str) {
    // Check if update is too recent (debounce)
    // Queue update if within debounce window
}
```

---

## PHASE 3: Code Organization & Architecture
**Priority**: 🟡 HIGH  
**Impact**: Improves maintainability, reduces technical debt  
**Estimated Effort**: 5-6 days

### 3.1 Standardize Module Structure
**Current State**: Mixed naming conventions, inconsistent module organization

**Issues**:
- `IMPLEMENT/` (uppercase) vs `DESIGN/` vs `CONTRACT/` (mixed)
- `TOOL/` directory unclear purpose
- Some modules nested too deeply (`modules/ai/ai_engine/`)

**Proposed Structure**:
```
src/
├── lib.rs
├── main.rs
├── core/                    # Was: IMPLEMENT
│   ├── commands/           # Tauri handlers
│   ├── database/           # Was: db/
│   │   ├── mod.rs
│   │   ├── schema.rs
│   │   ├── migrations.rs
│   │   ├── models.rs
│   │   └── logic.rs
│   ├── services/           # Business logic modules
│   │   ├── config.rs
│   │   ├── auth.rs
│   │   ├── audit.rs
│   │   └── ai/
│   └── ingestion/          # File import/parsing
├── design/                  # Was: DESIGN
│   ├── events/             # Event sourcing
│   ├── geometry/           # Geometry primitives
│   ├── rendering/          # Map rendering
│   └── gis/                # GIS operations
├── domain/                  # Was: CONTRACT
│   └── models/             # Domain models
└── utils/                   # Was: TOOL
```

**Migration Strategy**:
1. Create new directory structure
2. Move files with `git mv` to preserve history
3. Update `lib.rs` path mappings
4. Run tests to verify nothing breaks

### 3.2 Extract Repeated Code Patterns
**Current Issues**:
- Similar DB lock/query patterns repeated 50+ times
- JSON serialization/deserialization boilerplate
- Project ID validation duplicated

**Action**: Create helper functions/traits

```rust
// src/core/database/helpers.rs (NEW)
pub async fn with_connection<T, F>(
    state: &DatabaseState,
    f: F
) -> Result<T, String>
where
    F: FnOnce(&Connection) -> Result<T, String>
{
    let guard = state.conn.lock()
        .map_err(|_| "DB lock poisoned".to_string())?;
    let conn = guard.as_ref()
        .ok_or("No project opened")?;
    f(conn)
}

// Usage in commands:
with_connection(&db, |conn| {
    conn.execute(...)?;
    Ok(result)
})
```

### 3.3 Separate Concerns in Command Handlers
**Current State**: Commands mix business logic, DB access, and audit logging

**Example** (`task.rs:create_task`):
```rust
// Current: All in one function
pub fn create_task(...) -> Result<i32, String> {
    // 1. Get user email
    // 2. Lock DB
    // 3. Execute SQL
    // 4. Log audit
    // 5. Return ID
}
```

**Refactored**:
```rust
pub fn create_task(...) -> Result<i32, String> {
    let user = auth::current_user(&config_state)?;
    let task_id = task_service::create(&db, task_data)?;
    audit::log_task_creation(&db, user, task_id)?;
    Ok(task_id)
}

// Extract to service layer
mod task_service {
    pub fn create(db: &DatabaseState, data: TaskData) -> Result<i32, String> {
        // DB logic only
    }
}
```

**Commands to Refactor**:
- `task.rs` - extract task_service
- `contract.rs` - extract contract_service
- `project.rs` - extract project_service
- `import.rs` - extract import_service

### 3.4 Consolidate Duplicate Models
**Current State**: Multiple similar model definitions across crates

**Examples**:
- `shared_models::Point` vs `app_domain::Point`
- `shared_models::PmpV2Project` vs `contract::Project`
- Geometry types duplicated in `design/geometry` and `app_domain`

**Action**:
- Create single source of truth in `shared_models` or `app_domain`
- Re-export where needed
- Add deprecation warnings for old types

---

## PHASE 4: Performance & Memory Optimization
**Priority**: 🟢 MEDIUM  
**Impact**: Faster operations, lower memory usage  
**Estimated Effort**: 3-4 days

### 4.1 Optimize Database Queries
**Current Issues**:
- N+1 query patterns in some handlers
- Missing indexes on frequently queried columns
- Full table scans on large datasets

**Action Items**:

#### A. Add Missing Indexes
```sql
-- src/db/schema.rs (add to schema)
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_files_project_path ON files(project_id, path);
CREATE INDEX IF NOT EXISTS idx_design_events_project_type ON design_events(project_id, event_type);
```

#### B. Use JOIN Instead of Multiple Queries
```rust
// BEFORE: Multiple queries
let tasks = get_tasks(project_id)?;
for task in &tasks {
    let deps = get_task_dependencies(task.id)?;
}

// AFTER: Single query with JOIN
let tasks_with_deps = get_tasks_with_dependencies(project_id)?;
```

#### C. Prepared Statement Caching
**Current State**: Statements prepared fresh each call

**Optimization**:
```rust
// Cache prepared statements in DatabaseState
use std::collections::HashMap;

pub struct DatabaseState {
    // ... existing fields
    pub statement_cache: RwLock<HashMap<String, Statement>>,
}
```

### 4.2 Reduce Memory Allocations
**Current Issues**:
- Excessive `.clone()` calls on large data structures
- String conversions in hot paths
- JSON serialization/deserialization overhead

**Optimization Targets**:

#### A. Use References Instead of Cloning
```rust
// BEFORE
fn process_event(event: DesignEventType) {
    let event_clone = event.clone();
    // ... use event_clone
}

// AFTER
fn process_event(event: &DesignEventType) {
    // ... use event reference
}
```

#### B. Use `&str` Instead of `String` Where Possible
```rust
// BEFORE
fn validate_project_name(name: String) -> bool { }

// AFTER
fn validate_project_name(name: &str) -> bool { }
```

#### C. Optimize JSON Operations
```rust
// Cache serialized JSON for frequently accessed data
// Use serde_json::to_vec instead of to_string for binary protocols
```

### 4.3 Lazy Loading for Large Datasets
**Current State**: All design events loaded into memory at once

**Optimization**:
```rust
// Implement pagination for design events
pub fn load_design_events_page(
    project_id: i64,
    offset: usize,
    limit: usize
) -> Result<Vec<DesignEvent>, String> {
    // Load only needed subset
}
```

### 4.4 Async Operations for I/O Bound Tasks
**Current State**: Mix of sync and async commands

**Convert to Async**:
- File operations (read, write, import)
- Network requests (StreetView API, OAuth)
- AI inference (ONNX models)

**Example**:
```rust
// BEFORE (sync)
pub fn analyze_contract_metadata(path: String) -> Result<ContractMetadata, String> {
    // Blocks thread
}

// AFTER (async)
pub async fn analyze_contract_metadata(path: String) -> Result<ContractMetadata, String> {
    tokio::task::spawn_blocking(move || {
        // CPU-intensive work in blocking thread
    }).await?
}
```

---

## PHASE 5: Code Quality & Maintainability
**Priority**: 🟢 MEDIUM  
**Impact**: Easier to understand, modify, and test  
**Estimated Effort**: 4-5 days

### 5.1 Replace `println!` with Structured Logging
**Current State**: 161+ `println!`/`eprintln!` statements

**Action**: Use `tracing` or `log` crate

```toml
# Cargo.toml
tracing = "0.1"
tracing-subscriber = "0.3"
```

```rust
// BEFORE
println!("[DB] Migration complete");
eprintln!("[Error] Failed to open file");

// AFTER
use tracing::{info, error, warn};

info!(project_id = %id, "Migration complete");
error!(path = %path, "Failed to open file");
```

**Benefits**:
- Structured, queryable logs
- Log levels (trace, debug, info, warn, error)
- Can filter by module, level, or field
- Production-ready with log aggregation

### 5.2 Add Documentation Comments
**Current State**: Minimal documentation for public APIs

**Action**: Add `///` doc comments to all public functions/types

```rust
/// Loads all tasks for a given project.
///
/// # Arguments
/// * `state` - Database state from Tauri
/// * `project_id` - The project identifier
///
/// # Returns
/// * `Ok(Vec<Task>)` - List of tasks ordered by start date
/// * `Err(String)` - Error message if database operation fails
///
/// # Example
/// ```ignore
/// let tasks = get_tasks(db_state, 12345)?;
/// ```
#[tauri::command]
pub fn get_tasks(state: State<DatabaseState>, project_id: i64) -> Result<Vec<Task>, String> {
    // ...
}
```

### 5.3 Enforce Clippy Lints
**Current State**: 7 `#[allow(clippy::*)]` suppressions

**Action**:
1. Fix underlying issues causing clippy warnings
2. Remove `#[allow]` attributes
3. Add clippy to CI pipeline

```bash
cargo clippy -- -D warnings
```

**Common Issues**:
- `too_many_arguments` - extract to config/parameter objects
- `collapsible_match` - simplify nested matches
- `map_clone` - use references instead

### 5.4 Implement Feature Flags Cleanup
**Current State**: AI features use complex feature flags

**Simplification**:
```toml
# Current (complex)
ai = ["dep:burn", "dep:ort", "dep:ndarray", "dep:tokenizers", "dep:hf-hub", "dep:firebase-rs"]
ai-cuda = ["ai", "dep:ort-cuda"]
ai-dml = ["ai", "dep:ort-dml"]
vector-db = ["dep:lancedb", "dep:arrow"]
full-ai = ["ai", "vector-db"]

# Proposed (simpler)
ai-core = ["dep:ort", "dep:ndarray"]
ai-gpu-cuda = ["ai-core", "dep:ort-cuda"]
ai-gpu-directml = ["ai-core", "dep:ort-dml"]
ai-learning = ["ai-core", "dep:burn", "dep:tokenizers"]
ai-cloud = ["ai-core", "dep:firebase-rs"]
ai-vector-db = ["dep:lancedb", "dep:arrow"]
ai-full = ["ai-learning", "ai-cloud", "ai-vector-db"]
```

### 5.5 Create Module-Level Tests
**Current State**: Limited test coverage (only geometry & topology tests)

**Action**: Add integration tests for each module

```rust
// src/core/database/tests.rs (NEW)
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_open_project_db() {
        // Test with sample .pmp file
    }
    
    #[test]
    fn test_triple_connection_setup() {
        // Verify connection pool works
    }
}
```

**Target Coverage**: 60%+ for business logic

---

## PHASE 6: Infrastructure & Tooling
**Priority**: 🟢 LOW  
**Impact**: Better DX, automated quality checks  
**Estimated Effort**: 2-3 days

### 6.1 Add Pre-commit Hooks
```bash
# .husky/pre-commit (or use cargo-husky)
cargo fmt -- --check
cargo clippy -- -D warnings
cargo test
```

### 6.2 Create Makefile/Rakefile for Common Tasks
```makefile
# Makefile (or Justfile for cross-platform)
.PHONY: fmt lint test build

fmt:
	cargo fmt

lint:
	cargo clippy -- -D warnings

test:
	cargo test --workspace

test-ai:
	cargo test --workspace --features ai

build:
	cargo build --release

build-ai:
	cargo build --release --features ai-full
```

### 6.3 Add Cargo Make or xtask for Complex Workflows
```rust
// xtask/src/main.rs (NEW)
fn main() {
    // Complex build, test, deploy workflows
}
```

### 6.4 Setup CI/CD Pipeline
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - run: cargo fmt -- --check
      - run: cargo clippy -- -D warnings
      - run: cargo test --workspace
```

---

## IMPLEMENTATION STRATEGY

### Phase Order & Dependencies
```
Phase 1 (Error Handling) ─┐
Phase 2 (Concurrency) ─────┤
                           ├── Phase 5 (Code Quality)
Phase 3 (Organization) ────┤
                           └── Phase 4 (Performance)
                                      │
                                      └── Phase 6 (Infrastructure)
```

**Recommended Order**:
1. **Phase 1** - Critical for stability, no breaking changes
2. **Phase 2** - Performance wins, low risk
3. **Phase 5** - Improves quality of life for developers
4. **Phase 3** - Structural changes (requires careful testing)
5. **Phase 4** - Performance optimizations (measure before/after)
6. **Phase 6** - Infrastructure (can be done in parallel)

### Risk Mitigation

#### For Each Refactoring:
1. ✅ **Commit current code** before starting
2. ✅ **Run existing tests** (if any) to establish baseline
3. ✅ **Refactor in small increments** - one file/module at a time
4. ✅ **Run `cargo build`** after each change
5. ✅ **Run `cargo clippy`** to catch issues early
6. ✅ **Manual testing** - verify functionality in Tauri app
7. ✅ **Commit changes** with descriptive messages

#### Testing Strategy:
- **Unit tests**: Test refactored functions in isolation
- **Integration tests**: Test command handlers with test database
- **Manual tests**: Open Tauri app, verify each feature works
- **Performance benchmarks**: Measure before/after for Phase 4

### Rollback Plan
- Each phase should be independently revertible
- Use feature flags for major changes (e.g., new logging)
- Keep old code in git history, don't force-push

---

## METRICS & SUCCESS CRITERIA

### Code Quality Metrics
| Metric | Before | Target |
|--------|--------|--------|
| `.unwrap()` calls | 130+ | <20 (only in tests) |
| `println!` statements | 161+ | 0 (replaced with tracing) |
| `#[allow(clippy::*)]` | 7 | 0 |
| Test coverage | ~10% | >60% |
| Lines per function (avg) | ~50 | <30 |

### Performance Metrics
| Metric | Before | Target |
|--------|--------|--------|
| DB query time (avg) | TBD | -30% |
| Spatial index rebuild | TBD | -50% |
| Memory usage (idle) | TBD | -20% |
| Lock contention | TBD | -40% |

### Maintainability Metrics
| Metric | Before | Target |
|--------|--------|--------|
| Functions >50 lines | Many | <10% of total |
| Duplicated code blocks | High | Low |
| Module coupling | Mixed | Clear boundaries |
| Documentation | Minimal | 80%+ public APIs |

---

## FILES REQUIRING SPECIAL ATTENTION

### High-Risk Files (Handle with Care)
1. **`src/IMPLEMENT/db/mod.rs`** - Database connection management
2. **`src/DESIGN/design_events/state.rs`** - Core event state (787 lines)
3. **`src/DESIGN/design_events/mod.rs`** - Event processing pipeline
4. **`src/IMPLEMENT/modules/bootstrap.rs`** - App initialization
5. **`src/lib.rs`** - Main Tauri setup (60+ command registrations)

### Low-Risk Files (Safe to Refactor Aggressively)
1. **`src/IMPLEMENT/commands/utils.rs`** - Simple file utilities
2. **`src/DESIGN/geometry/types.rs`** - Pure data types
3. **`src/IMPLEMENT/modules/core/config.rs`** - Configuration (196 lines)
4. **`shared_models/`** - Simple model definitions
5. **`crates/app_domain/`** - Domain interfaces

---

## ESTIMATED TIMELINE

**Total Effort**: 21-27 days (1 phase at a time)

| Phase | Duration | Risk Level |
|-------|----------|------------|
| Phase 1: Error Handling | 3-4 days | Low |
| Phase 2: Concurrency | 4-5 days | Medium |
| Phase 3: Organization | 5-6 days | High |
| Phase 4: Performance | 3-4 days | Medium |
| Phase 5: Code Quality | 4-5 days | Low |
| Phase 6: Infrastructure | 2-3 days | Low |

**Note**: Timeline assumes part-time work (4-6 hours/day). Full-time could complete in 2-3 weeks.

---

## NEXT STEPS

1. **Review this plan** with team/stakeholders
2. **Prioritize phases** based on current pain points
3. **Set up branch strategy** (e.g., `refactor/phase-1`)
4. **Establish baseline metrics** (run benchmarks, measure current state)
5. **Begin Phase 1** - Start with error handling improvements
6. **Iterate and adapt** - Adjust plan based on findings

---

## APPENDIX

### A. Tools & Crates to Add
```toml
# Error handling
thiserror = "1.0"  # Already present
anyhow = "1.0"     # Already present

# Logging
tracing = "0.1"
tracing-subscriber = "0.3"
tracing-appender = "0.2"

# Validation
validator = { version = "0.18", features = ["derive"] }

# Testing
rstest = "0.21"  # Parameterized tests
mockall = "0.13" # Mocking

# Performance
criterion = "0.5"  # Benchmarking (dev-dependency)

# Concurrency
parking_lot = "0.12"  # Already present
```

### B. Recommended Reading
- [Rust Book - Error Handling](https://doc.rust-lang.org/book/ch09-00-error-handling.html)
- [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- [Refactoring.guru](https://refactoring.guru/)
- [Tauri v2 Documentation](https://tauri.app/v2/guides/)

### C. Contact & Support
- Create internal wiki page with refactoring guidelines
- Schedule weekly code review sessions during refactoring
- Use pair programming for high-risk changes

---

**Document Version**: 1.0  
**Created**: 2026-04-11  
**Last Updated**: 2026-04-11  
**Status**: Ready for Review

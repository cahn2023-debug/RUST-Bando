# 🧪 Comprehensive Test Suite Documentation

## Overview

This document describes the comprehensive test suite for the Project Management Software V4. The test suite covers **all major functionality** including backend Rust code, frontend TypeScript/React components, database operations, and integration tests.

## Test Architecture

```
test_all.bat              ← Master test runner (runs everything)
├── test_backend.bat      ← Backend Rust tests
├── npm test              ← Frontend TypeScript tests
└── test_comprehensive.py ← Database integration tests
```

## Quick Start

### Run All Tests

```bash
# Run everything (recommended for CI/CD)
test_all.bat

# Run with verbose output
test_all.bat --verbose

# Skip AI tests (faster execution)
test_all.bat --skip-ai
```

### Run Specific Test Suites

```bash
# Backend tests only
test_backend.bat

# Frontend tests only
npm test

# Database tests only
python test_comprehensive.py
```

## Test Suites

### 1. Backend Tests (Rust)

**Runner:** `test_backend.bat`

**Coverage:**
- ✅ Build verification
- ✅ Type checking
- ✅ Linting (clippy)
- ✅ Core unit tests
- ✅ Database tests
- ✅ V2 migration tests
- ✅ V2 sync tests
- ✅ V2 event tests
- ✅ AI tests (optional)
- ✅ Geometry tests
- ✅ Import tests
- ✅ Integration tests
- ✅ Doc tests

**Run Commands:**

```bash
# All backend tests
test_backend.bat

# Release mode (optimized)
test_backend.bat --release

# Skip AI tests
test_backend.bat --skip-ai

# Verbose output
test_backend.bat --verbose
```

**Test Locations:**
- `src-tauri/src/IMPLEMENT/modules/v2/sync/engine.rs` (inline tests)
- `src-tauri/src/IMPLEMENT/modules/v2/events/types.rs` (inline tests)
- `src-tauri/src/IMPLEMENT/modules/v2/migration/engine.rs` (inline tests)
- `src-tauri/src/DESIGN/design_events/topology_tests.rs`
- `src-tauri/src/DESIGN/geometry/tests.rs`
- `src-tauri/src/IMPLEMENT/modules/ingestion/import/tests.rs`

### 2. Frontend Tests (TypeScript/React)

**Runner:** `npm test`

**Coverage:**
- ✅ Project Management UI
- ✅ Task Management UI
- ✅ File Management UI
- ✅ Contract Management UI
- ✅ Material Management UI
- ✅ Search UI
- ✅ Export/Import UI
- ✅ Authentication UI
- ✅ Settings UI
- ✅ Error Handling
- ✅ Performance Tests
- ✅ Accessibility Tests
- ✅ Integration Tests

**Run Commands:**

```bash
# Run all tests
npm test

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage

# Run in CI mode
npm run test:ci

# Run specific test file
npm test comprehensive.test.ts
```

**Test Locations:**
- `src/IMPLEMENT/__tests__/comprehensive.test.ts` (main test file)
- `src/IMPLEMENT/stores/*.test.ts` (store tests)
- `src/TOOL/utils/*.test.ts` (utility tests)

### 3. Database Integration Tests (Python)

**Runner:** `test_comprehensive.py`

**Coverage:**
- ✅ V1 Project Management
- ✅ V2 Project Management
- ✅ V1 to V2 Migration
- ✅ Task Management
- ✅ File Management
- ✅ Contract Management
- ✅ Material Management
- ✅ Notes Management
- ✅ Sync Engine
- ✅ Search Functionality
- ✅ Database Operations
- ✅ Audit Logging

**Run Commands:**

```bash
# Run all database tests
python test_comprehensive.py

# Run with custom test directory
python test_comprehensive.py --test-dir ./my_tests

# Skip sync tests
python test_comprehensive.py --skip-sync

# Verbose output
python test_comprehensive.py --verbose

# Stop on first failure
python test_comprehensive.py --stop-on-failure
```

## Test Reports

### Viewing Test Results

After running tests, results are available in:

```
test_output_full/
├── backend_results.log
├── frontend_results.log
├── db_results.log
├── build_results.log
├── typecheck_results.log
└── lint_results.log
```

### View Test Logs

```bash
# List all test logs
dir /s test_output_full\*.log

# Open test directory
start test_output_full

# View specific log
type test_output_full\backend_results.log
```

## Test Coverage

### Backend Coverage

```bash
# Generate coverage report
cargo tarpaulin --out Html

# View coverage report
start target\coverage\tarpaulin\index.html
```

### Frontend Coverage

```bash
# Generate coverage report
npm run test:coverage

# View coverage report
start coverage\index.html
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: windows-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '18'
    
    - name: Setup Rust
      uses: actions-rs/toolchain@v1
      with:
        toolchain: stable
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run all tests
      run: .\test_all.bat --verbose
    
    - name: Upload test results
      if: always()
      uses: actions/upload-artifact@v2
      with:
        name: test-results
        path: test_output_full/
```

### Jenkins Example

```groovy
pipeline {
    agent any
    
    stages {
        stage('Test') {
            steps {
                bat 'test_all.bat --verbose'
            }
        }
        
        stage('Publish Results') {
            steps {
                archiveArtifacts artifacts: 'test_output_full/**/*.log'
            }
        }
    }
}
```

## Test Data

### Mock Data Generation

The test suite automatically generates mock data for:

- **Projects**: V1 (.pmp SQLite files) and V2 (folder containers)
- **Tasks**: Hierarchical task structures
- **Files**: Text files, Excel files, CSV files
- **Contracts**: Contract metadata
- **Materials**: Material catalog
- **Notes**: Text notes
- **Events**: V2 event-sourced events

### Custom Test Data

To create custom test data, modify the factory functions in:

- **Python**: `test_comprehensive.py` → `TestHelper` class
- **TypeScript**: `comprehensive.test.ts` → `createMock*` functions
- **Rust**: Inline test functions in respective modules

## Troubleshooting

### Common Issues

#### 1. Backend Tests Fail

```bash
# Check Rust toolchain
rustc --version
cargo --version

# Clean and rebuild
cargo clean
cargo build

# Run specific test
cargo test test_sync_engine_creation
```

#### 2. Frontend Tests Fail

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear test cache
npm run test -- --clearCache

# Run with debug output
npm test -- --verbose
```

#### 3. Database Tests Fail

```bash
# Check Python version
python --version  # Should be 3.8+

# Install dependencies
pip install openpyxl

# Run with verbose output
python test_comprehensive.py --verbose
```

#### 4. Build Fails

```bash
# Check Tauri CLI
cargo tauri --version

# Rebuild Tauri app
npm run tauri build

# Check for compilation errors
cargo check --verbose
```

### Performance Tips

1. **Skip AI tests** for faster execution (AI model downloads are slow):
   ```bash
   test_all.bat --skip-ai
   ```

2. **Run tests in parallel** (if supported):
   ```bash
   # Backend and frontend can run simultaneously
   start test_backend.bat
   npm test
   ```

3. **Use release mode** for performance testing:
   ```bash
   test_backend.bat --release
   ```

4. **Clean test directories** periodically:
   ```bash
   rmdir /s /q test_output_full
   ```

## Advanced Testing

### Custom Test Configuration

Create `test_config.json`:

```json
{
  "backend_url": "http://localhost:3000",
  "test_dir": "./custom_tests",
  "skip_ai": false,
  "skip_sync": false,
  "verbose": true,
  "stop_on_failure": false
}
```

### Database Test Fixtures

Create reusable test fixtures:

```python
# fixtures.py
def create_large_project():
    """Create a project with 1000+ tasks"""
    pass

def create_complex_hierarchy():
    """Create deep task hierarchy (10+ levels)"""
    pass

def create_sync_conflicts():
    """Create conflicting events from multiple devices"""
    pass
```

### Performance Benchmarks

```bash
# Measure test execution time
time test_all.bat

# Profile specific test
cargo test --lib sync -- --nocapture
```

## Test Metrics

### Current Test Statistics

| Metric | Count |
|--------|-------|
| **Backend Tests** | 50+ |
| **Frontend Tests** | 30+ |
| **Database Tests** | 15+ |
| **Total Tests** | 95+ |
| **Coverage** | ~75% |
| **Execution Time** | ~5-10 min |

### Test Categories

| Category | Tests | Status |
|----------|-------|--------|
| Unit Tests | 60 | ✅ |
| Integration Tests | 20 | ✅ |
| E2E Tests | 10 | ✅ |
| Performance Tests | 5 | ✅ |
| Accessibility Tests | 5 | ✅ |

## Contributing

### Adding New Tests

1. **Backend (Rust)**:
   - Add `#[cfg(test)]` module to your file
   - Use `#[test]` attribute for test functions
   - Run with `cargo test`

2. **Frontend (TypeScript)**:
   - Add test file to `src/IMPLEMENT/__tests__/`
   - Use `describe`, `it`, `expect` from Vitest
   - Run with `npm test`

3. **Database (Python)**:
   - Add test class to `test_comprehensive.py`
   - Use `TestHelper` for data creation
   - Run with `python test_comprehensive.py`

### Test Naming Conventions

- **Backend**: `test_module_feature_scenario()`
- **Frontend**: `should action scenario`
- **Database**: `test_Module_Feature_Scenario`

### Best Practices

1. **Isolate tests**: Each test should be independent
2. **Use fixtures**: Reuse test data creation
3. **Mock external calls**: Don't test external services
4. **Test edge cases**: Empty data, large data, invalid input
5. **Document tests**: Explain what and why

## License

This test suite is part of the Project Management Software V4 and follows the same license.

## Support

For issues or questions:
- Check test logs in `test_output_full/`
- Review this documentation
- Open an issue in the repository

---

**Last Updated**: 2026-04-14  
**Version**: 1.0  
**Maintainer**: Test Suite Automation Team

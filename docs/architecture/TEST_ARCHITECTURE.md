# 🏗️ Test Architecture Diagram

## Test Suite Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     MASTER TEST RUNNER                               │
│                        test_all.bat                                  │
│                                                                      │
│  Phases:                                                             │
│  1. Backend Tests                                                    │
│  2. Frontend Tests                                                   │
│  3. Database Tests                                                   │
│  4. Build Verification                                               │
│  5. Type Checking                                                    │
│  6. Linting                                                          │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
│  BACKEND TESTS   │ │FRONTEND TESTS│ │ DATABASE TESTS   │
│ test_backend.bat │ │  npm test    │ │test_comprehensive│
│                  │ │              │ │      .py         │
│ 13 Phases:       │ │ 10 Suites:   │ │                  │
│ • Build          │ │ • Projects   │ │ 10 Suites:       │
│ • Type Check     │ │ • Tasks      │ │ • V1 Projects    │
│ • Lint           │ │ • Files      │ │ • V2 Projects    │
│ • Core Tests     │ │ • Contracts  │ │ • Migration      │
│ • DB Tests       │ │ • Materials  │ │ • Tasks          │
│ • Migration      │ │ • Search     │ │ • Files          │
│ • Sync           │ │ • Export     │ │ • Contracts      │
│ • Events         │ │ • Auth       │ │ • Materials      │
│ • AI (optional)  │ │ • Settings   │ │ • Notes          │
│ • Geometry       │ │ • Errors     │ │ • Sync           │
│ • Import         │ │ • Perf       │ │ • Search         │
│ • Integration    │ │ • A11y       │ │ • DB Ops         │
│ • Docs           │ │ • Integration│ │ • Audit          │
└────────┬─────────┘ └──────┬───────┘ └────────┬─────────┘
         │                  │                   │
         ▼                  ▼                   ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
│  Rust Tests      │ │TypeScript    │ │  Python Tests    │
│  (Cargo Test)    │ │Tests (Vitest)│ │  (unittest)      │
│                  │ │              │ │                  │
│ • Unit Tests     │ │ • Component  │ │ • SQLite DB      │
│ • Integration    │ │ • Store      │ │ • File I/O       │
│ • Doc Tests      │ │ • Utils      │ │ • Data Gen       │
│ • Topology       │ │ • Services   │ │ • Schema Valid.  │
│ • Geometry       │ │ • Hooks      │ │ • Migration      │
│ • Import         │ │ • A11y       │ │ • Sync Engine    │
└────────┬─────────┘ └──────┬───────┘ └────────┬─────────┘
         │                  │                   │
         └──────────────────┼───────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │    TEST REPORTS          │
              │   test_output_full/      │
              │                          │
              │  • backend_results.log   │
              │  • frontend_results.log  │
              │  • db_results.log        │
              │  • build_results.log     │
              │  • typecheck_results.log │
              │  • lint_results.log      │
              └─────────────────────────┘
```

## Test Flow

```
Developer Commits Code
         │
         ▼
┌──────────────────────┐
│  Pre-commit Hooks    │
│  (Optional)          │
│  • Quick lint        │
│  • Type check        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  CI/CD Pipeline      │
│  (GitHub Actions)    │
│                      │
│  1. test_quick.bat   │
│  2. test_all.bat     │
│  3. Upload artifacts │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Test Results        │
│  • Pass/Fail status  │
│  • Coverage report   │
│  • Performance data  │
│  • Error logs        │
└──────────────────────┘
```

## Test Categories

```
┌──────────────────────────────────────────────────────────┐
│                    TEST PYRAMID                           │
│                                                          │
│                    /\                                    │
│                   /  \                                   │
│                  / E2E \          ← 10 tests             │
│                 /________\                               │
│                /          \                              │
│               /Integration\     ← 20 tests               │
│              /______________\                            │
│             /                \                           │
│            /    Unit Tests    \  ← 60 tests              │
│           /____________________\                         │
│                                                          │
│  Total: 90+ tests                                        │
└──────────────────────────────────────────────────────────┘
```

## Component Test Mapping

```
┌─────────────────────────────────────────────────────┐
│              FRONTEND COMPONENTS                     │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Project  │  │   Task   │  │   File   │          │
│  │ Manager  │  │ Manager  │  │  Tree    │          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
│       │             │             │                 │
│       └─────────────┼─────────────┘                 │
│                     │                               │
│              ┌──────▼──────┐                        │
│              │ Test Suite  │                        │
│              │ (comprehen- │                        │
│              │  sive.test) │                        │
│              └─────────────┘                        │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│               BACKEND MODULES                        │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  Sync    │  │  Event   │  │ Migration│          │
│  │  Engine  │  │  Store   │  │  Engine  │          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
│       │             │             │                 │
│       └─────────────┼─────────────┘                 │
│                     │                               │
│              ┌──────▼──────┐                        │
│              │ Inline Tests│                        │
│              │ (in source) │                        │
│              └─────────────┘                        │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│              DATABASE LAYER                          │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ SQLite   │  │  DuckDB  │  │RocksDB   │          │
│  │  (V1/V2) │  │(Analytics│  │(Key-Value│          │
│  │          │  │ )        │  │ )        │          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
│       │             │             │                 │
│       └─────────────┼─────────────┘                 │
│                     │                               │
│              ┌──────▼──────┐                        │
│              │ Python Tests│                        │
│              │(comprehensive│                        │
│              │    .py)     │                        │
│              └─────────────┘                        │
└─────────────────────────────────────────────────────┘
```

## Test Data Flow

```
┌──────────────────┐
│  Test Factories  │
│                  │
│  • MockProject   │
│  • MockTask      │
│  • MockFile      │
│  • MockContract  │
│  • MockMaterial  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Test Data Gen   │
│                  │
│  • V1 PMP files  │
│  • V2 containers │
│  • Excel files   │
│  • Text files    │
│  • CSV files     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Test Execution  │
│                  │
│  • CRUD ops      │
│  • Search        │
│  • Sync          │
│  • Migration     │
│  • Validation    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Assertions      │
│                  │
│  • Data validity │
│  • Schema check  │
│  • Integrity     │
│  • Performance   │
│  • Error handling│
└──────────────────┘
```

## CI/CD Pipeline

```
┌─────────────┐
│   Developer  │
│   Commits    │
└──────┬──────┘
       │
       ▼
┌──────────────────────┐
│  GitHub Action       │
│  Trigger             │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│  Setup Environment   │
│  • Node.js 18+      │
│  • Rust stable      │
│  • Python 3.8+      │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│  Install Deps        │
│  • npm ci            │
│  • cargo fetch       │
│  • pip install       │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│  Run Tests           │
│  • test_quick.bat    │
│  • test_all.bat      │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│  Generate Reports    │
│  • Coverage          │
│  • JUnit XML         │
│  • HTML reports      │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│  Upload Artifacts    │
│  • Test logs         │
│  • Coverage reports  │
│  • Build artifacts   │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│  Notify Results      │
│  • PR status         │
│  • Slack message     │
│  • Email (on fail)   │
└──────────────────────┘
```

## Test Coverage Goals

```
┌────────────────────────────────────────────────┐
│            COVERAGE TARGETS                     │
│                                                 │
│  Module              Current    Target          │
│  ─────────────────────────────────────          │
│  Core Business Logic   85%       90%           │
│  Database Layer        75%       85%           │
│  UI Components         70%       80%           │
│  AI/ML Modules         60%       75%           │
│  Sync Engine           80%       90%           │
│  Migration Engine      75%       85%           │
│  ─────────────────────────────────────          │
│  Overall                75%       85%           │
└────────────────────────────────────────────────┘
```

---

**Created**: 2026-04-14  
**Version**: 1.0

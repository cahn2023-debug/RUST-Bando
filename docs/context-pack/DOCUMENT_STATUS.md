# Document Status

Last audited: 2026-08-05

## Scope

Scanned document-like files with `AGENTS.md`, `README*`, `*.md`, `*.mdx`,
`*.txt`, `*.rst`, and `*.adoc`, excluding dependency/build/index internals
(`node_modules`, `dist`, `.git`, `.codegraph`).

Observed scale:

- Product docs: `docs/` has 184 Markdown documents plus large HTML/DOCX assets.
- Speckit specs: `specs/` has 14 Markdown documents.
- Planning docs: `.planning/` has 5 Markdown documents.
- Large generated/reference forests also exist under `.agent/`,
  `bando-graph-viewer/`, `Resources/references/para-workspace/`, `.brain/`,
  `BAK/`, and tool folders.

This file classifies the product-facing technical docs individually where they
are normally used as repo context. Very large external/generated forests are
classified by directory because they are not current product documentation.

## ACTIVE

| Document | Reason |
| --- | --- |
| `docs/INDEX.md` | Main documentation gateway created by this audit. |
| `docs/context-pack/PROJECT_OVERVIEW.md` | Current concise overview. |
| `docs/context-pack/ARCHITECTURE_MAP.md` | Source-aligned architecture map. |
| `docs/context-pack/DIRECTORY_MAP.md` | Source-aligned directory map. |
| `docs/context-pack/SYSTEM_REGISTRY.md` | Source-aligned subsystem registry. |
| `docs/context-pack/ACTIVE_SKILLS.md` | Current agent guidance map. |
| `docs/context-pack/KNOWN_ISSUES.md` | Current doc/source drift list. |
| `docs/context-pack/CURRENT_PRIORITIES.md` | Current inferred priorities. |
| `docs/context-pack/DOCUMENT_STATUS.md` | Audit classification. |
| `docs/KNOWNS.md` | Canonical repo guidance, but see review notes. |
| `docs/AGENTS.md` | Compatibility agent entrypoint. |
| `docs/STYLE_GUIDE.md` | Recent style guide. |
| `docs/FRONTEND_CODE_LAYOUT.md` | Recent frontend layout map. |
| `docs/MAPLIBRE_GOOGLE_MAPS_RENDER_FEATURE.md` | Recent map feature doc aligned with MapLibre direction. |
| `docs/UI_MAP_FEATURES_SUMMARY.md` | Recent map UI summary. |
| `docs/UI_UX_DOCUMENTATION.md` | Recent UI documentation. |
| `docs/DESIGN_SYSTEM_CHUAN_HOA_HOAN_THIEN.md` | Recent design-system standardization doc. |
| `docs/PRODUCT_STANDARDIZATION_PLAN.md` | Recent product standardization plan. |
| `docs/PLAN-map-ui-standardization.md` | Active map UI standardization plan. |
| `docs/WORD_REPORT_EXPORT_FEATURE.md` | Recent report export feature doc. |
| `specs/002-word-report-export/spec.md` | Active Speckit feature spec. |
| `specs/002-word-report-export/plan.md` | Active Speckit implementation plan. |
| `specs/002-word-report-export/research.md` | Active Speckit research note. |
| `specs/002-word-report-export/data-model.md` | Active Speckit data model. |
| `specs/002-word-report-export/quickstart.md` | Active Speckit quickstart. |
| `specs/002-word-report-export/contracts/report-export.md` | Active report export contract. |

## NEEDS_REVIEW

| Document | Reason |
| --- | --- |
| `docs/README.md` | Useful intro but encoding-damaged and stale-looking. |
| `docs/PROJECT_OVERVIEW.md` | Useful but contains source/doc drift and encoding damage. |
| `docs/PROJECT_OVERVIEW - Check.md` | Duplicate-ish overview; compare before reuse. |
| `docs/architecture/system_overview.md` | Useful architecture intent, but Leaflet/old stack claims need verification. |
| `docs/project_index.html` | Previously claimed as SSOT; must be reconciled with `docs/INDEX.md`. |
| `docs/KNOWNS.md` | Active guidance but still references old SSOT behavior. |
| `docs/SKILLS.md` | Very large; inspect only task-specific sections. |
| `docs/AGENT_FLOW.md` | Large agent-flow doc; validate before use. |
| `docs/SPECS.md` | Index-style spec doc; compare with `specs/` and `docs/specs/`. |
| `docs/SPEC_PMP_V2.md` | Likely useful but must be checked against current storage schema. |
| `docs/SPEC_SYNC_ARCHITECTURE.md` | Needs source verification. |
| `docs/SPEC_Sync_Metadata.md` | Needs source verification. |
| `docs/SPEC_BoxSelection.md` | Needs feature verification. |
| `docs/specs/SPEC_Basemap_Options.md` | Relevant to active basemap work; verify against current source. |
| `docs/specs/SPEC_Basemap_Granular_Control.md` | Relevant to active basemap work; verify against current source. |
| `docs/specs/SPEC_DESIGN_MOBILE.md` | Needs product priority verification. |
| `docs/specs/SPEC_AI_OPTIMIZATION.md` | Needs source and feature flag verification. |
| `docs/design/SPEC_Clustering_Optimization.md` | Needs map renderer verification. |
| `docs/database/schema.md` | Needs comparison with current Rust schema. |
| `docs/database/DATABASE_AND_METADATA_COMPLETE.md` | Useful but likely historical; verify before use. |
| `docs/architecture/CURRENT_STORAGE_ARCHITECTURE_ANALYSIS.md` | Relevant but date/content must be checked against source. |
| `docs/architecture/PROJECT_ARCHITECTURE_DEEP_DIVE.md` | Useful background, needs current-source check. |
| `docs/architecture/PROJECT_STRUCTURE_AND_STORAGE_REVIEW_2026-04-17.md` | Time-bound review; verify before use. |
| `docs/architecture/POINT_MARKER_ARCHITECTURE.md` | Needs map source verification. |
| `docs/architecture/GOOGLE_MAPS_CLICK_MECHANISM.md` | Needs current MapLibre/basemap verification. |
| `docs/architecture/TEST_ARCHITECTURE.md` | Needs test-suite verification. |
| `docs/architecture/build_environment.md` | Needs current Windows/MSI build verification. |
| `docs/architecture/CQRS.md` | Architecture concept doc; verify against implementation. |
| `docs/architecture/street_view_sync.md` | Feature-specific; verify current implementation. |
| `docs/architecture/V2_IMPLEMENTATION_STATUS.md` | Status doc; likely partially stale. |
| `docs/CORE_APP_CODE_WALKTHROUGH.md` | Useful but older; verify against source. |
| `docs/Rust.md` | Broad Rust notes; not canonical without review. |
| `docs/BRIEF_PMP.md` | Background brief; verify against V2 storage. |
| `docs/BRIEF_RUST_PARITY.md` | Historical parity brief; verify before use. |
| `docs/BRIEF_FIELD_MAPPING.md` | Feature-specific; verify before use. |
| `docs/BRIEF_BoxSelection.md` | Feature-specific; verify before use. |
| `docs/FIBER_POLYLINE_CABLE_FEATURE_DOC.md` | Feature doc; verify current map source. |
| `docs/Fix V1 → V2 Design Migration And .pmp Hydration.md` | Relevant to storage migration; verify against source. |
| `docs/fix_pmp_metadata_error.md` | Troubleshooting/bug note; verify current state. |
| `docs/I18N_IMPLEMENTATION.md` | Needs current i18n source verification. |
| `docs/ACCESSIBILITY.md` | Needs current UI verification. |
| `docs/api/endpoints.md` | Needs current Tauri/API verification. |
| `docs/guides/QUICK_TEST_GUIDE.md` | Needs current scripts verification. |
| `docs/guides/TEST_SUITE_README.md` | Needs current Vitest/Rust test verification. |
| `docs/DEPLOYMENT.md` | Needs current Tauri build verification. |
| `docs/PUBLISHING.md` | Needs current release flow verification. |
| `docs/CONTRIBUTING.md` | Needs current workflow verification. |
| `docs/CONTRIBUTING.vi.md` | Localized duplicate of contribution flow; verify current workflow. |
| `docs/COPYRIGHT.md` | Legal/project metadata; review if publishing. |
| `docs/GLOSSARY.md` | Useful but may be stale. |
| `docs/GLOSSARY.vi.md` | Localized glossary; may be stale. |
| `docs/TROUBLESHOOTING.md` | General troubleshooting; likely incomplete. |
| `docs/TROUBLESHOOTING.vi.md` | Localized troubleshooting; likely incomplete. |
| `docs/CHANGELOG.md` | Historical; needs release verification. |
| `docs/PROJECT_SPEC_V2.md` | Product spec; verify against current app. |
| `docs/Project Manager V5.2 - Kế hoạch Kiến trúc & Nâng cấp Hệ thống (V2).md` | Historical plan/spec. |
| `specs/001-project-speckit-baseline/spec.md` | Baseline spec; verify against current product. |
| `specs/001-project-speckit-baseline/checklists/requirements.md` | Baseline checklist; verify against current requirements. |
| `specs/Fix-error-Display-on-Map-and-Database/spec.md` | Feature/fix spec; verify current issue status. |
| `specs/Fix-error-Display-on-Map-and-Database/plan.md` | Fix plan; verify current issue status. |
| `specs/Fix-error-Display-on-Map-and-Database/research.md` | Fix research; verify current issue status. |
| `specs/Fix-error-Display-on-Map-and-Database/data-model.md` | Fix data model; verify current issue status. |
| `specs/Fix-error-Display-on-Map-and-Database/quickstart.md` | Fix quickstart; verify current issue status. |
| `specs/Fix-error-Display-on-Map-and-Database/contracts/report-export.md` | Contract name overlaps report-export spec; verify. |

## STALE

| Document | Reason |
| --- | --- |
| `.planning/PROJECT.md` | Historical planning snapshot. |
| `.planning/REQUIREMENTS.md` | Historical planning snapshot. |
| `.planning/ROADMAP.md` | Historical planning snapshot. |
| `.planning/STATE.md` | Historical planning snapshot. |
| `.planning/phases/4.1-performance-optimization/4.1-RESEARCH.md` | Historical phase research. |
| `docs/PLAN.md` | General plan superseded by current context pack and recent plans. |
| `docs/PLAN-analysis-sync-fix.md` | Old fix plan. |
| `docs/PLAN-android-sync-fix.md` | Old fix plan. |
| `docs/PLAN-database-metadata.md` | Old fix plan. |
| `docs/PLAN-database-rebuild.md` | Old fix plan. |
| `docs/PLAN-drag-drop-fix.md` | Old fix plan. |
| `docs/PLAN-geotype-sync-fix.md` | Old fix plan. |
| `docs/PLAN-icon-standardization.md` | Old standardization plan. |
| `docs/PLAN-lightmode-all-ui-fix.md` | Older UI plan; verify only if touching light mode. |
| `docs/PLAN-offline-project-manager-rust.md` | Old project plan. |
| `docs/PLAN-photo-editor.md` | Old feature plan. |
| `docs/PLAN-pmp-v1-audit.md` | V1 audit plan; historical unless doing migration. |
| `docs/PLAN-stabilization-v2.md` | Historical stabilization plan. |
| `docs/PLAN-system-optimization.md` | Historical optimization plan. |
| `docs/PLAN-ui-ux-i18n-sync.md` | Older sync plan. |
| `docs/PLAN-upgrade-core-architecture.md` | Historical upgrade plan. |
| `docs/plans/COMMERCIAL_PRODUCT_PLAN.md` | Strategic/historical plan. |
| `docs/plans/COMPREHENSIVE_REFACTOR_PLAN_V2.md` | Historical refactor plan. |
| `docs/plans/PROJECT_COMMERCIAL_READY.md` | Historical readiness plan. |
| `docs/plans/REFACTORING_PLAN_V2.md` | Historical refactor plan. |
| `docs/plans/REFRACTOR_PLAN.md` | Historical refactor plan and typo in filename. |
| `docs/implementation_plan_sync_v2.md` | Historical sync plan. |
| `docs/polyline_fix_analysis.md` | Old bug analysis. |
| `docs/polyline_fix_implementation.md` | Old bug implementation note. |
| `docs/polyline_fix_plan.md` | Old bug plan. |
| `docs/polyline_fix_plan_v2.md` | Old bug plan variant. |
| `docs/polyline_issue_analysis.md` | Old bug analysis. |
| `docs/polyline_issue_root_cause.md` | Old bug analysis. |
| `docs/PROJECT_REVIEW_260415.md` | Old review. |
| `docs/REFAC_SUMMARY.md` | Historical refactor summary. |
| `docs/CLEARUP_REPORT.md` | Historical cleanup report. |
| `docs/DATABASE_REVIEW.md` | Old database review. |
| `docs/DATABASE_SUMMARY.md` | Old database summary. |
| `docs/DESIGN_DOC.md` | Older design doc. |
| `docs/design-specs.md` | Older design specs. |
| `docs/DESIGN.md` | Short/older design doc. |
| `docs/NEW.md` | Ambiguous old note. |
| `docs/force save.md` | Old force-save note. |
| `docs/task.md` | Old task note. |
| `docs/ideas.md` | Old idea scratchpad. |
| `docs/PROJECT_COMPLETE_DOCUMENTATION.md` | Large historical complete doc. |
| `docs/architecture/V2_ARCHITECTURE_COMPLETE.md` | Completion doc; historical. |
| `docs/architecture/V2_COMPLETE_FINAL.md` | Completion doc; historical. |
| `docs/architecture/OPTIMIZATION_IMPLEMENTATION_COMPLETE.md` | Completion doc; historical. |
| `docs/architecture/design_system.md` | Empty file. |
| `docs/Project-5.3.md` | Empty file. |

## DUPLICATE

| Document | Canonical/Use Instead | Reason |
| --- | --- | --- |
| `docs/PROJECT_OVERVIEW - Check.md` | `docs/context-pack/PROJECT_OVERVIEW.md` | Overview duplicate. |
| `docs/PROJECT_OVERVIEW.md` | `docs/context-pack/PROJECT_OVERVIEW.md` | Older overview with drift. |
| `docs/README.md` | `docs/INDEX.md` | Short intro, now superseded as gateway. |
| `docs/NOTEBOOK_LM_SOURCE.md` | Archive or generated source system | Large near-duplicate Notebook dump. |
| `docs/NOTEBOOK_LM_V2.md` | Archive or generated source system | Large near-duplicate Notebook dump. |
| `docs/udnl_upload.md` | `docs/archive/udnl_upload.md` or external source | Duplicated upload/reference dump. |
| `docs/archive/udnl_upload.md` | `docs/udnl_upload.md` or archive copy | Duplicate archive copy. |
| `docs/reports/AUDIT_REPORT.md` | `docs/context-pack/DOCUMENT_STATUS.md` | Old audit variant. |
| `docs/reports/AUDIT_REPORT_V2.md` | `docs/context-pack/DOCUMENT_STATUS.md` | Old audit variant. |
| `docs/reports/audit-report.md` | `docs/context-pack/DOCUMENT_STATUS.md` | Old audit variant. |
| `docs/reports/audit_2026-03-15.md` | `docs/context-pack/DOCUMENT_STATUS.md` | Old audit variant. |
| `docs/INSTALL_NPX_GUIDE.md` | Review with localized pair | English/localized overlap. |
| `docs/INSTALL_NPX_GUIDE.vi.md` | Review with English pair | English/localized overlap. |
| `docs/GEMINI.md` | `docs/KNOWNS.md` | Compatibility/agent shim style doc. |
| `docs/OPENCODE.md` | `docs/KNOWNS.md` | Compatibility/agent shim style doc. |
| `docs/GEMINI_GUIDE.md` | `docs/KNOWNS.md` plus task-specific guide | Compatibility guide overlap. |
| `docs/AGENTS_GUIDE.vi.md` | `docs/AGENTS.md` and `docs/KNOWNS.md` | Agent guidance overlap. |

## ARCHIVE_CANDIDATE

| Document or Area | Reason |
| --- | --- |
| `docs/reports/` | Bug/audit/completion reports are historical unless issue recurs. |
| `docs/troubleshoot/` | Logs and incident notes; useful for archaeology only. |
| `docs/archive/` | Already an archive area. |
| `docs/architecture/CODEBASE_MAP.md` | Large generated map; use CodeGraph instead. |
| `docs/graph/KNOWLEDGE_GRAPH.md` | Generated/dirty knowledge graph; use CodeGraph for current code. |
| `docs/graph/PROJECT_KNOWLEDGE_MAP.md` | Generated/historical graph summary. |
| `docs/graph/CORE_ENGINE_DETAIL.md` | Generated/historical graph detail. |
| `docs/graph/DEEP_DIVE_MAP.md` | Generated/historical graph detail. |
| `docs/graph/MODULE_DATA_MODEL_DETAIL.md` | Generated/historical graph detail. |
| `docs/graph/MODULE_DESIGN_DETAIL.md` | Generated/historical graph detail. |
| `docs/graph/MODULE_IMPLEMENT_DETAIL.md` | Generated/historical graph detail. |
| `docs/architecture/Đánh Thức Ứng Dụng Tauri_ Giải Mã và Xây Dựng Hệ Thống Lưu Trữ Robust từ Lỗi Cơ Sở Dữ Liệu.md` | Long narrative architecture note; archive unless actively referenced. |
| `docs/MASTER_GUIDE.md` | Old broad guide; superseded by index/context pack. |
| `docs/MASTER_OPERATIONS.md` | Old broad guide. |
| `docs/MASTER_OPERATIONS.vi.md` | Old localized broad guide. |
| `docs/OPERATIONAL_FLOW.md` | Old broad guide. |
| `docs/OPERATIONAL_FLOW.vi.md` | Old localized broad guide. |
| `docs/WORKFLOW_GUIDE.vi.md` | Old localized workflow guide. |
| `docs/RULES_GUIDE.vi.md` | Old localized rules guide. |
| `docs/SHARED_LIBRARY_GUIDE.vi.md` | Old localized guide. |
| `docs/HOW_ANTIGRAVITY_THINKS.vi.md` | Meta/agent philosophy, not product docs. |
| `docs/FAQ.vi.md` | Old localized FAQ. |
| `docs/UPDATE_GUIDE.vi.md` | Old localized guide. |
| `docs/UNINSTALL_GUIDE.vi.md` | Old localized guide. |
| `scripts/CODEBASE_MAP.md` | Generated/historical code map. |
| `src-tauri/docs/troubleshoot/` | Backend troubleshoot logs. |
| `src/modules/design/features/map/README.md` | Local README; verify when touching map module. |
| `src/modules/design/features/map/IMPLEMENTATION_GUIDE.md` | Local implementation guide; verify when touching map module. |
| `design-system/*.md` | Separate design-system docs; review before applying to product. |
| `apps-script/pmp-collaboration/README.md` | Support app/script doc, not core product docs. |
| `.agent/` | Large agent reference forest; not current product documentation. |
| `.agents/` | Local skill area; inspect only when relevant. |
| `.brain/` | Generated memory/brain docs. |
| `BAK/` | Backup/old files. |
| `RUST/` | Nested/legacy area; review before use. |
| `Resources/references/para-workspace/` | External reference package. |
| `bando-graph-viewer/` | Separate graph viewer/reference area. |
| `graphify-out/` | Generated graph analysis output. |
| `.venv/` | Environment artifacts; not product docs. |

### Archive Candidate File Sets

The following file sets inherit `ARCHIVE_CANDIDATE` unless a future task
explicitly reactivates one of them:

- `docs/reports/APPLY_GOOGLE_MAPS_STYLE.md`
- `docs/reports/APPLY_GOOGLE_MAPS_SUMMARY.md`
- `docs/reports/audit_2026-03-15.md`
- `docs/reports/AUDIT_REPORT.md`
- `docs/reports/AUDIT_REPORT_V2.md`
- `docs/reports/audit-report.md`
- `docs/reports/BRAINSTORM_POINT_MARKER_CLICK.md`
- `docs/reports/BUGFIX_THEME_HANG.md`
- `docs/reports/BUGFIX_THEME_LOSS.md`
- `docs/reports/CONSOLIDATED_CONTRACT_REPORT.md`
- `docs/reports/DEBUG_CLICK_NOT_WORKING.md`
- `docs/reports/debug_polyline_issue.md`
- `docs/reports/debug_report_lnk1201.md`
- `docs/reports/ERRORS.md`
- `docs/reports/FEATURE_CLICK_ZOOM.md`
- `docs/reports/FINAL_UPGRADE_REPORT.md`
- `docs/reports/POINT_MARKER_CLICK_ISSUE.md`
- `docs/reports/POINT_SELECTION_COMPLETE_FLOW.md`
- `docs/reports/POINT_SELECTION_DIAGNOSTIC.md`
- `docs/reports/POINT_SELECTION_FINAL_SUMMARY.md`
- `docs/reports/POINT_SELECTION_REPORT.md`
- `docs/reports/TEST_SUMMARY.md`
- `docs/troubleshoot/debug_polyline.md`
- `docs/troubleshoot/implementation_logs/2026-03-15_Fix_Login_Hang.md`
- `docs/troubleshoot/log.md`
- `docs/troubleshoot/log_clustering_perf.md`
- `docs/troubleshoot/log_explorer_v2.md`
- `docs/troubleshoot/log_import_error.md`
- `docs/troubleshoot/log_kmz_specs.md`
- `docs/troubleshoot/os_error_2_analysis.md`
- `docs/troubleshoot/virtual_council_polyline.md`
- `docs/archive/PHASE_1_COMPLETE.md`
- `docs/archive/PHASE_2_3_PROGRESS.md`
- `docs/archive/PHASE_2_STATUS.md`
- `docs/archive/PHASE_5_STATUS.md`
- `docs/archive/REFACTORING_SUMMARY.md`
- `docs/archive/udnl_upload.md`
- `docs/archive/UPGRADE_LIVE_PROGRESS.md`
- `docs/archive/UPGRADE_PROGRESS.md`

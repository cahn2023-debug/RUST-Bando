---
id: 20260811-1311-standalone-vietnam-basemap-platform-and-release-contract
title: Standalone Vietnam Basemap Platform and Release Contract
status: draft
supersedes: []
supersededBy: []
tags:
  - basemap
  - architecture
  - draft
sources:
  - '@doc/architecture/frontend'
  - '@doc/architecture/project-summary-current-state'
  - '@doc/specs/2026-08-11/vietnam-basemap-platform'
  - '@doc/architecture/vietnam-basemap-platform-integration'
relatedDocs:
  - architecture/frontend
  - architecture/project-summary-current-state
  - specs/2026-08-11/vietnam-basemap-platform
  - architecture/vietnam-basemap-platform-integration
relatedTasks:
  - eudf3a
  - l4pkjd
  - 3cldug
  - 5m9287
  - qix90y
  - cg4bdi
  - 5n9tjd
verification: []
reviewState: ready_for_review
reviewBlockers: []
reviewMatches: []
reviewAllowedResolutions:
  - accept_new
  - reject_new
reviewEvaluatedAt: '2026-08-11T07:42:57.187Z'
createdAt: '2026-08-11T06:11:19.293Z'
updatedAt: '2026-08-11T07:42:57.188Z'
---

## Context

Các ứng dụng Rust/web/desktop cần dùng chung basemap Việt Nam tự chủ, hỗ trợ local/offline và LAN/server, không gắn dữ liệu nghiệp vụ của từng project vào basemap.

## Decision

Tách basemap Việt Nam thành một platform độc lập gồm pipeline dữ liệu đa nguồn, versioned release package và Basemap Service dùng chung. Client online dùng service contract; client offline dùng package cục bộ; cả hai tuân theo manifest/version contract. Dữ liệu nghiệp vụ, feature project và lifecycle nghiệp vụ nằm ngoài platform.

## Alternatives Considered

1. Mỗi project tự tải/serve basemap. 2. Phụ thuộc tile/API provider bên ngoài. 3. Xây một GIS server hợp nhất với dữ liệu nghiệp vụ.

## Consequences

Có thêm lifecycle build/release/rollback và trách nhiệm vận hành dữ liệu. Các client cần tích hợp qua manifest/version contract. Platform cần hỗ trợ package assets tự chứa để offline; license/attribution của từng nguồn do operator pipeline chịu trách nhiệm.

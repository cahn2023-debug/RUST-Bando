---
title: project-directory-cleanup
description: Approved specification for reversible project directory cleanup and unused code backup.
createdAt: '2026-08-14T06:35:37.459Z'
updatedAt: '2026-08-14T06:40:26.092Z'
tags:
  - spec
  - approved
---

## Overview

Äáº·c táº£ cho viá»‡c lÃ m gá»n toÃ n bá»™ workspace D:\Code Antinigaty\RUST báº±ng cÃ¡ch rÃ  soÃ¡t cÃ¡c file/thÆ° má»¥c mÃ£ nguá»“n vÃ  chuyá»ƒn pháº§n code khÃ´ng thuá»™c Ä‘Æ°á»ng cháº¡y cá»§a báº¥t ká»³ dá»± Ã¡n nÃ o vÃ o BAK. Thao tÃ¡c pháº£i cÃ³ thá»ƒ khÃ´i phá»¥c, khÃ´ng xÃ³a dá»¯ liá»‡u vÃ  khÃ´ng lÃ m thay Ä‘á»•i dependency, tooling, cache hoáº·c artefact Ä‘ang cÃ³.

Tráº¡ng thÃ¡i: approved.

## Locked Decisions

- D1: Pháº¡m vi lÃ  toÃ n bá»™ workspace, gá»“m cÃ¡c dá»± Ã¡n con vÃ  cÃ¡c má»¥c á»Ÿ thÆ° má»¥c gá»‘c.
- D2: Code khÃ´ng sá»­ dá»¥ng lÃ  code khÃ´ng náº±m trong Ä‘Æ°á»ng cháº¡y chÃ­nh; bao gá»“m test, script cháº¡y thá»§ cÃ´ng, cÃ´ng cá»¥ migrate/inspect vÃ  code chá»‰ Ä‘Æ°á»£c gá»i tÃ¹y chá»n.
- D3: File Ä‘ang cÃ³ thay Ä‘á»•i trong git váº«n Ä‘Æ°á»£c xÃ©t; náº¿u lÃ  code khÃ´ng dÃ¹ng thÃ¬ váº«n chuyá»ƒn vÃ o BAK. File Ä‘Ã£ bá»‹ xÃ³a khá»i working tree giá»¯ nguyÃªn tráº¡ng thÃ¡i xÃ³a hiá»‡n táº¡i.
- D4: Má»¥c Ä‘Æ°á»£c chuyá»ƒn vÃ o BAK/2026-08-14/<Ä‘Æ°á»ng-dáº«n-gá»‘c>, giá»¯ nguyÃªn Ä‘Æ°á»ng dáº«n tÆ°Æ¡ng Ä‘á»‘i ban Ä‘áº§u.
- D5: Code Ä‘Æ°á»£c báº£o toÃ n náº¿u Ä‘Æ°á»£c tham chiáº¿u tá»« báº¥t ká»³ manifest hoáº·c entry point nÃ o trong workspace, ká»ƒ cáº£ cÃ¡c dá»± Ã¡n phá»¥ vÃ  code hiá»‡n Ä‘ang náº±m trong BAK.
- D6: Chá»‰ di chuyá»ƒn mÃ£ nguá»“n vÃ  thÆ° má»¥c chá»©a mÃ£ nguá»“n; giá»¯ nguyÃªn dependency, tooling, cache vÃ  artefact.

## System Decision Impact

- Impact: none.
- Decision: KhÃ´ng táº¡o hoáº·c thay tháº¿ System Decision; Ä‘Ã¢y lÃ  thao tÃ¡c tá»• chá»©c láº¡i file cÃ³ thá»ƒ hoÃ n tÃ¡c.
- Acceptance gate: Chá»‰ hoÃ n táº¥t sau khi manifest khÃ´i phá»¥c Ä‘Æ°á»£c Ä‘Æ°á»ng dáº«n, khÃ´ng cÃ³ file bá»‹ ghi Ä‘Ã¨ vÃ  cÃ¡c kiá»ƒm tra xÃ¡c minh Ä‘áº¡t yÃªu cáº§u.

## Requirements

### Functional Requirements

- FR-1: Láº­p inventory cho toÃ n bá»™ workspace, bá» qua thÆ° má»¥c Ä‘Ã­ch BAK/2026-08-14 trong lÃºc quÃ©t Ä‘á»ƒ khÃ´ng quÃ©t láº·p.
- FR-2: XÃ¡c Ä‘á»‹nh cÃ¡c entry point vÃ  manifest cá»§a má»i dá»± Ã¡n trong workspace, bao gá»“m package.json, appsscript.json vÃ  cÃ¡c manifest tÆ°Æ¡ng Ä‘Æ°Æ¡ng.
- FR-3: XÃ¡c Ä‘á»‹nh táº­p code Ä‘ang dÃ¹ng báº±ng cÃ¡c tham chiáº¿u tÄ©nh, cáº¥u hÃ¬nh entry point, import/export, script command vÃ  quan há»‡ build Ä‘Ã£ phÃ¡t hiá»‡n.
- FR-4: Báº£o toÃ n má»i code thuá»™c táº­p Ä‘ang dÃ¹ng; code Ä‘ang náº±m trong BAK cÅ©ng Ä‘Æ°á»£c giá»¯ nguyÃªn náº¿u cÃ²n Ä‘Æ°á»£c entry point tham chiáº¿u.
- FR-5: Chuyá»ƒn cÃ¡c file code khÃ´ng thuá»™c táº­p Ä‘ang dÃ¹ng vÃ o BAK/2026-08-14/<Ä‘Æ°á»ng-dáº«n-gá»‘c>.
- FR-6: Náº¿u má»™t thÆ° má»¥c chá»©a cáº£ code Ä‘ang dÃ¹ng vÃ  code khÃ´ng dÃ¹ng, chá»‰ chuyá»ƒn pháº§n khÃ´ng dÃ¹ng; chá»‰ chuyá»ƒn cáº£ thÆ° má»¥c khi toÃ n bá»™ ná»™i dung code cá»§a thÆ° má»¥c Ä‘Ã³ khÃ´ng dÃ¹ng.
- FR-7: Giá»¯ nguyÃªn ná»™i dung vÃ  cáº¥u trÃºc tÆ°Æ¡ng Ä‘á»‘i cá»§a tá»«ng má»¥c Ä‘Æ°á»£c chuyá»ƒn, khÃ´ng ghi Ä‘Ã¨ má»¥c Ä‘Ã£ tá»“n táº¡i trong BAK.
- FR-8: Táº¡o manifest kiá»ƒm kÃª cho láº§n dá»n dáº¹p, ghi Ä‘Æ°á»ng dáº«n cÅ©, Ä‘Æ°á»ng dáº«n má»›i, loáº¡i má»¥c, lÃ½ do chuyá»ƒn vÃ  tráº¡ng thÃ¡i xÃ¡c minh.
- FR-9: KhÃ´ng khÃ´i phá»¥c cÃ¡c file Ä‘Ã£ bá»‹ xÃ³a trong git; khÃ´ng tá»± Ä‘á»™ng commit, reset hoáº·c checkout.
- FR-10: Giá»¯ nguyÃªn node_modules, .venv, .codegraph, .knowns, cache, log, coverage, dist, scratch, graphify-out, dependency vÃ  cÃ¡c artefact tÃ¡i táº¡o.
- FR-11: Sau khi di chuyá»ƒn, cáº­p nháº­t hoáº·c kiá»ƒm tra cÃ¡c tham chiáº¿u trá»±c tiáº¿p bá»‹ áº£nh hÆ°á»Ÿng; khÃ´ng Ä‘á»ƒ manifest Ä‘ang dÃ¹ng trá» tá»›i Ä‘Æ°á»ng dáº«n Ä‘Ã£ chuyá»ƒn.
- FR-12: Náº¿u Ä‘Æ°á»ng dáº«n Ä‘Ã­ch Ä‘Ã£ tá»“n táº¡i, khÃ´ng ghi Ä‘Ã¨; giá»¯ má»¥c hiá»‡n cÃ³ vÃ  ghi xung Ä‘á»™t vÃ o manifest Ä‘á»ƒ xá»­ lÃ½ riÃªng.

### Non-Functional Requirements

- NFR-1: KhÃ´ng xÃ³a dá»¯ liá»‡u; má»i thay Ä‘á»•i pháº£i cÃ³ báº£n sao táº¡i BAK hoáº·c Ä‘Æ°á»£c giá»¯ nguyÃªn táº¡i vá»‹ trÃ­ cÅ©.
- NFR-2: Thao tÃ¡c pháº£i cÃ³ thá»ƒ Ä‘áº£o ngÆ°á»£c báº±ng manifest Ä‘Æ°á»ng dáº«n cÅ©â€“má»›i.
- NFR-3: KhÃ´ng lÃ m thay Ä‘á»•i ná»™i dung cá»§a file Ä‘Æ°á»£c chuyá»ƒn; kiá»ƒm tra hash trÆ°á»›c vÃ  sau khi chuyá»ƒn.
- NFR-4: KhÃ´ng lÃ m thay Ä‘á»•i cÃ¡c file ngoÃ i pháº¡m vi mÃ£ nguá»“n, dependency, tooling, cache vÃ  artefact Ä‘Ã£ Ä‘Æ°á»£c khÃ³a.
- NFR-5: Káº¿t quáº£ pháº£i cÃ³ bÃ¡o cÃ¡o sá»‘ lÆ°á»£ng má»¥c Ä‘Ã£ quÃ©t, báº£o toÃ n, chuyá»ƒn, bá» qua, xung Ä‘á»™t vÃ  lá»—i.

## Acceptance Criteria

- [x] AC-1: CÃ³ inventory cá»§a toÃ n bá»™ workspace vÃ  danh sÃ¡ch entry point/manifest Ä‘Æ°á»£c dÃ¹ng Ä‘á»ƒ phÃ¢n tÃ­ch.
- [x] AC-2: Má»i má»¥c Ä‘Æ°á»£c phÃ¢n loáº¡i lÃ  code Ä‘ang dÃ¹ng Ä‘á»u cÃ²n tá»“n táº¡i á»Ÿ vá»‹ trÃ­ Ä‘ang Ä‘Æ°á»£c manifest/entry point tham chiáº¿u.
- [x] AC-3: Má»i má»¥c code khÃ´ng dÃ¹ng Ä‘Æ°á»£c chuyá»ƒn vÃ o BAK/2026-08-14/<Ä‘Æ°á»ng-dáº«n-gá»‘c> hoáº·c Ä‘Æ°á»£c ghi rÃµ lÃ  bá»‹ bá» qua do xung Ä‘á»™t.
- [x] AC-4: KhÃ´ng cÃ³ má»¥c nÃ o trong node_modules, .venv, metadata tooling, cache hoáº·c artefact bá»‹ di chuyá»ƒn.
- [x] AC-5: Manifest kiá»ƒm kÃª cÃ³ Ä‘á»§ Ä‘Æ°á»ng dáº«n cÅ©, Ä‘Æ°á»ng dáº«n má»›i, lÃ½ do, hash vÃ  tráº¡ng thÃ¡i cho má»i má»¥c Ä‘Ã£ chuyá»ƒn.
- [x] AC-6: KhÃ´ng cÃ³ thao tÃ¡c xÃ³a vÄ©nh viá»…n, reset, checkout hoáº·c commit tá»± Ä‘á»™ng; tráº¡ng thÃ¡i git trÆ°á»›c cÃ¡c má»¥c khÃ´ng liÃªn quan váº«n Ä‘Æ°á»£c báº£o toÃ n.
- [x] AC-7: CÃ¡c kiá»ƒm tra phÃ¹ há»£p vá»›i tá»«ng entry point cÃ²n láº¡i cháº¡y Ä‘Æ°á»£c, hoáº·c lá»—i mÃ´i trÆ°á»ng Ä‘Æ°á»£c ghi nháº­n mÃ  khÃ´ng bá»‹ che giáº¥u.
- [x] AC-8: Cháº¡y láº¡i inventory khÃ´ng phÃ¡t hiá»‡n thÃªm code khÃ´ng dÃ¹ng chÆ°a Ä‘Æ°á»£c xá»­ lÃ½ ngoÃ i cÃ¡c má»¥c Ä‘Ã£ ghi nháº­n trong manifest.

## Scenarios

### Scenario 1: Chuyá»ƒn code cÅ© khÃ´ng Ä‘Æ°á»£c tham chiáº¿u

**Given** má»™t file mÃ£ nguá»“n khÃ´ng Ä‘Æ°á»£c manifest, entry point hoáº·c code Ä‘ang dÃ¹ng tham chiáº¿u
**When** cháº¡y quy trÃ¬nh dá»n dáº¹p
**Then** file Ä‘Æ°á»£c chuyá»ƒn tá»›i BAK/2026-08-14/<Ä‘Æ°á»ng-dáº«n-gá»‘c>, hash khÃ´ng Ä‘á»•i vÃ  manifest ghi láº¡i lÃ½ do chuyá»ƒn.

### Scenario 2: Giá»¯ code Ä‘ang Ä‘Æ°á»£c dÃ¹ng trong BAK

**Given** má»™t entry point Ä‘ang tham chiáº¿u code náº±m dÆ°á»›i BAK
**When** inventory toÃ n workspace Ä‘Æ°á»£c thá»±c hiá»‡n
**Then** code Ä‘Ã³ khÃ´ng bá»‹ chuyá»ƒn tiáº¿p hoáº·c thay Ä‘á»•i Ä‘Æ°á»ng dáº«n.

### Scenario 3: ThÆ° má»¥c chá»©a code dÃ¹ng vÃ  khÃ´ng dÃ¹ng

**Given** má»™t thÆ° má»¥c cÃ³ cáº£ file Ä‘Æ°á»£c tham chiáº¿u vÃ  file khÃ´ng Ä‘Æ°á»£c tham chiáº¿u
**When** quy trÃ¬nh dá»n dáº¹p phÃ¢n loáº¡i thÆ° má»¥c
**Then** chá»‰ file khÃ´ng dÃ¹ng Ä‘Æ°á»£c chuyá»ƒn, cÃ²n file dÃ¹ng vÃ  thÆ° má»¥c cha váº«n giá»¯ nguyÃªn.

### Scenario 4: File Ä‘ang cÃ³ thay Ä‘á»•i git

**Given** má»™t file code Ä‘ang Ä‘Æ°á»£c chá»‰nh sá»­a nhÆ°ng khÃ´ng Ä‘Æ°á»£c tham chiáº¿u
**When** quy trÃ¬nh dá»n dáº¹p xá»­ lÃ½ file Ä‘Ã³
**Then** file Ä‘Æ°á»£c chuyá»ƒn nguyÃªn ná»™i dung hiá»‡n táº¡i vÃ o BAK, khÃ´ng khÃ´i phá»¥c tráº¡ng thÃ¡i cÅ© vÃ  khÃ´ng commit thay Ä‘á»•i.

### Scenario 5: ÄÆ°á»ng dáº«n sao lÆ°u Ä‘Ã£ tá»“n táº¡i

**Given** Ä‘Æ°á»ng dáº«n Ä‘Ã­ch trong BAK/2026-08-14 Ä‘Ã£ tá»“n táº¡i
**When** quy trÃ¬nh cáº§n chuyá»ƒn má»™t má»¥c tá»›i cÃ¹ng Ä‘Æ°á»ng dáº«n
**Then** khÃ´ng ghi Ä‘Ã¨ má»¥c Ä‘Ã­ch vÃ  manifest ghi nháº­n xung Ä‘á»™t Ä‘á»ƒ xá»­ lÃ½ thá»§ cÃ´ng.

### Scenario 6: Dependency vÃ  artefact

**Given** má»™t thÆ° má»¥c nhÆ° node_modules, .venv, cache hoáº·c dist khÃ´ng pháº£i mÃ£ nguá»“n cáº§n báº£o toÃ n mÃ´i trÆ°á»ng
**When** quy trÃ¬nh dá»n dáº¹p cháº¡y
**Then** thÆ° má»¥c Ä‘Ã³ Ä‘Æ°á»£c giá»¯ nguyÃªn vÃ  Ä‘Æ°á»£c ghi nháº­n lÃ  bá»‹ loáº¡i khá»i pháº¡m vi di chuyá»ƒn.

## Technical Notes

- ÄÆ°á»ng dáº«n Ä‘Ã­ch pháº£i Ä‘Æ°á»£c táº¡o trong cÃ¹ng workspace Ä‘á»ƒ thao tÃ¡c move khÃ´ng lÃ m máº¥t dá»¯ liá»‡u do khÃ¡c volume.
- Pháº£i loáº¡i trá»« .git vÃ  thÆ° má»¥c Ä‘Ã­ch hiá»‡n táº¡i khá»i thao tÃ¡c di chuyá»ƒn.
- Root package.json hiá»‡n tham chiáº¿u má»™t á»©ng dá»¥ng náº±m dÆ°á»›i BAK; Ä‘Ã¢y lÃ  má»™t tham chiáº¿u active vÃ  pháº£i Ä‘Æ°á»£c kiá»ƒm tra trÆ°á»›c khi di chuyá»ƒn.
- CÃ¡c dá»± Ã¡n cÃ³ manifest riÃªng pháº£i Ä‘Æ°á»£c phÃ¢n tÃ­ch Ä‘á»™c láº­p nhÆ°ng dÃ¹ng chung bÃ¡o cÃ¡o inventory.
- VÃ¬ CodeGraph hiá»‡n bÃ¡o tráº¡ng thÃ¡i auto-sync bá»‹ vÃ´ hiá»‡u hÃ³a, má»i káº¿t luáº­n liÃªn quan Ä‘áº¿n file Ä‘Ã£ thay Ä‘á»•i pháº£i Ä‘Æ°á»£c xÃ¡c nháº­n tá»« filesystem hiá»‡n táº¡i vÃ  cÃ´ng cá»¥ build/reference thá»±c táº¿.

## Task Links

- @task-eou1qn [project-directory-cleanup-01] Inventory and classify code â€” done
- @task-9ba20i [project-directory-cleanup-02] Move unused code to BAK â€” done
- @task-js0s9a [project-directory-cleanup-03] Review and verify cleanup â€” done

## Open Questions

- [ ] CÃ³ cáº§n táº¡o thÃªm script khÃ´i phá»¥c tá»± Ä‘á»™ng tá»« manifest sau khi dá»n dáº¹p khÃ´ng?
- [ ] Vá»›i xung Ä‘á»™t Ä‘Ã­ch, cÃ³ muá»‘n cho phÃ©p so sÃ¡nh hash vÃ  tá»± bá» qua báº£n sao giá»‘ng há»‡t hay luÃ´n yÃªu cáº§u xá»­ lÃ½ thá»§ cÃ´ng?

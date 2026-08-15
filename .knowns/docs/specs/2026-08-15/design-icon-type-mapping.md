---
title: design-icon-type-mapping
description: Canonical Knowns copy of the approved DESIGN icon/object/type mapping specification.
createdAt: '2026-08-15T02:08:42.191Z'
updatedAt: '2026-08-15T03:02:03.595Z'
tags:
  - spec
  - draft
---

# Feature Specification: Chuáº©n hÃ³a Ã¡nh xáº¡ biá»ƒu tÆ°á»£ngâ€“Ä‘á»‘i tÆ°á»£ng trong DESIGN

**Feature Branch**: `design-icon-type-mapping`  
**Created**: 2026-08-15  
**Status**: Draft â€” chá» ngÆ°á»i dÃ¹ng duyá»‡t  
**Input**: XÃ³a code bá»‹ láº·p vÃ  xÃ¢y dá»±ng láº¡i bá»™ hiá»ƒn thá»‹ biá»ƒu tÆ°á»£ng, Ä‘á»‘i tÆ°á»£ng, loáº¡i Ä‘á»‘i tÆ°á»£ng vá»›i hÃ¬nh áº£nh trÃªn mÃ n hÃ¬nh chÃ­nh pháº§n DESIGN.

## Overview

Chuáº©n hÃ³a cÃ¡ch pháº§n DESIGN xÃ¡c Ä‘á»‹nh vÃ  hiá»ƒn thá»‹ biá»ƒu tÆ°á»£ng cá»§a Ä‘á»‘i tÆ°á»£ng trÃªn ba khu vá»±c chÃ­nh: CAD Canvas, cÃ¢y Ä‘á»‘i tÆ°á»£ng bÃªn trÃ¡i vÃ  Property Panel bÃªn pháº£i. Má»™t mapping chuáº©n sáº½ liÃªn káº¿t biá»ƒu tÆ°á»£ng, tÃªn hiá»ƒn thá»‹ vÃ  loáº¡i Ä‘á»‘i tÆ°á»£ng; má»i khu vá»±c dÃ¹ng cÃ¹ng ngá»¯ nghÄ©a nhÆ°ng Ä‘Æ°á»£c phÃ©p Ä‘iá»u chá»‰nh kÃ­ch thÆ°á»›c vÃ  mÃ u theo layout.

Pháº¡m vi bao gá»“m dá»n cÃ¡c Ä‘á»‹nh nghÄ©a vÃ  logic Ã¡nh xáº¡ bá»‹ láº·p trong luá»“ng DESIGN vÃ  cÃ¡c utility trá»±c tiáº¿p liÃªn quan. Dá»¯ liá»‡u dá»± Ã¡n cÅ© Ä‘Æ°á»£c chuyá»ƒn sang bá»™ trÆ°á»ng chuáº©n; trÆ°á»›c khi chuyá»ƒn, chá»‰ cÃ¡c báº£n ghi bá»‹ áº£nh hÆ°á»Ÿng Ä‘Æ°á»£c snapshot vÃ o thÆ° má»¥c `BAK` cÃ³ phiÃªn báº£n.

Pháº¡m vi khÃ´ng bao gá»“m má»Ÿ rá»™ng loáº¡i Ä‘á»‘i tÆ°á»£ng má»›i, thay Ä‘á»•i cÃ¡c view phá»¥ ngoÃ i ba khu vá»±c trÃªn hoáº·c xÃ¢y dá»±ng cháº¿ Ä‘á»™ 3D.

## Locked Decisions

- D1: Pháº¡m vi hiá»ƒn thá»‹ gá»“m CAD Canvas, cÃ¢y Ä‘á»‘i tÆ°á»£ng vÃ  Property Panel.
- D2: Chuáº©n hÃ³a `icon`, `type` vÃ  `objectType` theo mapping chuáº©n khi táº£i, chá»n vÃ  lÆ°u.
- D3: Giá»¯ toÃ n bá»™ loáº¡i Ä‘ang há»— trá»£; Æ°u tiÃªn CCTV, PTZ, SPEED, LPR, tá»§ thÃ´ng tin vÃ  tá»§ Ä‘Ã¨n.
- D4: Ba khu vá»±c dÃ¹ng chung `iconKey` chuáº©n; kÃ­ch thÆ°á»›c vÃ  mÃ u cÃ³ thá»ƒ khÃ¡c theo layout.
- D5: Há»£p nháº¥t logic láº·p cá»§a luá»“ng iconâ€“object typeâ€“display mapping vÃ  giá»¯ tÆ°Æ¡ng thÃ­ch caller cÅ© khi cáº§n.
- D6: Chuyá»ƒn dá»¯ liá»‡u cÅ© sang trÆ°á»ng chuáº©n vÃ  khÃ´ng giá»¯ alias cÅ© trong dá»¯ liá»‡u hoáº¡t Ä‘á»™ng.
- D7: Táº¡o snapshot cÃ³ phiÃªn báº£n trong `BAK` chá»‰ cho báº£n ghi bá»‹ áº£nh hÆ°á»Ÿng trÆ°á»›c khi chuáº©n hÃ³a.
- D8: Loáº¡i chÆ°a Ã¡nh xáº¡ dÃ¹ng icon máº·c Ä‘á»‹nh, giá»¯ nhÃ£n/loáº¡i, ghi nháº­n má»¥c chÆ°a Ã¡nh xáº¡ vÃ  cáº£nh bÃ¡o nháº¹ cÃ³ tooltip.
- D9: Thay Ä‘á»•i icon cáº­p nháº­t preview ngay trÃªn ba khu vá»±c; chá»‰ ghi chÃ­nh thá»©c khi báº¥m LÆ°u.
- D10: Bá»™ chá»n hiá»ƒn thá»‹ biá»ƒu tÆ°á»£ng, tÃªn hiá»ƒn thá»‹ vÃ  loáº¡i Ä‘á»‘i tÆ°á»£ng chuáº©n.
- D11: Line/polygon Æ°u tiÃªn biá»ƒu tÆ°á»£ng theo hÃ¬nh há»c; mapping iconâ€“type Ã¡p dá»¥ng cho point vÃ  thiáº¿t bá»‹.
- D12: Nhiá»u icon/type khÃ¡c nhau hiá»ƒn thá»‹ â€œKhÃ¡c nhauâ€ vÃ  cho phÃ©p Ã¡p dá»¥ng icon má»›i cho toÃ n bá»™ táº­p chá»n.
- D13: TÃªn/loáº¡i chuáº©n láº¥y tá»« mapping táº­p trung; ngÆ°á»i dÃ¹ng chá»‰ Ä‘á»•i tÃªn riÃªng.
- D14: Mapping quyáº¿t Ä‘á»‹nh hÃ¬nh dáº¡ng/ngá»¯ nghÄ©a; mÃ u vÃ  kÃ­ch thÆ°á»›c váº«n lÃ  thuá»™c tÃ­nh riÃªng.
- D15: Äá»‘i tÆ°á»£ng chÆ°a Ã¡nh xáº¡ váº«n lÃ m viá»‡c bÃ¬nh thÆ°á»ng vá»›i icon máº·c Ä‘á»‹nh vÃ  cáº£nh bÃ¡o nháº¹.

## System Decision Impact

- Impact: none
- **Decision**: KhÃ´ng cÃ³.
- **Acceptance gate**: HoÃ n táº¥t ma tráº­n kiá»ƒm thá»­ mapping vÃ  kiá»ƒm tra snapshot/khÃ´i phá»¥c trÆ°á»›c khi triá»ƒn khai.

## User Scenarios & Testing

### User Story 1 â€” Nháº­n diá»‡n nháº¥t quÃ¡n Ä‘á»‘i tÆ°á»£ng (Priority: P1)

LÃ  ká»¹ sÆ° thiáº¿t káº¿, tÃ´i muá»‘n má»™t Ä‘á»‘i tÆ°á»£ng cÃ³ cÃ¹ng biá»ƒu tÆ°á»£ng vÃ  loáº¡i Ä‘á»‘i tÆ°á»£ng á»Ÿ Canvas, cÃ¢y Ä‘á»‘i tÆ°á»£ng vÃ  Property Panel Ä‘á»ƒ nháº­n diá»‡n vÃ  chá»‰nh sá»­a mÃ  khÃ´ng bá»‹ nháº§m.

**Why this priority**: ÄÃ¢y lÃ  giÃ¡ trá»‹ cá»‘t lÃµi cá»§a viá»‡c xÃ¢y dá»±ng láº¡i bá»™ hiá»ƒn thá»‹ vÃ  loáº¡i bá» mapping trÃ¹ng.

**Independent Test**: Táº¡o hoáº·c má»Ÿ má»™t báº£n Ä‘á»“ cÃ³ tá»«ng loáº¡i Ä‘á»‘i tÆ°á»£ng hiá»‡n cÃ³, sau Ä‘Ã³ Ä‘á»‘i chiáº¿u ba khu vá»±c mÃ  khÃ´ng cáº§n thá»±c hiá»‡n thao tÃ¡c lÆ°u.

**Acceptance Scenarios**:

1. **Given** má»™t Ä‘á»‘i tÆ°á»£ng cÃ³ `iconKey` chuáº©n, **When** Ä‘á»‘i tÆ°á»£ng xuáº¥t hiá»‡n á»Ÿ ba khu vá»±c, **Then** cáº£ ba khu vá»±c hiá»ƒn thá»‹ cÃ¹ng biá»ƒu tÆ°á»£ng ngá»¯ nghÄ©a vÃ  cÃ¹ng tÃªn/loáº¡i chuáº©n.
2. **Given** Ä‘á»‘i tÆ°á»£ng lÃ  line hoáº·c polygon, **When** Ä‘á»‘i tÆ°á»£ng Ä‘Æ°á»£c hiá»ƒn thá»‹, **Then** biá»ƒu tÆ°á»£ng theo hÃ¬nh há»c Ä‘Æ°á»£c Æ°u tiÃªn vÃ  khÃ´ng bá»‹ icon cá»§a point ghi Ä‘Ã¨.

### User Story 2 â€” Äá»•i biá»ƒu tÆ°á»£ng cÃ³ xem trÆ°á»›c tá»©c thá»i (Priority: P1)

LÃ  ká»¹ sÆ° thiáº¿t káº¿, tÃ´i muá»‘n chá»n biá»ƒu tÆ°á»£ng trong Property Panel vÃ  tháº¥y káº¿t quáº£ ngay trÃªn toÃ n bá»™ mÃ n hÃ¬nh DESIGN trÆ°á»›c khi lÆ°u.

**Why this priority**: Giáº£m lá»—i chá»n nháº§m loáº¡i vÃ  lÃ m cho thao tÃ¡c chá»‰nh sá»­a cÃ³ thá»ƒ kiá»ƒm chá»©ng ngay.

**Independent Test**: Chá»n má»™t Ä‘á»‘i tÆ°á»£ng, Ä‘á»•i láº§n lÆ°á»£t cÃ¡c biá»ƒu tÆ°á»£ng thiáº¿t bá»‹, quan sÃ¡t ba khu vá»±c trÆ°á»›c vÃ  sau thao tÃ¡c LÆ°u.

**Acceptance Scenarios**:

1. **Given** má»™t Ä‘á»‘i tÆ°á»£ng Ä‘Æ°á»£c chá»n, **When** ngÆ°á»i dÃ¹ng chá»n biá»ƒu tÆ°á»£ng má»›i, **Then** Canvas, cÃ¢y Ä‘á»‘i tÆ°á»£ng vÃ  Property Panel cáº­p nháº­t xem trÆ°á»›c ngay, cÃ²n dá»¯ liá»‡u chÃ­nh thá»©c chÆ°a thay Ä‘á»•i trÆ°á»›c khi báº¥m LÆ°u.
2. **Given** ngÆ°á»i dÃ¹ng báº¥m LÆ°u sau khi Ä‘á»•i biá»ƒu tÆ°á»£ng, **When** má»Ÿ láº¡i Ä‘á»‘i tÆ°á»£ng, **Then** `icon`, `type` vÃ  `objectType` khá»›p mapping chuáº©n.
3. **Given** nhiá»u Ä‘á»‘i tÆ°á»£ng Ä‘ang Ä‘Æ°á»£c chá»n vÃ  cÃ³ biá»ƒu tÆ°á»£ng khÃ¡c nhau, **When** ngÆ°á»i dÃ¹ng Ã¡p dá»¥ng má»™t biá»ƒu tÆ°á»£ng má»›i, **Then** táº¥t cáº£ Ä‘á»‘i tÆ°á»£ng trong táº­p chá»n nháº­n xem trÆ°á»›c má»›i vÃ  Ä‘Æ°á»£c lÆ°u theo cÃ¹ng mapping khi xÃ¡c nháº­n.

### User Story 3 â€” Migrate dá»¯ liá»‡u cÅ© an toÃ n (Priority: P1)

LÃ  ngÆ°á»i quáº£n lÃ½ dá»± Ã¡n, tÃ´i muá»‘n dá»¯ liá»‡u cÅ© Ä‘Æ°á»£c chuáº©n hÃ³a nhÆ°ng váº«n cÃ³ báº£n snapshot cá»§a cÃ¡c báº£n ghi bá»‹ áº£nh hÆ°á»Ÿng Ä‘á»ƒ cÃ³ thá»ƒ khÃ´i phá»¥c khi cáº§n.

**Why this priority**: TrÃ¡nh máº¥t dá»¯ liá»‡u vÃ  cháº·n viá»‡c triá»ƒn khai khi dá»¯ liá»‡u lá»‹ch sá»­ cÃ²n dÃ¹ng tÃªn trÆ°á»ng hoáº·c loáº¡i khÃ´ng thá»‘ng nháº¥t.

**Independent Test**: Cháº¡y migration trÃªn báº£n sao dá»± Ã¡n cÃ³ dá»¯ liá»‡u lá»‡ch mapping, kiá»ƒm tra snapshot trong `BAK`, sau Ä‘Ã³ khÃ´i phá»¥c má»™t báº£n ghi vÃ  Ä‘á»‘i chiáº¿u káº¿t quáº£.

**Acceptance Scenarios**:

1. **Given** báº£n ghi cÅ© cÃ³ `icon`, `type` vÃ  `objectType` khÃ´ng khá»›p, **When** chuáº©n hÃ³a Ä‘Æ°á»£c cháº¡y, **Then** báº£n ghi Ä‘Ã³ Ä‘Æ°á»£c snapshot cÃ³ phiÃªn báº£n trong `BAK` trÆ°á»›c khi dá»¯ liá»‡u hoáº¡t Ä‘á»™ng Ä‘Æ°á»£c ghi láº¡i theo bá»™ trÆ°á»ng chuáº©n.
2. **Given** báº£n ghi khÃ´ng bá»‹ áº£nh hÆ°á»Ÿng, **When** chuáº©n hÃ³a Ä‘Æ°á»£c cháº¡y, **Then** báº£n ghi Ä‘Ã³ khÃ´ng bá»‹ sao chÃ©p vÃ o snapshot vÃ  ná»™i dung khÃ´ng bá»‹ thay Ä‘á»•i ngoÃ i pháº¡m vi mapping.
3. **Given** snapshot há»£p lá»‡ trong `BAK`, **When** ngÆ°á»i dÃ¹ng yÃªu cáº§u khÃ´i phá»¥c, **Then** báº£n ghi cÃ³ thá»ƒ trá»Ÿ vá» tráº¡ng thÃ¡i trÆ°á»›c chuáº©n hÃ³a.

### User Story 4 â€” LÃ m viá»‡c an toÃ n vá»›i loáº¡i chÆ°a Ã¡nh xáº¡ (Priority: P2)

LÃ  ká»¹ sÆ° thiáº¿t káº¿, tÃ´i muá»‘n váº«n nhÃ¬n tháº¥y vÃ  chá»‰nh sá»­a Ä‘á»‘i tÆ°á»£ng chÆ°a cÃ³ mapping thay vÃ¬ máº¥t Ä‘á»‘i tÆ°á»£ng khá»i báº£n Ä‘á»“.

**Why this priority**: Dá»¯ liá»‡u thá»±c táº¿ cÃ³ thá»ƒ chá»©a loáº¡i má»›i hoáº·c dá»¯ liá»‡u lá»‹ch sá»­ chÆ°a Ä‘Æ°á»£c Ä‘Äƒng kÃ½.

**Independent Test**: Náº¡p má»™t Ä‘á»‘i tÆ°á»£ng cÃ³ loáº¡i/biá»ƒu tÆ°á»£ng khÃ´ng náº±m trong mapping vÃ  kiá»ƒm tra Canvas, cÃ¢y Ä‘á»‘i tÆ°á»£ng, Property Panel, tooltip vÃ  thao tÃ¡c lÆ°u.

**Acceptance Scenarios**:

1. **Given** Ä‘á»‘i tÆ°á»£ng chÆ°a Ã¡nh xáº¡, **When** má»Ÿ mÃ n hÃ¬nh DESIGN, **Then** Ä‘á»‘i tÆ°á»£ng dÃ¹ng icon máº·c Ä‘á»‹nh, váº«n cÃ³ nhÃ£n/loáº¡i hiá»‡n cÃ³ vÃ  hiá»ƒn thá»‹ cáº£nh bÃ¡o nháº¹ kÃ¨m tooltip.
2. **Given** Ä‘á»‘i tÆ°á»£ng chÆ°a Ã¡nh xáº¡ Ä‘ang Ä‘Æ°á»£c chá»n, **When** ngÆ°á»i dÃ¹ng chá»n má»™t biá»ƒu tÆ°á»£ng há»£p lá»‡ vÃ  lÆ°u, **Then** Ä‘á»‘i tÆ°á»£ng chuyá»ƒn sang mapping chuáº©n vÃ  cáº£nh bÃ¡o Ä‘Æ°á»£c loáº¡i bá».

## Edge Cases

- `icon`, `type` vÃ  `objectType` trá»‘ng, null hoáº·c chá»©a alias cÅ© pháº£i Ä‘Æ°á»£c chuáº©n hÃ³a vá» mapping há»£p lá»‡ hoáº·c fallback máº·c Ä‘á»‹nh.
- Hai báº£n ghi cÃ³ cÃ¹ng loáº¡i chuáº©n nhÆ°ng khÃ¡c mÃ u/kÃ­ch thÆ°á»›c váº«n dÃ¹ng cÃ¹ng biá»ƒu tÆ°á»£ng ngá»¯ nghÄ©a, khÃ´ng ghi Ä‘Ã¨ style riÃªng.
- Táº­p chá»n cÃ³ cáº£ point, line vÃ  polygon pháº£i giá»¯ quy táº¯c Æ°u tiÃªn hÃ¬nh há»c; khÃ´ng Ã¡p dá»¥ng icon point lÃªn line/polygon.
- Snapshot migration tháº¥t báº¡i pháº£i dá»«ng viá»‡c ghi láº¡i cÃ¡c báº£n ghi bá»‹ áº£nh hÆ°á»Ÿng vÃ  bÃ¡o lá»—i cÃ³ thá»ƒ hÃ nh Ä‘á»™ng; khÃ´ng Ä‘Æ°á»£c Ã¢m tháº§m xÃ³a dá»¯ liá»‡u cÅ©.
- Dá»¯ liá»‡u khÃ´ng bá»‹ áº£nh hÆ°á»Ÿng khÃ´ng Ä‘Æ°á»£c Ä‘Æ°a vÃ o `BAK` chá»‰ vÃ¬ cháº¡y migration.

## Requirements

### Functional Requirements

- **FR-001**: Há»‡ thá»‘ng MUST cÃ³ má»™t mapping chuáº©n liÃªn káº¿t `iconKey`, tÃªn hiá»ƒn thá»‹ vÃ  loáº¡i Ä‘á»‘i tÆ°á»£ng cho toÃ n bá»™ loáº¡i hiá»‡n Ä‘ang há»— trá»£, bao gá»“m pole, cabinet, info cabinet, light cabinet, splice, ODF, splitter, camera/CCTV, PTZ, SPEED, LPR, intersection, point vÃ  node.
- **FR-002**: Há»‡ thá»‘ng MUST dÃ¹ng cÃ¹ng mapping chuáº©n khi hiá»ƒn thá»‹ Ä‘á»‘i tÆ°á»£ng trÃªn Canvas, cÃ¢y Ä‘á»‘i tÆ°á»£ng vÃ  Property Panel.
- **FR-003**: Há»‡ thá»‘ng MUST hiá»ƒn thá»‹ trong bá»™ chá»n biá»ƒu tÆ°á»£ng cáº£ hÃ¬nh, tÃªn hiá»ƒn thá»‹ vÃ  loáº¡i Ä‘á»‘i tÆ°á»£ng chuáº©n tÆ°Æ¡ng á»©ng.
- **FR-004**: Há»‡ thá»‘ng MUST cáº­p nháº­t xem trÆ°á»›c tá»©c thá»i trÃªn ba khu vá»±c sau khi ngÆ°á»i dÃ¹ng chá»n biá»ƒu tÆ°á»£ng vÃ  MUST chá»‰ ghi dá»¯ liá»‡u chÃ­nh thá»©c sau thao tÃ¡c LÆ°u.
- **FR-005**: Khi lÆ°u thay Ä‘á»•i, há»‡ thá»‘ng MUST chuáº©n hÃ³a `icon`, `type` vÃ  `objectType` theo cÃ¹ng má»™t mapping vÃ  khÃ´ng ghi alias cÅ© vÃ o dá»¯ liá»‡u hoáº¡t Ä‘á»™ng.
- **FR-006**: Há»‡ thá»‘ng MUST há»£p nháº¥t cÃ¡c logic/Ä‘á»‹nh nghÄ©a trÃ¹ng dÃ¹ng Ä‘á»ƒ chuáº©n hÃ³a, chá»n vÃ  hiá»ƒn thá»‹ iconâ€“object type; má»—i quy táº¯c chuáº©n pháº£i cÃ³ má»™t nÆ¡i sá»Ÿ há»¯u rÃµ rÃ ng.
- **FR-007**: Há»‡ thá»‘ng MUST giá»¯ tÆ°Æ¡ng thÃ­ch vá»›i cÃ¡c caller hiá»‡n cÃ³ trong quÃ¡ trÃ¬nh chuyá»ƒn Ä‘á»•i, nhÆ°ng khÃ´ng táº¡o thÃªm báº£n sao mapping hoáº·c duy trÃ¬ alias cÅ© trong báº£n ghi Ä‘Ã£ chuáº©n hÃ³a.
- **FR-008**: TrÆ°á»›c khi chuáº©n hÃ³a, há»‡ thá»‘ng MUST táº¡o snapshot cÃ³ phiÃªn báº£n trong `BAK` chá»‰ cho cÃ¡c báº£n ghi bá»‹ áº£nh hÆ°á»Ÿng vÃ  MUST há»— trá»£ khÃ´i phá»¥c snapshot há»£p lá»‡.
- **FR-009**: Há»‡ thá»‘ng MUST dÃ¹ng biá»ƒu tÆ°á»£ng máº·c Ä‘á»‹nh, giá»¯ nhÃ£n/loáº¡i vÃ  hiá»ƒn thá»‹ cáº£nh bÃ¡o nháº¹ cho Ä‘á»‘i tÆ°á»£ng chÆ°a Ã¡nh xáº¡; thao tÃ¡c chá»‰nh sá»­a vÃ  lÆ°u váº«n pháº£i kháº£ dá»¥ng.
- **FR-010**: Há»‡ thá»‘ng MUST hiá»ƒn thá»‹ tráº¡ng thÃ¡i â€œKhÃ¡c nhauâ€ cho táº­p chá»n cÃ³ nhiá»u icon/type vÃ  MUST cho phÃ©p Ã¡p dá»¥ng má»™t biá»ƒu tÆ°á»£ng má»›i cho toÃ n bá»™ táº­p chá»n.
- **FR-011**: Há»‡ thá»‘ng MUST Æ°u tiÃªn biá»ƒu tÆ°á»£ng theo hÃ¬nh há»c cho line/polygon; Ä‘á»‘i vá»›i point vÃ  thiáº¿t bá»‹, há»‡ thá»‘ng MUST dÃ¹ng mapping iconâ€“type.
- **FR-012**: Há»‡ thá»‘ng MUST giá»¯ mÃ u vÃ  kÃ­ch thÆ°á»›c lÃ  thuá»™c tÃ­nh riÃªng cá»§a Ä‘á»‘i tÆ°á»£ng/khu vá»±c, khÃ´ng Ä‘á»ƒ mapping icon ghi Ä‘Ã¨ tÃ¹y chá»‰nh style.
- **FR-013**: NgÆ°á»i dÃ¹ng MUST cÃ³ thá»ƒ Ä‘á»•i tÃªn riÃªng cá»§a Ä‘á»‘i tÆ°á»£ng, nhÆ°ng khÃ´ng Ä‘Æ°á»£c sá»­a trá»±c tiáº¿p tÃªn/loáº¡i chuáº©n do mapping quáº£n lÃ½.

### Non-Functional Requirements

- **NFR-001**: Sau thao tÃ¡c chá»n biá»ƒu tÆ°á»£ng, ngÆ°á»i dÃ¹ng MUST tháº¥y thay Ä‘á»•i á»Ÿ cáº£ ba khu vá»±c trong tá»‘i Ä‘a 1 giÃ¢y mÃ  khÃ´ng cáº§n táº£i láº¡i mÃ n hÃ¬nh.
- **NFR-002**: Vá»›i má»i loáº¡i trong ma tráº­n há»— trá»£, ba khu vá»±c MUST cho cÃ¹ng má»™t káº¿t quáº£ ngá»¯ nghÄ©a khi Ä‘á»‘i chiáº¿u `iconKey` vÃ  loáº¡i chuáº©n.
- **NFR-003**: Viá»‡c dá»n code MUST khÃ´ng lÃ m máº¥t Ä‘á»‘i tÆ°á»£ng, tá»a Ä‘á»™, hÃ¬nh há»c, mÃ u hoáº·c kÃ­ch thÆ°á»›c khÃ´ng liÃªn quan Ä‘áº¿n mapping.
- **NFR-004**: Snapshot trong `BAK` MUST chá»©a Ä‘á»§ dá»¯ liá»‡u Ä‘á»ƒ khÃ´i phá»¥c tá»«ng báº£n ghi bá»‹ áº£nh hÆ°á»Ÿng vÃ  cÃ³ Ä‘á»‹nh danh phiÃªn báº£n/nguá»“n táº¡o.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% loáº¡i Ä‘á»‘i tÆ°á»£ng trong ma tráº­n há»— trá»£ hiá»ƒn thá»‹ cÃ¹ng biá»ƒu tÆ°á»£ng ngá»¯ nghÄ©a, tÃªn vÃ  loáº¡i chuáº©n khi Ä‘á»‘i chiáº¿u Canvas, cÃ¢y Ä‘á»‘i tÆ°á»£ng vÃ  Property Panel.
- **SC-002**: NgÆ°á»i dÃ¹ng nhÃ¬n tháº¥y xem trÆ°á»›c thay Ä‘á»•i á»Ÿ cáº£ ba khu vá»±c trong tá»‘i Ä‘a 1 giÃ¢y sau khi chá»n biá»ƒu tÆ°á»£ng, khÃ´ng cáº§n táº£i láº¡i mÃ n hÃ¬nh.
- **SC-003**: 100% báº£n ghi bá»‹ áº£nh hÆ°á»Ÿng bá»Ÿi migration cÃ³ snapshot trong `BAK` trÆ°á»›c khi ghi dá»¯ liá»‡u chuáº©n; Ã­t nháº¥t má»™t báº£n ghi trong má»—i láº§n migration cÃ³ thá»ƒ khÃ´i phá»¥c thÃ nh cÃ´ng trong kiá»ƒm thá»­.
- **SC-004**: 100% Ä‘á»‘i tÆ°á»£ng chÆ°a Ã¡nh xáº¡ váº«n nhÃ¬n tháº¥y, giá»¯ Ä‘Æ°á»£c nhÃ£n/loáº¡i vÃ  cÃ³ thá»ƒ chuyá»ƒn sang mapping há»£p lá»‡ mÃ  khÃ´ng cáº§n chá»‰nh sá»­a thá»§ cÃ´ng dá»¯ liá»‡u thÃ´.
- **SC-005**: 100% Ä‘á»‘i tÆ°á»£ng trong má»™t táº­p chá»n nháº­n Ä‘Ãºng icon/type má»›i sau má»™t thao tÃ¡c Ã¡p dá»¥ng vÃ  LÆ°u; mÃ u/kÃ­ch thÆ°á»›c riÃªng khÃ´ng bá»‹ thay Ä‘á»•i ngoÃ i chá»§ Ä‘Ã­ch.
- **SC-006**: Ma tráº­n kiá»ƒm tra code khÃ´ng cÃ²n nhiá»u nguá»“n Ä‘á»‹nh nghÄ©a cho cÃ¹ng má»™t quy táº¯c mapping chuáº©n.

## Key Entities

- **Icon mapping**: Quy táº¯c chuáº©n liÃªn káº¿t `iconKey`, hÃ¬nh biá»ƒu tÆ°á»£ng, tÃªn hiá»ƒn thá»‹ vÃ  loáº¡i Ä‘á»‘i tÆ°á»£ng.
- **Äá»‘i tÆ°á»£ng thiáº¿t káº¿**: Báº£n ghi cÃ³ hÃ¬nh há»c, nhÃ£n riÃªng, icon/type/objectType vÃ  style hiá»ƒn thá»‹.
- **Táº­p lá»±a chá»n**: Má»™t hoáº·c nhiá»u Ä‘á»‘i tÆ°á»£ng Ä‘ang Ä‘Æ°á»£c ngÆ°á»i dÃ¹ng chá»‰nh sá»­a trong DESIGN.
- **Snapshot migration**: Báº£n sao cÃ³ phiÃªn báº£n cá»§a cÃ¡c báº£n ghi bá»‹ áº£nh hÆ°á»Ÿng, lÆ°u trong `BAK` trÆ°á»›c khi chuáº©n hÃ³a.
- **Má»¥c chÆ°a Ã¡nh xáº¡**: Äá»‘i tÆ°á»£ng khÃ´ng tÃ¬m Ä‘Æ°á»£c mapping chuáº©n, Ä‘Æ°á»£c hiá»ƒn thá»‹ báº±ng fallback vÃ  cáº£nh bÃ¡o.

## Acceptance Criteria

- [ ] **AC-001**: Ma tráº­n mapping cá»§a toÃ n bá»™ loáº¡i hiá»‡n cÃ³ cÃ³ Ä‘Ãºng má»™t káº¿t quáº£ chuáº©n cho `iconKey`, tÃªn hiá»ƒn thá»‹ vÃ  loáº¡i Ä‘á»‘i tÆ°á»£ng.
- [ ] **AC-002**: CÃ¹ng má»™t Ä‘á»‘i tÆ°á»£ng hiá»ƒn thá»‹ cÃ¹ng biá»ƒu tÆ°á»£ng ngá»¯ nghÄ©a á»Ÿ Canvas, cÃ¢y Ä‘á»‘i tÆ°á»£ng vÃ  Property Panel.
- [ ] **AC-003**: Bá»™ chá»n biá»ƒu tÆ°á»£ng hiá»ƒn thá»‹ hÃ¬nh, tÃªn vÃ  loáº¡i chuáº©n; chá»n biá»ƒu tÆ°á»£ng cáº­p nháº­t xem trÆ°á»›c trong tá»‘i Ä‘a 1 giÃ¢y.
- [ ] **AC-004**: Sau LÆ°u, `icon`, `type` vÃ  `objectType` khá»›p mapping chuáº©n; sau má»Ÿ láº¡i, káº¿t quáº£ khÃ´ng Ä‘á»•i.
- [ ] **AC-005**: Nhiá»u Ä‘á»‘i tÆ°á»£ng khÃ¡c nhau hiá»ƒn thá»‹ â€œKhÃ¡c nhauâ€; Ã¡p dá»¥ng biá»ƒu tÆ°á»£ng má»›i cáº­p nháº­t Ä‘Ãºng toÃ n bá»™ táº­p chá»n.
- [ ] **AC-006**: Line/polygon giá»¯ biá»ƒu tÆ°á»£ng theo hÃ¬nh há»c; point/thiáº¿t bá»‹ dÃ¹ng iconâ€“type mapping.
- [ ] **AC-007**: Dá»¯ liá»‡u cÅ© bá»‹ áº£nh hÆ°á»Ÿng Ä‘Æ°á»£c snapshot vÃ o `BAK` trÆ°á»›c migration; báº£n ghi khÃ´ng bá»‹ áº£nh hÆ°á»Ÿng khÃ´ng xuáº¥t hiá»‡n trong snapshot.
- [ ] **AC-008**: Má»™t snapshot há»£p lá»‡ cÃ³ thá»ƒ khÃ´i phá»¥c Ã­t nháº¥t má»™t báº£n ghi vá» tráº¡ng thÃ¡i trÆ°á»›c migration.
- [ ] **AC-009**: Äá»‘i tÆ°á»£ng chÆ°a Ã¡nh xáº¡ váº«n hiá»ƒn thá»‹, cÃ³ icon máº·c Ä‘á»‹nh, nhÃ£n/loáº¡i vÃ  cáº£nh bÃ¡o tooltip; cÃ³ thá»ƒ chuyá»ƒn sang mapping há»£p lá»‡.
- [ ] **AC-010**: Ma tráº­n kiá»ƒm thá»­ khÃ´ng phÃ¡t hiá»‡n hai nguá»“n mapping chuáº©n Ä‘á»™c láº­p cho cÃ¹ng má»™t loáº¡i.

## Scenarios

### Scenario 1: Äá»•i biá»ƒu tÆ°á»£ng thiáº¿t bá»‹

**Given** ngÆ°á»i dÃ¹ng chá»n má»™t Ä‘á»‘i tÆ°á»£ng point trong Canvas vÃ  má»Ÿ Property Panel  
**When** chá»n `Camera LPR`  
**Then** Canvas, cÃ¢y Ä‘á»‘i tÆ°á»£ng vÃ  Property Panel láº­p tá»©c hiá»ƒn thá»‹ cÃ¹ng biá»ƒu tÆ°á»£ng LPR, tÃªn LPR vÃ  loáº¡i chuáº©n; sau LÆ°u dá»¯ liá»‡u Ä‘Æ°á»£c ghi theo mapping LPR.

### Scenario 2: Dá»¯ liá»‡u cÅ© khÃ´ng khá»›p

**Given** má»™t báº£n ghi cÃ³ icon cÅ© vÃ  `type` khÃ¡c vá»›i icon  
**When** há»‡ thá»‘ng chuáº©n hÃ³a dá»¯ liá»‡u  
**Then** snapshot cá»§a báº£n ghi Ä‘Æ°á»£c táº¡o trong `BAK` trÆ°á»›c, sau Ä‘Ã³ dá»¯ liá»‡u hoáº¡t Ä‘á»™ng Ä‘Æ°á»£c ghi theo bá»™ trÆ°á»ng chuáº©n vÃ  khÃ´ng cÃ²n alias cÅ©.

### Scenario 3: Äá»‘i tÆ°á»£ng chÆ°a Ã¡nh xáº¡

**Given** má»™t báº£n ghi cÃ³ loáº¡i khÃ´ng náº±m trong mapping  
**When** ngÆ°á»i dÃ¹ng má»Ÿ mÃ n hÃ¬nh DESIGN  
**Then** Ä‘á»‘i tÆ°á»£ng dÃ¹ng icon máº·c Ä‘á»‹nh, váº«n giá»¯ nhÃ£n/loáº¡i, cÃ³ cáº£nh bÃ¡o tooltip vÃ  cÃ³ thá»ƒ Ä‘Æ°á»£c Ä‘á»•i sang icon há»£p lá»‡.

### Scenario 4: Nhiá»u lá»±a chá»n

**Given** ngÆ°á»i dÃ¹ng chá»n nhiá»u Ä‘á»‘i tÆ°á»£ng cÃ³ icon khÃ¡c nhau  
**When** ngÆ°á»i dÃ¹ng chá»n má»™t icon má»›i vÃ  báº¥m LÆ°u  
**Then** Property Panel hiá»ƒn thá»‹ tráº¡ng thÃ¡i â€œKhÃ¡c nhauâ€ trÆ°á»›c thao tÃ¡c, toÃ n bá»™ táº­p chá»n nháº­n icon/type má»›i sau thao tÃ¡c vÃ  cÃ¡c style riÃªng khÃ´ng bá»‹ ghi Ä‘Ã¨ ngoÃ i pháº¡m vi yÃªu cáº§u.

## Technical Notes

- Cáº§n kiá»ƒm tra cÃ¡c Ä‘Æ°á»ng dáº«n hiá»‡n cÃ³ liÃªn quan Ä‘áº¿n manifest icon, chuáº©n hÃ³a icon key, hiá»ƒn thá»‹ feature, bá»™ chá»n icon, persistence vÃ  renderer áº£nh trÆ°á»›c khi láº­p task.
- CÃ¡c file Ä‘ang cÃ³ thay Ä‘á»•i chÆ°a commit thuá»™c vá» ngÆ°á»i dÃ¹ng; khi triá»ƒn khai pháº£i giá»¯ nguyÃªn thay Ä‘á»•i ngoÃ i pháº¡m vi vÃ  trÃ¡nh ghi Ä‘Ã¨ spec `icon-library-2d-3d` hiá»‡n cÃ³.
- Ma tráº­n kiá»ƒm thá»­ nÃªn bao phá»§ cáº£ Canvas, cÃ¢y Ä‘á»‘i tÆ°á»£ng, Property Panel, dá»¯ liá»‡u hoáº¡t Ä‘á»™ng vÃ  snapshot `BAK`.

## Assumptions

- NgÆ°á»i dÃ¹ng cÃ³ quyá»n xem vÃ  chá»‰nh sá»­a cÃ¡c Ä‘á»‘i tÆ°á»£ng trong mÃ n hÃ¬nh DESIGN.
- Thao tÃ¡c LÆ°u hiá»‡n táº¡i lÃ  Ä‘iá»ƒm ghi dá»¯ liá»‡u chÃ­nh thá»©c vÃ  Ä‘Æ°á»£c tÃ¡i sá»­ dá»¥ng.
- `BAK` lÃ  vÃ¹ng lÆ°u trá»¯ ná»™i bá»™ cá»§a dá»± Ã¡n, khÃ´ng pháº£i nÆ¡i dÃ¹ng cho dá»¯ liá»‡u hoáº¡t Ä‘á»™ng.
- CÃ¡c loáº¡i Ä‘á»‘i tÆ°á»£ng liá»‡t kÃª trong FR-001 lÃ  táº­p hiá»‡n cÃ³; viá»‡c bá»• sung loáº¡i má»›i lÃ  work item riÃªng.
- KhÃ´ng yÃªu cáº§u Ä‘á»“ng bá»™ vá»›i mÃ n hÃ¬nh 3D trong phiÃªn báº£n nÃ y.

## Task Links

- @task-4czpc4 [design-icon-type-mapping-01] Chuáº©n hÃ³a mapping icon vÃ  object type â€” todo
- @task-cu9oau [design-icon-type-mapping-02] Äá»“ng bá»™ hiá»ƒn thá»‹ trÃªn DESIGN â€” todo
- @task-zfg8zs [design-icon-type-mapping-03] Migration dá»¯ liá»‡u vÃ  fallback icon â€” todo

## Open Questions

KhÃ´ng cÃ²n cÃ¢u há»i má»Ÿ; cÃ¡c quyáº¿t Ä‘á»‹nh D1â€“D15 Ä‘Ã£ Ä‘Æ°á»£c ngÆ°á»i dÃ¹ng xÃ¡c nháº­n.

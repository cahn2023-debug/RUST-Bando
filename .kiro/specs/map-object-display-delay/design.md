# Map Object Display Delay Bugfix Design

## Overview

Trên **large project** (viewport-first mode), các đối tượng bản đồ — Feature (điểm/đường/vùng), FOV (trường nhìn camera), và DORI (overlay vùng phủ sóng camera) — bị delay khoảng 10 giây sau khi được tạo hoặc cập nhật trước khi xuất hiện trên bản đồ.

**Chiến lược fix**: Khi `applyPatchToState()` xử lý `FeatureCreated` hoặc `FeatureUpdated` event trên large project, đồng thời tăng `viewportTick` (hoặc gọi trực tiếp `queryVisibleFeaturesV2`) để `visibleFeatures` được cập nhật ngay lập tức — không cần chờ sự kiện `moveend` từ bản đồ.

---

## Glossary

- **Bug_Condition (C)**: Điều kiện kích hoạt bug — khi `FeatureCreated` hoặc `FeatureUpdated` event được xử lý trên large project nhưng `viewportTick` không tăng, khiến `visibleFeatures` không được cập nhật
- **Property (P)**: Hành vi mong đợi — sau khi xử lý event tạo/cập nhật feature có tọa độ hợp lệ trong viewport, feature đó phải xuất hiện trong `visibleFeatures` trong vòng ≤100ms (throttle bình thường)
- **Preservation**: Các hành vi hiện tại phải giữ nguyên sau fix — bao gồm: `moveend` tiếp tục tăng `viewportTick`, non-large project tiếp tục dùng `rawFeatures`, feature ngoài viewport vẫn không hiển thị, throttle 100ms vẫn hoạt động đúng
- **large project**: Project ở chế độ viewport-first, dùng `visibleFeatures` thay vì `rawFeatures` để render
- **viewportTick**: Counter tăng mỗi khi `moveend` xảy ra; dùng để trigger `queryVisibleFeaturesV2`
- **viewportRevision**: Counter tăng khi state thay đổi (bao gồm feature create/update), nhưng **không** trigger viewport query
- **visibleFeatures**: Tập con của `state.features` chỉ chứa các feature trong viewport hiện tại, được tính bởi `queryVisibleFeaturesV2`
- **rawFeatures**: Toàn bộ features trong `state.features`, dùng trên non-large project
- **queryVisibleFeaturesV2**: Hàm tính toán `visibleFeatures` từ `state.features` theo viewport hiện tại — chỉ được gọi khi `viewportTick` thay đổi
- **applyPatchToState()**: Hàm xử lý các event từ backend (FeatureCreated, FeatureUpdated, v.v.) và áp dụng lên state
- **throttledSetState()**: Hàm áp dụng throttle 100ms trước khi set state mới
- **renderFeatureValues**: Hàm render các feature trên bản đồ, đọc từ `visibleFeatures` trên large project
- **FOVLayer**: Component hiển thị trường nhìn camera, đọc từ `visibleFeatures` trên large project
- **DORIOverlay**: Component hiển thị vùng phủ sóng camera, đọc từ `visibleFeatures` trên large project

---

## Bug Details

### Bug Condition

Bug xảy ra khi `applyPatchToState()` xử lý `FeatureCreated` hoặc `FeatureUpdated` event trên large project. Hệ thống chỉ tăng `viewportRevision` mà không tăng `viewportTick`, do đó `queryVisibleFeaturesV2` không được trigger, và `visibleFeatures` không được cập nhật để chứa feature mới/đã sửa. Ba consumer của `visibleFeatures` — `renderFeatureValues`, `FOVLayer`, `DORIOverlay` — đều không thấy feature mới cho đến khi user di chuyển bản đồ (~10 giây sau, hoặc cho đến khi có sự kiện `moveend`).

**Formal Specification:**

```
FUNCTION isBugCondition(event, projectConfig)
  INPUT: event (FeatureCreated | FeatureUpdated), projectConfig
  OUTPUT: boolean

  IF projectConfig.isLargeProject = FALSE
    RETURN FALSE  -- non-large project không bị ảnh hưởng

  IF event.type NOT IN ['FeatureCreated', 'FeatureUpdated']
    RETURN FALSE

  -- Bug xảy ra khi event được xử lý nhưng viewportTick không tăng
  RETURN viewportTick.incrementedAfterEvent = FALSE
         AND visibleFeatures.updatedAfterEvent = FALSE
END FUNCTION
```

### Examples

- **Tạo Feature mới (điểm)**: User tạo một điểm camera tại tọa độ (10.762622, 106.660172) — feature xuất hiện trong `state.features` ngay lập tức nhưng không có trong `visibleFeatures`. `renderFeatureValues` không render điểm đó. Sau ~10 giây user pan bản đồ → `moveend` → `viewportTick` tăng → `queryVisibleFeaturesV2` chạy → feature xuất hiện.
- **Cập nhật tọa độ Feature**: User di chuyển một Feature từ vị trí A sang vị trí B — bản đồ vẫn hiển thị Feature ở vị trí A (từ `visibleFeatures` cũ) cho đến khi `moveend` xảy ra.
- **Tạo Camera Feature → FOV delay**: User tạo camera mới → `FOVLayer` không thấy camera trong `visibleFeatures` → không vẽ FOV → user phải pan bản đồ để FOV xuất hiện.
- **Tạo Camera Feature → DORI delay**: User chọn camera vừa tạo → `DORIOverlay` lookup feature trong `visibleFeatures` → không tìm thấy → không render DORI overlay.
- **Edge case — Feature ngoài viewport**: User tạo feature tại tọa độ ngoài viewport hiện tại → sau fix, feature vẫn KHÔNG xuất hiện trên bản đồ (đây là hành vi đúng, cần preserve).

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Tất cả các tương tác trên non-large project (sử dụng `rawFeatures`) phải tiếp tục hoạt động y chang hiện tại
- Sự kiện `moveend` trên bản đồ phải tiếp tục tăng `viewportTick` và trigger `queryVisibleFeaturesV2` như hiện tại
- Feature được tạo/cập nhật nằm ngoài viewport hiện tại phải KHÔNG hiển thị trên bản đồ (viewport-first mode giữ nguyên)
- `throttledSetState()` vẫn áp dụng throttle 100ms; fix không được bypass throttle
- `FOVLayer` và `DORIOverlay` trên non-large project tiếp tục đọc từ `rawFeatures`
- DORI ranges tiếp tục được tính toán đúng từ camera specs cho selected features
- `queryVisibleFeaturesV2` trên large project tiếp tục được gọi khi viewport thay đổi do pan/zoom

**Scope:**

Tất cả inputs **không** phải là `FeatureCreated`/`FeatureUpdated` event trên large project phải hoàn toàn không bị ảnh hưởng bởi fix này. Điều này bao gồm:

- Tất cả event types khác (FeatureDeleted, ProjectUpdated, v.v.)
- Mọi operation trên non-large project
- Mouse interaction, touch input, keyboard input với bản đồ
- Viewport pan/zoom behavior

---

## Hypothesized Root Cause

Dựa trên phân tích bug description, nguyên nhân cốt lõi là:

1. **viewportTick không được tăng khi feature state thay đổi**: `applyPatchToState()` tăng `viewportRevision` khi xử lý `FeatureCreated`/`FeatureUpdated`, nhưng `queryVisibleFeaturesV2` chỉ được subscribe vào `viewportTick`. Việc tách biệt hai counter này tạo ra khoảng trống: state thay đổi nhưng viewport query không được re-trigger.

2. **queryVisibleFeaturesV2 không được gọi sau feature mutation**: Không có logic nào trong `applyPatchToState()` gọi hoặc schedule `queryVisibleFeaturesV2` sau khi features array thay đổi trên large project.

3. **visibleFeatures không được cập nhật incremental**: Không có cơ chế nào để trực tiếp inject feature mới vào `visibleFeatures` mà không cần chạy lại toàn bộ `queryVisibleFeaturesV2`. Nếu có, có thể dùng cách inject trực tiếp (nhanh hơn).

4. **Dependency chain bị đứt**: `renderFeatureValues` → đọc `visibleFeatures` → phụ thuộc `queryVisibleFeaturesV2` → phụ thuộc `viewportTick` → chỉ tăng khi `moveend`. Khi feature được tạo, chain này không được trigger.

---

## Correctness Properties

Property 1: Bug Condition — Feature Xuất Hiện Trong visibleFeatures Ngay Sau Khi Tạo/Cập Nhật

_For any_ `FeatureCreated` hoặc `FeatureUpdated` event được xử lý trên large project, trong đó feature có tọa độ hợp lệ nằm trong viewport hiện tại, hàm `applyPatchToState()` sau khi được fix SHALL đảm bảo feature đó có mặt trong `visibleFeatures` trong vòng thời gian throttle bình thường (≤100ms) — mà không cần user tương tác với bản đồ.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation — Non-Large Project Không Bị Ảnh Hưởng

_For any_ feature operation (tạo, cập nhật, xóa) trên non-large project, hàm `applyPatchToState()` sau khi được fix SHALL produce exactly the same behavior as trước fix — tiếp tục sử dụng `rawFeatures` làm nguồn dữ liệu cho `renderFeatureValues`, `FOVLayer`, và `DORIOverlay`.

**Validates: Requirements 3.1, 3.6, 3.8**

Property 3: Preservation — Viewport Behavior Giữ Nguyên Trên Large Project

_For any_ input mà `isBugCondition` returns false trên large project (bao gồm: `moveend` events, feature operations ngoài viewport, các event types khác), hàm `applyPatchToState()` và viewport pipeline sau khi được fix SHALL produce the same result as trước fix — `viewportTick` vẫn tăng khi `moveend`, feature ngoài viewport vẫn không xuất hiện trong `visibleFeatures`.

**Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.7**

---

## Fix Implementation

### Changes Required

Giả sử root cause analysis ở trên là đúng:

**File**: `[file chứa applyPatchToState()]` (cần xác nhận path trong codebase thực tế)

**Function**: `applyPatchToState()`

**Specific Changes**:

1. **Tăng viewportTick sau FeatureCreated/FeatureUpdated trên large project**:
   - Trong block xử lý `FeatureCreated` và `FeatureUpdated`, sau khi update `state.features`, kiểm tra `isLargeProject`
   - Nếu là large project: tăng `viewportTick` để trigger `queryVisibleFeaturesV2` subscription
   - Đây là cách fix tối thiểu, ít rủi ro regression nhất

2. **Hoặc: Gọi trực tiếp queryVisibleFeaturesV2 sau feature mutation** (alternative):
   - Nếu `viewportTick` increment không thể gọi trực tiếp, schedule `queryVisibleFeaturesV2` bất đồng bộ sau khi state được set
   - Đảm bảo không bypass throttle của `throttledSetState()`

3. **Guard condition isLargeProject**:
   - Wrap logic mới trong `if (isLargeProject)` để đảm bảo non-large project path không bị ảnh hưởng
   - Non-large project đọc `rawFeatures` trực tiếp — không cần trigger viewport query

4. **Xử lý cả FeatureUpdated**:
   - Áp dụng fix tương tự cho `FeatureUpdated` event (requirement 2.2)
   - Logic giống `FeatureCreated` — check large project → tăng viewportTick

5. **Không thay đổi consumer components**:
   - `renderFeatureValues`, `FOVLayer`, `DORIOverlay` KHÔNG cần sửa
   - Fix tập trung ở tầng state management để `visibleFeatures` được populate đúng

---

## Testing Strategy

### Validation Approach

Chiến lược test theo hai giai đoạn: (1) viết test trên code **chưa fix** để surface counterexample và xác nhận root cause, (2) verify fix hoạt động đúng và không gây regression.

---

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples chứng minh bug trên unfixed code. Xác nhận hoặc bác bỏ root cause analysis. Nếu bác bỏ → cần re-hypothesize.

**Test Plan**: Simulate `FeatureCreated` event trên large project mock state, sau đó assert rằng feature xuất hiện trong `visibleFeatures`. Chạy trên **unfixed code** — các test này PHẢI fail để chứng minh bug tồn tại.

**Test Cases**:

1. **Feature Create In Viewport Test**: Simulate `FeatureCreated` event với feature có tọa độ trong viewport — assert feature có trong `visibleFeatures` sau khi xử lý (sẽ fail trên unfixed code)
2. **Feature Update In Viewport Test**: Simulate `FeatureUpdated` event — assert `visibleFeatures` phản ánh tọa độ mới (sẽ fail trên unfixed code)
3. **Camera Feature FOV Test**: Simulate tạo camera feature — assert feature available cho `FOVLayer` thông qua `visibleFeatures` (sẽ fail trên unfixed code)
4. **viewportTick Not Incremented Test**: Assert rằng sau khi xử lý `FeatureCreated`, `viewportTick` vẫn giữ nguyên giá trị cũ (sẽ pass trên unfixed code, xác nhận root cause)

**Expected Counterexamples**:

- Feature tồn tại trong `state.features` nhưng không có trong `visibleFeatures` sau `applyPatchToState()`
- `viewportTick` không thay đổi sau `FeatureCreated` event
- Possible causes: `applyPatchToState()` không tăng `viewportTick`, không gọi `queryVisibleFeaturesV2`

---

### Fix Checking

**Goal**: Verify rằng với mọi input mà bug condition holds, fixed function produce expected behavior.

**Pseudocode:**

```
FOR ALL event WHERE event.type IN ['FeatureCreated', 'FeatureUpdated']
                AND projectConfig.isLargeProject = TRUE
                AND feature.coordinates IN currentViewport DO
  state_after := applyPatchToState_fixed(state, event)
  ASSERT feature.id IN state_after.visibleFeatures
  ASSERT state_after.viewportTick > state_before.viewportTick
         OR queryVisibleFeaturesV2_wasCalled = TRUE
END FOR
```

---

### Preservation Checking

**Goal**: Verify rằng với mọi input mà bug condition does NOT hold, fixed function produce same result as original.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  result_original := applyPatchToState_original(state, input)
  result_fixed    := applyPatchToState_fixed(state, input)
  ASSERT result_original.visibleFeatures = result_fixed.visibleFeatures
  ASSERT result_original.viewportTick    = result_fixed.viewportTick
  ASSERT result_original.rawFeatures     = result_fixed.rawFeatures
END FOR
```

**Testing Approach**: Property-based testing được khuyến nghị cho preservation checking vì:

- Tự động sinh nhiều test cases từ input domain (event types, project configs, tọa độ)
- Phát hiện edge cases mà manual test có thể bỏ sót
- Đảm bảo hành vi không đổi trên mọi non-buggy input

**Test Plan**: Quan sát behavior trên unfixed code trước cho non-buggy inputs, sau đó viết property-based test capture behavior đó.

**Test Cases**:

1. **Non-Large Project Preservation**: Verify toàn bộ feature operations trên non-large project không thay đổi — `rawFeatures` vẫn là nguồn dữ liệu, không có `viewportTick` increment không mong muốn
2. **moveend Preservation**: Verify `moveend` event vẫn tăng `viewportTick` đúng như trước — không bị ảnh hưởng bởi logic mới
3. **Out-of-Viewport Feature Preservation**: Verify feature tạo ngoài viewport vẫn không xuất hiện trong `visibleFeatures` sau fix
4. **Throttle Preservation**: Verify `throttledSetState()` vẫn áp dụng đúng throttle 100ms sau fix

---

### Unit Tests

- Test `applyPatchToState()` với `FeatureCreated` event trên large project mock → assert `viewportTick` tăng
- Test `applyPatchToState()` với `FeatureUpdated` event trên large project mock → assert `viewportTick` tăng
- Test `applyPatchToState()` với `FeatureCreated` event trên non-large project → assert `viewportTick` KHÔNG tăng
- Test `applyPatchToState()` với `FeatureCreated` ngoài viewport trên large project → assert feature KHÔNG có trong `visibleFeatures`
- Test `applyPatchToState()` với event types khác → assert không có side effect mới

### Property-Based Tests

- Sinh ngẫu nhiên `FeatureCreated` events với tọa độ trong viewport trên large project → assert feature luôn xuất hiện trong `visibleFeatures` sau fix (Property 1)
- Sinh ngẫu nhiên tất cả event types trên non-large project → assert `rawFeatures` path luôn được dùng, không có thay đổi không mong muốn (Property 2)
- Sinh ngẫu nhiên non-buggy inputs → assert `applyPatchToState_fixed` produce identical result với `applyPatchToState_original` (Property 3)
- Sinh ngẫu nhiên tọa độ ngoài viewport cho `FeatureCreated` trên large project → assert `visibleFeatures` không chứa feature đó (Property 3 — viewport boundary)

### Integration Tests

- Test full flow: tạo Feature mới trên large project → verify Feature xuất hiện ngay trên bản đồ mà không cần pan
- Test full flow: cập nhật tọa độ Feature trên large project → verify bản đồ hiển thị vị trí mới ngay lập tức
- Test camera creation flow: tạo camera feature → verify FOVLayer và DORIOverlay nhận feature ngay lập tức
- Test context switching: sau fix, pan bản đồ → verify `moveend` flow vẫn hoạt động bình thường
- Test non-large project: tạo/cập nhật feature → verify behavior không thay đổi (rawFeatures path)

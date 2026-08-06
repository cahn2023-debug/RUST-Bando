# Bugfix Requirements Document

## Introduction

Trên **large project** (viewport-first mode), các đối tượng bản đồ bao gồm Feature (điểm/đường/vùng), FOV (trường nhìn camera), và DORI (overlay vùng phủ sóng camera) bị delay khoảng 10 giây sau khi được tạo hoặc cập nhật mới hiển thị trên bản đồ.

Nguyên nhân cốt lõi: `renderFeatureValues`, `FOVLayer`, và `DORIOverlay` trên large project đều đọc từ `visibleFeatures` thay vì `rawFeatures`. `visibleFeatures` chỉ được cập nhật khi `queryVisibleFeaturesV2` được gọi, mà hàm này chỉ được trigger khi `viewportTick` tăng — điều đó chỉ xảy ra khi có sự kiện `moveend` trên bản đồ. Khi feature mới được tạo, `viewportRevision` tăng nhưng `viewportTick` không tăng, dẫn đến feature tồn tại trong `state.features` nhưng không xuất hiện trong `visibleFeatures`, và do đó không được render cho đến khi user di chuyển bản đồ (~10 giây sau).

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN user tạo một Feature mới (điểm/đường/vùng) trên large project THEN hệ thống không hiển thị Feature đó trên bản đồ ngay lập tức mà phải đợi đến khi user di chuyển/zoom bản đồ (~10 giây)

1.2 WHEN user cập nhật tọa độ hoặc thuộc tính của một Feature hiện có trên large project THEN hệ thống tiếp tục hiển thị vị trí/hình dạng cũ của Feature trên bản đồ cho đến khi có sự kiện `moveend`

1.3 WHEN user tạo một Feature loại camera mới trên large project THEN hệ thống không hiển thị FOV (trường nhìn) của camera đó ngay sau khi tạo mà delay đến khi bản đồ di chuyển

1.4 WHEN user chọn một Feature camera vừa được tạo trên large project THEN hệ thống không hiển thị DORI overlay (vùng phủ sóng) cho camera đó vì feature chưa có mặt trong `visibleFeatures`

1.5 WHEN `FeatureCreated` event được xử lý trong `applyPatchToState()` THEN hệ thống tăng `viewportRevision` nhưng không tăng `viewportTick`, do đó `queryVisibleFeaturesV2` không được gọi lại

### Expected Behavior (Correct)

2.1 WHEN user tạo một Feature mới (điểm/đường/vùng) trên large project THEN hệ thống SHALL hiển thị Feature đó trên bản đồ ngay lập tức (trong vòng thời gian throttle bình thường ≤100ms) mà không cần user di chuyển bản đồ

2.2 WHEN user cập nhật tọa độ hoặc thuộc tính của một Feature hiện có trên large project THEN hệ thống SHALL phản ánh thay đổi đó trên bản đồ ngay lập tức

2.3 WHEN user tạo một Feature loại camera mới trên large project THEN hệ thống SHALL hiển thị FOV của camera đó ngay sau khi tạo, không cần chờ sự kiện `moveend`

2.4 WHEN user chọn một Feature camera vừa được tạo trên large project THEN hệ thống SHALL hiển thị DORI overlay cho camera đó ngay lập tức vì feature đã có mặt trong `visibleFeatures` hoặc được tra cứu trực tiếp từ `state.features`

2.5 WHEN `FeatureCreated` event được xử lý và feature có tọa độ hợp lệ nằm trong viewport hiện tại THEN hệ thống SHALL trigger `queryVisibleFeaturesV2` để cập nhật `visibleFeatures` ngay lập tức, hoặc trực tiếp đưa feature mới vào `visibleFeatures` mà không cần query

### Unchanged Behavior (Regression Prevention)

3.1 WHEN user tạo Feature trên non-large project THEN hệ thống SHALL CONTINUE TO hiển thị Feature ngay lập tức từ `rawFeatures` như hiện tại

3.2 WHEN user di chuyển hoặc zoom bản đồ trên large project THEN hệ thống SHALL CONTINUE TO gọi `queryVisibleFeaturesV2` và cập nhật `visibleFeatures` dựa trên viewport mới

3.3 WHEN user tạo Feature ở ngoài viewport hiện tại trên large project THEN hệ thống SHALL CONTINUE TO không hiển thị Feature đó (vì không nằm trong vùng nhìn)

3.4 WHEN `throttledSetState()` nhận state mới từ backend THEN hệ thống SHALL CONTINUE TO áp dụng throttle 100ms như bình thường

3.5 WHEN `moveend` event xảy ra trên bản đồ THEN hệ thống SHALL CONTINUE TO tăng `viewportTick` và trigger viewport query như hiện tại

3.6 WHEN user cập nhật Feature trên non-large project THEN hệ thống SHALL CONTINUE TO cập nhật hiển thị ngay lập tức từ `rawFeatures`

3.7 WHEN DORI overlay đang hiển thị cho một selected feature THEN hệ thống SHALL CONTINUE TO tính toán và hiển thị DORI ranges dựa trên camera specs hiện tại

3.8 WHEN FOVLayer render trên non-large project THEN hệ thống SHALL CONTINUE TO sử dụng `rawFeatures` làm nguồn dữ liệu

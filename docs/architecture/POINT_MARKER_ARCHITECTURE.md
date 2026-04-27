# Point Marker Click - Kiến Trúc & Phân Tích

## 🎯 **Mục Tiêu**
Khi người dùng click vào một point feature trên bản đồ:
1. Feature được chọn (highlight)
2. Bản đồ zoom đến feature (zoom level 20)
3. Project Explorer highlight feature đó

## 📋 **Kiến Trúc Hiện Tại**

### **Flow Dữ Liệu**

```
User Click
    ↓
Leaflet Map Event System
    ↓
[PointLayer.tsx] - Marker render + event handlers
    ↓
[SelectionManager.ts] - handleFeatureSelection()
    ↓
[useDesignSync Store] - Update state (selectedFeatureId, selectedGroupId)
    ↓
[ZoomToHandler.tsx] - Detect zoomToTrigger → Map zooms
    ↓
[DrawingExplorer.tsx] - Highlight & scroll to feature
```

### **Các Components Liên Quan**

| File | Vai Trò | Vấn Đề Hiện Tại |
|------|---------|-----------------|
| `PointLayer.tsx` | Render point markers | Event handlers không hoạt động |
| `VectorLayer.tsx` | Render polyline/polygon | ✅ Hoạt động tốt |
| `SelectionManager.ts` | Centralized selection logic | Code đúng nhưng không được gọi |
| `ZoomToHandler.tsx` | Handle zoom triggers | Code đúng nhưng không được trigger |
| `BoxSelectionHandler.tsx` | Handle box selection + background click | Có thể deselect ngay sau khi select |
| `DrawingExplorer.tsx` | Tree view in sidebar | Chưa có auto-expand |

## 🔴 **Root Cause Analysis**

### **Giả Thuyết 1: Event Handlers Không Được Gắn**
**Evidence**: Không có log nào từ click handlers
**Có thể do**:
- React re-render làm mất handlers
- Leaflet DivIcon không gắn được DOM events
- Timing issue (handlers gắn sau khi marker đã render)

### **Giả Thuyết 2: BoxSelectionHandler Deselect Ngay**
**Evidence**: User thấy selection không thay đổi
**Cơ chế**:
1. Marker click handler chạy → select feature
2. Event bubble lên map container
3. BoxSelectionHandler.onMapClick chạy
4. `isFeatureClick` check thất bại → `selectFeature(null)`

### **Giả Thuyết 3: Inline onclick Không Hoạt Động**
**Evidence**: Không có log "Registering global __markerClick handler"
**Nguyên nhân**:
- Code registration không chạy (module caching?)
- Window object không available khi module load
- CSP blocking inline handlers (đã check: không phải)

## ✅ **Kế Hoạch Sửa Chữa**

### **Bước 1: Debug Cơ Bản**
1. Kiểm tra xem `window.__markerClick` có tồn tại không
2. Kiểm tra HTML của marker có onclick attribute không
3. Kiểm tra xem có DOM event nào được trigger không

### **Bước 2: Fix Theo Ưu Tiên**
1. **Ưu tiên 1**: Fix BoxSelectionHandler guard (đã làm)
2. **Ưu tiên 2**: Đảm bảo event handlers được gắn đúng cách
3. **Ưu tiên 3**: Simplify code - xóa debug logging không cần thiết

### **Bước 3: Test Toàn Diện**
- Test point features (markers)
- Test polyline features  
- Test polygon features
- Test multi-select (Shift+click)
- Test background click (deselect)

## 📝 **Các Thử Nghiệm Đã Làm**

### ❌ **Không Thành Công:**
1. Leaflet `.on('click')` handlers
2. Direct DOM `addEventListener`
3. Event delegation on panes
4. setTimeout delayed attachment
5. Re-attaching on marker update

### ⏳ **Chưa Test:**
1. Inline onclick với debug window handler
2. Pane z-index adjustment
3. CSS pointer-events fix

## 🚀 **Next Steps**

1. **Kiểm tra window.__markerClick** có tồn tại
2. **Kiểm tra marker HTML** có onclick attribute
3. **Simplify** - xóa tất cả debug code, chỉ giữ 1 approach
4. **Test** với approach đơn giản nhất

---

**Created**: 2026-04-11
**Status**: Analyzing architecture before implementing fix

# Hướng Dẫn Test Nhanh - Point Selection

## ⚡ Test Trong 30 Giây

### Bước 1: Mở Browser Console
Nhấn `F12` → Tab Console

### Bước 2: Kiểm Tra Mode
```javascript
useDesignSync.getState().drawingMode
```
**Phải ra**: `"none"` hoặc `"move"`

Nếu ra giá trị khác → **ĐÓ LÀ VẤN ĐỀ!**

### Bước 3: Test Selection
```javascript
testFullSelectionFlow();
```

**Nếu thấy toàn ✓** → Code hoạt động, vấn đề ở UI
**Nếu có ❌** → Xem bước nào fail

---

## 🔧 Fix Nhanh Nếu Sai Mode

Trong console:
```javascript
useDesignSync.getState().setDrawingMode('none');
```

Rồi thử click lại Point.

---

## 🎯 3 Lệnh Debug Quan Trọng

### 1. Kiểm Tra Store Có Point Không
```javascript
const store = useDesignSync.getState();
const points = Object.values(store.state.features || {})
    .filter(f => !f.geom_type || f.geom_type === 'Point');
console.log('Số Point:', points.length);
console.log('Point đầu tiên:', points[0]);
```

### 2. Test Select Thủ Công
```javascript
const store = useDesignSync.getState();
const firstPoint = Object.values(store.state.features || {})
    .find(f => !f.geom_type || f.geom_type === 'Point');

if (firstPoint) {
    store.selectFeature(firstPoint.id);
    store.zoomTo(firstPoint.id, 'feature');
    console.log('✓ Đã select:', firstPoint.id);
    console.log('  selectedFeatureId:', store.selectedFeatureId);
}
```

### 3. Kiểm Tra Zoom Có Trigger Không
```javascript
useDesignSync.getState().zoomToTrigger
```

**Nếu ra `null`** → `zoomTo()` chưa được gọi
**Nếu có object** → Zoom đã trigger, kiểm tra ZoomToHandler

---

## 📋 Checklist Nhanh

- [ ] Drawing mode là `'none'` hoặc `'move'`
- [ ] Zoom level >= 18 (để marker không bị cluster)
- [ ] Console không có error
- [ ] `testFullSelectionFlow()` ra toàn ✓
- [ ] Khi select thủ công, `selectedFeatureId` thay đổi

---

## 🐛 Vấn Đề Thường Gặp

### Click Không Có Phản Ứng
→ 90% do sai mode, chạy: `useDesignSync.getState().setDrawingMode('none')`

### Zoom Nhưng Không Thấy Di Chuyển
→ Kiểm tra tọa độ có đúng không:
```javascript
const f = useDesignSync.getState().state.features[POINT_ID];
console.log('Coords:', JSON.parse(f.coordinates));
```

### DrawingExplorer Không Scroll
→ Kiểm tra `selectedFeatureId` có thay đổi không:
```javascript
useDesignSync.getState().selectedFeatureId
```

---

## 📞 Cần Giúp Đỡ?

Copy toàn bộ output từ console và gửi, nhớ chạy trước:
```javascript
console.log('Mode:', useDesignSync.getState().drawingMode);
console.log('Selected:', useDesignSync.getState().selectedFeatureId);
console.log('ZoomTrigger:', useDesignSync.getState().zoomToTrigger);
testFullSelectionFlow();
```

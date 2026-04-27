# Cơ Chế Click Trên Bản Đồ: Google Maps vs Leaflet vs Tauri Project

## 📊 So Sánh Cơ Chế Click

### 1. Google Maps JavaScript API

#### Cách Hoạt Động:
```javascript
// Google Maps - Event Listener Pattern
const map = new google.maps.Map(element, options);

// Click trên bản đồ
map.addListener('click', (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    // e.latLng là google.maps.LatLng object
});

// Click trên Marker
marker.addListener('click', (e) => {
    // e DOM event, không có latLng
    // Marker đã được gắn sẵn vào map
});

// Click trên Polyline
polyline.addListener('click', (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    // e.latLng là vị trí CLICK, không phải vertex gần nhất
});
```

#### Đặc Điểm Google Maps:
- ✅ **Event bubbling tự động**: Click trên feature → feature handler fires, KHÔNG fire map click
- ✅ **Hit detection tự động**: Google Maps tự động phát hiện click trên đối tượng
- ✅ **Smooth animations**: `map.panTo()`, `map.panToBounds()` với easing
- ✅ **Z-index layering**: Overlay tự động quản lý z-index
- ✅ **Optimized hit testing**: GPU-accelerated detection

---

### 2. Leaflet (Dự Án Đang Dùng)

#### Cách Hoạt Động:
```typescript
// Leaflet - Event Delegation Pattern
import { useMap, useMapEvents } from 'react-leaflet';

// Click trên bản đồ (background)
useMapEvents({
    click(e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        // e.latlng là L.LatLng object
    }
});

// Click trên Marker - phải register riêng
marker.on('click', (e) => {
    // Leaflet marker click event
    // KHÔNG tự động stop propagation
});

// Click trên Polyline - phải register riêng
polyline.on('click', (e) => {
    // e.latlng là vị trí CLICK trên line
});
```

#### Đặc Điểm Leaflet:
- ⚠️ **Event propagation thủ công**: Phải gọi `L.DomEvent.stopPropagation()`
- ⚠️ **Hit detection thủ công**: Phải tự tạo "hit area" (như invisible Polyline weight: 15)
- ⚠️ **Z-index thủ công**: Phải tạo Pane và quản lý z-index
- ⚠️ **Marker clustering**: Phải dùng plugin `leaflet.markercluster`
- ✅ **PreferCanvas**: `preferCanvas={true}` giúp performance tốt hơn

---

## 🔍 Vấn Đề Trong Dự Án Hiện Tại

### Vấn Đề 1: Event Propagation Không Đồng Nhất

**File**: `PointLayer.tsx`
```typescript
// Leaflet Marker - cần stopPropagation thủ công
marker.on('click', (e: any) => {
    L.DomEvent.stop(e); // ← Leaflet cần cái này
    handleFeatureSelection(f.id, f.group_id, originalEvent);
});
```

**File**: `VectorLayer.tsx`
```typescript
// React-Leaflet Polyline - cần double stop
<Polyline
    eventHandlers={{
        click: (e) => {
            L.DomEvent.stopPropagation(e); // ← Stop Leaflet
            originalEvent.stopPropagation(); // ← Stop DOM
            handleFeatureSelection(f.id, f.group_id, originalEvent);
        }
    }}
/>
```

**So với Google Maps**:
```javascript
// Google Maps - TỰ ĐỘNG stop propagation
marker.addListener('click', (e) => {
    // Không cần stopPropagation!
    // Map click event sẽ KHÔNG fire
    selectFeature(id);
});
```

---

### Vấn Đề 2: Hit Detection Không Đồng Nhất

**Google Maps**: Tự động detect click trên feature
```javascript
// Google Maps biết chính xác pixel nào thuộc feature
polyline.addListener('click', handler); // ← Tự động hit test
```

**Leaflet**: Phải tạo "hit area" thủ công
```typescript
// VectorLayer.tsx - Phải tạo 2 layer
{/* Hit Area (Invisible, wide) */}
<Polyline
    pathOptions={{ color: 'transparent', weight: 15 }} // ← Hit area nhân tạo
    eventHandlers={{ click: handler }}
/>
{/* Visible Polyline */}
<Polyline
    pathOptions={{ color: 'blue', weight: 5 }} // ← Chỉ để hiển thị
    interactive={false} // ← Không nhận event
/>
```

---

### Vấn Đề 3: Zoom Animation Khác Nhau

**Google Maps**:
```javascript
map.panTo(latlng, {
    animation: google.maps.Animation.DROP,
    duration: 500,  // ← Smooth easing
    easing: t => t * (2 - t) // ← Ease-out quad
});
```

**Leaflet (hiện tại)**:
```typescript
// ZoomToHandler.tsx - Không có animation!
map.setView([lat, lng], 18); // ← Jump ngay lập tức
// HOẶC
map.setView([lat, lng], 18, {
    animate: true,
    duration: 0.5,
    easeLinearity: 0.25  // ← Có nhưng không mượt bằng
});
```

---

## ✅ Giải Pháp Áp Dụng Cho Dự Án Tauri

### Giải Pháp 1: Tạo Event Handler Wrapper (Như Google Maps)

Tạo một utility wrapper để giả lập behavior của Google Maps:

```typescript
// DESIGN/feature/map/MapClickHandler.ts
import L from 'leaflet';
import { useMap, useMapEvents } from 'react-leaflet';

/**
 * MapClickHandler - Giả lập Google Maps event behavior
 * - Tự động stopPropagation khi click feature
 * - Phân biệt rõ ràng giữa feature click và background click
 */
export function useMapClickHandler(handlers: {
    onFeatureClick?: (featureId: string, event: any) => void;
    onBackgroundClick?: (event: L.LeafletMouseEvent) => void;
    onMapClick?: (event: L.LeafletMouseEvent) => void;
}) {
    const map = useMap();

    // Lắng nghe TẤT CẢ click trên map
    useMapEvents({
        click(e) {
            const target = e.originalEvent?.target as HTMLElement;
            
            // Kiểm tra có phải click trên feature không
            const isFeature = target && (
                target.closest('.leaflet-marker-icon') ||
                target.closest('.leaflet-interactive') ||
                target.closest('.custom-map-marker') ||
                target.tagName === 'path'
            );

            if (isFeature) {
                // Feature click - handler riêng sẽ tự quản lý
                handlers.onFeatureClick?.(null, e);
            } else {
                // Background click
                handlers.onBackgroundClick?.(e);
            }

            // Luôn gọi onMapClick
            handlers.onMapClick?.(e);
        }
    });
}

/**
 * createFeatureHandler - Tạo handler tự động stopPropagation
 * Giống Google Maps addListener
 */
export function createFeatureHandler(
    element: L.Layer | L.Marker,
    handler: (e: any) => void
) {
    element.on('click', (e) => {
        // Tự động stop như Google Maps
        L.DomEvent.stopPropagation(e);
        if (e.originalEvent) {
            e.originalEvent.stopPropagation();
        }
        handler(e);
    });
}
```

---

### Giải Pháp 2: Cải Thiện Zoom Animation

```typescript
// DESIGN/feature/map/SmoothZoomController.ts
import L from 'leaflet';

/**
 * SmoothZoom - Zoom mượt mà như Google Maps
 */
export function smoothZoomTo(
    map: L.Map,
    latlng: [number, number],
    zoom: number = 18,
    options?: {
        duration?: number;
        easeLinearity?: number;
    }
) {
    const {
        duration = 0.8,  // Google Maps dùng ~800ms
        easeLinearity = 0.15  // Mượt hơn (mặc định Leaflet là 0.25)
    } = options || {};

    // Google Maps dùng ease-out quad: t * (2 - t)
    map.setView(latlng, zoom, {
        animate: true,
        duration,
        easeLinearity,
        noMoveStart: true  // Không fire 'movestart' event
    });
}

/**
 * PanTo - Di chuyển mượt mà như Google Maps pan
 */
export function smoothPanTo(
    map: L.Map,
    latlng: [number, number],
    options?: {
        duration?: number;
        easeLinearity?: number;
    }
) {
    const currentZoom = map.getZoom();
    
    map.setView(latlng, currentZoom, {
        animate: true,
        duration: options?.duration || 0.5,
        easeLinearity: options?.easeLinearity || 0.15,
        noMoveStart: true
    });
}
```

---

### Giải Pháp 3: Cải Thiện Hit Detection Cho Point

```typescript
// DESIGN/feature/map/PointHitDetection.ts
import L from 'leaflet';

/**
 * Tạo marker với hit area rõ ràng như Google Maps
 */
export function createMarkerWithHitArea(
    latlng: [number, number],
    options: {
        icon: L.DivIcon;
        hitRadius?: number; // Pixel
        onClick: (e: L.LeafletMouseEvent) => void;
    }
) {
    const { hitRadius = 20 } = options;
    
    // Tạo marker chính
    const marker = L.marker(latlng, {
        icon: options.icon,
        interactive: true
    });

    // Tạo hit area vô hình xung quanh (như Google Maps tự động làm)
    const hitArea = L.circleMarker(latlng, {
        radius: hitRadius,
        fillColor: 'transparent',
        fillOpacity: 0,
        color: 'transparent',
        weight: 0,
        interactive: true,
        bubblingMouseEvents: false
    });

    // Sync position
    marker.on('move', (e) => {
        hitArea.setLatLng(marker.getLatLng());
    });

    // Handler trên hit area
    hitArea.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        options.onClick(e);
    });

    // Handler trên marker
    marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        options.onClick(e);
    });

    return { marker, hitArea };
}
```

---

### Giải Pháp 4: Update ZoomToHandler Với Animation Mượt Mà

```typescript
// Cập nhật ZoomToHandler.tsx
export function ZoomToHandler() {
    const map = useMap();
    const zoomToTrigger = useDesignSync(s => s.zoomToTrigger);
    
    useEffect(() => {
        if (!zoomToTrigger) return;
        
        if (zoomToTrigger.type === 'feature') {
            const f = state.features[zoomToTrigger.id];
            if (f && f.geom_type === 'Point') {
                const coords = JSON.parse(f.coordinates);
                
                // Google Maps style zoom - smooth với duration
                map.setView([coords[1], coords[0]], 18, {
                    animate: true,
                    duration: 0.8,  // 800ms như Google
                    easeLinearity: 0.15,  // Mượt hơn
                    noMoveStart: true
                });
            }
        }
    }, [zoomToTrigger]);
}
```

---

## 📋 Checklist Áp Dụng

### Giai Đoạn 1: Event Handler (Ưu Tiên Cao)
- [ ] Tạo `MapClickHandler.ts` wrapper
- [ ] Update `PointLayer.tsx` dùng wrapper
- [ ] Update `VectorLayer.tsx` dùng wrapper
- [ ] Test event propagation không bị leak

### Giai Đoạn 2: Zoom Animation (Ưu Tiên Trung Bình)
- [ ] Update `ZoomToHandler.tsx` với smooth zoom
- [ ] Test zoom mượt mà như Google Maps
- [ ] Điều chỉnh duration/easing phù hợp

### Giai Đoạn 3: Hit Detection (Ưu Tiên Thấp)
- [ ] Tạo hit area cho Point markers
- [ ] Test click dễ dàng hơn (không cần chính xác pixel)
- [ ] Điều chỉnh hitRadius phù hợp

---

## 🎯 Kết Luận

**Google Maps có ưu điểm**:
1. ✅ Event propagation tự động
2. ✅ Hit detection chính xác
3. ✅ Smooth animations với easing đẹp

**Leaflet cần thủ công nhưng linh hoạt hơn**:
1. ⚠️ Phải tự quản lý event propagation
2. ⚠️ Phải tự tạo hit area
3. ✅ Có thể tùy chỉnh hoàn toàn behavior

**Dự án Tauri nên**:
1. Tạo wrapper utilities để giả lập Google Maps behavior
2. Cải thiện zoom animation cho mượt mà
3. Giữ nguyên kiến trúc Leaflet (không cần rewrite)

# Module Detail: Data Models & IPC Schema

This document maps the shared data structures used between the Rust backend and TypeScript frontend, ensuring binary safety and consistent serialization.

## 1. Map State Hydration (Bincode IPC)

Bando uses **Bincode** for high-speed state transfer, bypassing JSON overhead for large datasets.

### Rust Struct: `contract/spatial_models.rs`
```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BincodeMapState {
    pub regions: HashMap<Arc<str>, RegionState>,
    pub layers: HashMap<Arc<str>, LayerState>,
    pub feature_groups: HashMap<Arc<str>, FeatureGroupState>,
    pub features: HashMap<Arc<str>, SerializableFeatureState>,
    pub settings_json: String,
    pub last_event_id: Option<Arc<str>>,
}
```

### TypeScript Mapping: `modules/implement/lib/tauri.ts`
```typescript
// Custom invoker that decodes Bincode automatically
export async function loadDesignState() {
  const binaryData = await invoke<Uint8Array>('load_design_state');
  return decodeBincode<BincodeMapState>(binaryData);
}
```

---

## 2. Feature Schema (GeoJSON + Metadata)

Every feature in the system combines standard geometry with rich metadata.

| Field | Type (Rust) | Type (TS) | DB Storage |
| :--- | :--- | :--- | :--- |
| `id` | `Arc<str>` | `string` | `id (TEXT)` |
| `geometry` | `serde_json::Value` | `GeoJSON` | `geometry_json (TEXT)` |
| `metadata` | `String (JSON)` | `Record<string, any>` | `metadata_json (TEXT)` |
| `bbox` | `Option<BBox>` | `{minX, minY, maxX, maxY}` | `min_x, min_y... (REAL)` |

---

## 3. Event Envelope structure

Every action is wrapped in an `AppEvent` before being committed to the WAL.

```rust
pub struct AppEvent {
    pub hash: String,           // Unique ID for Hash Chain
    pub prev_hash: String,      // Link to previous action
    pub event_type: String,     // e.g., "design:feature:add"
    pub payload: Value,         // Action-specific data
    pub timestamp: i64,         // System time
}
```

---

## 4. Key Files
- **Spatial Models**: [src-tauri/src/domain/contract/spatial_models.rs](file:///d:/RUST/src-tauri/src/domain/contract/spatial_models.rs)
- **Database Schema**: [src-tauri/src/domain/implement/modules/v2/storage/schema.rs](file:///d:/RUST/src-tauri/src/domain/implement/modules/v2/storage/schema.rs)

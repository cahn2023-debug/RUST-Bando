# Project Aggregation for Graph-It-Live

## 🗺️ Project Architecture Map (TOON Format)

```toon
modules(name,path,purpose)
[contract,src-tauri/src/CONTRACT/mod.rs,Data models and schema definitions]
[design,src-tauri/src/DESIGN/mod.rs,UI logic, map rendering and events]
[implement,src-tauri/src/IMPLEMENT/mod.rs,Core logic, DB, and command implementations]
[frontend_types,src/CONTRACT/types.ts,TypeScript interfaces for the whole project]

commands(name,module,description)
[load_pmp_file,project,Load project database file]
[get_app_config,core/config,Get global app settings]
[VirtualFileGrid,DESIGN/components,Virtualized UI for project files]
```

## 📄 Core Source Code

### src-tauri/src/lib.rs
```rust
#[path = "CONTRACT/mod.rs"]
pub mod contract;
#[path = "DESIGN/mod.rs"]
pub mod design;
#[path = "IMPLEMENT/mod.rs"]
pub mod implement;

pub use implement::modules::bootstrap;

pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            bootstrap::init(app).expect("Failed to initialize application");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::project::load_pmp_file,
            commands::task::get_tasks,
            implement::modules::core::config::get_app_config,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    app.run(|_app_handle, event| {});
}
```

### src-tauri/src/CONTRACT/project_model.rs
```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub status: String,
}
```

### src-tauri/src/IMPLEMENT/modules/core/config.rs
```rust
#[derive(Serialize, Deserialize, Default, Clone)]
pub struct AppConfig {
    pub last_opened_pmp: Option<String>,
    pub recent_pmps: Vec<Project>,
    pub enable_ai: bool,
}

#[tauri::command]
pub fn get_app_config(state: tauri::State<'_, ConfigState>) -> AppConfig {
    state.0.lock().unwrap().clone()
}
```

### src/CONTRACT/types.ts
```typescript
export interface Project {
  id: number;
  name: string;
  path: string;
  status: 'active' | 'archived' | 'completed';
}

export interface Task {
  id: number;
  project_id: number;
  name: string;
  is_completed: boolean;
}
```

### src/DESIGN/components/VirtualFileGrid.tsx
```tsx
export function VirtualFileGrid({ files }: { files: FileItemData[] }) {
    return (
        <VirtuosoGrid
            data={files}
            itemContent={(_index, file) => (
                <FilePreviewCard file={file} />
            )}
        />
    );
}
```

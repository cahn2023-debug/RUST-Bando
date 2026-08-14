use std::path::Path;

pub fn compute_rel_path(abs_path: &Path, base_dir: &Path) -> Result<String, String> {
    abs_path
        .strip_prefix(base_dir)
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| format!("Path calculation error: {}", e))
}

pub fn validate_metadata(meta: &serde_json::Value) -> Result<(), String> {
    if let Some(obj) = meta.as_object() {
        for key in obj.keys() {
            let valid = key == "system"
                || key == "analysis"
                || key == "custom"
                || key.starts_with("plugin_");
            if !valid {
                return Err(format!(
                    "[V2 META] Invalid namespace: '{}'. Must be system|analysis|custom|plugin_*",
                    key
                ));
            }
        }
    }
    Ok(())
}

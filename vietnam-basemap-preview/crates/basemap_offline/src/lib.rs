use basemap_contract::BasemapManifest;
use serde_json::Value;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug)]
pub enum OfflineError {
    InvalidPackage(String),
    MissingAsset(PathBuf),
    Io(std::io::Error),
    Json(serde_json::Error),
    Contract(String),
}

impl fmt::Display for OfflineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidPackage(message) => write!(f, "invalid offline package: {message}"),
            Self::MissingAsset(path) => write!(f, "offline asset is missing: {}", path.display()),
            Self::Io(error) => error.fmt(f),
            Self::Json(error) => error.fmt(f),
            Self::Contract(message) => write!(f, "invalid manifest contract: {message}"),
        }
    }
}

impl std::error::Error for OfflineError {}

impl From<std::io::Error> for OfflineError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for OfflineError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

#[derive(Debug, Clone)]
pub struct OfflinePackage {
    root: PathBuf,
    manifest: BasemapManifest,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OfflineStyle {
    pub id: String,
    pub package_path: PathBuf,
    pub content: String,
}

impl OfflinePackage {
    pub fn open(root: impl AsRef<Path>) -> Result<Self, OfflineError> {
        let root = fs::canonicalize(root)?;
        if !root.is_dir() {
            return Err(OfflineError::InvalidPackage(format!(
                "package root is not a directory: {}",
                root.display()
            )));
        }

        let manifest_path = root.join("manifest.json");
        let manifest: BasemapManifest = serde_json::from_str(&fs::read_to_string(manifest_path)?)?;
        manifest
            .validate()
            .map_err(|error| OfflineError::Contract(error.to_string()))?;

        let package = Self { root, manifest };
        package.validate_declared_assets()?;
        Ok(package)
    }

    pub fn manifest(&self) -> &BasemapManifest {
        &self.manifest
    }

    pub fn style(&self, style_id: &str) -> Result<OfflineStyle, OfflineError> {
        let style_ref = self
            .manifest
            .styles
            .iter()
            .find(|style| style.id == style_id)
            .ok_or_else(|| OfflineError::InvalidPackage(format!("unknown style: {style_id}")))?;
        let path = self.resolve_file(&style_ref.path)?;
        let content = fs::read_to_string(&path)?;
        let value: Value = serde_json::from_str(&content)?;
        if contains_external_url(&value) {
            return Err(OfflineError::InvalidPackage(format!(
                "style {style_id} contains an external URL"
            )));
        }
        Ok(OfflineStyle {
            id: style_ref.id.clone(),
            package_path: package_relative(&self.root, &path),
            content,
        })
    }

    pub fn tile_archive_path(&self) -> Result<PathBuf, OfflineError> {
        self.resolve_file(&self.manifest.assets.tile_archive)
    }

    pub fn font_paths(&self) -> Result<Vec<PathBuf>, OfflineError> {
        self.manifest
            .assets
            .fonts
            .iter()
            .map(|path| self.resolve_file(path))
            .collect()
    }

    pub fn sprite_paths(&self) -> Result<Vec<PathBuf>, OfflineError> {
        self.manifest
            .assets
            .sprites
            .iter()
            .map(|path| self.resolve_file(path))
            .collect()
    }

    fn validate_declared_assets(&self) -> Result<(), OfflineError> {
        for style in &self.manifest.styles {
            self.resolve_file(&style.path)?;
        }
        self.tile_archive_path()?;
        self.font_paths()?;
        self.sprite_paths()?;
        Ok(())
    }

    fn resolve_file(&self, relative: &str) -> Result<PathBuf, OfflineError> {
        if !is_safe_relative_path(relative) {
            return Err(OfflineError::InvalidPackage(format!(
                "path is not package-relative: {relative}"
            )));
        }
        let candidate = self.root.join(relative);
        let canonical = fs::canonicalize(&candidate)
            .map_err(|_| OfflineError::MissingAsset(candidate.clone()))?;
        if !canonical.starts_with(&self.root) || !canonical.is_file() {
            return Err(OfflineError::MissingAsset(candidate));
        }
        Ok(canonical)
    }
}

fn is_safe_relative_path(path: &str) -> bool {
    !path.is_empty()
        && !path.starts_with('/')
        && !path.starts_with('\\')
        && !path.contains('\\')
        && !path.contains(':')
        && !path
            .split('/')
            .any(|segment| segment == ".." || segment.is_empty())
}

fn package_relative(root: &Path, path: &Path) -> PathBuf {
    path.strip_prefix(root).unwrap_or(path).to_path_buf()
}

fn contains_external_url(value: &Value) -> bool {
    match value {
        Value::String(value) => {
            let lower = value.to_ascii_lowercase();
            lower.starts_with("http://") || lower.starts_with("https://")
        }
        Value::Array(values) => values.iter().any(contains_external_url),
        Value::Object(values) => values.values().any(contains_external_url),
        Value::Null | Value::Bool(_) | Value::Number(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use tempfile::tempdir;

    fn fixture() -> tempfile::TempDir {
        let temp = tempdir().unwrap();
        let root = temp.path();
        fs::create_dir_all(root.join("styles")).unwrap();
        fs::create_dir_all(root.join("tiles")).unwrap();
        fs::create_dir_all(root.join("fonts/Noto Sans")).unwrap();
        fs::create_dir_all(root.join("sprites")).unwrap();
        fs::write(
            root.join("manifest.json"),
            include_str!("../../../contracts/manifest.example.json"),
        )
        .unwrap();
        for style in ["light", "dark", "engineering"] {
            fs::write(
                root.join(format!("styles/{style}.json")),
                r#"{"version":8,"glyphs":"{basemap-glyphs}/{fontstack}/{range}.pbf","sprite":"{basemap-sprite}/basemap","sources":{"vn-basemap":{"tiles":["{basemap-tiles}/{z}/{x}/{y}.mvt"]}}}"#,
            )
            .unwrap();
        }
        fs::write(root.join("tiles/vietnam.pmtiles"), b"tile fixture").unwrap();
        fs::write(root.join("fonts/Noto Sans/0-255.pbf"), b"font fixture").unwrap();
        fs::write(root.join("sprites/basemap.json"), b"{}\n").unwrap();
        fs::write(root.join("sprites/basemap.png"), b"png fixture").unwrap();
        temp
    }

    #[test]
    fn opens_and_resolves_a_complete_package_without_network() {
        let temp = fixture();
        let package = OfflinePackage::open(temp.path()).unwrap();

        assert_eq!(package.manifest().default_style, "engineering");
        assert_eq!(package.style("engineering").unwrap().id, "engineering");
        assert!(package.tile_archive_path().unwrap().is_file());
        assert_eq!(package.font_paths().unwrap().len(), 1);
        assert_eq!(package.sprite_paths().unwrap().len(), 2);
    }

    #[test]
    fn rejects_missing_assets_and_incompatible_manifest() {
        let temp = fixture();
        fs::remove_file(temp.path().join("sprites/basemap.png")).unwrap();
        assert!(matches!(
            OfflinePackage::open(temp.path()),
            Err(OfflineError::MissingAsset(_))
        ));

        let temp = fixture();
        let manifest_path = temp.path().join("manifest.json");
        let mut value: Value =
            serde_json::from_str(&fs::read_to_string(&manifest_path).unwrap()).unwrap();
        value["contractVersion"] = json!("999");
        fs::write(&manifest_path, serde_json::to_vec(&value).unwrap()).unwrap();
        assert!(OfflinePackage::open(temp.path()).is_err());
    }

    #[test]
    fn rejects_unsafe_paths_and_external_style_resources() {
        let temp = fixture();
        let manifest_path = temp.path().join("manifest.json");
        let mut value: Value =
            serde_json::from_str(&fs::read_to_string(&manifest_path).unwrap()).unwrap();
        value["styles"][0]["path"] = json!("../outside.json");
        fs::write(&manifest_path, serde_json::to_vec(&value).unwrap()).unwrap();
        assert!(OfflinePackage::open(temp.path()).is_err());

        let temp = fixture();
        fs::write(
            temp.path().join("styles/light.json"),
            r#"{"glyphs":"https://fonts.example.invalid/{range}.pbf"}"#,
        )
        .unwrap();
        let package = OfflinePackage::open(temp.path()).unwrap();
        assert!(matches!(
            package.style("light"),
            Err(OfflineError::InvalidPackage(_))
        ));
    }
}

use basemap_contract::{
    AssetManifest, BasemapManifest, Coverage, SourceMetadata, StyleReference, CONTRACT_VERSION,
    MANIFEST_SCHEMA_VERSION,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const REQUIRED_LAYERS: &[&str] = &[
    "transportation",
    "railway",
    "water",
    "landuse",
    "landcover",
    "building",
    "boundary",
    "place",
    "labels",
    "poi",
    "airport",
    "ferry",
];

#[derive(Debug)]
pub enum BuilderError {
    InvalidConfig(String),
    ExistingRelease(PathBuf),
    Io(io::Error),
    Json(serde_json::Error),
}

impl fmt::Display for BuilderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidConfig(message) => write!(f, "invalid builder config: {message}"),
            Self::ExistingRelease(path) => {
                write!(
                    f,
                    "release already exists and is immutable: {}",
                    path.display()
                )
            }
            Self::Io(error) => error.fmt(f),
            Self::Json(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for BuilderError {}

impl From<io::Error> for BuilderError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for BuilderError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

pub type BuilderResult<T> = Result<T, BuilderError>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct PipelineConfig {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(rename = "generatedAt")]
    pub generated_at: String,
    #[serde(rename = "defaultSource")]
    pub default_source: String,
    pub language: String,
    pub projection: String,
    #[serde(rename = "tileFormat")]
    pub tile_format: String,
    pub container: String,
    #[serde(rename = "defaultStyle")]
    pub default_style: String,
    pub coverage: Coverage,
    pub sources: Vec<SourceMetadata>,
    pub styles: Vec<StyleReference>,
    pub layers: Vec<String>,
    pub attribution: String,
    #[serde(default, rename = "streetViewCoverage")]
    pub street_view_coverage: Option<String>,
}

impl PipelineConfig {
    pub fn validate(&self) -> BuilderResult<()> {
        require_non_empty("id", &self.id)?;
        require_non_empty("name", &self.name)?;
        require_non_empty("version", &self.version)?;
        require_non_empty("generatedAt", &self.generated_at)?;
        require_non_empty("language", &self.language)?;
        require_non_empty("projection", &self.projection)?;
        require_non_empty("tileFormat", &self.tile_format)?;
        require_non_empty("container", &self.container)?;
        require_non_empty("attribution", &self.attribution)?;

        if self.default_source != "osm" {
            return Err(BuilderError::InvalidConfig(
                "defaultSource must be osm for the MVP".into(),
            ));
        }

        if self.sources.is_empty() {
            return Err(BuilderError::InvalidConfig(
                "sources must contain at least one source".into(),
            ));
        }
        let mut source_ids = HashSet::new();
        let mut has_default_source = false;
        for source in &self.sources {
            if source.id == self.default_source {
                has_default_source = true;
            }
            if !source_ids.insert(&source.id) {
                return Err(BuilderError::InvalidConfig(
                    "source ids must be unique".into(),
                ));
            }
        }
        if !has_default_source {
            return Err(BuilderError::InvalidConfig(
                "defaultSource must reference a configured source".into(),
            ));
        }

        if self.layers.is_empty() {
            return Err(BuilderError::InvalidConfig(
                "layers must contain the basemap layer inventory".into(),
            ));
        }
        let layer_ids: HashSet<&str> = self.layers.iter().map(String::as_str).collect();
        for required in REQUIRED_LAYERS {
            if !layer_ids.contains(required) {
                return Err(BuilderError::InvalidConfig(format!(
                    "required layer is missing: {required}"
                )));
            }
        }

        let candidate = self.manifest_with_assets(AssetManifest {
            tile_archive: "tiles/placeholder.archive".into(),
            fonts: vec!["fonts/placeholder.pbf".into()],
            sprites: vec!["sprites/placeholder.json".into()],
            street_view_coverage: self.street_view_coverage.clone(),
        });
        candidate
            .validate()
            .map_err(|error| BuilderError::InvalidConfig(error.to_string()))
    }

    fn manifest_with_assets(&self, assets: AssetManifest) -> BasemapManifest {
        BasemapManifest {
            id: self.id.clone(),
            name: self.name.clone(),
            version: self.version.clone(),
            contract_version: CONTRACT_VERSION.into(),
            schema_version: MANIFEST_SCHEMA_VERSION.into(),
            language: self.language.clone(),
            projection: self.projection.clone(),
            tile_format: self.tile_format.clone(),
            container: self.container.clone(),
            min_zoom: 0,
            max_zoom: 18,
            default_style: self.default_style.clone(),
            coverage: self.coverage.clone(),
            sources: self.sources.clone(),
            styles: self.styles.clone(),
            assets,
            attribution: self.attribution.clone(),
            generated_at: self.generated_at.clone(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct BuildInputs {
    pub tile_archive: PathBuf,
    pub style_files: Vec<PathBuf>,
    pub font_files: Vec<PathBuf>,
    pub sprite_files: Vec<PathBuf>,
    pub street_view_coverage: Option<PathBuf>,
}

#[derive(Debug, Clone)]
pub struct BuildReport {
    pub release_dir: PathBuf,
    pub manifest: BasemapManifest,
}

pub fn load_config(path: impl AsRef<Path>) -> BuilderResult<PipelineConfig> {
    let text = fs::read_to_string(path)?;
    let config: PipelineConfig = serde_json::from_str(&text)?;
    config.validate()?;
    Ok(config)
}

pub fn build_package(
    config: &PipelineConfig,
    inputs: &BuildInputs,
    output_root: impl AsRef<Path>,
) -> BuilderResult<BuildReport> {
    config.validate()?;
    validate_inputs(config, inputs)?;

    let output_root = output_root.as_ref();
    fs::create_dir_all(output_root)?;
    let release_dir = output_root.join(&config.version);
    if release_dir.exists() {
        return Err(BuilderError::ExistingRelease(release_dir));
    }

    let staging_dir = output_root.join(format!(".{}.staging", config.version));
    if staging_dir.exists() {
        return Err(BuilderError::ExistingRelease(staging_dir));
    }
    fs::create_dir_all(&staging_dir)?;

    let result = build_staging_package(config, inputs, &staging_dir);
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&staging_dir);
        return Err(error);
    }
    fs::rename(&staging_dir, &release_dir)?;

    let manifest = read_manifest(&release_dir.join("manifest.json"))?;
    Ok(BuildReport {
        release_dir,
        manifest,
    })
}

fn build_staging_package(
    config: &PipelineConfig,
    inputs: &BuildInputs,
    staging_dir: &Path,
) -> BuilderResult<()> {
    let tile_name = file_name(&inputs.tile_archive, "tile archive")?;
    let tile_path = format!("tiles/{tile_name}");
    copy_asset(
        &inputs.tile_archive,
        &staging_dir.join(&tile_path),
        "tile archive",
    )?;

    for (style, source) in config.styles.iter().zip(&inputs.style_files) {
        validate_package_path(&style.path, "style path")?;
        copy_asset(source, &staging_dir.join(&style.path), "style")?;
    }

    let font_paths = copy_named_assets(&inputs.font_files, staging_dir, "fonts")?;
    let sprite_paths = copy_named_assets(&inputs.sprite_files, staging_dir, "sprites")?;
    if let (Some(destination), Some(source)) =
        (&config.street_view_coverage, &inputs.street_view_coverage)
    {
        copy_asset(
            source,
            &staging_dir.join(destination),
            "Street View coverage",
        )?;
    }
    let manifest = config.manifest_with_assets(AssetManifest {
        tile_archive: tile_path,
        fonts: font_paths,
        sprites: sprite_paths,
        street_view_coverage: config.street_view_coverage.clone(),
    });
    manifest
        .validate()
        .map_err(|error| BuilderError::InvalidConfig(error.to_string()))?;

    let manifest_bytes = serde_json::to_vec_pretty(&manifest)?;
    fs::write(staging_dir.join("manifest.json"), manifest_bytes)?;
    Ok(())
}

fn validate_inputs(config: &PipelineConfig, inputs: &BuildInputs) -> BuilderResult<()> {
    ensure_file(&inputs.tile_archive, "tile archive")?;
    if inputs.style_files.len() != config.styles.len() {
        return Err(BuilderError::InvalidConfig(format!(
            "expected {} style files, received {}",
            config.styles.len(),
            inputs.style_files.len()
        )));
    }
    for path in &inputs.style_files {
        ensure_file(path, "style")?;
    }
    if inputs.font_files.is_empty() {
        return Err(BuilderError::InvalidConfig(
            "at least one font file is required".into(),
        ));
    }
    for path in &inputs.font_files {
        ensure_file(path, "font")?;
    }
    if inputs.sprite_files.is_empty() {
        return Err(BuilderError::InvalidConfig(
            "at least one sprite file is required".into(),
        ));
    }
    for path in &inputs.sprite_files {
        ensure_file(path, "sprite")?;
    }
    match (&config.street_view_coverage, &inputs.street_view_coverage) {
        (Some(_), Some(path)) => ensure_file(path, "Street View coverage")?,
        (Some(_), None) => {
            return Err(BuilderError::InvalidConfig(
                "Street View coverage is configured but no input was provided".into(),
            ))
        }
        (None, Some(_)) => {
            return Err(BuilderError::InvalidConfig(
                "Street View coverage input was provided but not configured".into(),
            ))
        }
        (None, None) => {}
    }
    Ok(())
}

fn copy_named_assets(
    paths: &[PathBuf],
    staging_dir: &Path,
    directory: &str,
) -> BuilderResult<Vec<String>> {
    let mut destinations = Vec::with_capacity(paths.len());
    for source in paths {
        let name = file_name(source, directory)?;
        let relative = format!("{directory}/{name}");
        copy_asset(source, &staging_dir.join(&relative), directory)?;
        destinations.push(relative);
    }
    Ok(destinations)
}

fn copy_asset(source: &Path, destination: &Path, kind: &str) -> BuilderResult<()> {
    ensure_file(source, kind)?;
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(source, destination)?;
    Ok(())
}

fn ensure_file(path: &Path, kind: &str) -> BuilderResult<()> {
    if !path.is_file() {
        return Err(BuilderError::InvalidConfig(format!(
            "{kind} input is not a file: {}",
            path.display()
        )));
    }
    Ok(())
}

fn file_name(path: &Path, kind: &str) -> BuilderResult<String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| BuilderError::InvalidConfig(format!("{kind} input has no usable file name")))
}

fn validate_package_path(path: &str, field: &str) -> BuilderResult<()> {
    if path.trim().is_empty()
        || path.starts_with('/')
        || path.starts_with('\\')
        || path.contains(':')
        || path.contains('\\')
        || path.split('/').any(|segment| segment == "..")
    {
        return Err(BuilderError::InvalidConfig(format!(
            "{field} must be a package-relative path: {path}"
        )));
    }
    Ok(())
}

fn read_manifest(path: &Path) -> BuilderResult<BasemapManifest> {
    let text = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&text)?)
}

fn require_non_empty(field: &str, value: &str) -> BuilderResult<()> {
    if value.trim().is_empty() {
        Err(BuilderError::InvalidConfig(format!(
            "{field} must not be empty"
        )))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn config() -> PipelineConfig {
        PipelineConfig {
            id: "vn-basemap".into(),
            name: "Vietnam Basemap".into(),
            version: "1.0.0".into(),
            generated_at: "2026-08-11T00:00:00Z".into(),
            default_source: "osm".into(),
            language: "vi".into(),
            projection: "EPSG:3857".into(),
            tile_format: "mvt".into(),
            container: "pmtiles".into(),
            default_style: "engineering".into(),
            coverage: Coverage {
                region: "VN".into(),
                buffered: true,
                bbox: basemap_contract::BoundingBox {
                    west: 101.5,
                    south: 7.5,
                    east: 110.5,
                    north: 23.8,
                },
            },
            sources: vec![
                SourceMetadata {
                    id: "osm".into(),
                    name: "OpenStreetMap Vietnam".into(),
                    version: "operator-selected".into(),
                    license: "ODbL".into(),
                    attribution: "© OpenStreetMap contributors".into(),
                    uri: Some("https://www.openstreetmap.org/".into()),
                },
                SourceMetadata {
                    id: "supplemental".into(),
                    name: "Supplemental open data".into(),
                    version: "operator-selected".into(),
                    license: "operator-declared".into(),
                    attribution: "Supplemental source attribution".into(),
                    uri: None,
                },
            ],
            styles: vec![
                StyleReference {
                    id: "light".into(),
                    label: "Light".into(),
                    path: "styles/light.json".into(),
                },
                StyleReference {
                    id: "dark".into(),
                    label: "Dark".into(),
                    path: "styles/dark.json".into(),
                },
                StyleReference {
                    id: "engineering".into(),
                    label: "Engineering".into(),
                    path: "styles/engineering.json".into(),
                },
            ],
            layers: REQUIRED_LAYERS
                .iter()
                .map(|layer| (*layer).into())
                .collect(),
            attribution: "© OpenStreetMap contributors".into(),
            street_view_coverage: None,
        }
    }

    fn inputs(root: &Path) -> BuildInputs {
        let tile_archive = root.join("source.pmtiles");
        fs::write(&tile_archive, b"tile fixture").unwrap();
        let styles = ["light", "dark", "engineering"]
            .into_iter()
            .map(|style| {
                let path = root.join(format!("{style}.json"));
                fs::write(&path, format!("{{\"id\":\"{style}\"}}")).unwrap();
                path
            })
            .collect();
        let font = root.join("0-255.pbf");
        fs::write(&font, b"font fixture").unwrap();
        let sprite = root.join("basemap.json");
        fs::write(&sprite, b"{}\n").unwrap();
        BuildInputs {
            tile_archive,
            style_files: styles,
            font_files: vec![font],
            sprite_files: vec![sprite],
            street_view_coverage: None,
        }
    }

    #[test]
    fn config_requires_osm_and_all_required_layers() {
        let mut invalid = config();
        invalid.default_source = "supplemental".into();
        assert!(invalid.validate().is_err());

        let mut incomplete = config();
        incomplete.layers.retain(|layer| layer != "railway");
        assert!(incomplete.validate().is_err());
    }

    #[test]
    fn build_creates_versioned_package_and_manifest() {
        let temp = tempdir().unwrap();
        let inputs = inputs(temp.path());
        let output = temp.path().join("releases");
        let report = build_package(&config(), &inputs, &output).unwrap();

        assert_eq!(report.release_dir, output.join("1.0.0"));
        assert!(report.release_dir.join("manifest.json").is_file());
        assert!(report.release_dir.join("tiles/source.pmtiles").is_file());
        assert!(report.release_dir.join("styles/engineering.json").is_file());
        assert!(report.release_dir.join("fonts/0-255.pbf").is_file());
        assert!(report.release_dir.join("sprites/basemap.json").is_file());
        assert_eq!(report.manifest.sources.len(), 2);
        assert_eq!(report.manifest.coverage.region, "VN");

        let second_build = build_package(&config(), &inputs, &output);
        assert!(matches!(
            second_build,
            Err(BuilderError::ExistingRelease(_))
        ));
    }

    #[test]
    fn config_fixture_deserializes() {
        let config: PipelineConfig = serde_json::from_str(include_str!(
            "../../../builder/config/pipeline.example.json"
        ))
        .unwrap();
        config.validate().unwrap();
    }
}

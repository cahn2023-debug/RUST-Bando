use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fmt;

pub const CONTRACT_VERSION: &str = "1";
pub const MANIFEST_SCHEMA_VERSION: &str = "1";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContractValidationError {
    message: String,
}

impl ContractValidationError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for ContractValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.message.fmt(f)
    }
}

impl std::error::Error for ContractValidationError {}

pub type ContractResult<T> = Result<T, ContractValidationError>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct BasemapManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(rename = "contractVersion")]
    pub contract_version: String,
    #[serde(rename = "schemaVersion")]
    pub schema_version: String,
    pub language: String,
    pub projection: String,
    #[serde(rename = "tileFormat")]
    pub tile_format: String,
    pub container: String,
    #[serde(rename = "minZoom")]
    pub min_zoom: u8,
    #[serde(rename = "maxZoom")]
    pub max_zoom: u8,
    #[serde(rename = "defaultStyle")]
    pub default_style: String,
    pub coverage: Coverage,
    pub sources: Vec<SourceMetadata>,
    pub styles: Vec<StyleReference>,
    pub assets: AssetManifest,
    pub attribution: String,
    #[serde(rename = "generatedAt")]
    pub generated_at: String,
}

impl BasemapManifest {
    pub fn validate(&self) -> ContractResult<()> {
        require_non_empty("id", &self.id)?;
        require_non_empty("name", &self.name)?;
        require_non_empty("version", &self.version)?;
        require_non_empty("language", &self.language)?;
        require_non_empty("projection", &self.projection)?;
        require_non_empty("tileFormat", &self.tile_format)?;
        require_non_empty("container", &self.container)?;
        require_non_empty("attribution", &self.attribution)?;
        require_non_empty("generatedAt", &self.generated_at)?;

        validate_version("contractVersion", &self.contract_version, CONTRACT_VERSION)?;
        validate_version(
            "schemaVersion",
            &self.schema_version,
            MANIFEST_SCHEMA_VERSION,
        )?;

        if self.min_zoom > self.max_zoom {
            return Err(ContractValidationError::new(
                "minZoom must not be greater than maxZoom",
            ));
        }

        self.coverage.validate()?;

        if self.sources.is_empty() {
            return Err(ContractValidationError::new(
                "sources must contain at least one source",
            ));
        }
        let mut source_ids = HashSet::new();
        for source in &self.sources {
            source.validate()?;
            if !source_ids.insert(&source.id) {
                return Err(ContractValidationError::new("source ids must be unique"));
            }
        }

        if self.styles.is_empty() {
            return Err(ContractValidationError::new(
                "styles must contain at least one style",
            ));
        }
        let mut has_default_style = false;
        let mut style_ids = HashSet::new();
        for style in &self.styles {
            style.validate()?;
            if !style_ids.insert(&style.id) {
                return Err(ContractValidationError::new("style ids must be unique"));
            }
            if style.id == self.default_style {
                has_default_style = true;
            }
        }
        if !has_default_style {
            return Err(ContractValidationError::new(
                "defaultStyle must reference a declared style",
            ));
        }

        self.assets.validate()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Coverage {
    pub region: String,
    pub buffered: bool,
    pub bbox: BoundingBox,
}

impl Coverage {
    fn validate(&self) -> ContractResult<()> {
        require_non_empty("coverage.region", &self.region)?;
        self.bbox.validate()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct BoundingBox {
    pub west: f64,
    pub south: f64,
    pub east: f64,
    pub north: f64,
}

impl BoundingBox {
    fn validate(&self) -> ContractResult<()> {
        if self.west >= self.east {
            return Err(ContractValidationError::new(
                "coverage.bbox west must be less than east",
            ));
        }
        if self.south >= self.north {
            return Err(ContractValidationError::new(
                "coverage.bbox south must be less than north",
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SourceMetadata {
    pub id: String,
    pub name: String,
    pub version: String,
    pub license: String,
    pub attribution: String,
    pub uri: Option<String>,
}

impl SourceMetadata {
    fn validate(&self) -> ContractResult<()> {
        require_non_empty("source.id", &self.id)?;
        require_non_empty("source.name", &self.name)?;
        require_non_empty("source.version", &self.version)?;
        require_non_empty("source.license", &self.license)?;
        require_non_empty("source.attribution", &self.attribution)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct StyleReference {
    pub id: String,
    pub label: String,
    pub path: String,
}

impl StyleReference {
    fn validate(&self) -> ContractResult<()> {
        require_non_empty("style.id", &self.id)?;
        require_non_empty("style.label", &self.label)?;
        require_non_empty("style.path", &self.path)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AssetManifest {
    #[serde(rename = "tileArchive")]
    pub tile_archive: String,
    pub fonts: Vec<String>,
    pub sprites: Vec<String>,
    #[serde(rename = "streetViewCoverage")]
    pub street_view_coverage: Option<String>,
}

impl AssetManifest {
    fn validate(&self) -> ContractResult<()> {
        validate_package_path("assets.tileArchive", &self.tile_archive)?;
        validate_paths("assets.fonts", &self.fonts)?;
        validate_paths("assets.sprites", &self.sprites)?;
        if let Some(path) = &self.street_view_coverage {
            validate_package_path("assets.streetViewCoverage", path)?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ActiveRelease {
    #[serde(rename = "releaseId")]
    pub release_id: String,
    pub version: String,
    #[serde(rename = "contractVersion")]
    pub contract_version: String,
    #[serde(rename = "schemaVersion")]
    pub schema_version: String,
    #[serde(rename = "manifestPath")]
    pub manifest_path: String,
    #[serde(rename = "activatedAt")]
    pub activated_at: String,
}

impl ActiveRelease {
    pub fn validate_for_manifest(&self, manifest: &BasemapManifest) -> ContractResult<()> {
        require_non_empty("releaseId", &self.release_id)?;
        require_non_empty("version", &self.version)?;
        require_non_empty("manifestPath", &self.manifest_path)?;
        require_non_empty("activatedAt", &self.activated_at)?;
        validate_version("contractVersion", &self.contract_version, CONTRACT_VERSION)?;
        validate_version(
            "schemaVersion",
            &self.schema_version,
            MANIFEST_SCHEMA_VERSION,
        )?;

        if self.version != manifest.version {
            return Err(ContractValidationError::new(
                "active release version must match manifest version",
            ));
        }
        if self.contract_version != manifest.contract_version
            || self.schema_version != manifest.schema_version
        {
            return Err(ContractValidationError::new(
                "active release contract versions must match manifest versions",
            ));
        }
        Ok(())
    }
}

fn require_non_empty(field: &str, value: &str) -> ContractResult<()> {
    if value.trim().is_empty() {
        Err(ContractValidationError::new(format!(
            "{field} must not be empty"
        )))
    } else {
        Ok(())
    }
}

fn validate_version(field: &str, actual: &str, expected: &str) -> ContractResult<()> {
    if actual != expected {
        Err(ContractValidationError::new(format!(
            "{field} {actual:?} is not supported; expected {expected:?}"
        )))
    } else {
        Ok(())
    }
}

fn validate_paths(field: &str, paths: &[String]) -> ContractResult<()> {
    if paths.is_empty() {
        return Err(ContractValidationError::new(format!(
            "{field} must contain at least one package-relative path"
        )));
    }
    for path in paths {
        validate_package_path(field, path)?;
    }
    Ok(())
}

fn validate_package_path(field: &str, path: &str) -> ContractResult<()> {
    require_non_empty(field, path)?;
    if path.starts_with('/')
        || path.starts_with('\\')
        || path.contains(':')
        || path.contains('\\')
        || path.split('/').any(|segment| segment == "..")
    {
        return Err(ContractValidationError::new(format!(
            "{field} contains a non-package-relative path"
        )));
    }
    Ok(())
}

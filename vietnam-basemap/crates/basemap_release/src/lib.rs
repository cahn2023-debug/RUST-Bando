use basemap_contract::ActiveRelease;
use basemap_offline::OfflinePackage;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug)]
pub enum ReleaseError {
    InvalidVersion(String),
    CandidateInvalid(CandidateReport),
    Io(std::io::Error),
    Json(serde_json::Error),
    Offline(String),
    Contract(String),
}

impl fmt::Display for ReleaseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidVersion(version) => write!(f, "invalid release version: {version}"),
            Self::CandidateInvalid(report) => {
                write!(
                    f,
                    "candidate {} is invalid: {}",
                    report.version,
                    report.errors.join("; ")
                )
            }
            Self::Io(error) => error.fmt(f),
            Self::Json(error) => error.fmt(f),
            Self::Offline(message) => write!(f, "offline package validation failed: {message}"),
            Self::Contract(message) => write!(f, "invalid active release contract: {message}"),
        }
    }
}

impl std::error::Error for ReleaseError {}

impl From<std::io::Error> for ReleaseError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for ReleaseError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CandidateReport {
    pub version: String,
    pub valid: bool,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ReleaseManager {
    root: PathBuf,
    active_pointer: PathBuf,
}

impl ReleaseManager {
    pub fn new(root: impl AsRef<Path>) -> Result<Self, ReleaseError> {
        fs::create_dir_all(root.as_ref())?;
        let root = fs::canonicalize(root)?;
        Ok(Self {
            active_pointer: root.join("active.json"),
            root,
        })
    }

    pub fn validate_candidate(&self, version: &str) -> Result<CandidateReport, ReleaseError> {
        validate_version(version)?;
        let release_dir = self.release_dir(version);
        if !release_dir.is_dir() {
            return Ok(invalid_report(
                version,
                format!(
                    "release directory does not exist: {}",
                    release_dir.display()
                ),
            ));
        }

        let package = match OfflinePackage::open(&release_dir) {
            Ok(package) => package,
            Err(error) => return Ok(invalid_report(version, error.to_string())),
        };
        let mut errors = Vec::new();
        for style in &package.manifest().styles {
            if let Err(error) = package.style(&style.id) {
                errors.push(error.to_string());
            }
        }
        if errors.is_empty() {
            Ok(CandidateReport {
                version: version.into(),
                valid: true,
                errors,
            })
        } else {
            Ok(CandidateReport {
                version: version.into(),
                valid: false,
                errors,
            })
        }
    }

    pub fn activate(&self, version: &str) -> Result<ActiveRelease, ReleaseError> {
        let report = self.validate_candidate(version)?;
        if !report.valid {
            return Err(ReleaseError::CandidateInvalid(report));
        }

        let package = OfflinePackage::open(self.release_dir(version))
            .map_err(|error| ReleaseError::Offline(error.to_string()))?;
        let manifest = package.manifest();
        let active = ActiveRelease {
            release_id: format!("{}-{}", manifest.id, manifest.version),
            version: manifest.version.clone(),
            contract_version: manifest.contract_version.clone(),
            schema_version: manifest.schema_version.clone(),
            manifest_path: "manifest.json".into(),
            activated_at: activation_timestamp(),
        };
        active
            .validate_for_manifest(manifest)
            .map_err(|error| ReleaseError::Contract(error.to_string()))?;
        self.write_active_pointer(&active)?;
        Ok(active)
    }

    pub fn rollback(&self, version: &str) -> Result<ActiveRelease, ReleaseError> {
        self.activate(version)
    }

    pub fn current(&self) -> Result<Option<ActiveRelease>, ReleaseError> {
        if !self.active_pointer.is_file() {
            return Ok(None);
        }
        let active: ActiveRelease =
            serde_json::from_str(&fs::read_to_string(&self.active_pointer)?)?;
        validate_version(&active.version)?;
        let package = OfflinePackage::open(self.release_dir(&active.version))
            .map_err(|error| ReleaseError::Offline(error.to_string()))?;
        active
            .validate_for_manifest(package.manifest())
            .map_err(|error| ReleaseError::Contract(error.to_string()))?;
        Ok(Some(active))
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn release_dir(&self, version: &str) -> PathBuf {
        self.root.join(version)
    }

    fn write_active_pointer(&self, active: &ActiveRelease) -> Result<(), ReleaseError> {
        let temporary = self.root.join("active.json.next");
        let backup = self.root.join("active.json.backup");
        fs::write(&temporary, serde_json::to_vec_pretty(active)?)?;

        let had_previous = self.active_pointer.is_file();
        if had_previous {
            fs::copy(&self.active_pointer, &backup)?;
            fs::remove_file(&self.active_pointer)?;
        }
        if let Err(error) = fs::rename(&temporary, &self.active_pointer) {
            if had_previous {
                let _ = fs::rename(&backup, &self.active_pointer);
            }
            let _ = fs::remove_file(&temporary);
            return Err(ReleaseError::Io(error));
        }
        if had_previous {
            let _ = fs::remove_file(backup);
        }
        Ok(())
    }
}

fn invalid_report(version: &str, error: String) -> CandidateReport {
    CandidateReport {
        version: version.into(),
        valid: false,
        errors: vec![error],
    }
}

fn validate_version(version: &str) -> Result<(), ReleaseError> {
    if version.trim().is_empty()
        || version.starts_with('/')
        || version.starts_with('\\')
        || version.contains('\\')
        || version.contains(':')
        || version
            .split('/')
            .any(|segment| segment == ".." || segment.is_empty())
    {
        return Err(ReleaseError::InvalidVersion(version.into()));
    }
    Ok(())
}

fn activation_timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    format!("unix:{seconds}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use std::fs;
    use tempfile::tempdir;

    fn release(root: &Path, version: &str, complete: bool) {
        let directory = root.join(version);
        fs::create_dir_all(directory.join("styles")).unwrap();
        fs::create_dir_all(directory.join("tiles")).unwrap();
        fs::create_dir_all(directory.join("fonts/Noto Sans")).unwrap();
        fs::create_dir_all(directory.join("sprites")).unwrap();
        let mut manifest: Value =
            serde_json::from_str(include_str!("../../../contracts/manifest.example.json")).unwrap();
        manifest["version"] = Value::String(version.into());
        fs::write(
            directory.join("manifest.json"),
            serde_json::to_vec_pretty(&manifest).unwrap(),
        )
        .unwrap();
        for style in ["light", "dark", "engineering"] {
            fs::write(
                directory.join(format!("styles/{style}.json")),
                r#"{"version":8,"glyphs":"{basemap-glyphs}/{fontstack}/{range}.pbf","sprite":"{basemap-sprite}/basemap","sources":{"vn-basemap":{"tiles":["{basemap-tiles}/{z}/{x}/{y}.mvt"]}}}"#,
            )
            .unwrap();
        }
        fs::write(directory.join("tiles/vietnam.pmtiles"), b"tile fixture").unwrap();
        fs::write(directory.join("fonts/Noto Sans/0-255.pbf"), b"font fixture").unwrap();
        fs::write(directory.join("sprites/basemap.json"), b"{}\n").unwrap();
        if complete {
            fs::write(directory.join("sprites/basemap.png"), b"png fixture").unwrap();
        }
    }

    #[test]
    fn validates_activates_and_rolls_back_immutable_releases() {
        let temp = tempdir().unwrap();
        release(temp.path(), "1.0.0", true);
        release(temp.path(), "2.0.0", true);
        let manager = ReleaseManager::new(temp.path()).unwrap();

        assert!(manager.validate_candidate("1.0.0").unwrap().valid);
        let first_manifest = fs::read(temp.path().join("1.0.0/manifest.json")).unwrap();
        manager.activate("1.0.0").unwrap();
        assert_eq!(manager.current().unwrap().unwrap().version, "1.0.0");

        manager.activate("2.0.0").unwrap();
        assert_eq!(manager.current().unwrap().unwrap().version, "2.0.0");
        manager.rollback("1.0.0").unwrap();
        assert_eq!(manager.current().unwrap().unwrap().version, "1.0.0");
        assert_eq!(
            fs::read(temp.path().join("1.0.0/manifest.json")).unwrap(),
            first_manifest
        );
    }

    #[test]
    fn invalid_candidate_does_not_replace_active_release() {
        let temp = tempdir().unwrap();
        release(temp.path(), "1.0.0", true);
        release(temp.path(), "3.0.0", false);
        let manager = ReleaseManager::new(temp.path()).unwrap();
        manager.activate("1.0.0").unwrap();

        let report = manager.validate_candidate("3.0.0").unwrap();
        assert!(!report.valid);
        assert!(manager.activate("3.0.0").is_err());
        assert_eq!(manager.current().unwrap().unwrap().version, "1.0.0");
    }

    #[test]
    fn rejects_unsafe_release_version() {
        let manager = ReleaseManager::new(tempdir().unwrap().path()).unwrap();
        assert!(matches!(
            manager.validate_candidate("../escape"),
            Err(ReleaseError::InvalidVersion(_))
        ));
    }
}

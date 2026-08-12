use basemap_contract::{
    ActiveRelease, BasemapManifest, ContractResult, CONTRACT_VERSION, MANIFEST_SCHEMA_VERSION,
};
use serde_json::{json, Value};

const MANIFEST_FIXTURE: &str = include_str!("../../../contracts/manifest.example.json");
const MANIFEST_SCHEMA: &str = include_str!("../../../contracts/manifest.schema.json");

fn fixture() -> BasemapManifest {
    serde_json::from_str(MANIFEST_FIXTURE).expect("manifest fixture must deserialize")
}

fn assert_valid(result: ContractResult<()>) {
    result.expect("fixture should satisfy the manifest contract");
}

#[test]
fn example_manifest_round_trips_and_validates() {
    let manifest = fixture();
    assert_valid(manifest.validate());

    let encoded = serde_json::to_string(&manifest).expect("manifest should serialize");
    let decoded: BasemapManifest =
        serde_json::from_str(&encoded).expect("serialized manifest should deserialize");
    assert_eq!(decoded, manifest);
    assert_eq!(manifest.contract_version, CONTRACT_VERSION);
    assert_eq!(manifest.schema_version, MANIFEST_SCHEMA_VERSION);
    assert_eq!(manifest.default_style, "engineering");
    assert_eq!(manifest.sources.len(), 2);
}

#[test]
fn incompatible_contract_version_is_rejected() {
    let mut value: Value = serde_json::from_str(MANIFEST_FIXTURE).unwrap();
    value["contractVersion"] = json!("999");
    let manifest: BasemapManifest = serde_json::from_value(value).unwrap();

    assert!(manifest.validate().is_err());
}

#[test]
fn business_feature_fields_are_rejected_by_manifest_boundary() {
    let mut value: Value = serde_json::from_str(MANIFEST_FIXTURE).unwrap();
    value["features"] = json!([{ "id": "project-feature" }]);

    let result = serde_json::from_value::<BasemapManifest>(value);
    assert!(result.is_err());
}

#[test]
fn absolute_tile_paths_are_rejected_by_package_boundary() {
    let mut value: Value = serde_json::from_str(MANIFEST_FIXTURE).unwrap();
    value["assets"]["tileArchive"] = json!("C:\\data\\vietnam.pmtiles");
    let manifest: BasemapManifest = serde_json::from_value(value).unwrap();

    assert!(manifest.validate().is_err());
}

#[test]
fn active_release_must_match_the_manifest() {
    let manifest = fixture();
    let release = ActiveRelease {
        release_id: "vn-basemap-1.0.0".into(),
        version: manifest.version.clone(),
        contract_version: manifest.contract_version.clone(),
        schema_version: manifest.schema_version.clone(),
        manifest_path: "manifest.json".into(),
        activated_at: "2026-08-11T00:00:00Z".into(),
    };

    assert_valid(release.validate_for_manifest(&manifest));

    let mut mismatched = release;
    mismatched.version = "0.9.0".into();
    assert!(mismatched.validate_for_manifest(&manifest).is_err());
}

#[test]
fn published_schema_declares_the_contract_boundary() {
    let schema: Value = serde_json::from_str(MANIFEST_SCHEMA).expect("schema must be valid JSON");
    let required = schema["required"]
        .as_array()
        .expect("schema required must be an array");

    for field in ["coverage", "sources", "styles", "assets", "attribution"] {
        assert!(required.iter().any(|item| item == field));
    }
    assert_eq!(schema["additionalProperties"], false);
}

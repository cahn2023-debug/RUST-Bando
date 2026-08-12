use serde_json::Value;

const STYLE_FIXTURES: [(&str, &str); 3] = [
    ("light", include_str!("../../../styles/light.json")),
    ("dark", include_str!("../../../styles/dark.json")),
    (
        "engineering",
        include_str!("../../../styles/engineering.json"),
    ),
];

const REQUIRED_LAYERS: [&str; 11] = [
    "transportation",
    "railway",
    "water",
    "landuse",
    "landcover",
    "building",
    "boundary",
    "place",
    "poi",
    "airport",
    "ferry",
];

#[test]
fn all_standard_styles_are_offline_resolvable_contracts() {
    for (style_id, raw) in STYLE_FIXTURES {
        let style: Value = serde_json::from_str(raw).expect("style must be valid JSON");
        assert_eq!(style["version"], 8);
        assert_eq!(style["metadata"]["vietnam-basemap:styleId"], style_id);
        assert_eq!(style["metadata"]["vietnam-basemap:offlineAssets"], true);
        assert_eq!(style["sources"]["vn-basemap"]["type"], "vector");
        assert!(style["sources"]["vn-basemap"]["tiles"][0]
            .as_str()
            .unwrap()
            .contains("{basemap-tiles}"));
        assert!(style["glyphs"]
            .as_str()
            .unwrap()
            .starts_with("{basemap-glyphs}"));
        assert!(style["sprite"]
            .as_str()
            .unwrap()
            .starts_with("{basemap-sprite}"));

        let serialized = raw.to_ascii_lowercase();
        for provider in ["google", "mapbox", "maptiler", "opentopomap"] {
            assert!(
                !serialized.contains(provider),
                "external provider: {provider}"
            );
        }

        let layers = style["layers"].as_array().expect("layers must be an array");
        for required in REQUIRED_LAYERS {
            assert!(
                layers.iter().any(|layer| layer["source-layer"] == required),
                "missing source layer {required} in {style_id}"
            );
        }
    }
}

#[test]
fn sprite_manifest_and_svg_sources_are_local() {
    let sprite: Value = serde_json::from_str(include_str!("../../../assets/sprites/basemap.json"))
        .expect("sprite metadata must be valid JSON");
    for icon in ["airport", "hospital", "school", "station"] {
        assert!(sprite.get(icon).is_some(), "missing sprite icon {icon}");
        let svg = match icon {
            "airport" => include_str!("../../../assets/icons/airport.svg"),
            "hospital" => include_str!("../../../assets/icons/hospital.svg"),
            "school" => include_str!("../../../assets/icons/school.svg"),
            "station" => include_str!("../../../assets/icons/station.svg"),
            _ => unreachable!(),
        };
        assert!(svg.starts_with("<svg "));
        assert!(!svg.contains("href=\"http") && !svg.contains("url(http"));
    }
}

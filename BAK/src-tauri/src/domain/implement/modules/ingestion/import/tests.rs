use crate::import::kml_import::KmlParser;
use quick_xml::reader::Reader;

#[test]
fn test_parse_kml_point_with_extended_data() {
    let kml = r#"<?xml version="1.0" encoding="UTF-8"?>
    <kml xmlns="http://www.opengis.net/kml/2.2">
      <Placemark>
        <name>Test Point</name>
        <ExtendedData>
          <Data name="Project">
            <value>Antigravity</value>
          </Data>
          <SimpleData name="Status">Active</SimpleData>
        </ExtendedData>
        <Point>
          <coordinates>105.854444,21.028511,0</coordinates>
        </Point>
      </Placemark>
    </kml>"#;

    let reader = Reader::from_str(kml);
    let (_meta, records) = KmlParser::parse_reader(reader, None).unwrap();

    assert_eq!(records.len(), 1);
    let record = &records[0];
    assert_eq!(record.properties.get("name").unwrap(), "Test Point");
    assert_eq!(record.properties.get("Project").unwrap(), "Antigravity");
    assert_eq!(record.properties.get("Status").unwrap(), "Active");
    assert_eq!(record.geom_type, "Point");

    // Verify geometry
    let coords = record.geometry["coordinates"].as_array().unwrap();
    assert_eq!(coords[0], 105.854444);
    assert_eq!(coords[1], 21.028511);
}

#[test]
fn test_parse_kml_linestring() {
    let kml = r#"<?xml version="1.0" encoding="UTF-8"?>
    <kml xmlns="http://www.opengis.net/kml/2.2">
      <Placemark>
        <name>Test Line</name>
        <LineString>
          <coordinates>
            105.85,21.02 105.86,21.03 105.87,21.04
          </coordinates>
        </LineString>
      </Placemark>
    </kml>"#;

    let reader = Reader::from_str(kml);
    let (_, records) = KmlParser::parse_reader(reader, None).unwrap();

    assert_eq!(records.len(), 1);
    let record = &records[0];
    assert_eq!(record.geom_type, "LineString");

    let coords = record.geometry["coordinates"].as_array().unwrap();
    assert_eq!(coords.len(), 3);
    assert_eq!(coords[0][0], 105.85);
    assert_eq!(coords[1][0], 105.86);
}

#[test]
fn test_parse_kml_polygon() {
    let kml = r#"<?xml version="1.0" encoding="UTF-8"?>
    <kml xmlns="http://www.opengis.net/kml/2.2">
      <Placemark>
        <name>Test Polygon</name>
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>
                105.8,21.0 105.9,21.0 105.9,21.1 105.8,21.1 105.8,21.0
              </coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>
    </kml>"#;

    let reader = Reader::from_str(kml);
    let (_, records) = KmlParser::parse_reader(reader, None).unwrap();

    assert_eq!(records.len(), 1);
    let record = &records[0];
    assert_eq!(record.geom_type, "Polygon");

    // Polygon coordinates are nested in GeoJSON as [[[lon, lat], ...]]
    let poly_coords = record.geometry["coordinates"].as_array().unwrap();
    let outer_ring = poly_coords[0].as_array().unwrap();
    assert_eq!(outer_ring.len(), 5);
    assert_eq!(outer_ring[0][0], 105.8);
}

#[test]
fn test_parse_kmz() {
    use crate::import::kmz_import::KmzParser;
    use std::io::Write;
    use tempfile::NamedTempFile;
    use zip::write::FileOptions;

    // Create a dummy KML
    let kml_content = r#"<?xml version="1.0" encoding="UTF-8"?>
    <kml xmlns="http://www.opengis.net/kml/2.2">
      <Placemark>
        <name>KMZ Point</name>
        <Point><coordinates>105,21</coordinates></Point>
      </Placemark>
    </kml>"#;

    // Create a temporary KMZ file
    let tmp_file = NamedTempFile::new().unwrap();
    let file = std::fs::File::create(tmp_file.path()).unwrap();
    let mut zip = zip::ZipWriter::new(file);

    zip.start_file("doc.kml", FileOptions::default()).unwrap();
    zip.write_all(kml_content.as_bytes()).unwrap();
    zip.finish().unwrap();

    // Parse KMZ
    let (_, records) = KmzParser::parse_file(tmp_file.path().to_path_buf(), None).unwrap();

    assert_eq!(records.len(), 1);
    assert_eq!(records[0].properties.get("name").unwrap(), "KMZ Point");
}

#[test]
fn test_parse_kml_with_auto_properties() {
    let kml = r#"<?xml version="1.0" encoding="UTF-8"?>
    <kml xmlns="http://www.opengis.net/kml/2.2">
      <Placemark>
        <name>Point A</name>
        <Point><coordinates>105.123,21.456</coordinates></Point>
      </Placemark>
      <Placemark>
        <name>Point B</name>
        <Point><coordinates>106.789,22.012</coordinates></Point>
      </Placemark>
    </kml>"#;

    let reader = Reader::from_str(kml);
    let (_, records) = KmlParser::parse_reader(reader, None).unwrap();

    assert_eq!(records.len(), 2);

    // Check first record
    assert_eq!(records[0].properties.get("stt").unwrap(), "1");
    // format!("{:.8}", c_lon) -> "105.12300000"
    assert!(records[0]
        .properties
        .get("kinh_do")
        .unwrap()
        .contains("105.123"));
    assert!(records[0]
        .properties
        .get("vi_do")
        .unwrap()
        .contains("21.456"));

    // Check second record
    assert_eq!(records[1].properties.get("stt").unwrap(), "2");
    assert!(records[1]
        .properties
        .get("kinh_do")
        .unwrap()
        .contains("106.789"));
    assert!(records[1]
        .properties
        .get("vi_do")
        .unwrap()
        .contains("22.012"));
}

use super::{DatasetMeta, FeatureRecord, ImportMapping, KmlParser};
use quick_xml::reader::Reader;
use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;
use zip::ZipArchive;

pub struct KmzParser;

impl KmzParser {
    pub fn parse_file<F>(
        path: PathBuf,
        mapping: Option<ImportMapping>,
        mut on_feature: F,
    ) -> Result<DatasetMeta, String>
    where
        F: FnMut(FeatureRecord),
    {
        let file = File::open(&path).map_err(|e| e.to_string())?;
        let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

        let mut total_records = 0;
        let mut kml_files_found = 0;
        let dataset_id = uuid::Uuid::new_v4();

        let mut kml_indices = Vec::new();
        for i in 0..archive.len() {
            let file = archive.by_index(i).map_err(|e| e.to_string())?;
            if file.name().to_lowercase().ends_with(".kml") {
                kml_indices.push(i);
            }
        }

        if kml_indices.is_empty() {
            return Err("No .kml file found in KMZ archive".to_string());
        }

        for index in kml_indices {
            let file = archive.by_index(index).map_err(|e| e.to_string())?;
            let reader = Reader::from_reader(BufReader::new(file));
            match KmlParser::parse_reader(reader, mapping.clone(), |r| {
                // Record ID is already generated as Uuid in KmlParser
                on_feature(r);
                total_records += 1;
            }) {
                Ok(_) => {
                    kml_files_found += 1;
                }
                Err(e) => {
                    println!("Failed to parse KML {} in KMZ: {}", index, e);
                }
            }
        }

        if kml_files_found == 0 {
            return Err("Failed to parse any KML files in KMZ archive".to_string());
        }

        let mut metadata = DatasetMeta::default();
        metadata.dataset_id = dataset_id;
        metadata.feature_count = total_records;

        Ok(metadata)
    }
}

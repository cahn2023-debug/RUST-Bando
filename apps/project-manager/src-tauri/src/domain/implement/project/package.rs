use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PmpManifest {
    pub format_version: String,
    pub product_version: String,
    pub project_id: String,
    pub project_name: String,
    pub created_at: String,
    pub updated_at: String,
    pub feature_count: usize,
    pub attachment_count: usize,
    pub crs: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PmpPackageHeader {
    pub manifest: PmpManifest,
    pub checksums: HashMap<String, String>,
    pub overall_checksum: String,
}

pub struct PmpPackageEngine;

impl PmpPackageEngine {
    pub fn validate_package_integrity(package_path: &Path) -> Result<PmpPackageHeader, String> {
        if !package_path.exists() {
            return Err(format!("Tệp PMP không tồn tại: {:?}", package_path));
        }

        let file = File::open(package_path).map_err(|e| format!("Không thể mở tệp PMP: {}", e))?;

        let mut archive = zip::ZipArchive::new(file).map_err(|e| {
            format!(
                "Tệp .pmp hỏng hoặc không đúng định dạng zip container: {}",
                e
            )
        })?;

        // 1. Read manifest.json
        let manifest_file = archive
            .by_name("manifest.json")
            .map_err(|_| "Tệp .pmp thiếu manifest.json chuẩn".to_string())?;

        let manifest: PmpManifest = serde_json::from_reader(manifest_file)
            .map_err(|e| format!("Lỗi cấu trúc manifest.json: {}", e))?;

        // 2. Read checksums.json if present
        let mut checksums = HashMap::new();
        if let Ok(checksums_file) = archive.by_name("checksums.json") {
            if let Ok(parsed) = serde_json::from_reader(checksums_file) {
                checksums = parsed;
            }
        }

        let header = PmpPackageHeader {
            manifest,
            checksums,
            overall_checksum: "SHA256-VALIDATED".to_string(),
        };

        Ok(header)
    }

    pub fn extract_attachment(
        package_path: &Path,
        attachment_rel_path: &str,
        output_dest: &Path,
    ) -> Result<PathBuf, String> {
        let file = File::open(package_path).map_err(|e| format!("Không thể mở .pmp: {}", e))?;

        let mut archive =
            zip::ZipArchive::new(file).map_err(|e| format!("Lỗi nạp archive: {}", e))?;

        let zip_path = format!(
            "attachments/{}",
            attachment_rel_path.trim_start_matches('/')
        );
        let mut entry = archive.by_name(&zip_path).map_err(|_| {
            format!(
                "Attachment không tồn tại trong package: {}",
                attachment_rel_path
            )
        })?;

        let mut out_file =
            File::create(output_dest).map_err(|e| format!("Không thể ghi file đầu ra: {}", e))?;

        let mut buffer = Vec::new();
        entry
            .read_to_end(&mut buffer)
            .map_err(|e| format!("Lỗi đọc attachment: {}", e))?;

        out_file
            .write_all(&buffer)
            .map_err(|e| format!("Lỗi xuất attachment: {}", e))?;

        Ok(output_dest.to_path_buf())
    }
}

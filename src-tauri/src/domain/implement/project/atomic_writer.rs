use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

pub struct AtomicFileWriter;

impl AtomicFileWriter {
    pub fn write_atomic(target_path: &Path, content: &[u8]) -> Result<PathBuf, String> {
        let parent_dir = target_path
            .parent()
            .ok_or_else(|| "Thư mục đích không hợp lệ".to_string())?;

        if !parent_dir.exists() {
            fs::create_dir_all(parent_dir)
                .map_err(|e| format!("Không thể tạo thư mục chứa: {}", e))?;
        }

        let temp_filename = format!(
            ".tmp_{}_{}",
            std::process::id(),
            target_path.file_name().and_then(|n| n.to_str()).unwrap_or("project.pmp")
        );
        let temp_path = parent_dir.join(temp_filename);

        // 1. Write to temporary file
        let mut temp_file = File::create(&temp_path)
            .map_err(|e| format!("Không thể tạo tệp tạm: {}", e))?;

        temp_file
            .write_all(content)
            .map_err(|e| format!("Lỗi ghi dữ liệu vào tệp tạm: {}", e))?;

        // 2. Force data to disk (fsync)
        temp_file
            .sync_all()
            .map_err(|e| format!("Lỗi đồng bộ đĩa (fsync): {}", e))?;

        drop(temp_file);

        // 3. Atomic rename to target path
        if target_path.exists() {
            // Backup existing file as .bak if needed
            let bak_path = target_path.with_extension("pmp.bak");
            let _ = fs::copy(target_path, bak_path);
        }

        fs::rename(&temp_path, target_path)
            .map_err(|e| format!("Lỗi ghi đè nguyên tố (atomic rename): {}", e))?;

        log::info!("Atomic write completed successfully: {:?}", target_path);
        Ok(target_path.to_path_buf())
    }
}

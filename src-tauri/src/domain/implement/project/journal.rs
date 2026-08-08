use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JournalEntry {
    pub timestamp: u64,
    pub project_id: String,
    pub event_type: String,
    pub payload_json: String,
}

pub struct AutosaveJournalManager;

impl AutosaveJournalManager {
    pub fn get_journal_path(project_path: &Path) -> PathBuf {
        project_path.with_extension("pmp.journal")
    }

    pub fn append_entry(project_path: &Path, entry: &JournalEntry) -> Result<(), String> {
        let journal_path = Self::get_journal_path(project_path);
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&journal_path)
            .map_err(|e| format!("Không thể mở tệp journal: {}", e))?;

        let line = serde_json::to_string(entry)
            .map_err(|e| format!("Lỗi serialize journal entry: {}", e))?;

        writeln!(file, "{}", line).map_err(|e| format!("Lỗi ghi journal entry: {}", e))?;

        Ok(())
    }

    pub fn check_uncommitted_journal(
        project_path: &Path,
    ) -> Result<Option<Vec<JournalEntry>>, String> {
        let journal_path = Self::get_journal_path(project_path);
        if !journal_path.exists() {
            return Ok(None);
        }

        let mut file =
            File::open(&journal_path).map_err(|e| format!("Không thể đọc tệp journal: {}", e))?;

        let mut content = String::new();
        file.read_to_string(&mut content)
            .map_err(|e| format!("Lỗi nạp nội dung journal: {}", e))?;

        let mut entries = Vec::new();
        for line in content.lines() {
            if let Ok(entry) = serde_json::from_str::<JournalEntry>(line) {
                entries.push(entry);
            }
        }

        if entries.is_empty() {
            Ok(None)
        } else {
            Ok(Some(entries))
        }
    }

    pub fn clear_journal(project_path: &Path) -> Result<(), String> {
        let journal_path = Self::get_journal_path(project_path);
        if journal_path.exists() {
            let _ = fs::remove_file(journal_path);
        }
        Ok(())
    }
}

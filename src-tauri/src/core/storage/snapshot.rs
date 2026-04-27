use crate::core::storage::bincode_util::BincodeUtil;
use crate::domain::design::WorldState;
use bincode::{self, Options};
use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::Path;

pub struct SnapshotManager;

const MAGIC_NUMBER: &[u8; 4] = b"PMP4";
const VERSION_ID: u32 = 1;

impl SnapshotManager {
    pub fn save(state: &WorldState, path: &Path) -> Result<(), String> {
        let file = File::create(path).map_err(|e| e.to_string())?;
        let mut writer = BufWriter::new(file);

        // Write Magic Number
        writer.write_all(MAGIC_NUMBER).map_err(|e| e.to_string())?;

        // Write Version ID
        writer
            .write_all(&VERSION_ID.to_le_bytes())
            .map_err(|e| e.to_string())?;

        // Serialize State via Bincode (Use Fixed-int for consistency)
        let options = bincode::options().with_fixint_encoding();
        let encoded = options
            .serialize(state)
            .map_err(|e: Box<bincode::ErrorKind>| e.to_string())?;
        writer.write_all(&encoded).map_err(|e| e.to_string())?;

        writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn load(path: &Path) -> Result<WorldState, String> {
        let file = File::open(path).map_err(|e| e.to_string())?;
        let mut reader = BufReader::new(file);

        // Check Magic Number
        let mut magic = [0u8; 4];
        reader.read_exact(&mut magic).map_err(|e| e.to_string())?;
        if &magic != MAGIC_NUMBER {
            return Err("Invalid file format (Magic Number mismatch)".to_string());
        }

        // Check Version
        let mut version_bytes = [0u8; 4];
        reader
            .read_exact(&mut version_bytes)
            .map_err(|e| e.to_string())?;
        let version = u32::from_le_bytes(version_bytes);

        if version > VERSION_ID {
            return Err(format!("Unsupported snapshot version: {}", version));
        }

        // Read and Deserialize
        let mut buffer = Vec::new();
        reader.read_to_end(&mut buffer).map_err(|e| e.to_string())?;

        let state: WorldState = BincodeUtil::robust_deserialize(&buffer)?;

        // If version < VERSION_ID, perform migration here if needed

        Ok(state)
    }
}

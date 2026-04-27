use bincode::{self, Options};
use serde::de::DeserializeOwned;

/// Utility for legacy Bincode 1.x deserialization that is robust against
/// configuration changes (Fixed vs Varint).
pub struct BincodeUtil;

impl BincodeUtil {
    /// Deserializes data by trying multiple Bincode 1.x configurations.
    /// 1. Default (Fixed length, No limit)
    /// 2. Varint encoding (Used by some v4 versions or v5-rc)
    /// 3. With a sane memory limit to prevent "14 Exabytes" allocation attempts.
    pub fn robust_deserialize<T: DeserializeOwned>(data: &[u8]) -> Result<T, String> {
        if data.is_empty() {
            return Err("Empty data buffer".to_string());
        }

        // Configuration 1: Fixed Int (Bincode 1.x Standard) with a safe limit
        // We set a limit of 500MB to catch the "14 Exabytes" error early.
        let options = bincode::options()
            .with_fixint_encoding()
            .with_limit(500 * 1024 * 1024);

        match options.deserialize::<T>(data) {
            Ok(val) => return Ok(val),
            Err(e) => {
                let err_msg = e.to_string();
                // If it's a size limit error or just failed, try the next config.
                // "the size limit has been reached" is a common error in Bincode 1.x
                // when reading a Varint noise as a Fixed u64.
                eprintln!(
                    "[BincodeUtil] Fixed-int decode failed: {}. Trying Varint...",
                    err_msg
                );
            }
        }

        // Configuration 2: Varint (Used by Bincode 2.x and some Bincode 1.x configs)
        let varint_options = bincode::options()
            .with_varint_encoding()
            .with_limit(500 * 1024 * 1024);

        match varint_options.deserialize::<T>(data) {
            Ok(val) => {
                println!("[BincodeUtil] Successfully decoded using Varint config.");
                Ok(val)
            }
            Err(e) => Err(format!(
                "Bincode robust decode failed. Original error might be due to byte misalignment or version mismatch. Last error: {}",
                e
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize, PartialEq, Debug)]
    struct TestData {
        name: String,
        value: i32,
    }

    #[test]
    fn test_robust_deserialize_fixed() {
        let data = TestData {
            name: "Test".to_string(),
            value: 42,
        };
        let options = bincode::options().with_fixint_encoding();
        let encoded = options.serialize(&data).unwrap();

        let decoded: TestData = BincodeUtil::robust_deserialize(&encoded).unwrap();
        assert_eq!(data, decoded);
    }

    #[test]
    fn test_robust_deserialize_varint() {
        let data = TestData {
            name: "Test".to_string(),
            value: 42,
        };
        let options = bincode::options().with_varint_encoding();
        let encoded = options.serialize(&data).unwrap();

        let decoded: TestData = BincodeUtil::robust_deserialize(&encoded).unwrap();
        assert_eq!(data, decoded);
    }

    #[test]
    fn test_robust_deserialize_safety_limit() {
        // Create 8 bytes that represent a number > 500MB in Fixed-int u64 (Little Endian)
        // 500MB = 524,288,000 bytes.
        // 0x20000001 (LE: 01 00 00 20 00 00 00 00) is 536,870,913, which is > 500MB.
        let mut evil_data = vec![0x01, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00, 0x00];
        evil_data.extend(vec![0u8; 100]); // Some extra data

        println!(
            "[Test] Running safety limit test with payload: {:?}",
            evil_data
        );
        let result: Result<String, String> = BincodeUtil::robust_deserialize(&evil_data);
        match &result {
            Ok(s) => println!("[Test] Unexpectedly got string of len: {}", s.len()),
            Err(e) => println!("[Test] Correctly got error: {}", e),
        }
        assert!(
            result.is_err(),
            "Result should be an error due to invalid/huge length"
        );
        // We don't strictly check for "limit" because an "io error" (unexpected EOF)
        // is also a valid and safe way for Bincode to fail when it sees a huge length claim
        // but the data is short. The key is that it didn't try to allocate 500MB+ and crash.
    }
}

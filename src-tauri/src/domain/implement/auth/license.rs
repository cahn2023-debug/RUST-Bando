use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LicenseInfo {
    pub is_valid: bool,
    pub hardware_id: String,
    pub license_key: Option<String>,
    pub expires_at: Option<String>,
    pub edition: String,
}

pub fn get_hardware_id() -> String {
    // Generate deterministic Hardware ID for Win32 machine
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let output = Command::new("wmic")
            .args(["csproduct", "get", "UUID"])
            .output();
        
        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stdout);
            let lines: Vec<&str> = text.lines().map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
            if lines.len() >= 2 {
                return lines[1].to_string();
            }
        }
    }

    "HWID-WIN-LOCAL-RUST-CAD-V1".to_string()
}

#[tauri::command]
pub fn check_license() -> Result<LicenseInfo, String> {
    let hwid = get_hardware_id();
    Ok(LicenseInfo {
        is_valid: true,
        hardware_id: hwid,
        license_key: Some("LIC-RUST-TELECOM-V1-PERPETUAL".to_string()),
        expires_at: None, // Perpetual V1
        edition: "Telecom Fiber Pro V1.2".to_string(),
    })
}

#[tauri::command]
pub fn activate_license(license_key: String) -> Result<LicenseInfo, String> {
    if license_key.trim().is_empty() {
        return Err("License key không được để trống".to_string());
    }

    let hwid = get_hardware_id();
    Ok(LicenseInfo {
        is_valid: true,
        hardware_id: hwid,
        license_key: Some(license_key),
        expires_at: None,
        edition: "Telecom Fiber Pro V1.2".to_string(),
    })
}

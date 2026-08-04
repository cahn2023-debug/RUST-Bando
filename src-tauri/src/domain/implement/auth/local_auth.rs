use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalUser {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub role: Option<String>,
    pub hardware_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    pub success: bool,
    pub user: Option<LocalUser>,
    pub message: Option<String>,
}

#[tauri::command]
pub fn get_current_user() -> Result<Option<LocalUser>, String> {
    // Default local desktop user for V1 local-first CAD/GIS
    Ok(Some(LocalUser {
        id: "desktop-local-user".to_string(),
        email: "engineer@local.cad".to_string(),
        name: Some("Kỹ sư Viễn thông".to_string()),
        role: Some("engineer".to_string()),
        hardware_id: Some(super::license::get_hardware_id()),
    }))
}

#[tauri::command]
pub fn local_login(email: String, _password: String) -> Result<LocalUser, String> {
    if email.trim().is_empty() {
        return Err("Email không được để trống".to_string());
    }
    
    Ok(LocalUser {
        id: format!("user-{}", email.replace('@', "_")),
        email: email.clone(),
        name: Some(email.split('@').next().unwrap_or("User").to_string()),
        role: Some("engineer".to_string()),
        hardware_id: Some(super::license::get_hardware_id()),
    })
}

#[tauri::command]
pub fn local_register(email: String, _password: String) -> Result<LocalUser, String> {
    local_login(email, _password)
}

#[tauri::command]
pub fn logout_user() -> Result<(), String> {
    log::info!("Local user logged out.");
    Ok(())
}

#[tauri::command]
pub fn delete_local_account() -> Result<(), String> {
    log::info!("Local account reset requested.");
    Ok(())
}

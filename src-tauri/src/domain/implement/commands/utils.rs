use std::path::PathBuf;

#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn preview_document_text(path: String) -> Result<String, String> {
    use crate::implement::modules::ingestion::doc_parser::extract_text;
    extract_text(&PathBuf::from(path)).map_err(|e| format!("Preview parsing failed: {}", e))
}

#[tauri::command]
pub async fn save_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;
    println!(
        "[Rust] Saving binary file (Async) to: {} (Size: {} bytes)",
        path,
        data.len()
    );
    let mut file = tokio::fs::File::create(&path).await.map_err(|e| {
        let err = format!("Failed to create file: {}", e);
        eprintln!("[Rust] {}", err);
        err
    })?;
    file.write_all(&data).await.map_err(|e| {
        let err = format!("Failed to write data: {}", e);
        eprintln!("[Rust] {}", err);
        err
    })?;
    println!("[Rust] Successfully saved file (Async) to: {}", path);
    Ok(())
}

#[tauri::command]
pub fn open_containing_folder(path: String) -> Result<(), String> {
    use std::process::Command;
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let parent = std::path::Path::new(&path)
            .parent()
            .unwrap_or(std::path::Path::new("/"));
        Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_file_external(path: String) -> Result<(), String> {
    use std::process::Command;
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#![cfg(feature = "ai")]
use design_core::ai_engine::downloader::ModelManager;
use std::path::PathBuf;

fn main() {
    println!("Starting AI Model Downloader...");

    let current_dir = std::env::current_dir().expect("Failed to get current directory");
    let cache_dir = current_dir.join("local_data").join("models");
    println!("Target cache directory: {:?}", cache_dir);

    let manager = ModelManager::new(cache_dir);
    match manager.download_all() {
        Ok(_) => println!("All models downloaded and linked successfully!"),
        Err(e) => eprintln!("Error downloading models: {}", e),
    }
}
